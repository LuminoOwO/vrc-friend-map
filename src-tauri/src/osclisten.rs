//! Listening to VRChat over OSC (opt-in, Settings → Notifications → Chatbox
//! (OSC)): which avatar you're wearing, its parameters (toggles), and the
//! built-in ones like AFK and MuteSelf. VRChat sends them to port 9001 on this
//! PC; a Quest sends them to the PC it talks to. Only packets from this PC or
//! the Quest's address are taken.
//!
//! Also: the avatar's OSC config, which VRChat writes next to its logs
//! (`OSC/usr_…/Avatars/avtr_….json`), and sending a parameter back.

use serde::Serialize;
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

#[derive(Clone, Debug, PartialEq)]
pub enum Arg {
    Bool(bool),
    Int(i32),
    Float(f32),
    Str(String),
}

impl Arg {
    fn to_json(&self) -> Value {
        match self {
            Arg::Bool(b) => json!(b),
            Arg::Int(i) => json!(i),
            // Two decimals are plenty for the app and keep jitter from counting as a change.
            Arg::Float(f) => json!((*f as f64 * 100.0).round() / 100.0),
            Arg::Str(s) => json!(s),
        }
    }
}

fn read_str(b: &[u8], at: &mut usize) -> Option<String> {
    let start = *at;
    let end = start + b.get(start..)?.iter().position(|&c| c == 0)?;
    let s = std::str::from_utf8(&b[start..end]).ok()?.to_string();
    *at = (end + 4) & !3;
    Some(s)
}

fn read_4(b: &[u8], at: &mut usize) -> Option<[u8; 4]> {
    let v: [u8; 4] = b.get(*at..*at + 4)?.try_into().ok()?;
    *at += 4;
    Some(v)
}

/// The messages in one packet (a message or a bundle of them): address and first argument.
pub fn parse_packet(b: &[u8], out: &mut Vec<(String, Arg)>, depth: u8) {
    if depth > 4 || b.len() < 4 {
        return;
    }
    if b.starts_with(b"#bundle\0") {
        let mut at = 16; // "#bundle\0" + time tag
        while let Some(len) = read_4(b, &mut at).map(|l| u32::from_be_bytes(l) as usize) {
            let Some(inner) = b.get(at..at + len) else { return };
            parse_packet(inner, out, depth + 1);
            at += len;
        }
        return;
    }
    let mut at = 0;
    let Some(addr) = read_str(b, &mut at) else { return };
    if !addr.starts_with('/') {
        return;
    }
    let Some(tags) = read_str(b, &mut at) else { return };
    let arg = match tags.as_bytes().get(1) {
        Some(b'T') => Arg::Bool(true),
        Some(b'F') => Arg::Bool(false),
        Some(b'i') => match read_4(b, &mut at) {
            Some(v) => Arg::Int(i32::from_be_bytes(v)),
            None => return,
        },
        Some(b'f') => match read_4(b, &mut at) {
            Some(v) => Arg::Float(f32::from_be_bytes(v)),
            None => return,
        },
        Some(b's') => match read_str(b, &mut at) {
            Some(s) => Arg::Str(s),
            None => return,
        },
        _ => return,
    };
    out.push((addr, arg));
}

/// `/avatar/parameters/<name>` with one value.
pub fn param_packet(name: &str, value: &Arg) -> Vec<u8> {
    let mut out = Vec::with_capacity(64);
    let pad = |out: &mut Vec<u8>, s: &str| {
        out.extend_from_slice(s.as_bytes());
        out.push(0);
        while out.len() % 4 != 0 {
            out.push(0);
        }
    };
    pad(&mut out, &format!("/avatar/parameters/{name}"));
    match value {
        Arg::Bool(true) => pad(&mut out, ",T"),
        Arg::Bool(false) => pad(&mut out, ",F"),
        Arg::Int(i) => {
            pad(&mut out, ",i");
            out.extend_from_slice(&i.to_be_bytes());
        }
        Arg::Float(f) => {
            pad(&mut out, ",f");
            out.extend_from_slice(&f.to_be_bytes());
        }
        Arg::Str(s) => {
            pad(&mut out, ",s");
            pad(&mut out, s);
        }
    }
    out
}

fn local_or_lan(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4.is_loopback() || v4.is_private() || v4.is_link_local(),
        IpAddr::V6(v6) => v6.is_loopback(),
    }
}

// ---------------------------------------------------------------- listener

#[derive(Serialize, Clone)]
struct Live {
    /// Set when you changed avatar (then `params` starts over).
    avatar: Option<String>,
    /// Parameters that changed since the last event.
    params: Map<String, Value>,
}

static RUNNING: Mutex<Option<Arc<AtomicBool>>> = Mutex::new(None);

fn stop_running() {
    if let Some(flag) = RUNNING.lock().unwrap().take() {
        flag.store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
pub fn osc_listen_start(app: AppHandle, port: Option<u16>, from: Option<String>) -> Result<(), String> {
    stop_running();
    let from: Option<IpAddr> = match from.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(s) => Some(s.parse().map_err(|_| "not an IP address".to_string())?),
        None => None,
    };
    let quest = from.filter(|ip| !ip.is_loopback());
    if let Some(ip) = quest {
        if !local_or_lan(&ip) {
            return Err("only this computer or your own network".into());
        }
    }
    // A Quest sends over the network; VRChat on this PC only to 127.0.0.1.
    let bind = if quest.is_some() { "0.0.0.0" } else { "127.0.0.1" };
    let port = port.unwrap_or(9001);
    let sock = UdpSocket::bind((bind, port)).map_err(|e| {
        if e.kind() == std::io::ErrorKind::AddrInUse {
            format!("port {port} is already used by another OSC app; pick another one (and the same in VRChat)")
        } else {
            e.to_string()
        }
    })?;
    sock.set_read_timeout(Some(Duration::from_millis(200))).map_err(|e| e.to_string())?;
    let stop = Arc::new(AtomicBool::new(false));
    *RUNNING.lock().unwrap() = Some(stop.clone());
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        let mut last: HashMap<String, Value> = HashMap::new();
        let mut pending = Live { avatar: None, params: Map::new() };
        let mut sent_at = Instant::now();
        let mut msgs = Vec::new();
        while !stop.load(Ordering::Relaxed) {
            if let Ok((n, peer)) = sock.recv_from(&mut buf) {
                let ok = peer.ip().is_loopback() || quest == Some(peer.ip());
                if ok {
                    msgs.clear();
                    parse_packet(&buf[..n], &mut msgs, 0);
                    for (addr, arg) in msgs.drain(..) {
                        if addr == "/avatar/change" {
                            if let Arg::Str(id) = arg {
                                last.clear();
                                pending = Live { avatar: Some(id), params: Map::new() };
                            }
                        } else if let Some(name) = addr.strip_prefix("/avatar/parameters/") {
                            let v = arg.to_json();
                            if last.get(name) != Some(&v) && last.len() < 2000 {
                                last.insert(name.to_string(), v.clone());
                                pending.params.insert(name.to_string(), v);
                            }
                        }
                    }
                }
            }
            // At most four updates a second to the app.
            let dirty = pending.avatar.is_some() || !pending.params.is_empty();
            if dirty && sent_at.elapsed() >= Duration::from_millis(250) {
                let _ = app.emit("osc-live", std::mem::replace(&mut pending, Live { avatar: None, params: Map::new() }));
                sent_at = Instant::now();
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub fn osc_listen_stop() {
    stop_running();
}

// ---------------------------------------------------------------- avatar config

fn valid_avatar_id(id: &str) -> bool {
    id.len() <= 64
        && id
            .strip_prefix("avtr_")
            .is_some_and(|r| !r.is_empty() && r.chars().all(|c| c.is_ascii_hexdigit() || c == '-'))
}

/// Toggles an avatar has, from VRChat's OSC config: name, type, and whether
/// VRChat takes it as input.
pub fn parse_config(text: &str) -> Option<Value> {
    let v: Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()?;
    let params: Vec<Value> = v
        .get("parameters")?
        .as_array()?
        .iter()
        .filter_map(|p| {
            let name = p.get("name")?.as_str()?;
            let typ = p
                .get("input")
                .or_else(|| p.get("output"))
                .and_then(|io| io.get("type"))
                .and_then(Value::as_str)?;
            Some(json!({ "name": name, "type": typ, "input": p.get("input").is_some() }))
        })
        .collect();
    Some(json!({ "id": v.get("id"), "name": v.get("name"), "parameters": params }))
}

#[tauri::command]
pub async fn osc_avatar_config(id: String) -> Result<Option<Value>, String> {
    if !valid_avatar_id(&id) {
        return Err("not an avatar ID".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        for dir in crate::gamelogs::detect_dirs() {
            let Ok(users) = std::fs::read_dir(dir.join("OSC")) else { continue };
            for u in users.flatten() {
                let path = u.path().join("Avatars").join(format!("{id}.json"));
                if let Ok(text) = std::fs::read_to_string(&path) {
                    if let Some(v) = parse_config(&text) {
                        return Some(v);
                    }
                }
            }
        }
        None
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn osc_set_param(
    name: String,
    value: Value,
    kind: Option<String>,
    host: Option<String>,
    port: Option<u16>,
) -> Result<(), String> {
    if name.is_empty() || name.len() > 128 || name.chars().any(|c| c.is_control()) {
        return Err("not a parameter name".into());
    }
    let float = kind.as_deref() == Some("Float");
    let arg = match &value {
        Value::Bool(b) => Arg::Bool(*b),
        Value::Number(n) if n.is_i64() && !float => Arg::Int(n.as_i64().unwrap_or(0).clamp(i32::MIN as i64, i32::MAX as i64) as i32),
        Value::Number(n) => Arg::Float(n.as_f64().unwrap_or(0.0).clamp(-1.0, 1.0) as f32),
        _ => return Err("value must be true/false or a number".into()),
    };
    let ip: IpAddr = host
        .as_deref()
        .unwrap_or("127.0.0.1")
        .trim()
        .parse()
        .map_err(|_| "not an IP address".to_string())?;
    if !local_or_lan(&ip) {
        return Err("only this computer or your own network".into());
    }
    let sock = UdpSocket::bind(if ip.is_ipv6() { "[::1]:0" } else { "0.0.0.0:0" }).map_err(|e| e.to_string())?;
    sock.send_to(&param_packet(&name, &arg), SocketAddr::new(ip, port.unwrap_or(9000)))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_and_bundles() {
        for arg in [Arg::Bool(true), Arg::Bool(false), Arg::Int(-3), Arg::Float(0.5), Arg::Str("hi".into())] {
            let p = param_packet("Ears/On", &arg);
            assert_eq!(p.len() % 4, 0);
            let mut out = Vec::new();
            parse_packet(&p, &mut out, 0);
            assert_eq!(out, vec![("/avatar/parameters/Ears/On".to_string(), arg)]);
        }
        // A bundle with two messages.
        let a = param_packet("AFK", &Arg::Bool(true));
        let b = param_packet("MuteSelf", &Arg::Bool(false));
        let mut bundle = b"#bundle\0".to_vec();
        bundle.extend_from_slice(&[0; 8]);
        for m in [&a, &b] {
            bundle.extend_from_slice(&(m.len() as u32).to_be_bytes());
            bundle.extend_from_slice(m);
        }
        let mut out = Vec::new();
        parse_packet(&bundle, &mut out, 0);
        assert_eq!(out.len(), 2);
        assert_eq!(out[1], ("/avatar/parameters/MuteSelf".into(), Arg::Bool(false)));
        // Garbage and cut-off packets give nothing, without panicking.
        let mut out = Vec::new();
        parse_packet(b"nope", &mut out, 0);
        parse_packet(&a[..a.len() - 2], &mut out, 0);
        parse_packet(b"#bundle\0\0\0\0\0\0\0\0\0\0\0\0\xff", &mut out, 0);
        let f = param_packet("X", &Arg::Float(0.5));
        parse_packet(&f[..f.len() - 1], &mut out, 0);
        assert!(out.is_empty());
    }

    #[test]
    fn config_and_ids() {
        let cfg = "\u{feff}{\"id\":\"avtr_1\",\"name\":\"Fox\",\"parameters\":[\
            {\"name\":\"Ears\",\"input\":{\"address\":\"/avatar/parameters/Ears\",\"type\":\"Bool\"},\"output\":{\"address\":\"/avatar/parameters/Ears\",\"type\":\"Bool\"}},\
            {\"name\":\"VelocityX\",\"output\":{\"address\":\"/avatar/parameters/VelocityX\",\"type\":\"Float\"}}]}";
        let v = parse_config(cfg).unwrap();
        assert_eq!(v["name"], "Fox");
        assert_eq!(v["parameters"][0], json!({ "name": "Ears", "type": "Bool", "input": true }));
        assert_eq!(v["parameters"][1]["input"], false);
        assert!(valid_avatar_id("avtr_00000000-0000-0000-0000-000000000000"));
        assert!(!valid_avatar_id("avtr_../../etc"));
        assert!(!valid_avatar_id("usr_123"));
    }
}
