use serde::{Deserialize, Serialize};

/// What a server allows for uploads. The app turns this into the state of
/// its encryption switch (see the app's share settings).
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum EncryptionPolicy {
    /// Only readable uploads (the server wants to read them, e.g. to merge).
    ForceOff,
    /// Either; the app starts with encryption off.
    Optional,
    /// Either; the app starts with encryption on.
    #[default]
    Recommended,
    /// Only sealed uploads (typical for public exchange servers).
    ForceOn,
}

impl EncryptionPolicy {
    pub fn allows(self, sealed: bool) -> bool {
        match self {
            EncryptionPolicy::ForceOff => !sealed,
            EncryptionPolicy::ForceOn => sealed,
            _ => true,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            EncryptionPolicy::ForceOff => "force-off",
            EncryptionPolicy::Optional => "optional",
            EncryptionPolicy::Recommended => "recommended",
            EncryptionPolicy::ForceOn => "force-on",
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Registration {
    /// Anyone can sign up.
    Open,
    /// Needs an invite code from the server owner.
    #[default]
    Invite,
    /// No new accounts.
    Closed,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct LoggerInfo {
    /// This server can log friends' locations for one owner.
    pub enabled: bool,
    /// Someone has paired their VRChat account with it.
    pub paired: bool,
    /// The paired owner (only shown to that owner).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
}

/// `GET /v1/info`
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ServerInfo {
    pub software: String,
    pub version: String,
    pub protocol: u32,
    pub name: String,
    pub encryption: EncryptionPolicy,
    pub registration: Registration,
    /// The server's own X25519 key, for sealing secrets to it.
    pub box_pk: String,
    /// The server's Ed25519 key; it signs what its logger hands out.
    pub sign_pk: String,
    pub max_item_bytes: usize,
    pub kinds: Vec<String>,
    pub logger: LoggerInfo,
    /// Free text from the owner ("Lumi's Pi – friends only").
    #[serde(default)]
    pub motd: String,
}
