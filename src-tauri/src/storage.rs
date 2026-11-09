//! Local JSON storage in the app's data folder. Everything the app learns stays
//! on this device unless the user exports it.

use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

pub fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 40
        && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
}

/// Atomic write; on Unix the file is readable by the owner only.
pub fn write_private(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600));
    }
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

pub struct Store {
    pub dir: PathBuf,
}

impl Store {
    fn path(&self, name: &str) -> Result<PathBuf, String> {
        if !valid_name(name) {
            return Err("invalid store name".into());
        }
        Ok(self.dir.join(format!("{name}.json")))
    }

    pub fn read(&self, name: &str) -> Result<Option<String>, String> {
        let p = self.path(name)?;
        match std::fs::read_to_string(&p) {
            Ok(s) => Ok(Some(s)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn write(&self, name: &str, contents: &str) -> Result<(), String> {
        if contents.len() > 64 * 1024 * 1024 {
            return Err("store entry too large".into());
        }
        let p = self.path(name)?;
        write_private(&p, contents.as_bytes())
    }
}

/// Hash user IDs with a salt for "overlap only" exports.
pub fn hash_ids(salt: &str, ids: &[String]) -> Vec<String> {
    ids.iter()
        .map(|id| {
            let mut h = Sha256::new();
            h.update(salt.as_bytes());
            h.update(b":");
            h.update(id.as_bytes());
            hex::encode(h.finalize())
        })
        .collect()
}

pub fn sanitize_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '_' })
        .take(80)
        .collect();
    if cleaned.ends_with(".json") { cleaned } else { format!("{cleaned}.json") }
}

pub fn dir_size(dir: &Path) -> u64 {
    std::fs::read_dir(dir)
        .map(|rd| rd.flatten().filter_map(|e| e.metadata().ok()).map(|m| m.len()).sum())
        .unwrap_or(0)
}

/// Keep the image cache under `max_bytes` by deleting the oldest files.
pub fn prune_dir(dir: &Path, max_bytes: u64) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let mut files: Vec<(std::time::SystemTime, u64, PathBuf)> = rd
        .flatten()
        .filter_map(|e| {
            let m = e.metadata().ok()?;
            Some((m.modified().ok()?, m.len(), e.path()))
        })
        .collect();
    let mut total: u64 = files.iter().map(|f| f.1).sum();
    if total <= max_bytes {
        return;
    }
    files.sort_by_key(|f| f.0);
    for (_, len, path) in files {
        if total <= max_bytes {
            break;
        }
        if std::fs::remove_file(&path).is_ok() {
            total = total.saturating_sub(len);
        }
    }
}
