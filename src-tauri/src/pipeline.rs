//! Live updates from VRChat's WebSocket pipeline (wss://pipeline.vrchat.cloud).
//! VRChat pushes friend events here the moment they happen, on any device:
//! a friend request being accepted (`friend-add`), unfriending, friends coming
//! online/offline, status and location changes. One long-lived connection is
//! much lighter on VRChat than polling.

use crate::AppState;
use futures_util::StreamExt;
use serde_json::Value;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::Message;

const PIPELINE_URL: &str = "wss://pipeline.vrchat.cloud/";
const FORWARDED: [&str; 7] = [
    "friend-add",
    "friend-delete",
    "friend-online",
    "friend-offline",
    "friend-active",
    "friend-update",
    "friend-location",
];

#[derive(Default)]
pub struct PipelineState {
    generation: AtomicU64,
    connected: AtomicBool,
}

#[derive(Clone, serde::Serialize)]
struct PipelineEvent {
    #[serde(rename = "type")]
    kind: String,
    content: Value,
}

#[derive(Clone, serde::Serialize)]
pub struct PipelineStatus {
    pub connected: bool,
    pub message: String,
    /// The session was rejected; reconnecting won't help.
    pub fatal: bool,
}

enum Outcome {
    Closed,
    Stopped,
    AuthRejected(String),
}

fn emit_status<R: Runtime>(app: &AppHandle<R>, state: &AppState, connected: bool, message: &str, fatal: bool) {
    state.pipeline.connected.store(connected, Ordering::SeqCst);
    let _ = app.emit(
        "vrc-pipeline-status",
        PipelineStatus { connected, message: message.to_string(), fatal },
    );
}

pub fn is_connected(state: &AppState) -> bool {
    state.pipeline.connected.load(Ordering::SeqCst)
}

/// (Re)start the connection loop. Any previous loop notices the new
/// generation number and exits.
pub fn start<R: Runtime>(app: AppHandle<R>, state: Arc<AppState>) {
    let gen = state.pipeline.generation.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn(async move {
        run(app, state, gen).await;
    });
}

pub fn stop<R: Runtime>(app: &AppHandle<R>, state: &AppState) {
    state.pipeline.generation.fetch_add(1, Ordering::SeqCst);
    emit_status(app, state, false, "Live updates off", false);
}

async fn run<R: Runtime>(app: AppHandle<R>, state: Arc<AppState>, gen: u64) {
    let current = |s: &AppState| s.pipeline.generation.load(Ordering::SeqCst) == gen;
    let mut backoff_secs = 5u64;
    while current(&state) {
        let Some(token) = state.api.auth_token().await else {
            emit_status(&app, &state, false, "Not logged in", false);
            return;
        };
        match connect_and_listen(&app, &state, gen, &token).await {
            Ok(Outcome::Stopped) => return,
            Ok(Outcome::AuthRejected(msg)) => {
                emit_status(&app, &state, false, &msg, true);
                return;
            }
            Ok(Outcome::Closed) => {
                backoff_secs = 5;
                emit_status(&app, &state, false, "Live connection closed, reconnecting…", false);
            }
            Err(e) => {
                emit_status(&app, &state, false, &format!("Live updates unavailable: {e}"), false);
            }
        }
        // Wait before reconnecting (with jitter), but react quickly to stop().
        let wait = backoff_secs + rand::random::<u64>() % 5;
        for _ in 0..wait {
            if !current(&state) {
                return;
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
        backoff_secs = (backoff_secs * 2).min(300);
    }
}

async fn connect_and_listen<R: Runtime>(
    app: &AppHandle<R>,
    state: &AppState,
    gen: u64,
    token: &str,
) -> Result<Outcome, String> {
    let mut url = url::Url::parse(PIPELINE_URL).map_err(|e| e.to_string())?;
    url.query_pairs_mut().append_pair("authToken", token);
    let mut req = url.as_str().into_client_request().map_err(|e| e.to_string())?;
    let ua = HeaderValue::from_str(&state.api.user_agent().await).map_err(|e| e.to_string())?;
    req.headers_mut().insert("User-Agent", ua);

    let (mut ws, _) = tokio::time::timeout(Duration::from_secs(20), tokio_tungstenite::connect_async(req))
        .await
        .map_err(|_| "connection timed out".to_string())?
        .map_err(|e| e.to_string())?;
    emit_status(app, state, true, "Live updates on", false);

    loop {
        if state.pipeline.generation.load(Ordering::SeqCst) != gen {
            let _ = ws.close(None).await;
            return Ok(Outcome::Stopped);
        }
        // Wake up regularly to notice stop(); an idle connection is normal.
        let next = match tokio::time::timeout(Duration::from_secs(10), ws.next()).await {
            Err(_) => continue,
            Ok(None) => return Ok(Outcome::Closed),
            Ok(Some(Err(e))) => return Err(e.to_string()),
            Ok(Some(Ok(msg))) => msg,
        };
        let text = match next {
            Message::Text(t) => t.to_string(),
            Message::Close(_) => return Ok(Outcome::Closed),
            _ => continue, // pings are answered automatically
        };
        match parse_message(&text) {
            Parsed::Event(kind, content) => {
                let _ = app.emit("vrc-pipeline", PipelineEvent { kind, content });
            }
            Parsed::AuthError(msg) => return Ok(Outcome::AuthRejected(msg)),
            Parsed::Ignore => {}
        }
    }
}

#[derive(Debug, PartialEq)]
enum Parsed {
    Event(String, Value),
    AuthError(String),
    Ignore,
}

/// Messages look like `{"type":"friend-online","content":"{\"userId\":…}"}`;
/// errors look like `{"err":"…"}`.
fn parse_message(text: &str) -> Parsed {
    let Ok(outer) = serde_json::from_str::<Value>(text) else { return Parsed::Ignore };
    if let Some(err) = outer.get("err").and_then(Value::as_str) {
        return Parsed::AuthError(format!("VRChat rejected the live connection: {err}"));
    }
    let Some(kind) = outer.get("type").and_then(Value::as_str) else { return Parsed::Ignore };
    if !FORWARDED.contains(&kind) {
        return Parsed::Ignore;
    }
    // `content` is a JSON document encoded as a string.
    let content = match outer.get("content") {
        Some(Value::String(s)) => serde_json::from_str(s).unwrap_or(Value::Null),
        Some(v) => v.clone(),
        None => Value::Null,
    };
    Parsed::Event(kind.to_string(), content)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_string_content() {
        let msg = r#"{"type":"friend-add","content":"{\"userId\":\"usr_1\",\"user\":{\"displayName\":\"Bob\"}}"}"#;
        match parse_message(msg) {
            Parsed::Event(kind, content) => {
                assert_eq!(kind, "friend-add");
                assert_eq!(content["userId"], "usr_1");
                assert_eq!(content["user"]["displayName"], "Bob");
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn ignores_other_events_and_garbage() {
        assert_eq!(parse_message(r#"{"type":"notification","content":"{}"}"#), Parsed::Ignore);
        assert_eq!(parse_message("not json"), Parsed::Ignore);
    }

    #[test]
    fn reports_auth_errors() {
        assert!(matches!(parse_message(r#"{"err":"authToken doesn't correspond with an active session"}"#), Parsed::AuthError(_)));
    }
}
