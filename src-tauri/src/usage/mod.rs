//! OpenRouter account usage, cached per credential with single-flight refresh.
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountCredits {
    pub total: f64,
    pub used: f64,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageInfo {
    pub key_label: Option<String>,
    pub limit: Option<f64>,
    pub limit_remaining: Option<f64>,
    pub usage: f64,
    pub usage_daily: f64,
    pub usage_weekly: f64,
    pub usage_monthly: f64,
    pub account_credits: Option<AccountCredits>,
    pub fetched_at: String,
}
#[derive(Deserialize)]
struct KeyData {
    label: Option<String>,
    limit: Option<f64>,
    limit_remaining: Option<f64>,
    usage: f64,
    usage_daily: f64,
    usage_weekly: f64,
    usage_monthly: f64,
}
#[derive(Deserialize)]
struct Envelope<T> {
    data: T,
}
#[derive(Deserialize)]
struct Credits {
    total_credits: f64,
    total_usage: f64,
}
struct Cache {
    key: String,
    at: Instant,
    value: UsageInfo,
}
static CACHE: Lazy<Mutex<Option<Cache>>> = Lazy::new(|| Mutex::new(None));

#[tauri::command]
pub async fn usage_get(force_refresh: Option<bool>) -> Result<UsageInfo, String> {
    let api_key = crate::byok::require_key()
        .await
        .map_err(|_| "Add your OpenRouter API key in Settings.".to_string())?;
    let mut cache = CACHE.lock().await;
    if let Some(c) = cache.as_ref() {
        if c.key == api_key
            && c.at.elapsed() < Duration::from_secs(30)
            && !force_refresh.unwrap_or(false)
        {
            return Ok(c.value.clone());
        }
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|_| "Could not connect to OpenRouter.".to_string())?;
    let (key, credits) = tokio::join!(
        client
            .get("https://openrouter.ai/api/v1/key")
            .bearer_auth(&api_key)
            .send(),
        client
            .get("https://openrouter.ai/api/v1/credits")
            .bearer_auth(&api_key)
            .send()
    );
    let response = key.map_err(|_| "Could not reach OpenRouter. Try again.".to_string())?;
    if !response.status().is_success() {
        return Err(match response.status().as_u16() {
            401 | 403 => "OpenRouter refused this API key. Check it in Settings.".into(),
            code => format!("OpenRouter returned HTTP {code}. Try again."),
        });
    }
    let key = response
        .json::<Envelope<KeyData>>()
        .await
        .map_err(|_| "OpenRouter returned invalid usage data.".to_string())?
        .data;
    let account_credits = match credits {
        Ok(r) if r.status().is_success() => {
            r.json::<Envelope<Credits>>()
                .await
                .ok()
                .map(|r| AccountCredits {
                    total: r.data.total_credits,
                    used: r.data.total_usage,
                })
        }
        _ => None,
    };
    let value = UsageInfo {
        key_label: key.label,
        limit: key.limit,
        limit_remaining: key.limit_remaining,
        usage: key.usage,
        usage_daily: key.usage_daily,
        usage_weekly: key.usage_weekly,
        usage_monthly: key.usage_monthly,
        account_credits,
        fetched_at: chrono::Utc::now().to_rfc3339(),
    };
    *cache = Some(Cache {
        key: api_key,
        at: Instant::now(),
        value: value.clone(),
    });
    Ok(value)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recorded_key_shape_and_unlimited_key() {
        for limit in ["50", "null"] {
            let json = format!(
                r#"{{"data":{{"label":"example","limit":{limit},"limit_remaining":45.692246176,"usage":4.307753824,"usage_daily":4.26379942,"usage_weekly":4.307753824,"usage_monthly":4.307753824,"budgets":[]}}}}"#
            );
            let parsed: Envelope<KeyData> = serde_json::from_str(&json).unwrap();
            assert_eq!(parsed.data.usage, 4.307753824);
            assert_eq!(parsed.data.limit.is_none(), limit == "null");
        }
        let parsed: Envelope<Credits> =
            serde_json::from_str(r#"{"data":{"total_credits":75,"total_usage":57.319213774}}"#)
                .unwrap();
        assert_eq!(parsed.data.total_credits, 75.0);
    }
}
