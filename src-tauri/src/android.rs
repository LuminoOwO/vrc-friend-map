//! Android-only bits that need native code: the background service (stay
//! connected while the app is in the background), screen refresh rate, the
//! home-screen widget, UnifiedPush (Sunup, ntfy…), and text shared to the
//! app. The Kotlin side is packaging/android/kotlin/VfmPlugin.kt, copied into
//! the generated Android project by scripts/android-patch.mjs. Reading
//! VRChat's logs with root is plain Rust (`su`).
//!
//! The UI calls these app commands; on other platforms they answer with an
//! error ("only on Android").

use serde_json::Value;
use tauri::{AppHandle, Runtime};

#[cfg(target_os = "android")]
pub struct Vfm<R: Runtime>(pub tauri::plugin::PluginHandle<R>);

pub fn plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("vfm-android")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                use tauri::Manager;
                let handle = _api.register_android_plugin("app.vrcfriendmap", "VfmPlugin")?;
                _app.manage(Vfm(handle));
            }
            Ok(())
        })
        .build()
}

/// Call a command of the Kotlin plugin.
#[allow(unused_variables)]
pub fn call<R: Runtime>(app: &AppHandle<R>, command: &str, args: Value) -> Result<Value, String> {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        let vfm = app
            .try_state::<Vfm<R>>()
            .ok_or("the Android plugin isn't loaded")?;
        return vfm
            .0
            .run_mobile_plugin::<Value>(command, args)
            .map_err(|e| e.to_string());
    }
    #[cfg(not(target_os = "android"))]
    Err("only on Android".into())
}

/// VRChat's log files on this phone or Quest, read with root (`su`), copied
/// into `dest` so the normal log scan reads them. Returns how many files.
pub fn root_copy_logs(dest: &std::path::Path) -> Result<usize, String> {
    #[cfg(target_os = "android")]
    {
        use std::process::Command;
        let su = |cmd: &str| -> Result<String, String> {
            let out = Command::new("su")
                .args(["-c", cmd])
                .output()
                .map_err(|e| format!("no root access ({e})"))?;
            if !out.status.success() {
                return Err(format!(
                    "root command failed: {}",
                    String::from_utf8_lossy(&out.stderr).trim()
                ));
            }
            Ok(String::from_utf8_lossy(&out.stdout).into_owned())
        };
        // VRChat's packages (Quest, Android phones), and their log folders.
        let pkgs = su("ls -d /sdcard/Android/data/com.vrchat* /data/media/0/Android/data/com.vrchat* 2>/dev/null")?;
        std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
        let mut n = 0;
        for dir in pkgs.lines().map(str::trim).filter(|l| !l.is_empty()) {
            let files = su(&format!("ls {dir}/files/ 2>/dev/null")).unwrap_or_default();
            for f in files
                .lines()
                .map(str::trim)
                .filter(|f| f.starts_with("output_log_") && f.ends_with(".txt"))
            {
                if f.contains('/') || f.contains("..") || f.contains('\'') {
                    continue;
                }
                let bytes = Command::new("su")
                    .args(["-c", &format!("cat '{dir}/files/{f}'")])
                    .output()
                    .map_err(|e| e.to_string())?
                    .stdout;
                let target = dest.join(f);
                let same = std::fs::metadata(&target)
                    .map(|m| m.len() == bytes.len() as u64)
                    .unwrap_or(false);
                if !same {
                    std::fs::write(&target, &bytes).map_err(|e| e.to_string())?;
                }
                n += 1;
            }
        }
        if n == 0 {
            return Err(
                "root works, but no VRChat log files were found (is VRChat installed here?)".into(),
            );
        }
        Ok(n)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = dest;
        Err("only on Android".into())
    }
}
