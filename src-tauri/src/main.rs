// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    linux_rendering();
    vrc_friend_map_lib::run()
}

/// WebKitGTK's DMA-BUF renderer makes the map's canvas several times slower
/// (measured 17-22 fps vs 66-73 fps for the same drawing) and is known to
/// misbehave with NVIDIA drivers. The older path is still GPU-composited.
/// Must happen before GTK/WebKit start. To keep WebKit's default, start with
/// VRC_FRIEND_MAP_DMABUF=1; anything you set yourself is left alone.
#[cfg(target_os = "linux")]
fn linux_rendering() {
    let keep_default = std::env::var_os("VRC_FRIEND_MAP_DMABUF").is_some_and(|v| v != "0");
    if !keep_default && std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        // Single-threaded here: nothing else reads the environment yet.
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
}
