//! Tray icon (desktop): the app keeps running in the background when the
//! window is closed to the tray (live updates, game logs, notifications; the
//! page draws nothing while hidden). The menu opens the window, mutes
//! notifications for a while, or quits. What happens when the window is
//! closed is the frontend's `closeAction` setting, mirrored here so a close
//! works even if the page is busy.
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::Mutex;

#[cfg(desktop)]
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
#[cfg(desktop)]
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindow, WindowEvent};

#[cfg(desktop)]
const TRAY_ID: &str = "main";

/// The tray icon exists (it can fail, e.g. no StatusNotifier host on a bare X11 desktop).
static AVAILABLE: AtomicBool = AtomicBool::new(false);
/// 0 = ask (the page shows a dialog), 1 = hide to the tray, 2 = quit.
static CLOSE_ACTION: AtomicU8 = AtomicU8::new(0);
/// Set by "Quit" so the close that follows isn't intercepted.
static QUITTING: AtomicBool = AtomicBool::new(false);
/// "Muted until 18:30" (shown in the menu), or None when not muted.
static MUTED: Mutex<Option<String>> = Mutex::new(None);

#[cfg(desktop)]
fn build_menu<R: Runtime, M: Manager<R>>(app: &M) -> tauri::Result<Menu<R>> {
    let muted = MUTED.lock().ok().and_then(|m| m.clone());
    let open = MenuItem::with_id(app, "open", "Open VRC Friend Map", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    match muted {
        Some(label) => {
            let status = MenuItem::with_id(app, "status", &label, false, None::<&str>)?;
            let unmute = MenuItem::with_id(app, "unmute", "Unmute notifications", true, None::<&str>)?;
            Menu::with_items(app, &[&open, &sep1, &status, &unmute, &sep2, &quit])
        }
        None => {
            let mute = Submenu::with_id_and_items(
                app,
                "mute",
                "Mute notifications",
                true,
                &[
                    &MenuItem::with_id(app, "mute:30", "For 30 minutes", true, None::<&str>)?,
                    &MenuItem::with_id(app, "mute:60", "For 1 hour", true, None::<&str>)?,
                    &MenuItem::with_id(app, "mute:240", "For 4 hours", true, None::<&str>)?,
                    &MenuItem::with_id(app, "mute:480", "For 8 hours", true, None::<&str>)?,
                    &MenuItem::with_id(app, "mute:tomorrow", "Until tomorrow morning", true, None::<&str>)?,
                    &MenuItem::with_id(app, "mute:forever", "Until I turn it back on", true, None::<&str>)?,
                ],
            )?;
            Menu::with_items(app, &[&open, &sep1, &mute, &sep2, &quit])
        }
    }
}

pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        #[cfg(desktop)]
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub fn quit<R: Runtime>(app: &AppHandle<R>) {
    QUITTING.store(true, Ordering::SeqCst);
    crate::single::release();
    app.exit(0);
}

/// Creates the tray icon. Errors are only logged: without a tray, closing quits.
#[cfg(desktop)]
pub fn setup<R: Runtime>(app: &AppHandle<R>) {
    let result = (|| -> tauri::Result<()> {
        let menu = build_menu(app)?;
        let mut builder = TrayIconBuilder::with_id(TRAY_ID)
            .tooltip("VRC Friend Map")
            .menu(&menu)
            .show_menu_on_left_click(false)
            .on_menu_event(|app, event| {
                let id = event.id.as_ref();
                match id {
                    "open" => show_main(app),
                    "quit" => quit(app),
                    "unmute" => {
                        let _ = app.emit("tray-action", "unmute");
                    }
                    _ if id.starts_with("mute:") => {
                        let _ = app.emit("tray-action", id);
                    }
                    _ => {}
                }
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                    show_main(tray.app_handle());
                }
            });
        if let Some(icon) = app.default_window_icon() {
            builder = builder.icon(icon.clone());
        }
        builder.build(app)?;
        Ok(())
    })();
    match result {
        Ok(()) => AVAILABLE.store(true, Ordering::SeqCst),
        Err(e) => eprintln!("VRC Friend Map: no tray icon ({e}); closing the window will quit"),
    }
}

/// Window close: hide to the tray, quit, or ask the page.
pub fn on_window_event<R: Runtime>(window: &tauri::Window<R>, event: &WindowEvent) {
    let WindowEvent::CloseRequested { api, .. } = event else { return };
    if QUITTING.load(Ordering::SeqCst) || !AVAILABLE.load(Ordering::SeqCst) || window.label() != "main" {
        return; // close normally
    }
    match CLOSE_ACTION.load(Ordering::SeqCst) {
        2 => quit(window.app_handle()),
        1 => {
            api.prevent_close();
            let _ = window.hide();
            let _ = window.emit("window-hidden", ());
        }
        _ => {
            api.prevent_close();
            let _ = window.emit("close-requested", ());
        }
    }
}

#[tauri::command]
pub fn tray_available() -> bool {
    AVAILABLE.load(Ordering::SeqCst)
}

#[tauri::command]
pub fn tray_set_close_action(action: String) {
    let v = match action.as_str() {
        "tray" => 1,
        "quit" => 2,
        _ => 0,
    };
    CLOSE_ACTION.store(v, Ordering::SeqCst);
}

/// `label`: "Muted until 18:30", or None when notifications are on.
#[tauri::command]
pub fn tray_set_muted<R: Runtime>(app: AppHandle<R>, label: Option<String>) -> Result<(), String> {
    if let Ok(mut m) = MUTED.lock() {
        *m = label;
    }
    #[cfg(desktop)]
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let menu = build_menu(&app).map_err(|e| e.to_string())?;
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn window_hide<R: Runtime>(window: WebviewWindow<R>) {
    let _ = window.hide();
    let _ = window.emit("window-hidden", ());
}

#[tauri::command]
pub fn app_quit<R: Runtime>(app: AppHandle<R>) {
    quit(&app);
}
