//! WebSearch backends: OpenRouter (web plugin, default), Exa and Brave.
//! Each backend turns a query into a list of [`SearchResult`]s; response
//! parsing is split out into pure functions so it can be tested on recorded
//! JSON.

use async_trait::async_trait;
use serde_json::{json, Value};
use std::time::Duration;
use tracing::info;

/// Cheap, widely available model whose only job is to carry OpenRouter's web
/// plugin. Llama 3.1 8B has no native search, so the plugin always uses the
/// engine set below. Checked against https://openrouter.ai/api/v1/models
/// (Nov 2026: $0.02/M input, $0.04/M output).
pub const OPENROUTER_SEARCH_MODEL: &str = "meta-llama/llama-3.1-8b-instruct";

/// OpenRouter web plugin engine. Exa: $0.007 per search for up to 10 results.
const OPENROUTER_SEARCH_ENGINE: &str = "exa";

const OPENROUTER_CHAT_URL: &str = "https://openrouter.ai/api/v1/chat/completions";
const EXA_SEARCH_URL: &str = "https://api.exa.ai/search";
const BRAVE_SEARCH_URL: &str = "https://api.search.brave.com/res/v1/web/search";

const REQUEST_TIMEOUT: Duration = Duration::from_secs(45);

/// Longest snippet kept per result (characters).
const MAX_SNIPPET_CHARS: usize = 400;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

#[async_trait]
pub trait SearchBackend: Send + Sync {
    /// Display name, e.g. "OpenRouter (Exa)".
    fn label(&self) -> &'static str;
    async fn search(&self, query: &str, max_results: usize) -> Result<Vec<SearchResult>, String>;
}

// ============================================================================
// Shared helpers
// ============================================================================

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| format!("Could not create the HTTP client: {}", e))
}

/// Strip HTML tags and entities that some APIs put in snippets, collapse
/// whitespace, and cap the length.
pub fn clean_snippet(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut in_tag = false;
    for c in text.chars() {
        match c {
            '<' => in_tag = true,
            '>' if in_tag => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    let out = out
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&nbsp;", " ");
    let collapsed = out.split_whitespace().collect::<Vec<_>>().join(" ");
    match collapsed.char_indices().nth(MAX_SNIPPET_CHARS) {
        Some((idx, _)) => format!("{}…", collapsed[..idx].trim_end()),
        None => collapsed,
    }
}

/// Keep the first occurrence of each URL, drop empty URLs, cap the count.
fn dedupe(results: Vec<SearchResult>, max_results: usize) -> Vec<SearchResult> {
    let mut seen = std::collections::HashSet::new();
    results
        .into_iter()
        .filter(|r| !r.url.is_empty() && seen.insert(r.url.clone()))
        .take(max_results)
        .collect()
}

fn str_field<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(|x| x.as_str()).unwrap_or("")
}

/// Readable message for a failed HTTP response. Key rejections always
/// contain "refused the API key" (used by key validation).
pub fn describe_http_error(service: &str, status: u16, body: &str) -> String {
    let json = serde_json::from_str::<Value>(body).ok();
    let detail: String = json
        .as_ref()
        .and_then(|v| {
            ["/error/message", "/error/detail", "/error", "/message", "/detail"]
                .iter()
                .find_map(|p| v.pointer(p).and_then(|m| m.as_str()))
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| body.chars().take(300).collect());
    let code = json
        .as_ref()
        .and_then(|v| v.pointer("/error/code").or_else(|| v.get("tag")))
        .and_then(|c| c.as_str())
        .unwrap_or("");
    let key_refused = matches!(status, 401 | 403)
        || code == "SUBSCRIPTION_TOKEN_INVALID"
        || code == "INVALID_API_KEY";
    let hint = if key_refused {
        format!(" {} refused the API key.", service)
    } else {
        match status {
            402 => format!(" {} reports insufficient credits.", service),
            429 => format!(" {} rate limit reached; try again shortly.", service),
            _ => String::new(),
        }
    };
    format!("{} search failed (HTTP {}).{} {}", service, status, hint, detail)
        .trim()
        .to_string()
}

/// Read a JSON body, turning HTTP errors into readable messages.
async fn read_json(response: reqwest::Response, service: &str) -> Result<Value, String> {
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Could not read the {} response: {}", service, e))?;
    if !status.is_success() {
        return Err(describe_http_error(service, status.as_u16(), &body));
    }
    serde_json::from_str(&body).map_err(|e| format!("{} returned invalid JSON: {}", service, e))
}

// ============================================================================
// OpenRouter (web plugin)
// ============================================================================

/// Build the OpenRouter request body for a search.
pub fn openrouter_request_body(query: &str, max_results: usize) -> Value {
    json!({
        "model": OPENROUTER_SEARCH_MODEL,
        "messages": [{ "role": "user", "content": query }],
        "plugins": [{
            "id": "web",
            "engine": OPENROUTER_SEARCH_ENGINE,
            "max_results": max_results,
        }],
        // The search results arrive as annotations; the reply itself is not used.
        "max_tokens": 16,
        "temperature": 0,
        "usage": { "include": true },
    })
}

/// Extract `url_citation` annotations from an OpenRouter chat completion.
pub fn parse_openrouter_response(body: &Value, max_results: usize) -> Result<Vec<SearchResult>, String> {
    if let Some(err) = body.get("error") {
        let msg = err.get("message").and_then(|m| m.as_str()).unwrap_or("unknown error");
        return Err(format!("OpenRouter search failed: {}", msg));
    }
    let message = body
        .pointer("/choices/0/message")
        .ok_or("OpenRouter returned no message.")?;
    let annotations = message
        .get("annotations")
        .and_then(|a| a.as_array())
        .cloned()
        .unwrap_or_default();
    let results = annotations
        .iter()
        .filter(|a| str_field(a, "type") == "url_citation")
        .filter_map(|a| a.get("url_citation"))
        .map(|c| SearchResult {
            title: clean_snippet(str_field(c, "title")),
            url: str_field(c, "url").to_string(),
            snippet: clean_snippet(str_field(c, "content")),
        })
        .collect();
    Ok(dedupe(results, max_results))
}

pub struct OpenRouterSearch;

#[async_trait]
impl SearchBackend for OpenRouterSearch {
    fn label(&self) -> &'static str {
        "OpenRouter web search (Exa)"
    }

    async fn search(&self, query: &str, max_results: usize) -> Result<Vec<SearchResult>, String> {
        let key = crate::byok::require_key().await?;
        let response = http_client()?
            .post(OPENROUTER_CHAT_URL)
            .bearer_auth(&key)
            .header("X-Title", "Vibework")
            .json(&openrouter_request_body(query, max_results))
            .send()
            .await
            .map_err(|e| format!("Could not reach OpenRouter: {}", e))?;
        let body = read_json(response, "OpenRouter").await?;
        if let Some(cost) = body.pointer("/usage/cost").and_then(|c| c.as_f64()) {
            info!("[WebSearch] OpenRouter search cost ${:.6}", cost);
        }
        parse_openrouter_response(&body, max_results)
    }
}

// ============================================================================
// Exa
// ============================================================================

pub fn exa_request_body(query: &str, max_results: usize) -> Value {
    json!({
        "query": query,
        "type": "auto",
        "numResults": max_results,
        "contents": { "highlights": { "maxCharacters": 600 } },
    })
}

pub fn parse_exa_response(body: &Value, max_results: usize) -> Result<Vec<SearchResult>, String> {
    let results = body
        .get("results")
        .and_then(|r| r.as_array())
        .ok_or("Exa returned no results list.")?;
    let parsed = results
        .iter()
        .map(|r| {
            let highlights = r
                .get("highlights")
                .and_then(|h| h.as_array())
                .map(|h| h.iter().filter_map(|x| x.as_str()).collect::<Vec<_>>().join(" … "))
                .unwrap_or_default();
            let snippet = if !highlights.is_empty() {
                highlights
            } else if let Some(s) = r.get("summary").and_then(|s| s.as_str()) {
                s.to_string()
            } else {
                str_field(r, "text").to_string()
            };
            SearchResult {
                title: clean_snippet(str_field(r, "title")),
                url: str_field(r, "url").to_string(),
                snippet: clean_snippet(&snippet),
            }
        })
        .collect();
    Ok(dedupe(parsed, max_results))
}

pub struct ExaSearch {
    pub api_key: String,
}

impl ExaSearch {
    pub async fn request(api_key: &str, body: &Value) -> Result<Value, String> {
        let response = http_client()?
            .post(EXA_SEARCH_URL)
            .header("x-api-key", api_key)
            .json(body)
            .send()
            .await
            .map_err(|e| format!("Could not reach Exa: {}", e))?;
        read_json(response, "Exa").await
    }
}

#[async_trait]
impl SearchBackend for ExaSearch {
    fn label(&self) -> &'static str {
        "Exa"
    }

    async fn search(&self, query: &str, max_results: usize) -> Result<Vec<SearchResult>, String> {
        let body = Self::request(&self.api_key, &exa_request_body(query, max_results)).await?;
        parse_exa_response(&body, max_results)
    }
}

// ============================================================================
// Brave
// ============================================================================

pub fn parse_brave_response(body: &Value, max_results: usize) -> Result<Vec<SearchResult>, String> {
    let results = body
        .pointer("/web/results")
        .and_then(|r| r.as_array())
        .cloned()
        .unwrap_or_default();
    let parsed = results
        .iter()
        .map(|r| {
            let mut snippet = str_field(r, "description").to_string();
            if let Some(extra) = r.get("extra_snippets").and_then(|e| e.as_array()) {
                if let Some(first) = extra.iter().filter_map(|x| x.as_str()).next() {
                    snippet.push(' ');
                    snippet.push_str(first);
                }
            }
            SearchResult {
                title: clean_snippet(str_field(r, "title")),
                url: str_field(r, "url").to_string(),
                snippet: clean_snippet(&snippet),
            }
        })
        .collect();
    Ok(dedupe(parsed, max_results))
}

pub struct BraveSearch {
    pub api_key: String,
}

impl BraveSearch {
    pub async fn request(api_key: &str, query: &str, count: usize) -> Result<Value, String> {
        let response = http_client()?
            .get(BRAVE_SEARCH_URL)
            .query(&[("q", query), ("count", &count.to_string())])
            .header("Accept", "application/json")
            .header("X-Subscription-Token", api_key)
            .send()
            .await
            .map_err(|e| format!("Could not reach Brave Search: {}", e))?;
        read_json(response, "Brave Search").await
    }
}

#[async_trait]
impl SearchBackend for BraveSearch {
    fn label(&self) -> &'static str {
        "Brave Search"
    }

    async fn search(&self, query: &str, max_results: usize) -> Result<Vec<SearchResult>, String> {
        let body = Self::request(&self.api_key, query, max_results).await?;
        parse_brave_response(&body, max_results)
    }
}

// ============================================================================
// Output
// ============================================================================

/// Format results as the compact text list the model sees.
pub fn format_results(query: &str, label: &str, results: &[SearchResult]) -> String {
    if results.is_empty() {
        return format!("No web results for \"{}\" (via {}).", query, label);
    }
    let mut out = format!("Web results for \"{}\" (via {}):\n", query, label);
    for (i, r) in results.iter().enumerate() {
        let title = if r.title.is_empty() { r.url.as_str() } else { r.title.as_str() };
        out.push_str(&format!("\n{}. {}\n   {}\n", i + 1, title, r.url));
        if !r.snippet.is_empty() {
            out.push_str(&format!("   {}\n", r.snippet));
        }
    }
    out.push_str("\nUse WebFetch on a URL to read the full page.");
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Trimmed from a real OpenRouter response (llama-3.1-8b + web plugin, engine exa).
    const OPENROUTER_FIXTURE: &str = r#"{
      "id": "gen-1794425443-J5p5b90esKqPHyWBoy7g",
      "object": "chat.completion",
      "model": "meta-llama/llama-3.1-8b-instruct",
      "choices": [{
        "index": 0,
        "finish_reason": "stop",
        "message": {
          "role": "assistant",
          "content": "The `reqwest` crate in Rust provides a robust way to handle HTTP redirects",
          "annotations": [
            {"type": "url_citation", "url_citation": {
              "url": "https://docs.rs/reqwest/latest/reqwest/redirect/struct.Policy.html",
              "title": "Struct  Policy Copy item path",
              "start_index": 0, "end_index": 0,
              "content": "Policy in reqwest::redirect - Rust\n\n...\n\n# Struct Policy Copy item path\n\nA type that controls the policy on how to handle the following of redirects."}},
            {"type": "url_citation", "url_citation": {
              "url": "https://docs.rs/reqwest/latest/reqwest/redirect/index.html",
              "title": "reqwest::redirect - Rust",
              "start_index": 0, "end_index": 0,
              "content": "Redirect Handling\n\nBy default, a Client will automatically handle HTTP redirects, having a maximum redirect chain of 10 hops."}},
            {"type": "url_citation", "url_citation": {
              "url": "https://docs.rs/reqwest/latest/reqwest/redirect/index.html",
              "title": "duplicate", "content": "dup"}},
            {"type": "file", "file": {"name": "ignored"}}
          ]
        }
      }],
      "usage": {"prompt_tokens": 1211, "completion_tokens": 16, "total_tokens": 1227, "cost": 0.007188664}
    }"#;

    /// Shape from https://docs.exa.ai/reference/search (SearchResultOutput).
    const EXA_FIXTURE: &str = r#"{
      "requestId": "b5947044c4b78efa9552a7c89b306d95",
      "results": [
        {"title": "A Comprehensive Overview of LLMs", "url": "https://arxiv.org/pdf/2307.06435.pdf",
         "publishedDate": "2023-11-16T01:36:32.547Z", "author": "Humza Naveed",
         "id": "https://arxiv.org/abs/2307.06435",
         "highlights": ["Such requirements have limited their adoption...", "Second highlight."]},
        {"title": "No highlights", "url": "https://example.com/b", "text": "Full <b>text</b> body"},
        {"title": "", "url": "", "highlights": ["no url, dropped"]}
      ],
      "searchType": "auto",
      "costDollars": {"total": 0.005}
    }"#;

    /// Shape from https://api-dashboard.search.brave.com (web.results with extra_snippets).
    const BRAVE_FIXTURE: &str = r#"{
      "type": "search",
      "query": {"original": "python web frameworks"},
      "web": {
        "type": "search",
        "results": [
          {"title": "Python Web <strong>Frameworks</strong>", "url": "https://example.com/python-frameworks",
           "description": "Main snippet <strong>text</strong> &amp; more...",
           "extra_snippets": ["First additional excerpt from the page..."]},
          {"title": "Second", "url": "https://example.org/2", "description": "Another one"}
        ]
      }
    }"#;

    #[test]
    fn parses_openrouter_annotations() {
        let body: Value = serde_json::from_str(OPENROUTER_FIXTURE).unwrap();
        let results = parse_openrouter_response(&body, 5).unwrap();
        assert_eq!(results.len(), 2, "duplicates and non-citations dropped");
        assert_eq!(results[0].url, "https://docs.rs/reqwest/latest/reqwest/redirect/struct.Policy.html");
        assert_eq!(results[0].title, "Struct Policy Copy item path");
        assert!(results[0].snippet.starts_with("Policy in reqwest::redirect - Rust ... # Struct"));
        assert!(!results[0].snippet.contains('\n'));
        assert_eq!(results[1].title, "reqwest::redirect - Rust");
        // max_results caps
        assert_eq!(parse_openrouter_response(&body, 1).unwrap().len(), 1);
    }

    #[test]
    fn openrouter_without_annotations_is_empty_and_errors_are_reported() {
        let body = json!({"choices": [{"message": {"role": "assistant", "content": "hi"}}]});
        assert!(parse_openrouter_response(&body, 5).unwrap().is_empty());
        let body = json!({"error": {"message": "Insufficient credits", "code": 402}});
        assert!(parse_openrouter_response(&body, 5).unwrap_err().contains("Insufficient credits"));
    }

    #[test]
    fn openrouter_request_uses_plugin_and_small_limits() {
        let body = openrouter_request_body("rust", 7);
        assert_eq!(body["model"], OPENROUTER_SEARCH_MODEL);
        assert_eq!(body["plugins"][0]["id"], "web");
        assert_eq!(body["plugins"][0]["engine"], "exa");
        assert_eq!(body["plugins"][0]["max_results"], 7);
        assert_eq!(body["max_tokens"], 16);
        assert_eq!(body["messages"][0]["content"], "rust");
    }

    #[test]
    fn parses_exa_results() {
        let body: Value = serde_json::from_str(EXA_FIXTURE).unwrap();
        let results = parse_exa_response(&body, 10).unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].title, "A Comprehensive Overview of LLMs");
        assert_eq!(results[0].url, "https://arxiv.org/pdf/2307.06435.pdf");
        assert_eq!(results[0].snippet, "Such requirements have limited their adoption... … Second highlight.");
        assert_eq!(results[1].snippet, "Full text body");
        assert!(parse_exa_response(&json!({"error": "x"}), 5).is_err());
    }

    #[test]
    fn parses_brave_results() {
        let body: Value = serde_json::from_str(BRAVE_FIXTURE).unwrap();
        let results = parse_brave_response(&body, 10).unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].title, "Python Web Frameworks");
        assert_eq!(
            results[0].snippet,
            "Main snippet text & more... First additional excerpt from the page..."
        );
        assert_eq!(results[1].url, "https://example.org/2");
        assert!(parse_brave_response(&json!({"type": "search"}), 5).unwrap().is_empty());
    }

    #[test]
    fn invalid_key_responses_are_recognised() {
        // Recorded responses to a deliberately invalid key (Nov 2026).
        let brave = r#"{"error":{"code":"SUBSCRIPTION_TOKEN_INVALID","detail":"The provided subscription token is invalid.","meta":{"component":"authentication"},"status":422},"type":"ErrorResponse"}"#;
        let msg = describe_http_error("Brave Search", 422, brave);
        assert!(msg.contains("refused the API key"), "{}", msg);
        assert!(msg.contains("The provided subscription token is invalid."), "{}", msg);

        let exa = r#"{"requestId":"8b73e34a3a4c7c564ad95df7fc478319","error":"Invalid API key. Provide a valid key using 'Authorization: Bearer <key>' or 'x-api-key: <key>'. Create a key at https://dashboard.exa.ai/api-keys","tag":"INVALID_API_KEY"}"#;
        let msg = describe_http_error("Exa", 401, exa);
        assert!(msg.contains("refused the API key"), "{}", msg);
        assert!(msg.contains("Invalid API key."), "{}", msg);

        let msg = describe_http_error("OpenRouter", 402, r#"{"error":{"message":"Insufficient credits","code":402}}"#);
        assert!(msg.contains("insufficient credits") && !msg.contains("refused"), "{}", msg);
        let msg = describe_http_error("Exa", 500, "upstream exploded");
        assert!(msg.ends_with("upstream exploded") && !msg.contains("refused"), "{}", msg);
    }

    #[test]
    fn snippets_are_capped() {
        let long = "word ".repeat(500);
        let s = clean_snippet(&long);
        assert!(s.chars().count() <= MAX_SNIPPET_CHARS + 1);
        assert!(s.ends_with('…'));
    }

    #[test]
    fn formats_compact_list() {
        let results = vec![SearchResult {
            title: "T".into(),
            url: "https://e.com".into(),
            snippet: "S".into(),
        }];
        let out = format_results("q", "Exa", &results);
        assert!(out.contains("1. T\n   https://e.com\n   S"));
        assert!(format_results("q", "Exa", &[]).contains("No web results"));
    }

    /// Live: one real search through OpenRouter with the stored key.
    /// Run: OPENROUTER_API_KEY=... cargo test -- --ignored live_openrouter_search --nocapture
    #[test]
    #[ignore]
    fn live_openrouter_search() {
        let key = std::env::var("OPENROUTER_API_KEY").expect("set OPENROUTER_API_KEY");
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        rt.block_on(async {
            let response = http_client()
                .unwrap()
                .post(OPENROUTER_CHAT_URL)
                .bearer_auth(&key)
                .json(&openrouter_request_body("tauri 2 release notes", 5))
                .send()
                .await
                .unwrap();
            let body = read_json(response, "OpenRouter").await.unwrap();
            println!("cost: {:?}", body.pointer("/usage/cost"));
            let results = parse_openrouter_response(&body, 5).unwrap();
            println!("{}", format_results("tauri 2 release notes", "OpenRouter", &results));
            assert!(!results.is_empty());
            assert!(results.iter().all(|r| r.url.starts_with("http")));
        });
    }
}
