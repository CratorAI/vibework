//! Minimal HTTP client for the OpenCode v2 API (`/api/...`).
//!
//! Responses are handled as JSON values: the v2 API is marked experimental
//! upstream, so the adapter reads only the fields it needs and tolerates the rest.

use std::sync::Arc;
use std::time::Duration;

use serde_json::Value;

use super::sidecar::Connection;

#[derive(Clone)]
pub struct Client {
    http: reqwest::Client,
    conn: Arc<Connection>,
}

/// Session IDs on the engine must start with `ses`; the app uses UUIDs.
pub fn engine_session_id(app_session_id: &str) -> String {
    if app_session_id.starts_with("ses") {
        app_session_id.to_string()
    } else {
        format!("ses_{}", app_session_id.replace('-', ""))
    }
}

fn enc(value: &str) -> String {
    percent_encoding::utf8_percent_encode(value, percent_encoding::NON_ALPHANUMERIC).to_string()
}

impl Client {
    pub fn new(conn: Arc<Connection>) -> Self {
        let http = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .build()
            .expect("HTTP client");
        Self { http, conn }
    }

    /// Which engine process this client talks to.
    pub fn generation(&self) -> u64 {
        self.conn.generation
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.conn.base_url, path)
    }

    async fn send(&self, request: reqwest::RequestBuilder) -> Result<Value, String> {
        let response = request
            .header("Authorization", self.conn.authorization())
            .timeout(Duration::from_secs(60))
            .send()
            .await
            .map_err(|e| format!("Engine request failed: {}", e.without_url()))?;
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        if !status.is_success() {
            let message = serde_json::from_str::<Value>(&text)
                .ok()
                .and_then(|v| {
                    v.pointer("/error/message")
                        .or_else(|| v.get("message"))
                        .and_then(|m| m.as_str())
                        .map(str::to_string)
                })
                .unwrap_or_else(|| text.chars().take(300).collect());
            return Err(format!("Engine returned HTTP {}: {}", status.as_u16(), message));
        }
        if text.trim().is_empty() {
            return Ok(Value::Null);
        }
        serde_json::from_str(&text).map_err(|e| format!("Engine returned invalid JSON: {e}"))
    }

    pub async fn get(&self, path: &str) -> Result<Value, String> {
        self.send(self.http.get(self.url(path))).await
    }

    pub async fn post(&self, path: &str, body: &Value) -> Result<Value, String> {
        self.send(self.http.post(self.url(path)).json(body)).await
    }

    pub async fn patch(&self, path: &str, body: &Value) -> Result<Value, String> {
        self.send(self.http.patch(self.url(path)).json(body)).await
    }

    pub async fn delete(&self, path: &str) -> Result<Value, String> {
        self.send(self.http.delete(self.url(path))).await
    }

    /// Open the live event stream (`/api/event`, server-sent events).
    pub async fn events(&self) -> Result<reqwest::Response, String> {
        let response = self
            .http
            .get(self.url("/api/event"))
            .header("Authorization", self.conn.authorization())
            .header("Accept", "text/event-stream")
            .send()
            .await
            .map_err(|e| format!("Cannot open the engine event stream: {}", e.without_url()))?;
        if !response.status().is_success() {
            return Err(format!("Engine event stream returned HTTP {}", response.status().as_u16()));
        }
        Ok(response)
    }

    // ----- Typed helpers -------------------------------------------------

    pub async fn create_session(&self, body: &Value) -> Result<Value, String> {
        Ok(self.post("/api/session", body).await?["data"].take())
    }

    pub async fn session(&self, engine_id: &str) -> Result<Value, String> {
        Ok(self.get(&format!("/api/session/{}", enc(engine_id))).await?["data"].take())
    }

    pub async fn list_sessions(&self) -> Result<Vec<Value>, String> {
        let value = self.get("/api/session?limit=1000&order=desc&parentID=null").await?;
        Ok(value["data"].as_array().cloned().unwrap_or_default())
    }

    /// The whole message history, oldest first.
    /// The helpers (child sessions) a task's subagent calls started.
    pub async fn children(&self, engine_id: &str) -> Result<Vec<Value>, String> {
        let value = self.get(&format!("/api/session?limit=1000&order=asc&parentID={}", enc(engine_id))).await?;
        Ok(value["data"].as_array().cloned().unwrap_or_default())
    }

    pub async fn messages(&self, engine_id: &str) -> Result<Vec<Value>, String> {
        const PAGE: usize = 200; // the engine caps `limit` at 200
        let mut all = Vec::new();
        let mut cursor: Option<String> = None;
        loop {
            let path = match &cursor {
                None => format!("/api/session/{}/message?order=asc&limit={PAGE}", enc(engine_id)),
                Some(c) => format!("/api/session/{}/message?limit={PAGE}&cursor={}", enc(engine_id), enc(c)),
            };
            let mut value = self.get(&path).await?;
            let page = value["data"].as_array().cloned().unwrap_or_default();
            let count = page.len();
            all.extend(page);
            let next = value["cursor"]["next"].take().as_str().map(str::to_string);
            match next {
                Some(next) if count == PAGE => cursor = Some(next),
                _ => break,
            }
        }
        Ok(all)
    }

    /// Send the user's message. `skills` are skill ids the user chose for it
    /// (the "/" menu): the engine adds each skill's instructions to this
    /// message itself, as if the model had loaded it.
    pub async fn prompt_files(&self, engine_id: &str, text: &str, files: &[Value], skills: &[String]) -> Result<(), String> {
        let mut body = serde_json::json!({ "text": text, "files": files });
        if !skills.is_empty() {
            body["skills"] = skills.iter().map(|id| serde_json::json!({ "id": id })).collect();
        }
        self.post(&format!("/api/session/{}/prompt", enc(engine_id)), &body)
            .await
            .map(|_| ())
    }

    /// Add context the model sees as a user message but the conversation
    /// does not show (an engine "synthetic" message). It waits for the next
    /// prompt (`resume: false`) and goes to the model before it.
    pub async fn synthetic(&self, engine_id: &str, text: &str, kind: &str) -> Result<(), String> {
        self.post(
            &format!("/api/session/{}/synthetic", enc(engine_id)),
            &serde_json::json!({ "text": text, "metadata": { "source": "vibework", "kind": kind }, "resume": false }),
        )
        .await
        .map(|_| ())
    }

    /// When the user last sent a message (ms), from the newest messages.
    pub async fn last_prompt_at(&self, engine_id: &str) -> Result<Option<f64>, String> {
        let value = self.get(&format!("/api/session/{}/message?order=desc&limit=50", enc(engine_id))).await?;
        Ok(value["data"].as_array().into_iter().flatten().find(|m| m["type"] == "user").and_then(|m| m["time"]["created"].as_f64()))
    }

    pub async fn interrupt(&self, engine_id: &str) -> Result<(), String> {
        self.post(&format!("/api/session/{}/interrupt?resume=false", enc(engine_id)), &serde_json::json!({})).await.map(|_| ())
    }

    pub async fn reply_permission(&self, engine_id: &str, request_id: &str, decision: &str, message: Option<&str>) -> Result<(), String> {
        self.post(
            &format!("/api/session/{}/permission/{}/reply", enc(engine_id), enc(request_id)),
            &serde_json::json!({ "decision": decision, "message": message }),
        )
        .await
        .map(|_| ())
    }

    /// Pending permission requests for sessions working in `directory`. The
    /// engine lists them per location; without one it uses its own working
    /// folder, which is never a task's.
    pub async fn pending_permissions(&self, directory: &str) -> Result<Vec<Value>, String> {
        let request = self.http.get(self.url("/api/permission/request")).query(&[("location[directory]", directory)]);
        Ok(self.send(request).await?["data"].as_array().cloned().unwrap_or_default())
    }

    /// MCP servers registered for a location (`[{name, status: {status}}]`).
    pub async fn mcp_servers(&self, directory: &str) -> Result<Vec<Value>, String> {
        let request = self.http.get(self.url("/api/mcp")).query(&[("location[directory]", directory)]);
        Ok(self.send(request).await?["data"].as_array().cloned().unwrap_or_default())
    }

    /// Ask a folder's copy of an MCP server to connect again.
    pub async fn mcp_connect(&self, directory: &str, name: &str) -> Result<(), String> {
        let request = self
            .http
            .post(self.url(&format!("/api/experimental/mcp/{}/connect", enc(name))))
            .query(&[("location[directory]", directory)]);
        self.send(request).await.map(|_| ())
    }

    /// IDs of the stored credentials (sign-ins) of one integration.
    pub async fn integration_credentials(&self, integration: &str, directory: &str) -> Result<Vec<String>, String> {
        let request = self.http.get(self.url(&format!("/api/integration/{}", enc(integration)))).query(&[("location[directory]", directory)]);
        let data = self.send(request).await?;
        Ok(data["data"]["connections"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|c| c["type"] == "credential")
            .filter_map(|c| c["id"].as_str().map(str::to_string))
            .collect())
    }

    /// (credential id, integration id) of every connector sign-in (`mcp_…`
    /// integrations). Only ids are kept from the answer.
    pub async fn mcp_credentials(&self) -> Result<Vec<(String, String)>, String> {
        let data = self.send(self.http.get(self.url("/api/credential"))).await?;
        let list = data.get("data").cloned().unwrap_or(data);
        Ok(list
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|c| Some((c["id"].as_str()?.to_string(), c["integrationID"].as_str()?.to_string())))
            .filter(|(_, integration)| integration.starts_with("mcp_"))
            .collect())
    }

    pub async fn delete_credential(&self, id: &str) -> Result<(), String> {
        self.send(self.http.delete(self.url(&format!("/api/credential/{}", enc(id))))).await.map(|_| ())
    }

    /// Start an OAuth sign-in; returns `{attemptID, url, …}` (the engine
    /// opens no browser and listens for the callback itself).
    pub async fn oauth_connect(&self, integration: &str, directory: &str) -> Result<Value, String> {
        let request = self
            .http
            .post(self.url(&format!("/api/integration/{}/connect/oauth", enc(integration))))
            .query(&[("location[directory]", directory)])
            .json(&serde_json::json!({ "methodID": integration }));
        Ok(self.send(request).await?["data"].clone())
    }

    /// `{status: pending | complete | failed (message) | expired}`.
    pub async fn oauth_status(&self, integration: &str, attempt: &str, directory: &str) -> Result<Value, String> {
        let request = self
            .http
            .get(self.url(&format!("/api/integration/{}/connect/oauth/{}", enc(integration), enc(attempt))))
            .query(&[("location[directory]", directory)]);
        Ok(self.send(request).await?["data"].clone())
    }

    pub async fn oauth_cancel(&self, integration: &str, attempt: &str, directory: &str) -> Result<(), String> {
        let request = self
            .http
            .delete(self.url(&format!("/api/integration/{}/connect/oauth/{}", enc(integration), enc(attempt))))
            .query(&[("location[directory]", directory)]);
        self.send(request).await.map(|_| ())
    }

    /// IDs of sessions that are currently executing.
    pub async fn active_sessions(&self) -> Result<Vec<String>, String> {
        let value = self.get("/api/session/active").await?;
        Ok(value["data"].as_object().map(|m| m.keys().cloned().collect()).unwrap_or_default())
    }

    /// Replace the environment of the session's shell commands (kept in engine memory).
    pub async fn set_environment(&self, engine_id: &str, variables: &std::collections::BTreeMap<String, String>) -> Result<(), String> {
        let request = self
            .http
            .put(self.url(&format!("/api/session/{}/environment", enc(engine_id))))
            .json(&serde_json::json!({ "variables": variables }));
        self.send(request).await.map(|_| ())
    }

    pub async fn update_metadata(&self, engine_id: &str, metadata: &Value) -> Result<(), String> {
        self.patch(&format!("/api/session/{}", enc(engine_id)), &serde_json::json!({ "metadata": metadata }))
            .await
            .map(|_| ())
    }

    pub async fn set_model(&self, engine_id: &str, model_id: &str) -> Result<(), String> {
        self.post(
            &format!("/api/session/{}/model", enc(engine_id)),
            &serde_json::json!({ "model": { "id": model_id, "providerID": "openrouter" } }),
        )
        .await
        .map(|_| ())
    }

    pub async fn move_session(&self, engine_id: &str, directory: &str) -> Result<(), String> {
        self.post(&format!("/api/session/{}/move", enc(engine_id)), &serde_json::json!({ "directory": directory }))
            .await
            .map(|_| ())
    }

    pub async fn delete_session(&self, engine_id: &str) -> Result<(), String> {
        self.delete(&format!("/api/session/{}", enc(engine_id))).await.map(|_| ())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_app_ids_to_engine_ids() {
        assert_eq!(
            engine_session_id("8c6cddef-21bc-401b-8607-5743ef384993"),
            "ses_8c6cddef21bc401b86075743ef384993"
        );
        assert_eq!(engine_session_id("ses_abc"), "ses_abc");
    }
}
