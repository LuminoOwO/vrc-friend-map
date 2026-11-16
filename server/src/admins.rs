//! Admin accounts for the dashboard: name, password and an authenticator
//! code (standard TOTP, so Ente Auth, Aegis, Google Authenticator… work).
//! Several admins can exist. Codes are on by default ([admin] totp = true).
//!
//! The first admin is made with a one-time setup code from the server console
//! (`vfm-server admin-code`) or with the old admin token. Logged-in browsers
//! get a session token (12 hours).

use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha1::Sha1;
use sha2::Sha256;
use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::store::{now, read_json, write_json};

const ITERATIONS: u32 = 120_000;
const SESSION_SECS: i64 = 12 * 3600;

#[derive(Clone, Serialize, Deserialize)]
pub struct Admin {
    pub salt: String,
    pub hash: String,
    /// Base32 TOTP secret (None until set up).
    #[serde(default)]
    pub totp: Option<String>,
    #[serde(default)]
    pub created: i64,
    #[serde(default)]
    pub last_login: i64,
}

#[derive(Default, Serialize, Deserialize)]
struct AdminFile {
    #[serde(default)]
    admins: BTreeMap<String, Admin>,
}

pub struct Admins {
    path: PathBuf,
    setup_path: PathBuf,
    sessions: Mutex<HashMap<String, (String, i64)>>,
    /// Failed logins per name, to slow guessing down.
    fails: Mutex<HashMap<String, (i64, u32)>>,
}

fn pbkdf2(password: &str, salt: &[u8]) -> [u8; 32] {
    // PBKDF2-HMAC-SHA256, one block.
    let mut mac = Hmac::<Sha256>::new_from_slice(password.as_bytes()).expect("hmac");
    mac.update(salt);
    mac.update(&1u32.to_be_bytes());
    let mut u: [u8; 32] = mac.finalize().into_bytes().into();
    let mut out = u;
    for _ in 1..ITERATIONS {
        let mut mac = Hmac::<Sha256>::new_from_slice(password.as_bytes()).expect("hmac");
        mac.update(&u);
        u = mac.finalize().into_bytes().into();
        for (o, x) in out.iter_mut().zip(u.iter()) {
            *o ^= x;
        }
    }
    out
}

fn eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

const B32: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

pub fn base32(data: &[u8]) -> String {
    let mut out = String::new();
    let mut buf = 0u64;
    let mut bits = 0;
    for &b in data {
        buf = (buf << 8) | b as u64;
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            out.push(B32[((buf >> bits) & 31) as usize] as char);
        }
    }
    if bits > 0 {
        out.push(B32[((buf << (5 - bits)) & 31) as usize] as char);
    }
    out
}

fn unbase32(s: &str) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    let mut buf = 0u64;
    let mut bits = 0;
    for c in s.bytes().filter(|c| *c != b'=' && !c.is_ascii_whitespace()) {
        let v = B32.iter().position(|&x| x == c.to_ascii_uppercase())? as u64;
        buf = (buf << 5) | v;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    Some(out)
}

/// RFC 6238 code (SHA-1, 30 s, 6 digits) for a time step.
pub fn totp_at(secret_b32: &str, step: i64) -> Option<String> {
    let key = unbase32(secret_b32)?;
    let mut mac = Hmac::<Sha1>::new_from_slice(&key).ok()?;
    mac.update(&(step as u64).to_be_bytes());
    let h = mac.finalize().into_bytes();
    let o = (h[19] & 0x0f) as usize;
    let n = ((h[o] as u32 & 0x7f) << 24) | ((h[o + 1] as u32) << 16) | ((h[o + 2] as u32) << 8) | h[o + 3] as u32;
    Some(format!("{:06}", n % 1_000_000))
}

fn totp_ok(secret: &str, code: &str, t: i64) -> bool {
    let code = code.trim().replace(' ', "");
    (-1..=1).any(|d| totp_at(secret, t / 30 + d).map(|c| eq(c.as_bytes(), code.as_bytes())).unwrap_or(false))
}

pub fn random_hex(bytes: usize) -> String {
    (0..bytes).map(|_| format!("{:02x}", rand::random::<u8>())).collect()
}

impl Admins {
    pub fn new(dir: &Path) -> Admins {
        Admins { path: dir.join("admins.json"), setup_path: dir.join("admin-setup-code.json"), sessions: Mutex::new(HashMap::new()), fails: Mutex::new(HashMap::new()) }
    }

    fn load(&self) -> AdminFile {
        read_json(&self.path)
    }

    pub fn names(&self) -> Vec<(String, bool, i64, i64)> {
        self.load().admins.into_iter().map(|(n, a)| (n, a.totp.is_some(), a.created, a.last_login)).collect()
    }

    pub fn any(&self) -> bool {
        !self.load().admins.is_empty()
    }

    /// One-time code to make the first admin (console: `vfm-server admin-code`), 30 minutes.
    pub fn setup_code_file(dir: &Path) -> String {
        let code = random_hex(6);
        let _ = write_json(&dir.join("admin-setup-code.json"), &serde_json::json!({ "code": code, "expires": now() + 1800 }), true);
        code
    }

    pub fn take_setup_code(&self, code: &str) -> bool {
        let v: serde_json::Value = read_json(&self.setup_path);
        let ok = v.get("code").and_then(|c| c.as_str()).map(|c| eq(c.as_bytes(), code.trim().as_bytes())).unwrap_or(false)
            && v.get("expires").and_then(|e| e.as_i64()).unwrap_or(0) > now();
        if ok {
            let _ = std::fs::remove_file(&self.setup_path);
        }
        ok
    }

    /// Add or reset an admin. Returns the new TOTP secret when codes are used.
    pub fn set(&self, name: &str, password: &str, with_totp: bool) -> Result<Option<String>, String> {
        let name = name.trim();
        if name.is_empty() || name.len() > 40 || !name.chars().all(|c| c.is_alphanumeric() || "-_. ".contains(c)) {
            return Err("pick a simple name (letters, numbers, - _ .)".into());
        }
        if password.len() < 10 {
            return Err("the password needs at least 10 characters".into());
        }
        let salt: [u8; 16] = rand::random();
        let hash = pbkdf2(password, &salt);
        let secret = with_totp.then(|| base32(&rand::random::<[u8; 20]>()));
        let mut f = self.load();
        f.admins.insert(name.to_string(), Admin { salt: hex::encode(salt), hash: hex::encode(hash), totp: secret.clone(), created: now(), last_login: 0 });
        write_json(&self.path, &f, true)?;
        Ok(secret)
    }

    pub fn remove(&self, name: &str) -> Result<(), String> {
        let mut f = self.load();
        if f.admins.remove(name).is_none() {
            return Err("no such admin".into());
        }
        write_json(&self.path, &f, true)?;
        self.sessions.lock().unwrap().retain(|_, (n, _)| n != name);
        Ok(())
    }

    /// Check name, password and (if they have one, or codes are required) the code; returns a session token.
    pub fn login(&self, name: &str, password: &str, code: &str, totp_required: bool) -> Result<String, String> {
        let t = now();
        {
            let mut f = self.fails.lock().unwrap();
            let e = f.entry(name.to_string()).or_insert((t, 0));
            if t - e.0 > 900 {
                *e = (t, 0);
            }
            if e.1 >= 8 {
                return Err("too many wrong tries; wait 15 minutes".into());
            }
        }
        let fail = |msg: &str| {
            let mut f = self.fails.lock().unwrap();
            f.entry(name.to_string()).or_insert((t, 0)).1 += 1;
            Err(msg.to_string())
        };
        let mut file = self.load();
        let Some(a) = file.admins.get_mut(name) else { return fail("wrong name or password") };
        let salt = hex::decode(&a.salt).unwrap_or_default();
        if !eq(&pbkdf2(password, &salt), &hex::decode(&a.hash).unwrap_or_default()) {
            return fail("wrong name or password");
        }
        match &a.totp {
            Some(secret) if !totp_ok(secret, code, t) => return fail("wrong authenticator code"),
            None if totp_required => return Err("this admin has no authenticator yet; ask another admin to reset it with a code".into()),
            _ => {}
        }
        a.last_login = t;
        let _ = write_json(&self.path, &file, true);
        let token = random_hex(24);
        let mut s = self.sessions.lock().unwrap();
        s.retain(|_, (_, exp)| *exp > t);
        s.insert(token.clone(), (name.to_string(), t + SESSION_SECS));
        Ok(token)
    }

    /// The admin a session token belongs to.
    pub fn session(&self, token: &str) -> Option<String> {
        let s = self.sessions.lock().unwrap();
        s.get(token).filter(|(_, exp)| *exp > now()).map(|(n, _)| n.clone())
    }

    pub fn logout(&self, token: &str) {
        self.sessions.lock().unwrap().remove(token);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn totp_matches_rfc6238() {
        // RFC 6238 test secret "12345678901234567890" (SHA-1), T = 59 s → 94287082 (8 digits) → 287082.
        let secret = base32(b"12345678901234567890");
        assert_eq!(totp_at(&secret, 59 / 30).unwrap(), "287082");
        assert_eq!(totp_at(&secret, 1111111109 / 30).unwrap(), "081804");
    }

    #[test]
    fn accounts() {
        let dir = std::env::temp_dir().join(format!("vfm-admins-{}", random_hex(4)));
        std::fs::create_dir_all(&dir).unwrap();
        let a = Admins::new(&dir);
        assert!(a.set("x", "short", false).is_err());
        let secret = a.set("lumi", "correct horse battery", true).unwrap().unwrap();
        assert!(a.login("lumi", "wrong password!!", "", true).is_err());
        assert!(a.login("lumi", "correct horse battery", "000000", true).is_err() || totp_at(&secret, now() / 30).as_deref() == Some("000000"));
        let code = totp_at(&secret, now() / 30).unwrap();
        let token = a.login("lumi", "correct horse battery", &code, true).unwrap();
        assert_eq!(a.session(&token).as_deref(), Some("lumi"));
        a.logout(&token);
        assert!(a.session(&token).is_none());
        let _ = std::fs::remove_dir_all(dir);
    }
}
