//! Small desktop extras, all opt-in (Settings → Extras):
//! - now playing: the song from your music player (MPRIS through `playerctl`
//!   on Linux);
//! - Steam play time: VRChat's minutes from Steam's own `localconfig.vdf`.

use serde::Serialize;
use std::path::PathBuf;

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
