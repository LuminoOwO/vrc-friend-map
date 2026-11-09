//! `vrcimg://` protocol: the UI asks for VRChat images through here so they
//! can be fetched with the session cookie and cached on disk.

use crate::AppState;
use sha2::{Digest, Sha256};
use std::sync::Arc;
use tauri::http::{header, Request, Response};
use tauri::{Manager, Runtime, UriSchemeContext, UriSchemeResponder};

fn allowed_host(host: &str) -> bool {
    host == "vrchat.com"
        || host.ends_with(".vrchat.com")
        || host == "vrchat.cloud"
        || host.ends_with(".vrchat.cloud")
}

fn not_found() -> Response<Vec<u8>> {
    Response::builder()
        .status(404)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(Vec::new())
        .unwrap()
}

pub fn handle<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let app = ctx.app_handle().clone();
    let path = request.uri().path().to_string();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<Arc<AppState>>().inner().clone();
        let response = serve(&state, &path).await.unwrap_or_else(|_| not_found());
        responder.respond(response);
    });
}

async fn serve(state: &Arc<AppState>, path: &str) -> Result<Response<Vec<u8>>, String> {
    let encoded = path.trim_start_matches('/');
    let decoded = percent_encoding::percent_decode_str(encoded)
        .decode_utf8()
        .map_err(|e| e.to_string())?
        .to_string();
    let url: url::Url = decoded.parse().map_err(|e: url::ParseError| e.to_string())?;
    if url.scheme() != "https" || !allowed_host(url.host_str().unwrap_or_default()) {
        return Err("host not allowed".into());
    }

    let key = hex::encode(Sha256::digest(url.as_str().as_bytes()));
    let bin = state.image_dir.join(format!("{key}.bin"));
    let typ = state.image_dir.join(format!("{key}.type"));

    let (bytes, content_type) = match (std::fs::read(&bin), std::fs::read_to_string(&typ)) {
        (Ok(b), Ok(t)) => (b, t),
        _ => {
            let (b, t) = state.api.fetch_image(&url).await?;
            let _ = std::fs::create_dir_all(&state.image_dir);
            let _ = std::fs::write(&bin, &b);
            let _ = std::fs::write(&typ, &t);
            (b, t)
        }
    };

    Response::builder()
        .status(200)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CACHE_CONTROL, "max-age=604800")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(bytes)
        .map_err(|e| e.to_string())
}
