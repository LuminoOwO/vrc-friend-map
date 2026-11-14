mod api;
mod auth;
#[cfg(all(target_os = "linux", vfm_gdk_no_wayland))]
mod gdk_stubs;
#[cfg(all(target_os = "linux", feature = "chromium", vfm_gtk4_no_wayland))]
mod gdk4_stubs;
mod gamelogs;
pub mod graphics;
mod images;
mod linkfetch;
mod livelog;
mod pipeline;
mod share;
mod storage;
mod silent_notify;
mod single;
mod tray;
mod wheelfix;

use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

pub struct AppState {
    pub api: api::ApiClient,
    pub login: auth::LoginState,
    pub pipeline: pipeline::PipelineState,
    pub store: storage::Store,
    pub logs: gamelogs::LogStore,
    pub share: share::ShareState,
    pub live: std::sync::Arc<livelog::LiveLog>,
    pub image_dir: PathBuf,
    pub data_dir: PathBuf,
}

type AppStateRef<'a> = State<'a, Arc<AppState>>;

// ---------- sharing through vfm-servers (see share.rs) ----------

async fn me_id(state: &AppState) -> Result<String, String> {
    state.api.session_info().await.user_id.ok_or_else(|| "log in first".to_string())
}

#[tauri::command]
async fn share_identity(state: AppStateRef<'_>) -> Result<share::MyIdentity, String> {
    let me = me_id(&state).await?;
    state.share.my_identity(&me).await
}

#[tauri::command]
async fn share_export_key(state: AppStateRef<'_>) -> Result<String, String> {
    let me = me_id(&state).await?;
    state.share.export_key(&me).await
}

#[tauri::command]
async fn share_import_key(state: AppStateRef<'_>, text: String) -> Result<share::MyIdentity, String> {
    let me = me_id(&state).await?;
    state.share.import_key(&me, &text).await
}

#[tauri::command]
async fn share_info(state: AppStateRef<'_>, url: String) -> Result<share::InfoResult, String> {
    state.share.info(&url).await
}

#[tauri::command]
async fn share_trust_server(state: AppStateRef<'_>, url: String) -> Result<(), String> {
    state.share.trust_server(&url).await
}

#[tauri::command]
async fn share_register(state: AppStateRef<'_>, url: String, invite: Option<String>) -> Result<serde_json::Value, String> {
    let me = me_id(&state).await?;
    state.share.register(&url, &me, invite).await
}

#[tauri::command]
async fn share_me(state: AppStateRef<'_>, url: String) -> Result<serde_json::Value, String> {
    let me = me_id(&state).await?;
    state.share.me(&url, &me).await
}

#[tauri::command]
async fn share_leave(state: AppStateRef<'_>, url: String) -> Result<serde_json::Value, String> {
    let me = me_id(&state).await?;
    state.share.leave(&url, &me).await
}

#[tauri::command]
async fn share_publish(
    state: AppStateRef<'_>,
    url: String,
    kind: String,
    payload: String,
    recipients: Vec<String>,
    encrypt: bool,
) -> Result<share::PublishResult, String> {
    let me = me_id(&state).await?;
    state.share.publish(&url, &me, &kind, &payload, recipients, encrypt).await
}

#[tauri::command]
async fn share_unpublish(state: AppStateRef<'_>, url: String, kind: String) -> Result<serde_json::Value, String> {
    let me = me_id(&state).await?;
    state.share.unpublish(&url, &me, &kind).await
}

#[tauri::command]
async fn share_inbox(state: AppStateRef<'_>, url: String) -> Result<Vec<share::InboxItem>, String> {
    let me = me_id(&state).await?;
    state.share.inbox(&url, &me).await
}

#[tauri::command]
async fn share_pins(state: AppStateRef<'_>) -> Result<serde_json::Value, String> {
    Ok(state.share.pins().await)
}

#[tauri::command]
async fn share_trust_key(state: AppStateRef<'_>, user: String) -> Result<(), String> {
    state.share.trust_key(&user).await
}

#[tauri::command]
async fn logger_pair(state: AppStateRef<'_>, url: String, code: String) -> Result<serde_json::Value, String> {
    let session = state.api.session().await.ok_or("log in first")?;
    state.share.logger_pair(&url, &session.user_id, &code, &session.auth, session.two_factor.clone()).await
}

#[tauri::command]
async fn logger_unpair(state: AppStateRef<'_>, url: String, forget: bool) -> Result<serde_json::Value, String> {
    let me = me_id(&state).await?;
    state.share.logger_unpair(&url, &me, forget).await
}

#[tauri::command]
async fn logger_status(state: AppStateRef<'_>, url: String) -> Result<serde_json::Value, String> {
    let me = me_id(&state).await?;
    state.share.logger_status(&url, &me).await
}

#[tauri::command]
async fn logger_stats(state: AppStateRef<'_>, url: String) -> Result<serde_json::Value, String> {
    let me = me_id(&state).await?;
    state.share.logger_stats(&url, &me).await
}

#[tauri::command]
async fn session_info(state: AppStateRef<'_>) -> Result<api::SessionInfo, String> {
    Ok(state.api.session_info().await)
}

#[tauri::command]
async fn login_start(app: AppHandle, state: AppStateRef<'_>) -> Result<(), String> {
    auth::start(app, state.inner().clone()).await
}

#[tauri::command]
async fn login_cancel(app: AppHandle, state: AppStateRef<'_>) -> Result<(), String> {
    auth::cancel(app, state.inner().clone()).await;
    Ok(())
}

#[tauri::command]
async fn logout(app: AppHandle, state: AppStateRef<'_>, keep_server_session: Option<bool>) -> Result<(), String> {
    pipeline::stop(&app, &state);
    // A paired vfm-server logger uses this same VRChat session; ending it
    // on VRChat's side would stop the logger too.
    if !keep_server_session.unwrap_or(false) {
        state.api.server_logout().await;
    }
    state.api.clear_session().await;
    // Forget the vrchat.com session in the embedded browser too, so the next
    // login asks for credentials again.
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.clear_all_browsing_data();
    }
    Ok(())
}

/// Connect to VRChat's live event stream (friend added/removed, online/offline…).
#[tauri::command]
async fn pipeline_start(app: AppHandle, state: AppStateRef<'_>) -> Result<(), String> {
    if state.api.auth_token().await.is_none() {
        return Err("not logged in".into());
    }
    pipeline::start(app, state.inner().clone());
    Ok(())
}

#[tauri::command]
async fn pipeline_stop(app: AppHandle, state: AppStateRef<'_>) -> Result<(), String> {
    pipeline::stop(&app, &state);
    Ok(())
}

#[tauri::command]
async fn pipeline_connected(state: AppStateRef<'_>) -> Result<bool, String> {
    Ok(pipeline::is_connected(&state))
}

#[tauri::command]
async fn set_api_settings(state: AppStateRef<'_>, settings: api::ApiSettings) -> Result<(), String> {
    state.api.set_settings(settings).await;
    Ok(())
}

#[tauri::command]
async fn vrc_get(
    state: AppStateRef<'_>,
    path: String,
    query: Option<Vec<(String, String)>>,
) -> Result<api::ApiResponse, String> {
    state.api.get(&path, &query.unwrap_or_default()).await
}

#[tauri::command]
async fn store_read(state: AppStateRef<'_>, name: String) -> Result<Option<String>, String> {
    state.store.read(&name)
}

#[tauri::command]
async fn store_write(state: AppStateRef<'_>, name: String, contents: String) -> Result<(), String> {
    state.store.write(&name, &contents)
}

/// Copy a store file into store/backups before a migration or when it was
/// written by a newer version. Keeps the newest 12 backups per file.
#[tauri::command]
async fn store_backup(state: AppStateRef<'_>, name: String, tag: String) -> Result<Option<String>, String> {
    state.store.backup(&name, &tag)
}

#[tauri::command]
fn app_platform() -> &'static str {
    std::env::consts::OS
}

// ---------- VRChat game logs (desktop) ----------

#[tauri::command]
async fn logs_detect() -> Result<Vec<String>, String> {
    Ok(tauri::async_runtime::spawn_blocking(|| {
        gamelogs::detect_dirs().into_iter().map(|p| p.display().to_string()).collect::<Vec<_>>()
    })
    .await
    .map_err(|e| e.to_string())?)
}

#[tauri::command]
async fn logs_scan(state: AppStateRef<'_>, dirs: Vec<String>, retention_days: u32) -> Result<gamelogs::ScanReport, String> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let dirs = gamelogs::dirs_from_strings(&dirs);
        st.logs.scan(&dirs, retention_days, gamelogs::now_naive_fallback())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn logs_info(state: AppStateRef<'_>) -> Result<gamelogs::ScanReport, String> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || st.logs.info()).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn logs_stats(state: AppStateRef<'_>, query: gamelogs::StatsQuery) -> Result<gamelogs::Stats, String> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || st.logs.stats(&query)).await.map_err(|e| e.to_string())?
}

/// People from your game logs who aren't friends, by time with you.
#[tauri::command]
async fn logs_met(state: AppStateRef<'_>, query: gamelogs::MetQuery) -> Result<Vec<gamelogs::MetPerson>, String> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || st.logs.met(&query)).await.map_err(|e| e.to_string())?
}

/// Send (or with `cancel`, take back) one friend request. Only ever called
/// from a button click on that person's profile.
#[tauri::command]
async fn friend_request(state: AppStateRef<'_>, user_id: String, cancel: bool) -> Result<api::ApiResponse, String> {
    state.api.friend_request(&user_id, cancel).await
}

#[tauri::command]
async fn friend_status(state: AppStateRef<'_>, user_id: String) -> Result<api::ApiResponse, String> {
    state.api.friend_status(&user_id).await
}

/// Remove a friend (only from a button click, after confirming).
#[tauri::command]
async fn unfriend(state: AppStateRef<'_>, user_id: String) -> Result<api::ApiResponse, String> {
    state.api.unfriend(&user_id).await
}

/// Save your own profile (only from the Save button in Profile → Edit).
#[tauri::command]
async fn update_profile(state: AppStateRef<'_>, user_id: String, user: serde_json::Value, profile: serde_json::Value) -> Result<Vec<api::ApiResponse>, String> {
    state.api.update_profile(&user_id, user, profile).await
}

/// Block / mute / hide avatar, or undo it (only from a button click).
#[tauri::command]
async fn moderate_user(state: AppStateRef<'_>, user_id: String, kind: String, undo: bool) -> Result<api::ApiResponse, String> {
    state.api.moderate(&user_id, &kind, undo).await
}

#[tauri::command]
async fn logs_clear(state: AppStateRef<'_>) -> Result<(), String> {
    state.logs.clear()
}

/// Start following VRChat's newest log ("who's here right now").
#[tauri::command]
fn live_start(app: AppHandle, state: AppStateRef<'_>, dirs: Vec<String>) -> Result<(), String> {
    let dirs = gamelogs::dirs_from_strings(&dirs);
    let dirs = if dirs.is_empty() { gamelogs::detect_dirs() } else { dirs };
    if dirs.is_empty() {
        return Err("no VRChat log folder found".into());
    }
    state.live.start(app, dirs);
    Ok(())
}

#[tauri::command]
fn live_stop(state: AppStateRef<'_>) {
    state.live.stop();
}

#[tauri::command]
fn live_snapshot(state: AppStateRef<'_>) -> livelog::Snapshot {
    state.live.snapshot()
}

/// Activity-log events (joins, leaves, world changes) after `since`.
#[tauri::command]
fn live_events(state: AppStateRef<'_>, since: u64) -> Vec<livelog::LiveEvent> {
    state.live.events_since(since)
}

#[tauri::command]
fn graphics_get() -> graphics::Info {
    graphics::info()
}

/// Takes effect the next time the app starts (the web view reads it once).
#[tauri::command]
fn graphics_set(mode: String) -> Result<(), String> {
    graphics::save(graphics::Mode::parse(&mode).ok_or("unknown mode")?)
}

/// Let the map run faster than the screen (Chromium build; next start).
#[tauri::command]
fn graphics_set_unlocked(unlocked: bool) -> Result<(), String> {
    graphics::save_unlocked(unlocked)
}

/// Relaunch the app (used to apply a graphics change).
#[tauri::command]
fn app_restart(app: AppHandle) {
    app.restart()
}

#[derive(serde::Serialize)]
struct StorageInfo {
    data_dir: String,
    image_cache_bytes: u64,
}

#[tauri::command]
async fn storage_info(state: AppStateRef<'_>) -> Result<StorageInfo, String> {
    Ok(StorageInfo {
        data_dir: state.data_dir.display().to_string(),
        image_cache_bytes: storage::dir_size(&state.image_dir),
    })
}

#[tauri::command]
async fn clear_image_cache(state: AppStateRef<'_>) -> Result<(), String> {
    let _ = std::fs::remove_dir_all(&state.image_dir);
    std::fs::create_dir_all(&state.image_dir).map_err(|e| e.to_string())
}

#[tauri::command]
async fn hash_ids(salt: String, ids: Vec<String>) -> Result<Vec<String>, String> {
    if salt.len() < 16 {
        return Err("salt too short".into());
    }
    Ok(storage::hash_ids(&salt, &ids))
}

/// Save an export file to the Downloads folder (desktop). Mobile uses copy/paste.
#[tauri::command]
async fn save_export(app: AppHandle, filename: String, contents: String) -> Result<String, String> {
    #[cfg(desktop)]
    {
        let dir = app
            .path()
            .download_dir()
            .or_else(|_| app.path().document_dir())
            .map_err(|e| e.to_string())?;
        let path = dir.join(storage::sanitize_filename(&filename));
        std::fs::write(&path, contents).map_err(|e| e.to_string())?;
        Ok(path.display().to_string())
    }
    #[cfg(mobile)]
    {
        let _ = (app, filename, contents);
        Err("Saving files isn't available on mobile yet. Use Copy instead.".into())
    }
}

/// Save a VRChat image (picture, banner, world, group…) to Downloads/VRC Friend Map.
/// Returns the path it was saved to.
#[tauri::command]
async fn save_image(app: AppHandle, state: AppStateRef<'_>, url: String, name: String) -> Result<String, String> {
    let (bytes, content_type) = images::load(&state, &url).await?;
    let file = format!("{}.{}", storage::sanitize_filename(&name), images::extension(&content_type));
    let mut dirs: Vec<std::path::PathBuf> = Vec::new();
    #[cfg(target_os = "android")]
    {
        // Android 11+ lets apps create their own files in the shared Download folder.
        dirs.push(std::path::PathBuf::from("/storage/emulated/0/Download"));
    }
    if let Ok(d) = app.path().download_dir() {
        dirs.push(d);
    }
    if let Ok(d) = app.path().picture_dir() {
        dirs.push(d);
    }
    if let Ok(d) = app.path().app_data_dir() {
        dirs.push(d.join("saved images"));
    }
    let mut last = String::from("no folder to save to");
    for dir in dirs {
        let dir = if dir.ends_with("saved images") { dir } else { dir.join("VRC Friend Map") };
        if let Err(e) = std::fs::create_dir_all(&dir) {
            last = e.to_string();
            continue;
        }
        let mut path = dir.join(&file);
        // Don't overwrite: name (2).png, name (3).png, ...
        let mut n = 2;
        while path.exists() {
            let stem = file.rsplit_once('.').map(|(a, _)| a).unwrap_or(&file);
            let ext = file.rsplit_once('.').map(|(_, b)| b).unwrap_or("png");
            path = dir.join(format!("{stem} ({n}).{ext}"));
            n += 1;
        }
        match std::fs::write(&path, &bytes) {
            Ok(()) => return Ok(path.display().to_string()),
            Err(e) => last = e.to_string(),
        }
    }
    Err(last)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // A second start shows the running copy instead (before Chromium starts and trips over it).
    if !single::claim() {
        return;
    }
    // One TLS crypto backend for both HTTPS and the WebSocket connection.
    let _ = rustls::crypto::ring::default_provider().install_default();
    let builder = tauri::Builder::default();
    #[cfg(feature = "chromium")]
    let builder = builder.runtime(graphics::chromium_runtime());
    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .register_asynchronous_uri_scheme_protocol("vrcimg", images::handle)
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let cache_dir = app.path().app_cache_dir()?;
            let image_dir = cache_dir.join("images");
            std::fs::create_dir_all(data_dir.join("store"))?;
            std::fs::create_dir_all(&image_dir)?;
            storage::prune_dir(&image_dir, 600 * 1024 * 1024);
            let api = api::ApiClient::new(data_dir.clone())?;
            app.manage(Arc::new(AppState {
                api,
                login: auth::LoginState::default(),
                pipeline: pipeline::PipelineState::default(),
                store: storage::Store { dir: data_dir.join("store") },
                logs: gamelogs::LogStore::new(data_dir.join("gamelogs").join("history.json")),
                live: livelog::LiveLog::new(),
                share: share::ShareState::new(&data_dir, format!("vrc-friend-map/{}", env!("CARGO_PKG_VERSION"))),
                image_dir,
                data_dir,
            }));
            #[cfg(desktop)]
            tray::setup(app.handle());
            {
                let handle = app.handle().clone();
                single::on_show(move || {
                    let h = handle.clone();
                    let _ = handle.run_on_main_thread(move || tray::show_main(&h));
                });
            }
            if wheelfix::forced_on() {
                wheelfix::set_enabled(app.handle(), true);
            }
            Ok(())
        })
        .on_window_event(tray::on_window_event)
        .invoke_handler(tauri::generate_handler![
            session_info,
            login_start,
            login_cancel,
            logout,
            pipeline_start,
            pipeline_stop,
            pipeline_connected,
            set_api_settings,
            vrc_get,
            store_read,
            store_write,
            store_backup,
            app_platform,
            logs_detect,
            logs_scan,
            logs_info,
            logs_stats,
            logs_clear,
            logs_met,
            friend_request,
            friend_status,
            unfriend,
            moderate_user,
            update_profile,
            storage_info,
            live_start,
            live_stop,
            live_snapshot,
            live_events,
            graphics_get,
            graphics_set,
            graphics_set_unlocked,
            app_restart,
            clear_image_cache,
            hash_ids,
            save_export,
            save_image,
            share_identity,
            share_export_key,
            share_import_key,
            share_info,
            share_trust_server,
            share_register,
            share_me,
            share_leave,
            share_publish,
            share_unpublish,
            share_inbox,
            share_pins,
            share_trust_key,
            logger_pair,
            logger_unpair,
            logger_status,
            logger_stats,
            tray::tray_available,
            tray::tray_set_close_action,
            tray::tray_set_muted,
            tray::window_hide,
            tray::app_quit,
            tray::window_toggle_fullscreen,
            wheelfix::wheel_fix_set,
            silent_notify::notify_silent,
            linkfetch::fetch_link_text,
            wheelfix::wheel_fix_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running VRC Friend Map");
}
