//! Web access for the agent: WebSearch backends, WebFetch, and their settings.
//!
//! - The search provider id lives in config.json (`webSearchProvider`).
//! - Exa / Brave API keys live only in the OS keychain (service
//!   `vibe-work-web-exa` / `vibe-work-web-brave`, account `api-key`), are
//!   cached in memory after the first read, and are never logged.

pub mod fetch;
pub mod net;
pub mod search;

use once_cell::sync::Lazy;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::RwLock;
use tracing::{info, warn};

use crate::storage::SecureStorage;
use search::{BraveSearch, ExaSearch, OpenRouterSearch, SearchBackend};

const KEYCHAIN_ACCOUNT: &str = "api-key";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Provider {
    OpenRouter,
    Exa,
    Brave,
}

impl Provider {
    pub fn id(self) -> &'static str {
        match self {
            Provider::OpenRouter => "openrouter",
            Provider::Exa => "exa",
            Provider::Brave => "brave",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "openrouter" => Some(Provider::OpenRouter),
            "exa" => Some(Provider::Exa),
            "brave" => Some(Provider::Brave),
            _ => None,
        }
    }

    fn display(self) -> &'static str {
        match self {
            Provider::OpenRouter => "OpenRouter",
            Provider::Exa => "Exa",
            Provider::Brave => "Brave Search",
        }
    }

    /// Keychain service suffix for providers that need their own key.
    fn keychain_service(self) -> Option<&'static str> {
        match self {
            Provider::OpenRouter => None,
            Provider::Exa => Some("web-exa"),
            Provider::Brave => Some("web-brave"),
        }
    }
}

// ============================================================================
// Keys (keychain, cached)
// ============================================================================

/// None = not loaded yet; Some(None) = loaded, no key.
static KEYS: Lazy<RwLock<HashMap<Provider, Option<String>>>> = Lazy::new(|| RwLock::new(HashMap::new()));

fn get_key(provider: Provider) -> Option<String> {
    let service = provider.keychain_service()?;
    if let Some(cached) = KEYS.read().unwrap().get(&provider) {
        return cached.clone();
    }
    let loaded = match SecureStorage::get_password(service, KEYCHAIN_ACCOUNT) {
        Ok(Some(k)) if !k.is_empty() => Some(k),
        Ok(_) => None,
        Err(e) => {
            warn!("Could not read {} key from secure storage: {}", provider.display(), e);
            // Do not cache a read failure; try again next time.
            return None;
        }
    };
    KEYS.write().unwrap().insert(provider, loaded.clone());
    loaded
}

fn store_key(provider: Provider, key: Option<&str>) -> Result<(), String> {
    let service = provider
        .keychain_service()
        .ok_or("OpenRouter uses the main OpenRouter key; set it in the API key settings.")?;
    match key {
        Some(k) => SecureStorage::set_password(service, KEYCHAIN_ACCOUNT, k)
            .map_err(|e| format!("Could not save the key to secure storage: {}", e))?,
        None => SecureStorage::delete_password(service, KEYCHAIN_ACCOUNT)
            .map_err(|e| format!("Could not remove the key from secure storage: {}", e))?,
    }
    KEYS.write().unwrap().insert(provider, key.map(|k| k.to_string()));
    Ok(())
}

// ============================================================================
// Provider selection
// ============================================================================

/// The configured provider (OpenRouter when unset or unknown).
pub fn current_provider() -> Provider {
    crate::config::get_web_search_provider()
        .and_then(|p| Provider::parse(&p))
        .unwrap_or(Provider::OpenRouter)
}

/// The backend that should answer a search right now.
pub fn current_backend() -> Result<Box<dyn SearchBackend>, String> {
    let provider = current_provider();
    match provider {
        Provider::OpenRouter => Ok(Box::new(OpenRouterSearch)),
        Provider::Exa => get_key(provider)
            .map(|api_key| Box::new(ExaSearch { api_key }) as Box<dyn SearchBackend>)
            .ok_or_else(|| "Web search is set to Exa but no Exa key is stored. Add one in Settings, or switch the provider back to OpenRouter.".to_string()),
        Provider::Brave => get_key(provider)
            .map(|api_key| Box::new(BraveSearch { api_key }) as Box<dyn SearchBackend>)
            .ok_or_else(|| "Web search is set to Brave but no Brave key is stored. Add one in Settings, or switch the provider back to OpenRouter.".to_string()),
    }
}

/// Validate a key with one cheap real request.
async fn validate_key(provider: Provider, key: &str) -> Result<(), String> {
    let result = match provider {
        Provider::Exa => ExaSearch::request(key, &serde_json::json!({ "query": "test", "numResults": 1 }))
            .await
            .map(|_| ()),
        Provider::Brave => BraveSearch::request(key, "test", 1).await.map(|_| ()),
        Provider::OpenRouter => return Err("OpenRouter does not take a separate web key.".to_string()),
    };
    result.map_err(|e| {
        if e.contains("refused the API key") {
            format!("{} rejected this key. Check it and try again.", provider.display())
        } else {
            format!("Could not verify the {} key: {}", provider.display(), e)
        }
    })
}

// ============================================================================
// Tauri commands
// ============================================================================

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSettings {
    pub provider: &'static str,
    pub has_exa_key: bool,
    pub has_brave_key: bool,
}

fn settings() -> WebSettings {
    WebSettings {
        provider: current_provider().id(),
        has_exa_key: get_key(Provider::Exa).is_some(),
        has_brave_key: get_key(Provider::Brave).is_some(),
    }
}

#[tauri::command]
pub fn web_get_settings() -> WebSettings {
    settings()
}

#[tauri::command]
pub fn web_set_provider(provider: String) -> Result<WebSettings, String> {
    let p = Provider::parse(&provider)
        .ok_or_else(|| format!("Unknown web search provider '{}'. Use openrouter, exa or brave.", provider))?;
    if p != Provider::OpenRouter && get_key(p).is_none() {
        return Err(format!("Add a {} API key before selecting {}.", p.display(), p.display()));
    }
    crate::config::set_web_search_provider(p.id());
    Ok(settings())
}

#[tauri::command]
pub async fn web_set_key(provider: String, key: String) -> Result<WebSettings, String> {
    let p = Provider::parse(&provider)
        .filter(|p| *p != Provider::OpenRouter)
        .ok_or_else(|| format!("'{}' does not take a key here. Use exa or brave.", provider))?;
    let key = key.trim();

    if key.is_empty() {
        store_key(p, None)?;
        info!("{} web search key removed", p.display());
        if current_provider() == p {
            crate::config::set_web_search_provider(Provider::OpenRouter.id());
            info!("Web search provider switched back to OpenRouter");
        }
        return Ok(settings());
    }

    validate_key(p, key).await?;
    store_key(p, Some(key))?;
    info!("{} web search key saved", p.display());
    Ok(settings())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_ids_round_trip() {
        for p in [Provider::OpenRouter, Provider::Exa, Provider::Brave] {
            assert_eq!(Provider::parse(p.id()), Some(p));
        }
        assert_eq!(Provider::parse(" Exa "), Some(Provider::Exa));
        assert_eq!(Provider::parse("google"), None);
    }

    #[test]
    fn settings_serialize_camel_case() {
        let s = WebSettings { provider: "exa", has_exa_key: true, has_brave_key: false };
        let v = serde_json::to_value(s).unwrap();
        assert_eq!(v, serde_json::json!({"provider": "exa", "hasExaKey": true, "hasBraveKey": false}));
    }

    /// Live: invalid Exa/Brave keys are rejected with a readable message
    /// (free; nothing is stored). Run: cargo test -- --ignored live_invalid_keys --nocapture
    #[test]
    #[ignore]
    fn live_invalid_keys_are_rejected() {
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        for p in [Provider::Exa, Provider::Brave] {
            let err = rt.block_on(validate_key(p, "invalid-key-123")).unwrap_err();
            println!("{}", err);
            assert!(err.contains("rejected this key"), "{}", err);
        }
    }
}
