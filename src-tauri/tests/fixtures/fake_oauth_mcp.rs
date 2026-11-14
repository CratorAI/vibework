//! A fake remote MCP server that signs in with OAuth, for tests only.
//!
//! - Resource server: Streamable HTTP at `/mcp` (JSON answers, stateless)
//!   and the older HTTP+SSE transport at `/sse` (+ `/messages`), both
//!   behind bearer tokens, with protected resource metadata (RFC 9728).
//! - Authorization server (same origin, or another port with
//!   `separate_as_origin`): metadata, dynamic registration, an authorization
//!   endpoint that approves at once when the request carries
//!   `X-Test-Approve: <subject>` (nobody types anything), a token endpoint with
//!   PKCE checks, short-lived access tokens and rotating refresh tokens.
//! - One tool, `whoami`, which answers with the token's subject.
//! - Every request is logged (method, target, headers, body) so tests can
//!   check what reached the server.
//!
//! Shared by the Rust tests (`src/mcp/oauth/tests.rs`) and the standalone
//! `cargo run --example fake_oauth_mcp` used against a dev window.

#![allow(dead_code)]

use std::collections::HashMap;
use std::convert::Infallible;
use std::sync::{Arc, Mutex};

use base64::Engine as _;
use bytes::Bytes;
use http_body_util::{combinators::BoxBody, BodyExt, Full, StreamBody};
use hyper::body::{Frame, Incoming};
use hyper::{Method, Request, Response, StatusCode};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio::net::TcpListener;
use tokio::sync::mpsc;

type Body = BoxBody<Bytes, Infallible>;

#[derive(Clone, Debug)]
pub struct FakeOptions {
    /// Lifetime of access tokens, seconds.
    pub access_ttl: i64,
    /// Advertise and serve dynamic client registration.
    pub registration: bool,
    /// Advertise Client ID Metadata Document support (accepts https client ids).
    pub cimd: bool,
    /// Run the authorization server on its own port (another origin).
    pub separate_as_origin: bool,
    /// Put this in the protected resource metadata's `resource` instead of the real one.
    pub prm_resource_override: Option<String>,
    /// Put this in the authorization server metadata's `issuer` instead of the real one.
    pub issuer_override: Option<String>,
    /// Send `iss` with the authorization response.
    pub send_iss: bool,
    /// Override the `iss` value sent (a mix-up attempt).
    pub iss_override: Option<String>,
    /// Advertise `authorization_response_iss_parameter_supported`.
    pub iss_supported: bool,
    /// `code_challenge_methods_supported`; None leaves it out.
    pub pkce_methods: Option<Vec<String>>,
}

impl Default for FakeOptions {
    fn default() -> Self {
        Self {
            access_ttl: 3600,
            registration: true,
            cimd: false,
            separate_as_origin: false,
            prm_resource_override: None,
            issuer_override: None,
            send_iss: true,
            iss_override: None,
            iss_supported: true,
            pkce_methods: Some(vec!["S256".into()]),
        }
    }
}

struct CodeGrant {
    client_id: String,
    redirect_uri: String,
    challenge: String,
    resource: String,
    subject: String,
}

struct AccessGrant {
    subject: String,
    resource: String,
    expires_at: i64,
}

struct RefreshGrant {
    client_id: String,
    subject: String,
    resource: String,
}

#[derive(Default)]
struct State {
    clients: HashMap<String, Vec<String>>,
    codes: HashMap<String, CodeGrant>,
    access: HashMap<String, AccessGrant>,
    refresh: HashMap<String, RefreshGrant>,
    sse: HashMap<String, (mpsc::Sender<String>, String)>,
    log: Vec<String>,
    registrations: usize,
    refreshes: usize,
    authorizations: Vec<HashMap<String, String>>,
    token_requests: Vec<HashMap<String, String>>,
}

pub struct FakeServer {
    pub rs_origin: String,
    pub as_origin: String,
    opts: FakeOptions,
    state: Arc<Mutex<State>>,
    tasks: Vec<tokio::task::JoinHandle<()>>,
}

impl Drop for FakeServer {
    fn drop(&mut self) {
        for t in &self.tasks {
            t.abort();
        }
    }
}

fn now() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64
}

fn token(prefix: &str) -> String {
    format!("{prefix}{}", uuid::Uuid::new_v4().simple())
}

fn full(status: StatusCode, content_type: &str, body: impl Into<Bytes>) -> Response<Body> {
    Response::builder()
        .status(status)
        .header("content-type", content_type)
        .body(Full::new(body.into()).boxed())
        .unwrap()
}

fn json_resp(status: StatusCode, v: Value) -> Response<Body> {
    full(status, "application/json", v.to_string())
}

fn oauth_error(error: &str, description: &str) -> Response<Body> {
    json_resp(StatusCode::BAD_REQUEST, json!({"error": error, "error_description": description}))
}

#[derive(Clone)]
struct Ctx {
    rs_origin: String,
    as_origin: String,
    opts: FakeOptions,
    state: Arc<Mutex<State>>,
    is_as: bool,
    is_rs: bool,
}

impl FakeServer {
    pub async fn start(opts: FakeOptions) -> FakeServer {
        let state = Arc::new(Mutex::new(State::default()));
        let rs = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let rs_origin = format!("http://127.0.0.1:{}", rs.local_addr().unwrap().port());
        let mut tasks = Vec::new();
        let as_origin = if opts.separate_as_origin {
            let asl = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let as_origin = format!("http://127.0.0.1:{}", asl.local_addr().unwrap().port());
            let ctx = Ctx { rs_origin: rs_origin.clone(), as_origin: as_origin.clone(), opts: opts.clone(), state: state.clone(), is_as: true, is_rs: false };
            tasks.push(tokio::spawn(serve(asl, ctx)));
            as_origin
        } else {
            rs_origin.clone()
        };
        let ctx = Ctx {
            rs_origin: rs_origin.clone(),
            as_origin: as_origin.clone(),
            opts: opts.clone(),
            state: state.clone(),
            is_as: !opts.separate_as_origin,
            is_rs: true,
        };
        tasks.push(tokio::spawn(serve(rs, ctx)));
        FakeServer { rs_origin, as_origin, opts, state, tasks }
    }

    pub fn mcp_url(&self) -> String {
        format!("{}/mcp", self.rs_origin)
    }

    pub fn sse_url(&self) -> String {
        format!("{}/sse", self.rs_origin)
    }

    /// Make every access token expired now.
    pub fn expire_access_tokens(&self) {
        for g in self.state.lock().unwrap().access.values_mut() {
            g.expires_at = 0;
        }
    }

    /// Revoke every refresh token (the next refresh fails with invalid_grant).
    pub fn revoke_refresh_tokens(&self) {
        self.state.lock().unwrap().refresh.clear();
    }

    pub fn log(&self) -> Vec<String> {
        self.state.lock().unwrap().log.clone()
    }

    pub fn registrations(&self) -> usize {
        self.state.lock().unwrap().registrations
    }

    pub fn refreshes(&self) -> usize {
        self.state.lock().unwrap().refreshes
    }

    pub fn authorizations(&self) -> Vec<HashMap<String, String>> {
        self.state.lock().unwrap().authorizations.clone()
    }

    pub fn token_requests(&self) -> Vec<HashMap<String, String>> {
        self.state.lock().unwrap().token_requests.clone()
    }

    pub fn live_access_tokens(&self) -> Vec<String> {
        self.state.lock().unwrap().access.keys().cloned().collect()
    }

    pub fn live_refresh_tokens(&self) -> Vec<String> {
        self.state.lock().unwrap().refresh.keys().cloned().collect()
    }

    /// Run the admin endpoints (`/_admin/expire`, `/_admin/revoke`, `/_admin/log`) too.
    pub fn options(&self) -> &FakeOptions {
        &self.opts
    }
}

async fn serve(listener: TcpListener, ctx: Ctx) {
    loop {
        let Ok((stream, _)) = listener.accept().await else { continue };
        let ctx = ctx.clone();
        tokio::spawn(async move {
            let svc = hyper::service::service_fn(move |req| {
                let ctx = ctx.clone();
                async move { Ok::<_, Infallible>(handle(ctx, req).await) }
            });
            let _ = hyper::server::conn::http1::Builder::new()
                .serve_connection(hyper_util::rt::TokioIo::new(stream), svc)
                .await;
        });
    }
}

fn query(req_target: &str) -> HashMap<String, String> {
    let q = req_target.split_once('?').map(|(_, q)| q).unwrap_or("");
    url::form_urlencoded::parse(q.as_bytes()).into_owned().collect()
}

async fn handle(ctx: Ctx, req: Request<Incoming>) -> Response<Body> {
    let method = req.method().clone();
    let target = req.uri().path_and_query().map(|p| p.to_string()).unwrap_or_default();
    let path = req.uri().path().to_string();
    let headers = req.headers().clone();
    let body = req.into_body().collect().await.map(|b| b.to_bytes()).unwrap_or_default();
    {
        let mut st = ctx.state.lock().unwrap();
        let hs: Vec<String> = headers.iter().map(|(k, v)| format!("{}: {}", k, v.to_str().unwrap_or("?"))).collect();
        st.log.push(format!("{method} {target}\n{}\n\n{}", hs.join("\n"), String::from_utf8_lossy(&body)));
    }
    let header = |name: &str| headers.get(name).and_then(|v| v.to_str().ok()).map(str::to_string);

    // Admin (tests driving a standalone fake over HTTP)
    if ctx.is_rs && path.starts_with("/_admin/") {
        let mut st = ctx.state.lock().unwrap();
        return match path.as_str() {
            "/_admin/expire" => {
                for g in st.access.values_mut() {
                    g.expires_at = 0;
                }
                json_resp(StatusCode::OK, json!({"ok": true}))
            }
            "/_admin/revoke" => {
                st.refresh.clear();
                json_resp(StatusCode::OK, json!({"ok": true}))
            }
            "/_admin/log" => json_resp(StatusCode::OK, json!(st.log)),
            "/_admin/stats" => json_resp(
                StatusCode::OK,
                json!({"registrations": st.registrations, "refreshes": st.refreshes, "access": st.access.len(), "refresh": st.refresh.len()}),
            ),
            _ => full(StatusCode::NOT_FOUND, "text/plain", "no"),
        };
    }

    if ctx.is_rs {
        if path.starts_with("/.well-known/oauth-protected-resource") {
            let suffix = path.trim_start_matches("/.well-known/oauth-protected-resource");
            let resource = ctx.opts.prm_resource_override.clone().unwrap_or_else(|| format!("{}{}", ctx.rs_origin, suffix));
            return json_resp(
                StatusCode::OK,
                json!({
                    "resource": resource,
                    "authorization_servers": [ctx.as_origin],
                    "scopes_supported": ["notes:read"],
                    "bearer_methods_supported": ["header"],
                }),
            );
        }
        match (method.clone(), path.as_str()) {
            (Method::POST, "/mcp") => return mcp_post(&ctx, header("authorization"), &body),
            (Method::GET, "/mcp") | (Method::DELETE, "/mcp") => return full(StatusCode::METHOD_NOT_ALLOWED, "text/plain", ""),
            (Method::GET, "/sse") => return sse_open(&ctx, header("authorization")),
            (Method::POST, "/messages") => return sse_post(&ctx, header("authorization"), &query(&target), &body).await,
            _ => {}
        }
    }
    if ctx.is_as {
        match (method, path.as_str()) {
            (Method::GET, "/.well-known/oauth-authorization-server") => {
                let mut meta = json!({
                    "issuer": ctx.opts.issuer_override.clone().unwrap_or_else(|| ctx.as_origin.clone()),
                    "authorization_endpoint": format!("{}/authorize", ctx.as_origin),
                    "token_endpoint": format!("{}/token", ctx.as_origin),
                    "scopes_supported": ["notes:read", "offline_access"],
                    "response_types_supported": ["code"],
                    "grant_types_supported": ["authorization_code", "refresh_token"],
                    "token_endpoint_auth_methods_supported": ["none"],
                    "client_id_metadata_document_supported": ctx.opts.cimd,
                    "authorization_response_iss_parameter_supported": ctx.opts.iss_supported,
                });
                if ctx.opts.registration {
                    meta["registration_endpoint"] = json!(format!("{}/register", ctx.as_origin));
                }
                if let Some(m) = &ctx.opts.pkce_methods {
                    meta["code_challenge_methods_supported"] = json!(m);
                }
                return json_resp(StatusCode::OK, meta);
            }
            (Method::POST, "/register") if ctx.opts.registration => return register(&ctx, &body),
            (Method::GET, "/authorize") => return authorize(&ctx, &query(&target), header("x-test-approve"), header("x-test-deny")),
            (Method::POST, "/token") => return token_endpoint(&ctx, &body),
            _ => {}
        }
    }
    full(StatusCode::NOT_FOUND, "text/plain", "not found")
}

fn challenge(ctx: &Ctx, endpoint: &str, error: Option<&str>) -> Response<Body> {
    let mut v = format!(
        "Bearer resource_metadata=\"{}/.well-known/oauth-protected-resource/{endpoint}\", scope=\"notes:read\"",
        ctx.rs_origin
    );
    if let Some(e) = error {
        v.push_str(&format!(", error=\"{e}\""));
    }
    Response::builder()
        .status(StatusCode::UNAUTHORIZED)
        .header("www-authenticate", v)
        .header("content-type", "application/json")
        .body(Full::new(Bytes::from_static(b"{\"error\":\"unauthorized\"}")).boxed())
        .unwrap()
}

/// The token's subject when it is valid for `resource`.
fn check_bearer(ctx: &Ctx, auth: Option<String>, resource: &str) -> Result<String, Option<&'static str>> {
    let Some(tok) = auth.and_then(|a| a.strip_prefix("Bearer ").map(str::to_string)) else { return Err(None) };
    let st = ctx.state.lock().unwrap();
    match st.access.get(&tok) {
        Some(g) if g.expires_at > now() && g.resource == resource => Ok(g.subject.clone()),
        _ => Err(Some("invalid_token")),
    }
}

fn rpc(message: &Value, subject: &str) -> Option<Value> {
    let id = message.get("id")?.clone();
    let method = message["method"].as_str().unwrap_or("");
    let result = match method {
        "initialize" => json!({
            "protocolVersion": message["params"]["protocolVersion"].as_str().unwrap_or("2025-03-26"),
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "fake-notes", "version": "1"}
        }),
        "ping" => json!({}),
        "tools/list" => json!({"tools": [{
            "name": "whoami",
            "description": "Says who signed in",
            "inputSchema": {"type": "object", "properties": {}}
        }]}),
        "tools/call" if message["params"]["name"] == "whoami" => json!({
            "content": [{"type": "text", "text": format!("subject: {subject}")}]
        }),
        _ => return Some(json!({"jsonrpc": "2.0", "id": id, "error": {"code": -32601, "message": "unknown method"}})),
    };
    Some(json!({"jsonrpc": "2.0", "id": id, "result": result}))
}

fn mcp_post(ctx: &Ctx, auth: Option<String>, body: &[u8]) -> Response<Body> {
    let subject = match check_bearer(ctx, auth, &format!("{}/mcp", ctx.rs_origin)) {
        Ok(s) => s,
        Err(e) => return challenge(ctx, "mcp", e),
    };
    let Ok(message) = serde_json::from_slice::<Value>(body) else {
        return full(StatusCode::BAD_REQUEST, "text/plain", "bad json");
    };
    match rpc(&message, &subject) {
        Some(v) => json_resp(StatusCode::OK, v),
        None => full(StatusCode::ACCEPTED, "text/plain", ""),
    }
}

fn sse_open(ctx: &Ctx, auth: Option<String>) -> Response<Body> {
    let resource = format!("{}/sse", ctx.rs_origin);
    let subject = match check_bearer(ctx, auth, &resource) {
        Ok(s) => s,
        Err(e) => return challenge(ctx, "sse", e),
    };
    let sid = uuid::Uuid::new_v4().simple().to_string();
    let (tx, rx) = mpsc::channel::<String>(16);
    ctx.state.lock().unwrap().sse.insert(sid.clone(), (tx, subject));
    let first = format!("event: endpoint\ndata: /messages?sid={sid}\n\n");
    let stream = futures::stream::unfold((Some(first), rx), |(first, mut rx)| async move {
        if let Some(f) = first {
            return Some((Ok::<_, Infallible>(Frame::data(Bytes::from(f))), (None, rx)));
        }
        let msg = rx.recv().await?;
        Some((Ok(Frame::data(Bytes::from(format!("event: message\ndata: {msg}\n\n")))), (None, rx)))
    });
    Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "text/event-stream")
        .header("cache-control", "no-cache")
        .body(BodyExt::boxed(StreamBody::new(stream)))
        .unwrap()
}

async fn sse_post(ctx: &Ctx, auth: Option<String>, q: &HashMap<String, String>, body: &[u8]) -> Response<Body> {
    let subject = match check_bearer(ctx, auth, &format!("{}/sse", ctx.rs_origin)) {
        Ok(s) => s,
        Err(e) => return challenge(ctx, "sse", e),
    };
    let tx = {
        let st = ctx.state.lock().unwrap();
        match q.get("sid").and_then(|sid| st.sse.get(sid)) {
            Some((tx, _)) => tx.clone(),
            None => return full(StatusCode::NOT_FOUND, "text/plain", "no session"),
        }
    };
    let Ok(message) = serde_json::from_slice::<Value>(body) else {
        return full(StatusCode::BAD_REQUEST, "text/plain", "bad json");
    };
    if let Some(reply) = rpc(&message, &subject) {
        let _ = tx.send(reply.to_string()).await;
    }
    full(StatusCode::ACCEPTED, "text/plain", "")
}

fn register(ctx: &Ctx, body: &[u8]) -> Response<Body> {
    let Ok(v) = serde_json::from_slice::<Value>(body) else { return oauth_error("invalid_client_metadata", "bad json") };
    let uris: Vec<String> = v["redirect_uris"].as_array().map(|a| a.iter().filter_map(|u| u.as_str().map(str::to_string)).collect()).unwrap_or_default();
    if uris.is_empty() || v["application_type"] != "native" {
        return oauth_error("invalid_redirect_uri", "native loopback redirect required");
    }
    let id = token("client-");
    let mut st = ctx.state.lock().unwrap();
    st.registrations += 1;
    st.clients.insert(id.clone(), uris.clone());
    json_resp(StatusCode::CREATED, json!({"client_id": id, "redirect_uris": uris, "token_endpoint_auth_method": "none"}))
}

fn authorize(ctx: &Ctx, q: &HashMap<String, String>, approve: Option<String>, deny: Option<String>) -> Response<Body> {
    let mut st = ctx.state.lock().unwrap();
    st.authorizations.push(q.clone());
    let client_id = q.get("client_id").cloned().unwrap_or_default();
    let redirect = q.get("redirect_uri").cloned().unwrap_or_default();
    let known = match st.clients.get(&client_id) {
        Some(uris) => uris.contains(&redirect),
        None => ctx.opts.cimd && client_id.starts_with("https://") && redirect.starts_with("http://127.0.0.1:"),
    };
    if !known {
        // Never redirect to an address the client did not register.
        return full(StatusCode::BAD_REQUEST, "text/plain", "unknown client or redirect_uri");
    }
    let state = q.get("state").cloned().unwrap_or_default();
    let iss = ctx.opts.iss_override.clone().unwrap_or_else(|| ctx.as_origin.clone());
    let mut location = url::Url::parse(&redirect).unwrap();
    if deny.is_some() {
        location.query_pairs_mut().append_pair("error", "access_denied").append_pair("state", &state);
    } else {
        if q.get("response_type").map(String::as_str) != Some("code")
            || q.get("code_challenge_method").map(String::as_str) != Some("S256")
            || q.get("code_challenge").is_none_or(|c| c.len() < 43)
            || q.get("resource").is_none()
        {
            return full(StatusCode::BAD_REQUEST, "text/plain", "missing pkce or resource");
        }
        let Some(subject) = approve else {
            return full(StatusCode::OK, "text/html", "<p>Consent page (send X-Test-Approve to approve)</p>");
        };
        let code = token("code-");
        st.codes.insert(
            code.clone(),
            CodeGrant {
                client_id,
                redirect_uri: redirect.clone(),
                challenge: q["code_challenge"].clone(),
                resource: q["resource"].clone(),
                subject,
            },
        );
        location.query_pairs_mut().append_pair("code", &code).append_pair("state", &state);
    }
    if ctx.opts.send_iss {
        location.query_pairs_mut().append_pair("iss", &iss);
    }
    Response::builder()
        .status(StatusCode::FOUND)
        .header("location", location.to_string())
        .body(Full::new(Bytes::new()).boxed())
        .unwrap()
}

fn issue(st: &mut State, ttl: i64, client_id: &str, subject: &str, resource: &str) -> Value {
    let access = token("fake-at-");
    let refresh = token("fake-rt-");
    st.access.insert(access.clone(), AccessGrant { subject: subject.into(), resource: resource.into(), expires_at: now() + ttl });
    st.refresh.insert(refresh.clone(), RefreshGrant { client_id: client_id.into(), subject: subject.into(), resource: resource.into() });
    json!({"access_token": access, "token_type": "Bearer", "expires_in": ttl, "refresh_token": refresh, "scope": "notes:read"})
}

fn token_endpoint(ctx: &Ctx, body: &[u8]) -> Response<Body> {
    let form: HashMap<String, String> = url::form_urlencoded::parse(body).into_owned().collect();
    let mut st = ctx.state.lock().unwrap();
    st.token_requests.push(form.clone());
    let client_id = form.get("client_id").cloned().unwrap_or_default();
    match form.get("grant_type").map(String::as_str) {
        Some("authorization_code") => {
            let Some(grant) = form.get("code").and_then(|c| st.codes.remove(c)) else {
                return oauth_error("invalid_grant", "unknown or used code");
            };
            if grant.client_id != client_id || form.get("redirect_uri") != Some(&grant.redirect_uri) {
                return oauth_error("invalid_grant", "client or redirect_uri mismatch");
            }
            let verifier = form.get("code_verifier").cloned().unwrap_or_default();
            let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
            if challenge != grant.challenge {
                return oauth_error("invalid_grant", "PKCE verification failed");
            }
            if form.get("resource") != Some(&grant.resource) {
                return oauth_error("invalid_target", "resource mismatch");
            }
            let v = issue(&mut st, ctx.opts.access_ttl, &client_id, &grant.subject, &grant.resource);
            json_resp(StatusCode::OK, v)
        }
        Some("refresh_token") => {
            let Some(old) = form.get("refresh_token").and_then(|t| st.refresh.remove(t)) else {
                return oauth_error("invalid_grant", "refresh token revoked or already used");
            };
            if old.client_id != client_id || form.get("resource").is_some_and(|r| *r != old.resource) {
                return oauth_error("invalid_grant", "client or resource mismatch");
            }
            st.refreshes += 1;
            let v = issue(&mut st, ctx.opts.access_ttl, &client_id, &old.subject, &old.resource);
            json_resp(StatusCode::OK, v)
        }
        _ => oauth_error("unsupported_grant_type", "no"),
    }
}
