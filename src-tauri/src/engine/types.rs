//! Shapes the frontend receives for tasks, their history and their usage.

use serde::{Deserialize, Serialize};

/// Session info returned to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub session_id: String,
    pub name: String,
    pub description: String,
    pub agent_type: String,
    pub created_at: String,
    pub updated_at: String,
    pub conversation_name: Option<String>,
    /// When the user settled this conversation (moved it to the Settled shelf), if they did
    pub settled_at: Option<String>,
    pub cost_usd: Option<f64>,
    /// The folder the user chose for this task; None when it works in the default location
    #[serde(default)]
    pub working_folder: Option<String>,
}

/// Message info for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageInfo {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub timings: Vec<serde_json::Value>,
    pub role: String,
    pub content: serde_json::Value,
    /// Quiet timeline lines shown above a user message ("Connector added: …").
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub notes: Vec<String>,
    /// Assistant messages: how the turn ended when it did not finish, shown
    /// inline after the reply: `{"kind":"stopped"}` (the user pressed Stop)
    /// or `{"kind":"failed","text":…}` (the engine died or restarted).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end: Option<serde_json::Value>,
    /// The engine's message id(s) this entry shows, so the conversation can
    /// scroll to a message found by search.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub source_ids: Vec<String>,
}

/// Token and cost totals of a model call, a turn or a whole task, as the
/// usage strip shows them. `input_tokens` counts every prompt token
/// (OpenRouter's `prompt_tokens`), cached ones included.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UsageTotals {
    pub input_tokens: u64,
    pub cached_input_tokens: Option<u64>,
    pub output_tokens: u64,
    pub reasoning_tokens: Option<u64>,
    pub cost_usd: Option<f64>,
    pub calls: u64,
}

impl UsageTotals {
    pub fn add(&mut self, other: &Self) {
        self.input_tokens += other.input_tokens;
        self.output_tokens += other.output_tokens;
        self.calls += other.calls;
        if let Some(v) = other.cached_input_tokens {
            self.cached_input_tokens = Some(self.cached_input_tokens.unwrap_or(0) + v);
        }
        if let Some(v) = other.reasoning_tokens {
            self.reasoning_tokens = Some(self.reasoning_tokens.unwrap_or(0) + v);
        }
        if let Some(v) = other.cost_usd {
            self.cost_usd = Some(self.cost_usd.unwrap_or(0.0) + v);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn usage_wire_shape_is_camel_case() {
        let usage = UsageTotals { input_tokens: 100, cached_input_tokens: Some(80), output_tokens: 10, reasoning_tokens: Some(5), cost_usd: Some(0.02), calls: 1 };
        let value = serde_json::to_value(&usage).unwrap();
        assert_eq!(value, serde_json::json!({"inputTokens":100,"cachedInputTokens":80,"outputTokens":10,"reasoningTokens":5,"costUsd":0.02,"calls":1}));
        assert_eq!(serde_json::from_value::<UsageTotals>(value).unwrap(), usage);
        assert_eq!(UsageTotals::default().cost_usd, None);
    }

    #[test]
    fn accumulate() {
        let known = UsageTotals { input_tokens: 100, cached_input_tokens: Some(80), output_tokens: 10, reasoning_tokens: Some(5), cost_usd: Some(0.02), calls: 1 };
        let mut total = UsageTotals::default();
        total.add(&known);
        total.add(&known);
        total.add(&UsageTotals { calls: 1, input_tokens: 4, ..Default::default() });
        assert_eq!(total.cost_usd, Some(0.04));
        assert_eq!(total.input_tokens, 204);
        assert_eq!(total.cached_input_tokens, Some(160));
        assert_eq!(total.reasoning_tokens, Some(10));
        assert_eq!(total.calls, 3);
    }
}
