//! Protocol shared by VRC Friend Map (the app) and vfm-server.
//!
//! * Every app install has an [`Identity`]: an Ed25519 key that signs and an
//!   X25519 key that receives sealed data. Only the public halves ever leave
//!   the device.
//! * Requests to a server are signed ([`auth`]), so a server knows who asks
//!   without passwords, and nobody can replay or alter a request.
//! * Shared data travels in an [`Envelope`]. Encrypted envelopes are sealed
//!   on the sender's device with a fresh key, and that key is wrapped
//!   separately for each recipient's X25519 key. The server stores bytes it
//!   cannot open; it only sees who the owner is, who may fetch it (needed to
//!   enforce access), the size and the time.
//! * Every envelope, encrypted or not, is signed by its owner, so a server
//!   can't change or forge what someone shared.

pub mod auth;
mod envelope;
mod identity;
mod policy;

pub use envelope::{open_sealed_box, seal_box, Enc, Envelope, OpenError, Recipient};
pub use identity::{fingerprint, Identity, PublicIdentity};
pub use policy::{EncryptionPolicy, Registration, ServerInfo, LoggerInfo};

/// Protocol version spoken by this crate.
pub const PROTOCOL: u32 = 1;

/// Kinds of shared items.
pub const KIND_FRIENDS: &str = "friends";
pub const KIND_ACTIVITY: &str = "activity";
pub const KINDS: &[&str] = &[KIND_FRIENDS, KIND_ACTIVITY];

pub(crate) mod b64 {
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine;
    pub fn enc(b: &[u8]) -> String {
        URL_SAFE_NO_PAD.encode(b)
    }
    pub fn dec(s: &str) -> Option<Vec<u8>> {
        URL_SAFE_NO_PAD.decode(s.trim_end_matches('=')).ok()
    }
    pub fn dec32(s: &str) -> Option<[u8; 32]> {
        dec(s)?.try_into().ok()
    }
}

pub use b64::{dec as b64_decode, enc as b64_encode};

/// Valid VRChat user IDs: `usr_` followed by a UUID (old accounts have
/// shorter IDs, so only the shape is checked).
pub fn valid_user_id(id: &str) -> bool {
    if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return false;
    }
    (id.starts_with("usr_") && (8..=64).contains(&id.len())) || (id.len() == 10 && !id.contains(['_', '-']))
}

/// Length-prefixed concatenation, so field boundaries can't be shifted.
pub(crate) fn transcript(label: &str, parts: &[&[u8]]) -> Vec<u8> {
    let mut out = Vec::with_capacity(64 + parts.iter().map(|p| p.len() + 4).sum::<usize>());
    out.extend_from_slice(label.as_bytes());
    out.push(0);
    for p in parts {
        out.extend_from_slice(&(p.len() as u32).to_be_bytes());
        out.extend_from_slice(p);
    }
    out
}
