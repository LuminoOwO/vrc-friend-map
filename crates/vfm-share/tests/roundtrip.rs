use vfm_share::auth;
use vfm_share::*;

fn rec(id: &Identity, user: &str) -> Recipient {
    Recipient { user_id: user.into(), box_pk: id.box_pk() }
}

#[test]
fn identity_roundtrip_and_card() {
    let id = Identity::generate();
    let back = Identity::from_secret_string(&id.to_secret_string()).unwrap();
    assert_eq!(id.sign_pk(), back.sign_pk());
    assert_eq!(id.box_pk(), back.box_pk());
    let card = id.public("usr_aaaa");
    assert!(card.verify());
    assert_eq!(card.fingerprint(), id.fingerprint());
    assert_eq!(card.fingerprint().len(), 24);
    let mut forged = card.clone();
    forged.user_id = "usr_bbbb".into();
    assert!(!forged.verify(), "card can't be moved to another user");
    let other = Identity::generate().public("usr_aaaa");
    forged = card.clone();
    forged.box_pk = other.box_pk;
    assert!(!forged.verify(), "box key can't be swapped");
}

#[test]
fn sealed_only_for_recipients_and_not_for_server() {
    let alice = Identity::generate();
    let bob = Identity::generate();
    let carol = Identity::generate();
    let server = Identity::generate();
    let msg = br#"{"friends":["usr_1","usr_2"]}"#;
    let env = Envelope::sealed(&alice, "usr_alice", KIND_FRIENDS, 1000, msg, &[rec(&bob, "usr_bob"), rec(&alice, "usr_alice")]);
    assert!(env.well_formed());
    assert_eq!(env.recipients, vec!["usr_alice".to_string(), "usr_bob".to_string()]);
    assert!(!env.payload.contains("usr_1"));
    // Through JSON like a server stores it.
    let env: Envelope = serde_json::from_str(&serde_json::to_string(&env).unwrap()).unwrap();
    assert_eq!(env.open("usr_bob", &bob, &alice.sign_pk()).unwrap(), msg);
    assert_eq!(env.open("usr_alice", &alice, &alice.sign_pk()).unwrap(), msg);
    assert_eq!(env.open("usr_carol", &carol, &alice.sign_pk()), Err(OpenError::NotForYou));
    // Carol stealing Bob's slot doesn't help without Bob's key.
    assert_eq!(env.open("usr_bob", &carol, &alice.sign_pk()), Err(OpenError::Corrupt));
    // A server that has everything on disk still can't read it.
    for who in ["usr_bob", "usr_alice"] {
        assert!(env.open(who, &server, &alice.sign_pk()).is_err());
    }
}

#[test]
fn tampering_is_detected() {
    let alice = Identity::generate();
    let bob = Identity::generate();
    let env = Envelope::sealed(&alice, "usr_alice", KIND_ACTIVITY, 5, b"x", &[rec(&bob, "usr_bob")]);
    let mut e = env.clone();
    e.recipients.push("usr_zed".into());
    assert!(!e.verify(&alice.sign_pk()));
    let mut e = env.clone();
    e.created += 1;
    assert_eq!(e.open("usr_bob", &bob, &alice.sign_pk()), Err(OpenError::BadSignature));
    // Signed by someone else (a server forging items).
    let mallory = Identity::generate();
    let forged = Envelope::sealed(&mallory, "usr_alice", KIND_ACTIVITY, 5, b"x", &[rec(&bob, "usr_bob")]);
    assert_eq!(forged.open("usr_bob", &bob, &alice.sign_pk()), Err(OpenError::BadSignature));
}

#[test]
fn plain_is_signed_and_readable() {
    let alice = Identity::generate();
    let env = Envelope::plain(&alice, "usr_alice", KIND_FRIENDS, 7, b"hello", &["usr_b".into(), "usr_a".into(), "usr_b".into()]);
    assert!(env.well_formed());
    assert_eq!(env.recipients, vec!["usr_a".to_string(), "usr_b".to_string()]);
    assert_eq!(env.open("usr_b", &Identity::generate(), &alice.sign_pk()).unwrap(), b"hello");
    let mut e = env.clone();
    e.payload = b64_encode(b"bye");
    assert!(!e.verify(&alice.sign_pk()));
}

#[test]
fn signed_requests() {
    let id = Identity::generate();
    let h = auth::sign_request(&id, "usr_a", "put", "/v1/items/friends?x=1", b"body", 1_000_000);
    let p = auth::parse(&h).unwrap();
    assert_eq!(p.user, "usr_a");
    assert!(p.verify(&id.sign_pk(), "PUT", "/v1/items/friends?x=1", b"body", 1_000_100));
    assert!(!p.verify(&id.sign_pk(), "PUT", "/v1/items/friends?x=1", b"other", 1_000_100));
    assert!(!p.verify(&id.sign_pk(), "PUT", "/v1/items/activity", b"body", 1_000_100));
    assert!(!p.verify(&id.sign_pk(), "DELETE", "/v1/items/friends?x=1", b"body", 1_000_100));
    assert!(!p.verify(&id.sign_pk(), "PUT", "/v1/items/friends?x=1", b"body", 1_000_000 + auth::MAX_SKEW + 1));
    assert!(!p.verify(&Identity::generate().sign_pk(), "PUT", "/v1/items/friends?x=1", b"body", 1_000_000));
    assert!(auth::parse("Bearer abc").is_none());
}

#[test]
fn sealed_box_for_server() {
    let server = Identity::generate();
    let blob = seal_box(&server.box_pk(), b"authcookie_123", "logger-session");
    assert_eq!(open_sealed_box(&server, &blob, "logger-session").unwrap(), b"authcookie_123");
    assert!(open_sealed_box(&server, &blob, "other").is_none());
    assert!(open_sealed_box(&Identity::generate(), &blob, "logger-session").is_none());
}

#[test]
fn policy_rules() {
    use EncryptionPolicy::*;
    assert!(ForceOff.allows(false) && !ForceOff.allows(true));
    assert!(ForceOn.allows(true) && !ForceOn.allows(false));
    for p in [Optional, Recommended] {
        assert!(p.allows(true) && p.allows(false));
    }
    let s: EncryptionPolicy = serde_json::from_str("\"force-on\"").unwrap();
    assert_eq!(s, ForceOn);
    assert_eq!(serde_json::to_string(&Recommended).unwrap(), "\"recommended\"");
}

#[test]
fn user_ids() {
    assert!(valid_user_id("usr_c1644b5b-3ca4-45b4-97c6-a2a0de70d469"));
    assert!(valid_user_id("8JoV9XEdpo"));
    assert!(!valid_user_id("usr_../../etc"));
    assert!(!valid_user_id("usr_"));
    assert!(!valid_user_id("grp_c1644b5b"));
}
