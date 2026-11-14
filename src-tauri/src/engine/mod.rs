//! The agent engine: OpenCode v2, run as a pinned sidecar and driven over
//! its local HTTP API.
//!
//! - `sidecar`: starts, supervises and stops the engine process.
//! - `bridge`: the app's loopback endpoint the engine talks to (OpenRouter
//!   proxy that adds the key, the app's own tools and the user's connectors
//!   over MCP).
//! - `commands`: the task commands the UI calls (`agent_*`).
//! - `events`/`history`/`tools`: turn the engine's events and history into
//!   the shapes the UI renders.
//! - `permissions`/`policy`: decide each permission request (Ask/Auto/Yolo).
//!
//! Tasks are OpenCode sessions tagged `metadata.vibework.engine = "opencode"`.
//! Tasks made by the earlier in-house engine are not listed; their files stay
//! in `<app data>/sessions` (see DESIGN.md).

pub mod external;
pub mod inbox;
pub mod app_tools;
pub mod bash_parser;
pub mod bridge;
pub mod client;
pub mod commands;
pub mod connectors;
pub mod events;
pub mod history;
pub mod interrupted;
pub mod forms;
pub mod launch;
pub mod login_path;
pub mod msg_index;
pub mod permissions;
pub mod policy;
pub mod attachments;
pub mod prompt;
pub mod scratch;
pub mod sidecar;
pub mod skills;
pub mod tools;
pub mod types;

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures::StreamExt;
use once_cell::sync::OnceCell;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tracing::{debug, info, warn};

use client::Client;
use events::{Effect, Reducer};
use sidecar::Supervisor;

/// The running OpenCode adapter: engine process, event reducer, app handle.
pub struct OpenCode {
    pub(crate) supervisor: Arc<Supervisor>,
    pub(crate) reducer: Mutex<Reducer>,
    pub(crate) app: AppHandle,
    /// Sessions whose shell environment was set on the current engine (generation, engine ID).
    env_ready: Mutex<HashSet<(u64, String)>>,
    shell_watchers: Mutex<HashSet<String>>,
    /// Restart once no turn is running (skill sources changed).
    restart_pending: AtomicBool,
    restarting: AtomicBool,
}

pub use launch::LaunchPlan;

/// The plan for the next launch (called by the supervisor on every start).
pub(crate) fn launch_plan(paths: &sidecar::EnginePaths) -> Result<LaunchPlan, String> {
    launch::plan(paths)
}

static OPENCODE: OnceCell<Arc<OpenCode>> = OnceCell::new();

pub fn get() -> Result<Arc<OpenCode>, String> {
    OPENCODE.get().cloned().ok_or_else(|| "The OpenCode engine is not running".to_string())
}

/// Start the engine and its event consumer (call once, from app setup).
pub fn init(app: AppHandle) {
    let paths = sidecar::EnginePaths::under(&crate::paths::get_app_data_dir());
    if let Err(e) = bridge::start() {
        tracing::error!("{e}");
    }
    let engine = Arc::new(OpenCode {
        supervisor: Supervisor::new(paths),
        reducer: Mutex::new(Reducer::default()),
        app,
        env_ready: Mutex::new(HashSet::new()),
        shell_watchers: Mutex::new(HashSet::new()),
        restart_pending: AtomicBool::new(false),
        restarting: AtomicBool::new(false),
    });
    if OPENCODE.set(engine.clone()).is_err() {
        return;
    }
    info!("Agent engine: OpenCode");
    let starter = engine.clone();
    tauri::async_runtime::spawn(async move {
        crate::models::ensure_loaded().await;
        // The user's PATH for the engine and task commands (see launch::user_path).
        login_path::login_shell_path().await;
        if let Err(e) = starter.supervisor.start().await {
            tracing::error!("Could not start the OpenCode engine: {e}");
        } else if let Err(e) = commands::purge_deleted_sessions().await {
            warn!("Could not purge expired OpenCode tasks: {e}");
        }
        // The message search index catches up with tasks changed since last time.
        tauri::async_runtime::spawn(commands::index_all_messages());
        // Stale scratch folders (no turn runs yet at start-up).
        let removed = tauri::async_runtime::spawn_blocking(|| scratch::prune(&[])).await.unwrap_or(0);
        if removed > 0 {
            info!("Removed {removed} stale scratch folder(s)");
        }
    });
    tauri::async_runtime::spawn(engine.clone().consume_events());
}

/// Stop the engine and its process tree (app exit). Blocking.
pub fn shutdown_blocking() {
    external::shutdown_blocking();
    if let Some(engine) = OPENCODE.get() {
        engine.supervisor.shutdown_blocking();
    }
}

/// mcp.json may have changed (any connector event). Nothing restarts: each
/// task's folder is brought up to date before its next message
/// (`connectors::sync_location`). Here the UI only learns the new names, so
/// their tool calls are labelled as connector calls.
pub fn on_connectors_changed() {
    tauri::async_runtime::spawn(async {
        if let Ok(names) = tauri::async_runtime::spawn_blocking(|| connectors::desired().into_keys().collect::<Vec<_>>()).await {
            tools::add_connector_names(&names);
        }
    });
}

/// The folders of the tasks opened in this app run (for reconnecting connectors there).
pub fn open_folders() -> Vec<String> {
    OPENCODE.get().map(|e| e.reducer.lock().unwrap().folders()).unwrap_or_default()
}

/// Skill sources changed in Settings.
pub fn on_skill_sources_changed() {
    if let Some(engine) = OPENCODE.get().cloned() {
        engine.request_restart("skill sources changed");
    }
}

impl OpenCode {
    /// Restart now if no turn is running, otherwise when the last one ends.
    fn request_restart(self: &Arc<Self>, why: &str) {
        info!("Engine restart requested ({why})");
        self.restart_pending.store(true, Ordering::SeqCst);
        self.restart_if_idle();
    }

    fn restart_if_idle(self: &Arc<Self>) {
        if !self.restart_pending.load(Ordering::SeqCst) || !self.reducer.lock().unwrap().busy().is_empty() {
            return;
        }
        self.restart_pending.store(false, Ordering::SeqCst);
        if self.restarting.swap(true, Ordering::SeqCst) {
            return;
        }
        let engine = self.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(e) = engine.supervisor.restart().await {
                tracing::error!("Engine restart failed: {e}");
            }
            engine.restarting.store(false, Ordering::SeqCst);
            // Something changed again while restarting: check once more.
            if engine.restart_pending.load(Ordering::SeqCst) {
                engine.restart_if_idle();
            }
        });
    }

    /// Give a session's shell commands an explicit environment (the app's
    /// own, minus secrets) on the current engine. The engine keeps it in
    /// memory only, so it is set again after a restart. Fails closed: callers
    /// must not prompt when this fails.
    pub(crate) async fn ensure_environment(&self, client: &Client, engine_id: &str) -> Result<(), String> {
        let generation = client.generation();
        let marker = (generation, engine_id.to_string());
        if self.env_ready.lock().unwrap().contains(&marker) {
            return Ok(());
        }
        let key = crate::byok::current_key().await;
        let mut variables = launch::session_environment(key.as_deref());
        // The task's own scratch folder (a path the app owns, not a secret);
        // a helper shares its task's.
        let owner = self.reducer.lock().unwrap().scratch_owner(engine_id);
        let scratch = scratch::ensure(&owner)?;
        variables.insert(scratch::ENV_NAME.into(), scratch.to_string_lossy().to_string());
        client
            .set_environment(engine_id, &variables)
            .await
            .map_err(|e| format!("Could not prepare the task's command environment, so nothing was sent: {e}"))?;
        let mut ready = self.env_ready.lock().unwrap();
        ready.retain(|(g, _)| *g == generation);
        ready.insert(marker);
        Ok(())
    }

    /// Before a helper's request is allowed: its commands must have the
    /// task's environment (the engine does not pass the parent's on), or a
    /// bare `opencode` would reach the person's own OpenCode. Fails closed.
    pub(crate) async fn ready_to_allow(&self, client: &Client, engine_id: &str, decision: &'static str, message: Option<String>) -> (&'static str, Option<String>) {
        if decision != "once" || self.reducer.lock().unwrap().helper_parent(engine_id).is_none() {
            return (decision, message);
        }
        match self.ensure_environment(client, engine_id).await {
            Ok(()) => (decision, message),
            Err(e) => {
                warn!("[{engine_id}] {e}");
                ("reject", Some("Vibework could not prepare the helper's command environment, so this step did not run. Try again.".into()))
            }
        }
    }

    /// A client for the current engine, waiting briefly while it starts.
    pub async fn client(&self) -> Result<Client, String> {
        let deadline = std::time::Instant::now() + Duration::from_secs(60);
        while self.restarting.load(Ordering::SeqCst) || (self.restart_pending.load(Ordering::SeqCst) && self.reducer.lock().unwrap().busy().is_empty()) {
            if std::time::Instant::now() >= deadline { return Err("The engine is still restarting. Your message was not sent; retry shortly.".into()); }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        let conn = self.supervisor.connection(Duration::from_secs(60)).await?;
        Ok(Client::new(conn))
    }

    pub(crate) fn perform(self: &Arc<Self>, effects: Vec<Effect>) {
        for effect in effects {
            match effect {
                Effect::ShellOutput {engine_id, app_id, tool_id, shell_id} => {
                    if !self.shell_watchers.lock().unwrap().insert(shell_id.clone()) { continue; }
                    let engine = self.clone();
                    tauri::async_runtime::spawn(async move {
                        let mut cursor = 0u64;
                        if let Some(conn) = engine.supervisor.current() {
                            let client = Client::new(conn);
                            loop {
                                let open = engine.reducer.lock().unwrap().tool_open(&engine_id, &tool_id);
                                if !open { break; }
                                let folder = engine.reducer.lock().unwrap().session(&engine_id).and_then(|s|s.working_dir.clone()).unwrap_or_default();
                                let folder = percent_encoding::utf8_percent_encode(&folder, percent_encoding::NON_ALPHANUMERIC);
                                let path = format!("/api/shell/{shell_id}/output?cursor={cursor}&limit=65536&location%5Bdirectory%5D={folder}");
                                let value = match client.get(&path).await {Ok(v)=>v,Err(e)=>{warn!("Cannot read shell progress: {e}");break;}};
                                if !engine.reducer.lock().unwrap().tool_open(&engine_id, &tool_id) {break;}
                                let data = &value["data"];
                                if let Some(output) = data["output"].as_str().filter(|s| !s.is_empty()) {
                                    engine.perform(vec![Effect::Emit("agent:tool-progress", serde_json::json!({"sessionId":app_id,"data":{"ToolProgress":{"id":tool_id,"output":output}}}))]);
                                }
                                cursor = data["cursor"].as_u64().unwrap_or(cursor);
                                tokio::time::sleep(Duration::from_millis(200)).await;
                            }
                        }
                        engine.shell_watchers.lock().unwrap().remove(&shell_id);
                    });
                }
                Effect::Emit(name, payload) => {
                    if name == "agent:error" {
                        if let Some(id) = payload["sessionId"].as_str() { inbox::park(id); }
                    }
                    if name == "agent:done" {
                        self.restart_if_idle();
                        // The finished turn's messages become searchable.
                        if let Some(app_id) = payload["sessionId"].as_str() {
                            tauri::async_runtime::spawn(commands::index_task_messages(app_id.to_string()));
                            inbox::complete(app_id.to_string(), true);
                        }
                    }
                    if let Err(e) = self.app.emit(name, payload) {
                        warn!("Could not emit {name}: {e}");
                    }
                }
                Effect::Reply { engine_session_id, request_id, decision, message } => {
                    let engine = self.clone();
                    tauri::async_runtime::spawn(async move {
                        let Some(conn) = engine.supervisor.current() else { return };
                        let client = Client::new(conn);
                        let (decision, message) = engine.ready_to_allow(&client, &engine_session_id, decision, message).await;
                        if let Err(e) = client.reply_permission(&engine_session_id, &request_id, decision, message.as_deref()).await {
                            warn!("Automatic permission reply failed: {e}");
                        }
                    });
                }
                Effect::Connector(change) => crate::connectors::after_agent_command(change),
                Effect::Helper { child, parent } => {
                    info!("[{parent}] Helper {child} started");
                    let engine = self.clone();
                    tauri::async_runtime::spawn(async move {
                        let Some(conn) = engine.supervisor.current() else { return };
                        if let Err(e) = engine.ensure_environment(&Client::new(conn), &child).await {
                            warn!("[{parent}] {e}");
                        }
                    });
                }
                Effect::HelperUsage { parent } => {
                    tauri::async_runtime::spawn(commands::record_helper_usage(parent));
                }
            }
        }
    }

    /// One consumer of `/api/event` for the app's lifetime. The stream is live
    /// only: after any reconnect, state is reloaded and reconciled by ID.
    async fn consume_events(self: Arc<Self>) {
        let mut connections = self.supervisor.subscribe();
        let mut last_generation = 0u64;
        loop {
            let conn = connections.borrow_and_update().clone();
            let Some(conn) = conn else {
                if connections.changed().await.is_err() {
                    return;
                }
                continue;
            };
            let client = Client::new(conn.clone());
            if conn.generation != last_generation && last_generation != 0 {
                // A new engine process: turns of the old one cannot finish.
                self.end_busy_turns(Some("The agent restarted and this turn stopped. Send your message again to continue.".into()));
            }
            last_generation = conn.generation;
            match client.events().await {
                Ok(response) => {
                    self.reconcile(&client).await;
                    let mut stream = response.bytes_stream();
                    let mut buffer = String::new();
                    let mut data = String::new();
                    loop {
                        tokio::select! {
                            chunk = stream.next() => {
                                let Some(Ok(bytes)) = chunk else { break };
                                buffer.push_str(&String::from_utf8_lossy(&bytes));
                                while let Some(pos) = buffer.find('\n') {
                                    let line = buffer[..pos].trim_end_matches('\r').to_string();
                                    buffer.drain(..=pos);
                                    if let Some(rest) = line.strip_prefix("data:") {
                                        data.push_str(rest.trim_start());
                                    } else if line.is_empty() && !data.is_empty() {
                                        match serde_json::from_str::<Value>(&data) {
                                            Ok(event) => self.on_event(&event),
                                            Err(e) => debug!("Unparsable engine event: {e}"),
                                        }
                                        data.clear();
                                    }
                                }
                            }
                            changed = connections.changed() => {
                                if changed.is_err() { return; }
                                break;
                            }
                        }
                    }
                    let busy = self.reducer.lock().unwrap().busy();
                    self.end_busy_turns(Some("Vibework lost its connection to the agent and this turn stopped. Send a message to continue.".into()));
                    for id in &busy { let _ = client.interrupt(id).await; }
                    debug!("Engine event stream ended; reconnecting");
                }
                Err(e) => debug!("{e}"),
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
    }

    fn on_event(self: &Arc<Self>, event: &Value) {
        crate::connectors::on_engine_event(event);
        if event["type"] == "form.replied" {
            if let Some(session) = event["data"]["sessionID"].as_str() {
                let mut pending = forms::pending(session);
                pending.retain(|f| f["id"] != event["data"]["id"]);
                let _ = forms::save(session, &pending);
            }
        }
        if event["type"] == "form.created" {
            let form = &event["data"]["form"];
            if let Some(session) = form["sessionID"].as_str() {
                let mut pending = forms::pending(session);
                if !pending.iter().any(|f| f["id"] == form["id"]) { pending.push(form.clone()); }
                if let Err(e) = forms::save(session, &pending) { warn!("Could not save pending question: {e}"); }
                let app = self.reducer.lock().unwrap().session(session).map(|s| s.app_id.clone());
                if let (Some(app), Some(first)) = (app, pending.first()) { self.perform(forms::show(&app, first)); }
            }
        }
        let effects = self.reducer.lock().unwrap().apply(event);
        self.perform(effects);
    }

    fn end_busy_turns(self: &Arc<Self>, error: Option<String>) {
        let (effects, cut) = {
            let mut reducer = self.reducer.lock().unwrap();
            let busy = reducer.busy();
            // The engine went away mid-turn: keep the text it had streamed in
            // its unsaved step, and why the turn stopped, for the history.
            let mut cut = Vec::new();
            if let Some(reason) = &error {
                let now = chrono::Utc::now().timestamp_millis() as f64;
                for id in &busy {
                    if let Some((_, text)) = reducer.unsaved_text(id) {
                        interrupted::record(id, now, text, reason.clone());
                        cut.push(id.clone());
                    }
                }
            }
            (busy.iter().flat_map(|id| reducer.end_turn(id, error.clone())).collect::<Vec<_>>(), cut)
        };
        self.perform(effects);
        for id in cut {
            tauri::async_runtime::spawn(commands::save_interrupted(id));
        }
    }

    /// After (re)connecting: finish turns that ended while we were not
    /// listening and surface permission requests we have not seen.
    async fn reconcile(self: &Arc<Self>, client: &Client) {
        let active = client.active_sessions().await.unwrap_or_default();
        let finished: Vec<String> = {
            let reducer = self.reducer.lock().unwrap();
            reducer.busy().into_iter().filter(|id| !active.contains(id)).collect()
        };
        for id in finished {
            let effects = self.reducer.lock().unwrap().end_turn(&id, None);
            self.perform(effects);
        }
        let directories = self.reducer.lock().unwrap().working_dirs();
        for directory in directories {
            if let Ok(pending) = client.pending_permissions(&directory).await {
                for request in pending {
                    let effects = self.reducer.lock().unwrap().recover_request(&request);
                    self.perform(effects);
                }
            }
        }
    }
}
