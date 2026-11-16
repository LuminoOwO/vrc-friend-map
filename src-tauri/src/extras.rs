//! Small desktop extras, all opt-in (Settings → Extras):
//! - OSC: a line in VRChat's chatbox (`/chatbox/input`), sent to VRChat on
//!   this PC or a Quest on your own network, never anywhere else;
//! - now playing: the song from your music player (MPRIS through `playerctl`
//!   on Linux);
//! - Steam play time: VRChat's minutes from Steam's own `localconfig.vdf`.

use serde::Serialize;
use std::net::{IpAddr, SocketAddr, UdpSocket};
use std::path::PathBuf;

// ---------------------------------------------------------------- OSC

/// OSC string: bytes, a 0, padded to a multiple of 4.
fn osc_string(out: &mut Vec<u8>, s: &str) {
    out.extend_from_slice(s.as_bytes());
    out.push(0);
    while out.len() % 4 != 0 {
        out.push(0);
    }
}

/// `/chatbox/input ,sTF text`: send right away, without the notification sound
/// when `quiet`.
pub fn chatbox_packet(text: &str, quiet: bool) -> Vec<u8> {
    // VRChat shows at most 144 characters.
    let text: String = text
        .chars()
        .filter(|c| !c.is_control() || *c == '\n')
        .take(144)
        .collect();
    let mut out = Vec::with_capacity(32 + text.len());
    osc_string(&mut out, "/chatbox/input");
    osc_string(&mut out, if quiet { ",sTF" } else { ",sTT" });
    osc_string(&mut out, &text);
    out
}

/// Only this machine or a device on your own network (a Quest).
fn allowed_host(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4.is_loopback() || v4.is_private() || v4.is_link_local(),
        IpAddr::V6(v6) => v6.is_loopback(),
    }
}

#[tauri::command]
pub fn osc_chatbox(
    text: String,
    host: Option<String>,
    port: Option<u16>,
    quiet: Option<bool>,
) -> Result<(), String> {
    let ip: IpAddr = host
        .as_deref()
        .unwrap_or("127.0.0.1")
        .trim()
        .parse()
        .map_err(|_| "not an IP address".to_string())?;
    if !allowed_host(&ip) {
        return Err("only this computer or your own network".into());
    }
    let addr = SocketAddr::new(ip, port.unwrap_or(9000));
    let sock = UdpSocket::bind(if ip.is_ipv6() { "[::1]:0" } else { "0.0.0.0:0" })
        .map_err(|e| e.to_string())?;
    sock.send_to(&chatbox_packet(&text, quiet.unwrap_or(true)), addr)
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------- now playing

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct NowPlaying {
    pub playing: bool,
    pub artist: String,
    pub title: String,
    pub player: String,
}

pub fn parse_playerctl(line: &str) -> Option<NowPlaying> {
    let mut parts = line.trim_end_matches(['\n', '\r']).split('\t');
    let status = parts.next()?;
    let player = parts.next().unwrap_or("").to_string();
    let artist = parts.next().unwrap_or("").trim().to_string();
    let title = parts.next().unwrap_or("").trim().to_string();
    if title.is_empty() {
        return None;
    }
    Some(NowPlaying {
        playing: status == "Playing",
        artist,
        title,
        player,
    })
}

/// The song playing right now (Linux, through `playerctl`), if any.
#[tauri::command]
pub async fn now_playing() -> Result<Option<NowPlaying>, String> {
    #[cfg(target_os = "linux")]
    {
        let out = tokio::task::spawn_blocking(|| {
            std::process::Command::new("playerctl")
                .args([
                    "metadata",
                    "--format",
                    "{{status}}\t{{playerName}}\t{{artist}}\t{{title}}",
                ])
                .output()
        })
        .await
        .map_err(|e| e.to_string())?;
        match out {
            Ok(o) if o.status.success() => Ok(parse_playerctl(&String::from_utf8_lossy(&o.stdout))),
            Ok(_) => Ok(None), // no player running
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                Err("playerctl isn't installed".into())
            }
            Err(e) => Err(e.to_string()),
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        Err("only on Linux for now".into())
    }
}

// ---------------------------------------------------------------- Steam play time

#[derive(Serialize, Clone, Debug, PartialEq, Default)]
pub struct Playtime {
    /// All time, minutes.
    pub minutes: u64,
    /// The last two weeks, minutes.
    pub two_weeks: u64,
    /// Unix seconds.
    pub last_played: u64,
}

/// VRChat (app 438100) in a localconfig.vdf: `"438100" { … "Playtime" "1234" … }`.
pub fn parse_playtime(vdf: &str) -> Option<Playtime> {
    let mut best: Option<Playtime> = None;
    let mut rest = vdf;
    while let Some(i) = rest.find("\"438100\"") {
        rest = &rest[i + 8..];
        let Some(open) = rest.find('{') else { break };
        // Only when the block follows the key directly.
        if !rest[..open].trim().is_empty() {
            continue;
        }
        let mut depth = 0usize;
        let mut end = rest.len();
        for (j, c) in rest[open..].char_indices() {
            match c {
                '{' => depth += 1,
                '}' => {
                    depth -= 1;
                    if depth == 0 {
                        end = open + j;
                        break;
                    }
                }
                _ => {}
            }
        }
        let block = &rest[open..end];
        let num = |key: &str| -> Option<u64> {
            block.lines().find_map(|l| {
                let l = l.trim();
                let v = l.strip_prefix(&format!("\"{key}\""))?.trim();
                v.trim_matches('"').parse().ok()
            })
        };
        if let Some(minutes) = num("Playtime") {
            let p = Playtime {
                minutes,
                two_weeks: num("Playtime2wks").unwrap_or(0),
                last_played: num("LastPlayed").unwrap_or(0),
            };
            if best.as_ref().map_or(true, |b| p.minutes > b.minutes) {
                best = Some(p);
            }
        }
    }
    best
}

fn steam_roots() -> Vec<PathBuf> {
    let mut out = Vec::new();
    #[cfg(target_os = "windows")]
    {
        for v in ["ProgramFiles(x86)", "ProgramFiles"] {
            if let Ok(p) = std::env::var(v) {
                out.push(PathBuf::from(p).join("Steam"));
            }
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = std::env::var("HOME") {
            let home = PathBuf::from(home);
            out.extend([
                home.join(".steam/steam"),
                home.join(".local/share/Steam"),
                home.join(".var/app/com.valvesoftware.Steam/.local/share/Steam"),
                home.join("snap/steam/common/.local/share/Steam"),
            ]);
        }
    }
    out
}

/// VRChat's play time from Steam's files (the most played Steam account on this machine).
#[tauri::command]
pub async fn steam_playtime() -> Result<Option<Playtime>, String> {
    tokio::task::spawn_blocking(|| {
        let mut best: Option<Playtime> = None;
        for root in steam_roots() {
            let Ok(users) = std::fs::read_dir(root.join("userdata")) else {
                continue;
            };
            for u in users.flatten() {
                let file = u.path().join("config/localconfig.vdf");
                // localconfig.vdf can be several MB; still fine once a day.
                if std::fs::metadata(&file)
                    .map(|m| m.len() > 64 << 20)
                    .unwrap_or(true)
                {
                    continue;
                }
                if let Some(p) = std::fs::read_to_string(&file)
                    .ok()
                    .and_then(|t| parse_playtime(&t))
                {
                    if best.as_ref().map_or(true, |b| p.minutes > b.minutes) {
                        best = Some(p);
                    }
                }
            }
        }
        best
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chatbox_packet_layout() {
        let p = chatbox_packet("hi", true);
        assert_eq!(&p[..16], b"/chatbox/input\0\0");
        assert_eq!(&p[16..20], b",sTF");
        assert_eq!(&p[20..24], b"\0\0\0\0");
        assert_eq!(&p[24..28], b"hi\0\0");
        assert_eq!(p.len() % 4, 0);
        assert_eq!(chatbox_packet(&"x".repeat(300), false).len(), 16 + 8 + 148);
    }

    #[test]
    fn hosts() {
        assert!(allowed_host(&"127.0.0.1".parse().unwrap()));
        assert!(allowed_host(&"192.168.1.20".parse().unwrap()));
        assert!(!allowed_host(&"8.8.8.8".parse().unwrap()));
    }

    #[test]
    fn playerctl() {
        let n = parse_playerctl("Playing\tspotify\tDaft Punk\tOne More Time\n").unwrap();
        assert!(n.playing);
        assert_eq!(n.title, "One More Time");
        assert!(parse_playerctl("Stopped\tvlc\t\t\n").is_none());
    }

    #[test]
    fn playtime() {
        let vdf = r#"
"UserLocalConfigStore"
{
	"Software"
	{
		"Valve"
		{
			"Steam"
			{
				"apps"
				{
					"438100"
					{
						"LastPlayed"		"1763000000"
						"Playtime2wks"		"600"
						"Playtime"		"145860"
						"cloud"
						{
							"last_sync_state"		"synchronized"
						}
					}
					"440"
					{
						"Playtime"		"5"
					}
				}
			}
		}
	}
}"#;
        assert_eq!(
            parse_playtime(vdf),
            Some(Playtime {
                minutes: 145860,
                two_weeks: 600,
                last_played: 1763000000
            })
        );
        assert_eq!(parse_playtime("\"440\" { \"Playtime\" \"5\" }"), None);
    }
}
