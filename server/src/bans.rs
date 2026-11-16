//! Bans: by account (VRChat user ID) and by IP address, each with an
//! optional reason. Banned people get the reason and the owner's appeal
//! contact ([server] appeal_contact) in the app.
//!
//! IP bans are rough: home addresses change, mobile carriers share one
//! address between many people, and behind a reverse proxy every request
//! comes from the proxy unless [server] trusted_proxy is on.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::store::{now, read_json, write_json};

#[derive(Clone, Serialize, Deserialize)]
pub struct Ban {
    #[serde(default)]
    pub reason: String,
    pub t: i64,
    #[serde(default)]
    pub by: String,
}

#[derive(Default, Clone, Serialize, Deserialize)]
pub struct BanList {
    #[serde(default)]
    pub users: BTreeMap<String, Ban>,
    #[serde(default)]
    pub ips: BTreeMap<String, Ban>,
}

pub struct Bans {
    path: PathBuf,
    list: Mutex<BanList>,
}

impl Bans {
    pub fn new(dir: &Path) -> Bans {
        let path = dir.join("bans.json");
        let list = read_json(&path);
        Bans { path, list: Mutex::new(list) }
    }

    pub fn list(&self) -> BanList {
        self.list.lock().unwrap().clone()
    }

    pub fn user(&self, id: &str) -> Option<Ban> {
        self.list.lock().unwrap().users.get(id).cloned()
    }

    pub fn ip(&self, ip: &str) -> Option<Ban> {
        self.list.lock().unwrap().ips.get(ip).cloned()
    }

    pub fn add(&self, kind: &str, value: &str, reason: &str, by: &str) -> Result<(), String> {
        let ban = Ban { reason: reason.trim().chars().take(500).collect(), t: now(), by: by.to_string() };
        let mut l = self.list.lock().unwrap();
        match kind {
            "user" if vfm_share::valid_user_id(value) => l.users.insert(value.to_string(), ban),
            "ip" if value.parse::<std::net::IpAddr>().is_ok() => l.ips.insert(value.to_string(), ban),
            _ => return Err("not a VRChat user ID or an IP address".into()),
        };
        write_json(&self.path, &*l, true)
    }

    pub fn remove(&self, kind: &str, value: &str) -> Result<(), String> {
        let mut l = self.list.lock().unwrap();
        let gone = match kind {
            "user" => l.users.remove(value).is_some(),
            "ip" => l.ips.remove(value).is_some(),
            _ => false,
        };
        if !gone {
            return Err("not banned".into());
        }
        write_json(&self.path, &*l, true)
    }
}
