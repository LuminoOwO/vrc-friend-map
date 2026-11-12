// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Before the web view starts: pick GPU / software rendering (see graphics.rs).
    vrc_friend_map_lib::graphics::apply_startup();
    vrc_friend_map_lib::run()
}
