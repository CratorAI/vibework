//! OpenRouter model catalogue.
//!
//! Fetches the public model list from OpenRouter (no key needed), keeps the
//! models that support tool calling, and caches the result in memory for an
//! hour. Also owns the default-model setting.

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::sync::RwLock;
use std::time::{Duration, Instant};
use tracing::{info, warn};

/// Built-in default model, used when the user has not picked one.
pub const DEFAULT_MODEL: &str = "deepseek/deepseek-v4.1-flash";

const OPENROUTER_MODELS_URL: &str = "https://openrouter.ai/api/v1/models";
const CACHE_TTL: Duration = Duration::from_secs(60 * 60);
const FETCH_TIMEOUT: Duration = Duration::from_secs(20);

/// A model as returned to the frontend.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub context_length: u64,
    /// USD per million prompt tokens (None when OpenRouter reports no fixed price)
    pub prompt_price: Option<f64>,
    /// USD per million completion tokens (None when OpenRouter reports no fixed price)
    pub completion_price: Option<f64>,
    pub supports_reasoning: bool,
    pub supports_images: bool,
}

/// A cached model plus details used internally when building providers.
#[derive(Debug, Clone)]
struct CachedModel {
    info: ModelInfo,
    max_completion_tokens: Option<u32>,
}

struct Cache {
    fetched_at: Instant,
    models: Vec<CachedModel>,
}

static CACHE: Lazy<RwLock<Option<Cache>>> = Lazy::new(|| RwLock::new(None));

// ============================================================================
// OpenRouter response shape
// ============================================================================

#[derive(Debug, Deserialize)]
struct ModelsResponse {
    data: Vec<RawModel>,
}

#[derive(Debug, Deserialize)]
struct RawModel {
    id: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    context_length: Option<u64>,
    #[serde(default)]
    pricing: Option<RawPricing>,
    #[serde(default)]
    architecture: Option<RawArchitecture>,
    #[serde(default)]
    supported_parameters: Option<Vec<String>>,
    #[serde(default)]
    top_provider: Option<RawTopProvider>,
}

#[derive(Debug, Deserialize)]
struct RawPricing {
    #[serde(default)]
    prompt: Option<String>,
    #[serde(default)]
    completion: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawArchitecture {
    #[serde(default)]
    input_modalities: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct RawTopProvider {
    #[serde(default)]
    context_length: Option<u64>,
    #[serde(default)]
    max_completion_tokens: Option<u64>,
}

/// Convert OpenRouter's per-token price string to USD per million tokens.
/// Negative sentinel prices (used by router entries) and unparsable values map to None.
fn per_million(price: Option<&str>) -> Option<f64> {
    let per_token: f64 = price?.trim().parse().ok()?;
    if !per_token.is_finite() || per_token < 0.0 {
        return None;
    }
    // Round away float noise (e.g. 0.000001 * 1e6 = 0.9999999999999999)
    Some((per_token * 1_000_000.0 * 1_000_000.0).round() / 1_000_000.0)
}

fn parse_models(body: &str) -> Result<Vec<CachedModel>, serde_json::Error> {
    let response: ModelsResponse = serde_json::from_str(body)?;
    Ok(response
        .data
        .into_iter()
        .filter_map(|m| {
            let params = m.supported_parameters.unwrap_or_default();
            if m.id.starts_with('~') || !params.iter().any(|p| p == "tools") {
                return None;
            }
            let supports_images = m
                .architecture
                .and_then(|a| a.input_modalities)
                .map(|mods| mods.iter().any(|x| x == "image"))
                .unwrap_or(false);
            let (prompt, completion) = match &m.pricing {
                Some(p) => (per_million(p.prompt.as_deref()), per_million(p.completion.as_deref())),
                None => (None, None),
            };
            let context_length = m
                .context_length
                .or_else(|| m.top_provider.as_ref().and_then(|t| t.context_length))
                .unwrap_or(0);
            let max_completion_tokens = m
                .top_provider
                .as_ref()
                .and_then(|t| t.max_completion_tokens)
                .map(|n| n.min(u32::MAX as u64) as u32);
            Some(CachedModel {
                info: ModelInfo {
                    name: m.name.unwrap_or_else(|| m.id.clone()),
                    id: m.id,
                    context_length,
                    prompt_price: prompt,
                    completion_price: completion,
                    supports_reasoning: params.iter().any(|p| p == "reasoning"),
                    supports_images,
                },
                max_completion_tokens,
            })
        })
        .collect())
}

async fn fetch_models() -> Result<Vec<CachedModel>, String> {
    let response = reqwest::Client::new()
        .get(OPENROUTER_MODELS_URL)
        .timeout(FETCH_TIMEOUT)
        .send()
        .await
        .map_err(|e| format!("Could not reach OpenRouter: {}", e))?;
    if !response.status().is_success() {
        return Err(format!(
            "OpenRouter returned an unexpected status ({}) for the model list.",
            response.status().as_u16()
        ));
    }
    let body = response
        .text()
        .await
        .map_err(|e| format!("Could not read the OpenRouter model list: {}", e))?;
    parse_models(&body).map_err(|e| format!("Could not parse the OpenRouter model list: {}", e))
}

fn cached_infos(max_age: Option<Duration>) -> Option<Vec<ModelInfo>> {
    let cache = CACHE.read().unwrap();
    let cache = cache.as_ref()?;
    if let Some(max_age) = max_age {
        if cache.fetched_at.elapsed() > max_age {
            return None;
        }
    }
    Some(cache.models.iter().map(|m| m.info.clone()).collect())
}

/// Return the model list, fetching it when the cache is missing, stale or a refresh is forced.
/// On fetch failure the stale cache is returned if there is one.
pub async fn list(force_refresh: bool) -> Result<Vec<ModelInfo>, String> {
    if !force_refresh {
        if let Some(models) = cached_infos(Some(CACHE_TTL)) {
            return Ok(models);
        }
    }

    match fetch_models().await {
        Ok(models) => {
            info!("Fetched {} tool-capable models from OpenRouter", models.len());
            let infos = models.iter().map(|m| m.info.clone()).collect();
            *CACHE.write().unwrap() = Some(Cache {
                fetched_at: Instant::now(),
                models,
            });
            Ok(infos)
        }
        Err(e) => {
            warn!("Model list fetch failed: {}", e);
            cached_infos(None).ok_or(e)
        }
    }
}

/// Make sure the cache has been filled at least once (best effort).
/// Used before building providers so reasoning support can be looked up.
pub async fn ensure_loaded() {
    if CACHE.read().unwrap().is_none() {
        let _ = list(false).await;
    }
}

fn lookup<T>(model_id: &str, f: impl FnOnce(&CachedModel) -> T) -> Option<T> {
    let cache = CACHE.read().unwrap();
    cache
        .as_ref()?
        .models
        .iter()
        .find(|m| m.info.id == model_id)
        .map(f)
}

/// Snapshot used to register all picker models in the isolated engine config.
pub fn engine_models() -> serde_json::Value {
    let models = cached_infos(None).unwrap_or_default();
    let mut out = serde_json::Map::new();
    for model in models {
        let context = model.context_length.max(8192);
        let output = max_completion_tokens(&model.id).unwrap_or(8192).min(context as u32);
        out.insert(model.id.clone(), serde_json::json!({
            "name":model.name, "modelID":model.id,
            "limit":{"context":context,"output":output},
            "capabilities":{"tools":true,"input":if model.supports_images {vec!["text","image"]} else {vec!["text"]},"output":["text"]},
            "body":{"reasoning":{"enabled":model.supports_reasoning}}
        }));
    }
    serde_json::Value::Object(out)
}

/// The model's maximum completion tokens, if OpenRouter reports one.
pub fn max_completion_tokens(model_id: &str) -> Option<u32> {
    lookup(model_id, |m| m.max_completion_tokens).flatten()
}

/// Normalize a stored model id. OpenRouter ids always look like `vendor/model`;
/// anything else (empty, or a tier/legacy name such as `fast` or
/// `gemini-3-flash-preview`) falls back to the default model.
pub fn resolve_model_id(model_id: Option<&str>) -> String {
    match model_id.map(str::trim) {
        Some(id) if id.contains('/') => id.to_string(),
        _ => crate::config::get_default_model(),
    }
}

// ============================================================================
// Tauri commands
// ============================================================================

/// List the OpenRouter models that support tool calling.
#[tauri::command]
pub async fn models_list(force_refresh: Option<bool>) -> Result<Vec<ModelInfo>, String> {
    list(force_refresh.unwrap_or(false)).await
}

/// Get the default model id for new sessions.
#[tauri::command]
pub fn get_default_model() -> String {
    crate::config::get_default_model()
}

/// Set the default model id for new sessions.
#[tauri::command]
pub fn set_default_model(model_id: String) -> Result<(), String> {
    let model_id = model_id.trim();
    if model_id.is_empty() {
        return Err("Model id cannot be empty.".to_string());
    }
    crate::config::set_default_model(model_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{
      "data": [
        {
          "id": "deepseek/deepseek-v4.1-flash",
          "name": "DeepSeek: V4.1 Flash",
          "context_length": 163840,
          "pricing": {"prompt": "0.0000002", "completion": "0.0000008"},
          "architecture": {"input_modalities": ["text"]},
          "supported_parameters": ["tools", "tool_choice", "reasoning", "max_tokens"],
          "top_provider": {"context_length": 163840, "max_completion_tokens": 65536}
        },
        {
          "id": "openai/gpt-vision",
          "name": "Vision",
          "context_length": 128000,
          "pricing": {"prompt": "0.000001", "completion": "0.000003"},
          "architecture": {"input_modalities": ["text", "image"]},
          "supported_parameters": ["tools"],
          "top_provider": {"context_length": 128000, "max_completion_tokens": null}
        },
        {
          "id": "openrouter/auto",
          "name": "Auto Router",
          "context_length": 2000000,
          "pricing": {"prompt": "-1", "completion": "-1"},
          "architecture": {"input_modalities": ["text", "image"]},
          "supported_parameters": ["tools", "reasoning"]
        },
        {
          "id": "~anthropic/claude-latest",
          "name": "Alias",
          "context_length": 200000,
          "pricing": {"prompt": "0.000003", "completion": "0.000015"},
          "supported_parameters": ["tools"]
        },
        {
          "id": "someone/no-tools",
          "name": "No tools",
          "context_length": 8192,
          "pricing": {"prompt": "0", "completion": "0"},
          "supported_parameters": ["max_tokens"]
        }
      ]
    }"#;

    #[test]
    fn parses_and_filters_models() {
        let models = parse_models(SAMPLE).unwrap();
        let ids: Vec<&str> = models.iter().map(|m| m.info.id.as_str()).collect();
        assert_eq!(ids, vec!["deepseek/deepseek-v4.1-flash", "openai/gpt-vision", "openrouter/auto"]);

        let ds = &models[0];
        assert_eq!(ds.info.prompt_price, Some(0.2));
        assert_eq!(ds.info.completion_price, Some(0.8));
        assert!(ds.info.supports_reasoning);
        assert!(!ds.info.supports_images);
        assert_eq!(ds.info.context_length, 163840);
        assert_eq!(ds.max_completion_tokens, Some(65536));

        let vision = &models[1];
        assert_eq!(vision.info.prompt_price, Some(1.0));
        assert_eq!(vision.info.completion_price, Some(3.0));
        assert!(vision.info.supports_images);
        assert!(!vision.info.supports_reasoning);
        assert_eq!(vision.max_completion_tokens, None);

        let auto = &models[2];
        assert_eq!(auto.info.prompt_price, None);
        assert_eq!(auto.info.completion_price, None);
    }

    #[test]
    fn serializes_camel_case() {
        let models = parse_models(SAMPLE).unwrap();
        let json = serde_json::to_value(&models[0].info).unwrap();
        for key in ["id", "name", "contextLength", "promptPrice", "completionPrice", "supportsReasoning", "supportsImages"] {
            assert!(json.get(key).is_some(), "missing {}", key);
        }
    }

    #[test]
    fn price_conversion() {
        assert_eq!(per_million(Some("0")), Some(0.0));
        assert_eq!(per_million(Some("-1")), None);
        assert_eq!(per_million(Some("abc")), None);
        assert_eq!(per_million(None), None);
        assert_eq!(per_million(Some("0.000015")), Some(15.0));
    }
}
