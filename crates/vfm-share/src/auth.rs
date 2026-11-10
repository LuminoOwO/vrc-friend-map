//! Signed requests.
//!
//! `Authorization: VFM1 u=<user id>;t=<unix secs>;n=<nonce>;s=<signature>`
//!
//! The signature covers the method, path with query, time, nonce and a hash
//! of the body. Servers accept a clock skew of [`MAX_SKEW`] and remember
//! nonces for that long, so a captured request can't be sent again.

use sha2::{Digest, Sha256};

use crate::identity::verify_sig;
use crate::{b64, transcript, Identity};

pub const SCHEME: &str = "VFM1";
pub const MAX_SKEW: i64 = 300;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthHeader {
    pub user: String,
    pub ts: i64,
    pub nonce: String,
    pub sig: Vec<u8>,
}

fn message(method: &str, path_and_query: &str, ts: i64, nonce: &str, body: &[u8]) -> Vec<u8> {
    let body_hash = Sha256::digest(body);
    transcript(
        "vfm1-request",
        &[method.to_ascii_uppercase().as_bytes(), path_and_query.as_bytes(), ts.to_string().as_bytes(), nonce.as_bytes(), &body_hash],
    )
}

pub fn random_nonce() -> String {
    let mut b = [0u8; 16];
    rand_core::RngCore::fill_bytes(&mut rand_core::OsRng, &mut b);
    b64::enc(&b)
}

/// Build the header value for a request.
pub fn sign_request(id: &Identity, user: &str, method: &str, path_and_query: &str, body: &[u8], ts: i64) -> String {
    let nonce = random_nonce();
    let sig = id.sign_bytes(&message(method, path_and_query, ts, &nonce, body));
    format!("{SCHEME} u={user};t={ts};n={nonce};s={}", b64::enc(&sig))
}

pub fn parse(header: &str) -> Option<AuthHeader> {
    let rest = header.trim().strip_prefix(SCHEME)?.trim();
    let (mut user, mut ts, mut nonce, mut sig) = (None, None, None, None);
    for part in rest.split(';') {
        let (k, v) = part.trim().split_once('=')?;
        match k {
            "u" => user = Some(v.to_string()),
            "t" => ts = v.parse::<i64>().ok(),
            "n" => nonce = Some(v.to_string()),
            "s" => sig = b64::dec(v),
            _ => {}
        }
    }
    let nonce = nonce?;
    if nonce.is_empty() || nonce.len() > 64 {
        return None;
    }
    Some(AuthHeader { user: user?, ts: ts?, nonce, sig: sig? })
}

impl AuthHeader {
    /// Check the signature and time. Nonce reuse is the caller's job.
    pub fn verify(&self, sign_pk: &[u8; 32], method: &str, path_and_query: &str, body: &[u8], now: i64) -> bool {
        (self.ts - now).abs() <= MAX_SKEW && verify_sig(sign_pk, &message(method, path_and_query, self.ts, &self.nonce, body), &self.sig)
    }
}
