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
  healthcheck         Exit 0 if the running server answers (for containers)
  help, version

Options:
  --config FILE       Settings file (default: ./vfm-server.toml, or $VFM_CONFIG)

Environment (override the settings file on every start, e.g. in containers):
  VFM_NAME VFM_MOTD VFM_LISTEN VFM_DATA_DIR VFM_REGISTRATION VFM_ENCRYPTION
  VFM_MAX_ITEM_KB VFM_MAX_USERS VFM_LOGGER VFM_RESYNC_MINUTES VFM_CONTACT
  VFM_KEEP_HOPS_MONTHS VFM_ADMIN_ALLOW VFM_ADMIN_TOKEN
  VFM_PUBLIC_URL      address to print for the app (e.g. http://pi.local:8787)

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
        "healthcheck" => cmd_healthcheck(&config_path),
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
    with_config_env(path).map(|(c, created, _)| (c, created))
}

/// Same, with `VFM_*` environment variables applied on top (returned: the
/// variables used). A new config file starts from those values.
fn with_config_env(path: &Path) -> Result<(Config, bool, Vec<&'static str>), String> {
    if path.exists() {
        let mut c = Config::load(path)?;
        // Fill in a token if someone removed it.
        if !std::fs::read_to_string(path).unwrap_or_default().contains(&c.admin.token) {
            c.save(path)?;
        }
        let env = c.apply_env()?;
        Ok((c, false, env))
    } else {
        let mut c = Config::default();
        c.admin.token = config::random_token(16);
        let env = c.apply_env()?;
        c.save(path)?;
        Ok((c, true, env))
    }
}

pub fn in_container() -> bool {
    std::env::var_os("VFM_CONTAINER").is_some() || Path::new("/.dockerenv").exists() || Path::new("/run/.containerenv").exists()
}

/// `vfm-server healthcheck`: exit 0 if the server answers (for containers).
fn cmd_healthcheck(config_path: &Path) -> Result<(), String> {
    use std::io::{Read, Write};
    let (cfg, _, _) = with_config_env(config_path)?;
    let mut addr: SocketAddr = cfg.server.listen.parse().map_err(|e| format!("listen: {e}"))?;
    if addr.ip().is_unspecified() {
        addr.set_ip(if addr.is_ipv6() { std::net::Ipv6Addr::LOCALHOST.into() } else { std::net::Ipv4Addr::LOCALHOST.into() });
    }
    let t = std::time::Duration::from_secs(3);
    let mut s = std::net::TcpStream::connect_timeout(&addr, t).map_err(|e| format!("not answering on {addr}: {e}"))?;
    s.set_read_timeout(Some(t)).ok();
    s.write_all(b"GET /v1/info HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n").map_err(|e| e.to_string())?;
    let mut buf = [0u8; 64];
    let n = s.read(&mut buf).map_err(|e| e.to_string())?;
    if buf[..n].starts_with(b"HTTP/1.1 200") {
        Ok(())
    } else {
        Err(format!("unexpected answer: {}", String::from_utf8_lossy(&buf[..n]).lines().next().unwrap_or("")))
    }
}

fn reg_str(r: vfm_share::Registration) -> &'static str {
    match r {
        vfm_share::Registration::Open => "open",
        vfm_share::Registration::Invite => "invite code needed",
        vfm_share::Registration::Closed => "closed",
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
    let (cfg, created, env_used) = with_config_env(config_path)?;
    let data = cfg.data_dir(config_path);
    let store = store::Store::open(&data)?;
    let lg = logger::Logger::new(data.join("logger"), &cfg.logger.contact, cfg.logger.resync_minutes, cfg.logger.keep_hops_months);
    let listen: SocketAddr = cfg.server.listen.parse().map_err(|e| format!("listen = \"{}\": {e}", cfg.server.listen))?;

    println!("vfm-server {} – {}", api::VERSION, cfg.server.name);
    if created {
        println!("Created {} (edit it or use the admin page).", config_path.display());
    }
    println!("Data:       {}", data.display());
    if !env_used.is_empty() {
        println!("From the environment: {}", env_used.join(", "));
    }
    let port = listen.port();
    let base = match std::env::var("VFM_PUBLIC_URL").ok().filter(|u| !u.trim().is_empty()) {
        Some(u) => u.trim().trim_end_matches('/').to_string(),
        // Inside a container our own address means nothing to the app.
        None if in_container() => format!("http://<this computer's address>:<published port, usually {port}>"),
        None => {
            let host = if listen.ip().is_unspecified() { lan_address().map(|i| i.to_string()).unwrap_or_else(|| "localhost".into()) } else { listen.ip().to_string() };
            format!("http://{host}:{port}")
        }
    };
    println!("App:        add {base} in Settings → Servers");
    if cfg.admin.allow != config::AdminAllow::Off {
        println!("Admin page: {base}/admin   token: {}", cfg.admin.token);
    }
    println!("Encryption: {}   new accounts: {}", cfg.access.encryption.as_str(), reg_str(cfg.access.registration));
    if cfg.logger.enabled {
        match lg.owner() {
            Some(o) => println!("Logger:     paired with {o}"),
            None => println!("Logger:     not paired. Pairing code {} (valid 15 min; `vfm-server pair-code` makes a new one)", lg.new_pair_code()),
        }
    }

    let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().map_err(|e| e.to_string())?;
    rt.block_on(async move {
        let app = api::App::new(cfg.clone(), config_path.to_path_buf(), store, Arc::clone(&lg), env_used.iter().map(|s| s.to_string()).collect());
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
        println!("Note: new accounts are set to \"{}\", so codes aren't needed right now.", reg_str(cfg.access.registration));
    }
    Ok(())
}

fn cmd_status(config_path: &Path) -> Result<(), String> {
    let (cfg, _, _) = with_config_env(config_path)?;
    let data = cfg.data_dir(config_path);
    let s = store::Store::open(&data)?;
    let (users, items, sealed) = s.stats();
    println!("{} – {} accounts, {} shared items ({} encrypted)", cfg.server.name, users, items, sealed);
    println!("Encryption: {}   new accounts: {}", cfg.access.encryption.as_str(), reg_str(cfg.access.registration));
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
