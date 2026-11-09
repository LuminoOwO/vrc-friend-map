//! Login through VRChat's own website. The user signs in on vrchat.com inside
//! an embedded webview (any method the site offers, including 2FA); the app
//! only picks up the resulting session cookie and never sees a password.
//!
//! Desktop: a separate "login" window. Mobile (single webview): the main
//! webview navigates to vrchat.com and comes back after login.

use crate::AppState;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, Runtime, Url, WebviewWindow};
use tokio::sync::Mutex;

pub const LOGIN_URL: &str = "https://vrchat.com/home/login";
const COOKIE_URLS: [&str; 3] = [
    "https://vrchat.com/api/1/auth/user",
    "https://vrchat.com/home",
    "https://api.vrchat.cloud/api/1/auth/user",
];
const LOGIN_TIMEOUT: Duration = Duration::from_secs(20 * 60);

#[derive(Default)]
pub struct LoginState {
    running: AtomicBool,
    cancel: AtomicBool,
    /// Where the main webview should return to on mobile.
    #[cfg_attr(desktop, allow(dead_code))]
    app_url: Mutex<Option<Url>>,
}

#[derive(Clone, serde::Serialize)]
struct LoginEvent {
    ok: bool,
    message: String,
}

fn login_webview<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    #[cfg(desktop)]
    {
        app.get_webview_window("login")
    }
    #[cfg(mobile)]
    {
        app.get_webview_window("main")
    }
}

fn is_vrchat_page(url: &Url) -> bool {
    matches!(url.host_str(), Some("vrchat.com") | Some("www.vrchat.com"))
}

pub async fn start<R: Runtime>(app: AppHandle<R>, state: Arc<AppState>) -> Result<(), String> {
    let login_url: Url = LOGIN_URL.parse().map_err(|e: url::ParseError| e.to_string())?;

    #[cfg(desktop)]
    {
        if let Some(w) = app.get_webview_window("login") {
            let _ = w.set_focus();
        } else {
            tauri::WebviewWindowBuilder::new(&app, "login", tauri::WebviewUrl::External(login_url))
                .title("Log in to VRChat")
                .inner_size(520.0, 780.0)
                .min_inner_size(380.0, 520.0)
                // Let sign-in popups (e.g. a third-party login button) open as
                // linked windows that share the login session.
                .on_new_window(|_url, _features| tauri::webview::NewWindowResponse::Allow)
                .build()
                .map_err(|e| e.to_string())?;
        }
    }
    #[cfg(mobile)]
    {
        let main = app.get_webview_window("main").ok_or("main window missing")?;
        let current = main.url().map_err(|e| e.to_string())?;
        if !is_vrchat_page(&current) {
            *state.login.app_url.lock().await = Some(current);
        }
        main.navigate(login_url).map_err(|e| e.to_string())?;
    }

    state.login.cancel.store(false, Ordering::SeqCst);
    if !state.login.running.swap(true, Ordering::SeqCst) {
        let app2 = app.clone();
        let state2 = state.clone();
        tauri::async_runtime::spawn(async move {
            let result = poll(&app2, &state2).await;
            state2.login.running.store(false, Ordering::SeqCst);
            finish(&app2, &state2).await;
            let event = match result {
                Ok(name) => LoginEvent { ok: true, message: name },
                Err(msg) => LoginEvent { ok: false, message: msg },
            };
            let _ = app2.emit("login-finished", event);
        });
    }
    Ok(())
}

pub async fn cancel<R: Runtime>(app: AppHandle<R>, state: Arc<AppState>) {
    state.login.cancel.store(true, Ordering::SeqCst);
    if !state.login.running.load(Ordering::SeqCst) {
        finish(&app, &state).await;
    }
}

/// Close the login window, or bring the main webview back to the app.
async fn finish<R: Runtime>(app: &AppHandle<R>, state: &Arc<AppState>) {
    #[cfg(desktop)]
    {
        let _ = state;
        if let Some(w) = app.get_webview_window("login") {
            let _ = w.destroy();
        }
    }
    #[cfg(mobile)]
    {
        if let Some(main) = app.get_webview_window("main") {
            let on_vrchat = main.url().map(|u| is_vrchat_page(&u)).unwrap_or(false);
            if on_vrchat {
                if let Some(url) = state.login.app_url.lock().await.clone() {
                    let _ = main.navigate(url);
                }
            }
        }
    }
}

/// Read cookies off the main thread (WebView2 deadlocks otherwise).
async fn read_cookies<R: Runtime>(w: WebviewWindow<R>) -> (Option<String>, Option<String>) {
    tauri::async_runtime::spawn_blocking(move || {
        let mut auth = None;
        let mut two_factor = None;
        for u in COOKIE_URLS {
            let Ok(url) = u.parse::<Url>() else { continue };
            if let Ok(cookies) = w.cookies_for_url(url) {
                for c in cookies {
                    match c.name() {
                        "auth" if auth.is_none() && !c.value().is_empty() => {
                            auth = Some(c.value().to_string())
                        }
                        "twoFactorAuth" if two_factor.is_none() && !c.value().is_empty() => {
                            two_factor = Some(c.value().to_string())
                        }
                        _ => {}
                    }
                }
            }
        }
        (auth, two_factor)
    })
    .await
    .unwrap_or((None, None))
}

async fn poll<R: Runtime>(app: &AppHandle<R>, state: &Arc<AppState>) -> Result<String, String> {
    let started = Instant::now();
    let mut last_checked: Option<(String, Option<String>)> = None;
    let mut last_check_at = Instant::now() - Duration::from_secs(60);
    let mut seen_vrchat = false;

    loop {
        tokio::time::sleep(Duration::from_millis(1500)).await;
        if state.login.cancel.load(Ordering::SeqCst) {
            return Err("Login cancelled".into());
        }
        if started.elapsed() > LOGIN_TIMEOUT {
            return Err("Login timed out".into());
        }
        let Some(w) = login_webview(app) else {
            return Err("Login window closed".into());
        };
        let on_vrchat = w.url().map(|u| is_vrchat_page(&u)).unwrap_or(false);
        if on_vrchat {
            seen_vrchat = true;
        } else if seen_vrchat && cfg!(mobile) {
            // The user pressed back and returned to the app.
            return Err("Login cancelled".into());
        }

        let (auth, two_factor) = read_cookies(w).await;
        let Some(auth) = auth else { continue };
        let pair = (auth.clone(), two_factor.clone());
        let changed = last_checked.as_ref() != Some(&pair);
        // Re-check an unchanged cookie only every 10 s (user may be entering a 2FA code).
        if !changed && last_check_at.elapsed() < Duration::from_secs(10) {
            continue;
        }
        last_checked = Some(pair);
        last_check_at = Instant::now();
        match state.api.validate_and_store(&auth, two_factor.as_deref()).await {
            Ok(Some(info)) => return Ok(info.display_name.unwrap_or_default()),
            Ok(None) => continue,
            Err(e) => {
                let _ = app.emit(
                    "login-progress",
                    LoginEvent { ok: false, message: e },
                );
            }
        }
    }
}
