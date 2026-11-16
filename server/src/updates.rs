//! Is there a newer vfm-server? Asks GitHub for the newest release every 12
//! hours ([admin] update_check, on by default) and tells the admin page and the
//! console. It only looks; updating stays your step (docs/server-setup.md §9).

use serde::Serialize;
use std::sync::{Arc, RwLock};
use std::time::Duration;

use crate::api::{App, VERSION};

const LATEST: &str = "https://api.github.com/repos/LuminoOwO/vrc-friend-map/releases/latest";
pub const HOW_TO: &str = "https://github.com/LuminoOwO/vrc-friend-map/blob/main/docs/server-setup.md#9-updating-the-server";

#[derive(Clone, Serialize, Default)]
pub struct Latest {
    pub version: String,
    pub url: String,
    /// Unix seconds of the last successful check.
    pub checked: i64,
}

#[derive(Default)]
pub struct Updates {
    pub latest: RwLock<Option<Latest>>,
}

/// "0.12.0" < "0.12.1" < "0.13.0"; a "v" in front and anything after "-" don't count.
pub fn newer(latest: &str, current: &str) -> bool {
    let parts = |v: &str| -> Vec<u64> {
        v.trim().trim_start_matches('v').split('-').next().unwrap_or("").split('.').map(|p| p.parse().unwrap_or(0)).collect()
    };
    let (a, b) = (parts(latest), parts(current));
    for i in 0..a.len().max(b.len()) {
        let (x, y) = (a.get(i).copied().unwrap_or(0), b.get(i).copied().unwrap_or(0));
        if x != y {
            return x > y;
        }
    }
    false
}

async fn check(http: &reqwest::Client) -> Result<Latest, String> {
    let res = http
        .get(LATEST)
        .header("user-agent", format!("vfm-server/{VERSION}"))
        .header("accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("GitHub answered {}", res.status()));
    }
    let v: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let tag = v["tag_name"].as_str().ok_or("no version in GitHub's answer")?;
    Ok(Latest {
        version: tag.trim_start_matches('v').to_string(),
        url: v["html_url"].as_str().unwrap_or("").to_string(),
        checked: crate::store::now(),
    })
}

/// A minute after start, then every 12 hours, while `[admin] update_check` is on.
pub fn spawn(app: Arc<App>) {
    tokio::spawn(async move {
        let http = reqwest::Client::builder().timeout(Duration::from_secs(20)).build().expect("http client");
        tokio::time::sleep(Duration::from_secs(60)).await;
        let mut told = String::new();
        loop {
            if app.cfg().admin.update_check {
                if let Ok(l) = check(&http).await {
                    if newer(&l.version, VERSION) && told != l.version {
                        println!("vfm-server {} is out (this is {VERSION}). How to update: {HOW_TO}", l.version);
                        told = l.version.clone();
                    }
                    *app.updates.latest.write().unwrap() = Some(l);
                }
            }
            tokio::time::sleep(Duration::from_secs(12 * 3600)).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::newer;

    #[test]
    fn versions() {
        assert!(newer("0.12.1", "0.12.0"));
        assert!(newer("v0.13.0", "0.12.9"));
        assert!(newer("1.0", "0.99.99"));
        assert!(!newer("0.12.0", "0.12.0"));
        assert!(!newer("0.11.5", "0.12.0"));
        assert!(!newer("0.12.0-beta", "0.12.0"));
    }
}
