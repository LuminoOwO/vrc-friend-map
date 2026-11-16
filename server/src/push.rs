//! Push messages to the owner's phones (UnifiedPush): AES-256-GCM with a key
//! the phone made, in the same format the app uses: base64(iv ‖ ciphertext+tag).

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

pub fn b64_encode(data: &[u8]) -> String {
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(B64[(n >> 18) as usize & 63] as char);
        out.push(B64[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { B64[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { B64[n as usize & 63] as char } else { '=' });
    }
    out
}

pub fn b64_decode(s: &str) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    let mut buf = 0u32;
    let mut bits = 0;
    for c in s.bytes().filter(|c| !c.is_ascii_whitespace() && *c != b'=') {
        let v = B64.iter().position(|&x| x == c)? as u32;
        buf = (buf << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    Some(out)
}

pub fn seal(key_b64: &str, msg: &[u8]) -> Option<String> {
    let key = b64_decode(key_b64)?;
    if key.len() != 32 {
        return None;
    }
    let cipher = Aes256Gcm::new_from_slice(&key).ok()?;
    let iv: [u8; 12] = rand::random();
    let ct = cipher.encrypt(Nonce::from_slice(&iv), msg).ok()?;
    let mut out = iv.to_vec();
    out.extend(ct);
    Some(b64_encode(&out))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_round_trip() {
        for s in ["", "a", "ab", "abc", "hello world!"] {
            assert_eq!(b64_decode(&b64_encode(s.as_bytes())).unwrap(), s.as_bytes());
        }
        assert_eq!(b64_encode(b"user:pass"), "dXNlcjpwYXNz");
    }

    #[test]
    fn seals() {
        let key = b64_encode(&[7u8; 32]);
        let sealed = b64_decode(&seal(&key, b"hi").unwrap()).unwrap();
        assert_eq!(sealed.len(), 12 + 2 + 16);
        assert!(seal("short", b"x").is_none());
    }
}
