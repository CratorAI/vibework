//! OpenRouter key management.
//!
//! The user's own OpenRouter API key is the only credential the app uses.
//! It is validated against OpenRouter, stored in the OS keychain, and read
//! before every model request. Usage is billed by OpenRouter to the key owner.

use once_cell::sync::Lazy;
use serde::Serialize;
use std::sync::RwLock;
use tracing::{info, warn};

mod credential;
#[cfg(target_os = "macos")]
mod credential_macos;
use credential::{load, save, remove};

const OPENROUTER_KEY_INFO_URL: &str = "https://openrouter.ai/api/v1/key";

static KEY: Lazy<RwLock<Option<String>>> = Lazy::new(|| RwLock::new(None));

/// Load the stored key (if any) from the OS keychain. Call once at startup.
#[cfg(any(debug_assertions, feature = "dev-release-probe"))]
static DEV_OVERRIDE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

fn init() {
    #[cfg(any(debug_assertions, feature = "dev-release-probe"))]
    if let Ok(key) = std::env::var("VIBEWORK_DEV_OPENROUTER_KEY") {
        {
            DEV_OVERRIDE.store(true, std::sync::atomic::Ordering::SeqCst);
            *KEY.write().unwrap() = (!key.trim().is_empty()).then(|| key.trim().to_owned());
            return;
        }
    }
    match load() {
        Ok(Some(key)) if !key.is_empty() => {
            info!("OpenRouter key found in secure storage");
            *KEY.write().unwrap() = Some(key);
        }
        Ok(_) => {}
        Err(e) => warn!("Could not read OpenRouter key from secure storage: {}", e),
    }
}

async fn ensure_loaded() {
    static LOADED: tokio::sync::OnceCell<()> = tokio::sync::OnceCell::const_new();
    LOADED.get_or_init(|| async {
        if let Err(error) = tauri::async_runtime::spawn_blocking(init).await {
            warn!("Keychain initialization failed: {}", error);
        }
    }).await;
}

fn openrouter_key() -> Option<String> {
    KEY.read().unwrap().clone()
}

/// The key if it is already loaded, without waiting for the Keychain (for
/// scrubbing it out of environments handed to other processes).
pub(crate) fn loaded_key() -> Option<String> {
    openrouter_key()
}

/// The current key (the OpenCode engine's loopback proxy adds it to each
/// model request). Never log, persist or hand it to another process.
pub async fn current_key() -> Option<String> {
    ensure_loaded().await;
    openrouter_key()
}

/// The stored key for the app's own OpenRouter requests (web search, the
/// usage strip), or an error asking the user to add one. Read per request, so
/// adding or removing the key takes effect immediately.
pub async fn require_key() -> Result<String, String> {
    ensure_loaded().await;
    openrouter_key().ok_or_else(|| "No OpenRouter API key is set. Add your key in Settings to use Vibework.".to_string())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ByokStatus {
    pub active: bool,
    /// Last characters of the key, for display only
    pub key_hint: Option<String>,
}

fn status() -> ByokStatus {
    let key = openrouter_key();
    ByokStatus {
        active: key.is_some(),
        key_hint: key.map(|k| {
            let tail: String = k.chars().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect();
            format!("…{}", tail)
        }),
    }
}

fn key_info_url() -> Result<String, String> {
    #[cfg(any(debug_assertions, feature = "dev-release-probe"))]
    if let Ok(origin) = std::env::var("VIBEWORK_DEV_OPENROUTER_ORIGIN") {
        let url = url::Url::parse(&origin).map_err(|_| "Invalid local test origin")?;
        if url.scheme() != "http" || !matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]")) {
            return Err("Test origin must be HTTP loopback".into());
        }
        return Ok(format!("{}/api/v1/key", origin.trim_end_matches('/')));
    }
    Ok(OPENROUTER_KEY_INFO_URL.into())
}

/// Ask OpenRouter whether the key is valid.
async fn validate_key(key: &str) -> Result<(), String> {
    validate_key_at(key, &key_info_url()?).await
}

async fn validate_key_at(key: &str, endpoint: &str) -> Result<(), String> {
    let response = reqwest::Client::new()
        .get(endpoint)
        .bearer_auth(key)
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|_| "Could not reach OpenRouter. Check your connection and try again.".to_string())?;

    match response.status().as_u16() {
        200..=299 => Ok(()),
        401 | 403 => Err("OpenRouter rejected this key. Check it and try again.".to_string()),
        code => Err(format!("OpenRouter returned an unexpected status ({}).", code)),
    }
}

// ============================================================================
// Tauri commands
// ============================================================================

#[tauri::command]
pub async fn byok_get_status() -> ByokStatus {
    ensure_loaded().await;
    status()
}

#[tauri::command]
pub async fn byok_set_openrouter_key(key: String) -> Result<ByokStatus, String> {
    ensure_loaded().await;
    let key = key.trim().to_string();
    if key.is_empty() {
        return Err("Enter an OpenRouter API key.".to_string());
    }

    validate_key(&key).await?;

    #[cfg(any(debug_assertions, feature = "dev-release-probe"))]
    if DEV_OVERRIDE.load(std::sync::atomic::Ordering::SeqCst) {
        *KEY.write().unwrap() = Some(key);
        return Ok(status());
    }

    save(&key)
        .map_err(|e| format!("Could not save the key to secure storage: {}", e))?;
    *KEY.write().unwrap() = Some(key);
    info!("OpenRouter key saved");

    Ok(status())
}

#[tauri::command]
pub async fn byok_clear_openrouter_key() -> Result<ByokStatus, String> {
    ensure_loaded().await;
    #[cfg(any(debug_assertions, feature = "dev-release-probe"))]
    if DEV_OVERRIDE.load(std::sync::atomic::Ordering::SeqCst) {
        *KEY.write().unwrap() = None;
        return Ok(status());
    }
    remove()
        .map_err(|e| format!("Could not remove the key from secure storage: {}", e))?;
    *KEY.write().unwrap() = None;
    info!("OpenRouter key removed");

    Ok(status())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    #[tokio::test]
    async fn validates_against_local_endpoint() {
        for status in [200, 401, 403, 500] {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let endpoint = format!("http://{}/api/v1/key", listener.local_addr().unwrap());
            let server = tokio::spawn(async move {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut request = [0u8; 4096];
                let _ = socket.read(&mut request).await.unwrap();
                socket.write_all(format!("HTTP/1.1 {status} Test\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}").as_bytes()).await.unwrap();
            });
            assert_eq!(validate_key_at("test-fixture", &endpoint).await.is_ok(), status == 200);
            server.await.unwrap();
        }
    }
    #[tokio::test]
    async fn unavailable_endpoint_is_plain_error() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}/api/v1/key", listener.local_addr().unwrap());
        drop(listener);
        assert_eq!(validate_key_at("test-fixture", &endpoint).await.unwrap_err(),
            "Could not reach OpenRouter. Check your connection and try again.");
    }
}
