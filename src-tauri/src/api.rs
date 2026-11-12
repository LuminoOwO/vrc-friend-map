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
const ALLOWED_GET_PREFIXES: [&str; 7] = [
    "/auth/user",
    "/users/",
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
        Self { contact: String::new(), interval_ms: 1200 }
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
            session_path,
        })
    }

    pub async fn set_settings(&self, s: ApiSettings) {
        let mut s = s;
        // Never go faster than one request per second, whatever the UI asks.
        s.interval_ms = s.interval_ms.clamp(1000, 10_000);
        s.contact = s.contact.chars().filter(|c| !c.is_control()).take(120).collect();
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
            None => SessionInfo { logged_in: false, user_id: None, display_name: None },
        }
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
        let ua = self.user_agent().await;
        for base in API_BASES {
            self.acquire_slot().await;
            let res = self
                .http
                .get(format!("{base}/auth/user"))
                .header(reqwest::header::USER_AGENT, &ua)
                .header(reqwest::header::COOKIE, Self::cookie_header(auth, two_factor))
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
                self.save_session(&session).await?;
                *self.session.write().await = Some(session);
                self.note_success().await;
                return Ok(Some(self.session_info().await));
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
        let session = self.session.read().await.clone().ok_or("not logged in")?;
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
        Ok(ApiResponse { status, data, retry_after })
    }

    /// The only calls that change anything on VRChat: send or cancel one
    /// friend request for one person. The UI calls this only from a button
    /// press, and there's a short cooldown so a double click can't repeat it.
    pub async fn friend_request(&self, user_id: &str, cancel: bool) -> Result<ApiResponse, String> {
        if !valid_user_id(user_id) {
            return Err("invalid user".into());
        }
        {
            let mut last = self.last_write.lock().await;
            if let Some(t) = *last {
                if t.elapsed() < Duration::from_secs(3) {
                    return Err("wait a moment before trying again".into());
                }
            }
            *last = Some(Instant::now());
        }
        let method = if cancel { reqwest::Method::DELETE } else { reqwest::Method::POST };
        self.send(method, &format!("/user/{user_id}/friendRequest")).await
    }

    /// Friend status: isFriend, outgoingRequest, incomingRequest.
    pub async fn friend_status(&self, user_id: &str) -> Result<ApiResponse, String> {
        if !valid_user_id(user_id) {
            return Err("invalid user".into());
        }
        self.send(reqwest::Method::GET, &format!("/user/{user_id}/friendStatus")).await
    }

    async fn send(&self, method: reqwest::Method, path: &str) -> Result<ApiResponse, String> {
        let session = self.session.read().await.clone().ok_or("not logged in")?;
        self.acquire_slot().await;
        let ua = self.user_agent().await;
        let res = self
            .http
            .request(method, format!("{}{}", session.base, path))
            .header(reqwest::header::USER_AGENT, ua)
            .header(reqwest::header::COOKIE, Self::cookie_header(&session.auth, session.two_factor.as_deref()))
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
        Ok(ApiResponse { status, data, retry_after })
    }

    /// Invalidate the session on VRChat's side (best effort).
    pub async fn server_logout(&self) {
        let Some(session) = self.session.read().await.clone() else { return };
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
        let _permit = self.image_slots.acquire().await.map_err(|e| e.to_string())?;
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
        let mut req = self.http.get(url.as_str()).header(reqwest::header::USER_AGENT, ua);
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
pub fn valid_user_id(id: &str) -> bool {
    id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        && ((id.starts_with("usr_") && (8..=64).contains(&id.len())) || (id.len() == 10 && !id.contains(['_', '-'])))
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
    fn friend_request_ids_cant_change_the_path() {
        assert!(valid_user_id("usr_c1644b5b-3ca4-45b4-97c6-a2a0de70d469"));
        assert!(valid_user_id("8JoV9XEdpo"));
        for bad in ["usr_../../auth", "usr_a/b", "usr_a?x=1", "usr_", "", "grp_abcdefgh", "usr_a b"] {
            assert!(!valid_user_id(bad), "{bad}");
        }
    }
}
