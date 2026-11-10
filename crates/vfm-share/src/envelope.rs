use std::collections::BTreeMap;
use std::fmt;

use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use hkdf::Hkdf;
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use x25519_dalek::{EphemeralSecret, PublicKey, StaticSecret};

use crate::identity::verify_sig;
use crate::{b64, transcript, Identity};

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Enc {
    /// Readable by the server (still signed by the owner).
    None,
    /// XChaCha20-Poly1305, content key wrapped per recipient with X25519.
    Sealed,
}

/// One shared item as stored on a server.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Envelope {
    pub v: u32,
    pub owner: String,
    pub kind: String,
    /// Unix seconds, set by the owner.
    pub created: i64,
    pub enc: Enc,
    /// Who may fetch it. Servers only hand an item to these users.
    pub recipients: Vec<String>,
    /// Sealed only: recipient -> wrapped content key.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub keys: BTreeMap<String, String>,
    /// Sealed only: payload nonce.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub nonce: String,
    /// JSON bytes (plain) or ciphertext (sealed), base64.
    pub payload: String,
    /// Owner's signature over everything above.
    pub sig: String,
}

/// Someone to seal for.
#[derive(Clone, Debug)]
pub struct Recipient {
    pub user_id: String,
    pub box_pk: [u8; 32],
}

#[derive(Debug, PartialEq, Eq)]
pub enum OpenError {
    BadSignature,
    NotForYou,
    Corrupt,
}

impl fmt::Display for OpenError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            OpenError::BadSignature => "signature doesn't match the owner's key",
            OpenError::NotForYou => "not addressed to you",
            OpenError::Corrupt => "damaged or can't be decrypted",
        })
    }
}

impl std::error::Error for OpenError {}

fn payload_ad(owner: &str, kind: &str, created: i64) -> Vec<u8> {
    transcript("vfm1-payload", &[owner.as_bytes(), kind.as_bytes(), created.to_string().as_bytes()])
}

fn kek(shared: &[u8; 32], epk: &[u8; 32], rpk: &[u8; 32], label: &[u8]) -> [u8; 32] {
    let mut salt = [0u8; 64];
    salt[..32].copy_from_slice(epk);
    salt[32..].copy_from_slice(rpk);
    let hk = Hkdf::<Sha256>::new(Some(&salt), shared);
    let mut out = [0u8; 32];
    hk.expand(label, &mut out).expect("32 bytes is a valid HKDF length");
    out
}

/// Anonymous sealed box: ephemeral X25519 -> HKDF -> XChaCha20-Poly1305.
/// Output: epk(32) | nonce(24) | ciphertext.
fn seal_to(rpk: &[u8; 32], data: &[u8], ad: &[u8], label: &[u8]) -> Vec<u8> {
    let e = EphemeralSecret::random_from_rng(OsRng);
    let epk = PublicKey::from(&e).to_bytes();
    let shared = e.diffie_hellman(&PublicKey::from(*rpk)).to_bytes();
    let key = kek(&shared, &epk, rpk, label);
    let mut nonce = [0u8; 24];
    OsRng.fill_bytes(&mut nonce);
    let ct = XChaCha20Poly1305::new((&key).into())
        .encrypt(XNonce::from_slice(&nonce), Payload { msg: data, aad: ad })
        .expect("encryption can't fail");
    let mut out = Vec::with_capacity(56 + ct.len());
    out.extend_from_slice(&epk);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ct);
    out
}

fn open_from(sk: &StaticSecret, blob: &[u8], ad: &[u8], label: &[u8]) -> Option<Vec<u8>> {
    if blob.len() < 56 + 16 {
        return None;
    }
    let epk: [u8; 32] = blob[..32].try_into().ok()?;
    let nonce = &blob[32..56];
    let shared = sk.diffie_hellman(&PublicKey::from(epk)).to_bytes();
    // Reject all-zero shared secrets (low-order points).
    if shared.iter().all(|b| *b == 0) {
        return None;
    }
    let key = kek(&shared, &epk, &PublicKey::from(sk).to_bytes(), label);
    XChaCha20Poly1305::new((&key).into()).decrypt(XNonce::from_slice(nonce), Payload { msg: &blob[56..], aad: ad }).ok()
}

/// Seal a small secret for one public key (used to hand a server its
/// logger's VRChat session). Only the holder of the matching secret can open it.
pub fn seal_box(rpk: &[u8; 32], data: &[u8], context: &str) -> String {
    b64::enc(&seal_to(rpk, data, context.as_bytes(), b"vfm1-box"))
}

pub fn open_sealed_box(id: &Identity, blob: &str, context: &str) -> Option<Vec<u8>> {
    open_from(&id.boxk, &b64::dec(blob)?, context.as_bytes(), b"vfm1-box")
}

impl Envelope {
    fn signed_bytes(&self) -> Vec<u8> {
        let enc = match self.enc {
            Enc::None => "none",
            Enc::Sealed => "sealed",
        };
        let recipients = self.recipients.join(",");
        let keys: String = self.keys.iter().map(|(k, v)| format!("{k}={v};")).collect();
        transcript(
            "vfm1-envelope",
            &[
                self.v.to_string().as_bytes(),
                self.owner.as_bytes(),
                self.kind.as_bytes(),
                self.created.to_string().as_bytes(),
                enc.as_bytes(),
                recipients.as_bytes(),
                keys.as_bytes(),
                self.nonce.as_bytes(),
                self.payload.as_bytes(),
            ],
        )
    }

    fn sign(mut self, id: &Identity) -> Self {
        self.sig = b64::enc(&id.sign_bytes(&self.signed_bytes()));
        self
    }

    /// Readable by the server. Recipients still limit who can fetch it.
    pub fn plain(id: &Identity, owner: &str, kind: &str, created: i64, payload: &[u8], recipients: &[String]) -> Self {
        let mut recipients = recipients.to_vec();
        recipients.sort();
        recipients.dedup();
        Envelope {
            v: 1,
            owner: owner.into(),
            kind: kind.into(),
            created,
            enc: Enc::None,
            recipients,
            keys: BTreeMap::new(),
            nonce: String::new(),
            payload: b64::enc(payload),
            sig: String::new(),
        }
        .sign(id)
    }

    /// End-to-end sealed: only the listed recipients can read it.
    pub fn sealed(id: &Identity, owner: &str, kind: &str, created: i64, payload: &[u8], recipients: &[Recipient]) -> Self {
        let mut ck = [0u8; 32];
        OsRng.fill_bytes(&mut ck);
        let mut nonce = [0u8; 24];
        OsRng.fill_bytes(&mut nonce);
        let ct = XChaCha20Poly1305::new((&ck).into())
            .encrypt(XNonce::from_slice(&nonce), Payload { msg: payload, aad: &payload_ad(owner, kind, created) })
            .expect("encryption can't fail");
        let mut keys = BTreeMap::new();
        for r in recipients {
            let ad = transcript("vfm1-wrap", &[owner.as_bytes(), kind.as_bytes(), created.to_string().as_bytes(), r.user_id.as_bytes()]);
            keys.insert(r.user_id.clone(), b64::enc(&seal_to(&r.box_pk, &ck, &ad, b"vfm1-wrap")));
        }
        Envelope {
            v: 1,
            owner: owner.into(),
            kind: kind.into(),
            created,
            enc: Enc::Sealed,
            recipients: keys.keys().cloned().collect(),
            keys,
            nonce: b64::enc(&nonce),
            payload: b64::enc(&ct),
            sig: String::new(),
        }
        .sign(id)
    }

    /// Signature check only (servers do this before storing).
    pub fn verify(&self, owner_sign_pk: &[u8; 32]) -> bool {
        let Some(sig) = b64::dec(&self.sig) else { return false };
        verify_sig(owner_sign_pk, &self.signed_bytes(), &sig)
    }

    /// Shape checks a server can do without keys.
    pub fn well_formed(&self) -> bool {
        let sealed_ok = match self.enc {
            Enc::None => self.keys.is_empty() && self.nonce.is_empty(),
            Enc::Sealed => {
                !self.keys.is_empty()
                    && self.keys.keys().eq(self.recipients.iter())
                    && b64::dec(&self.nonce).map(|n| n.len() == 24).unwrap_or(false)
            }
        };
        self.v == 1 && sealed_ok && b64::dec(&self.payload).is_some() && self.recipients.windows(2).all(|w| w[0] < w[1])
    }

    /// Verify and decrypt. `me` is your user ID, `owner_sign_pk` the owner's
    /// key as you know it (pinned), not as the envelope claims.
    pub fn open(&self, me: &str, id: &Identity, owner_sign_pk: &[u8; 32]) -> Result<Vec<u8>, OpenError> {
        if !self.verify(owner_sign_pk) {
            return Err(OpenError::BadSignature);
        }
        match self.enc {
            Enc::None => b64::dec(&self.payload).ok_or(OpenError::Corrupt),
            Enc::Sealed => {
                let wrapped = self.keys.get(me).ok_or(OpenError::NotForYou)?;
                let ad = transcript("vfm1-wrap", &[self.owner.as_bytes(), self.kind.as_bytes(), self.created.to_string().as_bytes(), me.as_bytes()]);
                let ck = open_from(&id.boxk, &b64::dec(wrapped).ok_or(OpenError::Corrupt)?, &ad, b"vfm1-wrap").ok_or(OpenError::Corrupt)?;
                let ck: [u8; 32] = ck.try_into().map_err(|_| OpenError::Corrupt)?;
                let nonce = b64::dec(&self.nonce).ok_or(OpenError::Corrupt)?;
                if nonce.len() != 24 {
                    return Err(OpenError::Corrupt);
                }
                let ct = b64::dec(&self.payload).ok_or(OpenError::Corrupt)?;
                XChaCha20Poly1305::new((&ck).into())
                    .decrypt(XNonce::from_slice(&nonce), Payload { msg: &ct, aad: &payload_ad(&self.owner, &self.kind, self.created) })
                    .map_err(|_| OpenError::Corrupt)
            }
        }
    }
}
