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
    rate: Mutex<HashMap<String, (i64, u32)>>,
}

impl App {
    pub fn new(cfg: Config, cfg_path: PathBuf, store: Store, logger: Arc<Logger>) -> Arc<App> {
        Arc::new(App { cfg: RwLock::new(cfg), cfg_path, store: Mutex::new(store), logger, rate: Mutex::new(HashMap::new()) })
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
        }
    }
}

pub struct ApiError(StatusCode, String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}

fn err(code: StatusCode, msg: impl Into<String>) -> ApiError {
    ApiError(code, msg.into())
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
    store.touch(&h.user);
    Ok(h.user)
}

pub fn router(app: Arc<App>) -> Router {
    Router::new()
        .route("/", get(landing))
        .route("/v1/info", get(info))
        .route("/v1/register", post(register))
        .route("/v1/me", get(me).delete(delete_me))
        .route("/v1/users", get(users))
        .route("/v1/items/{kind}", put(put_item).delete(delete_item))
        .route("/v1/inbox", get(inbox))
        .route("/v1/logger/pair", post(logger_pair).delete(logger_unpair))
        .route("/v1/logger/status", get(logger_status))
        .route("/v1/logger/stats", get(logger_stats))
        .merge(crate::admin::router())
        .layer(axum::extract::DefaultBodyLimit::max(8 * 1024 * 1024))
        .with_state(app)
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
    store.users.users.insert(id.user_id.clone(), UserRecord { identity: id.clone(), registered: now(), last_seen: now(), invite });
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
    store.put_item(&env).map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e))?;
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
    let removed = app.store.lock().unwrap().delete_item(&user, &kind);
    Ok(Json(json!({ "ok": true, "removed": removed })).into_response())
}

#[derive(Deserialize)]
struct InboxQuery {
    #[serde(default)]
    since: i64,
}

async fn inbox(State(app): State<Arc<App>>, headers: HeaderMap, method: Method, uri: Uri, q: Query<InboxQuery>) -> ApiResult {
    let user = authed(&app, &headers, &method, &uri, b"")?;
    let store = app.store.lock().unwrap();
    let mut items = Vec::new();
    let mut identities = BTreeMap::new();
    for m in store.inbox(&user, q.since) {
        if let Some(env) = store.read_item(&m.owner, &m.kind) {
            if let Some(u) = store.users.users.get(&m.owner) {
                identities.insert(m.owner.clone(), u.identity.clone());
            }
            items.push(env);
        }
    }
    Ok(Json(json!({ "items": items, "identities": identities, "now": now() })).into_response())
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
