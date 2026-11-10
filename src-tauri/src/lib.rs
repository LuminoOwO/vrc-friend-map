mod api;
mod auth;
mod gamelogs;
mod images;
mod pipeline;
mod storage;

use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

pub struct AppState {
    pub api: api::ApiClient,
    pub login: auth::LoginState,
    pub pipeline: pipeline::PipelineState,
    pub store: storage::Store,
    pub logs: gamelogs::LogStore,
    pub image_dir: PathBuf,
    pub data_dir: PathBuf,
}

type AppStateRef<'a> = State<'a, Arc<AppState>>;

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
async fn logout(app: AppHandle, state: AppStateRef<'_>) -> Result<(), String> {
    pipeline::stop(&app, &state);
    state.api.server_logout().await;
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

#[tauri::command]
async fn logs_clear(state: AppStateRef<'_>) -> Result<(), String> {
    state.logs.clear()
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // One TLS crypto backend for both HTTPS and the WebSocket connection.
    let _ = rustls::crypto::ring::default_provider().install_default();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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
                image_dir,
                data_dir,
            }));
            Ok(())
        })
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
            storage_info,
            clear_image_cache,
            hash_ids,
            save_export,
        ])
        .run(tauri::generate_context!())
        .expect("error while running VRC Friend Map");
}
