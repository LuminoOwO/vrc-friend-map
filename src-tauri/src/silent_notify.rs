//! System notifications without the system's sound (Linux): the app plays its
//! own sound for each event, so the desktop's notification sound would play
//! on top of it. The notification plugin can't ask for silence there; the
//! Desktop Notifications spec's "suppress-sound" hint does. Windows and macOS
//! are already silent when no sound is given, so they keep using the plugin.

#[tauri::command]
pub fn notify_silent(title: String, body: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        std::thread::spawn(move || {
            let result = notify_rust::Notification::new()
                .appname("VRC Friend Map")
                .summary(&title)
                .body(&body)
                .icon("vrc-friend-map")
                .hint(notify_rust::Hint::SuppressSound(true))
                .hint(notify_rust::Hint::DesktopEntry("vrc-friend-map".into()))
                .show();
            if let Err(e) = result {
                eprintln!("VRC Friend Map: notification failed: {e}");
            }
        });
        Ok(())
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (title, body);
        Err("only on Linux".into())
    }
}
