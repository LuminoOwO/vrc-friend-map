//! HTTP API spoken by the app (`/v1/...`).

use axum::body::Bytes;
use axum::extract::{ConnectInfo, Path, Query, State};
use axum::http::{HeaderMap, Method, StatusCode, Uri};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};
use vfm_share::{auth, valid_user_id, Enc, Envelope, LoggerInfo, PublicIdentity, Registration, ServerInfo, KINDS, PROTOCOL};

use crate::config::Config;
use crate::logger::Logger;
use crate::store::{now, Store, UserRecord};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
const MAX_RECIPIENTS: usize = 5000;
/// Requests per user (or address, before sign-up) per 10 minutes.
const RATE_LIMIT: u32 = 600;
const REGISTER_LIMIT: u32 = 20;

pub struct App {
    pub cfg: RwLock<Config>,
    pub cfg_path: PathBuf,
    pub store: Mutex<Store>,
    pub logger: Arc<Logger>,
    /// Settings fixed by VFM_* variables (the admin page shows them locked).
    pub env_locked: Vec<String>,
    rate: Mutex<HashMap<String, (i64, u32)>>,
    pub admins: crate::admins::Admins,
    pub bans: crate::bans::Bans,
    pub cache: crate::cache::Cache,
    /// The newest vfm-server release, if checking is on.
    pub updates: crate::updates::Updates,
    /// Item changes and messages between someone's own devices, for the open
    /// event streams (`/v1/events`).
    pub changes: tokio::sync::broadcast::Sender<Signal>,
    streams: std::sync::atomic::AtomicUsize,
    /// Set when the server stops, so open event streams end (graceful shutdown waits for them).
    pub closing: tokio::sync::watch::Sender<bool>,
}

/// What the open event streams pass on.
#[derive(Clone, Debug)]
pub enum Signal {
    Change(Change),
    /// A sealed message from one of `user`'s devices to their others. Never stored.
    Peer { user: String, blob: Arc<String> },
}

/// Messages between your own devices up to this size always go through (devices
/// finding each other); bigger ones only with `[access] relay`.
const SMALL_SIGNAL: usize = 8 * 1024;
const MAX_SIGNAL: usize = 4 * 1024 * 1024;

/// An item was stored or removed.
#[derive(Clone, Debug)]
pub struct Change {
    pub owner: String,
    pub kind: String,
    /// Who could fetch it (before and after the change).
    pub recipients: Vec<String>,
    pub hidden: bool,
}

impl Change {
    /// Whether `user`'s app should hear of it: they can fetch it, or it's a
    /// hidden item (their app checks whether the owner is a friend).
    pub fn for_user(&self, user: &str) -> bool {
        self.hidden || self.recipients.iter().any(|r| r == user)
    }
}

const MAX_STREAMS: usize = 2000;

impl App {
    pub fn new(cfg: Config, cfg_path: PathBuf, store: Store, logger: Arc<Logger>, env_locked: Vec<String>) -> Arc<App> {
        let dir = store.dir.clone();
        logger.hand_off.store(cfg.logger.hand_off, std::sync::atomic::Ordering::SeqCst);
        Arc::new(App {
            cfg: RwLock::new(cfg),
            cfg_path,
            store: Mutex::new(store),
            logger,
            env_locked,
            rate: Mutex::new(HashMap::new()),
            admins: crate::admins::Admins::new(&dir),
            bans: crate::bans::Bans::new(&dir),
            cache: crate::cache::Cache::new(&dir),
            updates: Default::default(),
            changes: tokio::sync::broadcast::channel(64).0,
            streams: std::sync::atomic::AtomicUsize::new(0),
            closing: tokio::sync::watch::channel(false).0,
        })
    }

    /// The visitor's address: the connection's, or (with [server] trusted_proxy, from a
    /// proxy on this machine or network) the first X-Forwarded-For entry.
    pub fn client_ip(&self, peer: std::net::IpAddr, headers: &HeaderMap) -> std::net::IpAddr {
        if self.cfg().server.trusted_proxy && crate::admin::lan(peer) {
            if let Some(ip) = headers
                .get("x-forwarded-for")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.split(',').next())
                .and_then(|v| v.trim().parse().ok())
            {
                return ip;
            }
        }
        peer
    }

    /// 403 for banned people, with the reason and where to appeal.
    pub fn banned_response(&self, reason: &str) -> Response {
        let appeal = self.cfg().server.appeal_contact;
        (StatusCode::FORBIDDEN, Json(json!({ "error": "banned", "banned": true, "reason": reason, "appeal": appeal }))).into_response()
    }

    pub fn cfg(&self) -> Config {
        self.cfg.read().unwrap().clone()
    }

    /// Fixed 10-minute windows; plenty for the app, stops floods.
    fn allow(&self, key: &str, limit: u32) -> bool {
        let window = now() / 600;
        let mut r = self.rate.lock().unwrap();
        if r.len() > 20_000 {
            r.retain(|_, (w, _)| *w == window);
        }
        let e = r.entry(key.to_string()).or_insert((window, 0));
        if e.0 != window {
            *e = (window, 0);
        }
        e.1 += 1;
        e.1 <= limit
    }

    pub fn info(&self) -> ServerInfo {
        let cfg = self.cfg();
        let store = self.store.lock().unwrap();
        ServerInfo {
            software: "vfm-server".into(),
            version: VERSION.into(),
            protocol: PROTOCOL,
            name: cfg.server.name.clone(),
            encryption: cfg.access.encryption,
            registration: cfg.access.registration,
            box_pk: vfm_share::b64_encode(&store.identity.box_pk()),
            sign_pk: vfm_share::b64_encode(&store.identity.sign_pk()),
            max_item_bytes: cfg.access.max_item_kb * 1024,
            kinds: KINDS.iter().map(|k| k.to_string()).collect(),
            logger: LoggerInfo { enabled: cfg.logger.enabled, paired: self.logger.owner().is_some(), owner: None },
            motd: cfg.server.motd.clone(),
            features: vec!["hidden-recipients".into(), "live-changes".into(), "device-relay".into()],
        }
    }
}

pub enum ApiError {
    Msg(StatusCode, String),
    Full(Response),
}

#[allow(non_snake_case)]
fn ApiError(r: Response) -> ApiError {
    ApiError::Full(r)
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        match self {
            ApiError::Msg(code, msg) => (code, Json(json!({ "error": msg }))).into_response(),
            ApiError::Full(r) => r,
        }
    }
}

fn err(code: StatusCode, msg: impl Into<String>) -> ApiError {
    ApiError::Msg(code, msg.into())
}

type ApiResult = Result<Response, ApiError>;

fn path_and_query(uri: &Uri) -> String {
    uri.path_and_query().map(|p| p.as_str().to_string()).unwrap_or_else(|| uri.path().to_string())
}

fn auth_header(headers: &HeaderMap) -> Result<auth::AuthHeader, ApiError> {
    let raw = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| err(StatusCode::UNAUTHORIZED, "signed request needed"))?;
    auth::parse(raw).ok_or_else(|| err(StatusCode::UNAUTHORIZED, "bad Authorization header"))
}

/// Check a signed request from a registered user; returns their ID.
fn authed(app: &App, headers: &HeaderMap, method: &Method, uri: &Uri, body: &[u8]) -> Result<String, ApiError> {
    let h = auth_header(headers)?;
    if !app.allow(&h.user, RATE_LIMIT) {
        return Err(err(StatusCode::TOO_MANY_REQUESTS, "slow down"));
    }
    let mut store = app.store.lock().unwrap();
    let rec = store.users.users.get(&h.user).ok_or_else(|| err(StatusCode::UNAUTHORIZED, "not registered on this server"))?;
    let pk = rec.identity.sign_key().ok_or_else(|| err(StatusCode::INTERNAL_SERVER_ERROR, "stored key damaged"))?;
    if !h.verify(&pk, method.as_str(), &path_and_query(uri), body, now()) {
        return Err(err(StatusCode::UNAUTHORIZED, "signature or clock wrong (check the device's time)"));
    }
    if !store.use_nonce(&h.user, &h.nonce) {
        return Err(err(StatusCode::UNAUTHORIZED, "request was already used"));
    }
    if let Some(b) = app.bans.user(&h.user) {
        return Err(ApiError(app.banned_response(&b.reason)));
    }
    store.touch(&h.user);
    // For the admin page's user list: where from, which app version.
    let ip = headers.get(PEER_HEADER).and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let ua = headers.get("user-agent").and_then(|v| v.to_str().ok()).unwrap_or("").chars().take(80).collect::<String>();
    let name = headers.get("x-vrc-name").and_then(|v| v.to_str().ok()).unwrap_or("").chars().take(40).collect::<String>();
    if let Some(u) = store.users.users.get_mut(&h.user) {
        u.last_ip = ip;
        u.last_ua = ua;
        if !name.is_empty() {
            u.name = name;
        }
    }
    Ok(h.user)
}

/// Set by the middleware below (never by the client: it's overwritten).
pub const PEER_HEADER: &str = "x-vfm-peer";

/// Every request: note the visitor's address for the handlers, and refuse banned addresses.
async fn peer_and_bans(State(app): State<Arc<App>>, ConnectInfo(addr): ConnectInfo<SocketAddr>, mut req: axum::extract::Request, next: axum::middleware::Next) -> Response {
    let ip = app.client_ip(addr.ip(), req.headers());
    if let Some(b) = app.bans.ip(&ip.to_string()) {
        if !req.uri().path().starts_with("/admin") {
            return app.banned_response(&b.reason);
        }
    }
    if let Ok(v) = ip.to_string().parse() {
        req.headers_mut().insert(PEER_HEADER, v);
    }
    next.run(req).await
}

pub fn router(app: Arc<App>) -> Router {
    Router::new()
        .route("/v1/cache/{kind}/{id}", get(cache_get).put(cache_put))
        .route("/v1/logger/heartbeat", post(logger_heartbeat))
        .route("/v1/logger/push", put(logger_push_set).delete(logger_push_delete))
        .route("/", get(landing))
        .route("/v1/info", get(info))
        .route("/v1/register", post(register))
        .route("/v1/me", get(me).delete(delete_me))
        .route("/v1/users", get(users))
        .route("/v1/items/{kind}", put(put_item).delete(delete_item))
        .route("/v1/inbox", get(inbox))
        .route("/v1/hidden", post(hidden))
        .route("/v1/events", get(events))
        .route("/v1/devices/signal", post(device_signal))
        .route("/v1/logger/pair", post(logger_pair).delete(logger_unpair))
        .route("/v1/logger/status", get(logger_status))
        .route("/v1/logger/stats", get(logger_stats))
        .merge(crate::admin::router())
        .layer(axum::extract::DefaultBodyLimit::max(8 * 1024 * 1024))
        .layer(axum::middleware::from_fn_with_state(Arc::clone(&app), peer_and_bans))
        .with_state(app)
}

// ---------- shared cache of public VRChat info ----------

fn cache_on(cfg: &Config, kind: &str) -> bool {
    match kind {
        "world" => cfg.access.cache_worlds,
        "group" => cfg.access.cache_groups,
        "avatar" => cfg.access.cache_avatars,
        _ => false,
    }
}

async fn cache_get(State(app): State<Arc<App>>, Path((kind, id)): Path<(String, String)>, headers: HeaderMap, method: Method, uri: Uri) -> ApiResult {
    authed(&app, &headers, &method, &uri, b"")?;
    if !cache_on(&app.cfg(), &kind) {
        return Err(err(StatusCode::NOT_FOUND, "this server doesn't cache that"));
    }
    match app.cache.get(&kind, &id) {
        Some((data, at)) => Ok(Json(json!({ "data": data, "at": at })).into_response()),
        None => Err(err(StatusCode::NOT_FOUND, "not cached")),
    }
}

async fn cache_put(State(app): State<Arc<App>>, Path((kind, id)): Path<(String, String)>, headers: HeaderMap, method: Method, uri: Uri, body: Bytes) -> ApiResult {
    let user = authed(&app, &headers, &method, &uri, &body)?;
    if !cache_on(&app.cfg(), &kind) {
        return Err(err(StatusCode::NOT_FOUND, "this server doesn't cache that"));
    }
    if !app.allow(&format!("cache/{user}"), 300) {
        return Err(err(StatusCode::TOO_MANY_REQUESTS, "slow down"));
    }
    app.cache.put(&kind, &id, &body).map_err(|e| err(StatusCode::BAD_REQUEST, e))?;
    Ok(Json(json!({ "ok": true })).into_response())
}

// ---------- the owner's PC and phones (logger) ----------

async fn logger_heartbeat(State(app): State<Arc<App>>, headers: HeaderMap, method: Method, uri: Uri, body: Bytes) -> ApiResult {
    let user = authed(&app, &headers, &method, &uri, &body)?;
    require_logger_owner(&app, &user)?;
    app.logger.pc_heartbeat();
    Ok(Json(json!({ "ok": true, "handOff": app.cfg().logger.hand_off })).into_response())
}

#[derive(Deserialize)]
struct PushBody {
    device: String,
    endpoint: String,
    key: String,
}

async fn logger_push_set(State(app): State<Arc<App>>, headers: HeaderMap, method: Method, uri: Uri, body: Bytes) -> ApiResult {
    let user = authed(&app, &headers, &method, &uri, &body)?;
    require_logger_owner(&app, &user)?;
    let b: PushBody = serde_json::from_slice(&body).map_err(|e| err(StatusCode::BAD_REQUEST, e.to_string()))?;
    if !b.endpoint.starts_with("https://") || b.endpoint.len() > 600 || b.device.is_empty() || b.device.len() > 64 || crate::push::b64_decode(&b.key).map(|k| k.len()) != Some(32) {
        return Err(err(StatusCode::BAD_REQUEST, "bad push target"));
    }
    app.logger
        .set_push(&b.device, Some(crate::logger::PushTarget { endpoint: b.endpoint, key: b.key, t: now() }))
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(json!({ "ok": true })).into_response())
}

async fn logger_push_delete(State(app): State<Arc<App>>, headers: HeaderMap, method: Method, uri: Uri, body: Bytes) -> ApiResult {
    let user = authed(&app, &headers, &method, &uri, &body)?;
    require_logger_owner(&app, &user)?;
    let b: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
    let device = b.get("device").and_then(Value::as_str).unwrap_or("");
    app.logger.set_push(device, None).map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(json!({ "ok": true })).into_response())
}

async fn landing(State(app): State<Arc<App>>) -> Html<String> {
    let cfg = app.cfg();
    let esc = |s: &str| s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");
    Html(format!(
        "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>{n}</title>\
         <body style='font:16px system-ui;max-width:36em;margin:3em auto;padding:0 1em;color:#ddd;background:#16171d'>\
         <h1>{n}</h1><p>This is a <b>VRC Friend Map</b> server (vfm-server {v}). To use it, open the app → Settings → Servers → Add, \
         and enter this page's address.</p><p>{m}</p><p><a style='color:#8af' href='/admin'>Admin page</a></p>",
        n = esc(&cfg.server.name),
        v = VERSION,
        m = esc(&cfg.server.motd)
    ))
}

async fn info(State(app): State<Arc<App>>) -> Json<ServerInfo> {
    Json(app.info())
}

#[derive(Deserialize)]
struct RegisterBody {
    identity: PublicIdentity,
    #[serde(default)]
    invite: Option<String>,
}

async fn register(
    State(app): State<Arc<App>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    method: Method,
    uri: Uri,
    body: Bytes,
) -> ApiResult {
    if !app.allow(&format!("reg/{}", addr.ip()), REGISTER_LIMIT) {
        return Err(err(StatusCode::TOO_MANY_REQUESTS, "too many sign-ups from this address, try later"));
    }
    let b: RegisterBody = serde_json::from_slice(&body).map_err(|e| err(StatusCode::BAD_REQUEST, e.to_string()))?;
    let id = &b.identity;
    if !valid_user_id(&id.user_id) || !id.verify() {
        return Err(err(StatusCode::BAD_REQUEST, "identity is invalid"));
    }
    // Signed with the key being registered: proves the caller holds it.
    let h = auth_header(&headers)?;
    let pk = id.sign_key().unwrap();
    if h.user != id.user_id || !h.verify(&pk, method.as_str(), &path_and_query(&uri), &body, now()) {
        return Err(err(StatusCode::UNAUTHORIZED, "signature or clock wrong (check the device's time)"));
    }
    let cfg = app.cfg();
    let mut store = app.store.lock().unwrap();
    if !store.use_nonce(&h.user, &h.nonce) {
        return Err(err(StatusCode::UNAUTHORIZED, "request was already used"));
    }
    if let Some(existing) = store.users.users.get(&id.user_id) {
        if existing.identity == *id {
            return Ok(Json(json!({ "ok": true, "existing": true })).into_response());
        }
        return Err(err(
            StatusCode::CONFLICT,
            "this VRChat account is already registered here with a different key. Use \"Copy key to another device\" from the device you registered with, or ask the server owner to reset it.",
        ));
    }
    if store.users.users.len() >= cfg.access.max_users {
        return Err(err(StatusCode::FORBIDDEN, "this server is full"));
    }
    let invite = match cfg.access.registration {
        Registration::Closed => return Err(err(StatusCode::FORBIDDEN, "this server isn't taking new people")),
        Registration::Open => None,
        Registration::Invite => {
            let code = b.invite.as_deref().unwrap_or("").trim().to_uppercase();
            if code.is_empty() {
                return Err(err(StatusCode::FORBIDDEN, "this server needs an invite code"));
            }
            if !store.take_invite(&code) {
                return Err(err(StatusCode::FORBIDDEN, "invite code is wrong, used up or expired"));
            }
            Some(code.chars().take(4).collect::<String>() + "…")
        }
    };
    store.users.users.insert(id.user_id.clone(), UserRecord { identity: id.clone(), registered: now(), last_seen: now(), invite, last_ip: String::new(), last_ua: String::new(), name: String::new() });
    store.save_users().map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e))?;
    eprintln!("registered {}", id.user_id);
    Ok((StatusCode::CREATED, Json(json!({ "ok": true, "existing": false }))).into_response())
}

async fn me(State(app): State<Arc<App>>, headers: HeaderMap, method: Method, uri: Uri, body: Bytes) -> ApiResult {
    let user = authed(&app, &headers, &method, &uri, &body)?;
    let store = app.store.lock().unwrap();
    let rec = store.users.users.get(&user).cloned();
    let items: Vec<_> = store.items.values().filter(|m| m.owner == user).cloned().collect();
    drop(store);
    let logger_owner = app.logger.owner().as_deref() == Some(user.as_str());
    Ok(Json(json!({ "user": rec, "items": items, "loggerOwner": logger_owner })).into_response())
}

async fn delete_me(State(app): State<Arc<App>>, headers: HeaderMap, method: Method, uri: Uri, body: Bytes) -> ApiResult {
    let user = authed(&app, &headers, &method, &uri, &body)?;
    if app.logger.owner().as_deref() == Some(user.as_str()) {
        app.logger.unpair(false);
    }
    app.store.lock().unwrap().delete_user(&user);
    eprintln!("account deleted: {user}");
    Ok(Json(json!({ "ok": true })).into_response())
}

#[derive(Deserialize)]
struct UsersQuery {
    ids: String,
}

async fn users(State(app): State<Arc<App>>, headers: HeaderMap, method: Method, uri: Uri, q: Query<UsersQuery>) -> ApiResult {
    authed(&app, &headers, &method, &uri, b"")?;
    let ids: Vec<String> = q.ids.split(',').filter(|s| valid_user_id(s)).take(MAX_RECIPIENTS).map(str::to_string).collect();
    let found = app.store.lock().unwrap().known_users(&ids);
    Ok(Json(json!({ "users": found })).into_response())
}

async fn put_item(
    State(app): State<Arc<App>>,
    Path(kind): Path<String>,
    headers: HeaderMap,
    method: Method,
    uri: Uri,
    body: Bytes,
) -> ApiResult {
    let user = authed(&app, &headers, &method, &uri, &body)?;
    if !KINDS.contains(&kind.as_str()) {
        return Err(err(StatusCode::NOT_FOUND, "unknown kind"));
    }
    let cfg = app.cfg();
    if body.len() > cfg.access.max_item_kb * 1024 * 4 / 3 + 4096 {
        return Err(err(StatusCode::PAYLOAD_TOO_LARGE, format!("too big (this server takes up to {} KB)", cfg.access.max_item_kb)));
    }
    let env: Envelope = serde_json::from_slice(&body).map_err(|e| err(StatusCode::BAD_REQUEST, e.to_string()))?;
    if env.owner != user || env.kind != kind {
        return Err(err(StatusCode::BAD_REQUEST, "owner or kind doesn't match"));
    }
    if !env.well_formed() || env.recipients.len() > MAX_RECIPIENTS || !env.recipients.iter().all(|r| valid_user_id(r)) {
        return Err(err(StatusCode::BAD_REQUEST, "item is malformed"));
    }
    let sealed = env.enc == Enc::Sealed;
    // Your own devices' data: only ever encrypted, and only for you.
    if kind == vfm_share::KIND_SELF && (!sealed || env.hidden() || env.recipients.iter().any(|r| r != &user)) {
        return Err(err(StatusCode::BAD_REQUEST, "your devices' data must be encrypted and only for you"));
    }
    if !cfg.access.encryption.allows(sealed) {
        return Err(err(
            StatusCode::FORBIDDEN,
            if sealed { "this server only accepts unencrypted uploads (force-off)" } else { "this server only accepts end-to-end encrypted uploads (force-on)" },
        ));
    }
    if env.created > now() + 600 {
        return Err(err(StatusCode::BAD_REQUEST, "item is from the future (check the device's time)"));
    }
    let mut store = app.store.lock().unwrap();
    let pk = store.users.users.get(&user).and_then(|u| u.identity.sign_key()).unwrap();
    if !env.verify(&pk) {
        return Err(err(StatusCode::BAD_REQUEST, "item isn't signed by your key"));
    }
    if let Some(old) = store.items.get(&(user.clone(), kind.clone())) {
        if old.created > env.created {
            return Err(err(StatusCode::CONFLICT, "a newer version is already stored"));
        }
    }
    let mut recipients = store.items.get(&(user.clone(), kind.clone())).map(|m| m.recipients.clone()).unwrap_or_default();
    store.put_item(&env).map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e))?;
    drop(store);
    recipients.extend(env.recipients.iter().cloned());
    let _ = app.changes.send(Signal::Change(Change { owner: user.clone(), kind: kind.clone(), recipients, hidden: env.hidden() }));
    Ok(Json(json!({ "ok": true, "sealed": sealed, "recipients": env.recipients.len() })).into_response())
}

async fn delete_item(
    State(app): State<Arc<App>>,
    Path(kind): Path<String>,
    headers: HeaderMap,
    method: Method,
    uri: Uri,
    body: Bytes,
) -> ApiResult {
    let user = authed(&app, &headers, &method, &uri, &body)?;
    let (removed, old) = {
        let mut store = app.store.lock().unwrap();
        let old = store.items.get(&(user.clone(), kind.clone())).cloned();
        (store.delete_item(&user, &kind), old)
    };
    if let Some(m) = old {
        let _ = app.changes.send(Signal::Change(Change { owner: user.clone(), kind: kind.clone(), recipients: m.recipients, hidden: m.hidden }));
    }
    Ok(Json(json!({ "ok": true, "removed": removed })).into_response())
}

#[derive(Deserialize)]
struct InboxQuery {
    #[serde(default)]
    since: i64,
}

/// ETag for an inbox: which items there are (with their versions) and the keys of
/// who sent them. Same tag, nothing to send again.
fn inbox_tag<'a>(parts: impl Iterator<Item = (&'a crate::store::ItemMeta, Vec<u8>)>) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    for (m, key) in parts {
        h.update(format!("{}\0{}\0{}\0{}\n", m.owner, m.kind, m.created, m.bytes));
        h.update(key);
        h.update(b"\n");
    }
    format!("\"{}\"", &hex::encode(h.finalize())[..32])
}

async fn inbox(State(app): State<Arc<App>>, headers: HeaderMap, method: Method, uri: Uri, q: Query<InboxQuery>) -> ApiResult {
    let user = authed(&app, &headers, &method, &uri, b"")?;
    let store = app.store.lock().unwrap();
    let metas = store.inbox(&user, q.since);
    // "Nothing changed" without reading or sending the items again: the tag covers
    // which items there are (and their versions) and the keys of who sent them.
    let tag = inbox_tag(metas.iter().map(|m| {
        let key = store.users.users.get(&m.owner).map(|u| serde_json::to_vec(&u.identity).unwrap_or_default());
        (*m, key.unwrap_or_default())
    }));
    let etag = [(axum::http::header::ETAG, tag.clone())];
    let matches = headers
        .get(axum::http::header::IF_NONE_MATCH)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.split(',').any(|t| t.trim() == tag));
    if matches {
        return Ok((StatusCode::NOT_MODIFIED, etag).into_response());
    }
    let mut items = Vec::new();
    let mut identities = BTreeMap::new();
    for m in metas {
        if let Some(env) = store.read_item(&m.owner, &m.kind) {
            if let Some(u) = store.users.users.get(&m.owner) {
                identities.insert(m.owner.clone(), u.identity.clone());
            }
            items.push(env);
        }
    }
    Ok((etag, Json(json!({ "items": items, "identities": identities, "now": now() }))).into_response())
}

#[derive(Deserialize)]
struct HiddenBody {
    /// Whose hidden items you want (your friends). Left out: only which hidden
    /// items exist, so the app can pick its friends without naming all of them.
    #[serde(default)]
    owners: Option<Vec<String>>,
    /// What you have already: "owner|kind" -> created. Those aren't sent again.
    #[serde(default)]
    have: HashMap<String, i64>,
}

/// Hidden-recipient items (version 2) of the owners you name. They say nobody's
/// name, so the server hands them to anyone registered who asks; only the
/// people they were sealed for can open them. Only version 2 items come out
/// here: items addressed by name stay with their recipients.
async fn hidden(State(app): State<Arc<App>>, headers: HeaderMap, method: Method, uri: Uri, body: Bytes) -> ApiResult {
    authed(&app, &headers, &method, &uri, &body)?;
    let b: HiddenBody = serde_json::from_slice(&body).map_err(|e| err(StatusCode::BAD_REQUEST, e.to_string()))?;
    let store = app.store.lock().unwrap();
    let mut current = Vec::new();
    let mut items = Vec::new();
    let mut identities = BTreeMap::new();
    let Some(owners) = b.owners else {
        for m in store.hidden_all() {
            current.push(json!({ "owner": m.owner, "kind": m.kind, "created": m.created }));
        }
        return Ok(Json(json!({ "items": items, "current": current, "identities": identities })).into_response());
    };
    let owners: Vec<String> = owners.into_iter().filter(|s| valid_user_id(s)).take(MAX_RECIPIENTS).collect();
    for m in store.hidden_of(&owners) {
        current.push(json!({ "owner": m.owner, "kind": m.kind, "created": m.created }));
        if let Some(u) = store.users.users.get(&m.owner) {
            identities.insert(m.owner.clone(), u.identity.clone());
        }
        if b.have.get(&format!("{}|{}", m.owner, m.kind)) == Some(&m.created) {
            continue;
        }
        if let Some(env) = store.read_item(&m.owner, &m.kind).filter(|e| e.hidden()) {
            items.push(env);
        }
    }
    Ok(Json(json!({ "items": items, "current": current, "identities": identities })).into_response())
}

#[derive(Deserialize)]
struct SignalBody {
    blob: String,
}

/// Pass a sealed message to your other devices' open event streams, right away
/// and never stored. The server can't read it (it's sealed to your own key).
async fn device_signal(State(app): State<Arc<App>>, headers: HeaderMap, method: Method, uri: Uri, body: Bytes) -> ApiResult {
    let user = authed(&app, &headers, &method, &uri, &body)?;
    let b: SignalBody = serde_json::from_slice(&body).map_err(|e| err(StatusCode::BAD_REQUEST, e.to_string()))?;
    if b.blob.len() > MAX_SIGNAL || b.blob.chars().any(|c| c.is_control()) {
        return Err(err(StatusCode::PAYLOAD_TOO_LARGE, "message too big"));
    }
    if b.blob.len() > SMALL_SIGNAL && !app.cfg().access.relay {
        return Err(err(StatusCode::FORBIDDEN, "this server doesn't pass bigger messages between devices (they sync directly at home)"));
    }
    let heard = app.changes.send(Signal::Peer { user, blob: Arc::new(b.blob) }).unwrap_or(0);
    Ok(Json(json!({ "ok": true, "streams": heard })).into_response())
}

/// One open connection instead of polling: `event: change` with `{owner, kind}`
/// whenever something you can fetch changes (or a hidden item, which your app
/// checks against your friends), a ping every 25 seconds, and `event: resync`
/// if this connection fell behind. Text/event-stream (SSE).
async fn events(State(app): State<Arc<App>>, headers: HeaderMap, method: Method, uri: Uri) -> ApiResult {
    use std::sync::atomic::Ordering;
    let user = authed(&app, &headers, &method, &uri, b"")?;
    if app.streams.fetch_add(1, Ordering::SeqCst) >= MAX_STREAMS {
        app.streams.fetch_sub(1, Ordering::SeqCst);
        return Err(err(StatusCode::SERVICE_UNAVAILABLE, "too many open connections; the app polls instead"));
    }
    struct Open(Arc<App>);
    impl Drop for Open {
        fn drop(&mut self) {
            self.0.streams.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
        }
    }
    let rx = app.changes.subscribe();
    let mut tick = tokio::time::interval(std::time::Duration::from_secs(25));
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut closing = app.closing.subscribe();
    closing.mark_changed();
    let state = (rx, tick, user, Open(app.clone()), closing);
    let stream = futures_util::stream::unfold(state, |(mut rx, mut tick, user, open, mut closing)| async move {
        loop {
            tokio::select! {
                _ = closing.changed() => {
                    if *closing.borrow_and_update() {
                        return None;
                    }
                    // The first wake-up: say hello, so the app knows the stream is open.
                    return Some((Ok::<_, std::convert::Infallible>(Bytes::from_static(b": open\n\n")), (rx, tick, user, open, closing)));
                }
                msg = rx.recv() => match msg {
                    Ok(Signal::Change(c)) if c.for_user(&user) => {
                        let line = format!("event: change\ndata: {}\n\n", json!({ "owner": c.owner, "kind": c.kind }));
                        return Some((Ok(Bytes::from(line)), (rx, tick, user, open, closing)));
                    }
                    Ok(Signal::Peer { user: u, blob }) if u == user => {
                        // The blob is base64 inside JSON: one line, nothing to escape.
                        let line = format!("event: peer\ndata: {}\n\n", json!({ "blob": blob.as_str() }));
                        return Some((Ok(Bytes::from(line)), (rx, tick, user, open, closing)));
                    }
                    Ok(_) => continue,
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                        return Some((Ok(Bytes::from_static(b"event: resync\ndata: {}\n\n")), (rx, tick, user, open, closing)));
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => return None,
                },
                _ = tick.tick() => return Some((Ok(Bytes::from_static(b": ping\n\n")), (rx, tick, user, open, closing))),
            }
        }
    });
    Ok((
        [
            (axum::http::header::CONTENT_TYPE, "text/event-stream"),
            (axum::http::header::CACHE_CONTROL, "no-cache"),
            (axum::http::HeaderName::from_static("x-accel-buffering"), "no"),
        ],
        axum::body::Body::from_stream(stream),
    )
        .into_response())
}

// ---------- logger ----------

#[derive(Deserialize)]
struct PairBody {
    code: String,
    /// `{"auth": "...", "twoFactorAuth": "..."}` sealed to the server's box key.
    session: String,
}

async fn logger_pair(State(app): State<Arc<App>>, headers: HeaderMap, method: Method, uri: Uri, body: Bytes) -> ApiResult {
    let user = authed(&app, &headers, &method, &uri, &body)?;
    if !app.cfg().logger.enabled {
        return Err(err(StatusCode::FORBIDDEN, "the logger is turned off on this server"));
    }
    let b: PairBody = serde_json::from_slice(&body).map_err(|e| err(StatusCode::BAD_REQUEST, e.to_string()))?;
    if let Some(owner) = app.logger.owner() {
        if owner != user {
            return Err(err(StatusCode::CONFLICT, "someone else is already paired with this logger"));
        }
    } else if !app.logger.take_pair_code(&b.code) {
        return Err(err(StatusCode::FORBIDDEN, "pairing code is wrong or expired (make a new one on the server)"));
    }
    let raw = {
        let store = app.store.lock().unwrap();
        vfm_share::open_sealed_box(&store.identity, &b.session, &format!("vfm1-logger-session/{user}"))
    }
    .ok_or_else(|| err(StatusCode::BAD_REQUEST, "couldn't open the session (sealed for another server?)"))?;
    let session: Value = serde_json::from_slice(&raw).map_err(|e| err(StatusCode::BAD_REQUEST, e.to_string()))?;
    let auth_cookie = session.get("auth").and_then(Value::as_str).unwrap_or("").to_string();
    let two_factor = session.get("twoFactorAuth").and_then(Value::as_str).map(str::to_string);
    app.logger.pair(&user, &auth_cookie, two_factor).await.map_err(|e| err(StatusCode::BAD_REQUEST, e))?;
    Ok(Json(json!({ "ok": true })).into_response())
}

fn require_logger_owner(app: &App, user: &str) -> Result<(), ApiError> {
    match app.logger.owner() {
        Some(o) if o == user => Ok(()),
        Some(_) => Err(err(StatusCode::FORBIDDEN, "this logger belongs to someone else")),
        None => Err(err(StatusCode::NOT_FOUND, "the logger isn't paired")),
    }
}

async fn logger_unpair(State(app): State<Arc<App>>, headers: HeaderMap, method: Method, uri: Uri, body: Bytes) -> ApiResult {
    let user = authed(&app, &headers, &method, &uri, &body)?;
    require_logger_owner(&app, &user)?;
    let forget = uri.query().unwrap_or("").contains("forget=1");
    app.logger.unpair(forget);
    Ok(Json(json!({ "ok": true })).into_response())
}

async fn logger_status(State(app): State<Arc<App>>, headers: HeaderMap, method: Method, uri: Uri, body: Bytes) -> ApiResult {
    let user = authed(&app, &headers, &method, &uri, &body)?;
    require_logger_owner(&app, &user)?;
    Ok(Json(app.logger.status()).into_response())
}

/// Co-presence totals, sealed to the owner and signed by the server.
async fn logger_stats(State(app): State<Arc<App>>, headers: HeaderMap, method: Method, uri: Uri, body: Bytes) -> ApiResult {
    let user = authed(&app, &headers, &method, &uri, &body)?;
    require_logger_owner(&app, &user)?;
    let payload = serde_json::to_vec(&app.logger.stats()).unwrap();
    let store = app.store.lock().unwrap();
    let rec = store.users.users.get(&user).and_then(|u| u.identity.box_key()).ok_or_else(|| err(StatusCode::INTERNAL_SERVER_ERROR, "key missing"))?;
    let env = Envelope::sealed(&store.identity, "server", "logger", now(), &payload, &[vfm_share::Recipient { user_id: user.clone(), box_pk: rec }]);
    Ok(Json(env).into_response())
}

#[cfg(test)]
mod tests {
    use super::inbox_tag;
    use crate::store::ItemMeta;

    fn meta(owner: &str, created: i64) -> ItemMeta {
        ItemMeta { owner: owner.into(), kind: "friends".into(), created, sealed: true, recipients: vec![], bytes: 10, hidden: false }
    }

    #[test]
    fn inbox_tag_changes_only_with_the_inbox() {
        let a = meta("usr_a", 1);
        let b = meta("usr_b", 2);
        let tag = |ms: &[(&ItemMeta, &[u8])]| inbox_tag(ms.iter().map(|(m, k)| (*m, k.to_vec())));
        let base = tag(&[(&a, b"ka"), (&b, b"kb")]);
        assert_eq!(base, tag(&[(&a, b"ka"), (&b, b"kb")]));
        assert!(base.starts_with('"') && base.ends_with('"'));
        // A newer version of an item, an item gone, or a sender's new key: new tag.
        assert_ne!(base, tag(&[(&meta("usr_a", 3), b"ka"), (&b, b"kb")]));
        assert_ne!(base, tag(&[(&a, b"ka")]));
        assert_ne!(base, tag(&[(&a, b"ka2"), (&b, b"kb")]));
        assert_ne!(tag(&[]), tag(&[(&a, b"")]));
    }
}
