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
/// The window stayed hidden at start ("Start in the tray"); cleared once it's shown.
static STARTED_HIDDEN: AtomicBool = AtomicBool::new(false);
/// Set by "Quit" so the close that follows isn't intercepted.
static QUITTING: AtomicBool = AtomicBool::new(false);
/// "Muted until 18:30" (shown in the menu), or None when not muted.
static MUTED: Mutex<Option<String>> = Mutex::new(None);
/// "12 friends online" and starred friends online (id, name) for the menu.
static EXTRAS: Mutex<(Option<String>, Vec<(String, String)>)> = Mutex::new((None, Vec::new()));

#[cfg(desktop)]
fn build_menu<R: Runtime, M: Manager<R>>(app: &M) -> tauri::Result<Menu<R>> {
    let muted = MUTED.lock().ok().and_then(|m| m.clone());
    let open = MenuItem::with_id(app, "open", "Open VRC Friend Map", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let (online, people) = EXTRAS.lock().map(|e| e.clone()).unwrap_or_default();
    let mut items: Vec<Box<dyn tauri::menu::IsMenuItem<R>>> = vec![Box::new(open), Box::new(sep1)];
    if let Some(label) = online {
        items.push(Box::new(MenuItem::with_id(
            app,
            "online",
            &label,
            false,
            None::<&str>,
        )?));
    }
    if !people.is_empty() {
        let entries: Vec<MenuItem<R>> = people
            .iter()
            .take(15)
            .map(|(id, name)| {
                MenuItem::with_id(app, format!("person:{id}"), name, true, None::<&str>)
            })
            .collect::<tauri::Result<_>>()?;
        let refs: Vec<&dyn tauri::menu::IsMenuItem<R>> = entries
            .iter()
            .map(|m| m as &dyn tauri::menu::IsMenuItem<R>)
            .collect();
        items.push(Box::new(Submenu::with_id_and_items(
            app,
            "starred",
            "Starred friends online",
            true,
            &refs,
        )?));
    }
    items.push(Box::new(Submenu::with_id_and_items(
        app,
        "status",
        "Your status",
        true,
        &[
            &MenuItem::with_id(app, "status:join me", "Join me", true, None::<&str>)?,
            &MenuItem::with_id(app, "status:active", "Online", true, None::<&str>)?,
            &MenuItem::with_id(app, "status:ask me", "Ask me", true, None::<&str>)?,
            &MenuItem::with_id(app, "status:busy", "Busy", true, None::<&str>)?,
        ],
    )?));
    items.push(Box::new(MenuItem::with_id(
        app,
        "sync",
        "Sync now",
        true,
        None::<&str>,
    )?));
    items.push(Box::new(PredefinedMenuItem::separator(app)?));
    match muted {
        Some(label) => {
            items.push(Box::new(MenuItem::with_id(
                app,
                "status",
                &label,
                false,
                None::<&str>,
            )?));
            items.push(Box::new(MenuItem::with_id(
                app,
                "unmute",
                "Unmute notifications",
                true,
                None::<&str>,
            )?));
        }
        None => {
            items.push(Box::new(Submenu::with_id_and_items(
                app,
                "mute",
                "Mute notifications",
                true,
                &[
                    &MenuItem::with_id(app, "mute:30", "For 30 minutes", true, None::<&str>)?,
                    &MenuItem::with_id(app, "mute:60", "For 1 hour", true, None::<&str>)?,
                    &MenuItem::with_id(app, "mute:240", "For 4 hours", true, None::<&str>)?,
                    &MenuItem::with_id(app, "mute:480", "For 8 hours", true, None::<&str>)?,
                    &MenuItem::with_id(
                        app,
                        "mute:tomorrow",
                        "Until tomorrow morning",
                        true,
                        None::<&str>,
                    )?,
                    &MenuItem::with_id(
                        app,
                        "mute:forever",
                        "Until I turn it back on",
                        true,
                        None::<&str>,
                    )?,
                ],
            )?));
        }
    }
    items.push(Box::new(sep2));
    items.push(Box::new(quit));
    let refs: Vec<&dyn tauri::menu::IsMenuItem<R>> = items.iter().map(|b| b.as_ref()).collect();
    Menu::with_items(app, &refs)
}

pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    STARTED_HIDDEN.store(false, Ordering::SeqCst);
    if let Some(w) = app.get_webview_window("main") {
        #[cfg(desktop)]
        let _ = w.unminimize();
        let _ = w.show();
        focus_main(&w);
        // The page pauses drawing while hidden (src/appvisible.ts).
        let _ = w.emit("window-shown", ());
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
                    _ if id.starts_with("status:") => {
                        let _ = app.emit("tray-action", id);
                    }
                    "unmute" | "sync" => {
                        let _ = app.emit("tray-action", id);
                    }
                    _ if id.starts_with("person:") => {
                        show_main(app);
                        let _ = app.emit("tray-action", id);
                    }
                    _ if id.starts_with("mute:") => {
                        let _ = app.emit("tray-action", id);
                    }
                    _ => {}
                }
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
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
    let WindowEvent::CloseRequested { api, .. } = event else {
        return;
    };
    if QUITTING.load(Ordering::SeqCst)
        || !AVAILABLE.load(Ordering::SeqCst)
        || window.label() != "main"
    {
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

/// The flag file for "Start in the tray" (read before the page loads, so the window never flashes).
fn start_hidden_file(data_dir: &std::path::Path) -> std::path::PathBuf {
    data_dir.join("start-in-tray")
}

/// At start (desktop): create the main window (the platform configs say `"create": false`),
/// hidden only when "Start in the tray" is on and there is a tray icon to bring it back with.
/// It must be *created* visible otherwise: a Chromium (CEF) window created hidden and shown
/// later on Linux never got the keyboard (clicks worked, no key reached the page; 0.14.0).
/// Chromium on Linux only hands the keyboard to a page whose window was created visible (one
/// created hidden and shown later took clicks but no keys), so there "Start in the tray" creates
/// the window visible and hides it right away.
const CREATE_VISIBLE: bool = cfg!(all(target_os = "linux", feature = "chromium"));

pub fn startup_window<R: Runtime>(app: &AppHandle<R>, data_dir: Option<&std::path::Path>) {
    let hidden = AVAILABLE.load(Ordering::SeqCst) && data_dir.is_some_and(|d| start_hidden_file(d).exists());
    STARTED_HIDDEN.store(hidden, Ordering::SeqCst);
    let w = match app.get_webview_window("main") {
        Some(w) => {
            if !hidden {
                let _ = w.show();
            }
            Some(w)
        }
        None => app
            .config()
            .app
            .windows
            .iter()
            .find(|c| c.label == "main")
            .cloned()
            .and_then(|c| match tauri::WebviewWindowBuilder::from_config(app, &c).and_then(|b| b.visible(!hidden || CREATE_VISIBLE).build()) {
                Ok(w) => {
                    if hidden && CREATE_VISIBLE {
                        let _ = w.hide();
                    }
                    Some(w)
                }
                Err(e) => {
                    eprintln!("can't create the main window: {e}");
                    None
                }
            }),
    };
    if let (Some(w), false) = (w, hidden) {
        focus_main(&w);
    }
}

/// Bring the main window to the front. Not in the Chromium build on Linux: there, the window
/// focus call (raise + focus through winit) left the keyboard with the window itself, so clicks
/// still reached the page but no key did, not even Esc (0.14.0). Showing the window is enough:
/// the window manager focuses it, and Chromium then gets the keyboard as usual.
fn focus_main<R: Runtime>(w: &WebviewWindow<R>) {
    #[cfg(not(all(target_os = "linux", feature = "chromium")))]
    let _ = w.set_focus();
    #[cfg(all(target_os = "linux", feature = "chromium"))]
    let _ = w;
}

/// Whether the window is still hidden after starting in the tray (the page then draws nothing).
#[tauri::command]
pub fn window_started_hidden() -> bool {
    STARTED_HIDDEN.load(Ordering::SeqCst)
}

/// "Start in the tray" on or off: kept as a file the next start reads before the page loads.
#[tauri::command]
pub fn tray_set_start_hidden<R: Runtime>(app: AppHandle<R>, on: bool) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let file = start_hidden_file(&dir);
    if on {
        std::fs::write(&file, b"1").map_err(|e| e.to_string())
    } else {
        match std::fs::remove_file(&file) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
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

/// The menu's extra lines: how many friends are online, starred ones online.
#[tauri::command]
pub fn tray_set_extras<R: Runtime>(
    app: AppHandle<R>,
    online: Option<String>,
    people: Vec<(String, String)>,
) -> Result<(), String> {
    if let Ok(mut e) = EXTRAS.lock() {
        *e = (
            online.map(|s| s.chars().take(60).collect()),
            people
                .into_iter()
                .take(15)
                .map(|(i, n)| (i.chars().take(64).collect(), n.chars().take(40).collect()))
                .collect(),
        );
    }
    #[cfg(desktop)]
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let menu = build_menu(&app).map_err(|e| e.to_string())?;
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
        let tip = EXTRAS
            .lock()
            .ok()
            .and_then(|e| e.0.clone())
            .map(|o| format!("VRC Friend Map · {o}"))
            .unwrap_or_else(|| "VRC Friend Map".into());
        let _ = tray.set_tooltip(Some(tip));
    }
    Ok(())
}

#[tauri::command]
pub fn window_hide<R: Runtime>(window: WebviewWindow<R>) {
    let _ = window.hide();
    let _ = window.emit("window-hidden", ());
}

/// F11: real fullscreen for the window (not Chromium's page fullscreen).
#[tauri::command]
pub fn window_toggle_fullscreen<R: Runtime>(window: WebviewWindow<R>) {
    #[cfg(desktop)]
    {
        let on = window.is_fullscreen().unwrap_or(false);
        let _ = window.set_fullscreen(!on);
    }
    #[cfg(not(desktop))]
    let _ = window;
}

#[tauri::command]
pub fn app_quit<R: Runtime>(app: AppHandle<R>) {
    quit(&app);
}
