// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// On the Chromium build the same program also runs Chromium's helper
// processes (renderer, GPU, ...); this attribute handles those and returns early.
#[cfg_attr(feature = "chromium", tauri_runtime_cef::cef_entry_point)]
fn main() {
    // Before the web view starts: pick GPU / software rendering (see graphics.rs).
    vrc_friend_map_lib::graphics::apply_startup();
    vrc_friend_map_lib::run()
}
