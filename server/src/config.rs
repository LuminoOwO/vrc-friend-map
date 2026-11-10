//! vfm-server.toml. Created with comments on first start; the admin page
//! rewrites it (keeping the same comments) when you change settings there.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use vfm_share::{EncryptionPolicy, Registration};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    pub server: ServerSection,
    pub access: AccessSection,
    pub logger: LoggerSection,
    pub admin: AdminSection,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct ServerSection {
    pub name: String,
    pub listen: String,
    pub motd: String,
    /// Where data lives; relative paths are next to the config file.
    pub data_dir: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct AccessSection {
    pub registration: Registration,
    pub encryption: EncryptionPolicy,
    pub max_item_kb: usize,
    pub max_users: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct LoggerSection {
    pub enabled: bool,
    /// Minutes between friend list refreshes (live events fill the gaps).
    pub resync_minutes: u64,
    /// Contact info added to the User-Agent VRChat sees.
    pub contact: String,
    /// Keep the raw join/leave history (hops-YYYY-MM.jsonl), months. 0 = don't keep.
    pub keep_hops_months: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Copy)]
#[serde(rename_all = "lowercase")]
pub enum AdminAllow {
    Off,
    Local,
    Lan,
    Any,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct AdminSection {
    pub allow: AdminAllow,
    pub token: String,
}

impl Default for ServerSection {
    fn default() -> Self {
        Self { name: "VRC Friend Map server".into(), listen: "0.0.0.0:8787".into(), motd: String::new(), data_dir: "vfm-data".into() }
    }
}

impl Default for AccessSection {
    fn default() -> Self {
        Self { registration: Registration::Invite, encryption: EncryptionPolicy::Recommended, max_item_kb: 1024, max_users: 500 }
    }
}

impl Default for LoggerSection {
    fn default() -> Self {
        Self { enabled: true, resync_minutes: 30, contact: String::new(), keep_hops_months: 12 }
    }
}

impl Default for AdminSection {
    fn default() -> Self {
        Self { allow: AdminAllow::Lan, token: String::new() }
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            server: ServerSection::default(),
            access: AccessSection::default(),
            logger: LoggerSection::default(),
            admin: AdminSection::default(),
        }
    }
}

pub fn random_token(bytes: usize) -> String {
    let mut b = vec![0u8; bytes];
    rand::Rng::fill(&mut rand::thread_rng(), &mut b[..]);
    hex::encode(b)
}

fn q(s: &str) -> String {
    toml::Value::String(s.to_string()).to_string()
}

impl Config {
    pub fn load(path: &Path) -> Result<Self, String> {
        let text = std::fs::read_to_string(path).map_err(|e| format!("can't read {}: {e}", path.display()))?;
        let mut c: Config = toml::from_str(&text).map_err(|e| format!("{}: {e}", path.display()))?;
        if c.admin.token.len() < 16 {
            c.admin.token = random_token(16);
        }
        Ok(c)
    }

    /// Settings from `VFM_*` environment variables (handy in containers).
    /// They win over the file on every start; returns the names that were
    /// applied, so the admin page can show those fields as fixed.
    pub fn apply_env(&mut self) -> Result<Vec<&'static str>, String> {
        self.apply_vars(|k| std::env::var(k).ok().filter(|v| !v.trim().is_empty()))
    }

    pub fn apply_vars(&mut self, get: impl Fn(&str) -> Option<String>) -> Result<Vec<&'static str>, String> {
        let mut used = Vec::new();
        let parse_bool = |k: &str, v: &str| match v.trim().to_ascii_lowercase().as_str() {
            "1" | "true" | "yes" | "on" => Ok(true),
            "0" | "false" | "no" | "off" => Ok(false),
            _ => Err(format!("{k}={v}: use true or false")),
        };
        let parse_num = |k: &str, v: &str| v.trim().parse::<u64>().map_err(|_| format!("{k}={v}: not a number"));
        let quoted = |v: &str| format!("\"{}\"", v.trim());
        for key in [
            "VFM_NAME", "VFM_LISTEN", "VFM_MOTD", "VFM_DATA_DIR", "VFM_REGISTRATION", "VFM_ENCRYPTION", "VFM_MAX_ITEM_KB", "VFM_MAX_USERS",
            "VFM_LOGGER", "VFM_RESYNC_MINUTES", "VFM_CONTACT", "VFM_KEEP_HOPS_MONTHS", "VFM_ADMIN_ALLOW", "VFM_ADMIN_TOKEN",
        ] {
            let Some(v) = get(key) else { continue };
            match key {
                "VFM_NAME" => self.server.name = v,
                "VFM_LISTEN" => self.server.listen = v.trim().into(),
                "VFM_MOTD" => self.server.motd = v,
                "VFM_DATA_DIR" => self.server.data_dir = v.trim().into(),
                "VFM_REGISTRATION" => {
                    self.access.registration = serde_json::from_str(&quoted(&v.to_ascii_lowercase())).map_err(|_| format!("{key}={v}: use open, invite or closed"))?
                }
                "VFM_ENCRYPTION" => {
                    self.access.encryption = serde_json::from_str(&quoted(&v.to_ascii_lowercase())).map_err(|_| format!("{key}={v}: use force-off, optional, recommended or force-on"))?
                }
                "VFM_MAX_ITEM_KB" => self.access.max_item_kb = parse_num(key, &v)?.clamp(16, 16 * 1024) as usize,
                "VFM_MAX_USERS" => self.access.max_users = parse_num(key, &v)?.clamp(1, 100_000) as usize,
                "VFM_LOGGER" => self.logger.enabled = parse_bool(key, &v)?,
                "VFM_RESYNC_MINUTES" => self.logger.resync_minutes = parse_num(key, &v)?.max(10),
                "VFM_CONTACT" => self.logger.contact = v,
                "VFM_KEEP_HOPS_MONTHS" => self.logger.keep_hops_months = parse_num(key, &v)?.min(1200) as u32,
                "VFM_ADMIN_ALLOW" => self.admin.allow = serde_json::from_str(&quoted(&v.to_ascii_lowercase())).map_err(|_| format!("{key}={v}: use off, local, lan or any"))?,
                "VFM_ADMIN_TOKEN" => {
                    if v.trim().len() < 16 {
                        return Err("VFM_ADMIN_TOKEN must be at least 16 characters".into());
                    }
                    self.admin.token = v.trim().into()
                }
                _ => {}
            }
            used.push(key);
        }
        Ok(used)
    }

    pub fn data_dir(&self, config_path: &Path) -> PathBuf {
        let p = PathBuf::from(&self.server.data_dir);
        if p.is_absolute() {
            p
        } else {
            config_path.parent().map(|d| d.join(&p)).unwrap_or(p)
        }
    }

    pub fn to_toml(&self) -> String {
        let s = &self.server;
        let a = &self.access;
        let l = &self.logger;
        let ad = &self.admin;
        format!(
            r#"# vfm-server settings. The admin page can change most of these too.

[server]
# Shown in the app when people add this server.
name = {name}
# Address and port to listen on. "0.0.0.0:8787" = every network interface.
# Put it behind HTTPS (Caddy, nginx, a tunnel) before exposing it to the internet.
listen = {listen}
# Short note shown in the app ("Friends of Lumi only", rules, contact).
motd = {motd}
# Folder for data, relative to this file.
data_dir = {data}

[access]
# Who can create an account: "open", "invite" (needs a code: vfm-server invite) or "closed".
registration = {reg}
# Encryption of uploads:
#   "force-off"   - only readable uploads; the app warns people before every upload
#   "optional"    - either; the app starts with encryption off
#   "recommended" - either; the app starts with encryption on
#   "force-on"    - only end-to-end encrypted uploads (good for public servers)
encryption = {enc}
# Largest single upload (friend list / activity), in KB.
max_item_kb = {kb}
max_users = {users}

[logger]
# Log your friends' instance hopping 24/7 after you pair the app with this server.
enabled = {lenabled}
# Minutes between full friend list refreshes (live events fill in between).
resync_minutes = {resync}
# Contact info for the User-Agent VRChat sees (an email or Discord name), optional.
contact = {contact}
# Months of raw join/leave history to keep (0 = only keep the totals).
keep_hops_months = {keep}

[admin]
# Admin page at http://<this machine>:<port>/admin
#   "off", "local" (this machine only), "lan" (home network), "any"
allow = {allow}
# Needed to open the admin page. Keep it secret.
token = {token}
"#,
            name = q(&s.name),
            listen = q(&s.listen),
            motd = q(&s.motd),
            data = q(&s.data_dir),
            reg = q(match a.registration {
                Registration::Open => "open",
                Registration::Invite => "invite",
                Registration::Closed => "closed",
            }),
            enc = q(a.encryption.as_str()),
            kb = a.max_item_kb,
            users = a.max_users,
            lenabled = l.enabled,
            resync = l.resync_minutes,
            contact = q(&l.contact),
            keep = l.keep_hops_months,
            allow = q(match ad.allow {
                AdminAllow::Off => "off",
                AdminAllow::Local => "local",
                AdminAllow::Lan => "lan",
                AdminAllow::Any => "any",
            }),
            token = q(&ad.token),
        )
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        crate::store::write_atomic(path, self.to_toml().as_bytes(), true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn written_config_reads_back() {
        let mut c = Config::default();
        c.server.name = "Lumi's \"Pi\"".into();
        c.access.encryption = EncryptionPolicy::ForceOn;
        c.access.registration = Registration::Open;
        c.admin.token = "0123456789abcdef0123".into();
        let back: Config = toml::from_str(&c.to_toml()).unwrap();
        assert_eq!(back.server.name, c.server.name);
        assert_eq!(back.access.encryption, EncryptionPolicy::ForceOn);
        assert_eq!(back.access.registration, Registration::Open);
        assert_eq!(back.admin.allow, AdminAllow::Lan);
        assert_eq!(back.admin.token, c.admin.token);
    }

    #[test]
    fn environment_overrides() {
        let mut c = Config::default();
        let env = |k: &str| match k {
            "VFM_ENCRYPTION" => Some("force-on".to_string()),
            "VFM_REGISTRATION" => Some("open".to_string()),
            "VFM_LOGGER" => Some("false".to_string()),
            "VFM_ADMIN_ALLOW" => Some("any".to_string()),
            "VFM_NAME" => Some("Box".to_string()),
            _ => None,
        };
        let used = c.apply_vars(env).unwrap();
        assert_eq!(used.len(), 5);
        assert_eq!(c.access.encryption, EncryptionPolicy::ForceOn);
        assert_eq!(c.access.registration, Registration::Open);
        assert!(!c.logger.enabled);
        assert_eq!(c.admin.allow, AdminAllow::Any);
        assert_eq!(c.server.name, "Box");
        assert!(Config::default().apply_vars(|k| (k == "VFM_ENCRYPTION").then(|| "maybe".into())).is_err());
        assert!(Config::default().apply_vars(|k| (k == "VFM_ADMIN_TOKEN").then(|| "short".into())).is_err());
    }

    #[test]
    fn partial_config_uses_defaults() {
        let c: Config = toml::from_str("[access]\nencryption = \"force-off\"\n").unwrap();
        assert_eq!(c.access.encryption, EncryptionPolicy::ForceOff);
        assert_eq!(c.server.listen, "0.0.0.0:8787");
        assert!(c.logger.enabled);
    }
}
