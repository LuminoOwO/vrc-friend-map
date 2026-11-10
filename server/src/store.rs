//! Everything on disk, as small JSON files:
//!
//! ```text
//! vfm-data/
//!   server.key              server identity (secret, 0600)
//!   users.json              registered people: public keys only
//!   invites.json            invite codes (the CLI can add some while the server runs)
//!   items/<user>/<kind>.json  shared items exactly as uploaded (sealed ones are unreadable here)
//!   logger/                 see logger.rs
//! ```

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Path, PathBuf};
use vfm_share::{valid_user_id, Envelope, Identity, PublicIdentity, KINDS};

pub fn now() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

/// Write to a temp file and rename, so a power cut never leaves half a file.
pub fn write_atomic(path: &Path, data: &[u8], private: bool) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    }
    let tmp = path.with_extension(format!("tmp{}", std::process::id()));
    std::fs::write(&tmp, data).map_err(|e| format!("{}: {e}", tmp.display()))?;
    #[cfg(unix)]
    if private {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600));
    }
    #[cfg(not(unix))]
    let _ = private;
    std::fs::rename(&tmp, path).map_err(|e| format!("{}: {e}", path.display()))
}

pub fn read_json<T: for<'de> Deserialize<'de> + Default>(path: &Path) -> T {
    match std::fs::read(path) {
        Ok(b) => serde_json::from_slice(&b).unwrap_or_else(|e| {
            eprintln!("warning: {} is damaged ({e}); keeping a copy and starting fresh", path.display());
            let _ = std::fs::copy(path, path.with_extension(format!("damaged-{}", now())));
            T::default()
        }),
        Err(_) => T::default(),
    }
}

pub fn write_json<T: Serialize>(path: &Path, v: &T, private: bool) -> Result<(), String> {
    write_atomic(path, &serde_json::to_vec_pretty(v).map_err(|e| e.to_string())?, private)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UserRecord {
    pub identity: PublicIdentity,
    pub registered: i64,
    #[serde(default)]
    pub last_seen: i64,
    #[serde(default)]
    pub invite: Option<String>,
}

#[derive(Default, Serialize, Deserialize)]
pub struct Users {
    #[serde(default)]
    pub users: BTreeMap<String, UserRecord>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Invite {
    pub uses_left: u32,
    /// Unix seconds, 0 = never.
    pub expires: i64,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub created: i64,
}

#[derive(Default, Serialize, Deserialize)]
pub struct Invites {
    #[serde(default)]
    pub codes: BTreeMap<String, Invite>,
}

/// Metadata of one stored item (the payload stays on disk).
#[derive(Clone, Debug, Serialize)]
pub struct ItemMeta {
    pub owner: String,
    pub kind: String,
    pub created: i64,
    pub sealed: bool,
    pub recipients: Vec<String>,
    pub bytes: usize,
}

pub struct Store {
    pub dir: PathBuf,
    pub identity: Identity,
    pub users: Users,
    /// (owner, kind) -> meta, for fast inbox lookups.
    pub items: HashMap<(String, String), ItemMeta>,
    /// Recently used request nonces -> time seen.
    nonces: HashMap<String, i64>,
    /// Users whose last_seen changed and need saving.
    seen_dirty: bool,
}

impl Store {
    pub fn open(dir: &Path) -> Result<Store, String> {
        std::fs::create_dir_all(dir).map_err(|e| format!("can't create {}: {e}", dir.display()))?;
        let key_path = dir.join("server.key");
        let identity = match std::fs::read_to_string(&key_path) {
            Ok(s) => Identity::from_secret_string(&s).ok_or_else(|| format!("{} is damaged", key_path.display()))?,
            Err(_) => {
                let id = Identity::generate();
                write_atomic(&key_path, id.to_secret_string().as_bytes(), true)?;
                id
            }
        };
        let users: Users = read_json(&dir.join("users.json"));
        let mut store = Store { dir: dir.to_path_buf(), identity, users, items: HashMap::new(), nonces: HashMap::new(), seen_dirty: false };
        store.index_items();
        Ok(store)
    }

    fn index_items(&mut self) {
        let Ok(owners) = std::fs::read_dir(self.dir.join("items")) else { return };
        for owner in owners.flatten() {
            let name = owner.file_name().to_string_lossy().to_string();
            if !valid_user_id(&name) {
                continue;
            }
            for kind in KINDS {
                if let Some(env) = self.read_item(&name, kind) {
                    self.items.insert((name.clone(), kind.to_string()), meta(&env));
                }
            }
        }
    }

    fn item_path(&self, owner: &str, kind: &str) -> PathBuf {
        self.dir.join("items").join(owner).join(format!("{kind}.json"))
    }

    pub fn read_item(&self, owner: &str, kind: &str) -> Option<Envelope> {
        let b = std::fs::read(self.item_path(owner, kind)).ok()?;
        serde_json::from_slice(&b).ok()
    }

    pub fn put_item(&mut self, env: &Envelope) -> Result<(), String> {
        write_json(&self.item_path(&env.owner, &env.kind), env, false)?;
        self.items.insert((env.owner.clone(), env.kind.clone()), meta(env));
        Ok(())
    }

    pub fn delete_item(&mut self, owner: &str, kind: &str) -> bool {
        let existed = self.items.remove(&(owner.to_string(), kind.to_string())).is_some();
        let _ = std::fs::remove_file(self.item_path(owner, kind));
        existed
    }

    pub fn delete_user(&mut self, user: &str) -> bool {
        for kind in KINDS {
            self.delete_item(user, kind);
        }
        let _ = std::fs::remove_dir_all(self.dir.join("items").join(user));
        let existed = self.users.users.remove(user).is_some();
        let _ = self.save_users();
        existed
    }

    /// Items `user` may fetch: addressed to them, or their own.
    pub fn inbox(&self, user: &str, since: i64) -> Vec<&ItemMeta> {
        let mut v: Vec<&ItemMeta> = self
            .items
            .values()
            .filter(|m| m.created > since && (m.owner == user || m.recipients.binary_search_by(|r| r.as_str().cmp(user)).is_ok()))
            .collect();
        v.sort_by(|a, b| b.created.cmp(&a.created));
        v
    }

    pub fn save_users(&mut self) -> Result<(), String> {
        self.seen_dirty = false;
        write_json(&self.dir.join("users.json"), &self.users, false)
    }

    pub fn touch(&mut self, user: &str) {
        let t = now();
        if let Some(u) = self.users.users.get_mut(user) {
            // Hourly resolution is plenty and keeps writes rare.
            if t - u.last_seen > 3600 {
                u.last_seen = t;
                self.seen_dirty = true;
            }
        }
    }

    pub fn flush(&mut self) {
        if self.seen_dirty {
            let _ = self.save_users();
        }
    }

    /// Returns false if the nonce was used recently (a replayed request).
    pub fn use_nonce(&mut self, user: &str, nonce: &str) -> bool {
        let t = now();
        if self.nonces.len() > 50_000 {
            self.nonces.retain(|_, seen| t - *seen <= 2 * vfm_share::auth::MAX_SKEW);
        }
        let key = format!("{user}/{nonce}");
        if let Some(seen) = self.nonces.get(&key) {
            if t - *seen <= 2 * vfm_share::auth::MAX_SKEW {
                return false;
            }
        }
        self.nonces.insert(key, t);
        true
    }

    pub fn invites_path(&self) -> PathBuf {
        self.dir.join("invites.json")
    }

    /// Use up one invite. Read from disk every time, so codes made with the
    /// CLI work without restarting.
    pub fn take_invite(&self, code: &str) -> bool {
        let path = self.invites_path();
        let mut inv: Invites = read_json(&path);
        let code = code.trim();
        let Some(i) = inv.codes.get_mut(code) else { return false };
        if i.uses_left == 0 || (i.expires != 0 && i.expires < now()) {
            return false;
        }
        i.uses_left -= 1;
        if i.uses_left == 0 {
            inv.codes.remove(code);
        }
        write_json(&path, &inv, true).is_ok()
    }

    pub fn stats(&self) -> (usize, usize, usize) {
        let sealed = self.items.values().filter(|m| m.sealed).count();
        (self.users.users.len(), self.items.len(), sealed)
    }

    pub fn known_users(&self, ids: &[String]) -> Vec<PublicIdentity> {
        let want: HashSet<&String> = ids.iter().collect();
        self.users.users.iter().filter(|(k, _)| want.contains(k)).map(|(_, u)| u.identity.clone()).collect()
    }
}

pub fn new_invite(dir: &Path, uses: u32, days: u32, note: &str) -> Result<String, String> {
    let path = dir.join("invites.json");
    let mut inv: Invites = read_json(&path);
    let t = now();
    inv.codes.retain(|_, i| i.expires == 0 || i.expires > t);
    // Readable code: 4 groups of 4 from an unambiguous alphabet.
    const ABC: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = rand::thread_rng();
    let code: String = (0..16)
        .map(|i| {
            let c = ABC[rand::Rng::gen_range(&mut rng, 0..ABC.len())] as char;
            if i > 0 && i % 4 == 0 { format!("-{c}") } else { c.to_string() }
        })
        .collect();
    inv.codes.insert(
        code.clone(),
        Invite { uses_left: uses.max(1), expires: if days == 0 { 0 } else { t + days as i64 * 86400 }, note: note.into(), created: t },
    );
    write_json(&path, &inv, true)?;
    Ok(code)
}

fn meta(env: &Envelope) -> ItemMeta {
    ItemMeta {
        owner: env.owner.clone(),
        kind: env.kind.clone(),
        created: env.created,
        sealed: env.enc == vfm_share::Enc::Sealed,
        recipients: env.recipients.clone(),
        bytes: env.payload.len(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp() -> PathBuf {
        let d = std::env::temp_dir().join(format!("vfm-store-test-{}", crate::config::random_token(6)));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn invites_are_used_up() {
        let d = tmp();
        let store = Store::open(&d).unwrap();
        let code = new_invite(&d, 2, 7, "test").unwrap();
        assert_eq!(code.len(), 19);
        assert!(store.take_invite(&code));
        assert!(store.take_invite(&format!(" {code} ")));
        assert!(!store.take_invite(&code));
        assert!(!store.take_invite("NOPE"));
        let _ = std::fs::remove_dir_all(d);
    }

    #[test]
    fn nonces_cannot_repeat() {
        let d = tmp();
        let mut s = Store::open(&d).unwrap();
        assert!(s.use_nonce("usr_a", "n1"));
        assert!(!s.use_nonce("usr_a", "n1"));
        assert!(s.use_nonce("usr_b", "n1"));
        let _ = std::fs::remove_dir_all(d);
    }

    #[test]
    fn server_key_survives_restart() {
        let d = tmp();
        let a = Store::open(&d).unwrap().identity.box_pk();
        let b = Store::open(&d).unwrap().identity.box_pk();
        assert_eq!(a, b);
        let _ = std::fs::remove_dir_all(d);
    }
}
