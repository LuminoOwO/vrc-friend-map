//! Who is in your instance right now, from VRChat's log while it's written.
//!
//! VRChat appends to `output_log_*.txt` as things happen. This follows the
//! newest file (checking for new lines every ~1.5 s), keeps the current
//! instance and the players in it, and sends a snapshot to the UI whenever
//! it changes. Nothing is requested from VRChat. Desktop only, and only on
//! the PC that runs VRChat.

use serde::Serialize;
use std::collections::BTreeMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::gamelogs::{parse_ts, split_player};

#[derive(Clone, Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LivePlayer {
    pub id: String,
    pub name: String,
    /// When they joined (log time, naive seconds).
    pub since: i64,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    /// In an instance right now, per the log.
    pub active: bool,
    /// Full instance string ("wrld_…:12345~friends(usr_…)~region(eu)").
    pub location: String,
    pub world_id: String,
    pub world_name: String,
    /// When you joined (naive seconds).
    pub since: i64,
    /// Everyone in the instance, you included, in order of joining.
    pub players: Vec<LivePlayer>,
    /// Your own user ID, once the log shows it.
    pub local_id: Option<String>,
    pub file: String,
    /// VRChat isn't running (it quit, or the process is gone).
    pub closed: bool,
}

#[derive(Default)]
struct Tracker {
    snap: Snapshot,
    /// Players by ID (the snapshot keeps them ordered).
    here: BTreeMap<String, LivePlayer>,
    pending_world_name: String,
    local_name: Option<String>,
}

impl Tracker {
    fn line(&mut self, line: &str) {
        let Some(ts) = parse_ts(line) else { return };
        if line.contains("OnApplicationQuit") || line.contains("HandleApplicationQuit") {
            self.leave();
            self.snap.closed = true;
            return;
        }
        let Some(pos) = line.find("[Behaviour] ") else { return };
        let rest = &line[pos + 12..];
        if let Some(name) = rest.strip_prefix("Entering Room: ") {
            self.pending_world_name = name.trim().to_string();
        } else if let Some(inst) = rest.strip_prefix("Joining ") {
            if !inst.starts_with("wrld_") {
                return;
            }
            let inst = inst.trim();
            self.here.clear();
            self.snap.active = true;
            self.snap.closed = false;
            self.snap.location = inst.to_string();
            self.snap.world_id = inst.split(':').next().unwrap_or(inst).to_string();
            self.snap.world_name = std::mem::take(&mut self.pending_world_name);
            self.snap.since = ts;
        } else if let Some(p) = rest.strip_prefix("OnPlayerJoined ") {
            let Some((name, id)) = split_player(p) else { return };
            if !self.snap.active {
                return;
            }
            self.here.entry(id.to_string()).or_insert(LivePlayer { id: id.to_string(), name: name.to_string(), since: ts });
            if self.snap.local_id.is_none() && self.local_name.as_deref() == Some(name) {
                self.snap.local_id = Some(id.to_string());
            }
        } else if let Some(p) = rest.strip_prefix("OnPlayerLeft ") {
            if let Some((_, id)) = split_player(p) {
                self.here.remove(id);
            }
        } else if rest.trim_end() == "OnLeftRoom" {
            self.leave();
        } else if let Some(p) = rest.strip_prefix("Initialized PlayerAPI \"") {
            if let Some(name) = p.trim_end().strip_suffix("\" is local") {
                self.local_name = Some(name.to_string());
                if self.snap.local_id.is_none() {
                    self.snap.local_id = self.here.values().find(|pl| pl.name == name).map(|pl| pl.id.clone());
                }
            }
        }
    }

    fn leave(&mut self) {
        self.here.clear();
        self.snap.active = false;
        self.snap.location.clear();
        self.snap.world_id.clear();
        self.snap.world_name.clear();
        self.snap.since = 0;
    }

    fn snapshot(&self) -> Snapshot {
        let mut s = self.snap.clone();
        s.players = self.here.values().cloned().collect();
        s.players.sort_by(|a, b| a.since.cmp(&b.since).then(a.name.cmp(&b.name)));
        s
    }
}

/// Newest `output_log_*.txt` in the folders.
fn newest_log(dirs: &[PathBuf]) -> Option<PathBuf> {
    let mut best: Option<(std::time::SystemTime, PathBuf)> = None;
    for d in dirs {
        let Ok(rd) = std::fs::read_dir(d) else { continue };
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if !(name.starts_with("output_log_") && name.ends_with(".txt")) {
                continue;
            }
            let Ok(m) = e.metadata().and_then(|m| m.modified()) else { continue };
            if best.as_ref().map(|(t, _)| m > *t).unwrap_or(true) {
                best = Some((m, e.path()));
            }
        }
    }
    best.map(|(_, p)| p)
}

/// Is a VRChat process running? (Checked rarely; only to notice a crash,
/// which leaves no "quit" line.) None = can't tell on this system.
fn vrchat_running() -> Option<bool> {
    #[cfg(target_os = "linux")]
    {
        // Proton/Wine runs it as VRChat.exe; look through process command lines.
        let rd = std::fs::read_dir("/proc").ok()?;
        for e in rd.flatten() {
            let name = e.file_name();
            if !name.to_string_lossy().bytes().all(|b| b.is_ascii_digit()) {
                continue;
            }
            if let Ok(cmd) = std::fs::read(e.path().join("cmdline")) {
                if cmd.windows(10).any(|w| w.eq_ignore_ascii_case(b"VRChat.exe")) {
                    return Some(true);
                }
            }
        }
        Some(false)
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let out = std::process::Command::new("tasklist")
            .args(["/FI", "IMAGENAME eq VRChat.exe", "/NH", "/FO", "CSV"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()?;
        Some(String::from_utf8_lossy(&out.stdout).to_ascii_lowercase().contains("vrchat.exe"))
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        None
    }
}

struct FileState {
    path: PathBuf,
    offset: u64,
    partial: Vec<u8>,
}

/// Read what was appended since last time; whole lines go to the tracker.
fn read_new(f: &mut FileState, t: &mut Tracker) -> std::io::Result<()> {
    let mut file = std::fs::File::open(&f.path)?;
    let len = file.metadata()?.len();
    if len < f.offset {
        // Truncated or replaced: start over.
        f.offset = 0;
        f.partial.clear();
        *t = Tracker::default();
    }
    if len == f.offset {
        return Ok(());
    }
    file.seek(SeekFrom::Start(f.offset))?;
    let mut buf = Vec::with_capacity((len - f.offset).min(64 << 20) as usize);
    file.take(len - f.offset).read_to_end(&mut buf)?;
    f.offset += buf.len() as u64;
    f.partial.extend_from_slice(&buf);
    if let Some(last_nl) = f.partial.iter().rposition(|b| *b == b'\n') {
        let rest = f.partial.split_off(last_nl + 1);
        let text = String::from_utf8_lossy(&f.partial).to_string();
        for line in text.lines() {
            t.line(line);
        }
        f.partial = rest;
    }
    Ok(())
}

pub struct LiveLog {
    generation: AtomicU64,
    last: Mutex<Snapshot>,
}

impl LiveLog {
    pub fn new() -> Arc<Self> {
        Arc::new(LiveLog { generation: AtomicU64::new(0), last: Mutex::new(Snapshot::default()) })
    }

    pub fn snapshot(&self) -> Snapshot {
        self.last.lock().unwrap().clone()
    }

    pub fn stop(&self) {
        self.generation.fetch_add(1, Ordering::SeqCst);
        *self.last.lock().unwrap() = Snapshot::default();
    }

    /// Follow the newest log in `dirs` until stopped; emits "live-instance".
    pub fn start(self: &Arc<Self>, app: AppHandle, dirs: Vec<PathBuf>) {
        let gen = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let me = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            let mut state: Option<FileState> = None;
            let mut tracker = Tracker::default();
            let mut ticks: u64 = 0;
            while me.generation.load(Ordering::SeqCst) == gen {
                let newest = newest_log(&dirs);
                if newest.as_deref() != state.as_ref().map(|s| s.path.as_path()) {
                    // A new log = VRChat started again; read it from the beginning.
                    state = newest.map(|path| FileState { path, offset: 0, partial: Vec::new() });
                    tracker = Tracker::default();
                }
                if let Some(f) = state.as_mut() {
                    let _ = read_new(f, &mut tracker);
                    tracker.snap.file = f.path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                }
                // Every ~15 s while "in an instance": did VRChat crash?
                if tracker.snap.active && ticks % 10 == 0 {
                    if vrchat_running() == Some(false) {
                        tracker.leave();
                        tracker.snap.closed = true;
                    }
                }
                ticks += 1;
                let snap = tracker.snapshot();
                let changed = {
                    let mut last = me.last.lock().unwrap();
                    if *last != snap {
                        *last = snap.clone();
                        true
                    } else {
                        false
                    }
                };
                if changed {
                    let _ = app.emit("live-instance", &snap);
                }
                tokio::time::sleep(Duration::from_millis(1500)).await;
            }
        });
    }
}

/// For tests: run a whole log text through the tracker.
#[cfg(test)]
pub fn snapshot_of(text: &str) -> Snapshot {
    let mut t = Tracker::default();
    for l in text.lines() {
        t.line(l);
    }
    t.snapshot()
}

#[cfg(test)]
mod tests {
    use super::*;

    const LOG: &str = "\
2026.11.08 21:13:49 Debug      -  [Behaviour] Entering Room: Cozy Room
2026.11.08 21:13:49 Debug      -  [Behaviour] Joining wrld_aaaa:60004~private(usr_me0000000)~region(eu)
2026.11.08 21:13:58 Debug      -  [Behaviour] Initialized PlayerAPI \"Me Myself\" is local
2026.11.08 21:13:58 Debug      -  [Behaviour] OnPlayerJoined Me Myself (usr_me0000000)
2026.11.08 21:14:00 Debug      -  [Behaviour] OnPlayerJoined Alice (A) (usr_alice00000)
2026.11.08 21:14:00 Debug      -  [Behaviour] OnPlayerJoined Bob (usr_bob0000000)
2026.11.08 21:24:00 Debug      -  [Behaviour] OnPlayerLeft Bob (usr_bob0000000)
";

    #[test]
    fn tracks_who_is_here() {
        let s = snapshot_of(LOG);
        assert!(s.active && !s.closed);
        assert_eq!(s.world_name, "Cozy Room");
        assert_eq!(s.world_id, "wrld_aaaa");
        assert_eq!(s.local_id.as_deref(), Some("usr_me0000000"));
        let ids: Vec<_> = s.players.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, vec!["usr_me0000000", "usr_alice00000"]);
        assert_eq!(s.players[1].name, "Alice (A)");
    }

    #[test]
    fn new_instance_and_leaving() {
        let more = format!(
            "{LOG}2026.11.08 21:26:59 Debug      -  [Behaviour] OnLeftRoom
2026.11.08 21:27:00 Debug      -  [Behaviour] Entering Room: Club
2026.11.08 21:27:00 Debug      -  [Behaviour] Joining wrld_bbbb:81062~region(eu)
2026.11.08 21:27:10 Debug      -  [Behaviour] OnPlayerJoined Me Myself (usr_me0000000)
2026.11.08 21:27:10 Debug      -  [Behaviour] OnPlayerJoined Carol (usr_carol000000)
"
        );
        let s = snapshot_of(&more);
        assert_eq!(s.world_name, "Club");
        assert_eq!(s.players.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(), vec!["usr_carol000000", "usr_me0000000"]);
        let quit = format!("{more}2026.11.08 23:00:00 Log        -  VRCApplication: OnApplicationQuit at 1234\n");
        let s = snapshot_of(&quit);
        assert!(!s.active && s.closed && s.players.is_empty());
    }

    #[test]
    fn reads_appended_lines_only_when_complete() {
        let dir = std::env::temp_dir().join(format!("vfm-live-{}", rand::random::<u32>()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("output_log_2026-11-08_21-13-40.txt");
        std::fs::write(&path, LOG).unwrap();
        let mut f = FileState { path: path.clone(), offset: 0, partial: Vec::new() };
        let mut t = Tracker::default();
        read_new(&mut f, &mut t).unwrap();
        assert_eq!(t.snapshot().players.len(), 2);
        // Half a line: nothing yet.
        use std::io::Write;
        let mut w = std::fs::OpenOptions::new().append(true).open(&path).unwrap();
        w.write_all(b"2026.11.08 21:30:00 Debug      -  [Behaviour] OnPlayerJoined Dave (usr_dave00").unwrap();
        read_new(&mut f, &mut t).unwrap();
        assert_eq!(t.snapshot().players.len(), 2);
        w.write_all(b"00000)\n").unwrap();
        read_new(&mut f, &mut t).unwrap();
        assert_eq!(t.snapshot().players.len(), 3);
        assert_eq!(newest_log(&[dir.clone()]).as_deref(), Some(path.as_path()));
        let _ = std::fs::remove_dir_all(dir);
    }
}

/// `VFM_REAL_LOGS=<folder> cargo test --lib real_logs -- --ignored --nocapture`
/// Runs real logs through the tracker and prints counts only (no names).
#[cfg(test)]
mod real {
    #[test]
    #[ignore]
    fn real_logs() {
        let dir = std::env::var("VFM_REAL_LOGS").expect("VFM_REAL_LOGS");
        for e in std::fs::read_dir(dir).unwrap().flatten() {
            let Ok(text) = std::fs::read_to_string(e.path()) else { continue };
            if !text.contains("[Behaviour]") {
                continue;
            }
            let s = super::snapshot_of(&text);
            let joins = text.matches("OnPlayerJoined ").count();
            let rooms = text.matches("[Behaviour] Joining wrld_").count();
            println!(
                "{} lines, {rooms} instances, {joins} joins -> active={} closed={} players_at_end={} local_id={} world_name_len={}",
                text.lines().count(), s.active, s.closed, s.players.len(), s.local_id.is_some(), s.world_name.len()
            );
        }
    }
}
