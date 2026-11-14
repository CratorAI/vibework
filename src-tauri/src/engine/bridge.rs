//! The app's loopback endpoint for the OpenCode engine.
//!
//! One HTTP/1.1 server on 127.0.0.1 (random port, started once per app run):
//! - `/openrouter/...`: a proxy to `https://openrouter.ai/...` that adds the
//!   user's real OpenRouter key to each request. The engine never holds the
//!   key; it is configured with this base URL and a placeholder key.
//! - `/mcp`: a Streamable HTTP MCP server (JSON responses, no SSE) with the
//!   app's own tools: PresentFile, Browser, WebSearch and WebFetch.
//!
//! Every request must carry `x-vibework-capability`, a random value that is
//! rotated on every engine launch. It reaches the engine only through the
//! engine's stdin (read once by the bundled plugin, see `plugin/`), never
//! through an environment variable, argument or file, so commands the agent
//! runs and MCP servers the engine starts cannot read it.

use std::convert::Infallible;
use std::sync::{Arc, RwLock};
use std::time::Duration;

use bytes::Bytes;
use futures::StreamExt;
use http_body_util::{combinators::BoxBody, BodyExt, Full, StreamBody};
use hyper::body::{Frame, Incoming};
use hyper::{Request, Response, StatusCode};
use once_cell::sync::OnceCell;
use serde_json::{json, Value};
use tracing::{debug, info, warn};

pub const CAPABILITY_HEADER: &str = "x-vibework-capability";
/// The engine session a model request belongs to (set by the plugin; never forwarded).
pub const SESSION_HEADER: &str = "x-vibework-session";
const OPENROUTER_ORIGIN: &str = "https://openrouter.ai";
/// Name the app's MCP server has inside the engine (its tools are `vibework_<tool>`).
pub const MCP_SERVER_NAME: &str = "vibework";

type Body = BoxBody<Bytes, std::io::Error>;

/// Where model requests go. Debug builds started with
/// `VIBEWORK_DEV_OPENROUTER_ORIGIN=http://127.0.0.1:<port>` send them to a
/// local stand-in instead (a fake model for no-cost end-to-end runs; see
/// scripts/e2e/README.md). Shipping release builds always use OpenRouter.
fn openrouter_origin() -> String {
    #[cfg(any(debug_assertions, feature = "dev-release-probe"))]
    if let Ok(origin) = std::env::var("VIBEWORK_DEV_OPENROUTER_ORIGIN") {
        if origin.starts_with("http://127.0.0.1:") || origin.starts_with("http://localhost:") {
            return origin.trim_end_matches('/').to_string();
        }
    }
    OPENROUTER_ORIGIN.to_string()
}

pub struct Bridge {
    pub port: u16,
    capability: RwLock<Option<String>>,
    http: reqwest::Client,
}

static BRIDGE: OnceCell<Arc<Bridge>> = OnceCell::new();

/// Bind the endpoint (once). Blocking-safe: binds a std listener, then serves on Tauri's runtime.
pub fn start() -> Result<Arc<Bridge>, String> {
    if let Some(bridge) = BRIDGE.get() {
        return Ok(bridge.clone());
    }
    let listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| format!("Cannot bind the engine bridge: {e}"))?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let http = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let bridge = Arc::new(Bridge { port, capability: RwLock::new(None), http });
    let _ = BRIDGE.set(bridge.clone());
    let serving = bridge.clone();
    tauri::async_runtime::spawn(async move {
        let listener = match tokio::net::TcpListener::from_std(listener) {
            Ok(l) => l,
            Err(e) => return warn!("Engine bridge listener failed: {e}"),
        };
        info!("Engine bridge listening on 127.0.0.1:{port}");
        loop {
            let Ok((stream, _)) = listener.accept().await else { continue };
            let bridge = serving.clone();
            tauri::async_runtime::spawn(async move {
                let service = hyper::service::service_fn(move |req| {
                    let bridge = bridge.clone();
                    async move { Ok::<_, Infallible>(bridge.handle(req).await) }
                });
                if let Err(e) = hyper::server::conn::http1::Builder::new()
                    .serve_connection(hyper_util::rt::TokioIo::new(stream), service)
                    .await
                {
                    debug!("Engine bridge connection ended: {e}");
                }
            });
        }
    });
    Ok(bridge)
}

/// 256 random bits from the OS generator, hex.
fn random_token() -> String {
    format!(
        "{}{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

/// Constant-time comparison (length is not secret).
fn same(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn full(status: StatusCode, content_type: &str, body: impl Into<Bytes>) -> Response<Body> {
    Response::builder()
        .status(status)
        .header("content-type", content_type)
        .body(Full::new(body.into()).map_err(|never: Infallible| match never {}).boxed())
        .unwrap()
}

fn empty(status: StatusCode) -> Response<Body> {
    full(status, "text/plain", Bytes::new())
}

impl Bridge {
    pub fn base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }

    /// A fresh capability for a new engine launch; the previous one stops working.
    pub fn rotate(&self) -> String {
        let token = random_token();
        *self.capability.write().unwrap() = Some(token.clone());
        token
    }

    fn authorized(&self, req: &Request<Incoming>) -> bool {
        let Some(expected) = self.capability.read().unwrap().clone() else { return false };
        req.headers()
            .get(CAPABILITY_HEADER)
            .is_some_and(|given| same(given.as_bytes(), expected.as_bytes()))
    }

    async fn handle(&self, req: Request<Incoming>) -> Response<Body> {
        if !self.authorized(&req) {
            return full(StatusCode::UNAUTHORIZED, "application/json", r#"{"error":{"message":"Unauthorized","code":401}}"#);
        }
        let path = req.uri().path().to_string();
        if let Some(rest) = path.strip_prefix("/openrouter/") {
            let rest = rest.to_string();
            return self.proxy(req, &rest).await;
        }
        if path == "/mcp" {
            return match *req.method() {
                hyper::Method::POST => self.mcp(req).await,
                // No server-initiated stream: tell the client so it does not wait on one.
                hyper::Method::GET => empty(StatusCode::METHOD_NOT_ALLOWED),
                hyper::Method::DELETE => empty(StatusCode::OK),
                _ => empty(StatusCode::METHOD_NOT_ALLOWED),
            };
        }
        empty(StatusCode::NOT_FOUND)
    }

    /// Forward to OpenRouter with the user's key, streaming the response back.
    async fn proxy(&self, req: Request<Incoming>, rest: &str) -> Response<Body> {
        let Some(key) = crate::byok::current_key().await else {
            return full(
                StatusCode::UNAUTHORIZED,
                "application/json",
                r#"{"error":{"message":"No OpenRouter API key is set. Add your key in Settings to use Vibework.","code":401}}"#,
            );
        };
        let query = req.uri().query().map(|q| format!("?{q}")).unwrap_or_default();
        let url = format!("{}/{rest}{query}", openrouter_origin());
        let method = reqwest::Method::from_bytes(req.method().as_str().as_bytes()).unwrap_or(reqwest::Method::POST);
        // Only end-to-end headers that matter for the API; never the capability.
        let mut headers = reqwest::header::HeaderMap::new();
        for name in ["content-type", "accept", "user-agent", "http-referer", "x-title"] {
            if let Some(value) = req.headers().get(name) {
                if let Ok(v) = reqwest::header::HeaderValue::from_bytes(value.as_bytes()) {
                    headers.insert(name, v);
                }
            }
        }
        if !headers.contains_key("http-referer") {
            headers.insert("http-referer", reqwest::header::HeaderValue::from_static("https://vibework.app"));
            headers.insert("x-title", reqwest::header::HeaderValue::from_static("Vibework"));
        }
        // The plugin names the task on its model requests; the task's
        // scratch folder is added to the system message (see `scratch`).
        let mut session = req.headers().get(SESSION_HEADER).and_then(|v| v.to_str().ok()).map(str::to_string);
        if let (Some(id), Ok(engine)) = (session.clone(), super::get()) {
            let (owner, known) = {
                let reducer = engine.reducer.lock().unwrap();
                (reducer.scratch_owner(&id), reducer.is_tracked(&id) || reducer.helper_parent(&id).is_some())
            };
            session = Some(owner);
            // HTTP can beat session.created on the separate SSE connection,
            // especially with parallel helpers. Resolve the native parent
            // before writing a scratch path into that first model prompt.
            if !known {
                let native = match engine.client().await {
                    Ok(client) => client.session(&id).await,
                    Err(error) => Err(error),
                };
                match native {
                    Ok(native) => if let Some(parent) = native["parentID"].as_str() { session = Some(parent.to_string()); },
                    Err(_) => return full(StatusCode::SERVICE_UNAVAILABLE, "text/plain", "Could not prepare the task's working files. Try again."),
                }
            }
        }
        let body = match req.into_body().collect().await {
            Ok(b) => b.to_bytes(),
            Err(e) => return full(StatusCode::BAD_REQUEST, "text/plain", format!("Bad request body: {e}")),
        };
        if let Some(id) = session.as_deref() {
            // Recreate it if the agent removed it.
            let _ = super::scratch::ensure(id);
        }
        // The engine has no API for a connector's tools; Settings counts the
        // ones each model request is offered.
        if rest.ends_with("chat/completions") {
            crate::connectors::observe_model_request(&body);
        }
        let body = match session.as_deref().and_then(|id| super::scratch::add_to_request(&body, id)) {
            Some(changed) => Bytes::from(changed),
            None => body,
        };
        let response = self.http.request(method, &url).headers(headers).bearer_auth(key).body(body).send().await;
        let response = match response {
            Ok(r) => r,
            Err(e) => {
                let message = json!({ "error": { "message": format!("Could not reach OpenRouter: {}", e.without_url()), "code": 502 } });
                return full(StatusCode::BAD_GATEWAY, "application/json", message.to_string());
            }
        };
        let status = StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
        let content_type = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("application/json")
            .to_string();
        let stream = response
            .bytes_stream()
            .map(|chunk| chunk.map(Frame::data).map_err(|e| std::io::Error::other(e.without_url().to_string())));
        Response::builder()
            .status(status)
            .header("content-type", content_type)
            .header("cache-control", "no-cache")
            .body(BodyExt::boxed(StreamBody::new(stream)))
            .unwrap()
    }

    async fn mcp(&self, req: Request<Incoming>) -> Response<Body> {
        let body = match req.into_body().collect().await {
            Ok(b) => b.to_bytes(),
            Err(_) => return empty(StatusCode::BAD_REQUEST),
        };
        let Ok(message) = serde_json::from_slice::<Value>(&body) else {
            return full(StatusCode::BAD_REQUEST, "application/json", r#"{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error"}}"#);
        };
        let reply = match &message {
            Value::Array(batch) => {
                let mut out = Vec::new();
                for item in batch {
                    if let Some(r) = super::app_tools::handle_rpc(item).await {
                        out.push(r);
                    }
                }
                if out.is_empty() { None } else { Some(Value::Array(out)) }
            }
            single => super::app_tools::handle_rpc(single).await,
        };
        match reply {
            Some(reply) => full(StatusCode::OK, "application/json", reply.to_string()),
            None => empty(StatusCode::ACCEPTED),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_in_constant_time() {
        assert!(same(b"abc", b"abc"));
        assert!(!same(b"abc", b"abd"));
        assert!(!same(b"abc", b"ab"));
    }

    #[test]
    fn tokens_are_long_and_fresh() {
        let a = random_token();
        assert_eq!(a.len(), 96);
        assert_ne!(a, random_token());
    }
}
