//! The logger: watches the paired owner's friends through VRChat's live
//! pipeline (the same one the app uses) and counts, minute by minute, who is
//! in the same instance as whom. Friends in private / invite-only instances
//! are hidden by VRChat and don't count.
//!
//! ```text
//! vfm-data/logger/
//!   owner.json        who paired, when
//!   session.json      VRChat session cookies (secret, 0600)
//!   pair-code.json    one-time pairing code (vfm-server pair-code)
//!   totals.json       time together per pair, per person, per world
//!   hops-YYYY-MM.jsonl  raw location changes {"t":unix,"u":user,"l":location}
//! ```
//!
//! VRChat's guidance: one long-lived pipeline connection instead of polling,
//! a friends list refresh every `resync_minutes` (30 by default), back off
//! on 429, and a User-Agent with contact info.

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::Message;

use crate::store::{now, read_json, write_json};

const API: &str = "https://api.vrchat.cloud/api/1";
const PIPELINE: &str = "wss://pipeline.vrchat.cloud/";
const TICK_SECS: i64 = 60;
const MAX_GAP_SECS: i64 = 180;
const DAY_MIN_SECS: f64 = 600.0;
/// Day boundary at 06:00 UTC-ish, so late nights count as one day.
const DAY_OFFSET_SECS: i64 = 6 * 3600;

#[derive(Clone, Serialize, Deserialize, Default)]
struct Session {
    auth: String,
    #[serde(default, rename = "twoFactorAuth")]
    two_factor: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Default)]
struct OwnerFile {
    owner: Option<String>,
    #[serde(default)]
    display_name: String,
    #[serde(default)]
    paired_at: i64,
}

#[derive(Clone, Serialize, Deserialize, Default)]
struct PairAcc {
    s: f64,
    w: f64,
    l: i64,
    dc: u32,
    cd: i64,
    cs: f64,
}

#[derive(Clone, Serialize, Deserialize, Default)]
struct PersonAcc {
    /// Seconds seen in a public/visible instance.
    s: f64,
    /// Location changes seen.
    hops: u64,
    last: i64,
}

#[derive(Serialize, Deserialize)]
struct Totals {
    version: u32,
    since: i64,
    #[serde(default)]
    pairs: HashMap<String, PairAcc>,
    #[serde(default)]
    people: HashMap<String, PersonAcc>,
    #[serde(default)]
    worlds: HashMap<String, f64>,
    #[serde(default)]
    names: HashMap<String, String>,
}

impl Default for Totals {
    fn default() -> Self {
        Totals { version: 1, since: now(), pairs: HashMap::new(), people: HashMap::new(), worlds: HashMap::new(), names: HashMap::new() }
    }
}

#[derive(Default)]
struct Inner {
    owner: OwnerFile,
    session: Option<Session>,
    connected: bool,
    message: String,
    connected_since: i64,
    last_event: i64,
    events: u64,
    last_resync: i64,
    friends: HashSet<String>,
    /// Where each online friend is right now.
    locs: HashMap<String, String>,
    totals: Totals,
    dirty: bool,
    hops: Vec<String>,
    last_tick: i64,
    last_save: i64,
}

pub struct Logger {
    dir: PathBuf,
    inner: Mutex<Inner>,
    generation: AtomicU64,
    http: reqwest::Client,
    ua: String,
    resync_secs: i64,
    keep_months: u32,
}

fn pair_key(a: &str, b: &str) -> String {
    if a < b { format!("{a}|{b}") } else { format!("{b}|{a}") }
}

/// (year, month) for a unix time, without a date library.
fn year_month(t: i64) -> (i64, u32) {
    let days = t.div_euclid(86400);
    // Howard Hinnant's civil_from_days.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    (y, m)
}

/// A location that VRChat lets us see (public, friends+, groups…).
fn visible(loc: &str) -> bool {
    loc.starts_with("wrld_")
}

impl Logger {
    pub fn new(dir: PathBuf, contact: &str, resync_minutes: u64, keep_months: u32) -> Arc<Logger> {
        let _ = std::fs::create_dir_all(&dir);
        let owner: OwnerFile = read_json(&dir.join("owner.json"));
        let session: Option<Session> = if owner.owner.is_some() {
            std::fs::read(dir.join("session.json")).ok().and_then(|b| serde_json::from_slice(&b).ok())
        } else {
            None
        };
        let totals: Totals = read_json(&dir.join("totals.json"));
        let contact = contact.trim();
        let ua = if contact.is_empty() {
            format!("vfm-server/{} (+https://github.com/LuminoOwO/vrc-friend-map)", crate::api::VERSION)
        } else {
            format!("vfm-server/{} (+https://github.com/LuminoOwO/vrc-friend-map; {contact})", crate::api::VERSION)
        };
        let http = reqwest::Client::builder().gzip(true).timeout(Duration::from_secs(30)).build().expect("http client");
        Arc::new(Logger {
            dir,
            inner: Mutex::new(Inner { owner, session, totals, message: "Not paired yet".into(), ..Default::default() }),
            generation: AtomicU64::new(0),
            http,
            ua,
            resync_secs: (resync_minutes.max(10) * 60) as i64,
            keep_months,
        })
    }

    pub fn owner(&self) -> Option<String> {
        self.inner.lock().unwrap().owner.owner.clone()
    }

    // ---------- pairing ----------

    pub fn new_pair_code(&self) -> String {
        Self::pair_code_file(&self.dir)
    }

    /// Stop logging (keeps the pairing; `start` resumes).
    pub fn stop(&self) {
        self.generation.fetch_add(1, Ordering::SeqCst);
        self.set_status(false, "Logger turned off on the server");
    }

    pub fn has_session(&self) -> bool {
        self.inner.lock().unwrap().session.is_some()
    }

    /// One-time code, valid 15 minutes. Works whether or not the server runs.
    pub fn pair_code_file(dir: &std::path::Path) -> String {
        let code = format!("{:06}", rand::Rng::gen_range(&mut rand::thread_rng(), 0..1_000_000));
        let _ = write_json(&dir.join("pair-code.json"), &json!({ "code": code, "expires": now() + 15 * 60 }), true);
        code
    }

    pub fn take_pair_code(&self, code: &str) -> bool {
        let path = self.dir.join("pair-code.json");
        let v: Value = read_json(&path);
        let ok = v.get("code").and_then(Value::as_str).map(|c| constant_eq(c.as_bytes(), code.trim().as_bytes())).unwrap_or(false)
            && v.get("expires").and_then(Value::as_i64).unwrap_or(0) > now();
        if ok {
            let _ = std::fs::remove_file(path);
        }
        ok
    }

    fn cookie(s: &Session) -> String {
        match &s.two_factor {
            Some(t) if !t.is_empty() => format!("auth={}; twoFactorAuth={}", s.auth, t),
            _ => format!("auth={}", s.auth),
        }
    }

    async fn get(&self, s: &Session, path: &str) -> Result<(u16, Value), String> {
        let res = self
            .http
            .get(format!("{API}{path}"))
            .header(reqwest::header::USER_AGENT, &self.ua)
            .header(reqwest::header::COOKIE, Self::cookie(s))
            .header(reqwest::header::ACCEPT, "application/json")
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let status = res.status().as_u16();
        let body = res.json::<Value>().await.unwrap_or(Value::Null);
        Ok((status, body))
    }

    /// Check the session belongs to `user` and start logging.
    pub async fn pair(self: &Arc<Self>, user: &str, auth: &str, two_factor: Option<String>) -> Result<(), String> {
        if auth.is_empty() || auth.len() > 512 {
            return Err("no VRChat session was sent".into());
        }
        let session = Session { auth: auth.to_string(), two_factor };
        let (status, me) = self.get(&session, "/auth/user").await?;
        if status == 401 || me.get("requiresTwoFactorAuth").is_some() {
            return Err("VRChat didn't accept that session; log in again in the app".into());
        }
        let id = me.get("id").and_then(Value::as_str).unwrap_or("");
        if id != user {
            return Err("that VRChat session belongs to another account".into());
        }
        let name = me.get("displayName").and_then(Value::as_str).unwrap_or("").to_string();
        write_json(&self.dir.join("session.json"), &session, true)?;
        let owner = OwnerFile { owner: Some(user.to_string()), display_name: name.clone(), paired_at: now() };
        write_json(&self.dir.join("owner.json"), &owner, false)?;
        {
            let mut g = self.inner.lock().unwrap();
            if g.owner.owner.as_deref() != Some(user) {
                // A new owner never sees the previous owner's totals.
                g.totals = Totals::default();
                g.dirty = true;
            }
            g.owner = owner;
            g.session = Some(session);
            g.message = "Paired, connecting…".into();
        }
        eprintln!("logger paired with {name} ({user})");
        self.start();
        Ok(())
    }

    pub fn unpair(&self, forget: bool) {
        self.generation.fetch_add(1, Ordering::SeqCst);
        let _ = std::fs::remove_file(self.dir.join("session.json"));
        let _ = write_json(&self.dir.join("owner.json"), &OwnerFile::default(), false);
        let mut g = self.inner.lock().unwrap();
        g.owner = OwnerFile::default();
        g.session = None;
        g.connected = false;
        g.locs.clear();
        g.friends.clear();
        g.message = "Not paired".into();
        if forget {
            g.totals = Totals::default();
            g.dirty = false;
            let _ = std::fs::remove_file(self.dir.join("totals.json"));
            if let Ok(rd) = std::fs::read_dir(&self.dir) {
                for f in rd.flatten() {
                    if f.file_name().to_string_lossy().starts_with("hops-") {
                        let _ = std::fs::remove_file(f.path());
                    }
                }
            }
        }
        eprintln!("logger unpaired{}", if forget { " and history deleted" } else { "" });
    }

    // ---------- status / stats ----------

    pub fn status(&self) -> Value {
        let g = self.inner.lock().unwrap();
        let in_public = g.locs.values().filter(|l| visible(l)).count();
        json!({
            "paired": g.owner.owner.is_some(),
            "owner": g.owner.owner,
            "displayName": g.owner.display_name,
            "pairedAt": g.owner.paired_at,
            "connected": g.connected,
            "message": g.message,
            "connectedSince": g.connected_since,
            "lastEvent": g.last_event,
            "events": g.events,
            "friends": g.friends.len(),
            "online": g.locs.len(),
            "inVisibleInstances": in_public,
            "since": g.totals.since,
            "pairs": g.totals.pairs.len(),
            "lastResync": g.last_resync,
        })
    }

    /// Totals in the shape the app uses for live co-presence (PairTime).
    pub fn stats(&self) -> Value {
        let g = self.inner.lock().unwrap();
        let pairs: Vec<Value> = g
            .totals
            .pairs
            .iter()
            .filter(|(_, p)| p.s >= 60.0)
            .map(|(k, p)| {
                let (a, b) = k.split_once('|').unwrap_or((k, ""));
                json!({ "a": a, "b": b, "secs": p.s.round(), "weighted": p.w.round(), "visits": p.dc, "days": p.dc, "last": p.l })
            })
            .collect();
        let people: Vec<Value> = g.totals.people.iter().map(|(id, p)| json!({ "id": id, "secs": p.s.round(), "hops": p.hops, "last": p.last })).collect();
        let mut worlds: Vec<(&String, &f64)> = g.totals.worlds.iter().collect();
        worlds.sort_by(|a, b| b.1.partial_cmp(a.1).unwrap_or(std::cmp::Ordering::Equal));
        json!({
            "since": g.totals.since,
            "updated": now(),
            "pairs": pairs,
            "people": people,
            "worlds": worlds.into_iter().take(200).map(|(w, s)| json!([w, s.round()])).collect::<Vec<_>>(),
        })
    }

    // ---------- running ----------

    /// (Re)start the pipeline loop for the current session.
    pub fn start(self: &Arc<Self>) {
        let gen = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let me = Arc::clone(self);
        tokio::spawn(async move { me.run(gen).await });
    }

    /// Minute ticks, saving, pruning. Runs for the server's lifetime.
    pub fn spawn_ticker(self: &Arc<Self>) {
        let me = Arc::clone(self);
        tokio::spawn(async move {
            me.prune_hops();
            let mut iv = tokio::time::interval(Duration::from_secs(TICK_SECS as u64));
            let mut n: u64 = 0;
            loop {
                iv.tick().await;
                me.tick(now());
                n += 1;
                if n % (24 * 60) == 0 {
                    me.prune_hops();
                }
            }
        });
    }

    fn set_status(&self, connected: bool, msg: &str) {
        let mut g = self.inner.lock().unwrap();
        if connected && !g.connected {
            g.connected_since = now();
        }
        g.connected = connected;
        g.message = msg.to_string();
    }

    async fn run(self: Arc<Self>, gen: u64) {
        let current = |me: &Logger| me.generation.load(Ordering::SeqCst) == gen;
        let mut backoff = 5u64;
        while current(&self) {
            let Some(session) = self.inner.lock().unwrap().session.clone() else { return };
            match self.resync(&session).await {
                Ok(()) => {}
                Err(Fatal(msg)) => {
                    self.set_status(false, &msg);
                    return;
                }
            }
            match self.listen(&session, gen).await {
                Ok(Outcome::Stopped) => return,
                Ok(Outcome::Rejected(msg)) => {
                    self.set_status(false, &msg);
                    eprintln!("logger: {msg}");
                    return;
                }
                Ok(Outcome::Closed) => {
                    backoff = 5;
                    self.set_status(false, "Connection closed, reconnecting…");
                }
                Err(e) => self.set_status(false, &format!("Can't reach VRChat ({e}), retrying…")),
            }
            let wait = backoff + rand::random::<u64>() % 5;
            for _ in 0..wait {
                if !current(&self) {
                    return;
                }
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
            backoff = (backoff * 2).min(300);
        }
    }

    /// Full refresh of who is online where. Errors other than an expired
    /// session are logged and ignored (live events keep things going).
    async fn resync(&self, s: &Session) -> Result<(), Fatal> {
        let (status, me) = match self.get(s, "/auth/user").await {
            Ok(r) => r,
            Err(e) => {
                self.set_status(false, &format!("Can't reach VRChat ({e})"));
                return Ok(());
            }
        };
        if status == 401 || me.get("requiresTwoFactorAuth").is_some() {
            return Err(Fatal("VRChat session expired. Pair again from the app (Settings → Servers).".into()));
        }
        if status == 429 {
            tokio::time::sleep(Duration::from_secs(60)).await;
            return Ok(());
        }
        let friends: HashSet<String> =
            me.get("friends").and_then(Value::as_array).map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect()).unwrap_or_default();
        let mut locs = HashMap::new();
        let mut names = HashMap::new();
        let mut offset = 0;
        loop {
            tokio::time::sleep(Duration::from_secs(2)).await;
            let (status, page) = match self.get(s, &format!("/auth/user/friends?offline=false&n=100&offset={offset}")).await {
                Ok(r) => r,
                Err(_) => break,
            };
            if status == 429 {
                tokio::time::sleep(Duration::from_secs(60)).await;
                break;
            }
            let Some(arr) = page.as_array() else { break };
            for f in arr {
                let (Some(id), Some(loc)) = (f.get("id").and_then(Value::as_str), f.get("location").and_then(Value::as_str)) else { continue };
                if let Some(n) = f.get("displayName").and_then(Value::as_str) {
                    names.insert(id.to_string(), n.to_string());
                }
                if loc != "offline" && !loc.is_empty() {
                    locs.insert(id.to_string(), loc.to_string());
                }
            }
            if arr.len() < 100 || offset > 5000 {
                break;
            }
            offset += 100;
        }
        let mut g = self.inner.lock().unwrap();
        let t = now();
        for (id, loc) in &locs {
            if g.locs.get(id) != Some(loc) {
                g.hops.push(json!({ "t": t, "u": id, "l": loc }).to_string());
            }
        }
        g.friends = friends;
        g.locs = locs;
        g.totals.names.extend(names);
        g.last_resync = t;
        g.dirty = true;
        Ok(())
    }

    async fn listen(&self, s: &Session, gen: u64) -> Result<Outcome, String> {
        let mut url = reqwest::Url::parse(PIPELINE).map_err(|e| e.to_string())?;
        url.query_pairs_mut().append_pair("authToken", &s.auth);
        let mut req = url.as_str().into_client_request().map_err(|e| e.to_string())?;
        req.headers_mut().insert("User-Agent", HeaderValue::from_str(&self.ua).map_err(|e| e.to_string())?);
        let (mut ws, _) = tokio::time::timeout(Duration::from_secs(20), tokio_tungstenite::connect_async(req))
            .await
            .map_err(|_| "connection timed out".to_string())?
            .map_err(|e| e.to_string())?;
        self.set_status(true, "Logging");
        eprintln!("logger: connected to VRChat");
        loop {
            if self.generation.load(Ordering::SeqCst) != gen {
                let _ = ws.close(None).await;
                return Ok(Outcome::Stopped);
            }
            if now() - self.inner.lock().unwrap().last_resync > self.resync_secs {
                // Periodic refresh in the background of the open connection.
                if let Err(Fatal(msg)) = self.resync(s).await {
                    let _ = ws.close(None).await;
                    return Ok(Outcome::Rejected(msg));
                }
            }
            let msg = match tokio::time::timeout(Duration::from_secs(10), ws.next()).await {
                Err(_) => continue,
                Ok(None) => return Ok(Outcome::Closed),
                Ok(Some(Err(e))) => return Err(e.to_string()),
                Ok(Some(Ok(m))) => m,
            };
            let text = match msg {
                Message::Text(t) => t.to_string(),
                Message::Close(_) => return Ok(Outcome::Closed),
                _ => continue,
            };
            let Ok(outer) = serde_json::from_str::<Value>(&text) else { continue };
            if let Some(e) = outer.get("err").and_then(Value::as_str) {
                return Ok(Outcome::Rejected(format!("VRChat rejected the session ({e}). Pair again from the app.")));
            }
            let kind = outer.get("type").and_then(Value::as_str).unwrap_or("");
            let content = match outer.get("content") {
                Some(Value::String(s)) => serde_json::from_str(s).unwrap_or(Value::Null),
                Some(v) => v.clone(),
                None => Value::Null,
            };
            self.event(kind, &content, now());
        }
    }

    fn event(&self, kind: &str, c: &Value, t: i64) {
        let Some(id) = c.get("userId").and_then(Value::as_str) else { return };
        let mut g = self.inner.lock().unwrap();
        g.last_event = t;
        g.events += 1;
        if let Some(n) = c.pointer("/user/displayName").and_then(Value::as_str) {
            if g.totals.names.get(id).map(String::as_str) != Some(n) {
                g.totals.names.insert(id.to_string(), n.to_string());
            }
        }
        let new_loc: Option<Option<String>> = match kind {
            "friend-location" | "friend-online" => {
                // "traveling" (loading into a world) isn't an instance yet.
                let loc = c.get("location").and_then(Value::as_str).unwrap_or("");
                if loc.is_empty() || loc == "offline" { Some(None) } else { Some(Some(loc.to_string())) }
            }
            "friend-offline" | "friend-active" => Some(None),
            "friend-add" => {
                g.friends.insert(id.to_string());
                None
            }
            "friend-delete" => {
                g.friends.remove(id);
                Some(None)
            }
            _ => None,
        };
        if let Some(loc) = new_loc {
            let before = g.locs.get(id).cloned();
            if before != loc {
                g.hops.push(json!({ "t": t, "u": id, "l": loc.as_deref().unwrap_or("offline") }).to_string());
                let p = g.totals.people.entry(id.to_string()).or_default();
                p.hops += 1;
                p.last = t;
                match loc {
                    Some(l) => {
                        g.locs.insert(id.to_string(), l);
                    }
                    None => {
                        g.locs.remove(id);
                    }
                }
            }
        }
    }

    /// Count the last minute: friends in the same visible instance.
    fn tick(&self, t: i64) {
        let mut g = self.inner.lock().unwrap();
        let gap = if g.last_tick == 0 { TICK_SECS } else { t - g.last_tick };
        g.last_tick = t;
        if g.connected && gap > 0 && gap <= MAX_GAP_SECS {
            accumulate(&mut g, gap as f64, t);
        }
        // Raw hops: append once a minute (kinder to SD cards than per event).
        if !g.hops.is_empty() {
            let lines = std::mem::take(&mut g.hops);
            if self.keep_months > 0 {
                let (y, m) = year_month(t);
                let path = self.dir.join(format!("hops-{y:04}-{m:02}.jsonl"));
                if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
                    let _ = f.write_all((lines.join("\n") + "\n").as_bytes());
                }
            }
        }
        if g.dirty && t - g.last_save >= 300 {
            g.last_save = t;
            g.dirty = false;
            if let Err(e) = write_json(&self.dir.join("totals.json"), &g.totals, false) {
                eprintln!("logger: can't save totals: {e}");
                g.dirty = true;
            }
        }
    }

    pub fn save_now(&self) {
        let mut g = self.inner.lock().unwrap();
        if g.dirty {
            g.dirty = false;
            let _ = write_json(&self.dir.join("totals.json"), &g.totals, false);
        }
    }

    fn prune_hops(&self) {
        if self.keep_months == 0 {
            return;
        }
        let (y, m) = year_month(now());
        let cutoff = y * 12 + m as i64 - 1 - self.keep_months as i64;
        let Ok(rd) = std::fs::read_dir(&self.dir) else { return };
        for f in rd.flatten() {
            let name = f.file_name().to_string_lossy().to_string();
            let Some(ym) = name.strip_prefix("hops-").and_then(|s| s.strip_suffix(".jsonl")) else { continue };
            let Some((fy, fm)) = ym.split_once('-') else { continue };
            if let (Ok(fy), Ok(fm)) = (fy.parse::<i64>(), fm.parse::<i64>()) {
                if fy * 12 + fm - 1 < cutoff {
                    let _ = std::fs::remove_file(f.path());
                }
            }
        }
    }
}

fn accumulate(g: &mut Inner, dt: f64, t: i64) {
    let mut by_loc: HashMap<&str, Vec<&str>> = HashMap::new();
    for (id, loc) in &g.locs {
        if visible(loc) {
            by_loc.entry(loc.as_str()).or_default().push(id.as_str());
        }
    }
    let day = (t - DAY_OFFSET_SECS).div_euclid(86400);
    let mut people: Vec<String> = Vec::new();
    let mut pair_updates: Vec<(String, f64)> = Vec::new();
    let mut world_updates: Vec<(String, f64)> = Vec::new();
    for (loc, ids) in &by_loc {
        people.extend(ids.iter().map(|s| s.to_string()));
        if ids.len() < 2 {
            continue;
        }
        let weight = 1.0 / ((ids.len() - 1) as f64).sqrt();
        let world = loc.split(':').next().unwrap_or(loc).to_string();
        world_updates.push((world, dt * (ids.len() - 1) as f64));
        for i in 0..ids.len() {
            for j in i + 1..ids.len() {
                pair_updates.push((pair_key(ids[i], ids[j]), weight));
            }
        }
    }
    for id in people {
        let p = g.totals.people.entry(id).or_default();
        p.s += dt;
        p.last = t;
    }
    for (w, s) in world_updates {
        *g.totals.worlds.entry(w).or_insert(0.0) += s;
    }
    for (k, weight) in pair_updates {
        let p = g.totals.pairs.entry(k).or_insert_with(|| PairAcc { cd: day, ..Default::default() });
        if p.cd != day {
            p.cd = day;
            p.cs = 0.0;
        }
        let before = p.cs;
        p.s += dt;
        p.w += dt * weight;
        p.cs += dt;
        p.l = t;
        if before < DAY_MIN_SECS && p.cs >= DAY_MIN_SECS {
            p.dc += 1;
        }
    }
    g.dirty = true;
}

struct Fatal(String);

enum Outcome {
    Closed,
    Stopped,
    Rejected(String),
}

pub(crate) fn constant_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

pub(crate) use self::constant_eq as tokens_equal;

#[cfg(test)]
mod tests {
    use super::*;

    fn logger() -> Arc<Logger> {
        let d = std::env::temp_dir().join(format!("vfm-logger-test-{}", crate::config::random_token(6)));
        Logger::new(d, "", 30, 0)
    }

    #[test]
    fn months() {
        assert_eq!(year_month(0), (1970, 1));
        assert_eq!(year_month(1_762_790_400), (2025, 11)); // 2025-11-10
        assert_eq!(year_month(1_709_164_800), (2024, 2)); // 2024-02-29
    }

    #[test]
    fn counts_friends_in_the_same_instance() {
        let l = logger();
        l.inner.lock().unwrap().connected = true;
        let t = 1_700_000_000;
        let loc = |id: &str, loc: &str| json!({ "userId": id, "location": loc });
        l.event("friend-location", &loc("usr_a", "wrld_1:100~friends(usr_x)"), t);
        l.event("friend-location", &loc("usr_b", "wrld_1:100~friends(usr_x)"), t);
        l.event("friend-location", &loc("usr_c", "wrld_1:100~friends(usr_x)"), t);
        l.event("friend-location", &loc("usr_d", "private"), t);
        l.event("friend-online", &loc("usr_e", "wrld_2:5"), t);
        l.tick(t);
        for i in 1..=12 {
            l.tick(t + i * 60);
        }
        l.event("friend-offline", &json!({ "userId": "usr_c" }), t + 780);
        l.tick(t + 840);
        // A long gap (server asleep) isn't counted.
        l.tick(t + 5000);
        let g = l.inner.lock().unwrap();
        let ab = &g.totals.pairs[&pair_key("usr_a", "usr_b")];
        let ac = &g.totals.pairs[&pair_key("usr_a", "usr_c")];
        // 13 one-minute ticks, then a two-minute one.
        assert_eq!(ab.s, 13.0 * 60.0 + 120.0);
        assert_eq!(ac.s, 13.0 * 60.0);
        assert_eq!(ab.dc, 1);
        assert!(!g.totals.pairs.keys().any(|k| k.contains("usr_d") || k.contains("usr_e")));
        assert_eq!(g.totals.people["usr_c"].hops, 2);
        drop(g);
        let s = l.stats();
        assert_eq!(s["pairs"].as_array().unwrap().len(), 3);
    }

    #[test]
    fn pair_codes_are_one_time() {
        let l = logger();
        let code = l.new_pair_code();
        assert!(!l.take_pair_code("000000x"));
        assert!(l.take_pair_code(&code));
        assert!(!l.take_pair_code(&code));
    }
}
