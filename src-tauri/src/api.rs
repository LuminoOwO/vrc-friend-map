//! VRChat API client. The session cookie lives only here, on the Rust side;
//! the UI can ask for data but never sees the token.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tokio::sync::{Mutex, RwLock, Semaphore};

pub const APP_NAME: &str = "VRCFriendMap";
pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Base URLs that accept the website's `auth` cookie. The first one that
/// validates during login is remembered in the session.
pub const API_BASES: [&str; 2] = ["https://api.vrchat.cloud/api/1", "https://vrchat.com/api/1"];

/// Only read-only endpoints the app actually needs are reachable from the UI.
const ALLOWED_GET_PREFIXES: [&str; 16] = [
    "/auth/user",
    "/users/",
    // friend status, sent friend requests
    "/user/",
    // invite message slots (templates)
    "/message/",
    // VRChat's own notes on people
    "/userNotes",
    // group events
    "/calendar",
    // prints, stickers, emojis, avatar files
    "/prints",
    "/files",
    "/file/",
    "/avatars",
    // Bio, links, badges and languages (VRChat moved them here in 2026), and your own profile for editing.
    "/profile/",
    "/favorites",
    "/favorite/groups",
    "/worlds/",
    "/groups/",
    "/instances/",
];

#[derive(Clone, Serialize, Deserialize)]
pub struct Session {
    pub auth: String,
    #[serde(default)]
    pub two_factor: Option<String>,
    pub user_id: String,
    pub display_name: String,
    pub base: String,
}

#[derive(Clone, Serialize)]
pub struct SessionInfo {
    pub logged_in: bool,
    pub user_id: Option<String>,
    pub display_name: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ApiSettings {
    /// Contact info for the User-Agent, as VRChat's guidelines ask for.
    pub contact: String,
    /// Minimum spacing between API requests.
    pub interval_ms: u64,
}

impl Default for ApiSettings {
    fn default() -> Self {
        Self {
            contact: String::new(),
            interval_ms: 1200,
        }
    }
}

#[derive(Serialize)]
pub struct ApiResponse {
    pub status: u16,
    pub data: Value,
    /// Seconds the UI should wait before trying again (set on 429).
    pub retry_after: Option<u64>,
}

struct Limiter {
    next_slot: Instant,
    backoff_until: Option<Instant>,
    backoff_secs: u64,
}

pub struct ApiClient {
    http: reqwest::Client,
    session: RwLock<Option<Session>>,
    settings: RwLock<ApiSettings>,
    limiter: Mutex<Limiter>,
    image_limiter: Mutex<Instant>,
    /// Last friend request (send or cancel), for the cooldown.
    last_write: Mutex<Option<Instant>>,
    pub image_slots: Semaphore,
    session_path: PathBuf,
    /// Your other VRChat accounts (user ID -> session), kept on this device.
    extra: RwLock<std::collections::BTreeMap<String, Session>>,
    extra_path: PathBuf,
}

tokio::task_local! {
    /// Which of your accounts a call runs as (None: the main one). Set with `as_account`.
    static ACT_AS: Option<String>;
}

/// Run `f` as one of your extra accounts (or the main one for None / its own ID).
pub async fn as_account<F: std::future::Future>(account: Option<String>, f: F) -> F::Output {
    ACT_AS.scope(account, f).await
}

/// One of your accounts, for the app.
#[derive(Serialize, Clone)]
pub struct AccountInfo {
    pub id: String,
    pub name: String,
}

impl ApiClient {
    pub fn new(data_dir: PathBuf) -> Result<Self, String> {
        let http = reqwest::Client::builder()
            .gzip(true)
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| e.to_string())?;
        let session_path = data_dir.join("session.json");
        let session = std::fs::read_to_string(&session_path)
            .ok()
            .and_then(|s| serde_json::from_str::<Session>(&s).ok());
        Ok(Self {
            http,
            session: RwLock::new(session),
            settings: RwLock::new(ApiSettings::default()),
            limiter: Mutex::new(Limiter {
                next_slot: Instant::now(),
                backoff_until: None,
                backoff_secs: 0,
            }),
            image_limiter: Mutex::new(Instant::now()),
            last_write: Mutex::new(None),
            image_slots: Semaphore::new(4),
            extra: RwLock::new(
                std::fs::read_to_string(data_dir.join("accounts.json"))
                    .ok()
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or_default(),
            ),
            extra_path: data_dir.join("accounts.json"),
            session_path,
        })
    }

    pub async fn set_settings(&self, s: ApiSettings) {
        let mut s = s;
        // Never go faster than one request per second, whatever the UI asks.
        s.interval_ms = s.interval_ms.clamp(1000, 10_000);
        s.contact = s
            .contact
            .chars()
            .filter(|c| !c.is_control())
            .take(120)
            .collect();
        *self.settings.write().await = s;
    }

    pub async fn user_agent(&self) -> String {
        let contact = self.settings.read().await.contact.trim().to_string();
        if contact.is_empty() {
            format!("{APP_NAME}/{APP_VERSION} (personal friend graph tool)")
        } else {
            format!("{APP_NAME}/{APP_VERSION} {contact}")
        }
    }

    pub async fn session_info(&self) -> SessionInfo {
        match &*self.session.read().await {
            Some(s) => SessionInfo {
                logged_in: true,
                user_id: Some(s.user_id.clone()),
                display_name: Some(s.display_name.clone()),
            },
            None => SessionInfo {
                logged_in: false,
                user_id: None,
                display_name: None,
            },
        }
    }

    /// The session calls run with right now: the main one, or an extra account
    /// inside `as_account`.
    async fn current_session(&self) -> Option<Session> {
        let who = ACT_AS.try_with(|a| a.clone()).ok().flatten();
        let main = self.session.read().await.clone();
        match who {
            Some(id) if main.as_ref().map(|m| m.user_id != id).unwrap_or(true) => self.extra.read().await.get(&id).cloned(),
            _ => main,
        }
    }

    /// Your extra accounts.
    pub async fn accounts(&self) -> Vec<AccountInfo> {
        self.extra.read().await.values().map(|s| AccountInfo { id: s.user_id.clone(), name: s.display_name.clone() }).collect()
    }

    /// The session token of an extra account, for its own live connection.
    pub async fn account_token(&self, id: &str) -> Option<String> {
        self.extra.read().await.get(id).map(|s| s.auth.clone())
    }

    async fn save_extra(&self) -> Result<(), String> {
        let json = serde_json::to_string(&*self.extra.read().await).map_err(|e| e.to_string())?;
        crate::storage::write_private(&self.extra_path, json.as_bytes())
    }

    pub async fn remove_account(&self, id: &str) -> Result<(), String> {
        self.extra.write().await.remove(id);
        self.save_extra().await
    }

    /// Check a login from the extra-account window and keep it. Not your main
    /// account, and not one you already added (that one is refreshed).
    pub async fn validate_extra(&self, auth: &str, two_factor: Option<&str>) -> Result<Option<AccountInfo>, String> {
        let Some(session) = self.check_login(auth, two_factor).await? else { return Ok(None) };
        if self.session.read().await.as_ref().map(|m| m.user_id == session.user_id).unwrap_or(false) {
            return Err("That's your main account. On the VRChat page, log out first, then log in with the other account.".into());
        }
        let info = AccountInfo { id: session.user_id.clone(), name: session.display_name.clone() };
        self.extra.write().await.insert(session.user_id.clone(), session);
        self.save_extra().await?;
        Ok(Some(info))
    }

    /// The whole session (cookies), for pairing a vfm-server logger.
    pub async fn session(&self) -> Option<Session> {
        self.session.read().await.clone()
    }

    /// The session token, for the live-updates connection.
    pub async fn auth_token(&self) -> Option<String> {
        self.session.read().await.as_ref().map(|s| s.auth.clone())
    }

    fn cookie_header(auth: &str, two_factor: Option<&str>) -> String {
        match two_factor {
            Some(tf) if !tf.is_empty() => format!("auth={auth}; twoFactorAuth={tf}"),
            _ => format!("auth={auth}"),
        }
    }

    async fn save_session(&self, s: &Session) -> Result<(), String> {
        let json = serde_json::to_string(s).map_err(|e| e.to_string())?;
        crate::storage::write_private(&self.session_path, json.as_bytes())
    }

    pub async fn clear_session(&self) {
        *self.session.write().await = None;
        let _ = std::fs::remove_file(&self.session_path);
    }

    /// Wait for a free request slot: global spacing plus jitter, and any 429 backoff.
    async fn acquire_slot(&self) {
        let interval = self.settings.read().await.interval_ms;
        let wait = {
            let mut l = self.limiter.lock().await;
            let now = Instant::now();
            let mut start = l.next_slot.max(now);
            if let Some(until) = l.backoff_until {
                if until > start {
                    start = until;
                }
            }
            let jitter = rand::random::<u64>() % 400;
            l.next_slot = start + Duration::from_millis(interval + jitter);
            start.saturating_duration_since(now)
        };
        if !wait.is_zero() {
            tokio::time::sleep(wait).await;
        }
    }

    async fn note_rate_limited(&self, retry_after: Option<u64>) -> u64 {
        let mut l = self.limiter.lock().await;
        let secs = retry_after.unwrap_or_else(|| {
            if l.backoff_secs == 0 {
                30
            } else {
                (l.backoff_secs * 2).min(600)
            }
        });
        l.backoff_secs = secs;
        l.backoff_until = Some(Instant::now() + Duration::from_secs(secs));
        secs
    }

    async fn note_success(&self) {
        let mut l = self.limiter.lock().await;
        l.backoff_secs = 0;
        l.backoff_until = None;
    }

    /// Check a cookie pair captured from the login page. Returns the session
    /// when the account is fully logged in, `None` while 2FA is still pending.
    pub async fn validate_and_store(
        &self,
        auth: &str,
        two_factor: Option<&str>,
    ) -> Result<Option<SessionInfo>, String> {
        let Some(session) = self.check_login(auth, two_factor).await? else { return Ok(None) };
        self.save_session(&session).await?;
        *self.session.write().await = Some(session);
        Ok(Some(self.session_info().await))
    }

    /// Ask VRChat who these cookies belong to (None: not logged in yet / 2FA pending).
    async fn check_login(&self, auth: &str, two_factor: Option<&str>) -> Result<Option<Session>, String> {
        let ua = self.user_agent().await;
        for base in API_BASES {
            self.acquire_slot().await;
            let res = self
                .http
                .get(format!("{base}/auth/user"))
                .header(reqwest::header::USER_AGENT, &ua)
                .header(
                    reqwest::header::COOKIE,
                    Self::cookie_header(auth, two_factor),
                )
                .header(reqwest::header::ACCEPT, "application/json")
                .send()
                .await
                .map_err(|e| e.to_string())?;
            let status = res.status().as_u16();
            if status == 429 {
                let secs = self.note_rate_limited(retry_after_secs(&res)).await;
                return Err(format!("Rate limited by VRChat, retrying in {secs}s"));
            }
            if status == 401 {
                continue;
            }
            let body: Value = res.json().await.unwrap_or(Value::Null);
            if body.get("requiresTwoFactorAuth").is_some() {
                return Ok(None);
            }
            let id = body.get("id").and_then(Value::as_str);
            let name = body.get("displayName").and_then(Value::as_str);
            if let (Some(id), Some(name)) = (id, name) {
                let session = Session {
                    auth: auth.to_string(),
                    two_factor: two_factor.map(str::to_string),
                    user_id: id.to_string(),
                    display_name: name.to_string(),
                    base: base.to_string(),
                };
                self.note_success().await;
                return Ok(Some(session));
            }
        }
        Ok(None)
    }

    /// Read-only GET against an allow-listed endpoint.
    pub async fn get(&self, path: &str, query: &[(String, String)]) -> Result<ApiResponse, String> {
        if !path.starts_with('/') || path.contains("..") || path.contains("://") {
            return Err("invalid path".into());
        }
        if !ALLOWED_GET_PREFIXES.iter().any(|p| path.starts_with(p)) {
            return Err(format!("endpoint not allowed: {path}"));
        }
        let session = self.current_session().await.ok_or("not logged in")?;
        self.acquire_slot().await;
        let ua = self.user_agent().await;
        let res = self
            .http
            .get(format!("{}{}", session.base, path))
            .query(query)
            .header(reqwest::header::USER_AGENT, ua)
            .header(
                reqwest::header::COOKIE,
                Self::cookie_header(&session.auth, session.two_factor.as_deref()),
            )
            .header(reqwest::header::ACCEPT, "application/json")
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let status = res.status().as_u16();
        let mut retry_after = None;
        if status == 429 {
            retry_after = Some(self.note_rate_limited(retry_after_secs(&res)).await);
        } else if status < 500 {
            self.note_success().await;
        }
        let text = res.text().await.unwrap_or_default();
        let data = serde_json::from_str(&text).unwrap_or(Value::String(text));
        Ok(ApiResponse {
            status,
            data,
            retry_after,
        })
    }

    /// The only calls that change anything on VRChat: send or cancel one
    /// friend request for one person. The UI calls this only from a button
    /// press, and there's a short cooldown so a double click can't repeat it.
    pub async fn friend_request(&self, user_id: &str, cancel: bool) -> Result<ApiResponse, String> {
        if !valid_user_id(user_id) {
            return Err("invalid user".into());
        }
        self.write_cooldown().await?;
        let method = if cancel {
            reqwest::Method::DELETE
        } else {
            reqwest::Method::POST
        };
        self.send(method, &format!("/user/{user_id}/friendRequest"))
            .await
    }

    /// Changes to your account go out one at a time, at most one every 3 s,
    /// and only from a button click in the UI.
    async fn write_cooldown(&self) -> Result<(), String> {
        let mut last = self.last_write.lock().await;
        if let Some(t) = *last {
            if t.elapsed() < Duration::from_secs(3) {
                return Err("wait a moment before trying again".into());
            }
        }
        *last = Some(Instant::now());
        Ok(())
    }

    /// Remove someone from your friends.
    pub async fn unfriend(&self, user_id: &str) -> Result<ApiResponse, String> {
        if !valid_user_id(user_id) {
            return Err("invalid user".into());
        }
        self.write_cooldown().await?;
        self.send(
            reqwest::Method::DELETE,
            &format!("/auth/user/friends/{user_id}"),
        )
        .await
    }

    /// Block, mute, hide their avatar, ... (`undo` removes it again).
    pub async fn moderate(
        &self,
        user_id: &str,
        kind: &str,
        undo: bool,
    ) -> Result<ApiResponse, String> {
        if !valid_user_id(user_id) {
            return Err("invalid user".into());
        }
        if !MODERATIONS.contains(&kind) {
            return Err("unknown moderation".into());
        }
        self.write_cooldown().await?;
        let body = serde_json::json!({ "moderated": user_id, "type": kind });
        if undo {
            self.send_json(
                reqwest::Method::PUT,
                "/auth/user/unplayermoderate",
                Some(body),
            )
            .await
        } else {
            self.send_json(
                reqwest::Method::POST,
                "/auth/user/playermoderations",
                Some(body),
            )
            .await
        }
    }

    /// Save your own profile (a button click in Profile → Edit): status, status text and
    /// pronouns go to /users/{id}, bio, links, languages and the look to /profile/{id}
    /// (VRChat split them in 2026). Only these fields pass; one write cooldown for both.
    pub async fn update_profile(
        &self,
        user_id: &str,
        user: serde_json::Value,
        profile: serde_json::Value,
    ) -> Result<Vec<ApiResponse>, String> {
        const USER_FIELDS: &[&str] = &["status", "statusDescription", "pronouns"];
        const PROFILE_FIELDS: &[&str] = &[
            "bio",
            "bioLinks",
            "languages",
            "themeId",
            "backgroundType",
            "backgroundGradientTop",
            "backgroundGradientBottom",
            "bannerType",
            "bannerColor",
        ];
        if !valid_user_id(user_id) {
            return Err("invalid user".into());
        }
        let only =
            |v: serde_json::Value, keep: &[&str]| -> serde_json::Map<String, serde_json::Value> {
                match v {
                    serde_json::Value::Object(m) => m
                        .into_iter()
                        .filter(|(k, _)| keep.contains(&k.as_str()))
                        .collect(),
                    _ => serde_json::Map::new(),
                }
            };
        let user = only(user, USER_FIELDS);
        let profile = only(profile, PROFILE_FIELDS);
        if user.is_empty() && profile.is_empty() {
            return Ok(vec![]);
        }
        self.write_cooldown().await?;
        let mut out = vec![];
        if !user.is_empty() {
            out.push(
                self.send_json(
                    reqwest::Method::PUT,
                    &format!("/users/{user_id}"),
                    Some(serde_json::Value::Object(user)),
                )
                .await?,
            );
        }
        if !profile.is_empty() {
            out.push(
                self.send_json(
                    reqwest::Method::PUT,
                    &format!("/profile/{user_id}"),
                    Some(serde_json::Value::Object(profile)),
                )
                .await?,
            );
        }
        Ok(out)
    }

    /// One allow-listed write (see WRITES): only the listed body fields pass.
    /// Spaced like every request (acquire_slot); the UI queues writes and
    /// only makes them for something you did or switched on.
    pub async fn write(
        &self,
        method: &str,
        path: &str,
        body: Option<Value>,
    ) -> Result<ApiResponse, String> {
        let fields = write_rule(method, path)
            .ok_or_else(|| format!("write not allowed: {method} {path}"))?;
        let body = match body {
            Some(Value::Object(m)) if !fields.is_empty() => Some(Value::Object(
                m.into_iter()
                    .filter(|(k, _)| fields.contains(&k.as_str()))
                    .collect(),
            )),
            _ if fields.is_empty() => None,
            other => other.filter(|v| v.is_object()),
        };
        let method = reqwest::Method::from_bytes(method.to_ascii_uppercase().as_bytes())
            .map_err(|e| e.to_string())?;
        self.send_json(method, path, body).await
    }

    /// Upload an image file (prints, stickers, emojis, group icons/banners).
    /// `kind`: "print" goes to /prints, everything else to /file/image with
    /// the given tag. Only images up to 10 MB.
    pub async fn upload_image(
        &self,
        kind: &str,
        bytes: Vec<u8>,
        mime: &str,
        fields: Vec<(String, String)>,
    ) -> Result<ApiResponse, String> {
        const TAGS: &[&str] = &[
            "gallery",
            "icon",
            "emoji",
            "sticker",
            "print",
            "emojianimated",
        ];
        const FIELDS: &[&str] = &[
            "tag",
            "animationStyle",
            "maskTag",
            "frames",
            "framesOverTime",
            "timestamp",
            "note",
            "worldId",
            "worldName",
        ];
        if !TAGS.contains(&kind) {
            return Err("unknown upload kind".into());
        }
        if bytes.len() > 10 * 1024 * 1024 {
            return Err("image too big (max 10 MB)".into());
        }
        if !matches!(
            mime,
            "image/png" | "image/jpeg" | "image/gif" | "image/webp"
        ) {
            return Err("only PNG, JPEG, GIF or WebP".into());
        }
        let session = self.current_session().await.ok_or("not logged in")?;
        self.write_cooldown().await?;
        self.acquire_slot().await;
        let ua = self.user_agent().await;
        let ext = mime.trim_start_matches("image/");
        let part = reqwest::multipart::Part::bytes(bytes)
            .file_name(format!("image.{ext}"))
            .mime_str(mime)
            .map_err(|e| e.to_string())?;
        let mut form = reqwest::multipart::Form::new()
            .part(if kind == "print" { "image" } else { "file" }, part);
        for (k, v) in fields
            .into_iter()
            .filter(|(k, _)| FIELDS.contains(&k.as_str()))
        {
            form = form.text(k, v);
        }
        let path = if kind == "print" {
            "/prints"
        } else {
            "/file/image"
        };
        let res = self
            .http
            .post(format!("{}{}", session.base, path))
            .header(reqwest::header::USER_AGENT, ua)
            .header(
                reqwest::header::COOKIE,
                Self::cookie_header(&session.auth, session.two_factor.as_deref()),
            )
            .multipart(form)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let status = res.status().as_u16();
        let text = res.text().await.unwrap_or_default();
        let data = serde_json::from_str(&text).unwrap_or(Value::String(text));
        Ok(ApiResponse {
            status,
            data,
            retry_after: None,
        })
    }

    /// Friend status: isFriend, outgoingRequest, incomingRequest.
    pub async fn friend_status(&self, user_id: &str) -> Result<ApiResponse, String> {
        if !valid_user_id(user_id) {
            return Err("invalid user".into());
        }
        self.send(
            reqwest::Method::GET,
            &format!("/user/{user_id}/friendStatus"),
        )
        .await
    }

    async fn send(&self, method: reqwest::Method, path: &str) -> Result<ApiResponse, String> {
        self.send_json(method, path, None).await
    }

    async fn send_json(
        &self,
        method: reqwest::Method,
        path: &str,
        body: Option<Value>,
    ) -> Result<ApiResponse, String> {
        let session = self.current_session().await.ok_or("not logged in")?;
        self.acquire_slot().await;
        let ua = self.user_agent().await;
        let mut req = self
            .http
            .request(method, format!("{}{}", session.base, path))
            .header(reqwest::header::USER_AGENT, ua)
            .header(
                reqwest::header::COOKIE,
                Self::cookie_header(&session.auth, session.two_factor.as_deref()),
            )
            .header(reqwest::header::ACCEPT, "application/json");
        if let Some(b) = body {
            req = req.json(&b);
        }
        let res = req.send().await.map_err(|e| e.to_string())?;
        let status = res.status().as_u16();
        let mut retry_after = None;
        if status == 429 {
            retry_after = Some(self.note_rate_limited(retry_after_secs(&res)).await);
        } else if status < 500 {
            self.note_success().await;
        }
        let text = res.text().await.unwrap_or_default();
        let data = serde_json::from_str(&text).unwrap_or(Value::String(text));
        Ok(ApiResponse {
            status,
            data,
            retry_after,
        })
    }

    /// Invalidate the session on VRChat's side (best effort).
    pub async fn server_logout(&self) {
        let Some(session) = self.session.read().await.clone() else {
            return;
        };
        self.acquire_slot().await;
        let ua = self.user_agent().await;
        let _ = self
            .http
            .put(format!("{}/logout", session.base))
            .header(reqwest::header::USER_AGENT, ua)
            .header(
                reqwest::header::COOKIE,
                Self::cookie_header(&session.auth, session.two_factor.as_deref()),
            )
            .send()
            .await;
    }

    /// Fetch an image. The auth cookie is only attached for VRChat API hosts.
    pub async fn fetch_image(&self, url: &url::Url) -> Result<(Vec<u8>, String), String> {
        let _permit = self
            .image_slots
            .acquire()
            .await
            .map_err(|e| e.to_string())?;
        {
            let mut next = self.image_limiter.lock().await;
            let now = Instant::now();
            let start = (*next).max(now);
            *next = start + Duration::from_millis(300);
            let wait = start.saturating_duration_since(now);
            drop(next);
            if !wait.is_zero() {
                tokio::time::sleep(wait).await;
            }
        }
        let ua = self.user_agent().await;
        let mut req = self
            .http
            .get(url.as_str())
            .header(reqwest::header::USER_AGENT, ua);
        let host = url.host_str().unwrap_or_default();
        if host == "api.vrchat.cloud" || host == "vrchat.com" {
            if let Some(s) = self.session.read().await.clone() {
                req = req.header(
                    reqwest::header::COOKIE,
                    Self::cookie_header(&s.auth, s.two_factor.as_deref()),
                );
            }
        }
        let res = req.send().await.map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("image request failed: {}", res.status()));
        }
        let mut ct = res
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("image/png")
            .to_string();
        if !ct.starts_with("image/") {
            // Some file endpoints serve images as a generic binary type.
            if ct.contains("octet-stream") {
                ct = "image/png".into();
            } else {
                return Err("not an image".into());
            }
        }
        let bytes = res.bytes().await.map_err(|e| e.to_string())?;
        if bytes.len() > 15 * 1024 * 1024 {
            return Err("image too large".into());
        }
        Ok((bytes.to_vec(), ct))
    }
}

/// `usr_` + UUID-ish, or an old 10-character ID. Nothing that could change the path.
/// Player moderations the UI may set or remove (VRChat's names).
/// Writes the UI may make besides the dedicated commands above: method, path
/// pattern and the body fields that pass (everything else is dropped).
/// Placeholders: {usr} {grp} {not} {fvrt} {avtr} {wrld} {grol} {file} {prnt}
/// are VRChat IDs with that prefix, {n} a small number, {msg} an invite
/// message type, {word} a plain name, {id} any VRChat-style ID.
pub const WRITES: &[(&str, &str, &[&str])] = &[
    // notes on people (VRChat's own, shown in game)
    ("POST", "/userNotes", &["targetUserId", "note"]),
    // invites and invite requests, invite message templates
    (
        "POST",
        "/requestInvite/{usr}",
        &["messageSlot", "requestSlot"],
    ),
    ("POST", "/invite/{usr}", &["instanceId", "messageSlot"]),
    ("POST", "/invite/myself/to/{id}", &[]),
    ("PUT", "/message/{usr}/{msg}/{n}", &["message"]),
    // notifications (accept an invite or friend request, dismiss)
    ("PUT", "/auth/user/notifications/{not}/accept", &[]),
    ("PUT", "/auth/user/notifications/{not}/hide", &[]),
    ("PUT", "/auth/user/notifications/{not}/see", &[]),
    // favorites
    ("POST", "/favorites", &["type", "favoriteId", "tags"]),
    ("DELETE", "/favorites/{fvrt}", &[]),
    (
        "PUT",
        "/favorite/group/{word}/{word}/{usr}",
        &["displayName", "visibility", "tags"],
    ),
    // avatars
    ("PUT", "/avatars/{avtr}/select", &[]),
    // groups (as far as your roles allow; VRChat checks the rest)
    ("POST", "/groups/{grp}/join", &["confirmOverrideBlock"]),
    ("POST", "/groups/{grp}/leave", &[]),
    (
        "PUT",
        "/groups/{grp}",
        &[
            "name",
            "shortCode",
            "description",
            "joinState",
            "iconId",
            "bannerId",
            "languages",
            "links",
            "rules",
            "tags",
        ],
    ),
    (
        "PUT",
        "/groups/{grp}/members/{usr}",
        &["visibility", "isSubscribedToAnnouncements", "managerNotes"],
    ),
    ("DELETE", "/groups/{grp}/members/{usr}", &[]),
    ("PUT", "/groups/{grp}/members/{usr}/roles/{grol}", &[]),
    ("DELETE", "/groups/{grp}/members/{usr}/roles/{grol}", &[]),
    ("PUT", "/groups/{grp}/requests/{usr}", &["action", "block"]),
    (
        "POST",
        "/groups/{grp}/invites",
        &["userId", "confirmOverrideBlock"],
    ),
    ("DELETE", "/groups/{grp}/invites/{usr}", &[]),
    ("POST", "/groups/{grp}/bans", &["userId"]),
    ("DELETE", "/groups/{grp}/bans/{usr}", &[]),
    (
        "POST",
        "/groups/{grp}/posts",
        &[
            "title",
            "text",
            "imageId",
            "sendNotification",
            "roleIds",
            "visibility",
        ],
    ),
    ("DELETE", "/groups/{grp}/posts/{id}", &[]),
    ("DELETE", "/groups/{grp}/galleries/{id}/images/{id}", &[]),
    (
        "POST",
        "/instances",
        &[
            "worldId",
            "type",
            "region",
            "ownerId",
            "roleIds",
            "groupAccessType",
            "queueEnabled",
            "canRequestInvite",
            "hardClose",
            "inviteOnly",
            "ageGate",
            "displayName",
        ],
    ),
    // prints, stickers, emojis
    ("DELETE", "/prints/{prnt}", &[]),
    ("DELETE", "/file/{file}", &[]),
];

fn id_with(seg: &str, prefix: &str) -> bool {
    seg.len() > prefix.len()
        && seg.len() <= 64
        && seg.starts_with(prefix)
        && seg
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn seg_ok(pat: &str, seg: &str) -> bool {
    match pat {
        "{usr}" => valid_user_id(seg),
        "{grp}" => id_with(seg, "grp_"),
        "{not}" => id_with(seg, "not_") || id_with(seg, "frq_"),
        "{fvrt}" => id_with(seg, "fvrt_"),
        "{avtr}" => id_with(seg, "avtr_"),
        "{wrld}" => id_with(seg, "wrld_"),
        "{grol}" => id_with(seg, "grol_"),
        "{file}" => id_with(seg, "file_"),
        "{prnt}" => id_with(seg, "prnt_"),
        "{n}" => !seg.is_empty() && seg.len() <= 3 && seg.chars().all(|c| c.is_ascii_digit()),
        "{msg}" => matches!(seg, "message" | "response" | "request" | "requestResponse"),
        "{word}" => {
            !seg.is_empty()
                && seg.len() <= 64
                && seg
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        }
        "{id}" => {
            !seg.is_empty()
                && seg.len() <= 200
                && seg
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || "_-:~().".contains(c))
        }
        lit => lit == seg,
    }
}

/// The body fields allowed for this write, or None if the write isn't allowed.
pub fn write_rule(method: &str, path: &str) -> Option<&'static [&'static str]> {
    if path.contains("..") || path.contains("://") || path.contains('?') {
        return None;
    }
    let segs: Vec<&str> = path.split('/').collect();
    WRITES.iter().find_map(|(m, pat, fields)| {
        if !m.eq_ignore_ascii_case(method) {
            return None;
        }
        let ps: Vec<&str> = pat.split('/').collect();
        (ps.len() == segs.len() && ps.iter().zip(&segs).all(|(p, s)| seg_ok(p, s)))
            .then_some(*fields)
    })
}

pub const MODERATIONS: [&str; 5] = ["block", "mute", "muteChat", "hideAvatar", "showAvatar"];

pub fn valid_user_id(id: &str) -> bool {
    id.chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        && ((id.starts_with("usr_") && (8..=64).contains(&id.len()))
            || (id.len() == 10 && !id.contains(['_', '-'])))
}

fn retry_after_secs(res: &reqwest::Response) -> Option<u64> {
    res.headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.trim().parse::<u64>().ok())
        .map(|s| s.clamp(5, 3600))
}

#[cfg(test)]
mod write_tests {
    use super::valid_user_id;

    #[test]
    fn profile_endpoint_is_readable() {
        assert!(super::ALLOWED_GET_PREFIXES
            .iter()
            .any(|p| "/profile/usr_x".starts_with(p)));
    }

    #[test]
    fn writes_are_allow_listed() {
        let u = "usr_c1644b5b-3ca4-45b4-97c6-a2a0de70d469";
        assert_eq!(
            super::write_rule("POST", "/userNotes"),
            Some(&["targetUserId", "note"][..])
        );
        assert!(super::write_rule("POST", &format!("/requestInvite/{u}")).is_some());
        assert!(super::write_rule("PUT", &format!("/message/{u}/message/3")).is_some());
        assert!(super::write_rule("PUT", &format!("/message/{u}/evil/3")).is_none());
        assert!(super::write_rule("DELETE", &format!("/groups/grp_abc/members/{u}")).is_some());
        assert!(super::write_rule("DELETE", "/groups/grp_abc/members/usr_../x").is_none());
        assert!(super::write_rule("DELETE", &format!("/auth/user/friends/{u}")).is_none());
        assert!(super::write_rule("PUT", "/users/usr_x").is_none());
        assert!(super::write_rule("GET", "/userNotes").is_none());
        assert!(super::write_rule("POST", "/favorites?x=1").is_none());
    }

    #[test]
    fn friend_request_ids_cant_change_the_path() {
        assert!(valid_user_id("usr_c1644b5b-3ca4-45b4-97c6-a2a0de70d469"));
        assert!(valid_user_id("8JoV9XEdpo"));
        for bad in [
            "usr_../../auth",
            "usr_a/b",
            "usr_a?x=1",
            "usr_",
            "",
            "grp_abcdefgh",
            "usr_a b",
        ] {
            assert!(!valid_user_id(bad), "{bad}");
        }
    }
}
