//! Built-in admin page (`/admin`). Nothing extra runs: it's one HTML page
//! served by the server itself, opened in any browser when you need it.
//! Needs the admin token from vfm-server.toml and, by default, a home
//! network address.

use axum::body::Bytes;
use axum::extract::{ConnectInfo, Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use vfm_share::{EncryptionPolicy, Registration};

use crate::api::App;
use crate::config::AdminAllow;
use crate::logger::tokens_equal;
use crate::store::{new_invite, read_json, Invites};

pub fn router() -> Router<Arc<App>> {
    Router::new()
        .route("/admin", get(page))
        .route("/admin/api/status", get(status))
        .route("/admin/api/settings", post(settings))
        .route("/admin/api/invites", post(create_invite))
        .route("/admin/api/invites/{code}", delete(delete_invite))
        .route("/admin/api/users/{id}", delete(delete_user))
        .route("/admin/api/pair-code", post(pair_code))
        .route("/admin/api/logger/unpair", post(unpair))
}

pub fn lan(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => {
            let o = v.octets();
            v.is_loopback() || v.is_private() || v.is_link_local() || (o[0] == 100 && (64..128).contains(&o[1]))
        }
        IpAddr::V6(v) => {
            if let Some(v4) = v.to_ipv4_mapped() {
                return lan(IpAddr::V4(v4));
            }
            let s = v.segments();
            v.is_loopback() || (s[0] & 0xfe00) == 0xfc00 || (s[0] & 0xffc0) == 0xfe80
        }
    }
}

fn allowed_from(app: &App, addr: &SocketAddr) -> Result<(), Response> {
    let allow = app.cfg().admin.allow;
    let ip = addr.ip();
    let ok = match allow {
        AdminAllow::Off => false,
        AdminAllow::Local => ip.is_loopback() || matches!(ip, IpAddr::V6(v) if v.to_ipv4_mapped().map(|x| x.is_loopback()).unwrap_or(false)),
        AdminAllow::Lan => lan(ip),
        AdminAllow::Any => true,
    };
    if ok {
        Ok(())
    } else {
        Err((StatusCode::FORBIDDEN, "The admin page isn't available from this address (see [admin] allow in vfm-server.toml).").into_response())
    }
}

fn check(app: &App, addr: &SocketAddr, headers: &HeaderMap) -> Result<(), Response> {
    allowed_from(app, addr)?;
    let token = headers.get("x-admin-token").and_then(|v| v.to_str().ok()).unwrap_or("");
    let want = app.cfg().admin.token;
    if want.len() >= 16 && tokens_equal(token.as_bytes(), want.as_bytes()) {
        Ok(())
    } else {
        Err((StatusCode::UNAUTHORIZED, Json(json!({ "error": "wrong admin token" }))).into_response())
    }
}

async fn page(State(app): State<Arc<App>>, ConnectInfo(addr): ConnectInfo<SocketAddr>) -> Response {
    if let Err(r) = allowed_from(&app, &addr) {
        return r;
    }
    let mut res = Html(PAGE).into_response();
    res.headers_mut().insert("content-security-policy", "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'".parse().unwrap());
    res.headers_mut().insert("x-frame-options", "DENY".parse().unwrap());
    res
}

async fn status(State(app): State<Arc<App>>, ConnectInfo(addr): ConnectInfo<SocketAddr>, headers: HeaderMap) -> Response {
    if let Err(r) = check(&app, &addr, &headers) {
        return r;
    }
    let cfg = app.cfg();
    let store = app.store.lock().unwrap();
    let (users, items, sealed) = store.stats();
    let list: Vec<Value> = store
        .users
        .users
        .values()
        .map(|u| {
            let mine: Vec<Value> = store
                .items
                .values()
                .filter(|m| m.owner == u.identity.user_id)
                .map(|m| json!({ "kind": m.kind, "sealed": m.sealed, "recipients": m.recipients.len(), "bytes": m.bytes, "created": m.created }))
                .collect();
            json!({ "id": u.identity.user_id, "fingerprint": u.identity.fingerprint(), "registered": u.registered, "lastSeen": u.last_seen, "invite": u.invite, "items": mine })
        })
        .collect();
    let invites: Invites = read_json(&store.invites_path());
    drop(store);
    Json(json!({
        "info": app.info(),
        "settings": {
            "name": cfg.server.name, "motd": cfg.server.motd,
            "registration": cfg.access.registration, "encryption": cfg.access.encryption,
            "maxItemKb": cfg.access.max_item_kb, "maxUsers": cfg.access.max_users,
            "loggerEnabled": cfg.logger.enabled, "listen": cfg.server.listen,
        },
        "counts": { "users": users, "items": items, "sealed": sealed },
        "users": list,
        "invites": invites.codes,
        "logger": app.logger.status(),
        "envLocked": app.env_locked,
    }))
    .into_response()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SettingsBody {
    name: Option<String>,
    motd: Option<String>,
    registration: Option<Registration>,
    encryption: Option<EncryptionPolicy>,
    max_item_kb: Option<usize>,
    max_users: Option<usize>,
    logger_enabled: Option<bool>,
}

async fn settings(State(app): State<Arc<App>>, ConnectInfo(addr): ConnectInfo<SocketAddr>, headers: HeaderMap, body: Bytes) -> Response {
    if let Err(r) = check(&app, &addr, &headers) {
        return r;
    }
    let mut b: SettingsBody = match serde_json::from_slice(&body) {
        Ok(b) => b,
        Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({ "error": e.to_string() }))).into_response(),
    };
    // Settings fixed by VFM_* variables stay as the environment says.
    let locked = |k: &str| app.env_locked.iter().any(|e| e == k);
    if locked("VFM_NAME") { b.name = None; }
    if locked("VFM_MOTD") { b.motd = None; }
    if locked("VFM_REGISTRATION") { b.registration = None; }
    if locked("VFM_ENCRYPTION") { b.encryption = None; }
    if locked("VFM_MAX_ITEM_KB") { b.max_item_kb = None; }
    if locked("VFM_MAX_USERS") { b.max_users = None; }
    if locked("VFM_LOGGER") { b.logger_enabled = None; }
    let (was_enabled, now_enabled) = {
        let mut c = app.cfg.write().unwrap();
        let was = c.logger.enabled;
        if let Some(v) = b.name {
            c.server.name = v.chars().take(80).collect();
        }
        if let Some(v) = b.motd {
            c.server.motd = v.chars().take(500).collect();
        }
        if let Some(v) = b.registration {
            c.access.registration = v;
        }
        if let Some(v) = b.encryption {
            c.access.encryption = v;
        }
        if let Some(v) = b.max_item_kb {
            c.access.max_item_kb = v.clamp(16, 16 * 1024);
        }
        if let Some(v) = b.max_users {
            c.access.max_users = v.clamp(1, 100_000);
        }
        if let Some(v) = b.logger_enabled {
            c.logger.enabled = v;
        }
        if let Err(e) = c.save(&app.cfg_path) {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response();
        }
        (was, c.logger.enabled)
    };
    if was_enabled && !now_enabled {
        app.logger.stop();
    } else if !was_enabled && now_enabled && app.logger.has_session() {
        app.logger.start();
    }
    Json(json!({ "ok": true })).into_response()
}

#[derive(Deserialize)]
struct InviteBody {
    #[serde(default = "one")]
    uses: u32,
    #[serde(default)]
    days: u32,
    #[serde(default)]
    note: String,
}

fn one() -> u32 {
    1
}

async fn create_invite(State(app): State<Arc<App>>, ConnectInfo(addr): ConnectInfo<SocketAddr>, headers: HeaderMap, body: Bytes) -> Response {
    if let Err(r) = check(&app, &addr, &headers) {
        return r;
    }
    let b: InviteBody = serde_json::from_slice(&body).unwrap_or(InviteBody { uses: 1, days: 7, note: String::new() });
    let dir = app.store.lock().unwrap().dir.clone();
    match new_invite(&dir, b.uses.min(1000), b.days.min(3650), &b.note.chars().take(80).collect::<String>()) {
        Ok(code) => Json(json!({ "code": code })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response(),
    }
}

async fn delete_invite(State(app): State<Arc<App>>, ConnectInfo(addr): ConnectInfo<SocketAddr>, headers: HeaderMap, Path(code): Path<String>) -> Response {
    if let Err(r) = check(&app, &addr, &headers) {
        return r;
    }
    let path = app.store.lock().unwrap().invites_path();
    let mut inv: Invites = read_json(&path);
    inv.codes.remove(&code);
    let _ = crate::store::write_json(&path, &inv, true);
    Json(json!({ "ok": true })).into_response()
}

async fn delete_user(State(app): State<Arc<App>>, ConnectInfo(addr): ConnectInfo<SocketAddr>, headers: HeaderMap, Path(id): Path<String>) -> Response {
    if let Err(r) = check(&app, &addr, &headers) {
        return r;
    }
    if app.logger.owner().as_deref() == Some(id.as_str()) {
        app.logger.unpair(false);
    }
    let removed = app.store.lock().unwrap().delete_user(&id);
    Json(json!({ "ok": true, "removed": removed })).into_response()
}

async fn pair_code(State(app): State<Arc<App>>, ConnectInfo(addr): ConnectInfo<SocketAddr>, headers: HeaderMap) -> Response {
    if let Err(r) = check(&app, &addr, &headers) {
        return r;
    }
    Json(json!({ "code": app.logger.new_pair_code(), "minutes": 15 })).into_response()
}

async fn unpair(State(app): State<Arc<App>>, ConnectInfo(addr): ConnectInfo<SocketAddr>, headers: HeaderMap, body: Bytes) -> Response {
    if let Err(r) = check(&app, &addr, &headers) {
        return r;
    }
    let forget = serde_json::from_slice::<Value>(&body).ok().and_then(|v| v.get("forget").and_then(Value::as_bool)).unwrap_or(false);
    app.logger.unpair(forget);
    Json(json!({ "ok": true })).into_response()
}

const PAGE: &str = include_str!("admin.html");
