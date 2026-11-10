//! Reads VRChat's own output logs (desktop only) to learn who was in the same
//! instance as whom, and for how long.
//!
//! VRChat writes `output_log_<date>.txt` files while the game runs. The lines
//! used here are:
//!
//! ```text
//! 2026.11.08 21:13:49 Debug  -  [Behaviour] Entering Room: Cozy Room
//! 2026.11.08 21:13:49 Debug  -  [Behaviour] Joining wrld_…:60004~private(usr_…)~region(eu)
//! 2026.11.08 21:13:58 Debug  -  [Behaviour] OnPlayerJoined Some Name (usr_…)
//! 2026.11.08 21:13:59 Debug  -  [Behaviour] Initialized PlayerAPI "Some Name" is local
//! 2026.11.08 21:26:59 Debug  -  [Behaviour] OnPlayerLeft Some Name (usr_…)
//! 2026.11.08 21:26:59 Debug  -  [Behaviour] OnLeftRoom
//! ```
//!
//! Each file is turned into a list of instance visits, each with the time
//! span every player was present. The visits are kept in the app's data folder
//! so history survives VRChat cleaning up old log files. Timestamps in the logs
//! are local wall-clock time without a zone; they're stored as "naive" seconds
//! (that wall-clock time read as if it were UTC) and converted on display.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Mutex;

use crate::storage::write_private;

/// Format of `history.json`. Bump when the stored shape changes incompatibly.
pub const HISTORY_VERSION: u32 = 1;

/// A visit longer than this is treated as a log glitch and clipped.
const MAX_VISIT_SECS: i64 = 36 * 3600;
/// Days start at 06:00, so a late-night session counts as one evening.
const DAY_OFFSET_SECS: i64 = 6 * 3600;
/// Minimum overlap for a visit or a day to count as "together".
const VISIT_MIN_SECS: f64 = 300.0;
const DAY_MIN_SECS: f64 = 600.0;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Stint {
    pub id: String,
    pub from: i64,
    pub to: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Visit {
    pub world: String,
    #[serde(default)]
    pub world_name: String,
    /// public, friends+, friends, invite+, invite, group…
    #[serde(default)]
    pub access: String,
    pub start: i64,
    pub end: i64,
    #[serde(default)]
    pub players: Vec<Stint>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct FileEntry {
    pub size: u64,
    pub mtime: i64,
    #[serde(default)]
    pub local_id: Option<String>,
    #[serde(default)]
    pub visits: Vec<Visit>,
    /// Fields written by newer versions survive a round trip through this one.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Serialize, Deserialize, Debug, Default)]
pub struct History {
    pub version: u32,
    #[serde(default)]
    pub files: BTreeMap<String, FileEntry>,
    /// Last display name seen per user ID.
    #[serde(default)]
    pub names: BTreeMap<String, String>,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

// ---------------------------------------------------------------- parsing

/// "2026.11.08 21:13:49" -> naive seconds since 1970 (wall clock as if UTC).
pub fn parse_ts(line: &str) -> Option<i64> {
    let b = line.as_bytes();
    if b.len() < 19 || b[4] != b'.' || b[7] != b'.' || b[10] != b' ' || b[13] != b':' || b[16] != b':' {
        return None;
    }
    let num = |r: std::ops::Range<usize>| -> Option<i64> {
        let s = line.get(r)?;
        if !s.bytes().all(|c| c.is_ascii_digit()) {
            return None;
        }
        s.parse().ok()
    };
    let (y, mo, d) = (num(0..4)?, num(5..7)?, num(8..10)?);
    let (h, mi, s) = (num(11..13)?, num(14..16)?, num(17..19)?);
    if !(1..=12).contains(&mo) || !(1..=31).contains(&d) || h > 23 || mi > 59 || s > 60 {
        return None;
    }
    Some(days_from_civil(y, mo, d) * 86400 + h * 3600 + mi * 60 + s)
}

/// Days since 1970-01-01 for a proleptic Gregorian date (Howard Hinnant).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

/// "Name (usr_…)" -> (name, id)
fn split_player(rest: &str) -> Option<(&str, &str)> {
    let rest = rest.trim_end();
    let open = rest.rfind(" (usr_")?;
    if !rest.ends_with(')') {
        return None;
    }
    let id = &rest[open + 2..rest.len() - 1];
    if id.len() < 8 || id.contains(' ') {
        return None;
    }
    Some((rest[..open].trim(), id))
}

fn access_of(instance: &str) -> String {
    if instance.contains("~private(") {
        if instance.contains("~canRequestInvite") { "invite+" } else { "invite" }.into()
    } else if instance.contains("~friends(") {
        "friends".into()
    } else if instance.contains("~hidden(") {
        "friends+".into()
    } else if instance.contains("~group(") {
        if instance.contains("groupAccessType(public)") {
            "group public".into()
        } else if instance.contains("groupAccessType(plus)") {
            "group+".into()
        } else {
            "group".into()
        }
    } else {
        "public".into()
    }
}

#[derive(Debug, Default)]
pub struct Parsed {
    pub visits: Vec<Visit>,
    pub local_id: Option<String>,
    pub names: HashMap<String, String>,
}

struct OpenVisit {
    visit: Visit,
    open: HashMap<String, i64>,
    names: HashMap<String, String>,
}

impl OpenVisit {
    fn close(mut self, at: i64, local: &Option<String>) -> Visit {
        let end = at.max(self.visit.start).min(self.visit.start + MAX_VISIT_SECS);
        for (id, from) in self.open.drain() {
            self.visit.players.push(Stint { id, from, to: end });
        }
        self.visit.end = end;
        for s in &mut self.visit.players {
            s.from = s.from.clamp(self.visit.start, end);
            s.to = s.to.clamp(s.from, end);
        }
        // Your own presence is the whole visit; no need to store it.
        if let Some(me) = local {
            self.visit.players.retain(|s| &s.id != me);
        }
        self.visit.players.retain(|s| s.to > s.from);
        self.visit.players.sort_by(|a, b| a.from.cmp(&b.from).then(a.id.cmp(&b.id)));
        self.visit
    }
}

pub fn parse_log(text: &str) -> Parsed {
    let mut out = Parsed::default();
    let mut current: Option<OpenVisit> = None;
    let mut finished: Vec<OpenVisit> = Vec::new();
    let mut pending_name = String::new();
    let mut last_ts: i64 = 0;
    let mut local_name: Option<String> = None;

    for line in text.lines() {
        let Some(ts) = parse_ts(line) else { continue };
        last_ts = last_ts.max(ts);
        let Some(pos) = line.find("[Behaviour] ") else { continue };
        let rest = &line[pos + 12..];

        if let Some(name) = rest.strip_prefix("Entering Room: ") {
            pending_name = name.trim().to_string();
        } else if let Some(inst) = rest.strip_prefix("Joining ") {
            if !inst.starts_with("wrld_") {
                continue;
            }
            if let Some(v) = current.take() {
                let mut v = v;
                v.visit.end = ts;
                finished.push(v);
            }
            let inst = inst.trim();
            let world = inst.split(':').next().unwrap_or(inst).to_string();
            current = Some(OpenVisit {
                visit: Visit {
                    world,
                    world_name: std::mem::take(&mut pending_name),
                    access: access_of(inst),
                    start: ts,
                    end: ts,
                    players: Vec::new(),
                },
                open: HashMap::new(),
                names: HashMap::new(),
            });
        } else if let Some(p) = rest.strip_prefix("OnPlayerJoined ") {
            let (Some(v), Some((name, id))) = (current.as_mut(), split_player(p)) else { continue };
            v.open.entry(id.to_string()).or_insert(ts);
            v.names.insert(name.to_string(), id.to_string());
            out.names.insert(id.to_string(), name.to_string());
            if out.local_id.is_none() && local_name.as_deref() == Some(name) {
                out.local_id = Some(id.to_string());
            }
        } else if let Some(p) = rest.strip_prefix("OnPlayerLeft ") {
            let (Some(v), Some((_, id))) = (current.as_mut(), split_player(p)) else { continue };
            if let Some(from) = v.open.remove(id) {
                v.visit.players.push(Stint { id: id.to_string(), from, to: ts });
            }
        } else if rest.trim_end() == "OnLeftRoom" {
            if let Some(mut v) = current.take() {
                v.visit.end = ts;
                finished.push(v);
            }
        } else if let Some(p) = rest.strip_prefix("Initialized PlayerAPI \"") {
            if let Some(name) = p.strip_suffix("\" is local").or_else(|| p.trim_end().strip_suffix("\" is local")) {
                if out.local_id.is_none() {
                    if let Some(id) = current.as_ref().and_then(|v| v.names.get(name)) {
                        out.local_id = Some(id.clone());
                    }
                }
                local_name = Some(name.to_string());
            }
        }
    }
    if let Some(mut v) = current.take() {
        v.visit.end = last_ts;
        finished.push(v);
    }
    let local = out.local_id.clone();
    out.visits = finished
        .into_iter()
        .map(|v| {
            let end = v.visit.end;
            v.close(end, &local)
        })
        .filter(|v| v.end > v.start)
        .collect();
    out
}

// ---------------------------------------------------------------- folders

/// Folders where VRChat keeps its logs on this machine, if any exist.
pub fn detect_dirs() -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    #[cfg(target_os = "windows")]
    {
        if let Ok(profile) = std::env::var("USERPROFILE") {
            out.push(PathBuf::from(profile).join("AppData").join("LocalLow").join("VRChat").join("VRChat"));
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = std::env::var("HOME") {
            let home = PathBuf::from(home);
            let roots = [
                home.join(".steam/steam"),
                home.join(".steam/root"),
                home.join(".local/share/Steam"),
                home.join(".var/app/com.valvesoftware.Steam/.local/share/Steam"),
                home.join("snap/steam/common/.local/share/Steam"),
            ];
            let mut libraries: Vec<PathBuf> = Vec::new();
            for root in roots.iter().filter(|r| r.is_dir()) {
                libraries.push(root.clone());
                for vdf in [root.join("steamapps/libraryfolders.vdf"), root.join("config/libraryfolders.vdf")] {
                    if let Ok(text) = std::fs::read_to_string(&vdf) {
                        libraries.extend(library_paths(&text).into_iter().map(PathBuf::from));
                    }
                }
            }
            for lib in libraries {
                out.push(lib.join(
                    "steamapps/compatdata/438100/pfx/drive_c/users/steamuser/AppData/LocalLow/VRChat/VRChat",
                ));
            }
        }
    }
    let mut seen = HashSet::new();
    out.into_iter()
        .filter(|p| p.is_dir())
        .filter(|p| seen.insert(std::fs::canonicalize(p).unwrap_or_else(|_| p.clone())))
        .collect()
}

/// `"path"   "/mnt/games/SteamLibrary"` entries from Steam's libraryfolders.vdf.
pub fn library_paths(vdf: &str) -> Vec<String> {
    vdf.lines()
        .filter_map(|l| {
            let l = l.trim();
            let rest = l.strip_prefix("\"path\"")?.trim();
            let inner = rest.strip_prefix('"')?.strip_suffix('"')?;
            Some(inner.replace("\\\\", "\\"))
        })
        .collect()
}

fn is_log_name(name: &str) -> bool {
    name.starts_with("output_log_") && name.ends_with(".txt") && name.len() < 80
}

// ---------------------------------------------------------------- storage + scan

#[derive(Serialize, Clone, Debug, Default)]
pub struct ScanReport {
    pub dirs: Vec<String>,
    pub files_seen: usize,
    pub files_read: usize,
    pub files_stored: usize,
    pub visits: usize,
    /// Naive seconds of the oldest / newest visit in history.
    pub first: i64,
    pub last: i64,
    pub bytes: u64,
    /// Set when history.json comes from a newer app version; it is left alone.
    pub newer_version: Option<u32>,
    pub errors: Vec<String>,
}

pub struct LogStore {
    pub path: PathBuf,
    cache: Mutex<Option<History>>,
}

impl LogStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path, cache: Mutex::new(None) }
    }

    fn load(&self) -> Result<History, String> {
        match std::fs::read(&self.path) {
            Ok(bytes) => serde_json::from_slice::<History>(&bytes).map_err(|e| format!("history.json: {e}")),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(History { version: HISTORY_VERSION, ..Default::default() }),
            Err(e) => Err(e.to_string()),
        }
    }

    fn with_history<T>(&self, f: impl FnOnce(&mut History) -> T) -> Result<T, String> {
        let mut guard = self.cache.lock().map_err(|_| "log history lock poisoned".to_string())?;
        if guard.is_none() {
            *guard = Some(self.load()?);
        }
        Ok(f(guard.as_mut().unwrap()))
    }

    fn save(&self, h: &History) -> Result<(), String> {
        let bytes = serde_json::to_vec(h).map_err(|e| e.to_string())?;
        write_private(&self.path, &bytes)
    }

    pub fn clear(&self) -> Result<(), String> {
        let mut guard = self.cache.lock().map_err(|_| "log history lock poisoned".to_string())?;
        *guard = Some(History { version: HISTORY_VERSION, ..Default::default() });
        match std::fs::remove_file(&self.path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }

    /// Read new or changed log files from `dirs` and fold them into history.
    /// `retention_days` = 0 keeps everything.
    pub fn scan(&self, dirs: &[PathBuf], retention_days: u32, now_naive: i64) -> Result<ScanReport, String> {
        let mut report = ScanReport { dirs: dirs.iter().map(|d| d.display().to_string()).collect(), ..Default::default() };
        let mut changed = false;
        let mut newer: Option<u32> = None;
        self.with_history(|h| {
            if h.version > HISTORY_VERSION {
                newer = Some(h.version);
                return;
            }
            if h.version < HISTORY_VERSION {
                // No older formats exist yet; future migrations go here.
                h.version = HISTORY_VERSION;
                changed = true;
            }
            let mut seen_names: HashSet<String> = HashSet::new();
            for dir in dirs {
                let rd = match std::fs::read_dir(dir) {
                    Ok(rd) => rd,
                    Err(e) => {
                        report.errors.push(format!("{}: {e}", dir.display()));
                        continue;
                    }
                };
                for entry in rd.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if !is_log_name(&name) {
                        continue;
                    }
                    let Ok(meta) = entry.metadata() else { continue };
                    report.files_seen += 1;
                    seen_names.insert(name.clone());
                    let size = meta.len();
                    let mtime = meta
                        .modified()
                        .ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs() as i64)
                        .unwrap_or(0);
                    if let Some(old) = h.files.get(&name) {
                        if old.size == size && old.mtime == mtime {
                            continue;
                        }
                    }
                    let bytes = match std::fs::read(entry.path()) {
                        Ok(b) => b,
                        Err(e) => {
                            report.errors.push(format!("{name}: {e}"));
                            continue;
                        }
                    };
                    let parsed = parse_log(&String::from_utf8_lossy(&bytes));
                    for (id, n) in parsed.names {
                        h.names.insert(id, n);
                    }
                    let extra = h.files.get(&name).map(|f| f.extra.clone()).unwrap_or_default();
                    h.files.insert(name, FileEntry { size, mtime, local_id: parsed.local_id, visits: parsed.visits, extra });
                    report.files_read += 1;
                    changed = true;
                }
            }
            if retention_days > 0 {
                let cutoff = now_naive - retention_days as i64 * 86400;
                for f in h.files.values_mut() {
                    let before = f.visits.len();
                    f.visits.retain(|v| v.end >= cutoff);
                    changed |= f.visits.len() != before;
                }
                let before = h.files.len();
                // Forget files whose visits all expired, unless the file is still on disk
                // (then the entry stops it from being read again every scan).
                h.files.retain(|name, f| !f.visits.is_empty() || seen_names.contains(name));
                changed |= h.files.len() != before;
            }
            fill_summary(h, &mut report);
        })?;
        report.newer_version = newer;
        if changed {
            self.with_history(|h| self.save(h))??;
        }
        report.bytes = std::fs::metadata(&self.path).map(|m| m.len()).unwrap_or(0);
        Ok(report)
    }

    pub fn info(&self) -> Result<ScanReport, String> {
        let mut report = ScanReport::default();
        self.with_history(|h| {
            if h.version > HISTORY_VERSION {
                report.newer_version = Some(h.version);
            }
            fill_summary(h, &mut report);
        })?;
        report.bytes = std::fs::metadata(&self.path).map(|m| m.len()).unwrap_or(0);
        Ok(report)
    }

    pub fn stats(&self, q: &StatsQuery) -> Result<Stats, String> {
        self.with_history(|h| compute_stats(h, q))
    }
}

fn fill_summary(h: &History, report: &mut ScanReport) {
    report.files_stored = h.files.len();
    report.visits = h.files.values().map(|f| f.visits.len()).sum();
    report.first = h.files.values().flat_map(|f| f.visits.iter().map(|v| v.start)).min().unwrap_or(0);
    report.last = h.files.values().flat_map(|f| f.visits.iter().map(|v| v.end)).max().unwrap_or(0);
}

// ---------------------------------------------------------------- statistics

#[derive(Deserialize, Debug, Clone)]
pub struct StatsQuery {
    pub friend_ids: Vec<String>,
    #[serde(default)]
    pub self_id: Option<String>,
    /// "strong" (1/n), "mild" (1/√n) or "off": how much big instances count.
    #[serde(default)]
    pub crowd: String,
    /// Only visits ending at or after this naive timestamp.
    #[serde(default)]
    pub since: Option<i64>,
}

#[derive(Serialize, Debug, Clone, Default)]
pub struct PersonStat {
    pub id: String,
    pub secs: f64,
    pub weighted: f64,
    pub visits: u32,
    pub days: u32,
    pub last: i64,
    pub worlds: Vec<(String, f64)>,
}

#[derive(Serialize, Debug, Clone, Default)]
pub struct PairStat {
    pub a: String,
    pub b: String,
    pub secs: f64,
    pub weighted: f64,
    pub visits: u32,
    pub days: u32,
    pub last: i64,
}

#[derive(Serialize, Debug, Clone, Default)]
pub struct Stats {
    pub people: Vec<PersonStat>,
    pub pairs: Vec<PairStat>,
    pub visits: usize,
    pub play_secs: f64,
    pub first: i64,
    pub last: i64,
}

#[derive(Default)]
struct Acc {
    secs: f64,
    weighted: f64,
    visits: u32,
    last: i64,
}

fn day_of(t: i64) -> i64 {
    (t - DAY_OFFSET_SECS).div_euclid(86400)
}

pub fn compute_stats(h: &History, q: &StatsQuery) -> Stats {
    let index: HashMap<&str, u32> = q.friend_ids.iter().enumerate().map(|(i, id)| (id.as_str(), i as u32)).collect();
    let n = q.friend_ids.len();
    let crowd = |others: usize| -> f64 {
        let o = others.max(1) as f64;
        match q.crowd.as_str() {
            "off" => 1.0,
            "mild" => 1.0 / o.sqrt(),
            _ => 1.0 / o,
        }
    };

    let mut people: Vec<Acc> = (0..n).map(|_| Acc::default()).collect();
    let mut person_days: HashMap<(u32, i64), f64> = HashMap::new();
    let mut person_worlds: HashMap<(u32, String), f64> = HashMap::new();
    let mut pairs: HashMap<(u32, u32), Acc> = HashMap::new();
    let mut pair_days: HashMap<(u32, u32, i64), f64> = HashMap::new();
    let mut stats = Stats::default();

    let mut visits: Vec<(&Visit, Option<&str>)> = Vec::new();
    for f in h.files.values() {
        for v in &f.visits {
            if q.since.is_some_and(|s| v.end < s) {
                continue;
            }
            visits.push((v, f.local_id.as_deref()));
        }
    }
    // The same session can appear in two files only if logs were copied; dedupe by start+world.
    visits.sort_by(|a, b| a.0.start.cmp(&b.0.start).then(a.0.world.cmp(&b.0.world)));
    visits.dedup_by(|a, b| a.0.start == b.0.start && a.0.world == b.0.world);

    for (v, local) in visits {
        stats.visits += 1;
        stats.play_secs += (v.end - v.start) as f64;
        stats.first = if stats.first == 0 { v.start } else { stats.first.min(v.start) };
        stats.last = stats.last.max(v.end);

        // +1 / -1 events; `None` = someone who isn't a friend (still counts toward crowd size).
        let mut events: Vec<(i64, i32, Option<u32>)> = Vec::with_capacity(v.players.len() * 2);
        for s in &v.players {
            if q.self_id.as_deref() == Some(s.id.as_str()) || local == Some(s.id.as_str()) {
                continue;
            }
            let idx = index.get(s.id.as_str()).copied();
            events.push((s.from, 1, idx));
            events.push((s.to, -1, idx));
        }
        if events.is_empty() {
            continue;
        }
        events.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));

        let mut counts: HashMap<u32, u32> = HashMap::new();
        let mut present: Vec<u32> = Vec::new();
        let mut others: usize = 0;
        let mut visit_person: HashMap<u32, f64> = HashMap::new();
        let mut visit_pair: HashMap<(u32, u32), f64> = HashMap::new();
        let mut i = 0;
        while i < events.len() {
            let t = events[i].0;
            while i < events.len() && events[i].0 == t {
                let (_, delta, idx) = events[i];
                if delta > 0 {
                    others += 1;
                } else {
                    others = others.saturating_sub(1);
                }
                if let Some(x) = idx {
                    let c = counts.entry(x).or_insert(0);
                    if delta > 0 {
                        *c += 1;
                        if *c == 1 {
                            present.push(x);
                        }
                    } else if *c > 0 {
                        *c -= 1;
                        if *c == 0 {
                            if let Some(p) = present.iter().position(|&y| y == x) {
                                present.swap_remove(p);
                            }
                        }
                    }
                }
                i += 1;
            }
            let Some(&(next, _, _)) = events.get(i) else { break };
            let dt = (next - t) as f64;
            if dt <= 0.0 || others == 0 || present.is_empty() {
                continue;
            }
            let w = dt * crowd(others);
            let day = day_of(t);
            for (k, &a) in present.iter().enumerate() {
                let p = &mut people[a as usize];
                p.secs += dt;
                p.weighted += w;
                p.last = p.last.max(next);
                *visit_person.entry(a).or_default() += dt;
                *person_days.entry((a, day)).or_default() += dt;
                if !v.world_name.is_empty() {
                    *person_worlds.entry((a, v.world_name.clone())).or_default() += dt;
                }
                for &b in &present[k + 1..] {
                    let key = if a < b { (a, b) } else { (b, a) };
                    let acc = pairs.entry(key).or_default();
                    acc.secs += dt;
                    acc.weighted += w;
                    acc.last = acc.last.max(next);
                    *visit_pair.entry(key).or_default() += dt;
                    *pair_days.entry((key.0, key.1, day)).or_default() += dt;
                }
            }
        }
        for (a, secs) in visit_person {
            if secs >= VISIT_MIN_SECS {
                people[a as usize].visits += 1;
            }
        }
        for (key, secs) in visit_pair {
            if secs >= VISIT_MIN_SECS {
                pairs.get_mut(&key).unwrap().visits += 1;
            }
        }
    }

    let mut pdays: HashMap<u32, u32> = HashMap::new();
    for ((a, _), secs) in person_days {
        if secs >= DAY_MIN_SECS {
            *pdays.entry(a).or_default() += 1;
        }
    }
    let mut pair_day_count: HashMap<(u32, u32), u32> = HashMap::new();
    for ((a, b, _), secs) in pair_days {
        if secs >= DAY_MIN_SECS {
            *pair_day_count.entry((a, b)).or_default() += 1;
        }
    }
    let mut worlds: HashMap<u32, Vec<(String, f64)>> = HashMap::new();
    for ((a, name), secs) in person_worlds {
        worlds.entry(a).or_default().push((name, secs));
    }

    stats.people = people
        .into_iter()
        .enumerate()
        .filter(|(_, p)| p.secs > 0.0)
        .map(|(i, p)| {
            let mut w = worlds.remove(&(i as u32)).unwrap_or_default();
            w.sort_by(|a, b| b.1.total_cmp(&a.1));
            w.truncate(3);
            PersonStat {
                id: q.friend_ids[i].clone(),
                secs: p.secs,
                weighted: p.weighted,
                visits: p.visits,
                days: pdays.get(&(i as u32)).copied().unwrap_or(0),
                last: p.last,
                worlds: w,
            }
        })
        .collect();
    stats.pairs = pairs
        .into_iter()
        .filter(|(_, acc)| acc.secs >= 60.0)
        .map(|((a, b), acc)| PairStat {
            a: q.friend_ids[a as usize].clone(),
            b: q.friend_ids[b as usize].clone(),
            secs: acc.secs,
            weighted: acc.weighted,
            visits: acc.visits,
            days: pair_day_count.get(&(a, b)).copied().unwrap_or(0),
            last: acc.last,
        })
        .collect();
    stats.pairs.sort_by(|x, y| y.weighted.total_cmp(&x.weighted));
    stats
}

/// Current local wall-clock time as naive seconds, for retention cutoffs.
/// Uses the newest log timestamp seen if available; otherwise system UTC
/// (off by the UTC offset, which doesn't matter at day granularity).
pub fn now_naive_fallback() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub fn dirs_from_strings(dirs: &[String]) -> Vec<PathBuf> {
    dirs.iter().map(|d| d.trim()).filter(|d| !d.is_empty()).map(PathBuf::from).filter(|p| p.is_absolute()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "\
2026.11.08 21:13:42 Debug      -  Odin Serializer started
2026.11.08 21:13:49 Debug      -  [Behaviour] Entering Room: Cozy Room
2026.11.08 21:13:49 Debug      -  [Behaviour] Joining wrld_aaaa:60004~private(usr_me0000000)~region(eu)
2026.11.08 21:13:49 Debug      -  [Behaviour] Joining or Creating Room: Cozy Room
2026.11.08 21:13:58 Debug      -  [Behaviour] OnPlayerJoined Me Myself (usr_me0000000)
2026.11.08 21:13:59 Debug      -  [Behaviour] Initialized PlayerAPI \"Me Myself\" is local
2026.11.08 21:14:00 Debug      -  [Behaviour] OnPlayerJoined Alice (A) (usr_alice00000)
2026.11.08 21:14:00 Debug      -  [Behaviour] OnPlayerJoined Bob (usr_bob0000000)
2026.11.08 21:20:00 Debug      -  [Behaviour] OnPlayerLeftRoom
2026.11.08 21:24:00 Debug      -  [Behaviour] OnPlayerLeft Bob (usr_bob0000000)
2026.11.08 21:26:59 Debug      -  [Behaviour] OnLeftRoom
2026.11.08 21:26:59 Debug      -  [Behaviour] OnPlayerLeft Alice (A) (usr_alice00000)
2026.11.08 21:27:00 Debug      -  [Behaviour] Entering Room: Big Club
2026.11.08 21:27:00 Debug      -  [Behaviour] Joining wrld_bbbb:81062~group(grp_x)~groupAccessType(public)~region(eu)
2026.11.08 21:27:10 Debug      -  [Behaviour] OnPlayerJoined Me Myself (usr_me0000000)
2026.11.08 21:27:10 Debug      -  [Behaviour] OnPlayerJoined Alice (A) (usr_alice00000)
2026.11.08 21:27:10 Debug      -  [Behaviour] OnPlayerJoined Carol (usr_carol000000)
2026.11.08 21:27:10 Debug      -  [Behaviour] OnPlayerJoined Stranger (usr_strange0000)
  a continuation line without a timestamp
2026.11.08 21:57:10 Debug      -  [Behaviour] OnPlayerLeft Carol (usr_carol000000)
2026.11.08 22:07:10 Debug      -  something unrelated, last line
";

    #[test]
    fn timestamps() {
        assert_eq!(parse_ts("1970.01.01 00:00:00 x"), Some(0));
        assert_eq!(parse_ts("2000.03.01 00:00:01"), Some(951868801));
        assert_eq!(parse_ts("garbage"), None);
        assert_eq!(parse_ts("2026.13.01 00:00:00"), None);
    }

    #[test]
    fn player_names_with_parens() {
        assert_eq!(split_player("Alice (A) (usr_alice00000)"), Some(("Alice (A)", "usr_alice00000")));
        assert_eq!(split_player("NoId"), None);
    }

    #[test]
    fn parses_visits() {
        let p = parse_log(SAMPLE);
        assert_eq!(p.local_id.as_deref(), Some("usr_me0000000"));
        assert_eq!(p.visits.len(), 2);
        let v0 = &p.visits[0];
        assert_eq!(v0.world, "wrld_aaaa");
        assert_eq!(v0.world_name, "Cozy Room");
        assert_eq!(v0.access, "invite");
        assert_eq!(v0.end - v0.start, 13 * 60 + 10);
        // Self is not stored; Alice closed at OnLeftRoom, Bob at his leave.
        let ids: Vec<_> = v0.players.iter().map(|s| (s.id.as_str(), s.to - s.from)).collect();
        assert_eq!(ids, vec![("usr_alice00000", 12 * 60 + 59), ("usr_bob0000000", 10 * 60)]);
        let v1 = &p.visits[1];
        assert_eq!(v1.world_name, "Big Club");
        assert_eq!(v1.access, "group public");
        // Visit runs to the last timestamp in the file.
        assert_eq!(v1.end - v1.start, 40 * 60 + 10);
        let carol = v1.players.iter().find(|s| s.id == "usr_carol000000").unwrap();
        assert_eq!(carol.to - carol.from, 30 * 60);
        assert_eq!(p.names.get("usr_alice00000").map(String::as_str), Some("Alice (A)"));
    }

    #[test]
    fn stats_and_crowd_weighting() {
        let p = parse_log(SAMPLE);
        let mut h = History { version: HISTORY_VERSION, ..Default::default() };
        h.files.insert("output_log_x.txt".into(), FileEntry { local_id: p.local_id, visits: p.visits, ..Default::default() });
        let q = StatsQuery {
            friend_ids: vec!["usr_alice00000".into(), "usr_bob0000000".into(), "usr_carol000000".into()],
            self_id: None,
            crowd: "off".into(),
            since: None,
        };
        let s = compute_stats(&h, &q);
        let pair = |a: &str, b: &str| s.pairs.iter().find(|p| (p.a == a && p.b == b) || (p.a == b && p.b == a)).cloned();
        // Alice+Bob: 21:14 -> 21:24 in the first room.
        assert_eq!(pair("usr_alice00000", "usr_bob0000000").unwrap().secs, 600.0);
        // Alice+Carol: 30 min in the club.
        assert_eq!(pair("usr_alice00000", "usr_carol000000").unwrap().secs, 1800.0);
        assert!(pair("usr_bob0000000", "usr_carol000000").is_none());
        let alice = s.people.iter().find(|p| p.id == "usr_alice00000").unwrap();
        assert_eq!(alice.secs, (12 * 60 + 59 + 40 * 60) as f64);
        assert_eq!(alice.visits, 2);

        // Strong crowd weighting: in the club 3 others are present (Alice, Carol, stranger).
        let s2 = compute_stats(&h, &StatsQuery { crowd: "strong".into(), ..q });
        let ac = s2.pairs.iter().find(|p| p.secs == 1800.0).unwrap();
        assert!((ac.weighted - 600.0).abs() < 1e-6);
    }

    #[test]
    fn vdf_library_paths() {
        let vdf = "\"libraryfolders\"\n{\n\t\"0\"\n\t{\n\t\t\"path\"\t\t\"/home/u/.local/share/Steam\"\n\t}\n\t\"1\"\n\t{\n\t\t\"path\"\t\t\"/mnt/500gb/SteamLibrary\"\n\t}\n}";
        assert_eq!(library_paths(vdf), vec!["/home/u/.local/share/Steam", "/mnt/500gb/SteamLibrary"]);
        assert_eq!(library_paths("\"path\"\t\t\"D:\\\\SteamLibrary\""), vec!["D:\\SteamLibrary"]);
    }

    #[test]
    fn keeps_unknown_fields() {
        let json = r#"{"version":1,"files":{"output_log_a.txt":{"size":1,"mtime":2,"visits":[],"future":true}},"names":{},"also":5}"#;
        let h: History = serde_json::from_str(json).unwrap();
        let back = serde_json::to_string(&h).unwrap();
        assert!(back.contains("\"future\":true"));
        assert!(back.contains("\"also\":5"));
    }
}

/// Runs only when VRCFM_REAL_LOGS points at a folder of real logs:
/// `VRCFM_REAL_LOGS=/path cargo test --lib real_logs -- --nocapture`
#[cfg(test)]
mod real_logs {
    use super::*;

    #[test]
    fn real_logs() {
        let Ok(dir) = std::env::var("VRCFM_REAL_LOGS") else { return };
        let tmp = std::env::temp_dir().join(format!("vrcfm-test-{}", std::process::id()));
        let store = LogStore::new(tmp.join("history.json"));
        let t0 = std::time::Instant::now();
        let r = store.scan(&[PathBuf::from(&dir)], 0, now_naive_fallback()).unwrap();
        println!("scan: {:?} in {:?}", (r.files_seen, r.files_read, r.visits, r.bytes), t0.elapsed());
        let h = store.load().unwrap();
        let mut everyone: Vec<String> = h.names.keys().cloned().collect();
        everyone.sort();
        for (name, f) in &h.files {
            let players: usize = f.visits.iter().map(|v| v.players.len()).sum();
            println!("{name}: local_id={} visits={} stints={players}", f.local_id.is_some(), f.visits.len());
            for v in &f.visits {
                println!("  {} min, {} players, access={}", (v.end - v.start) / 60, v.players.len(), v.access);
            }
        }
        let t1 = std::time::Instant::now();
        let s = store.stats(&StatsQuery { friend_ids: everyone, self_id: None, crowd: "strong".into(), since: None }).unwrap();
        println!("stats: people={} pairs={} visits={} play_h={:.1} in {:?}", s.people.len(), s.pairs.len(), s.visits, s.play_secs / 3600.0, t1.elapsed());
        // A second scan reads nothing new.
        let r2 = store.scan(&[PathBuf::from(&dir)], 0, now_naive_fallback()).unwrap();
        assert_eq!(r2.files_read, 0);
        let _ = std::fs::remove_dir_all(tmp);
    }
}
