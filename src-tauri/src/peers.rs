//! Your own devices talking directly on your home network. A small TCP
//! listener takes one sealed message per connection (4-byte length, then the
//! message) and hands it to the app, which opens it with your key: anything not
//! sealed and signed by your own key is dropped there. Sending only goes to
//! addresses on your own network.

use std::io::{Read, Write};
use std::net::{IpAddr, SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const MAX_MESSAGE: usize = 8 * 1024 * 1024;

static PORT: Mutex<Option<u16>> = Mutex::new(None);

fn home_network(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4.is_private() || v4.is_link_local(),
        IpAddr::V6(_) => false,
    }
}

/// This device's address on your network (the one its default route uses). No
/// packet is sent: connecting a UDP socket only picks the route.
fn home_address() -> Option<IpAddr> {
    let sock = UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.connect("192.0.2.1:9").ok()?;
    let ip = sock.local_addr().ok()?.ip();
    home_network(&ip).then_some(ip)
}

fn read_message(stream: &mut TcpStream) -> Option<String> {
    stream.set_read_timeout(Some(Duration::from_secs(10))).ok()?;
    let mut len = [0u8; 4];
    stream.read_exact(&mut len).ok()?;
    let len = u32::from_be_bytes(len) as usize;
    if len == 0 || len > MAX_MESSAGE {
        return None;
    }
    let mut buf = vec![0u8; len];
    stream.read_exact(&mut buf).ok()?;
    String::from_utf8(buf).ok()
}

#[derive(serde::Serialize)]
pub struct Listening {
    pub port: u16,
    /// Where your other devices can reach this one (empty: not on a home network).
    pub addrs: Vec<String>,
}

/// Start listening (once) and say where.
#[tauri::command]
pub fn peer_listen(app: AppHandle) -> Result<Listening, String> {
    let addrs = home_address().map(|ip| vec![ip.to_string()]).unwrap_or_default();
    let mut port = PORT.lock().unwrap();
    if let Some(p) = *port {
        return Ok(Listening { port: p, addrs });
    }
    let listener = TcpListener::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    let p = listener.local_addr().map_err(|e| e.to_string())?.port();
    std::thread::spawn(move || {
        for conn in listener.incoming() {
            let Ok(mut stream) = conn else { continue };
            let from_home = stream.peer_addr().map(|a| home_network(&a.ip()) || a.ip().is_loopback()).unwrap_or(false);
            if !from_home {
                continue;
            }
            // One at a time, each with a time limit: plenty for a few devices.
            if let Some(blob) = read_message(&mut stream) {
                let _ = stream.write_all(b"ok");
                let _ = app.emit("device-message", serde_json::json!({ "blob": blob, "via": "direct" }));
            }
        }
    });
    *port = Some(p);
    Ok(Listening { port: p, addrs })
}

fn send_to(addr: SocketAddr, blob: &[u8]) -> Result<(), String> {
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_secs(2)).map_err(|e| e.to_string())?;
    stream.set_write_timeout(Some(Duration::from_secs(20))).map_err(|e| e.to_string())?;
    stream.set_read_timeout(Some(Duration::from_secs(20))).map_err(|e| e.to_string())?;
    stream.write_all(&(blob.len() as u32).to_be_bytes()).map_err(|e| e.to_string())?;
    stream.write_all(blob).map_err(|e| e.to_string())?;
    let mut ok = [0u8; 2];
    stream.read_exact(&mut ok).map_err(|e| e.to_string())?;
    if &ok != b"ok" {
        return Err("the other device didn't take it".into());
    }
    Ok(())
}

/// Send one sealed message straight to another of your devices.
#[tauri::command]
pub async fn peer_send(addr: String, port: u16, blob: String) -> Result<(), String> {
    let ip: IpAddr = addr.trim().parse().map_err(|_| "not an IP address".to_string())?;
    if !home_network(&ip) && !ip.is_loopback() {
        return Err("only to devices on your own network".into());
    }
    if blob.is_empty() || blob.len() > MAX_MESSAGE {
        return Err("message too big".into());
    }
    tauri::async_runtime::spawn_blocking(move || send_to(SocketAddr::new(ip, port), blob.as_bytes()))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_message_per_connection() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let t = std::thread::spawn(move || {
            let (mut s, _) = listener.accept().unwrap();
            let m = read_message(&mut s);
            s.write_all(b"ok").unwrap();
            m
        });
        send_to(addr, b"{\"hello\":1}").unwrap();
        assert_eq!(t.join().unwrap().as_deref(), Some("{\"hello\":1}"));
        assert!(home_network(&"192.168.1.5".parse().unwrap()));
        assert!(!home_network(&"8.8.8.8".parse().unwrap()));
    }
}
