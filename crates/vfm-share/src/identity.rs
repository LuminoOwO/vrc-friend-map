use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand_core::OsRng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use x25519_dalek::{PublicKey, StaticSecret};

use crate::{b64, transcript};

/// The private keys of one app install. Never sent anywhere.
pub struct Identity {
    pub(crate) sign: SigningKey,
    pub(crate) boxk: StaticSecret,
}

impl Identity {
    pub fn generate() -> Self {
        Identity { sign: SigningKey::generate(&mut OsRng), boxk: StaticSecret::random_from_rng(OsRng) }
    }

    /// 64 bytes (sign seed + box secret) as base64, for local storage.
    pub fn to_secret_string(&self) -> String {
        let mut b = [0u8; 64];
        b[..32].copy_from_slice(&self.sign.to_bytes());
        b[32..].copy_from_slice(&self.boxk.to_bytes());
        b64::enc(&b)
    }

    pub fn from_secret_string(s: &str) -> Option<Self> {
        let b = b64::dec(s.trim())?;
        if b.len() != 64 {
            return None;
        }
        let seed: [u8; 32] = b[..32].try_into().ok()?;
        let bx: [u8; 32] = b[32..].try_into().ok()?;
        Some(Identity { sign: SigningKey::from_bytes(&seed), boxk: StaticSecret::from(bx) })
    }

    pub fn sign_pk(&self) -> [u8; 32] {
        self.sign.verifying_key().to_bytes()
    }

    pub fn box_pk(&self) -> [u8; 32] {
        PublicKey::from(&self.boxk).to_bytes()
    }

    pub fn sign_bytes(&self, msg: &[u8]) -> [u8; 64] {
        self.sign.sign(msg).to_bytes()
    }

    /// The public card for `user_id`, signed so the two keys stay together.
    pub fn public(&self, user_id: &str) -> PublicIdentity {
        let sign_pk = b64::enc(&self.sign_pk());
        let box_pk = b64::enc(&self.box_pk());
        let msg = identity_message(user_id, &sign_pk, &box_pk);
        PublicIdentity { user_id: user_id.to_string(), sign_pk, box_pk, sig: b64::enc(&self.sign_bytes(&msg)) }
    }

    pub fn fingerprint(&self) -> String {
        fingerprint(&self.sign_pk(), &self.box_pk())
    }
}

fn identity_message(user: &str, sign_pk: &str, box_pk: &str) -> Vec<u8> {
    transcript("vfm1-identity", &[user.as_bytes(), sign_pk.as_bytes(), box_pk.as_bytes()])
}

/// What a server stores and hands out about a user.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct PublicIdentity {
    pub user_id: String,
    pub sign_pk: String,
    pub box_pk: String,
    /// Signed by `sign_pk` over user_id + both keys.
    pub sig: String,
}

impl PublicIdentity {
    pub fn verify(&self) -> bool {
        let (Some(pk), Some(sig)) = (b64::dec32(&self.sign_pk), b64::dec(&self.sig)) else { return false };
        if b64::dec32(&self.box_pk).is_none() {
            return false;
        }
        let Ok(vk) = VerifyingKey::from_bytes(&pk) else { return false };
        let Ok(sig) = Signature::from_slice(&sig) else { return false };
        vk.verify(&identity_message(&self.user_id, &self.sign_pk, &self.box_pk), &sig).is_ok()
    }

    pub fn sign_key(&self) -> Option<[u8; 32]> {
        b64::dec32(&self.sign_pk)
    }

    pub fn box_key(&self) -> Option<[u8; 32]> {
        b64::dec32(&self.box_pk)
    }

    pub fn fingerprint(&self) -> String {
        match (self.sign_key(), self.box_key()) {
            (Some(s), Some(b)) => fingerprint(&s, &b),
            _ => String::new(),
        }
    }
}

/// 80-bit fingerprint, shown as 5 groups of 4 hex digits ("a1b2 c3d4 …"),
/// short enough to compare by eye or put in a VRChat bio.
pub fn fingerprint(sign_pk: &[u8; 32], box_pk: &[u8; 32]) -> String {
    let mut h = Sha256::new();
    h.update(b"vfm1-fingerprint");
    h.update(sign_pk);
    h.update(box_pk);
    let d = hex::encode(&h.finalize()[..10]);
    d.as_bytes().chunks(4).map(|c| std::str::from_utf8(c).unwrap()).collect::<Vec<_>>().join(" ")
}

pub(crate) fn verify_sig(sign_pk: &[u8; 32], msg: &[u8], sig: &[u8]) -> bool {
    let Ok(vk) = VerifyingKey::from_bytes(sign_pk) else { return false };
    let Ok(sig) = Signature::from_slice(sig) else { return false };
    vk.verify_strict(msg, &sig).is_ok()
}
