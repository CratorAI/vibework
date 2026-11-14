//! The user's connectors, run by the engine itself (OpenCode's native MCP).
//!
//! - **Where they live:** the engine's global `opencode.json` (see
//!   [`config`]), which `opencode mcp add --global` writes too. The engine
//!   watches it and connects, reconnects or drops servers in every open
//!   folder without a restart.
//! - **Status:** asked of the engine for one folder of the app's own
//!   ([`home_dir`]): `GET /api/mcp`. A sign-in is global, so what that folder
//!   sees is what every task sees. Changes arrive as `mcp.status.changed`
//!   events; each one re-lists and emits `mcp:servers-changed` (no payload).
//! - **Sign-in:** OpenCode's own OAuth (discovery, registration, PKCE,
//!   refresh). The app starts it through the engine's integration API, gets
//!   the authorization address back and opens the browser itself; the engine
//!   listens for the callback on loopback and stores the tokens in its
//!   database (`opencode.db`, owner-only). Sign out deletes that credential.
//! - **Tool counts:** the engine has no API for a server's tools; the app
//!   counts them in the tool lists its model proxy forwards
//!   ([`observe_model_request`]), so a count shows after a task's first turn.
//! - **Agent:** `opencode mcp add` from a task (see [`launcher`]); after an
//!   approved add the app opens the sign-in page itself ([`after_agent_command`]).

pub mod commands;
pub mod config;
pub mod launcher;

use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;

use once_cell::sync::Lazy;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tracing::{info, warn};

use config::ConnectorsDoc;

pub use commands::*;

/// Event emitted (no payload) whenever any connector's status or tools change.
pub const SERVERS_CHANGED_EVENT: &str = "mcp:servers-changed";

/// Prefix of connector tool names in the UI: `mcp__<server>__<tool>`.
pub const TOOL_NAME_PREFIX: &str = "mcp__";

// ============================================================================
// Views (what the frontend gets; unchanged from the app-run connectors)
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum McpStatus {
    Connected,
    Connecting,
    Failed,
    Disabled,
    #[serde(rename = "needs-sign-in")]
    NeedsSignIn,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolView {
    pub name: String,
    pub description: String,
}

/// One configured connector. Never contains env or header values.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerView {
    pub name: String,
    /// "stdio" | "http"
    pub transport: &'static str,
    pub command: Option<String>,
    pub args: Vec<String>,
    pub url: Option<String>,
    pub env_keys: Vec<String>,
    pub header_keys: Vec<String>,
    pub enabled: bool,
    pub status: McpStatus,
    pub error: Option<String>,
    /// The tools the model was last offered from it (empty until a task's
    /// first turn after it connected).
    pub tools: Vec<McpToolView>,
    /// Always false: the older SSE transport is not supported by the engine.
    pub sse: bool,
    pub oauth: bool,
    pub signed_in: bool,
    pub signing_in: bool,
    pub sign_in_error: Option<String>,
}

// ============================================================================
// Paths
// ============================================================================

fn engine_paths() -> crate::engine::sidecar::EnginePaths {
    crate::engine::sidecar::EnginePaths::under(&crate::paths::get_app_data_dir())
}

/// The connectors file (the engine's global `opencode.json`).
pub fn file_path() -> PathBuf {
    engine_paths().engine_config_dir().join("opencode.json")
}

/// The folder whose engine location Settings asks about (empty, the app's own).
pub fn home_dir() -> PathBuf {
    engine_paths().root.join("connectors")
}

/// What `opencode mcp list` prints in a task (written by the app).
pub fn status_path() -> PathBuf {
    engine_paths().root.join("connectors-status.txt")
}

/// The folder holding the `opencode` launcher, first on task commands' PATH.
pub fn launcher_dir() -> PathBuf {
    crate::runtimes::runtimes_dir().join("engine-bin")
}

fn carried_marker() -> PathBuf {
    engine_paths().root.join("connectors-carried-over")
}

fn old_mcp_json() -> PathBuf {
    crate::paths::get_app_data_dir().join("mcp.json")
}

fn home() -> String {
    let dir = home_dir();
    let _ = std::fs::create_dir_all(&dir);
    std::fs::canonicalize(&dir).unwrap_or(dir).to_string_lossy().to_string()
}

// ============================================================================
// Files (blocking; before every engine launch)
// ============================================================================

/// Whether `opencode.json` is the app's own generated config from before
/// connectors moved there (it then holds the `vibework` agent).
fn is_old_generated_config(text: &str) -> bool {
    serde_json::from_str::<Value>(text).is_ok_and(|v| v["agents"].get(crate::engine::prompt::AGENT_ID).is_some())
}

/// The connectors file exists (owner-only), an old generated config in its
/// place is replaced, and the app's old `mcp.json` is carried over once
/// (mcp.json itself is left as it is).
pub fn prepare_files() -> Result<(), String> {
    let path = file_path();
    let text = std::fs::read_to_string(&path).ok();
    if text.as_deref().is_none_or(is_old_generated_config) {
        ConnectorsDoc::fresh().save(&path)?;
        info!("Connectors file created at {}", path.display());
    }
    let marker = carried_marker();
    let old = old_mcp_json();
    if !marker.exists() {
        if let Ok(text) = std::fs::read_to_string(&old) {
            let mut doc = ConnectorsDoc::load(&path)?;
            match config::carry_over(&mut doc, &text) {
                Ok(result) => {
                    doc.save(&path)?;
                    info!(
                        "Connectors carried over from mcp.json: {} added, {} already there, {} not usable as they were ({})",
                        result.added.len(),
                        result.kept.len(),
                        result.skipped.len(),
                        result.skipped.iter().map(|(n, why)| format!("{n}: {why}")).collect::<Vec<_>>().join("; ")
                    );
                }
                Err(e) => warn!("Connectors in mcp.json were not carried over: {e}"),
            }
        }
        let _ = std::fs::write(&marker, "Connectors were carried over from mcp.json into opencode/config/opencode/opencode.json. mcp.json was left as it was.\n");
    }
    let _ = std::fs::create_dir_all(home_dir());
    Ok(())
}

/// The `opencode` launcher for task commands (startup).
pub fn install_launcher() -> Result<(), String> {
    let engine = crate::engine::sidecar::binary_path()?;
    let dir = launcher_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot create {}: {e}", dir.display()))?;
    let text = launcher::launcher_script(&engine, &engine_paths(), &status_path());
    let path = dir.join("opencode");
    if std::fs::read_to_string(&path).is_ok_and(|t| t == text) {
        return Ok(());
    }
    let staging = path.with_extension("tmp");
    std::fs::write(&staging, text).map_err(|e| format!("Cannot write the opencode launcher: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&staging, std::fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&staging, &path).map_err(|e| format!("Cannot write the opencode launcher: {e}"))
}

fn load_doc() -> Result<ConnectorsDoc, String> {
    ConnectorsDoc::load(&file_path())
}

/// Configured connector names (for tool labels).
pub fn names() -> Vec<String> {
    load_doc().map(|d| d.servers().into_iter().map(|(n, _)| n).collect()).unwrap_or_default()
}

// ============================================================================
// State
// ============================================================================

#[derive(Debug, Clone, Default)]
struct Listed {
    status: String,
    error: Option<String>,
    integration: Option<String>,
}

struct Attempt {
    integration: String,
    attempt: String,
    task: tokio::task::AbortHandle,
}

#[derive(Default)]
struct State {
    /// Last status per connector, from the app's own folder.
    listed: BTreeMap<String, Listed>,
    /// Integration id → signed in (a stored credential exists).
    signed_in: HashMap<String, bool>,
    attempts: HashMap<String, Attempt>,
    sign_in_errors: HashMap<String, String>,
    /// Tools the model was last offered, per connector.
    tools: HashMap<String, Vec<String>>,
    config_error: Option<String>,
}

static STATE: Lazy<std::sync::Mutex<State>> = Lazy::new(Default::default);
static APP: OnceLock<AppHandle> = OnceLock::new();
static REFRESHING: Lazy<tokio::sync::Mutex<()>> = Lazy::new(|| tokio::sync::Mutex::new(()));

pub fn init(app: AppHandle) {
    let _ = APP.set(app);
    // First status once the engine is up, and the file `opencode mcp list` reads.
    tauri::async_runtime::spawn(async {
        for _ in 0..120 {
            if engine_client().await.is_some() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        refresh_and_emit().await;
        forget_orphan_sign_ins().await;
    });
}

fn emit_changed() {
    if let Some(app) = APP.get() {
        let _ = app.emit(SERVERS_CHANGED_EVENT, ());
    }
    crate::engine::on_connectors_changed();
}

async fn engine_client() -> Option<crate::engine::client::Client> {
    let engine = crate::engine::get().ok()?;
    let conn = engine.supervisor.current()?;
    Some(crate::engine::client::Client::new(conn))
}

/// Ask the engine for every connector's status (and sign-in) and keep it.
async fn refresh() {
    let _guard = REFRESHING.lock().await;
    let Some(client) = engine_client().await else { return };
    let dir = home();
    // A folder the engine has not opened yet answers empty while it starts.
    let mut listed = client.mcp_servers(&dir).await;
    if listed.as_ref().is_ok_and(|l| l.is_empty()) && !names().is_empty() {
        tokio::time::sleep(Duration::from_millis(400)).await;
        listed = client.mcp_servers(&dir).await;
    }
    let listed = match listed {
        Ok(l) => l,
        Err(e) => {
            warn!("Could not list connectors: {e}");
            return;
        }
    };
    let mut fresh = BTreeMap::new();
    let mut signed = HashMap::new();
    for server in &listed {
        let Some(name) = server["name"].as_str() else { continue };
        if name == crate::engine::bridge::MCP_SERVER_NAME {
            continue;
        }
        let integration = server["integrationID"].as_str().map(str::to_string);
        if let Some(id) = &integration {
            let has = client.integration_credentials(id, &dir).await.map(|c| !c.is_empty()).unwrap_or(false);
            signed.insert(id.clone(), has);
        }
        fresh.insert(
            name.to_string(),
            Listed { status: server["status"]["status"].as_str().unwrap_or_default().to_string(), error: server["status"]["error"].as_str().map(str::to_string), integration },
        );
    }
    let mut state = STATE.lock().unwrap();
    state.listed = fresh;
    state.signed_in = signed;
}

/// Bring the cached status up to date (before a task's message).
pub async fn refresh_now() {
    refresh().await;
}

async fn refresh_and_emit() {
    refresh().await;
    let views = build_views();
    write_status_file(&views);
    emit_changed();
}

/// Engine events that change what Settings shows (debounced).
pub fn on_engine_event(event: &Value) {
    let kind = event["type"].as_str().unwrap_or_default();
    if !matches!(kind, "mcp.status.changed" | "mcp.tools.changed" | "config.updated") {
        return;
    }
    static PENDING: Lazy<std::sync::atomic::AtomicBool> = Lazy::new(|| std::sync::atomic::AtomicBool::new(false));
    if PENDING.swap(true, std::sync::atomic::Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async {
        tokio::time::sleep(Duration::from_millis(250)).await;
        PENDING.store(false, std::sync::atomic::Ordering::SeqCst);
        refresh_and_emit().await;
    });
}

// ============================================================================
// Views
// ============================================================================

/// The engine's technical status text → one plain sentence.
fn plain_failure(name: &str, entry: &Value, error: &str) -> String {
    let summary = config::summarize(entry);
    let lower = error.to_lowercase();
    if summary.url.as_deref().is_some_and(config::looks_like_sse) {
        return config::SSE_ROW_MESSAGE.into();
    }
    if summary.transport == "stdio" {
        let program = summary.command.unwrap_or_default();
        if lower.contains("enoent") || lower.contains("not found") || lower.contains("code 127") || lower.contains("no such file") {
            return format!("Couldn't start {program}: it isn't installed, or isn't on your PATH.");
        }
        return format!("{name} stopped while starting. {}", first_line(error));
    }
    let host = summary.url.as_deref().and_then(|u| reqwest::Url::parse(u).ok()).and_then(|u| u.host_str().map(str::to_string)).unwrap_or_default();
    if lower.contains("401") || lower.contains("403") || lower.contains("unauthorized") || lower.contains("forbidden") {
        return format!("{host} turned the key down. Check it with Edit.");
    }
    if lower.contains("econnrefused") || lower.contains("unable to connect") || lower.contains("enotfound") || lower.contains("timed out") || lower.contains("fetch failed") {
        return format!("Couldn't reach {host}.");
    }
    format!("Couldn't connect: {}", first_line(error))
}

fn first_line(text: &str) -> String {
    let line = text.lines().next().unwrap_or_default().trim();
    let line = line.strip_prefix("Connection closed: ").unwrap_or(line);
    let mut out: String = line.chars().take(200).collect();
    if line.chars().count() > 200 {
        out.push('…');
    }
    out
}

fn build_views() -> Vec<McpServerView> {
    let doc = match load_doc() {
        Ok(doc) => {
            STATE.lock().unwrap().config_error = None;
            doc
        }
        Err(e) => {
            STATE.lock().unwrap().config_error = Some(e);
            return Vec::new();
        }
    };
    let state = STATE.lock().unwrap();
    doc.servers()
        .into_iter()
        .filter(|(name, _)| name != crate::engine::bridge::MCP_SERVER_NAME)
        .map(|(name, entry)| {
            let summary = config::summarize(&entry);
            let (env_keys, header_keys) = config::secret_names(&entry);
            let listed = state.listed.get(&name).cloned();
            let signed_in = listed.as_ref().and_then(|l| l.integration.as_ref()).and_then(|id| state.signed_in.get(id)).copied().unwrap_or(false);
            let (status, error) = if summary.disabled {
                let why = summary.url.as_deref().filter(|u| config::looks_like_sse(u)).map(|_| config::SSE_ROW_MESSAGE.to_string());
                (McpStatus::Disabled, why)
            } else {
                match listed.as_ref().map(|l| l.status.as_str()) {
                    Some("connected") => (McpStatus::Connected, None),
                    Some("needs_auth") => (McpStatus::NeedsSignIn, None),
                    Some("failed") => (McpStatus::Failed, Some(plain_failure(&name, &entry, listed.as_ref().and_then(|l| l.error.as_deref()).unwrap_or("")))),
                    Some("disabled") => (McpStatus::Disabled, None),
                    _ => (McpStatus::Connecting, None),
                }
            };
            let tools = if status == McpStatus::Connected {
                state.tools.get(&name).cloned().unwrap_or_default().into_iter().map(|t| McpToolView { name: t, description: String::new() }).collect()
            } else {
                Vec::new()
            };
            McpServerView {
                name: name.clone(),
                transport: summary.transport,
                command: summary.command,
                args: summary.args,
                url: summary.url,
                env_keys,
                header_keys,
                enabled: !summary.disabled,
                status,
                error,
                tools,
                sse: false,
                oauth: summary.transport == "http" && summary.oauth,
                signed_in: signed_in && status != McpStatus::NeedsSignIn,
                signing_in: state.attempts.contains_key(&name),
                sign_in_error: state.sign_in_errors.get(&name).cloned(),
            }
        })
        .collect()
}

/// What a task's `opencode mcp list` prints: the CLI's own symbols, with
/// Vibework's words for what to do next.
fn status_text(views: &[McpServerView]) -> String {
    if views.is_empty() {
        return "No MCP servers configured\n".into();
    }
    let width = views.iter().map(|v| v.name.len()).max().unwrap_or(0);
    let mut out = String::new();
    for v in views {
        let (icon, words) = match v.status {
            McpStatus::Connected => ("✓", if v.tools.is_empty() { "connected".to_string() } else { format!("connected ({} {})", v.tools.len(), if v.tools.len() == 1 { "tool" } else { "tools" }) }),
            McpStatus::NeedsSignIn if v.signing_in => ("⚠", "needs authentication: the sign-in page is open in the person's browser; ask them to approve it there".to_string()),
            McpStatus::NeedsSignIn => ("⚠", "needs authentication: the person signs in from Settings → Connectors (Sign in)".to_string()),
            McpStatus::Failed => ("✗", format!("failed: {}", v.error.clone().unwrap_or_default())),
            McpStatus::Disabled => ("○", "disabled (switched off in Settings → Connectors)".to_string()),
            McpStatus::Connecting => ("○", "pending".to_string()),
        };
        out.push_str(&format!("{icon} {:width$}  {words}\n", v.name));
    }
    out
}

fn write_status_file(views: &[McpServerView]) {
    let path = status_path();
    let text = status_text(views);
    if std::fs::read_to_string(&path).is_ok_and(|t| t == text) {
        return;
    }
    let _ = std::fs::write(&path, text);
}

/// The list Settings shows (asks the engine first).
pub(crate) async fn list() -> Vec<McpServerView> {
    refresh().await;
    let views = build_views();
    write_status_file(&views);
    views
}

pub(crate) async fn config_error() -> Option<String> {
    let _ = build_views();
    STATE.lock().unwrap().config_error.clone()
}

// ============================================================================
// Editing the file
// ============================================================================

/// The engine picks the file up within about a second; re-list after it did.
async fn after_change() -> Vec<McpServerView> {
    let views = build_views();
    write_status_file(&views);
    emit_changed();
    tauri::async_runtime::spawn(async {
        for delay in [700u64, 1500, 3000] {
            tokio::time::sleep(Duration::from_millis(delay)).await;
            refresh_and_emit().await;
        }
    });
    views
}

fn edit<F: FnOnce(&mut ConnectorsDoc) -> Result<(), String>>(change: F) -> Result<(), String> {
    let path = file_path();
    let mut doc = load_doc()?;
    change(&mut doc)?;
    doc.save(&path)
}

pub(crate) async fn add(name: String, entry: Value) -> Result<Vec<McpServerView>, String> {
    let name = name.trim().to_string();
    config::validate_name(&name)?;
    let native = config::to_native(&entry)?;
    edit(|doc| {
        if doc.contains(&name) {
            return Err(format!("A connector named '{name}' already exists"));
        }
        doc.set(&name, native);
        Ok(())
    })?;
    info!("Connector {name} added");
    Ok(after_change().await)
}

pub(crate) async fn update(name: String, new_name: String, entry: Value, keep: Vec<String>) -> Result<Vec<McpServerView>, String> {
    let new_name = new_name.trim().to_string();
    config::validate_name(&new_name)?;
    let doc = load_doc()?;
    let old = doc.get(&name).cloned().ok_or_else(|| format!("No connector named '{name}'"))?;
    let merged = config::merge_edit_keeping(&old, &entry, &keep)?;
    if new_name != name && doc.contains(&new_name) {
        return Err(format!("A connector named '{new_name}' already exists"));
    }
    // A new name or address is a new sign-in for OpenCode (it keys sign-ins
    // on both), so the old one is deleted.
    let identity_changed = new_name != name || old["url"] != merged["url"];
    let integration = if identity_changed { integration_of(&name) } else { None };
    edit(|doc| {
        doc.remove(&name);
        doc.set(&new_name, merged);
        Ok(())
    })?;
    if let Some(id) = integration {
        delete_credentials(&id).await;
    }
    cancel_attempt(&name).await;
    info!("Connector {name} updated");
    Ok(after_change().await)
}

pub(crate) async fn remove(name: String) -> Result<Vec<McpServerView>, String> {
    let integration = integration_of(&name);
    edit(|doc| doc.remove(&name).map(|_| ()).ok_or_else(|| format!("No connector named '{name}'")))?;
    cancel_attempt(&name).await;
    if let Some(id) = integration {
        delete_credentials(&id).await;
    }
    STATE.lock().unwrap().tools.remove(&name);
    info!("Connector {name} removed");
    Ok(after_change().await)
}

pub(crate) async fn set_enabled(name: String, enabled: bool) -> Result<Vec<McpServerView>, String> {
    edit(|doc| {
        let mut entry = doc.get(&name).cloned().ok_or_else(|| format!("No connector named '{name}'"))?;
        let obj = entry.as_object_mut().ok_or("This connector's settings are not an object")?;
        if enabled {
            obj.remove("disabled");
        } else {
            obj.insert("disabled".into(), json!(true));
        }
        doc.set(&name, entry);
        Ok(())
    })?;
    Ok(after_change().await)
}

pub(crate) async fn import(text: String) -> Result<Vec<McpServerView>, String> {
    let entries = config::parse_import(&text)?;
    edit(|doc| {
        for (name, entry) in entries {
            doc.set(&name, entry);
        }
        Ok(())
    })?;
    Ok(after_change().await)
}

/// Re-read the file and ask the engine to connect again every connector that
/// failed (Retry): in the app's own folder and in the folders of open tasks.
pub(crate) async fn reload() -> Result<Vec<McpServerView>, String> {
    load_doc()?;
    refresh().await;
    let failed: Vec<String> = STATE.lock().unwrap().listed.iter().filter(|(_, l)| l.status == "failed").map(|(n, _)| n.clone()).collect();
    if let (false, Some(client)) = (failed.is_empty(), engine_client().await) {
        let mut folders = crate::engine::open_folders();
        folders.insert(0, home());
        for folder in folders {
            for name in &failed {
                if let Err(e) = client.mcp_connect(&folder, name).await {
                    warn!("Could not reconnect {name} in {folder}: {e}");
                }
            }
        }
        info!("Asked the engine to reconnect {}", failed.join(", "));
    }
    Ok(after_change().await)
}

// ============================================================================
// Sign-in
// ============================================================================

fn integration_of(name: &str) -> Option<String> {
    STATE.lock().unwrap().listed.get(name).and_then(|l| l.integration.clone())
}

async fn delete_credentials(integration: &str) {
    let Some(client) = engine_client().await else { return };
    match client.integration_credentials(integration, &home()).await {
        Ok(ids) => {
            for id in ids {
                if let Err(e) = client.delete_credential(&id).await {
                    warn!("Could not delete a connector sign-in: {e}");
                }
            }
        }
        Err(e) => warn!("Could not look up a connector's sign-in: {e}"),
    }
}

/// The connector's integration id, waiting briefly for the engine to list it
/// (right after an add it takes about a second).
async fn wait_for_integration(name: &str) -> Option<String> {
    for _ in 0..20 {
        if let Some(id) = integration_of(name) {
            return Some(id);
        }
        refresh().await;
        if let Some(id) = integration_of(name) {
            return Some(id);
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    None
}

/// Open the sign-in page: in the system browser, or (debug builds) write its
/// address to `VIBEWORK_DEV_SIGNIN_URL_FILE` so a test can be the browser.
fn open_sign_in_page(url: &str) -> Result<(), String> {
    #[cfg(debug_assertions)]
    if let Ok(file) = std::env::var("VIBEWORK_DEV_SIGNIN_URL_FILE") {
        if !file.trim().is_empty() {
            info!("Sign-in address written to the dev file instead of opening a browser");
            return std::fs::write(file.trim(), url).map_err(|e| e.to_string());
        }
    }
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| format!("Could not open the browser: {e}"))
}

fn plain_sign_in_error(name: &str, message: &str) -> String {
    let lower = message.to_lowercase();
    if lower.contains("register") || lower.contains("registration") {
        return "Couldn’t sign in: this server doesn’t let new apps register. Ask its provider for a key and add it as a header.".into();
    }
    if lower.contains("state mismatch") || lower.contains("different sign-in") {
        return "Couldn’t sign in: the browser came back from a different sign-in. Try again.".into();
    }
    if lower.contains("access_denied") || lower.contains("denied") {
        return format!("You didn’t approve {} on its sign-in page.", launcher::label(name));
    }
    format!("Couldn’t sign in: {}", first_line(message))
}

pub(crate) async fn sign_in(name: String) -> Result<Vec<McpServerView>, String> {
    let doc = load_doc()?;
    let entry = doc.get(&name).cloned().ok_or_else(|| format!("No connector named '{name}'"))?;
    if !config::summarize(&entry).oauth || config::summarize(&entry).transport != "http" {
        return Err(format!("{name} doesn't sign in through the browser"));
    }
    cancel_attempt(&name).await;
    STATE.lock().unwrap().sign_in_errors.remove(&name);
    let client = engine_client().await.ok_or("The agent engine isn't running yet. Try again in a moment.")?;
    let integration = wait_for_integration(&name).await.ok_or_else(|| format!("{name} isn't ready for sign-in yet. Try again in a moment."))?;
    let dir = home();
    let attempt = match client.oauth_connect(&integration, &dir).await {
        Ok(a) => a,
        Err(e) => {
            let message = plain_sign_in_error(&name, &e);
            STATE.lock().unwrap().sign_in_errors.insert(name.clone(), message);
            return Ok(after_change().await);
        }
    };
    let (Some(url), Some(attempt_id)) = (attempt["url"].as_str().map(str::to_string), attempt["attemptID"].as_str().map(str::to_string)) else {
        STATE.lock().unwrap().sign_in_errors.insert(name.clone(), "Couldn’t sign in: the server gave no sign-in page.".into());
        return Ok(after_change().await);
    };
    if let Err(e) = open_sign_in_page(&url) {
        let _ = client.oauth_cancel(&integration, &attempt_id, &dir).await;
        STATE.lock().unwrap().sign_in_errors.insert(name.clone(), e);
        return Ok(after_change().await);
    }
    info!("Sign-in for connector {name} started");
    let watched = name.clone();
    let task = tauri::async_runtime::spawn(watch_attempt(watched, integration.clone(), attempt_id.clone()));
    STATE.lock().unwrap().attempts.insert(name, Attempt { integration, attempt: attempt_id, task: task.inner().abort_handle() });
    Ok(after_change().await)
}

/// Follow a sign-in until the browser comes back (or it fails or expires).
async fn watch_attempt(name: String, integration: String, attempt: String) {
    let dir = home();
    let deadline = std::time::Instant::now() + Duration::from_secs(11 * 60);
    let outcome: Result<(), String> = loop {
        tokio::time::sleep(Duration::from_millis(800)).await;
        if std::time::Instant::now() > deadline {
            break Err("Couldn’t sign in: the sign-in page wasn’t finished in time. Try again.".into());
        }
        let Some(client) = engine_client().await else { continue };
        match client.oauth_status(&integration, &attempt, &dir).await {
            Ok(status) => match status["status"].as_str().unwrap_or_default() {
                "complete" => break Ok(()),
                "failed" => break Err(plain_sign_in_error(&name, status["message"].as_str().unwrap_or("the server turned it down"))),
                "expired" => break Err("Couldn’t sign in: the sign-in page wasn’t finished in time. Try again.".into()),
                _ => {}
            },
            Err(e) if e.contains("404") => break Err("Couldn’t sign in: the sign-in was cancelled.".into()),
            Err(_) => {}
        }
    };
    {
        let mut state = STATE.lock().unwrap();
        if state.attempts.get(&name).is_some_and(|a| a.attempt == attempt) {
            state.attempts.remove(&name);
        }
        match &outcome {
            Ok(()) => {
                state.sign_in_errors.remove(&name);
            }
            Err(e) => {
                state.sign_in_errors.insert(name.clone(), e.clone());
            }
        }
    }
    match outcome {
        Ok(()) => info!("Connector {name} signed in"),
        Err(e) => info!("Sign-in for connector {name} ended: {e}"),
    }
    refresh_and_emit().await;
}

async fn cancel_attempt(name: &str) {
    let attempt = STATE.lock().unwrap().attempts.remove(name);
    if let Some(a) = attempt {
        a.task.abort();
        if let Some(client) = engine_client().await {
            let _ = client.oauth_cancel(&a.integration, &a.attempt, &home()).await;
        }
    }
}

pub(crate) async fn cancel_sign_in(name: String) -> Result<Vec<McpServerView>, String> {
    cancel_attempt(&name).await;
    Ok(after_change().await)
}

pub(crate) async fn sign_out(name: String) -> Result<Vec<McpServerView>, String> {
    let integration = match integration_of(&name) {
        Some(id) => id,
        None => wait_for_integration(&name).await.ok_or_else(|| format!("{name} has no sign-in to delete"))?,
    };
    cancel_attempt(&name).await;
    delete_credentials(&integration).await;
    STATE.lock().unwrap().sign_in_errors.remove(&name);
    info!("Connector {name} signed out");
    refresh().await;
    Ok(after_change().await)
}

/// Delete sign-ins of connectors that are no longer configured (removed by
/// hand or by a task's `opencode mcp remove`).
async fn forget_orphan_sign_ins() {
    let Some(client) = engine_client().await else { return };
    let Ok(doc) = load_doc() else { return };
    let configured: Vec<String> = {
        let state = STATE.lock().unwrap();
        // Only with a complete picture: every configured browser sign-in
        // connector must be listed with its id, or nothing is deleted.
        let complete = doc.servers().iter().all(|(name, entry)| {
            let s = config::summarize(entry);
            !(s.transport == "http" && s.oauth) || state.listed.get(name).is_some_and(|l| l.integration.is_some())
        });
        if !complete {
            return;
        }
        state.listed.values().filter_map(|l| l.integration.clone()).collect()
    };
    let Ok(all) = client.mcp_credentials().await else { return };
    for (credential, integration) in all {
        if !configured.contains(&integration) {
            info!("Deleting the sign-in of a connector that was removed");
            let _ = client.delete_credential(&credential).await;
        }
    }
}

// ============================================================================
// From tasks
// ============================================================================

/// A task's shell command added or removed a connector (it ran and
/// succeeded). After an add that signs in through the browser, the app
/// opens the sign-in page itself, as plain OpenCode's `/mcps` would; after a
/// remove, the sign-in is deleted.
pub fn after_agent_command(command: launcher::AgentCommand) {
    tauri::async_runtime::spawn(async move {
        match command {
            launcher::AgentCommand::Add { name, .. } => {
                let Ok(doc) = load_doc() else { return };
                let Some(mut entry) = doc.get(&name).cloned() else { return };
                // A connector added with a key header signs in with that key
                // (as one added in Settings does), never in the browser.
                if entry["type"] == "remote" && entry.get("headers").is_some_and(|h| h.as_object().is_some_and(|m| !m.is_empty())) && entry.get("oauth").is_none() {
                    entry["oauth"] = json!(false);
                    let fixed = entry.clone();
                    if let Err(e) = edit(|doc| {
                        doc.set(&name, fixed);
                        Ok(())
                    }) {
                        warn!("Could not mark {name} as signing in with its key: {e}");
                    }
                }
                let summary = config::summarize(&entry);
                if summary.transport != "http" || !summary.oauth || summary.disabled {
                    refresh_and_emit().await;
                    return;
                }
                // Wait for the engine to list it, then sign in if it needs to.
                for _ in 0..20 {
                    refresh().await;
                    let status = STATE.lock().unwrap().listed.get(&name).map(|l| l.status.clone());
                    match status.as_deref() {
                        Some("needs_auth") => {
                            if let Err(e) = sign_in(name.clone()).await {
                                warn!("Could not start the sign-in for {name}: {e}");
                            }
                            return;
                        }
                        Some("connected") | Some("failed") => break,
                        _ => tokio::time::sleep(Duration::from_millis(500)).await,
                    }
                }
                refresh_and_emit().await;
            }
            launcher::AgentCommand::Remove { name } => {
                cancel_attempt(&name).await;
                STATE.lock().unwrap().tools.remove(&name);
                // The engine drops it within about a second of the file changing.
                for _ in 0..6 {
                    tokio::time::sleep(Duration::from_millis(500)).await;
                    refresh().await;
                    if integration_of(&name).is_none() {
                        break;
                    }
                }
                forget_orphan_sign_ins().await;
                refresh_and_emit().await;
            }
            launcher::AgentCommand::List => {}
        }
    });
}

/// The tools a model request offers, per connector (`<name>_<tool>`).
pub fn observe_model_request(body: &[u8]) {
    let Ok(value) = serde_json::from_slice::<Value>(body) else { return };
    let Some(tools) = value["tools"].as_array() else { return };
    let offered: Vec<&str> = tools.iter().filter_map(|t| t["function"]["name"].as_str()).collect();
    let mut names = names();
    // Longest first, so `a_b` wins over `a`.
    names.sort_by_key(|n| std::cmp::Reverse(n.len()));
    let mut seen: HashMap<String, Vec<String>> = HashMap::new();
    for tool in offered {
        if let Some(name) = names.iter().find(|n| tool.strip_prefix(n.as_str()).is_some_and(|r| r.starts_with('_') && r.len() > 1)) {
            seen.entry(name.clone()).or_default().push(tool[name.len() + 1..].to_string());
        }
    }
    let changed = {
        let mut state = STATE.lock().unwrap();
        let mut changed = false;
        for name in &names {
            let now = seen.remove(name);
            let connected = state.listed.get(name).is_some_and(|l| l.status == "connected");
            match now {
                Some(tools) if state.tools.get(name) != Some(&tools) => {
                    state.tools.insert(name.clone(), tools);
                    changed = true;
                }
                // Connected but offered nothing: none to count.
                None if connected && state.tools.get(name).is_some_and(|t| !t.is_empty()) => {
                    state.tools.insert(name.clone(), Vec::new());
                    changed = true;
                }
                _ => {}
            }
        }
        changed
    };
    if changed {
        let views = build_views();
        write_status_file(&views);
        if let Some(app) = APP.get() {
            let _ = app.emit(SERVERS_CHANGED_EVENT, ());
        }
    }
}

/// Connectors a task works with now, for its timeline notes: enabled and not
/// waiting for a sign-in (their tools reach tasks only once signed in).
/// Name → a hash of what defines it (never its secret values).
pub fn desired() -> BTreeMap<String, String> {
    let Ok(doc) = load_doc() else { return BTreeMap::new() };
    let state = STATE.lock().unwrap();
    doc.servers()
        .into_iter()
        .filter(|(name, entry)| {
            name != crate::engine::bridge::MCP_SERVER_NAME
                && !config::summarize(entry).disabled
                && !state.listed.get(name).is_some_and(|l| matches!(l.status.as_str(), "needs_auth" | "failed" | "disabled"))
        })
        .map(|(name, entry)| (name, definition_hash(&entry)))
        .collect()
}

/// Enabled connectors waiting for a new sign-in (their tools left the tasks).
pub fn lapsed() -> Vec<String> {
    let Ok(doc) = load_doc() else { return Vec::new() };
    let state = STATE.lock().unwrap();
    doc.servers()
        .into_iter()
        .filter(|(name, entry)| !config::summarize(entry).disabled && state.listed.get(name).is_some_and(|l| l.status == "needs_auth"))
        .map(|(name, _)| name)
        .collect()
}

/// FNV-1a, 64 bits: stable across builds.
fn fnv(bytes: &[u8]) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in bytes {
        hash ^= *b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

/// What defines a connector for the "updated" note: kind, command, folder,
/// address and the *names* of its variables and headers.
pub fn definition_hash(entry: &Value) -> String {
    let (env, headers) = config::secret_names(entry);
    let shape = json!({ "type": entry["type"], "command": entry["command"], "cwd": entry["cwd"], "url": entry["url"], "env": env, "headers": headers });
    fnv(shape.to_string().as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_is_stable_and_ignores_secret_values() {
        assert_eq!(fnv(b"abc"), "e71fa2190541574b");
        let a = json!({"type": "local", "command": ["npx", "srv"], "environment": {"TOKEN": "one"}});
        let b = json!({"type": "local", "command": ["npx", "srv"], "environment": {"TOKEN": "two"}});
        let c = json!({"type": "local", "command": ["npx", "srv", "--flag"], "environment": {"TOKEN": "one"}});
        assert_eq!(definition_hash(&a), definition_hash(&b));
        assert_ne!(definition_hash(&a), definition_hash(&c));
    }

    #[test]
    fn failures_read_plainly() {
        let local = json!({"type": "local", "command": ["nope-server"]});
        assert_eq!(plain_failure("x", &local, "Connection closed: spawn nope-server ENOENT"), "Couldn't start nope-server: it isn't installed, or isn't on your PATH.");
        let remote = json!({"type": "remote", "url": "https://mcp.example.com/mcp"});
        assert_eq!(plain_failure("x", &remote, "fetch failed: ECONNREFUSED"), "Couldn't reach mcp.example.com.");
        assert_eq!(plain_failure("x", &remote, "HTTP 401 Unauthorized"), "mcp.example.com turned the key down. Check it with Edit.");
        let sse = json!({"type": "remote", "url": "https://old.example.com/sse"});
        assert_eq!(plain_failure("x", &sse, "anything"), config::SSE_ROW_MESSAGE);
        assert!(plain_sign_in_error("granola", "MCP server requires a login before it can register a client: dynamic registration not supported").contains("doesn’t let new apps register"));
    }

    #[test]
    fn the_task_status_file_reads_like_the_cli() {
        let view = |name: &str, status: McpStatus, tools: usize, signing_in: bool| McpServerView {
            name: name.into(), transport: "http", command: None, args: vec![], url: Some("https://x/mcp".into()), env_keys: vec![], header_keys: vec![],
            enabled: true, status, error: if status == McpStatus::Failed { Some("Couldn't reach x.".into()) } else { None },
            tools: (0..tools).map(|i| McpToolView { name: format!("t{i}"), description: String::new() }).collect(),
            sse: false, oauth: true, signed_in: false, signing_in, sign_in_error: None,
        };
        let text = status_text(&[
            view("fakenotes", McpStatus::Connected, 1, false),
            view("granola", McpStatus::NeedsSignIn, 0, true),
            view("linear", McpStatus::NeedsSignIn, 0, false),
            view("x", McpStatus::Failed, 0, false),
        ]);
        assert_eq!(
            text,
            "✓ fakenotes  connected (1 tool)\n⚠ granola    needs authentication: the sign-in page is open in the person's browser; ask them to approve it there\n⚠ linear     needs authentication: the person signs in from Settings → Connectors (Sign in)\n✗ x          failed: Couldn't reach x.\n"
        );
        assert_eq!(status_text(&[]), "No MCP servers configured\n");
    }

    #[test]
    fn an_old_generated_config_is_recognised() {
        assert!(is_old_generated_config(r#"{"agents":{"vibework":{"mode":"primary"}}}"#));
        assert!(!is_old_generated_config(r#"{"mcp":{"servers":{}}}"#));
        assert!(!is_old_generated_config("not json"));
    }
}
