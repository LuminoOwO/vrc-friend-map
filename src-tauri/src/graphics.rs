//! Choice between GPU (hardware accelerated) and software rendering for the
//! embedded web view.
//!
//! The web view reads its graphics flags once, when it starts, so the choice is
//! stored in a tiny file (`graphics.json` in the app data folder) that `main`
//! can read before anything else starts. Changing it in Settings takes effect
//! the next time the app is started.
//!
//! Modes:
//! - `auto`: the app's defaults (on Linux: WebKitGTK without its DMA-BUF renderer).
//! - `gpu`: prefer the GPU (on Linux recent WebKitGTK already composites on the GPU, so this
//!   changes little there); also asks for GPU compositing/rasterization even on
//!   GPUs the web view would normally avoid (blocklisted drivers).
//! - `software`: no GPU; draws on the CPU. Slower, but works around broken drivers.
//!
//! `VRC_FRIEND_MAP_GPU=auto|gpu|software` overrides the saved choice. macOS
//! always uses the GPU, so the choice has no effect there.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const IDENTIFIER: &str = "app.vrcfriendmap";
const FILE: &str = "graphics.json";
const ENV_OVERRIDE: &str = "VRC_FRIEND_MAP_GPU";

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    #[default]
    Auto,
    Gpu,
    Software,
}

impl Mode {
    pub fn parse(s: &str) -> Option<Mode> {
        match s.trim().to_ascii_lowercase().as_str() {
            "auto" => Some(Mode::Auto),
            "gpu" | "hardware" | "1" => Some(Mode::Gpu),
            "software" | "cpu" | "0" => Some(Mode::Software),
            _ => None,
        }
    }
}

#[derive(Serialize, Deserialize, Default)]
struct Saved {
    #[serde(default)]
    mode: Mode,
    /// Frame rate above the screen's refresh rate (Chromium build only): no vsync.
    #[serde(default)]
    unlocked: bool,
}

fn load_saved() -> Saved {
    data_dir()
        .and_then(|d| std::fs::read_to_string(d.join(FILE)).ok())
        .and_then(|s| serde_json::from_str::<Saved>(&s).ok())
        .unwrap_or_default()
}

fn write_saved(saved: &Saved) -> Result<(), String> {
    let dir = data_dir().ok_or("no data folder")?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string(saved).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(FILE), json).map_err(|e| e.to_string())
}

/// Whether the saved setting lets the map run faster than the screen.
pub fn load_unlocked() -> bool {
    load_saved().unlocked
}

/// Takes effect on the next start (Chromium build only).
pub fn save_unlocked(unlocked: bool) -> Result<(), String> {
    let mut s = load_saved();
    s.unlocked = unlocked;
    write_saved(&s)
}

/// What this run started with.
static STARTED_UNLOCKED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Where Tauri puts `app_data_dir()`, worked out without Tauri (it isn't running yet).
fn data_dir() -> Option<PathBuf> {
    let base = if cfg!(target_os = "windows") {
        std::env::var_os("APPDATA").map(PathBuf::from)
    } else if cfg!(target_os = "macos") {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Application Support"))
    } else {
        std::env::var_os("XDG_DATA_HOME")
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")))
    };
    base.map(|b| b.join(IDENTIFIER))
}

pub fn load() -> Mode {
    load_saved().mode
}

pub fn save(mode: Mode) -> Result<(), String> {
    let mut s = load_saved();
    s.mode = mode;
    write_saved(&s)
}

/// The mode in force: the environment override if valid, else the saved choice.
pub fn effective(env_override: Option<&str>, saved: Mode) -> (Mode, bool) {
    match env_override.and_then(Mode::parse) {
        Some(m) => (m, true),
        None => (saved, false),
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Os {
    Linux,
    Windows,
    Other,
}

/// Environment variables to set for `mode`. `get` reads the current environment,
/// so variables the user set themselves are left alone (or appended to).
pub fn env_plan(mode: Mode, os: Os, dmabuf_default: bool, get: &dyn Fn(&str) -> Option<String>) -> Vec<(String, Option<String>)> {
    let mut out: Vec<(String, Option<String>)> = Vec::new();
    match os {
        Os::Linux => {
            // WebKitGTK's DMA-BUF renderer makes the map's canvas several times slower
            // (measured 17-22 fps vs 66-73 fps for the same drawing) and is known to
            // misbehave with NVIDIA drivers, so it's off in every mode. To keep WebKit's
            // default, start with VRC_FRIEND_MAP_DMABUF=1; anything you set yourself is left alone.
            if !dmabuf_default && get("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
                out.push(("WEBKIT_DISABLE_DMABUF_RENDERER".into(), Some("1".into())));
            }
            match mode {
                Mode::Auto => {}
                Mode::Gpu => {
                    // Variables the user set themselves are left alone, even if they
                    // contradict this mode.
                    if get("WEBKIT_FORCE_COMPOSITING_MODE").is_none() && get("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
                        out.push(("WEBKIT_FORCE_COMPOSITING_MODE".into(), Some("1".into())));
                    }
                }
                Mode::Software => {
                    if get("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
                        out.push(("WEBKIT_DISABLE_COMPOSITING_MODE".into(), Some("1".into())));
                    }
                    // Not LIBGL_ALWAYS_SOFTWARE: programs we start (the browser) would inherit it.
                }
            }
        }
        Os::Windows => {
            let flags = match mode {
                Mode::Auto => "",
                Mode::Gpu => "--ignore-gpu-blocklist --enable-gpu-rasterization --enable-zero-copy",
                Mode::Software => "--disable-gpu --disable-gpu-compositing",
            };
            if !flags.is_empty() {
                let key = "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS";
                let value = match get(key).filter(|v| !v.trim().is_empty()) {
                    Some(existing) => format!("{existing} {flags}"),
                    None => flags.to_string(),
                };
                out.push((key.into(), Some(value)));
            }
        }
        Os::Other => {}
    }
    out
}

/// Called first thing in `main`, before the web view exists.
pub fn apply_startup() {
    if cfg!(feature = "chromium") {
        return; // Chromium takes its switches in chromium_runtime()
    }
    let (mode, _) = effective(std::env::var(ENV_OVERRIDE).ok().as_deref(), load());
    let os = if cfg!(target_os = "linux") {
        Os::Linux
    } else if cfg!(target_os = "windows") {
        Os::Windows
    } else {
        Os::Other
    };
    let dmabuf_default = std::env::var_os("VRC_FRIEND_MAP_DMABUF").is_some_and(|v| v != "0");
    let plan = env_plan(mode, os, dmabuf_default, &|k| std::env::var(k).ok());
    for (k, v) in plan {
        // Single-threaded here: nothing else reads the environment yet.
        match v {
            Some(v) => std::env::set_var(k, v),
            None => std::env::remove_var(k),
        }
    }
    // WebView2 is Chromium too: the same two switches let it run faster than the screen.
    if matches!(os, Os::Windows) && load_unlocked() {
        STARTED_UNLOCKED.store(true, std::sync::atomic::Ordering::Relaxed);
        let key = "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS";
        let flags = "--disable-gpu-vsync --disable-frame-rate-limit";
        let value = match std::env::var(key).ok().filter(|v| !v.trim().is_empty()) {
            Some(existing) => format!("{existing} {flags}"),
            None => flags.to_string(),
        };
        std::env::set_var(key, value);
    }
}

/// Chromium switches for `mode` (Chromium build only). Auto keeps Chromium's
/// own choices, which use the GPU wherever its driver list allows.
pub fn chromium_switches(mode: Mode) -> Vec<&'static str> {
    match mode {
        Mode::Auto => vec![],
        // Also on GPUs/drivers Chromium would normally avoid.
        Mode::Gpu => vec!["ignore-gpu-blocklist", "enable-gpu-rasterization", "enable-zero-copy"],
        Mode::Software => vec!["disable-gpu", "disable-gpu-compositing"],
    }
}

/// The Chromium (CEF) runtime with the saved graphics choice.
#[cfg(feature = "chromium")]
pub fn chromium_runtime() -> tauri_runtime_cef::Cef {
    let (mode, _) = effective(std::env::var(ENV_OVERRIDE).ok().as_deref(), load());
    let mut cef = tauri_runtime_cef::Cef::default();
    for switch in chromium_switches(mode) {
        cef = cef.command_line_arg(switch, None::<String>);
    }
    if load_unlocked() {
        // No vsync and no frame cap: requestAnimationFrame runs as fast as it can;
        // the map's own limit (Settings → Frame rate) decides the actual rate.
        STARTED_UNLOCKED.store(true, std::sync::atomic::Ordering::Relaxed);
        cef = cef.command_line_arg("disable-gpu-vsync", None::<String>);
        cef = cef.command_line_arg("disable-frame-rate-limit", None::<String>);
    }
    if chromium_sandbox_unusable() {
        // Chromium would refuse to start ("No usable sandbox!").
        eprintln!("VRC Friend Map: starting Chromium without its sandbox (no setuid chrome-sandbox helper, and this system restricts unprivileged user namespaces)");
        cef = cef.sandbox(tauri_runtime_cef::SandboxPolicy::Disabled);
    }
    cef
}

/// The per-user (tarball) install can't ship a root-owned setuid
/// `chrome-sandbox`, and Ubuntu 23.10+ restricts unprivileged user namespaces
/// (Chromium's other sandbox). The runtime only handles this for AppImages.
#[cfg(feature = "chromium")]
fn chromium_sandbox_unusable() -> bool {
    use std::os::unix::fs::MetadataExt;
    if std::env::var_os("APPIMAGE").is_some() {
        return false; // the runtime decides for AppImages
    }
    let helper = std::env::var_os("CHROME_DEVEL_SANDBOX")
        .map(std::path::PathBuf::from)
        .or_else(|| std::env::current_exe().ok().and_then(|e| e.parent().map(|d| d.join("chrome-sandbox"))));
    let helper_ok = helper
        .and_then(|p| std::fs::metadata(p).ok())
        .is_some_and(|m| m.uid() == 0 && m.mode() & 0o4000 != 0 && m.mode() & 0o001 != 0);
    if helper_ok {
        return false;
    }
    let read = |p: &str| std::fs::read_to_string(p).ok().and_then(|s| s.trim().parse::<u64>().ok());
    read("/proc/sys/kernel/apparmor_restrict_unprivileged_userns") == Some(1)
        || read("/proc/sys/kernel/unprivileged_userns_clone") == Some(0)
        || read("/proc/sys/user/max_user_namespaces") == Some(0)
}

/// Which web engine this build runs on.
pub fn engine() -> &'static str {
    if cfg!(feature = "chromium") {
        "chromium"
    } else if cfg!(target_os = "linux") {
        "webkitgtk"
    } else if cfg!(target_os = "windows") {
        "webview2"
    } else if cfg!(target_os = "android") {
        "android-webview"
    } else {
        "wkwebview"
    }
}

#[derive(Serialize)]
pub struct Info {
    /// What's saved (and used after the next start unless overridden).
    pub mode: Mode,
    /// Set when `VRC_FRIEND_MAP_GPU` overrides the saved choice.
    pub forced: Option<Mode>,
    /// False where the choice does nothing (macOS, mobile).
    pub supported: bool,
    /// chromium, webkitgtk, webview2, wkwebview or android-webview.
    pub engine: &'static str,
    pub os: &'static str,
    pub arch: &'static str,
    /// Environment variables that change how the web view draws (for diagnostics).
    pub env: Vec<(String, String)>,
    /// Saved: run faster than the screen next start.
    pub unlocked: bool,
    /// This run is unlocked.
    pub unlocked_now: bool,
    /// Whether unlocking is possible (Chromium build).
    pub can_unlock: bool,
}

/// Variables worth showing in diagnostics: the app's own, the web engines',
/// and the graphics driver ones that commonly matter.
fn graphics_env() -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = std::env::vars()
        .filter(|(k, _)| {
            k.starts_with("VRC_FRIEND_MAP_")
                || k.starts_with("WEBKIT_")
                || k.starts_with("__NV_")
                || k.starts_with("__GLX_")
                || k.starts_with("CHROME_")
                || matches!(
                    k.as_str(),
                    "XDG_SESSION_TYPE" | "XDG_CURRENT_DESKTOP" | "WAYLAND_DISPLAY" | "DISPLAY" | "LIBGL_ALWAYS_SOFTWARE" | "GDK_BACKEND" | "GSK_RENDERER" | "MESA_LOADER_DRIVER_OVERRIDE" | "DRI_PRIME" | "APPIMAGE"
                )
        })
        .collect();
    out.sort();
    out
}

pub fn info() -> Info {
    let saved = load();
    let (m, forced) = effective(std::env::var(ENV_OVERRIDE).ok().as_deref(), saved);
    Info {
        mode: saved,
        forced: forced.then_some(m),
        supported: cfg!(any(target_os = "linux", target_os = "windows")),
        engine: engine(),
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        env: graphics_env(),
        unlocked: load_unlocked(),
        unlocked_now: STARTED_UNLOCKED.load(std::sync::atomic::Ordering::Relaxed),
        can_unlock: cfg!(any(feature = "chromium", target_os = "windows")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn none(_: &str) -> Option<String> {
        None
    }

    #[test]
    fn identifier_matches_tauri_conf() {
        let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(conf["identifier"], IDENTIFIER);
    }

    #[test]
    fn parses_modes() {
        assert_eq!(Mode::parse("GPU"), Some(Mode::Gpu));
        assert_eq!(Mode::parse(" software "), Some(Mode::Software));
        assert_eq!(Mode::parse("auto"), Some(Mode::Auto));
        assert_eq!(Mode::parse("nope"), None);
    }

    #[test]
    fn env_override_wins_only_when_valid() {
        assert_eq!(effective(Some("software"), Mode::Gpu), (Mode::Software, true));
        assert_eq!(effective(Some("junk"), Mode::Gpu), (Mode::Gpu, false));
        assert_eq!(effective(None, Mode::Auto), (Mode::Auto, false));
    }

    #[test]
    fn linux_auto_keeps_existing_behaviour() {
        let p = env_plan(Mode::Auto, Os::Linux, false, &none);
        assert_eq!(p, vec![("WEBKIT_DISABLE_DMABUF_RENDERER".to_string(), Some("1".to_string()))]);
        assert!(env_plan(Mode::Auto, Os::Linux, true, &none).is_empty());
    }

    #[test]
    fn linux_gpu_and_software() {
        let gpu = env_plan(Mode::Gpu, Os::Linux, false, &none);
        assert!(gpu.contains(&("WEBKIT_FORCE_COMPOSITING_MODE".to_string(), Some("1".to_string()))));
        // The user's own variables are never changed.
        let own = env_plan(Mode::Gpu, Os::Linux, false, &|k| (k == "WEBKIT_DISABLE_COMPOSITING_MODE").then(|| "1".into()));
        assert!(own.iter().all(|(k, _)| k != "WEBKIT_DISABLE_COMPOSITING_MODE" && k != "WEBKIT_FORCE_COMPOSITING_MODE"));
        let sw = env_plan(Mode::Software, Os::Linux, false, &none);
        assert!(sw.contains(&("WEBKIT_DISABLE_COMPOSITING_MODE".to_string(), Some("1".to_string()))));
        assert!(sw.iter().all(|(k, _)| k != "LIBGL_ALWAYS_SOFTWARE"));
    }

    #[test]
    fn windows_flags_append_to_user_args() {
        let p = env_plan(Mode::Software, Os::Windows, false, &|k| (k == "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").then(|| "--foo".into()));
        assert_eq!(p, vec![("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS".to_string(), Some("--foo --disable-gpu --disable-gpu-compositing".to_string()))]);
        assert!(env_plan(Mode::Auto, Os::Windows, false, &none).is_empty());
        assert!(env_plan(Mode::Gpu, Os::Other, false, &none).is_empty());
    }
}
