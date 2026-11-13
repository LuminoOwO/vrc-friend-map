//! Mouse wheel fallback for X11 (Linux).
//!
//! On some X servers (seen on XLibre) Chromium's window inside the app never
//! gets usable scroll events: Chromium ignores the X server's emulated wheel
//! buttons and expects separate smooth-scroll values that don't arrive. This
//! listens to the X server directly for wheel buttons (XInput2 raw events, which
//! every program may watch) while the pointer is over the app's window and
//! passes them to the page as "native-wheel" events. The page uses them only
//! when no normal wheel event came at the same time, so nothing scrolls twice.
//!
//! Off unless the app is started with `--wheel-fix` (or
//! VRC_FRIEND_MAP_WHEEL_FIX=1), or Settings → Diagnostics turns it on.

use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};

static ENABLED: AtomicBool = AtomicBool::new(false);
static STARTED: AtomicBool = AtomicBool::new(false);
/// The listener runs (an X11 display and XInput2 were found).
static RUNNING: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Serialize)]
struct NativeWheel {
    /// Pointer position in the window, CSS pixels.
    x: f64,
    y: f64,
    /// Wheel steps: +1 down / right, -1 up / left.
    dx: i32,
    dy: i32,
}

#[derive(Serialize)]
pub struct WheelFixState {
    enabled: bool,
    running: bool,
    /// Started with --wheel-fix or the environment variable.
    forced: bool,
}

pub fn forced_on() -> bool {
    std::env::args().any(|a| a == "--wheel-fix") || std::env::var("VRC_FRIEND_MAP_WHEEL_FIX").is_ok_and(|v| v == "1")
}

pub fn set_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) {
    ENABLED.store(on || forced_on(), Ordering::SeqCst);
    if ENABLED.load(Ordering::SeqCst) && !STARTED.swap(true, Ordering::SeqCst) {
        start(app.clone());
    }
}

#[tauri::command]
pub fn wheel_fix_set<R: Runtime>(app: AppHandle<R>, enabled: bool) -> WheelFixState {
    set_enabled(&app, enabled);
    // Give the listener a moment to find the X server before reporting.
    std::thread::sleep(std::time::Duration::from_millis(150));
    wheel_fix_state()
}

#[tauri::command]
pub fn wheel_fix_state() -> WheelFixState {
    WheelFixState { enabled: ENABLED.load(Ordering::SeqCst), running: RUNNING.load(Ordering::SeqCst), forced: forced_on() }
}

#[cfg(not(all(target_os = "linux", desktop)))]
fn start<R: Runtime>(_app: AppHandle<R>) {}

#[cfg(all(target_os = "linux", desktop))]
fn start<R: Runtime>(app: AppHandle<R>) {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    let Some(window) = app.get_webview_window("main") else { return };
    let xid = match window.window_handle().map(|h| h.as_raw()) {
        Ok(RawWindowHandle::Xlib(h)) => h.window,
        Ok(RawWindowHandle::Xcb(h)) => h.window.get() as std::os::raw::c_ulong,
        _ => {
            eprintln!("VRC Friend Map: wheel fix: not an X11 window, nothing to do");
            return;
        }
    };
    std::thread::Builder::new()
        .name("wheel-fix".into())
        .spawn(move || {
            if let Err(e) = listen(&app, xid) {
                eprintln!("VRC Friend Map: wheel fix unavailable: {e}");
            }
            RUNNING.store(false, Ordering::SeqCst);
        })
        .ok();
}

#[cfg(all(target_os = "linux", desktop))]
fn listen<R: Runtime>(app: &AppHandle<R>, our: std::os::raw::c_ulong) -> Result<(), String> {
    x11::listen(our, &ENABLED, &RUNNING, |x, y, dx, dy| {
        let scale = app.get_webview_window("main").and_then(|w| w.scale_factor().ok()).unwrap_or(1.0);
        let _ = app.emit("native-wheel", NativeWheel { x: x as f64 / scale, y: y as f64 / scale, dx, dy });
    })
}

#[cfg(all(target_os = "linux", desktop))]
#[path = "wheelfix_x11.rs"]
mod x11;
