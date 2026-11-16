//! Updates from inside the app.
//!
//! Checks GitHub's latest release, picks the file that matches how this copy
//! was installed, downloads it from the release, checks it against the
//! release's SHA256SUMS (so an update is exactly as trustworthy as
//! downloading it from GitHub by hand), and installs it the way that install
//! type allows:
//!
//! | Installed as          | Update                                               |
//! |-----------------------|------------------------------------------------------|
//! | Windows installer     | runs the new setup.exe quietly (no admin needed)     |
//! | Windows MSI           | runs the new .msi (Windows asks for admin)           |
//! | Windows portable .exe | swaps the .exe next to the running one               |
//! | macOS .app            | copies the new app from the .dmg over this one       |
//! | Linux AppImage        | replaces the AppImage file                           |
//! | Linux .deb / .rpm     | installs the package with the system's password      |
//! |                       | prompt (pkexec)                                      |
//! | Linux tarball         | runs the new tarball's install.sh (no password)      |
//! | Flatpak               | saves the .flatpak to Downloads (the sandbox can't   |
//! |                       | install it); the app shows the command               |
//! | Android               | opens the APK download; Android installs it          |
//! | iOS (sideloaded)      | links the release (can't install itself)             |

use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Runtime};

const REPO: &str = "LuminoOwO/vrc-friend-map";
const CURRENT: &str = env!("CARGO_PKG_VERSION");

#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum Kind {
    WindowsSetup,
    WindowsMsi,
    WindowsPortable,
    Mac,
    AppImage,
    Deb,
    Rpm,
    Tarball,
    Flatpak,
    Android,
    Ios,
    Unknown,
}

#[derive(Deserialize)]
struct GhAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

#[derive(Deserialize)]
struct GhRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
    draft: bool,
    prerelease: bool,
    assets: Vec<GhAsset>,
}

#[derive(Serialize, Clone)]
pub struct Asset {
    name: String,
    url: String,
    size: u64,
}

#[derive(Serialize)]
pub struct UpdateInfo {
    current: String,
    latest: String,
    newer: bool,
    notes: String,
    page: String,
    kind: Kind,
    asset: Option<Asset>,
    /// SHA256SUMS of the release, for checking the download.
    sums: Option<String>,
    /// The app can install it by itself (otherwise it shows how).
    can_install: bool,
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(concat!(
            "vrc-friend-map/",
            env!("CARGO_PKG_VERSION"),
            " (update check)"
        ))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())
}

/// 0.10.2 → [0, 10, 2]; anything after a '-' (pre-release) is ignored.
fn version_parts(v: &str) -> Vec<u64> {
    v.trim()
        .trim_start_matches('v')
        .split('-')
        .next()
        .unwrap_or("")
        .split('.')
        .map(|p| p.parse().unwrap_or(0))
        .collect()
}

pub fn is_newer(latest: &str, current: &str) -> bool {
    let (a, b) = (version_parts(latest), version_parts(current));
    for i in 0..a.len().max(b.len()) {
        let (x, y) = (
            a.get(i).copied().unwrap_or(0),
            b.get(i).copied().unwrap_or(0),
        );
        if x != y {
            return x > y;
        }
    }
    false
}

fn arch() -> (&'static str, &'static str) {
    // (AppImage / tarball / rpm style, deb style)
    if cfg!(target_arch = "aarch64") {
        ("aarch64", "arm64")
    } else {
        ("x86_64", "amd64")
    }
}

/// How this copy was installed.
pub fn install_kind() -> Kind {
    if cfg!(target_os = "android") {
        return Kind::Android;
    }
    if cfg!(target_os = "ios") {
        return Kind::Ios;
    }
    let exe = std::env::current_exe()
        .ok()
        .and_then(|p| p.canonicalize().ok())
        .unwrap_or_default();
    if cfg!(target_os = "windows") {
        let s = exe.to_string_lossy().to_lowercase();
        let local = std::env::var("LOCALAPPDATA")
            .unwrap_or_default()
            .to_lowercase();
        if !local.is_empty() && s.starts_with(&local) && s.contains("vrc friend map") {
            return Kind::WindowsSetup;
        }
        if s.contains("\\program files") {
            return Kind::WindowsMsi;
        }
        return Kind::WindowsPortable;
    }
    if cfg!(target_os = "macos") {
        return if mac_bundle(&exe).is_some() {
            Kind::Mac
        } else {
            Kind::Unknown
        };
    }
    // Linux
    if Path::new("/.flatpak-info").exists() {
        return Kind::Flatpak;
    }
    if std::env::var_os("APPIMAGE").is_some() {
        return Kind::AppImage;
    }
    let s = exe.to_string_lossy();
    if s.starts_with("/usr/") || s.starts_with("/opt/") {
        if which("dpkg-query")
            && std::process::Command::new("dpkg-query")
                .args(["-W", "vrc-friend-map"])
                .output()
                .is_ok_and(|o| o.status.success())
        {
            return Kind::Deb;
        }
        if which("rpm")
            && std::process::Command::new("rpm")
                .args(["-q", "vrc-friend-map"])
                .output()
                .is_ok_and(|o| o.status.success())
        {
            return Kind::Rpm;
        }
        return Kind::Unknown;
    }
    if let Some(home) = std::env::var_os("HOME") {
        if exe.starts_with(Path::new(&home)) {
            return Kind::Tarball;
        }
    }
    Kind::Unknown
}

fn which(cmd: &str) -> bool {
    std::env::var_os("PATH")
        .is_some_and(|p| std::env::split_paths(&p).any(|d| d.join(cmd).is_file()))
}

/// /Applications/VRC Friend Map.app from …/Contents/MacOS/vrc-friend-map.
fn mac_bundle(exe: &Path) -> Option<PathBuf> {
    let b = exe.parent()?.parent()?.parent()?;
    (b.extension()? == "app").then(|| b.to_path_buf())
}

fn asset_for(kind: Kind, v: &str, assets: &[GhAsset]) -> Option<Asset> {
    let (a, deb) = arch();
    let want = match kind {
        Kind::WindowsSetup => format!("vrc-friend-map_{v}_windows-x64-setup.exe"),
        Kind::WindowsMsi => format!("vrc-friend-map_{v}_windows-x64.msi"),
        Kind::WindowsPortable => format!("vrc-friend-map_{v}_windows-x64-portable.exe"),
        Kind::Mac => format!("vrc-friend-map_{v}_macos-universal.dmg"),
        Kind::AppImage => format!("vrc-friend-map-{v}-{a}.AppImage"),
        Kind::Deb => format!("vrc-friend-map_{v}_{deb}.deb"),
        Kind::Rpm => format!("vrc-friend-map-{v}-1.{a}.rpm"),
        Kind::Tarball => format!("vrc-friend-map-{v}-linux-{a}.tar.gz"),
        Kind::Flatpak => format!("vrc-friend-map-{v}-{a}.flatpak"),
        Kind::Android => format!("vrc-friend-map_{v}_android.apk"),
        Kind::Ios => format!("vrc-friend-map_{v}_ios-unsigned.ipa"),
        Kind::Unknown => return None,
    };
    assets.iter().find(|x| x.name == want).map(|x| Asset {
        name: x.name.clone(),
        url: x.browser_download_url.clone(),
        size: x.size,
    })
}

#[tauri::command]
pub async fn update_check() -> Result<UpdateInfo, String> {
    let c = client()?;
    let r: GhRelease = c
        .get(format!(
            "https://api.github.com/repos/{REPO}/releases/latest"
        ))
        .header("Accept", "application/vnd.github+json")
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    if r.draft || r.prerelease {
        return Err("no release yet".into());
    }
    let latest = r.tag_name.trim_start_matches('v').to_string();
    let kind = install_kind();
    let asset = asset_for(kind, &latest, &r.assets);
    let sums = r
        .assets
        .iter()
        .find(|a| a.name == "SHA256SUMS")
        .map(|a| a.browser_download_url.clone());
    let can_install = asset.is_some()
        && sums.is_some()
        && !matches!(
            kind,
            Kind::Flatpak | Kind::Ios | Kind::Android | Kind::Unknown
        );
    Ok(UpdateInfo {
        current: CURRENT.to_string(),
        newer: is_newer(&latest, CURRENT),
        latest,
        notes: r.body.unwrap_or_default(),
        page: r.html_url,
        kind,
        asset,
        sums,
        can_install,
    })
}

/// Only files from this project's GitHub releases.
fn release_url(url: &str) -> Result<(), String> {
    let ok = url.starts_with(&format!("https://github.com/{REPO}/releases/download/"));
    if ok {
        Ok(())
    } else {
        Err("not a download from this project's releases".into())
    }
}

fn update_dir() -> Result<PathBuf, String> {
    let d = std::env::temp_dir().join(format!("vrc-friend-map-update-{}", std::process::id()));
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

#[derive(Clone, Serialize)]
struct Progress {
    done: u64,
    total: u64,
}

async fn download<R: Runtime>(
    app: &AppHandle<R>,
    c: &reqwest::Client,
    url: &str,
    to: &Path,
) -> Result<Vec<u8>, String> {
    let mut resp = c
        .get(url)
        .timeout(Duration::from_secs(900))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    let total = resp.content_length().unwrap_or(0);
    let mut body = Vec::with_capacity(total as usize);
    let mut last = 0;
    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        body.extend_from_slice(&chunk);
        if body.len() as u64 - last > 512 * 1024 {
            last = body.len() as u64;
            let _ = app.emit("update-progress", Progress { done: last, total });
        }
    }
    std::fs::write(to, &body).map_err(|e| format!("{}: {e}", to.display()))?;
    Ok(body)
}

fn check_sum(sums: &str, name: &str, body: &[u8]) -> Result<(), String> {
    let want = sums
        .lines()
        .find_map(|l| {
            let mut it = l.split_whitespace();
            let (h, n) = (it.next()?, it.next()?);
            (n.trim_start_matches('*') == name).then(|| h.to_ascii_lowercase())
        })
        .ok_or("the release's checksum list doesn't have this file")?;
    let got = hex::encode(Sha256::digest(body));
    if got != want {
        return Err(
            "the download doesn't match the release's checksum; nothing was installed".into(),
        );
    }
    Ok(())
}

/// Download, check and install. Returns a message when the app keeps running
/// (e.g. Flatpak: where the file went and the command); otherwise the app quits
/// and the new version starts.
#[tauri::command]
pub async fn update_install<R: Runtime>(
    app: AppHandle<R>,
    asset_url: String,
    asset_name: String,
    sums_url: String,
) -> Result<String, String> {
    release_url(&asset_url)?;
    release_url(&sums_url)?;
    if asset_name.contains('/') || asset_name.contains('\\') || asset_name.starts_with('.') {
        return Err("bad file name".into());
    }
    let kind = install_kind();
    let c = client()?;
    let sums = c
        .get(&sums_url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    let dir = update_dir()?;
    let file = dir.join(&asset_name);
    let body = download(&app, &c, &asset_url, &file).await?;
    check_sum(&sums, &asset_name, &body)?;
    drop(body);
    let _ = app.emit("update-progress", Progress { done: 1, total: 1 });
    install(&app, kind, &file)
}

#[cfg(desktop)]
fn quit_for_update<R: Runtime>(app: &AppHandle<R>) {
    crate::single::release();
    crate::tray::quit(app);
}

/// Starts `cmd` once this process has exited (so Chromium's lock is free), then quits.
#[cfg(all(unix, desktop))]
fn relaunch_after_exit<R: Runtime>(app: &AppHandle<R>, cmd: &str) -> Result<String, String> {
    let pid = std::process::id();
    let script = format!("while kill -0 {pid} 2>/dev/null; do sleep 0.2; done; sleep 0.5; {cmd}");
    std::process::Command::new("sh")
        .args(["-c", &script])
        .spawn()
        .map_err(|e| e.to_string())?;
    quit_for_update(app);
    Ok(String::new())
}

fn shell_quote(p: &Path) -> String {
    format!("'{}'", p.to_string_lossy().replace('\'', r"'\''"))
}

#[allow(unused_variables)]
fn install<R: Runtime>(app: &AppHandle<R>, kind: Kind, file: &Path) -> Result<String, String> {
    match kind {
        #[cfg(target_os = "windows")]
        Kind::WindowsSetup | Kind::WindowsMsi | Kind::WindowsPortable => windows_install(app, kind, file),
        #[cfg(target_os = "macos")]
        Kind::Mac => mac_install(app, file),
        #[cfg(all(target_os = "linux", desktop))]
        Kind::AppImage => {
            let target = PathBuf::from(std::env::var_os("APPIMAGE").ok_or("not running as an AppImage")?);
            let next = target.with_extension("new");
            std::fs::copy(file, &next).map_err(|e| format!("can't write next to {}: {e}", target.display()))?;
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&next, std::fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
            std::fs::rename(&next, &target).map_err(|e| e.to_string())?;
            relaunch_after_exit(app, &format!("exec {}", shell_quote(&target)))
        }
        #[cfg(all(target_os = "linux", desktop))]
        Kind::Deb | Kind::Rpm => {
            if !which("pkexec") {
                return Err(format!("no password prompt (pkexec) here; install it yourself: {}", file.display()));
            }
            let args: Vec<String> = if kind == Kind::Deb {
                vec!["apt-get".into(), "install".into(), "-y".into(), file.to_string_lossy().into()]
            } else if which("dnf") {
                vec!["dnf".into(), "install".into(), "-y".into(), file.to_string_lossy().into()]
            } else if which("zypper") {
                vec!["zypper".into(), "--non-interactive".into(), "install".into(), "--allow-unsigned-rpm".into(), file.to_string_lossy().into()]
            } else {
                vec!["rpm".into(), "-U".into(), file.to_string_lossy().into()]
            };
            let out = std::process::Command::new("pkexec").args(&args).output().map_err(|e| e.to_string())?;
            if !out.status.success() {
                let err = String::from_utf8_lossy(&out.stderr);
                return Err(if out.status.code() == Some(126) || out.status.code() == Some(127) {
                    "cancelled at the password prompt".into()
                } else {
                    format!("the package manager said: {}", err.lines().last().unwrap_or("failed"))
                });
            }
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            relaunch_after_exit(app, &format!("exec {}", shell_quote(&exe)))
        }
        #[cfg(all(target_os = "linux", desktop))]
        Kind::Tarball => {
            let dir = file.parent().unwrap().join("unpacked");
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let ok = std::process::Command::new("tar").arg("-xzf").arg(file).arg("-C").arg(&dir).status().map_err(|e| e.to_string())?.success();
            if !ok {
                return Err("couldn't unpack the update".into());
            }
            let inner = std::fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten().map(|e| e.path()).find(|p| p.join("install.sh").is_file()).ok_or("install.sh missing in the update")?;
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            // install.sh replaces the files; it runs after we've quit so nothing is in use.
            relaunch_after_exit(app, &format!("sh {} >/dev/null 2>&1; exec {}", shell_quote(&inner.join("install.sh")), shell_quote(&exe)))
        }
        Kind::Flatpak => {
            // The sandbox can't install it; put it in Downloads and show the command.
            let downloads = std::env::var_os("XDG_DOWNLOAD_DIR").map(PathBuf::from).or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Downloads"))).ok_or("no Downloads folder")?;
            let to = downloads.join(file.file_name().unwrap());
            std::fs::copy(file, &to).map_err(|e| format!("{}: {e}", to.display()))?;
            Ok(format!("flatpak install --user --reinstall {}", shell_quote(&to)))
        }
        _ => Err("this kind of install can't update itself; download the new version from the release page".into()),
    }
}

#[cfg(target_os = "windows")]
fn windows_install<R: Runtime>(
    app: &AppHandle<R>,
    kind: Kind,
    file: &Path,
) -> Result<String, String> {
    use std::process::Command;
    match kind {
        Kind::WindowsSetup => {
            // Tauri's NSIS installer: /P = passive (progress only), /R = start the app afterwards.
            Command::new(file)
                .args(["/P", "/R"])
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        Kind::WindowsMsi => {
            Command::new("msiexec")
                .arg("/i")
                .arg(file)
                .arg("/passive")
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        _ => {
            // Portable: a running .exe can be renamed but not overwritten.
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            let old = exe.with_extension("old.exe");
            let _ = std::fs::remove_file(&old);
            std::fs::rename(&exe, &old).map_err(|e| e.to_string())?;
            if let Err(e) = std::fs::copy(file, &exe) {
                let _ = std::fs::rename(&old, &exe);
                return Err(e.to_string());
            }
            let pid = std::process::id();
            let script = format!(
                "while (Get-Process -Id {pid} -ErrorAction SilentlyContinue) {{ Start-Sleep -Milliseconds 200 }}; Start-Process -FilePath '{}'",
                exe.to_string_lossy().replace('\'', "''")
            );
            Command::new("powershell")
                .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    quit_for_update(app);
    Ok(String::new())
}

#[cfg(target_os = "macos")]
fn mac_install<R: Runtime>(app: &AppHandle<R>, file: &Path) -> Result<String, String> {
    use std::process::Command;
    let exe = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let bundle = mac_bundle(&exe).ok_or("not running from an .app")?;
    let mount = file.parent().unwrap().join("mnt");
    std::fs::create_dir_all(&mount).map_err(|e| e.to_string())?;
    let ok = Command::new("hdiutil")
        .args(["attach", "-nobrowse", "-readonly", "-mountpoint"])
        .arg(&mount)
        .arg(file)
        .status()
        .map_err(|e| e.to_string())?
        .success();
    if !ok {
        return Err("couldn't open the .dmg".into());
    }
    let new_app = std::fs::read_dir(&mount)
        .map_err(|e| e.to_string())?
        .flatten()
        .map(|e| e.path())
        .find(|p| p.extension().is_some_and(|x| x == "app"));
    let result = (|| -> Result<(), String> {
        let new_app = new_app.ok_or("no app in the .dmg")?;
        let staged = bundle.with_extension("app.new");
        let _ = std::fs::remove_dir_all(&staged);
        if !Command::new("ditto")
            .arg(&new_app)
            .arg(&staged)
            .status()
            .map_err(|e| e.to_string())?
            .success()
        {
            return Err(format!("can't write next to {}", bundle.display()));
        }
        let old = bundle.with_extension("app.old");
        let _ = std::fs::remove_dir_all(&old);
        std::fs::rename(&bundle, &old).map_err(|e| e.to_string())?;
        if let Err(e) = std::fs::rename(&staged, &bundle) {
            let _ = std::fs::rename(&old, &bundle);
            return Err(e.to_string());
        }
        let _ = std::fs::remove_dir_all(&old);
        Ok(())
    })();
    let _ = Command::new("hdiutil")
        .args(["detach", "-quiet"])
        .arg(&mount)
        .status();
    result?;
    let pid = std::process::id();
    let script = format!(
        "while kill -0 {pid} 2>/dev/null; do sleep 0.2; done; open -n {}",
        shell_quote(&bundle)
    );
    Command::new("sh")
        .args(["-c", &script])
        .spawn()
        .map_err(|e| e.to_string())?;
    quit_for_update(app);
    Ok(String::new())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions() {
        assert!(is_newer("0.10.0", "0.9.0"));
        assert!(is_newer("v1.0.0", "0.10.3"));
        assert!(!is_newer("0.10.0", "0.10.0"));
        assert!(!is_newer("0.9.9", "0.10.0"));
        assert!(is_newer("0.10.1", "0.10.0-beta"));
    }

    #[test]
    fn only_this_projects_releases() {
        assert!(release_url(
            "https://github.com/LuminoOwO/vrc-friend-map/releases/download/v1/x.deb"
        )
        .is_ok());
        assert!(release_url(
            "https://evil.example/LuminoOwO/vrc-friend-map/releases/download/v1/x.deb"
        )
        .is_err());
        assert!(release_url("https://github.com/someone/else/releases/download/v1/x.deb").is_err());
    }

    #[test]
    fn checksums() {
        let body = b"hello";
        let sums = format!(
            "{}  a.deb\nffff  b.deb\n",
            hex::encode(Sha256::digest(body))
        );
        assert!(check_sum(&sums, "a.deb", body).is_ok());
        assert!(check_sum(&sums, "b.deb", body).is_err());
        assert!(check_sum(&sums, "c.deb", body).is_err());
    }

    #[test]
    fn asset_names() {
        let mk = |n: &str| GhAsset {
            name: n.into(),
            browser_download_url: format!("https://github.com/{REPO}/releases/download/v1/{n}"),
            size: 1,
        };
        let assets = vec![
            mk("vrc-friend-map_1.0.0_amd64.deb"),
            mk("vrc-friend-map-1.0.0-x86_64.AppImage"),
            mk("vrc-friend-map_1.0.0_windows-x64-setup.exe"),
        ];
        if cfg!(target_arch = "x86_64") {
            assert_eq!(
                asset_for(Kind::Deb, "1.0.0", &assets).unwrap().name,
                "vrc-friend-map_1.0.0_amd64.deb"
            );
            assert_eq!(
                asset_for(Kind::AppImage, "1.0.0", &assets).unwrap().name,
                "vrc-friend-map-1.0.0-x86_64.AppImage"
            );
        }
        assert!(asset_for(Kind::WindowsSetup, "1.0.0", &assets).is_some());
        assert!(asset_for(Kind::Unknown, "1.0.0", &assets).is_none());
    }
}
