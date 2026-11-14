//! Reads a page someone linked in their VRChat bio, once, for the age hints
//! (Settings → Age hints → "Also read the pages they link to"; off by default).
//!
//! Bio links are written by other people, so this is careful about where it
//! goes: only http(s), only public internet addresses (no localhost, LAN,
//! link-local, …, checked again on every redirect and pinned so DNS can't
//! switch it afterwards), at most 3 redirects, 8 seconds and 400 KB, and only
//! text. Nothing is sent but a plain GET without cookies.

use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
use std::time::Duration;

const MAX_BYTES: usize = 400 * 1024;

fn public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let o = v4.octets();
            !(v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_documentation()
                || v4.is_unspecified()
                || v4.is_multicast()
                || o[0] == 0
                || (o[0] == 100 && (64..128).contains(&o[1])) // carrier-grade NAT
                || (o[0] == 198 && (o[1] == 18 || o[1] == 19)) // benchmarking
                || o[0] >= 240)
        }
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                return public_ip(IpAddr::V4(v4));
            }
            let s = v6.segments();
            !(v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                || (s[0] & 0xfe00) == 0xfc00 // unique local
                || (s[0] & 0xffc0) == 0xfe80 // link-local
                || s[0] == 0x2001 && s[1] == 0x0db8) // documentation
        }
    }
}

/// The host's first public address, or an error if it has none (or any private one).
fn resolve_public(url: &url::Url) -> Result<SocketAddr, String> {
    let host = url.host_str().ok_or("no host")?;
    let port = url.port_or_known_default().ok_or("no port")?;
    let addrs: Vec<SocketAddr> = (host, port).to_socket_addrs().map_err(|e| e.to_string())?.collect();
    if addrs.is_empty() {
        return Err("host not found".into());
    }
    if addrs.iter().any(|a| !public_ip(a.ip())) {
        return Err("not a public internet address".into());
    }
    Ok(addrs[0])
}

#[tauri::command]
pub async fn fetch_link_text(url: String) -> Result<String, String> {
    let mut current = url::Url::parse(&url).map_err(|e| e.to_string())?;
    for _ in 0..4 {
        if !matches!(current.scheme(), "http" | "https") {
            return Err("only http and https links".into());
        }
        let u = current.clone();
        let addr = tauri::async_runtime::spawn_blocking(move || resolve_public(&u)).await.map_err(|e| e.to_string())??;
        let host = current.host_str().unwrap_or_default().to_string();
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(8))
            .connect_timeout(Duration::from_secs(5))
            .resolve(&host, addr)
            .user_agent(concat!("Mozilla/5.0 (compatible; vrc-friend-map/", env!("CARGO_PKG_VERSION"), ")"))
            .build()
            .map_err(|e| e.to_string())?;
        let mut resp = client.get(current.clone()).send().await.map_err(|e| e.to_string())?;
        if resp.status().is_redirection() {
            let loc = resp.headers().get(reqwest::header::LOCATION).and_then(|v| v.to_str().ok()).ok_or("redirect without a target")?;
            current = current.join(loc).map_err(|e| e.to_string())?;
            continue;
        }
        if !resp.status().is_success() {
            return Err(format!("HTTP {}", resp.status().as_u16()));
        }
        let ctype = resp.headers().get(reqwest::header::CONTENT_TYPE).and_then(|v| v.to_str().ok()).unwrap_or("").to_ascii_lowercase();
        if !(ctype.is_empty() || ctype.starts_with("text/") || ctype.contains("html") || ctype.contains("json")) {
            return Err("not a text page".into());
        }
        let mut body: Vec<u8> = Vec::new();
        while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
            body.extend_from_slice(&chunk);
            if body.len() >= MAX_BYTES {
                body.truncate(MAX_BYTES);
                break;
            }
        }
        return Ok(String::from_utf8_lossy(&body).into_owned());
    }
    Err("too many redirects".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn private_addresses_are_refused() {
        for a in ["127.0.0.1", "10.1.2.3", "192.168.0.1", "172.16.5.4", "169.254.1.1", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fd00::1", "::ffff:192.168.1.1"] {
            assert!(!public_ip(a.parse().unwrap()), "{a} should be refused");
        }
        for a in ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"] {
            assert!(public_ip(a.parse().unwrap()), "{a} should be allowed");
        }
    }
}
