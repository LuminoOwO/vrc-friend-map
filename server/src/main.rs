//! vfm-server: a small always-on helper for VRC Friend Map.
//!
//! Run it with no arguments. The first start writes `vfm-server.toml` (next
//! to where you run it) and prints the admin token. See server/README.md.

mod admin;
mod api;
mod config;
mod logger;
mod store;

use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use config::Config;

const HELP: &str = "vfm-server – logger and exchange server for VRC Friend Map

Usage: vfm-server [--config FILE] [COMMAND]

Commands:
  run                 Start the server (the default)
  invite [--uses N] [--days N] [--note TEXT]
                      Make an invite code (default: 1 use, 7 days)
  pair-code           Make a one-time code to pair the app's logger (15 min)
  status              Show accounts, shared items and the logger
  remove-user USR_ID  Delete an account and what it shared (e.g. a lost key)
  token [--new]       Show (or replace) the admin page token
  help, version

Options:
  --config FILE       Settings file (default: ./vfm-server.toml, or $VFM_CONFIG)

The admin page is at http://<this machine>:8787/admin";

fn main() {
    let mut args: Vec<String> = std::env::args().skip(1).collect();
    let config_path = take_opt(&mut args, "--config")
        .or_else(|| std::env::var("VFM_CONFIG").ok())
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("vfm-server.toml"));
    let config_path = std::path::absolute(&config_path).unwrap_or(config_path);
    let cmd = if args.is_empty() { "run".to_string() } else { args.remove(0) };
    let result = match cmd.as_str() {
        "run" | "serve" => run(&config_path),
        "invite" => cmd_invite(&config_path, &mut args),
        "pair-code" => with_config(&config_path).map(|(c, _)| {
            let code = logger::Logger::pair_code_file(&c.data_dir(&config_path).join("logger"));
            println!("Pairing code: {code}\nEnter it in the app within 15 minutes (Settings → Servers → this server → Pair logger).");
        }),
        "status" => cmd_status(&config_path),
        "remove-user" => cmd_remove_user(&config_path, args.first().cloned()),
        "token" => cmd_token(&config_path, args.iter().any(|a| a == "--new")),
        "help" | "--help" | "-h" => {
            println!("{HELP}");
            Ok(())
        }
        "version" | "--version" | "-V" => {
            println!("vfm-server {}", api::VERSION);
            Ok(())
        }
        other => Err(format!("unknown command \"{other}\"\n\n{HELP}")),
    };
    if let Err(e) = result {
        eprintln!("error: {e}");
        std::process::exit(1);
    }
}

fn take_opt(args: &mut Vec<String>, name: &str) -> Option<String> {
    let i = args.iter().position(|a| a == name || a.starts_with(&format!("{name}=")))?;
    let a = args.remove(i);
    if let Some((_, v)) = a.split_once('=') {
        return Some(v.to_string());
    }
    (i < args.len()).then(|| args.remove(i))
}

/// Load the config, creating it (with a fresh admin token) on first use.
fn with_config(path: &Path) -> Result<(Config, bool), String> {
    if path.exists() {
        let c = Config::load(path)?;
        // Fill in a token if someone removed it.
        if !std::fs::read_to_string(path).unwrap_or_default().contains(&c.admin.token) {
            c.save(path)?;
        }
        Ok((c, false))
    } else {
        let mut c = Config::default();
        c.admin.token = config::random_token(16);
        c.save(path)?;
        Ok((c, true))
    }
}

fn lan_address() -> Option<std::net::IpAddr> {
    // No packets are sent; this only asks the OS which interface it would use.
    let s = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    s.connect("192.0.2.1:80").ok()?;
    s.local_addr().ok().map(|a| a.ip())
}

fn run(config_path: &Path) -> Result<(), String> {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let (cfg, created) = with_config(config_path)?;
    let data = cfg.data_dir(config_path);
    let store = store::Store::open(&data)?;
    let lg = logger::Logger::new(data.join("logger"), &cfg.logger.contact, cfg.logger.resync_minutes, cfg.logger.keep_hops_months);
    let listen: SocketAddr = cfg.server.listen.parse().map_err(|e| format!("listen = \"{}\": {e}", cfg.server.listen))?;

    println!("vfm-server {} – {}", api::VERSION, cfg.server.name);
    if created {
        println!("Created {} (edit it or use the admin page).", config_path.display());
    }
    println!("Data:       {}", data.display());
    let port = listen.port();
    let host = if listen.ip().is_unspecified() { lan_address().map(|i| i.to_string()).unwrap_or_else(|| "localhost".into()) } else { listen.ip().to_string() };
    println!("App:        add http://{host}:{port} in Settings → Servers");
    if cfg.admin.allow != config::AdminAllow::Off {
        println!("Admin page: http://{host}:{port}/admin   token: {}", cfg.admin.token);
    }
    println!("Encryption: {}   new accounts: {:?}", cfg.access.encryption.as_str(), cfg.access.registration);
    if cfg.logger.enabled {
        match lg.owner() {
            Some(o) => println!("Logger:     paired with {o}"),
            None => println!("Logger:     not paired. Pairing code {} (valid 15 min; `vfm-server pair-code` makes a new one)", lg.new_pair_code()),
        }
    }

    let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().map_err(|e| e.to_string())?;
    rt.block_on(async move {
        let app = api::App::new(cfg.clone(), config_path.to_path_buf(), store, Arc::clone(&lg));
        lg.spawn_ticker();
        if cfg.logger.enabled && lg.has_session() {
            lg.start();
        }
        let flush_app = Arc::clone(&app);
        tokio::spawn(async move {
            let mut iv = tokio::time::interval(std::time::Duration::from_secs(300));
            loop {
                iv.tick().await;
                flush_app.store.lock().unwrap().flush();
            }
        });
        let listener = tokio::net::TcpListener::bind(listen).await.map_err(|e| format!("can't listen on {listen}: {e}"))?;
        let shutdown_app = Arc::clone(&app);
        axum::serve(listener, api::router(app).into_make_service_with_connect_info::<SocketAddr>())
            .with_graceful_shutdown(async move {
                shutdown_signal().await;
                println!("Stopping…");
                shutdown_app.logger.save_now();
                shutdown_app.store.lock().unwrap().flush();
            })
            .await
            .map_err(|e| e.to_string())
    })
}

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()).expect("signal handler");
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            _ = term.recv() => {}
        }
    }
    #[cfg(not(unix))]
    let _ = tokio::signal::ctrl_c().await;
}

fn cmd_invite(config_path: &Path, args: &mut Vec<String>) -> Result<(), String> {
    let (cfg, _) = with_config(config_path)?;
    let uses = take_opt(args, "--uses").map(|v| v.parse::<u32>().map_err(|e| format!("--uses: {e}"))).transpose()?.unwrap_or(1);
    let days = take_opt(args, "--days").map(|v| v.parse::<u32>().map_err(|e| format!("--days: {e}"))).transpose()?.unwrap_or(7);
    let note = take_opt(args, "--note").unwrap_or_default();
    let code = store::new_invite(&cfg.data_dir(config_path), uses, days, &note)?;
    println!("Invite code: {code}");
    println!("{} use{}, {}", uses.max(1), if uses > 1 { "s" } else { "" }, if days == 0 { "never expires".to_string() } else { format!("expires in {days} days") });
    if cfg.access.registration != vfm_share::Registration::Invite {
        println!("Note: new accounts are set to {:?}, so codes aren't needed right now.", cfg.access.registration);
    }
    Ok(())
}

fn cmd_status(config_path: &Path) -> Result<(), String> {
    let (cfg, _) = with_config(config_path)?;
    let data = cfg.data_dir(config_path);
    let s = store::Store::open(&data)?;
    let (users, items, sealed) = s.stats();
    println!("{} – {} accounts, {} shared items ({} encrypted)", cfg.server.name, users, items, sealed);
    println!("Encryption: {}   new accounts: {:?}", cfg.access.encryption.as_str(), cfg.access.registration);
    for u in s.users.users.values() {
        let mine: Vec<String> = s
            .items
            .values()
            .filter(|m| m.owner == u.identity.user_id)
            .map(|m| format!("{} ({}, {} people)", m.kind, if m.sealed { "encrypted" } else { "readable" }, m.recipients.len()))
            .collect();
        println!("  {}  [{}]  {}", u.identity.user_id, u.identity.fingerprint(), if mine.is_empty() { "-".into() } else { mine.join(", ") });
    }
    let owner: serde_json::Value = store::read_json(&data.join("logger").join("owner.json"));
    match owner.get("owner").and_then(|v| v.as_str()) {
        Some(o) => println!("Logger: paired with {} ({o})", owner.get("display_name").and_then(|v| v.as_str()).unwrap_or("?")),
        None => println!("Logger: {}", if cfg.logger.enabled { "not paired" } else { "off" }),
    }
    Ok(())
}

fn cmd_remove_user(config_path: &Path, id: Option<String>) -> Result<(), String> {
    let id = id.ok_or("which user? vfm-server remove-user usr_…")?;
    let (cfg, _) = with_config(config_path)?;
    let mut s = store::Store::open(&cfg.data_dir(config_path))?;
    if s.delete_user(&id) {
        println!("Removed {id}. If the server is running, restart it so it forgets them too.");
        Ok(())
    } else {
        Err(format!("{id} isn't registered here"))
    }
}

fn cmd_token(config_path: &Path, new: bool) -> Result<(), String> {
    let (mut cfg, _) = with_config(config_path)?;
    if new {
        cfg.admin.token = config::random_token(16);
        cfg.save(config_path)?;
        println!("New admin token (restart the server to use it): {}", cfg.admin.token);
    } else {
        println!("{}", cfg.admin.token);
    }
    Ok(())
}
