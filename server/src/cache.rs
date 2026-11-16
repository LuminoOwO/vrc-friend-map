//! Shared cache of public VRChat info (worlds, groups, avatars): an app that
//! loaded one from VRChat puts it here, others read it from here first, so
//! VRChat gets fewer requests. Only public data; every entry has its age and
//! expires after a week. Each kind can be switched off ([access] cache_*).

use serde_json::Value;
use std::path::{Path, PathBuf};

use crate::store::{now, write_atomic};

pub const MAX_ENTRY: usize = 64 * 1024;
pub const MAX_AGE: i64 = 7 * 86400;

pub struct Cache {
    dir: PathBuf,
}

fn valid(kind: &str, id: &str) -> bool {
    let prefix = match kind {
        "world" => "wrld_",
        "group" => "grp_",
        "avatar" => "avtr_",
        _ => return false,
    };
    id.starts_with(prefix) && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

impl Cache {
    pub fn new(dir: &Path) -> Cache {
        Cache { dir: dir.join("cache") }
    }

    fn path(&self, kind: &str, id: &str) -> PathBuf {
        self.dir.join(kind).join(format!("{id}.json"))
    }

    pub fn get(&self, kind: &str, id: &str) -> Option<(Value, i64)> {
        if !valid(kind, id) {
            return None;
        }
        let p = self.path(kind, id);
        let age = std::fs::metadata(&p).ok()?.modified().ok()?.elapsed().ok()?.as_secs() as i64;
        if age > MAX_AGE {
            let _ = std::fs::remove_file(&p);
            return None;
        }
        let v: Value = serde_json::from_slice(&std::fs::read(&p).ok()?).ok()?;
        Some((v, now() - age))
    }

    pub fn put(&self, kind: &str, id: &str, data: &[u8]) -> Result<(), String> {
        if !valid(kind, id) {
            return Err("bad id".into());
        }
        if data.len() > MAX_ENTRY {
            return Err("too big".into());
        }
        let v: Value = serde_json::from_slice(data).map_err(|e| e.to_string())?;
        // Only what VRChat shows everyone: the entry must be about this id.
        if v.get("id").and_then(Value::as_str) != Some(id) {
            return Err("the entry is about another id".into());
        }
        let p = self.path(kind, id);
        std::fs::create_dir_all(p.parent().unwrap()).map_err(|e| e.to_string())?;
        write_atomic(&p, data, false)
    }

    /// Entries per kind and their size, for the admin page.
    pub fn stats(&self) -> Value {
        let mut out = serde_json::Map::new();
        for kind in ["world", "group", "avatar"] {
            let (mut n, mut bytes) = (0u64, 0u64);
            if let Ok(rd) = std::fs::read_dir(self.dir.join(kind)) {
                for e in rd.flatten() {
                    n += 1;
                    bytes += e.metadata().map(|m| m.len()).unwrap_or(0);
                }
            }
            out.insert(kind.into(), serde_json::json!({ "entries": n, "bytes": bytes }));
        }
        Value::Object(out)
    }
}
