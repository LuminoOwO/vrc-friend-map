//! Upgrading the server's stored files when a newer vfm-server is installed.
//!
//! The data folder carries `format.json` with a format number. At startup,
//! before anything reads the data:
//! - no number yet: a folder from before numbering (format 1), or a new one;
//! - older format: the folder is copied to `backups/format-<n>-<time>/` first,
//!   then upgraded one step at a time, then the new number is written;
//! - newer format (an older program on newer data): refuse to start, so
//!   nothing gets damaged. Install the newer vfm-server again, or restore a backup.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// The format this program writes.
///
/// 1: users.json, server.key, invites, items/<owner>/<kind>.json, logger/ (0.7–0.10).
/// 2: same files; adds the "self" item kind (your own devices' sync). Nothing to convert.
pub const CURRENT: u32 = 2;

#[derive(Serialize, Deserialize)]
struct FormatFile {
    format: u32,
    /// Which vfm-server version last wrote it (for people reading the file).
    written_by: String,
}

type Step = fn(&Path) -> Result<(), String>;

/// Upgrade steps: index 0 turns format 1 into 2, and so on.
const STEPS: &[Step] = &[
    // 1 → 2: the new item kind needs no changes to existing files.
    |_| Ok(()),
];

fn format_path(dir: &Path) -> PathBuf {
    dir.join("format.json")
}

fn read_format(dir: &Path) -> Result<Option<u32>, String> {
    match std::fs::read(format_path(dir)) {
        Ok(b) => serde_json::from_slice::<FormatFile>(&b)
            .map(|f| Some(f.format))
            .map_err(|e| format!("{} is damaged ({e}); fix or delete it", format_path(dir).display())),
        Err(_) => Ok(None),
    }
}

fn write_format(dir: &Path, format: u32) -> Result<(), String> {
    let body = serde_json::to_vec_pretty(&FormatFile { format, written_by: crate::api::VERSION.to_string() }).map_err(|e| e.to_string())?;
    crate::store::write_atomic(&format_path(dir), &body, false)
}

/// Is there anything in the folder already (a server ran here before)?
fn has_data(dir: &Path) -> bool {
    ["users.json", "server.key", "items", "logger"].iter().any(|f| dir.join(f).exists())
}

fn copy_dir(from: &Path, to: &Path, skip: &Path) -> Result<u64, String> {
    std::fs::create_dir_all(to).map_err(|e| format!("{}: {e}", to.display()))?;
    let mut n = 0;
    for entry in std::fs::read_dir(from).map_err(|e| format!("{}: {e}", from.display()))?.flatten() {
        let p = entry.path();
        if p == skip {
            continue;
        }
        let target = to.join(entry.file_name());
        let ft = entry.file_type().map_err(|e| e.to_string())?;
        if ft.is_dir() {
            n += copy_dir(&p, &target, skip)?;
        } else if ft.is_file() {
            std::fs::copy(&p, &target).map_err(|e| format!("{}: {e}", p.display()))?;
            n += 1;
        }
    }
    Ok(n)
}

/// Brings the data folder up to [`CURRENT`]. Returns a line to print when something was done.
pub fn upgrade(dir: &Path) -> Result<Option<String>, String> {
    upgrade_with(dir, CURRENT, STEPS)
}

fn upgrade_with(dir: &Path, current: u32, steps: &[Step]) -> Result<Option<String>, String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("can't create {}: {e}", dir.display()))?;
    let found = match read_format(dir)? {
        Some(f) => f,
        None if has_data(dir) => 1,
        None => {
            write_format(dir, current)?;
            return Ok(None);
        }
    };
    if found > current {
        return Err(format!(
            "the data in {} is from a newer vfm-server (format {found}; this one understands up to {current}). \
             Install the newer vfm-server again, or restore a copy from {}/backups.",
            dir.display(),
            dir.display()
        ));
    }
    if found == current {
        return Ok(None);
    }
    // Copy everything first, so a failed or unwanted upgrade can be undone by copying it back.
    let backups = dir.join("backups");
    let backup = backups.join(format!("format-{found}-{}", chrono_like_now()));
    let files = copy_dir(dir, &backup, &backups)?;
    for from in found..current {
        let step = steps.get((from - 1) as usize).ok_or_else(|| format!("no upgrade from format {from}"))?;
        step(dir).map_err(|e| format!("upgrading the data from format {from} to {}: {e} (your files are in {})", from + 1, backup.display()))?;
        write_format(dir, from + 1)?;
    }
    Ok(Some(format!("Upgraded the data from format {found} to {current} (backup of {files} files in {}).", backup.display())))
}

/// UTC time as YYYYMMDD-HHMMSS, without a date library.
fn chrono_like_now() -> String {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    // Civil date from days since 1970 (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}{m:02}{d:02}-{:02}{:02}{:02}", rem / 3600, rem % 3600 / 60, rem % 60)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp() -> PathBuf {
        let d = std::env::temp_dir().join(format!("vfm-upgrade-test-{}", crate::config::random_token(6)));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn new_folder_gets_the_current_format() {
        let d = temp();
        assert_eq!(upgrade(&d).unwrap(), None);
        assert_eq!(read_format(&d).unwrap(), Some(CURRENT));
    }

    #[test]
    fn old_unnumbered_data_is_backed_up_and_upgraded() {
        let d = temp();
        std::fs::write(d.join("users.json"), b"{\"users\":{}}").unwrap();
        std::fs::create_dir_all(d.join("items/usr_a")).unwrap();
        std::fs::write(d.join("items/usr_a/friends.json"), b"{}").unwrap();
        fn mark(dir: &Path) -> Result<(), String> {
            std::fs::write(dir.join("step-ran"), b"1").map_err(|e| e.to_string())
        }
        let msg = upgrade_with(&d, 3, &[mark, mark]).unwrap().unwrap();
        assert!(msg.contains("from format 1 to 3"), "{msg}");
        assert_eq!(read_format(&d).unwrap(), Some(3));
        assert!(d.join("step-ran").exists());
        let backups: Vec<_> = std::fs::read_dir(d.join("backups")).unwrap().flatten().collect();
        assert_eq!(backups.len(), 1);
        let b = backups[0].path();
        assert!(b.join("users.json").exists() && b.join("items/usr_a/friends.json").exists());
        assert!(!b.join("step-ran").exists(), "the backup is taken before upgrading");
        // Running again does nothing.
        assert_eq!(upgrade_with(&d, 3, &[mark, mark]).unwrap(), None);
    }

    #[test]
    fn newer_data_is_refused() {
        let d = temp();
        write_format(&d, CURRENT + 1).unwrap();
        let e = upgrade(&d).unwrap_err();
        assert!(e.contains("newer vfm-server"), "{e}");
    }

    #[test]
    fn date_format() {
        let s = chrono_like_now();
        assert_eq!(s.len(), 15);
        assert!(s.starts_with("20"));
    }
}
