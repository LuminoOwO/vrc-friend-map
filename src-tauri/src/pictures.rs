//! VRChat pictures (screenshots) for the gallery: finds the folders, lists
//! the files, and serves them to the UI through the `vrcpic://` protocol, only
//! from folders the app found or you added (Settings → Game logs), and only
//! image files.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::http::{header, Request, Response};
use tauri::{Runtime, UriSchemeContext, UriSchemeResponder};

/// Folders the protocol may serve from (set by `pictures_list`).
static ALLOWED: Mutex<Vec<PathBuf>> = Mutex::new(Vec::new());
/// Where gallery previews are kept (the app's cache folder).
static THUMB_DIR: Mutex<Option<PathBuf>> = Mutex::new(None);
/// Previews made at once: decoding a 1080p screenshot takes ~8 MB, so a gallery of hundreds
/// must not decode them all in parallel.
static MAKING: (Mutex<usize>, std::sync::Condvar) = (Mutex::new(0), std::sync::Condvar::new());
const MAX_MAKING: usize = 4;
/// Width of a gallery preview (twice the grid cell, so it stays sharp on HiDPI screens).
const THUMB_W: u32 = 480;

pub fn set_thumb_dir(dir: PathBuf) {
    let _ = std::fs::create_dir_all(&dir);
    crate::storage::prune_dir(&dir, 200 * 1024 * 1024);
    if let Ok(mut d) = THUMB_DIR.lock() {
        *d = Some(dir);
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct Picture {
    pub path: String,
    pub name: String,
    /// Naive seconds (wall clock read as UTC) from the file name, else the file time.
    pub t: i64,
    pub size: u64,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

/// Where VRChat saves pictures on this machine.
pub fn detect() -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    #[cfg(target_os = "windows")]
    {
        if let Ok(profile) = std::env::var("USERPROFILE") {
            out.push(PathBuf::from(&profile).join("Pictures").join("VRChat"));
            out.push(
                PathBuf::from(&profile)
                    .join("OneDrive")
                    .join("Pictures")
                    .join("VRChat"),
            );
        }
    }
    #[cfg(target_os = "linux")]
    {
        // Proton: next to the logs, under the prefix's Pictures folder.
        for logs in crate::gamelogs::detect_dirs() {
            // …/drive_c/users/steamuser/AppData/LocalLow/VRChat/VRChat → …/steamuser/Pictures/VRChat
            if let Some(user) = logs.ancestors().nth(4) {
                out.push(user.join("Pictures").join("VRChat"));
            }
        }
        if let Ok(home) = std::env::var("HOME") {
            out.push(PathBuf::from(home).join("Pictures").join("VRChat"));
        }
    }
    let mut seen = HashSet::new();
    out.into_iter()
        .filter(|p| p.is_dir())
        .filter(|p| seen.insert(std::fs::canonicalize(p).unwrap_or_else(|_| p.clone())))
        .collect()
}

fn is_picture(p: &Path) -> bool {
    matches!(
        p.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .as_deref(),
        Some("png" | "jpg" | "jpeg" | "webp")
    )
}

/// "VRChat_2026-11-08_21-15-00.123_1920x1080.png" → (naive seconds, width, height).
pub fn parse_name(name: &str) -> (Option<i64>, Option<u32>, Option<u32>) {
    let stem = name.rsplit_once('.').map(|(a, _)| a).unwrap_or(name);
    let parts: Vec<&str> = stem.split('_').collect();
    let mut t = None;
    let mut w = None;
    let mut h = None;
    for (i, p) in parts.iter().enumerate() {
        if p.len() == 10 && p.as_bytes()[4] == b'-' && p.as_bytes()[7] == b'-' {
            if let Some(time) = parts.get(i + 1) {
                let time = time.split('.').next().unwrap_or(time);
                let line = format!("{} {}", p.replace('-', "."), time.replace('-', ":"));
                t = crate::gamelogs::parse_ts(&line);
            }
        }
        if let Some((a, b)) = p.split_once('x') {
            if let (Ok(a), Ok(b)) = (a.parse::<u32>(), b.parse::<u32>()) {
                if a > 16 && b > 16 {
                    w = Some(a);
                    h = Some(b);
                }
            }
        }
    }
    (t, w, h)
}

fn walk(dir: &Path, depth: usize, out: &mut Vec<Picture>) {
    let Ok(rd) = std::fs::read_dir(dir) else {
        return;
    };
    for e in rd.flatten() {
        let p = e.path();
        let Ok(meta) = e.metadata() else { continue };
        if meta.is_dir() {
            if depth > 0 {
                walk(&p, depth - 1, out);
            }
            continue;
        }
        if !is_picture(&p) || out.len() >= 20_000 {
            continue;
        }
        let name = e.file_name().to_string_lossy().to_string();
        let (t, width, height) = parse_name(&name);
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        out.push(Picture {
            path: p.display().to_string(),
            name,
            t: t.unwrap_or(mtime),
            size: meta.len(),
            width,
            height,
        });
    }
}

/// All pictures in these folders (and their month subfolders), newest first.
pub fn list(dirs: &[PathBuf]) -> Vec<Picture> {
    let mut out = Vec::new();
    for d in dirs {
        walk(d, 2, &mut out);
    }
    out.sort_by(|a, b| b.t.cmp(&a.t));
    if let Ok(mut allowed) = ALLOWED.lock() {
        *allowed = dirs
            .iter()
            .filter_map(|d| std::fs::canonicalize(d).ok())
            .collect();
    }
    out
}

fn not_found() -> Response<Vec<u8>> {
    Response::builder()
        .status(404)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(Vec::new())
        .unwrap()
}

/// `vrcpic://localhost/<percent-encoded path>`
pub fn handle<R: Runtime>(
    _ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let path = request.uri().path().to_string();
    let thumb = request.uri().query().is_some_and(|q| q.split('&').any(|p| p == "thumb"));
    tauri::async_runtime::spawn_blocking(move || {
        responder.respond(serve(&path, thumb).unwrap_or_else(|_| not_found()));
    });
}

fn image_response(ct: &str, bytes: Vec<u8>) -> Result<Response<Vec<u8>>, String> {
    Response::builder()
        .status(200)
        .header(header::CONTENT_TYPE, ct)
        .header(header::CACHE_CONTROL, "max-age=86400")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(bytes)
        .map_err(|e| e.to_string())
}

/// A small JPEG of `file`, made once and kept in the cache folder (keyed by path, size and
/// change time, so an edited picture gets a new one).
fn thumbnail(file: &Path) -> Result<Vec<u8>, String> {
    use sha2::{Digest, Sha256};
    let meta = std::fs::metadata(file).map_err(|e| e.to_string())?;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let key = hex::encode(Sha256::digest(format!("{}|{}|{}|{}", file.display(), meta.len(), mtime, THUMB_W)));
    let dir = THUMB_DIR.lock().ok().and_then(|d| d.clone());
    let cached = dir.as_ref().map(|d| d.join(format!("{}.jpg", &key[..32])));
    if let Some(c) = &cached {
        if let Ok(b) = std::fs::read(c) {
            return Ok(b);
        }
    }
    let bytes = {
        let (lock, cv) = &MAKING;
        let mut n = lock.lock().map_err(|e| e.to_string())?;
        while *n >= MAX_MAKING {
            n = cv.wait(n).map_err(|e| e.to_string())?;
        }
        *n += 1;
        drop(n);
        let made = make_thumbnail(file);
        if let Ok(mut n) = lock.lock() {
            *n -= 1;
        }
        cv.notify_one();
        made?
    };
    if let Some(c) = &cached {
        let tmp = c.with_extension("tmp");
        if std::fs::write(&tmp, &bytes).is_ok() {
            let _ = std::fs::rename(&tmp, c);
        }
    }
    Ok(bytes)
}

fn make_thumbnail(file: &Path) -> Result<Vec<u8>, String> {
    let img = image::ImageReader::open(file)
        .map_err(|e| e.to_string())?
        .with_guessed_format()
        .map_err(|e| e.to_string())?
        .decode()
        .map_err(|e| e.to_string())?;
    let h = (img.height() as u64 * THUMB_W as u64 / img.width().max(1) as u64).max(1) as u32;
    let small = if img.width() > THUMB_W { img.thumbnail(THUMB_W, h) } else { img };
    let mut out = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 82)
        .encode_image(&small.to_rgb8())
        .map_err(|e| e.to_string())?;
    Ok(out)
}

fn serve(path: &str, thumb: bool) -> Result<Response<Vec<u8>>, String> {
    let decoded = percent_encoding::percent_decode_str(path.trim_start_matches('/'))
        .decode_utf8()
        .map_err(|e| e.to_string())?
        .to_string();
    let file = std::fs::canonicalize(PathBuf::from(&decoded)).map_err(|e| e.to_string())?;
    let ok = ALLOWED
        .lock()
        .map(|a| a.iter().any(|d| file.starts_with(d)))
        .unwrap_or(false);
    if !ok || !is_picture(&file) {
        return Err("not allowed".into());
    }
    if thumb {
        if let Ok(b) = thumbnail(&file) {
            return image_response("image/jpeg", b);
        }
    }
    let bytes = std::fs::read(&file).map_err(|e| e.to_string())?;
    let ct = match file
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        _ => "image/jpeg",
    };
    image_response(ct, bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names() {
        let (t, w, h) = parse_name("VRChat_2026-11-08_21-15-00.123_1920x1080.png");
        assert_eq!(t, crate::gamelogs::parse_ts("2026.11.08 21:15:00"));
        assert_eq!((w, h), (Some(1920), Some(1080)));
        assert_eq!(parse_name("random.png"), (None, None, None));
    }

    #[test]
    fn thumbnails_are_small_jpegs() {
        let dir = std::env::temp_dir().join(format!("vfm-thumb-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let src = dir.join("VRChat_2026-11-08_21-15-00.123_1920x1080.png");
        image::RgbImage::from_fn(1920, 1080, |x, y| image::Rgb([(x % 256) as u8, (y % 256) as u8, 90]))
            .save(&src)
            .unwrap();
        let b = make_thumbnail(&src).unwrap();
        let img = image::load_from_memory(&b).unwrap();
        assert_eq!((img.width(), img.height()), (THUMB_W, 270));
        assert_eq!(&b[..2], &[0xFF, 0xD8]);
        std::fs::remove_dir_all(&dir).ok();
    }
}
