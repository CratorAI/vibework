//! The app's own tools, served to the OpenCode engine over MCP (see `bridge`).
//!
//! PresentFile, Browser (the embedded Browser tab of the task), WebSearch
//! (OpenRouter search or the user's Exa/Brave key) and WebFetch. Each call is routed to
//! its app session through `_meta["ai.opencode/sessionID"]`.

use base64::Engine as _;
use serde_json::{json, Value};
use tracing::info;

use crate::browser::tool::{self as browser, BrowserOutput};
use crate::web::fetch::{fetch_url, DEFAULT_MAX_CHARS, MAX_MAX_CHARS};

/// MCP tool name → the app tool name the UI renders.
pub const TOOLS: &[(&str, &str)] = &[
    ("present_file", "PresentFile"),
    ("browser", "Browser"),
    ("web_search", "WebSearch"),
    ("web_fetch", "WebFetch"),
];

fn definitions() -> Value {
    json!([
        {
            "name": "present_file",
            "description": "Present a file or a HyperFrames Motion project folder to the user with an option to open it. Use this after creating or modifying a file that the user should access: it shows a file card in the chat and opens the file in the workspace panel.",
            "inputSchema": { "type": "object", "properties": {
                "file_path": { "type": "string", "description": "Absolute path to the file or HyperFrames project folder" },
                "file_name": { "type": "string", "description": "Display name for the file" },
                "description": { "type": "string", "description": "Brief description of what the file contains" }
            }, "required": ["file_path", "file_name"] }
        },
        {
            "name": "browser",
            "description": browser::DESCRIPTION,
            "inputSchema": browser::input_schema()
        },
        {
            "name": "web_search",
            "description": "Search the web. Returns a compact list of results, each with a title, URL and short snippet. Use it for current information, facts you are unsure of, documentation, news, or to find the right page; then use web_fetch to read a result in full. Write the query the way you would type it into a search engine.",
            "inputSchema": { "type": "object", "properties": {
                "query": { "type": "string", "description": "The search query" },
                "max_results": { "type": "number", "description": "Number of results to return (default 5, max 10)" }
            }, "required": ["query"] }
        },
        {
            "name": "web_fetch",
            "description": format!("Fetch a public http(s) URL and return its readable content: HTML pages are converted to markdown (scripts, styles and navigation removed); plain text, JSON and markdown are returned as is; other content types (PDFs, images, archives) are described, not returned. Output is truncated to max_chars (default {DEFAULT_MAX_CHARS}, max {MAX_MAX_CHARS}) and says so when cut. Redirects are followed. Local, private-network and cloud-metadata addresses are refused. Pages that need JavaScript, interaction or a login will come back empty or incomplete; use the browser tool for those."),
            "inputSchema": { "type": "object", "properties": {
                "url": { "type": "string", "description": "The http or https URL to fetch" },
                "max_chars": { "type": "number", "description": format!("Maximum characters of content to return (default {DEFAULT_MAX_CHARS}, max {MAX_MAX_CHARS})") }
            }, "required": ["url"] }
        }
    ])
}

/// Engine session ID → (app session ID, working folder), when the session is known.
fn route(meta: &Value) -> Option<(String, Option<String>)> {
    let engine_id = meta.get("ai.opencode/sessionID")?.as_str()?;
    if let Ok(engine) = super::get() {
        let reducer = engine.reducer.lock().unwrap();
        let owner = reducer.scratch_owner(engine_id);
        if let Some(track) = reducer.session(&owner) {
            return Some((track.app_id.clone(), track.working_dir.clone()));
        }
    }
    // Not attached (should not happen during a turn): derive the app UUID.
    let hex = engine_id.strip_prefix("ses_")?;
    if hex.len() == 32 && hex.chars().all(|c| c.is_ascii_hexdigit()) {
        let id = format!("{}-{}-{}-{}-{}", &hex[0..8], &hex[8..12], &hex[12..16], &hex[16..20], &hex[20..32]);
        return Some((id, None));
    }
    None
}

fn text_result(text: String, is_error: bool) -> Value {
    json!({ "content": [{ "type": "text", "text": text }], "isError": is_error })
}

async fn call(name: &str, args: &Value, meta: &Value) -> Value {
    match name {
        "present_file" => {
            let path = args["file_path"].as_str().unwrap_or_default();
            let file_name = args["file_name"].as_str().unwrap_or_default();
            if path.is_empty() || file_name.is_empty() {
                return text_result("file_path and file_name are required".into(), true);
            }
            if std::path::Path::new(path).is_dir() {
                let Some((session, _)) = route(meta) else {
                    return text_result("Motion projects must belong to a task".into(), true);
                };
                let result = match crate::artifacts::paths::roots_for_session(&session).await {
                    Ok(roots) => crate::motion::present_project(&roots, path),
                    Err(error) => Err(error.to_string()),
                };
                if let Err(error) = result {
                    return text_result(error, true);
                }
            }
            info!("File ready: {file_name} at {path}");
            text_result(format!("File ready: {file_name} at {path}"), false)
        }
        "browser" => {
            let Some((session, folder)) = route(meta) else {
                return text_result("The browser is only available inside a task".into(), true);
            };
            match browser::run(&session, folder, args).await {
                Ok(BrowserOutput::Text(text)) => text_result(text, false),
                Ok(BrowserOutput::Image { bytes, mime, text }) => json!({
                    "content": [
                        { "type": "image", "data": base64::engine::general_purpose::STANDARD.encode(&bytes), "mimeType": mime },
                        { "type": "text", "text": text }
                    ],
                    "isError": false
                }),
                Err(e) => text_result(e, true),
            }
        }
        "web_search" => {
            let query = args["query"].as_str().unwrap_or_default().trim().to_string();
            if query.is_empty() {
                return text_result("The query is empty.".into(), true);
            }
            let max = args["max_results"].as_f64().filter(|n| n.is_finite() && *n >= 1.0).map(|n| (n as usize).min(10)).unwrap_or(5);
            let backend = match crate::web::current_backend() {
                Ok(b) => b,
                Err(e) => return text_result(e, true),
            };
            match backend.search(&query, max).await {
                Ok(results) => text_result(crate::web::search::format_results(&query, backend.label(), &results), false),
                Err(e) => text_result(e, true),
            }
        }
        "web_fetch" => {
            let Some(url) = args["url"].as_str() else { return text_result("url is required".into(), true) };
            let max = args["max_chars"]
                .as_f64()
                .filter(|n| n.is_finite() && *n >= 1.0)
                .map(|n| (n as usize).min(MAX_MAX_CHARS))
                .unwrap_or(DEFAULT_MAX_CHARS);
            match fetch_url(url, max).await {
                Ok(text) => text_result(text, false),
                Err(e) => text_result(e, true),
            }
        }
        other => text_result(format!("Unknown tool {other}"), true),
    }
}

/// Handle one JSON-RPC message; `None` for notifications.
pub async fn handle_rpc(message: &Value) -> Option<Value> {
    let id = message.get("id").cloned()?;
    let method = message["method"].as_str().unwrap_or_default();
    let params = &message["params"];
    let result = match method {
        "initialize" => json!({
            "protocolVersion": params["protocolVersion"].as_str().unwrap_or("2025-06-18"),
            "capabilities": { "tools": { "listChanged": false } },
            "serverInfo": { "name": "vibework", "version": env!("CARGO_PKG_VERSION") },
        }),
        "ping" => json!({}),
        "tools/list" => json!({ "tools": definitions() }),
        "tools/call" => {
            let name = params["name"].as_str().unwrap_or_default();
            let empty = json!({});
            let args = params.get("arguments").unwrap_or(&empty);
            let meta = params.get("_meta").unwrap_or(&empty);
            call(name, args, meta).await
        }
        "resources/list" => json!({ "resources": [] }),
        "prompts/list" => json!({ "prompts": [] }),
        _ => {
            return Some(json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32601, "message": format!("Method not found: {method}") } }))
        }
    };
    Some(json!({ "jsonrpc": "2.0", "id": id, "result": result }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn routes_unattached_sessions_by_id() {
        let (app, folder) = route(&json!({ "ai.opencode/sessionID": "ses_8c6cddef21bc401b86075743ef384993" })).unwrap();
        assert_eq!(app, "8c6cddef-21bc-401b-8607-5743ef384993");
        assert!(folder.is_none());
        assert!(route(&json!({})).is_none());
    }

    #[test]
    fn lists_and_presents() { futures::executor::block_on(async {
        let list = handle_rpc(&json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/list" })).await.unwrap();
        let names: Vec<&str> = list["result"]["tools"].as_array().unwrap().iter().map(|t| t["name"].as_str().unwrap()).collect();
        assert_eq!(names, ["present_file", "browser", "web_search", "web_fetch"]);
        let call = json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": { "name": "present_file", "arguments": { "file_path": "/w/a.md", "file_name": "a.md" } } });
        let reply = handle_rpc(&call).await.unwrap();
        assert_eq!(reply["result"]["content"][0]["text"], "File ready: a.md at /w/a.md");
        assert!(handle_rpc(&json!({ "jsonrpc": "2.0", "method": "notifications/initialized" })).await.is_none());
    }) }
}
