//! Sharing through vfm-servers (yours, a friend's, a public one).
//!
//! The keys live here, on this device: `share/identity.json` (secret, 0600).
//! Friends' and servers' public keys are pinned the first time they're seen
//! (`share/pins.json`); if a server later hands out a different key for
//! someone, nothing is sealed for or accepted from that key until you
//! confirm it. Data is sealed and opened here, so servers only ever see
//! ciphertext (when encryption is on).

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::time::Duration;
use tokio::sync::Mutex;
use vfm_share::{auth, Envelope, Identity, PublicIdentity, Recipient, ServerInfo};

use crate::storage::write_private;

pub struct ShareState {
    dir: PathBuf,
    http: reqwest::Client,
    lock: Mutex<()>,
    /// Your VRChat display name, sent along so the server owner's user list shows it.
    pub name: std::sync::Mutex<String>,
    /// Last inbox per server and account, with the server's tag for it: the next
    /// fetch asks "changed since?" and gets a tiny "no" (304) most of the time.
    inbox_cache: std::sync::Mutex<std::collections::HashMap<String, (String, Value)>>,
    /// Friends' hidden-recipient items per server and account ("owner|kind" -> item)
    /// and their senders' cards, so only new versions are fetched.
    #[allow(clippy::type_complexity)]
    hidden_cache: std::sync::Mutex<std::collections::HashMap<String, (BTreeMap<String, Envelope>, BTreeMap<String, PublicIdentity>)>>,
}

#[derive(Default, Serialize, Deserialize)]
struct Identities {
    /// VRChat user ID -> secret keys.
    #[serde(default)]
    keys: BTreeMap<String, String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pin {
    pub sign_pk: String,
    pub box_pk: String,
    pub fingerprint: String,
    pub first_seen: i64,
    /// Servers that reported this key (more = more confidence).
    #[serde(default)]
    pub servers: Vec<String>,
    /// A different key that a server offered and you haven't accepted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offered: Option<PublicIdentity>,
}

#[derive(Default, Serialize, Deserialize)]
struct Pins {
    #[serde(default)]
    users: BTreeMap<String, Pin>,
    /// Server URL -> its (sign_pk, box_pk).
    #[serde(default)]
    servers: BTreeMap<String, (String, String)>,
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// "pi.local:8787" -> "http://pi.local:8787"; "example.com" -> "https://example.com".
pub fn normalize_url(raw: &str) -> Result<String, String> {
    let raw = raw.trim().trim_end_matches('/');
    if raw.is_empty() {
        return Err("enter the server's address".into());
    }
    let with_scheme = if raw.contains("://") {
        raw.to_string()
    } else {
        let host = raw.split(['/', ':']).next().unwrap_or("");
        let local = host == "localhost"
            || host.ends_with(".local")
            || host.ends_with(".lan")
            || host.ends_with(".home.arpa")
            || host.parse::<std::net::IpAddr>().is_ok()
            || !host.contains('.');
        format!("{}://{raw}", if local { "http" } else { "https" })
    };
    let u = url::Url::parse(&with_scheme).map_err(|e| format!("not a valid address: {e}"))?;
    if u.scheme() != "http" && u.scheme() != "https" {
        return Err("the address must start with http:// or https://".into());
    }
    if u.host_str().is_none() {
        return Err("the address needs a host name".into());
    }
    Ok(u.as_str().trim_end_matches('/').to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MyIdentity {
    pub user_id: String,
    pub fingerprint: String,
    /// Put this in your VRChat bio so friends' apps can confirm your key.
    pub proof: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InfoResult {
    pub url: String,
    pub info: ServerInfo,
    /// The server's own keys differ from the first time you connected.
    pub key_changed: bool,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PublishResult {
    pub sealed: bool,
    /// People the item is addressed to.
    pub recipients: usize,
    /// Asked for but not on this server yet (sealed: can't be included until they join).
    pub not_on_server: Vec<String>,
    /// Server offered a different key than the pinned one: left out.
    pub key_changed: Vec<String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InboxItem {
    pub owner: String,
    pub kind: String,
    pub created: i64,
    pub sealed: bool,
    pub fingerprint: String,
    pub payload: Option<Value>,
    pub error: Option<String>,
}

/// One message from a server's live change stream.
#[derive(Debug, PartialEq)]
pub enum WatchEvent {
    /// The stream is open.
    Open,
    /// Something you can fetch changed (owner, kind).
    Change(String, String),
    /// This connection missed changes: sync everything.
    Resync,
    /// A sealed message from one of your other devices.
    Peer(String),
}

/// One server-sent-events block ("event: …" and "data: …" lines, or a ": comment").
pub fn parse_event(block: &str) -> Option<WatchEvent> {
    let (mut event, mut data) = ("", String::new());
    for line in block.lines() {
        if line == ": open" {
            return Some(WatchEvent::Open);
        }
        if let Some(v) = line.strip_prefix("event:") {
            event = v.trim();
        } else if let Some(v) = line.strip_prefix("data:") {
            data.push_str(v.trim());
        }
    }
    match event {
        "change" => {
            let v: Value = serde_json::from_str(&data).ok()?;
            Some(WatchEvent::Change(v["owner"].as_str()?.to_string(), v["kind"].as_str()?.to_string()))
        }
        "resync" => Some(WatchEvent::Resync),
        "peer" => {
            let v: Value = serde_json::from_str(&data).ok()?;
            Some(WatchEvent::Peer(v["blob"].as_str()?.to_string()))
        }
        _ => None,
    }
}

/// What `send_tagged` learned besides the body.
struct Tagged {
    tag: Option<String>,
    not_modified: bool,
}

pub fn proof_for(fingerprint: &str) -> String {
    format!("vfm-key:{}", fingerprint.replace(' ', ""))
}

impl ShareState {
    pub fn new(data_dir: &std::path::Path, user_agent: String) -> Self {
        let http = reqwest::Client::builder()
            .user_agent(user_agent)
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .expect("http client");
        ShareState {
            dir: data_dir.join("share"),
            http,
            lock: Mutex::new(()),
            name: std::sync::Mutex::new(String::new()),
            inbox_cache: Default::default(),
            hidden_cache: Default::default(),
        }
    }

    fn read<T: for<'de> Deserialize<'de> + Default>(&self, name: &str) -> T {
        std::fs::read(self.dir.join(name))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default()
    }

    fn write<T: Serialize>(&self, name: &str, v: &T) -> Result<(), String> {
        write_private(
            &self.dir.join(name),
            &serde_json::to_vec_pretty(v).map_err(|e| e.to_string())?,
        )
    }

    /// This device's keys for `user`, made on first use.
    pub async fn identity(&self, user: &str) -> Result<Identity, String> {
        let _g = self.lock.lock().await;
        let mut ids: Identities = self.read("identity.json");
        if let Some(id) = ids
            .keys
            .get(user)
            .and_then(|s| Identity::from_secret_string(s))
        {
            return Ok(id);
        }
        let id = Identity::generate();
        ids.keys.insert(user.to_string(), id.to_secret_string());
        self.write("identity.json", &ids)?;
        Ok(id)
    }

    pub async fn my_identity(&self, user: &str) -> Result<MyIdentity, String> {
        let id = self.identity(user).await?;
        let fp = id.fingerprint();
        Ok(MyIdentity {
            user_id: user.into(),
            proof: proof_for(&fp),
            fingerprint: fp,
        })
    }

    pub async fn export_key(&self, user: &str) -> Result<String, String> {
        let id = self.identity(user).await?;
        Ok(format!("vfmkey1:{user}:{}", id.to_secret_string()))
    }

    /// Use the same keys as another device (copied from "Copy key").
    pub async fn import_key(&self, user: &str, text: &str) -> Result<MyIdentity, String> {
        let text = text.trim();
        let rest = text
            .strip_prefix("vfmkey1:")
            .ok_or("that isn't a VRC Friend Map key")?;
        let (owner, secret) = rest.split_once(':').ok_or("the key is incomplete")?;
        if owner != user {
            return Err("that key belongs to a different VRChat account".into());
        }
        let id =
            Identity::from_secret_string(secret).ok_or("the key is damaged (copy all of it)")?;
        {
            let _g = self.lock.lock().await;
            let mut ids: Identities = self.read("identity.json");
            ids.keys.insert(user.to_string(), id.to_secret_string());
            self.write("identity.json", &ids)?;
        }
        self.my_identity(user).await
    }

    async fn send(
        &self,
        url: &str,
        method: reqwest::Method,
        path: &str,
        body: Option<Vec<u8>>,
        signer: Option<(&Identity, &str)>,
    ) -> Result<Value, String> {
        self.send_tagged(url, method, path, body, signer, None)
            .await
            .map(|(v, _)| v)
    }

    /// `send` with an ETag: given `if_none_match`, a "not modified" answer comes
    /// back as `Ok((Value::Null, tag))` with `not_modified` meaning the caller
    /// keeps what it has. Returns the server's ETag, if any.
    async fn send_tagged(
        &self,
        url: &str,
        method: reqwest::Method,
        path: &str,
        body: Option<Vec<u8>>,
        signer: Option<(&Identity, &str)>,
        if_none_match: Option<&str>,
    ) -> Result<(Value, Tagged), String> {
        let full = format!("{url}{path}");
        let mut req = self
            .http
            .request(method.clone(), &full)
            .header("accept", "application/json");
        if let Some(tag) = if_none_match {
            req = req.header("if-none-match", tag);
        }
        let body = body.unwrap_or_default();
        if let Some((id, user)) = signer {
            req = req.header(
                "authorization",
                auth::sign_request(id, user, method.as_str(), path, &body, now()),
            );
            let name: String = self
                .name
                .lock()
                .map(|n| {
                    n.chars()
                        .filter(|c| c.is_ascii_graphic() || *c == ' ')
                        .take(40)
                        .collect()
                })
                .unwrap_or_default();
            if !name.is_empty() {
                req = req.header("x-vrc-name", name);
            }
        }
        if !body.is_empty() {
            req = req.header("content-type", "application/json").body(body);
        }
        let res = req.send().await.map_err(|e| {
            if e.is_connect() || e.is_timeout() {
                "can't reach the server (is it running, and is the address right?)".to_string()
            } else {
                e.to_string()
            }
        })?;
        let status = res.status();
        let tag = res
            .headers()
            .get("etag")
            .and_then(|v| v.to_str().ok())
            .map(str::to_string);
        if status == reqwest::StatusCode::NOT_MODIFIED && if_none_match.is_some() {
            return Ok((Value::Null, Tagged { tag, not_modified: true }));
        }
        let v: Value = res.json().await.unwrap_or(Value::Null);
        if !status.is_success() {
            if v.get("banned").and_then(Value::as_bool) == Some(true) {
                let reason = v
                    .get("reason")
                    .and_then(Value::as_str)
                    .filter(|r| !r.is_empty())
                    .map(|r| format!(" Reason: {r}."))
                    .unwrap_or_default();
                let appeal = v
                    .get("appeal")
                    .and_then(Value::as_str)
                    .filter(|r| !r.is_empty())
                    .map(|r| format!(" To appeal: {r}."))
                    .unwrap_or_default();
                return Err(format!("You're banned from this server.{reason}{appeal}"));
            }
            let msg = v
                .get("error")
                .and_then(Value::as_str)
                .map(str::to_string)
                .unwrap_or_else(|| format!("server answered {status}"));
            return Err(msg);
        }
        Ok((v, Tagged { tag, not_modified: false }))
    }

    /// Small signed calls the UI makes directly: the shared cache, the logger's
    /// heartbeat (hand-off) and push targets.
    pub async fn call(
        &self,
        url: &str,
        user: &str,
        method: &str,
        path: &str,
        body: Option<Value>,
    ) -> Result<Value, String> {
        const ALLOWED: &[&str] = &["/v1/cache/", "/v1/logger/heartbeat", "/v1/logger/push"];
        if !ALLOWED.iter().any(|p| path.starts_with(p)) || path.contains("..") || path.contains('?')
        {
            return Err("not allowed".into());
        }
        let url = normalize_url(url)?;
        let id = self.identity(user).await?;
        let method = reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?;
        let body = body.map(|b| serde_json::to_vec(&b).unwrap_or_default());
        self.send(&url, method, path, body, Some((&id, user))).await
    }

    pub async fn info(&self, raw_url: &str) -> Result<InfoResult, String> {
        let url = normalize_url(raw_url)?;
        let v = self
            .send(&url, reqwest::Method::GET, "/v1/info", None, None)
            .await?;
        let info: ServerInfo = serde_json::from_value(v).map_err(|_| {
            "that address isn't a vfm-server (or it's a newer version this app doesn't know)"
                .to_string()
        })?;
        if info.protocol != vfm_share::PROTOCOL {
            return Err(format!(
                "this server speaks protocol {}, the app speaks {} – update the {}",
                info.protocol,
                vfm_share::PROTOCOL,
                if info.protocol > vfm_share::PROTOCOL {
                    "app"
                } else {
                    "server"
                }
            ));
        }
        let _g = self.lock.lock().await;
        let mut pins: Pins = self.read("pins.json");
        let keys = (info.sign_pk.clone(), info.box_pk.clone());
        let key_changed = match pins.servers.get(&url) {
            Some(old) => *old != keys,
            None => {
                pins.servers.insert(url.clone(), keys);
                self.write("pins.json", &pins)?;
                false
            }
        };
        Ok(InfoResult {
            url,
            info,
            key_changed,
        })
    }

    /// Accept a server's new keys (after it was reinstalled, say).
    pub async fn trust_server(&self, url: &str) -> Result<(), String> {
        let url = normalize_url(url)?;
        let v = self
            .send(&url, reqwest::Method::GET, "/v1/info", None, None)
            .await?;
        let info: ServerInfo = serde_json::from_value(v).map_err(|e| e.to_string())?;
        let _g = self.lock.lock().await;
        let mut pins: Pins = self.read("pins.json");
        pins.servers.insert(url, (info.sign_pk, info.box_pk));
        self.write("pins.json", &pins)
    }

    async fn server_keys(&self, url: &str) -> Result<([u8; 32], [u8; 32]), String> {
        let r = self.info(url).await?;
        if r.key_changed {
            return Err("this server's key changed since you added it. If you reinstalled it, confirm the new key in Settings → Servers.".into());
        }
        let s = vfm_share::b64_decode(&r.info.sign_pk)
            .and_then(|b| b.try_into().ok())
            .ok_or("server key damaged")?;
        let b = vfm_share::b64_decode(&r.info.box_pk)
            .and_then(|b| b.try_into().ok())
            .ok_or("server key damaged")?;
        Ok((s, b))
    }

    pub async fn register(
        &self,
        url: &str,
        user: &str,
        invite: Option<String>,
    ) -> Result<Value, String> {
        let url = normalize_url(url)?;
        let id = self.identity(user).await?;
        let body = serde_json::to_vec(&json!({ "identity": id.public(user), "invite": invite.filter(|s| !s.trim().is_empty()) })).unwrap();
        self.send(
            &url,
            reqwest::Method::POST,
            "/v1/register",
            Some(body),
            Some((&id, user)),
        )
        .await
    }

    pub async fn me(&self, url: &str, user: &str) -> Result<Value, String> {
        let url = normalize_url(url)?;
        let id = self.identity(user).await?;
        self.send(
            &url,
            reqwest::Method::GET,
            "/v1/me",
            None,
            Some((&id, user)),
        )
        .await
    }

    pub async fn leave(&self, url: &str, user: &str) -> Result<Value, String> {
        let url = normalize_url(url)?;
        let id = self.identity(user).await?;
        self.send(
            &url,
            reqwest::Method::DELETE,
            "/v1/me",
            None,
            Some((&id, user)),
        )
        .await
    }

    /// Check identities a server reports against the pins. Returns the ones
    /// that can be used; remembers new ones and notes changed ones.
    async fn check_pins(
        &self,
        url: &str,
        cards: Vec<PublicIdentity>,
    ) -> Result<(BTreeMap<String, PublicIdentity>, Vec<String>), String> {
        let _g = self.lock.lock().await;
        let mut pins: Pins = self.read("pins.json");
        let mut ok = BTreeMap::new();
        let mut changed = Vec::new();
        let mut dirty = false;
        for card in cards {
            if !card.verify() {
                continue;
            }
            match pins.users.get_mut(&card.user_id) {
                Some(p) if p.sign_pk == card.sign_pk && p.box_pk == card.box_pk => {
                    if !p.servers.iter().any(|s| s == url) {
                        p.servers.push(url.to_string());
                        dirty = true;
                    }
                    if p.offered.is_some() {
                        p.offered = None;
                        dirty = true;
                    }
                    ok.insert(card.user_id.clone(), card);
                }
                Some(p) => {
                    if p.offered.as_ref() != Some(&card) {
                        p.offered = Some(card.clone());
                        dirty = true;
                    }
                    changed.push(card.user_id.clone());
                }
                None => {
                    pins.users.insert(
                        card.user_id.clone(),
                        Pin {
                            sign_pk: card.sign_pk.clone(),
                            box_pk: card.box_pk.clone(),
                            fingerprint: card.fingerprint(),
                            first_seen: now(),
                            servers: vec![url.to_string()],
                            offered: None,
                        },
                    );
                    dirty = true;
                    ok.insert(card.user_id.clone(), card);
                }
            }
        }
        if dirty {
            self.write("pins.json", &pins)?;
        }
        Ok((ok, changed))
    }

    pub async fn pins(&self) -> Value {
        let pins: Pins = self.read("pins.json");
        serde_json::to_value(&pins.users).unwrap_or(Value::Null)
    }

    /// Accept the new key a server offered for `user` (they reinstalled or
    /// got a new device), or forget them so the next key is pinned.
    pub async fn trust_key(&self, user: &str) -> Result<(), String> {
        let _g = self.lock.lock().await;
        let mut pins: Pins = self.read("pins.json");
        let Some(p) = pins.users.get_mut(user) else {
            return Ok(());
        };
        if let Some(card) = p.offered.take() {
            *p = Pin {
                sign_pk: card.sign_pk.clone(),
                box_pk: card.box_pk.clone(),
                fingerprint: card.fingerprint(),
                first_seen: now(),
                servers: vec![],
                offered: None,
            };
        }
        self.write("pins.json", &pins)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn publish(
        &self,
        url: &str,
        user: &str,
        kind: &str,
        payload: &str,
        recipients: Vec<String>,
        encrypt: bool,
        hidden: bool,
        lookup: Vec<String>,
    ) -> Result<PublishResult, String> {
        let url = normalize_url(url)?;
        if !vfm_share::KINDS.contains(&kind) {
            return Err("unknown kind".into());
        }
        let id = self.identity(user).await?;
        // Your own devices' data goes to nobody else, and never unencrypted.
        let self_item = kind == vfm_share::KIND_SELF;
        if self_item && !encrypt {
            return Err("syncing your devices needs end-to-end encryption on this server".into());
        }
        let recipients = if self_item { Vec::new() } else { recipients };
        let mut wanted: Vec<String> = recipients
            .into_iter()
            .filter(|r| vfm_share::valid_user_id(r) && r != user)
            .collect();
        wanted.sort();
        wanted.dedup();
        // Hidden recipients: look up a wider set (`lookup`, e.g. all friends) so
        // the lookup doesn't give away who it's for either.
        let hidden = hidden && encrypt && !self_item;
        let mut ask = wanted.clone();
        if hidden {
            ask.extend(lookup.into_iter().filter(|r| vfm_share::valid_user_id(r) && r != user));
            ask.sort();
            ask.dedup();
        }
        // Who is on this server, with which key.
        let mut cards = Vec::new();
        for chunk in ask.chunks(150) {
            let path = format!("/v1/users?ids={}", chunk.join(","));
            let v = self
                .send(&url, reqwest::Method::GET, &path, None, Some((&id, user)))
                .await?;
            if let Some(list) = v.get("users") {
                cards.extend(
                    serde_json::from_value::<Vec<PublicIdentity>>(list.clone()).unwrap_or_default(),
                );
            }
        }
        let (mut ok, mut key_changed) = self.check_pins(&url, cards).await?;
        ok.retain(|k, _| wanted.binary_search(k).is_ok());
        key_changed.retain(|k| wanted.binary_search(k).is_ok());
        let not_on_server: Vec<String> = wanted
            .iter()
            .filter(|w| !ok.contains_key(*w) && !key_changed.contains(w))
            .cloned()
            .collect();
        let created = now();
        let env = if encrypt {
            let mut rs: Vec<Recipient> = ok
                .values()
                .filter_map(|c| {
                    Some(Recipient {
                        user_id: c.user_id.clone(),
                        box_pk: c.box_key()?,
                    })
                })
                .collect();
            // Yourself too, so your other devices (same key) can read it back.
            rs.push(Recipient {
                user_id: user.to_string(),
                box_pk: id.box_pk(),
            });
            if hidden {
                Envelope::sealed_hidden(&id, user, kind, created, payload.as_bytes(), &rs)
            } else {
                Envelope::sealed(&id, user, kind, created, payload.as_bytes(), &rs)
            }
        } else {
            // Readable anyway, so address everyone asked for: people who join
            // later can fetch it right away. Changed keys are still left out.
            let mut rs: Vec<String> = wanted
                .iter()
                .filter(|w| !key_changed.contains(w))
                .cloned()
                .collect();
            rs.push(user.to_string());
            Envelope::plain(&id, user, kind, created, payload.as_bytes(), &rs)
        };
        // A hidden item lists only you; count whom it was sealed for instead.
        let recipients = if hidden {
            ok.values().filter(|c| c.box_key().is_some()).count()
        } else {
            env.recipients.len().saturating_sub(1)
        };
        let body = serde_json::to_vec(&env).unwrap();
        self.send(
            &url,
            reqwest::Method::PUT,
            &format!("/v1/items/{kind}"),
            Some(body),
            Some((&id, user)),
        )
        .await?;
        Ok(PublishResult {
            sealed: encrypt,
            recipients,
            not_on_server: if encrypt { not_on_server } else { vec![] },
            key_changed,
        })
    }

    pub async fn unpublish(&self, url: &str, user: &str, kind: &str) -> Result<Value, String> {
        let url = normalize_url(url)?;
        let id = self.identity(user).await?;
        self.send(
            &url,
            reqwest::Method::DELETE,
            &format!("/v1/items/{kind}"),
            None,
            Some((&id, user)),
        )
        .await
    }

    /// Friends' hidden-recipient items, merged into the cache. First asks which
    /// hidden items exist, then fetches only your friends' (`friends`) new ones,
    /// so the server isn't told your whole friend list. Errors (an older
    /// server) leave what's cached.
    async fn hidden_items(&self, url: &str, user: &str, id: &Identity, friends: Vec<String>) -> (Vec<Envelope>, Vec<PublicIdentity>) {
        let key = format!("{url}|{user}");
        let (mut items, mut cards) = self.hidden_cache.lock().ok().and_then(|c| c.get(&key).cloned()).unwrap_or_default();
        let done = |items: BTreeMap<String, Envelope>, cards: BTreeMap<String, PublicIdentity>| {
            if let Ok(mut c) = self.hidden_cache.lock() {
                c.insert(key.clone(), (items.clone(), cards.clone()));
            }
            (items.into_values().collect(), cards.into_values().collect())
        };
        let friends: std::collections::HashSet<String> = friends.into_iter().filter(|o| o != user).collect();
        let Ok(list) = self.send(url, reqwest::Method::POST, "/v1/hidden", Some(b"{}".to_vec()), Some((id, user))).await else {
            return done(items, cards);
        };
        // Which of your friends' hidden items exist now, and which are new to you.
        let mut exists = std::collections::HashSet::new();
        let mut fetch = std::collections::BTreeSet::new();
        for c in list.get("current").and_then(Value::as_array).into_iter().flatten() {
            let (Some(o), Some(k), Some(t)) = (c["owner"].as_str(), c["kind"].as_str(), c["created"].as_i64()) else { continue };
            if !friends.contains(o) {
                continue;
            }
            let ok = format!("{o}|{k}");
            if items.get(&ok).map(|e| e.created) != Some(t) {
                fetch.insert(o.to_string());
            }
            exists.insert(ok);
        }
        items.retain(|k, _| exists.contains(k));
        cards.retain(|o, _| items.values().any(|e| &e.owner == o));
        if fetch.is_empty() {
            return done(items, cards);
        }
        let have: BTreeMap<&String, i64> = items.iter().map(|(k, e)| (k, e.created)).collect();
        let owners: Vec<String> = fetch.into_iter().collect();
        let body = serde_json::to_vec(&json!({ "owners": owners, "have": have })).unwrap_or_default();
        if let Ok(v) = self.send(url, reqwest::Method::POST, "/v1/hidden", Some(body), Some((id, user))).await {
            let got: Vec<Envelope> = serde_json::from_value(v.get("items").cloned().unwrap_or(Value::Null)).unwrap_or_default();
            for env in got.into_iter().filter(|e| e.hidden() && owners.contains(&e.owner)) {
                items.insert(format!("{}|{}", env.owner, env.kind), env);
            }
            let ids: BTreeMap<String, PublicIdentity> =
                serde_json::from_value(v.get("identities").cloned().unwrap_or(Value::Null)).unwrap_or_default();
            cards.extend(ids.into_iter().filter(|(o, _)| owners.contains(o)));
        }
        done(items, cards)
    }

    pub async fn inbox(&self, url: &str, user: &str, owners: Vec<String>) -> Result<Vec<InboxItem>, String> {
        let url = normalize_url(url)?;
        let id = self.identity(user).await?;
        let key = format!("{url}|{user}");
        let cached = self.inbox_cache.lock().ok().and_then(|c| c.get(&key).cloned());
        let (fresh, tagged) = self
            .send_tagged(
                &url,
                reqwest::Method::GET,
                "/v1/inbox",
                None,
                Some((&id, user)),
                cached.as_ref().map(|(t, _)| t.as_str()),
            )
            .await?;
        let v = match (tagged.not_modified, cached) {
            (true, Some((_, v))) => v,
            _ => {
                if let (Some(tag), Ok(mut c)) = (tagged.tag, self.inbox_cache.lock()) {
                    c.insert(key, (tag, fresh.clone()));
                }
                fresh
            }
        };
        let mut items: Vec<Envelope> =
            serde_json::from_value(v.get("items").cloned().unwrap_or(Value::Null))
                .unwrap_or_default();
        let cards: BTreeMap<String, PublicIdentity> =
            serde_json::from_value(v.get("identities").cloned().unwrap_or(Value::Null))
                .unwrap_or_default();
        let mut cards: Vec<PublicIdentity> = cards.into_values().collect();
        if !owners.is_empty() {
            let (hidden, more) = self.hidden_items(&url, user, &id, owners).await;
            items.extend(hidden);
            cards.extend(more);
        }
        let (ok, _changed) = self.check_pins(&url, cards).await?;
        let mut out = Vec::new();
        for env in items {
            let sealed = env.enc == vfm_share::Enc::Sealed;
            let base = |payload: Option<Value>, error: Option<String>, fp: String| InboxItem {
                owner: env.owner.clone(),
                kind: env.kind.clone(),
                created: env.created,
                sealed,
                fingerprint: fp,
                payload,
                error,
            };
            // Your own items are checked against your own key.
            let card_key = if env.owner == user {
                Some((id.sign_pk(), id.fingerprint()))
            } else {
                ok.get(&env.owner)
                    .and_then(|c| Some((c.sign_key()?, c.fingerprint())))
            };
            let Some((pk, fp)) = card_key else {
                out.push(base(
                    None,
                    Some("their key changed; confirm it before using what they share".into()),
                    String::new(),
                ));
                continue;
            };
            match env.open(user, &id, &pk) {
                // A friend's hidden item sealed for others, not you: not yours to see.
                Err(vfm_share::OpenError::NotForYou) if env.hidden() && env.owner != user => {}
                Ok(bytes) => match serde_json::from_slice::<Value>(&bytes) {
                    Ok(p) => out.push(base(Some(p), None, fp)),
                    Err(_) => out.push(base(None, Some("not valid data".into()), fp)),
                },
                Err(e) => out.push(base(None, Some(e.to_string()), fp)),
            }
        }
        Ok(out)
    }

    // ---------- your own devices ----------

    /// A message for your other devices: signed with your key and sealed to it,
    /// so only devices holding your key can read it (not the server, not your network).
    pub async fn seal_for_devices(&self, user: &str, payload: &str) -> Result<String, String> {
        let id = self.identity(user).await?;
        let me = Recipient { user_id: user.to_string(), box_pk: id.box_pk() };
        let env = Envelope::sealed(&id, user, vfm_share::KIND_SELF, now(), payload.as_bytes(), &[me]);
        serde_json::to_string(&env).map_err(|e| e.to_string())
    }

    /// Open a message from one of your devices. Older than 15 minutes (a replay): refused.
    pub async fn open_from_devices(&self, user: &str, blob: &str) -> Result<Value, String> {
        let id = self.identity(user).await?;
        let env: Envelope = serde_json::from_str(blob).map_err(|_| "not a device message".to_string())?;
        if env.owner != user || env.kind != vfm_share::KIND_SELF || env.enc != vfm_share::Enc::Sealed {
            return Err("not from your devices".into());
        }
        if (now() - env.created).abs() > 15 * 60 {
            return Err("too old".into());
        }
        let bytes = env.open(user, &id, &id.sign_pk()).map_err(|e| e.to_string())?;
        serde_json::from_slice(&bytes).map_err(|e| e.to_string())
    }

    /// Pass a sealed message to your other devices through a server, live.
    pub async fn relay_to_devices(&self, url: &str, user: &str, blob: String) -> Result<Value, String> {
        let url = normalize_url(url)?;
        let id = self.identity(user).await?;
        let body = serde_json::to_vec(&json!({ "blob": blob })).map_err(|e| e.to_string())?;
        self.send(&url, reqwest::Method::POST, "/v1/devices/signal", Some(body), Some((&id, user))).await
    }

    // ---------- live changes ----------

    /// Keep `/v1/events` open and call `on` for each thing it says, until the
    /// connection ends (Ok) or can't be made (Err). Quiet for 70 seconds
    /// (the server pings every 25): treated as ended.
    pub async fn watch(&self, url: &str, user: &str, mut on: impl FnMut(WatchEvent)) -> Result<(), String> {
        let url = normalize_url(url)?;
        let id = self.identity(user).await?;
        let path = "/v1/events";
        let res = self
            .http
            .get(format!("{url}{path}"))
            .header("accept", "text/event-stream")
            .header("authorization", auth::sign_request(&id, user, "GET", path, b"", now()))
            // The client's 30 s limit is for single calls; this one stays open.
            .timeout(Duration::from_secs(24 * 3600))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if res.status() == reqwest::StatusCode::NOT_FOUND {
            return Err("this server can't send live changes (older vfm-server)".into());
        }
        if !res.status().is_success() {
            return Err(format!("server answered {}", res.status()));
        }
        let mut res = res;
        let mut buf = String::new();
        loop {
            let chunk = match tokio::time::timeout(Duration::from_secs(70), res.chunk()).await {
                Ok(Ok(Some(c))) => c,
                Ok(Ok(None)) | Err(_) => return Ok(()),
                Ok(Err(e)) => return Err(e.to_string()),
            };
            buf.push_str(&String::from_utf8_lossy(&chunk));
            if buf.len() > 1 << 20 {
                return Err("live changes: answer too long".into());
            }
            while let Some(end) = buf.find("\n\n") {
                let block: String = buf.drain(..end + 2).collect();
                if let Some(ev) = parse_event(&block) {
                    on(ev);
                }
            }
        }
    }

    // ---------- logger ----------

    pub async fn logger_pair(
        &self,
        url: &str,
        user: &str,
        code: &str,
        auth_cookie: &str,
        two_factor: Option<String>,
    ) -> Result<Value, String> {
        let url = normalize_url(url)?;
        let (_, box_pk) = self.server_keys(&url).await?;
        let id = self.identity(user).await?;
        let session =
            serde_json::to_vec(&json!({ "auth": auth_cookie, "twoFactorAuth": two_factor }))
                .unwrap();
        let sealed = vfm_share::seal_box(&box_pk, &session, &format!("vfm1-logger-session/{user}"));
        let body = serde_json::to_vec(&json!({ "code": code.trim(), "session": sealed })).unwrap();
        self.send(
            &url,
            reqwest::Method::POST,
            "/v1/logger/pair",
            Some(body),
            Some((&id, user)),
        )
        .await
    }

    pub async fn logger_unpair(
        &self,
        url: &str,
        user: &str,
        forget: bool,
    ) -> Result<Value, String> {
        let url = normalize_url(url)?;
        let id = self.identity(user).await?;
        let path = if forget {
            "/v1/logger/pair?forget=1"
        } else {
            "/v1/logger/pair"
        };
        self.send(&url, reqwest::Method::DELETE, path, None, Some((&id, user)))
            .await
    }

    pub async fn logger_status(&self, url: &str, user: &str) -> Result<Value, String> {
        let url = normalize_url(url)?;
        let id = self.identity(user).await?;
        self.send(
            &url,
            reqwest::Method::GET,
            "/v1/logger/status",
            None,
            Some((&id, user)),
        )
        .await
    }

    /// Who was online when, and when the logger watched (`from`/`to` unix seconds), checked
    /// against the server's pinned key.
    pub async fn logger_presence(&self, url: &str, user: &str, from: i64, to: i64) -> Result<Value, String> {
        let url = normalize_url(url)?;
        let (sign_pk, _) = self.server_keys(&url).await?;
        let id = self.identity(user).await?;
        let path = format!("/v1/logger/presence?from={from}&to={to}");
        let v = self.send(&url, reqwest::Method::GET, &path, None, Some((&id, user))).await?;
        let env: Envelope = serde_json::from_value(v).map_err(|e| e.to_string())?;
        let bytes = env.open(user, &id, &sign_pk).map_err(|e| e.to_string())?;
        serde_json::from_slice(&bytes).map_err(|e| e.to_string())
    }

    /// The logger's totals, checked against the server's pinned key.
    pub async fn logger_stats(&self, url: &str, user: &str) -> Result<Value, String> {
        let url = normalize_url(url)?;
        let (sign_pk, _) = self.server_keys(&url).await?;
        let id = self.identity(user).await?;
        let v = self
            .send(
                &url,
                reqwest::Method::GET,
                "/v1/logger/stats",
                None,
                Some((&id, user)),
            )
            .await?;
        let env: Envelope = serde_json::from_value(v).map_err(|e| e.to_string())?;
        let bytes = env.open(user, &id, &sign_pk).map_err(|e| e.to_string())?;
        serde_json::from_slice(&bytes).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urls() {
        assert_eq!(
            normalize_url("pi.local:8787").unwrap(),
            "http://pi.local:8787"
        );
        assert_eq!(
            normalize_url("192.168.1.20:8787/").unwrap(),
            "http://192.168.1.20:8787"
        );
        assert_eq!(
            normalize_url("raspberrypi:8787").unwrap(),
            "http://raspberrypi:8787"
        );
        assert_eq!(
            normalize_url("vfm.example.com").unwrap(),
            "https://vfm.example.com"
        );
        assert_eq!(
            normalize_url("https://vfm.example.com/sub/").unwrap(),
            "https://vfm.example.com/sub"
        );
        assert!(normalize_url("ftp://x").is_err());
        assert!(normalize_url("  ").is_err());
    }

    #[test]
    fn proof_format() {
        assert_eq!(
            proof_for("a1b2 c3d4 e5f6 0718 293a"),
            "vfm-key:a1b2c3d4e5f60718293a"
        );
    }
}

/// End to end against a running vfm-server:
/// `VFM_TEST_SERVER=http://127.0.0.1:8799 VFM_TEST_TOKEN=… VFM_TEST_DATA=… cargo test e2e -- --ignored`
/// (registration must be "open").
#[cfg(test)]
mod e2e {
    use super::*;

    fn admin(url: &str, token: &str, body: Value) {
        assert!(
            adminapi::settings(url, token, body),
            "admin settings change failed"
        );
    }

    mod adminapi {
        pub fn settings(url: &str, token: &str, body: serde_json::Value) -> bool {
            tauri::async_runtime::block_on(async {
                ::reqwest::Client::new()
                    .post(format!("{url}/admin/api/settings"))
                    .header("x-admin-token", token)
                    .json(&body)
                    .send()
                    .await
                    .map(|r| r.status().is_success())
                    .unwrap_or(false)
            })
        }
        pub fn remove_user(url: &str, token: &str, id: &str) -> bool {
            tauri::async_runtime::block_on(async {
                ::reqwest::Client::new()
                    .delete(format!("{url}/admin/api/users/{id}"))
                    .header("x-admin-token", token)
                    .send()
                    .await
                    .map(|r| r.status().is_success())
                    .unwrap_or(false)
            })
        }
    }

    fn rt<F: std::future::Future>(f: F) -> F::Output {
        tauri::async_runtime::block_on(f)
    }

    fn device(name: &str) -> ShareState {
        let d = std::env::temp_dir().join(format!("vfm-e2e-{name}-{}", rand::random::<u32>()));
        ShareState::new(&d, "vfm-e2e".into())
    }

    #[test]
    #[ignore]
    fn sharing_end_to_end() {
        let (Ok(url), Ok(token), Ok(data)) = (
            std::env::var("VFM_TEST_SERVER"),
            std::env::var("VFM_TEST_TOKEN"),
            std::env::var("VFM_TEST_DATA"),
        ) else {
            panic!("set VFM_TEST_SERVER, VFM_TEST_TOKEN, VFM_TEST_DATA");
        };
        let (a, b, c) = (
            "usr_aaaaaaaa-0000-4000-8000-000000000001",
            "usr_bbbbbbbb-0000-4000-8000-000000000002",
            "usr_cccccccc-0000-4000-8000-000000000003",
        );
        let alice = device("alice");
        let bob = device("bob");
        let carol = device("carol");
        admin(
            &url,
            &token,
            json!({ "encryption": "recommended", "registration": "open" }),
        );

        let info = rt(alice.info(&url)).unwrap();
        assert_eq!(
            info.info.encryption,
            vfm_share::EncryptionPolicy::Recommended
        );
        assert!(!info.key_changed);
        assert_eq!(
            rt(alice.register(&url, a, None)).unwrap()["existing"],
            false
        );
        assert_eq!(rt(alice.register(&url, a, None)).unwrap()["existing"], true);
        rt(bob.register(&url, b, None)).unwrap();

        // Sealed: only Bob (on the server) gets a key; Carol isn't there yet.
        let secret = r#"{"marker":"SECRET-FRIEND-LIST-4711"}"#;
        let r =
            rt(alice.publish(&url, a, "friends", secret, vec![b.into(), c.into()], true, false, vec![])).unwrap();
        assert!(r.sealed);
        assert_eq!(r.recipients, 1);
        assert_eq!(r.not_on_server, vec![c.to_string()]);
        let inbox = rt(bob.inbox(&url, b, vec![])).unwrap();
        let item = inbox
            .iter()
            .find(|i| i.owner == a)
            .expect("bob sees alice's list");
        assert!(item.sealed && item.error.is_none());
        assert_eq!(
            item.payload.as_ref().unwrap()["marker"],
            "SECRET-FRIEND-LIST-4711"
        );

        // The server's files don't contain it.
        let stored = std::fs::read_to_string(format!("{data}/items/{a}/friends.json")).unwrap();
        assert!(!stored.contains("SECRET-FRIEND-LIST"));
        assert!(!stored.contains(&vfm_share::b64_encode(secret.as_bytes())[..20]));

        // Carol joins: nothing for her until Alice shares again.
        rt(carol.register(&url, c, None)).unwrap();
        assert!(rt(carol.inbox(&url, c, vec![]))
            .unwrap()
            .iter()
            .all(|i| i.owner != a));
        let r =
            rt(alice.publish(&url, a, "friends", secret, vec![b.into(), c.into()], true, false, vec![])).unwrap();
        assert_eq!(r.recipients, 2);
        assert!(rt(carol.inbox(&url, c, vec![]))
            .unwrap()
            .iter()
            .any(|i| i.owner == a && i.payload.is_some()));

        // Readable upload: server can read it, still signed.
        let r = rt(bob.publish(
            &url,
            b,
            "activity",
            r#"{"pairs":[]}"#,
            vec![a.into()],
            false,
            false,
            vec![],
        ))
        .unwrap();
        assert!(!r.sealed);
        let stored = std::fs::read_to_string(format!("{data}/items/{b}/activity.json")).unwrap();
        assert!(stored.contains(&vfm_share::b64_encode(br#"{"pairs":[]}"#)));
        assert!(rt(alice.inbox(&url, a, vec![]))
            .unwrap()
            .iter()
            .any(|i| i.owner == b && !i.sealed && i.payload.is_some()));
        assert!(
            rt(carol.inbox(&url, c, vec![]))
                .unwrap()
                .iter()
                .all(|i| i.owner != b),
            "carol wasn't a recipient"
        );

        // Server policies are enforced.
        admin(&url, &token, json!({ "encryption": "force-on" }));
        let e = rt(alice.publish(&url, a, "activity", "{}", vec![b.into()], false, false, vec![])).unwrap_err();
        assert!(e.contains("force-on"), "{e}");
        admin(&url, &token, json!({ "encryption": "force-off" }));
        let e = rt(alice.publish(&url, a, "activity", "{}", vec![b.into()], true, false, vec![])).unwrap_err();
        assert!(e.contains("force-off"), "{e}");
        admin(&url, &token, json!({ "encryption": "recommended" }));

        // Bob reinstalls: new key, can't take over his account...
        let bob2 = device("bob2");
        let e = rt(bob2.register(&url, b, None)).unwrap_err();
        assert!(e.contains("different key"), "{e}");
        // ...until the owner removes the old one. Alice's app then notices the
        // changed key and leaves Bob out until she confirms it.
        assert!(adminapi::remove_user(&url, &token, b));
        rt(bob2.register(&url, b, None)).unwrap();
        let r =
            rt(alice.publish(&url, a, "friends", secret, vec![b.into(), c.into()], true, false, vec![])).unwrap();
        assert_eq!(r.key_changed, vec![b.to_string()]);
        assert_eq!(r.recipients, 1);
        assert!(rt(bob2.inbox(&url, b, vec![]))
            .unwrap()
            .iter()
            .all(|i| i.owner != a || i.payload.is_none()));
        rt(alice.trust_key(b)).unwrap();
        let r =
            rt(alice.publish(&url, a, "friends", secret, vec![b.into(), c.into()], true, false, vec![])).unwrap();
        assert_eq!(r.recipients, 2);
        assert!(rt(bob2.inbox(&url, b, vec![]))
            .unwrap()
            .iter()
            .any(|i| i.owner == a && i.payload.is_some()));

        // Copying the key to a second device works for reading.
        let alice_phone = device("alice-phone");
        rt(alice_phone.import_key(a, &rt(alice.export_key(a)).unwrap())).unwrap();
        assert!(rt(alice_phone.inbox(&url, a, vec![]))
            .unwrap()
            .iter()
            .any(|i| i.owner == a && i.payload.is_some()));
        assert!(rt(alice_phone.import_key(b, &rt(alice.export_key(a)).unwrap())).is_err());

        // Logger isn't paired: only owner calls, which fail cleanly.
        assert!(rt(alice.logger_status(&url, a))
            .unwrap_err()
            .contains("isn't paired"));
        let e = rt(alice.logger_pair(&url, a, "000000", "authcookie_fake", None)).unwrap_err();
        assert!(e.contains("pairing code"), "{e}");

        // Nothing changed: the inbox comes back from the cache (304), same as before.
        let before = rt(bob2.inbox(&url, b, vec![])).unwrap().len();
        assert_eq!(rt(bob2.inbox(&url, b, vec![])).unwrap().len(), before);

        // Hidden recipients: the stored item names nobody but the owner, the
        // lookup is wider than the audience, and only Bob can read it.
        let hidden = r#"{"marker":"HIDDEN-FRIEND-LIST-0815"}"#;
        let r = rt(alice.publish(&url, a, "friends", hidden, vec![b.into()], true, true, vec![b.into(), c.into()])).unwrap();
        assert!(r.sealed);
        assert_eq!(r.recipients, 1);
        let stored = std::fs::read_to_string(format!("{data}/items/{a}/friends.json")).unwrap();
        assert!(!stored.contains(b) && !stored.contains(c) && !stored.contains("HIDDEN-FRIEND"));
        let got = rt(bob2.inbox(&url, b, vec![a.into()])).unwrap();
        assert!(got.iter().any(|i| i.owner == a && i.kind == "friends" && i.payload.as_ref().map(|p| p["marker"] == "HIDDEN-FRIEND-LIST-0815").unwrap_or(false)));
        // Fetched again: served from the cache, still there.
        assert!(rt(bob2.inbox(&url, b, vec![a.into()])).unwrap().iter().any(|i| i.owner == a && i.kind == "friends"));
        // Carol asks for it too: she gets nothing (and no error) for it.
        assert!(rt(carol.inbox(&url, c, vec![a.into()])).unwrap().iter().all(|i| !(i.owner == a && i.kind == "friends")));
        // Without asking by owner it isn't in Bob's inbox at all.
        assert!(rt(bob2.inbox(&url, b, vec![])).unwrap().iter().all(|i| !(i.owner == a && i.kind == "friends")));

        // Live changes: Bob's app keeps the stream open and hears of Alice's upload.
        let (tx, rx) = std::sync::mpsc::channel();
        let url2 = url.clone();
        std::thread::spawn(move || {
            let _ = rt(bob2.watch(&url2, b, |ev| {
                let _ = tx.send(ev);
            }));
        });
        let wait = std::time::Duration::from_secs(10);
        assert_eq!(rx.recv_timeout(wait).unwrap(), WatchEvent::Open);
        rt(alice.publish(&url, a, "activity", r#"{"pairs":[]}"#, vec![b.into()], true, false, vec![])).unwrap();
        assert_eq!(rx.recv_timeout(wait).unwrap(), WatchEvent::Change(a.into(), "activity".into()));
        // Carol isn't a recipient of that one; a hidden upload reaches everyone's stream.
        rt(alice.publish(&url, a, "friends", hidden, vec![b.into()], true, true, vec![b.into()])).unwrap();
        assert_eq!(rx.recv_timeout(wait).unwrap(), WatchEvent::Change(a.into(), "friends".into()));

        // Your own devices: a sealed message relayed live, readable only with your key.
        let (ptx, prx) = std::sync::mpsc::channel();
        let url3 = url.clone();
        let alice_phone = std::sync::Arc::new(alice_phone);
        let phone = alice_phone.clone();
        std::thread::spawn(move || {
            let _ = rt(phone.watch(&url3, a, |ev| {
                if let WatchEvent::Peer(blob) = ev {
                    let _ = ptx.send(blob);
                }
            }));
        });
        std::thread::sleep(std::time::Duration::from_millis(500));
        let blob = rt(alice.seal_for_devices(a, r#"{"type":"hello","from":"pc"}"#)).unwrap();
        assert!(!blob.contains("hello"));
        assert!(rt(carol.open_from_devices(c, &blob)).is_err());
        rt(alice.relay_to_devices(&url, a, blob)).unwrap();
        let got = rt(alice_phone.open_from_devices(a, &prx.recv_timeout(wait).unwrap())).unwrap();
        assert_eq!(got["type"], "hello");

        // Leaving removes everything.
        rt(alice.unpublish(&url, a, "friends")).unwrap();
        assert!(rt(carol.inbox(&url, c, vec![]))
            .unwrap()
            .iter()
            .all(|i| i.owner != a));
        rt(alice.leave(&url, a)).unwrap();
        assert!(rt(alice.me(&url, a)).is_err());
    }
}

#[cfg(test)]
mod watch_tests {
    use super::{parse_event, WatchEvent};

    #[test]
    fn server_sent_events() {
        assert_eq!(parse_event(": open\n\n"), Some(WatchEvent::Open));
        assert_eq!(parse_event(": ping\n\n"), None);
        assert_eq!(
            parse_event("event: change\ndata: {\"owner\":\"usr_a\",\"kind\":\"friends\"}\n\n"),
            Some(WatchEvent::Change("usr_a".into(), "friends".into()))
        );
        assert_eq!(parse_event("event: resync\ndata: {}\n\n"), Some(WatchEvent::Resync));
        assert_eq!(parse_event("event: change\ndata: nope\n\n"), None);
        assert_eq!(parse_event("event: peer\ndata: {\"blob\":\"x\"}\n\n"), Some(WatchEvent::Peer("x".into())));
    }
}
