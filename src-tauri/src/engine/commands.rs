//! The task commands (`agent_*`, the names the UI has always used),
//! implemented on the OpenCode engine.

use serde_json::{json, Map, Value};
use tracing::{debug, info, warn};

use super::client::{engine_session_id, Client};
use std::sync::Arc;

use super::types::{MessageInfo, SessionInfo, UsageTotals};
use super::{get, history, prompt, OpenCode};

const ENGINE_TAG: &str = "opencode";

/// `metadata.vibework` of an engine session (app-owned fields).
fn app_meta(session: &Value) -> Map<String, Value> {
    session["metadata"]["vibework"].as_object().cloned().unwrap_or_default()
}

fn is_ours(session: &Value) -> bool {
    session["metadata"]["vibework"]["engine"] == ENGINE_TAG
}

fn app_session_id(session: &Value) -> String {
    app_meta(session)
        .get("appSessionId")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .unwrap_or_else(|| session["id"].as_str().unwrap_or_default().to_string())
}

pub(super) fn working_folder(session: &Value) -> Option<String> {
    app_meta(session)
        .get("workingFolder")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .or_else(|| session["location"]["directory"].as_str().map(str::to_string))
}

/// One engine session's own usage (the engine counts a helper's on the helper).
fn own_usage(session: &Value, calls: u64) -> UsageTotals {
    let tokens = &session["tokens"];
    let n = |v: &Value| v.as_u64().unwrap_or(0);
    let cache_read = n(&tokens["cache"]["read"]);
    UsageTotals {
        input_tokens: n(&tokens["input"]) + cache_read + n(&tokens["cache"]["write"]),
        cached_input_tokens: Some(cache_read),
        output_tokens: n(&tokens["output"]),
        reasoning_tokens: Some(n(&tokens["reasoning"])),
        cost_usd: session["cost"].as_f64(),
        calls,
    }
}

/// What the task's helpers used, as recorded when their turns ended.
fn helper_usage(session: &Value) -> Option<UsageTotals> {
    app_meta(session).get("helperUsage").cloned().and_then(|v| serde_json::from_value(v).ok())
}

/// A task's usage: its own and its helpers'.
fn session_usage(session: &Value, calls: u64) -> UsageTotals {
    let mut usage = own_usage(session, calls);
    if let Some(helpers) = helper_usage(session) {
        usage.add(&helpers);
    }
    usage
}

/// Record what a task's helpers used on the task (after a turn that
/// started helpers), so its cost and usage include them after a relaunch.
pub async fn record_helper_usage(engine_id: String) {
    let result: Result<(), String> = async {
        let engine = get()?;
        let client = engine.client().await?;
        let mut total = UsageTotals::default();
        for child in client.children(&engine_id).await? {
            let calls = match child["id"].as_str() {
                Some(id) => client.messages(id).await.map(|m| history::count_calls(&m)).unwrap_or(0),
                None => 0,
            };
            total.add(&own_usage(&child, calls));
        }
        let session = client.session(&engine_id).await?;
        engine.update_app_meta(&client, &engine_id, &session, json!({ "helperUsage": total })).await
    }
    .await;
    if let Err(e) = result {
        warn!("[{engine_id}] Could not record what its helpers used: {e}");
    }
}

fn session_info(session: &Value) -> SessionInfo {
    let meta = app_meta(session);
    let text = |key: &str| meta.get(key).and_then(|v| v.as_str()).map(str::to_string);
    let conversation_name = text("conversationName").or_else(|| session["title"].as_str().map(str::to_string));
    SessionInfo {
        session_id: app_session_id(session),
        name: text("name").unwrap_or_else(|| "New task".into()),
        description: text("description").unwrap_or_default(),
        agent_type: "assistant".into(),
        created_at: history::iso(session["time"]["created"].as_f64()),
        updated_at: history::iso(session["time"]["updated"].as_f64().or(session["time"]["created"].as_f64())),
        conversation_name,
        settled_at: text("settledAt"),
        cost_usd: session_usage(session, 0).cost_usd,
        working_folder: chosen_folder(session, &expand_home(&crate::config::get_default_working_directory())),
    }
}

/// The folder the user chose for the task. Tasks started without one work in
/// the default folder and report none. Tasks from before `folderChosen` was
/// recorded count as chosen unless they sit in the default folder.
fn chosen_folder(session: &Value, default_folder: &str) -> Option<String> {
    let folder = app_meta(session).get("workingFolder").and_then(|v| v.as_str()).map(str::to_string)?;
    match app_meta(session).get("folderChosen").and_then(|v| v.as_bool()) {
        Some(true) => Some(folder),
        Some(false) => None,
        None => {
            let trim = |p: &str| p.trim_end_matches('/').to_string();
            (trim(&folder) != trim(default_folder)).then_some(folder)
        }
    }
}

fn expand_home(path: &str) -> String {
    match (path.strip_prefix("~/"), dirs::home_dir()) {
        (Some(rest), Some(home)) => home.join(rest).to_string_lossy().to_string(),
        _ => path.to_string(),
    }
}

impl OpenCode {
    pub(super) async fn load(&self, app_id: &str) -> Result<(Client, String, Value), String> {
        let client = self.client().await?;
        let engine_id = engine_session_id(app_id);
        let session = client.session(&engine_id).await?;
        if !is_ours(&session) {
            return Err("This task belongs to another engine and cannot be opened here".into());
        }
        Ok((client, engine_id, session))
    }

    /// Change app-owned metadata fields (read, merge, write the whole object).
    async fn update_app_meta(&self, client: &Client, engine_id: &str, session: &Value, fields: Value) -> Result<(), String> {
        let mut metadata = session["metadata"].as_object().cloned().unwrap_or_default();
        let mut ours = app_meta(session);
        for (key, value) in fields.as_object().into_iter().flatten() {
            ours.insert(key.clone(), value.clone());
        }
        metadata.insert("vibework".into(), Value::Object(ours));
        client.update_metadata(engine_id, &Value::Object(metadata)).await
    }

    /// Before a task's next message: if its last reply was cut off by an
    /// engine crash or restart, give the model the text it had streamed (it
    /// is not in the engine's history), so "continue" continues. It goes as
    /// a synthetic message, which the conversation does not show. Never
    /// fails the send.
    async fn give_lost_reply(&self, client: &Client, engine_id: &str) {
        let result: Result<(), String> = async {
            let session = client.session(engine_id).await?;
            let last_prompt = client.last_prompt_at(engine_id).await?;
            let lost = super::interrupted::not_given(&app_meta(&session), engine_id, last_prompt);
            if lost.is_empty() { return Ok(()); }
            client.synthetic(engine_id, &super::interrupted::context_text(&lost), "interrupted-reply").await?;
            info!("[{engine_id}] Gave the model its interrupted reply ({} turn(s))", lost.len());
            let value = super::interrupted::given_value(&app_meta(&session), &lost);
            self.update_app_meta(client, engine_id, &session, json!({ "interruptedGiven": value })).await
        }.await;
        if let Err(e) = result { warn!("[{engine_id}] Could not give the model its interrupted reply: {e}"); }
    }

    /// Before a task's next message: record which connectors it works with
    /// now, and the timeline notes for what changed. The engine itself gives
    /// every folder the current connectors (no restart, no per-folder sync).
    /// Never fails the send: problems are logged.
    async fn update_connectors(&self, client: &Client, engine_id: &str, session: &Value) -> Vec<String> {
        crate::connectors::refresh_now().await;
        let desired = tauri::async_runtime::spawn_blocking(super::connectors::desired).await.unwrap_or_default();
        let names: Vec<String> = desired.keys().cloned().collect();
        super::tools::add_connector_names(&names);
        let now = chrono::Utc::now().timestamp_millis();
        let lapsed = super::connectors::lapsed();
        let Some((fields, notes)) = super::connectors::session_update(&app_meta(session), &desired, &lapsed, now) else {
            return Vec::new();
        };
        if let Err(e) = self.update_app_meta(client, engine_id, session, fields).await {
            warn!("Could not record the task's connectors: {e}");
        }
        notes
    }

    /// Route the session's events to the UI (the task counts as "running").
    pub(super) async fn attach(self: &Arc<Self>, client: &Client, engine_id: &str, session: &Value, calls: Option<u64>) {
        let calls = match calls {
            Some(calls) => calls,
            None => client.messages(engine_id).await.map(|m| history::count_calls(&m)).unwrap_or(0),
        };
        if let Err(e) = self.ensure_environment(client, engine_id).await {
            warn!("{e}");
        }
        let skip = app_meta(session).get("skipPermissions").and_then(|v| v.as_bool()).unwrap_or(false);
        let working_dir = session["location"]["directory"].as_str().map(str::to_string);
        self.reducer.lock().unwrap().track(engine_id, &app_session_id(session), working_dir, skip, session_usage(session, calls));
        self.reducer.lock().unwrap().set_mode(engine_id, session_mode(session));
        self.reducer.lock().unwrap().set_helper_usage(engine_id, helper_usage(session).unwrap_or_default());
        let rules = serde_json::from_value(app_meta(session).get("permissionRules").cloned().unwrap_or_else(|| json!([]))).unwrap_or_default();
        self.reducer.lock().unwrap().set_remembered(engine_id, rules);
        // Requests raised before this session was attached
        let directory = session["location"]["directory"].as_str().unwrap_or_default();
        if let Ok(pending) = client.pending_permissions(directory).await {
            for request in pending.iter().filter(|r| r["sessionID"] == engine_id) {
                let effects = self.reducer.lock().unwrap().recover_request(request);
                self.perform(effects);
            }
        }
    }
}

pub async fn create_session(
    app_id: String,
    name: String,
    working_folder: Option<String>,
    model: Option<String>,
    permission_mode: Option<String>,
) -> Result<(), String> {
    if model.as_deref().and_then(super::external::selected).is_some() { return super::external::create(app_id,name,working_folder,model.unwrap(),permission_mode).await; }
    create_opencode(app_id,name,working_folder,model,permission_mode).await
}

pub async fn create_opencode(app_id:String,name:String,working_folder:Option<String>,model:Option<String>,permission_mode:Option<String>)->Result<(),String> {

    let engine = get()?;
    let client = engine.client().await?;
    let working_folder_chosen = working_folder.is_some();
    let folder = working_folder.unwrap_or_else(|| expand_home(&crate::config::get_default_working_directory()));
    std::fs::create_dir_all(&folder).map_err(|e| format!("Cannot use the working folder {folder}: {e}"))?;
    // The engine resolves symlinks (/tmp → /private/tmp); keep the user's spelling in metadata.
    let directory = std::fs::canonicalize(&folder).map(|p| p.to_string_lossy().to_string()).unwrap_or_else(|_| folder.clone());
    let model_id = crate::models::resolve_model_id(model.as_deref());
    let mode = match permission_mode {Some(m)=>super::policy::Mode::parse(&m)?,None=>crate::config::get_default_permission_mode()};
    let skip = mode==super::policy::Mode::Skip;
    let engine_id = engine_session_id(&app_id);
    // The connectors this task starts with: later changes are noted in its timeline.
    let connectors: serde_json::Map<String, Value> = tauri::async_runtime::spawn_blocking(super::connectors::desired)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|(k, v)| (k, Value::String(v)))
        .collect();
    info!("[{app_id}] Creating OpenCode session {engine_id} with {model_id}");
    let session = client
        .create_session(&json!({
            "id": engine_id,
            "agent": prompt::AGENT_ID,
            "model": { "id": model_id, "providerID": "openrouter" },
            "location": { "directory": directory },
            "metadata": { "vibework": {
                "engine": ENGINE_TAG,
                "appSessionId": app_id,
                "name": name,
                "description": "AI assistant session",
                "workingFolder": folder,
                "folderChosen": working_folder_chosen,
                "skipPermissions": skip,
                "permissionMode": mode.name(),
                "connectors": connectors,
            } },
        }))
        .await?;
    engine.attach(&client, &engine_id, &session, Some(0)).await;
    Ok(())
}

/// Send the user's message. Returns the task's connector notes for this
/// message ("Connector added: …"), empty when its tools did not change.
pub async fn send_message(app_id: String, message: String) -> Result<Vec<String>, String> {
    let _update_guard = crate::updates::TASK_GATE.read().await;
    crate::updates::accepting_tasks()?;
    super::inbox::arm(&app_id);
    if super::external::exists(&app_id) { return super::external::switching::send(app_id,message).await; }
    send_opencode(app_id,message).await
}

pub async fn send_opencode(app_id:String,message:String)->Result<Vec<String>,String> {

    let engine = get()?;
    let (client, engine_id, session) = engine.load(&app_id).await?;
    if !engine.reducer.lock().unwrap().is_tracked(&engine_id) {
        engine.attach(&client, &engine_id, &session, None).await;
    }
    // Sending to a settled conversation brings it back to the active list
    if app_meta(&session).get("settledAt").is_some_and(|v| v.is_string()) {
        if let Err(e) = engine.update_app_meta(&client, &engine_id, &session, json!({ "settledAt": null })).await {
            warn!("[{app_id}] Could not un-settle on new message: {e}");
        }
    }
    // Fail closed: no prompt without the scrubbed command environment.
    engine.ensure_environment(&client, &engine_id).await?;
    let notes = engine.update_connectors(&client, &engine_id, &session).await;
    let folder = working_folder(&session).unwrap_or_default();
    let model = session["model"]["id"].as_str().unwrap_or(crate::models::DEFAULT_MODEL);
    let files = super::attachments::files(&message, &folder, model).await?;
    let skills = if super::skills::tagged_skills(&message).is_empty() {
        Vec::new()
    } else {
        let offered = tauri::async_runtime::spawn_blocking(crate::skills::available).await.unwrap_or_default();
        super::skills::requested_skills(&message, &offered)?
    };
    engine.give_lost_reply(&client, &engine_id).await;
    super::inbox::adopt_open(&app_id).await?;
    client.prompt_files(&engine_id, &message, &files, &skills).await?;
    Ok(notes)
}

pub async fn interrupt(app_id: String) -> Result<(), String> {
    super::inbox::park(&app_id);
    if super::external::switching::native_external(&app_id) { return super::external::stop(&app_id); }

    let engine = get()?;
    let client = engine.client().await?;
    crate::browser::agent::interrupt(&app_id);
    client.interrupt(&engine_session_id(&app_id)).await
}

pub async fn shutdown(app_id: String) -> Result<(), String> {
    if super::external::switching::native_external(&app_id) { return super::external::stop(&app_id); }

    let engine = get()?;
    let engine_id = engine_session_id(&app_id);
    let busy = engine.reducer.lock().unwrap().session(&engine_id).is_some_and(|s| s.busy);
    if busy {
        if let Ok(client) = engine.client().await {
            let _ = client.interrupt(&engine_id).await;
        }
    }
    engine.reducer.lock().unwrap().untrack(&engine_id);
    Ok(())
}

pub async fn permission_respond(app_id: String, request_id: Option<String>, allowed: bool, remember: bool) -> Result<(), String> {
    if super::external::switching::native_external(&app_id) { return super::external::respond(&app_id,request_id,allowed,remember); }

    let engine = get()?;
    let engine_id = engine_session_id(&app_id);
    let request_id = request_id
        .or_else(|| engine.reducer.lock().unwrap().shown_request(&engine_id))
        .ok_or("There is no permission request to answer")?;
    let (client, _, session) = engine.load(&app_id).await?;
    if remember {
        let rules = engine.reducer.lock().unwrap().remembered_answer(&engine_id, &request_id, allowed)
            .ok_or("This permission request is no longer shown")?;
        engine.update_app_meta(&client, &engine_id, &session, json!({"permissionRules": rules})).await?;
        engine.reducer.lock().unwrap().set_remembered(&engine_id, rules);
    }
    // A denial is the user's answer, not a failure: the step's row shows it
    // and the model is told; no error toast.
    let decision = super::permissions::reply_for(allowed, remember);
    info!("[{app_id}] Permission {request_id}: {decision}");
    let denied = (!allowed).then(|| engine.reducer.lock().unwrap().denial_message(&engine_id, &request_id));
    // A helper's request docks here but is answered on the helper's session.
    let asking = engine.reducer.lock().unwrap().request_session(&engine_id, &request_id).unwrap_or_else(|| engine_id.clone());
    let (decision, denied) = engine.ready_to_allow(&client, &asking, decision, denied).await;
    client.reply_permission(&asking, &request_id, decision, denied.as_deref()).await?;
    let (effects, waits) = {
        let mut reducer = engine.reducer.lock().unwrap();
        let effects = reducer.replied(&engine_id, &request_id);
        (effects, reducer.tool_waits(&engine_id))
    };
    engine.perform(effects);
    // How long steps waited for the user, so the history leaves it out of their time.
    if !waits.is_empty() {
        // Fresh: remembering the answer above may have changed the metadata.
        let session = client.session(&engine_id).await?;
        let mut saved = app_meta(&session).get("toolWaits").and_then(|v| v.as_object()).cloned().unwrap_or_default();
        for (id, ms) in waits { saved.insert(id, json!(ms)); }
        while saved.len() > 500 {
            let Some(first) = saved.keys().next().cloned() else { break };
            saved.remove(&first);
        }
        if let Err(e) = engine.update_app_meta(&client, &engine_id, &session, json!({ "toolWaits": saved })).await {
            warn!("[{app_id}] Could not record the approval wait: {e}");
        }
    }
    Ok(())
}

pub async fn list_sessions() -> Result<Vec<SessionInfo>, String> {
    let engine = get()?;
    let client = engine.client().await?;
    let mut sessions: Vec<SessionInfo> = client
        .list_sessions()
        .await?
        .iter()
        .filter(|s| is_ours(s) && s["parentID"].is_null() && !s["time"]["archived"].is_number())
        .map(session_info)
        .filter(|s|!super::external::exists(&s.session_id))
        .collect();
    sessions.extend(super::external::list());
    sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(sessions)
}

pub async fn load_session(app_id: String) -> Result<Vec<MessageInfo>, String> {
    if super::external::exists(&app_id) { return super::external::switching::history(&app_id).await; }
    load_opencode(app_id).await
}

pub async fn load_opencode(app_id:String)->Result<Vec<MessageInfo>,String> {

    let engine = get()?;
    let (client, engine_id, session) = engine.load(&app_id).await?;
    let messages = client.messages(&engine_id).await?;
    let directory = session["location"]["directory"].as_str().map(str::to_string);
    let extras = history_extras(&app_meta(&session), &engine_id);
    let mut infos = history::to_message_infos_with(&messages, directory.as_deref(), &extras);
    // Native histories retain the child id on the parent's tool metadata.
    // Read each child once, even when several calls continue the same helper.
    let mut children = std::collections::HashMap::new();
    for message in &messages {
        for part in message["content"].as_array().into_iter().flatten() {
            if part["name"] != "subagent" { continue; }
            let Some(child) = part["state"]["metadata"]["sessionID"].as_str() else { continue };
            if !children.contains_key(child) {
                if let Ok(history) = client.messages(child).await { children.insert(child.to_string(), history); }
            }
            let Some(history) = children.get(child) else { continue };
            let helper = history::helper_state(history, part["time"]["created"].as_f64().unwrap_or(0.0), part["time"]["completed"].as_f64().unwrap_or(f64::MAX), directory.as_deref());
            for info in &mut infos {
                for block in info.content.as_array_mut().into_iter().flatten() {
                    if block["type"] == "tool_use" && block["id"] == part["id"] { block["helper"] = helper.clone(); }
                }
            }
        }
    }
    Ok(history::with_notes(infos, &messages, &super::connectors::saved_notes(&app_meta(&session)), &extras))
}

/// What the app adds to a task's history: interrupted turns and answers
/// sent after a relaunch.
fn history_extras(meta: &Map<String, Value>, engine_id: &str) -> history::Extras {
    let tool_waits = meta.get("toolWaits").and_then(|v| v.as_object()).map(|m| m.iter().filter_map(|(k, v)| Some((k.clone(), v.as_u64()?))).collect()).unwrap_or_default();
    history::Extras { interrupted: super::interrupted::all(meta, engine_id), answers: super::forms::saved_answers(meta), tool_waits }
}

/// Before answers to a question from before a relaunch go back as a
/// message: remember them so the history shows the answered question.
pub(crate) async fn record_relaunch_answer(app_id: &str, text: &str, questions: Value, answers: Value) -> Result<(), String> {
    let engine = get()?;
    let (client, engine_id, session) = engine.load(app_id).await?;
    let mut list = app_meta(&session).get("relaunchAnswers").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    list.push(json!({ "text": text, "questions": questions, "answers": answers }));
    let skip = list.len().saturating_sub(50);
    engine.update_app_meta(&client, &engine_id, &session, json!({ "relaunchAnswers": list.into_iter().skip(skip).collect::<Vec<_>>() })).await
}

/// Write a task's interrupted turns (see `interrupted`) into its metadata
/// once the engine is back. Until then the history reads them from memory.
pub async fn save_interrupted(engine_id: String) {
    let Ok(engine) = get() else { return };
    let pending = super::interrupted::pending(&engine_id);
    if pending.is_empty() { return; }
    // The engine is usually still restarting: try again for a while.
    let mut last_error = String::new();
    for attempt in 0..20u64 {
        tokio::time::sleep(std::time::Duration::from_millis(500 + attempt * 500)).await;
        let result: Result<(), String> = async {
            let client = engine.client().await?;
            let session = client.session(&engine_id).await?;
            let value = super::interrupted::merged_value(&app_meta(&session), &pending);
            engine.update_app_meta(&client, &engine_id, &session, json!({ "interruptedTurns": value })).await
        }.await;
        match result {
            Ok(()) => {
                super::interrupted::forget(&engine_id, &pending);
                return;
            }
            Err(e) => last_error = e,
        }
    }
    warn!("Could not save the interrupted turn of {engine_id}: {last_error}");
}

pub async fn resume_session(app_id: String) -> Result<Vec<MessageInfo>, String> {
    if super::external::exists(&app_id) { if !super::external::switching::native_external(&app_id) { let engine=get()?;let (client,id,session)=engine.load(&app_id).await?;engine.attach(&client,&id,&session,None).await; } return super::external::switching::history(&app_id).await; }

    let engine = get()?;
    let (client, engine_id, session) = engine.load(&app_id).await?;
    let messages = client.messages(&engine_id).await?;
    if !engine.reducer.lock().unwrap().is_tracked(&engine_id) {
        engine.attach(&client, &engine_id, &session, Some(history::count_calls(&messages))).await;
    }
    if let Some(form) = super::forms::pending(&engine_id).first() { engine.perform(super::forms::show(&app_id, form)); }
    let directory = session["location"]["directory"].as_str().map(str::to_string);
    let extras = history_extras(&app_meta(&session), &engine_id);
    let infos = history::to_message_infos_with(&messages, directory.as_deref(), &extras);
    Ok(history::with_notes(infos, &messages, &super::connectors::saved_notes(&app_meta(&session)), &extras))
}

/// One task's messages into the search index (after a turn ends, or when
/// the task comes back from the trash). Never fails loudly.
pub async fn index_task_messages(app_id: String) {
    let result: Result<(), String> = async {
        let engine = get()?;
        let (client, engine_id, session) = engine.load(&app_id).await?;
        if session["time"]["archived"].is_number() { return Ok(()); }
        let messages = client.messages(&engine_id).await?;
        let hidden: Vec<String> = super::forms::saved_answers(&app_meta(&session)).into_iter().map(|a| a.text).collect();
        let entries = super::msg_index::entries(&messages, &hidden);
        let version = super::msg_index::version(&session);
        tauri::async_runtime::spawn_blocking(move || super::msg_index::replace_task(&app_id, &version, &entries))
            .await
            .map_err(|e| e.to_string())?
    }
    .await;
    if let Err(e) = result { debug!("Message search: could not index a task: {e}"); }
}

/// Bring the search index in line with the task list: tasks changed since
/// they were indexed are read again (one at a time, in the background),
/// tasks that are gone or in the trash are dropped.
pub async fn index_all_messages() {
    static RUNNING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    if RUNNING.swap(true, std::sync::atomic::Ordering::SeqCst) { return; }
    let result: Result<(usize, usize), String> = async {
        let engine = get()?;
        let client = engine.client().await?;
        let sessions: Vec<Value> = client.list_sessions().await?.into_iter()
            .filter(|s| is_ours(s) && s["parentID"].is_null() && !s["time"]["archived"].is_number())
            .collect();
        let indexed = tauri::async_runtime::spawn_blocking(super::msg_index::versions).await.map_err(|e| e.to_string())??;
        let live: std::collections::HashSet<String> = sessions.iter().map(app_session_id).collect();
        let mut removed = 0;
        for task in indexed.keys().filter(|t| !live.contains(*t)).cloned().collect::<Vec<_>>() {
            tauri::async_runtime::spawn_blocking(move || super::msg_index::remove_task(&task)).await.map_err(|e| e.to_string())??;
            removed += 1;
        }
        let mut read = 0;
        for session in &sessions {
            let app_id = app_session_id(session);
            if indexed.get(&app_id) == Some(&super::msg_index::version(session)) { continue; }
            index_task_messages(app_id).await;
            read += 1;
            // Leave room for the user's own requests to the engine
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
        Ok((read, removed))
    }
    .await;
    RUNNING.store(false, std::sync::atomic::Ordering::SeqCst);
    match result {
        Ok((read, removed)) if read + removed > 0 => info!("Message search: indexed {read} task(s), dropped {removed}"),
        Ok(_) => {}
        Err(e) => warn!("Message search: could not update the index: {e}"),
    }
}

/// Tasks whose messages match a query (see `msg_index::search`).
#[tauri::command]
pub async fn agent_search_messages(query: String) -> Result<Vec<super::msg_index::Hit>, String> {
    if query.chars().count() > 200 { return Ok(Vec::new()); }
    tauri::async_runtime::spawn_blocking(move || super::msg_index::search(&query, 50)).await.map_err(|e| e.to_string())?
}

/// Task IDs come from the UI; refuse anything that is not a plain name.
fn validate_id(id: &str) -> Result<(), String> {
    use std::path::{Component, Path};
    let mut parts = Path::new(id).components();
    if id.is_empty()
        || id.contains(['/', '\\'])
        || !matches!(parts.next(), Some(Component::Normal(_)))
        || parts.next().is_some()
    {
        return Err("Invalid session id".into());
    }
    Ok(())
}

/// Archive for seven days so the existing Undo action can restore history.
pub async fn delete_session(app: &tauri::AppHandle, app_id: String) -> Result<(), String> {
    if super::external::exists(&app_id) { return super::external::update(&app_id,|t|{t.deleted=true;t.deleted_at=Some(chrono::Utc::now().timestamp_millis());}); }

    validate_id(&app_id)?;
    let engine = get()?;
    let (client, engine_id, _) = engine.load(&app_id).await?;
    let _ = client.interrupt(&engine_id).await;
    engine.reducer.lock().unwrap().untrack(&engine_id);
    // Per-task cleanup: terminals, browser tab, artifacts.
    let part: String = app_id.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).take(52).collect();
    let prefix = format!("t-{part}");
    for terminal in crate::terminal::terminal_list().await? {
        if terminal.id == prefix || terminal.id.starts_with(&format!("{prefix}-")) {
            crate::terminal::terminal_close(terminal.id).await?;
        }
    }
    crate::browser::browser_close(app.clone(), format!("b-{part}")).await?;
    crate::artifacts::remove_owned_by_session(&app_id);
    crate::motion::close_session(&app_id);
    // Working files only: Undo restores the conversation, not these.
    super::scratch::remove(&engine_id);
    // Its messages leave the search index with it (Undo indexes them again).
    let task = app_id.clone();
    if let Err(e) = tauri::async_runtime::spawn_blocking(move || super::msg_index::remove_task(&task)).await.unwrap_or_else(|e| Err(e.to_string())) {
        warn!("[{app_id}] Could not remove the task from message search: {e}");
    }
    client.patch(&format!("/api/session/{engine_id}"), &json!({"archived":true})).await.map(|_| ())
}

const RETENTION_MS: i64 = 7 * 24 * 60 * 60 * 1000;

fn expired(session: &Value, now: i64) -> bool {
    session["time"]["archived"].as_i64().is_some_and(|t| now.saturating_sub(t) >= RETENTION_MS)
}

pub async fn restore_session(app_id: String) -> Result<SessionInfo, String> {
    if super::external::exists(&app_id) { if super::external::trash_expired(&super::external::read(&app_id)?,chrono::Utc::now().timestamp_millis()){return Err("This task’s seven-day undo period has expired".into());} super::external::update(&app_id,|t|{t.deleted=false;t.deleted_at=None;})?; return Ok(super::external::info(super::external::read(&app_id)?)); }

    let engine = get()?;
    let (client, engine_id, session) = engine.load(&app_id).await?;
    if expired(&session, chrono::Utc::now().timestamp_millis()) {
        return Err("This task's seven-day undo period has expired".into());
    }
    client.patch(&format!("/api/session/{engine_id}"), &json!({"archived":false})).await?;
    tauri::async_runtime::spawn(index_task_messages(app_id.clone()));
    Ok(session_info(&client.session(&engine_id).await?))
}

pub async fn purge_deleted_sessions() -> Result<usize, String> {
    let engine = get()?;
    let client = engine.client().await?;
    let now = chrono::Utc::now().timestamp_millis();
    let mut count = super::external::purge_deleted(now,&client).await?;
    for session in client.list_sessions().await? {
        if is_ours(&session) && expired(&session, now) {
            if let Some(id) = session["id"].as_str() {
                client.delete_session(id).await?;
                super::forms::forget(id);
                super::scratch::remove(id);
                let task = app_session_id(&session);
                let _ = tauri::async_runtime::spawn_blocking(move || super::msg_index::remove_task(&task)).await;
                count += 1;
            }
        }
    }
    Ok(count)
}

pub fn is_running(app_id: &str) -> bool {
    if super::external::switching::native_external(app_id) {return super::external::running(app_id);}

    get().map(|e| e.reducer.lock().unwrap().is_tracked(&engine_session_id(app_id))).unwrap_or(false)
}

pub fn list_running() -> Vec<String> {
    { let mut ids=get().map(|e| e.reducer.lock().unwrap().app_ids()).unwrap_or_default();ids.extend(super::external::running_ids());ids }
}

pub async fn rename_session(app_id: String, new_name: String) -> Result<(), String> {
    if super::external::exists(&app_id) { return super::external::update(&app_id,|t|t.name=new_name); }

    let engine = get()?;
    let (client, engine_id, session) = engine.load(&app_id).await?;
    engine.update_app_meta(&client, &engine_id, &session, json!({ "conversationName": new_name })).await
}

pub async fn set_settled(app_id: String, settled: bool) -> Result<Option<String>, String> {
    if super::external::exists(&app_id) { let at=settled.then(||chrono::Utc::now().to_rfc3339());super::external::update(&app_id,|t|t.settled=at.clone())?;return Ok(at); }

    let engine = get()?;
    let (client, engine_id, session) = engine.load(&app_id).await?;
    let settled_at = settled.then(|| chrono::Utc::now().to_rfc3339());
    engine.update_app_meta(&client, &engine_id, &session, json!({ "settledAt": settled_at })).await?;
    Ok(settled_at)
}

pub async fn set_working_folder(app_id: String, folder: String) -> Result<(), String> {
    if super::external::exists(&app_id) { return super::external::update(&app_id,|t|t.folder=folder); }

    let engine = get()?;
    let (client, engine_id, session) = engine.load(&app_id).await?;
    std::fs::create_dir_all(&folder).map_err(|e| format!("Cannot use the working folder {folder}: {e}"))?;
    let directory = std::fs::canonicalize(&folder).map(|p| p.to_string_lossy().to_string()).unwrap_or_else(|_| folder.clone());
    if session["location"]["directory"].as_str() != Some(directory.as_str()) {
        client.move_session(&engine_id, &directory).await?;
    }
    engine.update_app_meta(&client, &engine_id, &session, json!({ "workingFolder": folder, "folderChosen": true })).await?;
    engine.reducer.lock().unwrap().set_working_dir(&engine_id, directory);
    Ok(())
}

pub async fn get_working_folder(app_id: String) -> Result<Option<String>, String> {
    if super::external::exists(&app_id) { return Ok(Some(super::external::read(&app_id)?.folder)); }

    let engine = get()?;
    let (_, _, session) = engine.load(&app_id).await?;
    Ok(working_folder(&session))
}

pub async fn switch_model(app_id:String,model_id:String)->Result<(),String>{super::external::switching::choose(app_id,model_id).await}

pub async fn get_model(app_id: String) -> Result<String, String> {
    if super::external::exists(&app_id) { return Ok(super::external::read(&app_id)?.choice().key()); }

    let engine = get()?;
    let (_, _, session) = engine.load(&app_id).await?;
    Ok(crate::models::resolve_model_id(session["model"]["id"].as_str()))
}

pub async fn get_usage(app_id: String) -> Result<UsageTotals, String> {
    if super::external::switching::native_external(&app_id) { return Ok(UsageTotals::default()); }

    let engine = get()?;
    let (client, engine_id, session) = engine.load(&app_id).await?;
    let calls = client.messages(&engine_id).await.map(|m| history::count_calls(&m)).unwrap_or(0);
    Ok(session_usage(&session, calls))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn task_ids_are_plain_names() {
        assert!(validate_id("4f1c-uuid").is_ok());
        for bad in ["", ".", "..", "a/b", "a\\b", "/abs"] {
            assert!(validate_id(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn archive_expiry_boundary() {
        let session = json!({"time":{"archived":1000}});
        assert!(!expired(&session, 1000 + RETENTION_MS - 1));
        assert!(expired(&session, 1000 + RETENTION_MS));
        assert!(!expired(&json!({"time":{}}), i64::MAX));
        assert!(!expired(&session, 0));
    }

    #[test]
    fn session_info_prefers_app_fields() {
        let session = json!({
            "id": "ses_abc", "title": "Engine title", "cost": 0.01,
            "time": { "created": 1794500206153.0, "updated": 1794500211582.0 },
            "location": { "directory": "/private/tmp/w" },
            "metadata": { "vibework": { "engine": "opencode", "appSessionId": "a-b", "name": "Task", "workingFolder": "/tmp/w" } }
        });
        assert!(is_ours(&session));
        let info = session_info(&session);
        assert_eq!(info.session_id, "a-b");
        assert_eq!(info.conversation_name.as_deref(), Some("Engine title"));
        assert_eq!(working_folder(&session).as_deref(), Some("/tmp/w"));
        assert!(!is_ours(&json!({ "metadata": {} })));
    }

    #[test]
    fn chosen_folder_reports_only_folders_the_user_picked() {
        let with = |meta: Value| json!({ "metadata": { "vibework": meta } });
        let default = "/home/example/Desktop/vibework";
        assert_eq!(chosen_folder(&with(json!({"workingFolder": "/w", "folderChosen": true})), default).as_deref(), Some("/w"));
        assert_eq!(chosen_folder(&with(json!({"workingFolder": default, "folderChosen": false})), default), None);
        // Older tasks: the default folder means none was chosen
        assert_eq!(chosen_folder(&with(json!({"workingFolder": "/home/example/Desktop/vibework/"})), default), None);
        assert_eq!(chosen_folder(&with(json!({"workingFolder": "/w"})), default).as_deref(), Some("/w"));
        assert_eq!(chosen_folder(&with(json!({})), default), None);
    }
}

fn session_mode(session:&Value)->super::policy::Mode {
    let meta=app_meta(session);
    meta.get("permissionMode").and_then(Value::as_str).and_then(|m|super::policy::Mode::parse(m).ok()).unwrap_or_else(||if meta.get("skipPermissions").and_then(Value::as_bool)==Some(true){super::policy::Mode::Skip}else{super::policy::Mode::Auto})
}
pub async fn get_mode(app_id:String)->Result<super::policy::Mode,String>{
    if super::external::exists(&app_id) { return super::policy::Mode::parse(&super::external::read(&app_id)?.mode); }

    let engine=get()?;let (_,_,session)=engine.load(&app_id).await?;Ok(session_mode(&session))
}
pub async fn set_mode(app_id:String,mode:super::policy::Mode)->Result<(),String>{
 if super::external::exists(&app_id){super::external::update(&app_id,|t|t.mode=mode.name().into())?;if super::external::switching::native_external(&app_id){return Ok(())}}
 set_opencode_mode(app_id,mode).await
}
pub async fn set_opencode_mode(app_id:String,mode:super::policy::Mode)->Result<(),String>{
 let engine=get()?;let (client,id,session)=engine.load(&app_id).await?;
 engine.update_app_meta(&client,&id,&session,json!({"permissionMode":mode.name(),"skipPermissions":mode==super::policy::Mode::Skip})).await?;
 engine.reducer.lock().unwrap().set_mode(&id,mode);Ok(())
}

pub async fn migrate_open_task(app_id:&str)->Result<(),String>{
 let engine=get()?;let (_,native,session)=engine.load(app_id).await?;let info=session_info(&session);
 let messages:Vec<Value>=load_opencode(app_id.into()).await?.into_iter().map(|m|serde_json::to_value(m).unwrap()).collect();
 let task=migrated_open_task(app_id,native,&session,info,messages);super::external::save(&task)
}
fn migrated_open_task(app_id:&str,native:String,session:&Value,info:SessionInfo,messages:Vec<Value>)->super::external::Task {
 let mut task=super::external::Task{usage:vec![],inbox:vec![],id:app_id.into(),engine:super::external::Engine::OpenCode,name:info.conversation_name.unwrap_or(info.name),folder:working_folder(session).unwrap_or_default(),mode:session_mode(session).name().into(),native:Some(native),model:Some(crate::models::resolve_model_id(session["model"]["id"].as_str())),effort:None,natives:std::collections::HashMap::new(),pending:None,open_seen:messages.len(),open_start:None,open_note:None,created:info.created_at,updated:info.updated_at,settled:info.settled_at,deleted:false,deleted_at:None,messages};task.migrate();task
}

// ============================================================================
// Tauri commands
// ============================================================================

#[tauri::command]
pub async fn agent_create_session(
    session_id: String,
    name: String,
    working_folder: Option<String>,
    model: Option<String>,
    permission_mode: Option<String>,
) -> Result<(), String> {
    create_session(session_id, name, working_folder, model, permission_mode).await
}

#[tauri::command]
pub async fn agent_send_message(session_id: String, message: String) -> Result<Vec<String>, String> {
    send_message(session_id, message).await
}

#[tauri::command]
pub async fn agent_interrupt(session_id: String) -> Result<(), String> {
    interrupt(session_id).await
}

#[tauri::command]
pub async fn agent_shutdown(session_id: String) -> Result<(), String> {
    shutdown(session_id).await
}

#[tauri::command]
pub async fn agent_permission_respond(session_id: String, request_id: Option<String>, allowed: bool, remember: bool) -> Result<(), String> {
    permission_respond(session_id, request_id, allowed, remember).await
}

/// The permission request waiting for the user in this task, if any. The UI
/// asks after a page reload or when a task is opened again, since the event
/// that showed it may have gone to a page that no longer exists.
#[tauri::command]
pub async fn agent_pending_permission(session_id: String) -> Result<Option<Value>, String> {
    if super::external::switching::native_external(&session_id) {return Ok(super::external::pending(&session_id));}

    let engine = get()?;
    let (client, engine_id, session) = engine.load(&session_id).await?;
    let directory = session["location"]["directory"].as_str().unwrap_or_default();
    let pending = client.pending_permissions(directory).await?;
    let tracked = engine.reducer.lock().unwrap().is_tracked(&engine_id);
    if tracked {
        let effects = engine.reducer.lock().unwrap().reconcile(&engine_id, &pending);
        engine.perform(effects);
    } else if pending.iter().any(|r| r["sessionID"] == engine_id) {
        // Attaching admits the engine's pending requests for the session.
        engine.attach(&client, &engine_id, &session, None).await;
    }
    let shown = engine.reducer.lock().unwrap().pending_payload(&engine_id);
    Ok(shown)
}

/// Tasks waiting on the user: a permission request pending in the engine or
/// a question saved by the app. The UI loads these at startup (and after a
/// reload) so their rows and the waiting count show without opening them.
#[tauri::command]
pub async fn agent_waiting_sessions() -> Result<Vec<String>, String> {
    let engine = get()?;
    let client = engine.client().await?;
    let sessions: Vec<Value> = client.list_sessions().await?.into_iter()
        .filter(|s| is_ours(s) && s["parentID"].is_null() && !s["time"]["archived"].is_number())
        .collect();
    // One request per folder in use.
    let mut directories: Vec<&str> = sessions.iter().filter_map(|s| s["location"]["directory"].as_str()).collect();
    directories.sort_unstable();
    directories.dedup();
    let mut pending = Vec::new();
    for directory in directories {
        pending.extend(client.pending_permissions(directory).await.unwrap_or_default());
    }
    Ok(sessions.iter()
        .filter(|s| {
            let engine_id = s["id"].as_str().unwrap_or_default();
            pending.iter().any(|r| r["sessionID"] == engine_id) || !super::forms::pending(engine_id).is_empty()
        })
        .map(app_session_id)
        .chain(super::external::waiting())
        .collect())
}

#[tauri::command]
pub fn agent_pending_question(session_id: String) -> Option<Value> {
    if super::external::switching::native_external(&session_id) {return super::external::question(&session_id);}
    super::forms::pending(&engine_session_id(&session_id)).first().map(super::forms::payload)
}

#[tauri::command]
/// Returns true when the engine had restarted, so the answers went back as
/// a new message (the UI shows them as the answered question at once).
pub async fn agent_question_respond(session_id: String, request_id: String, answers: std::collections::HashMap<String, String>) -> Result<bool, String> {
    if super::external::switching::native_external(&session_id) {return super::external::answer(&session_id,&request_id,answers);}
    super::forms::answer(session_id, request_id, answers).await
}

#[tauri::command]
pub async fn agent_list_sessions() -> Result<Vec<SessionInfo>, String> {
    list_sessions().await
}

#[tauri::command]
pub async fn agent_load_session(session_id: String) -> Result<Vec<MessageInfo>, String> {
    let history = load_session(session_id.clone()).await?;
    if !super::external::switching::busy(&session_id) { super::inbox::complete(session_id, true); }
    Ok(history)
}

#[tauri::command]
pub async fn agent_resume_session(session_id: String) -> Result<Vec<MessageInfo>, String> {
    resume_session(session_id).await
}

#[tauri::command]
pub async fn agent_delete_session(app_handle: tauri::AppHandle, session_id: String) -> Result<(), String> {
    delete_session(&app_handle, session_id).await
}

/// Restore a deleted task without starting its turn.
#[tauri::command]
pub async fn agent_restore_session(session_id: String) -> Result<SessionInfo, String> {
    restore_session(session_id).await
}

#[tauri::command]
pub async fn agent_purge_deleted_sessions() -> Result<usize, String> {
    purge_deleted_sessions().await
}

#[tauri::command]
pub fn agent_is_running(session_id: String) -> bool {
    is_running(&session_id)
}

#[tauri::command]
pub fn agent_list_running() -> Vec<String> {
    list_running()
}

#[tauri::command]
pub async fn agent_rename_session(session_id: String, new_name: String) -> Result<(), String> {
    rename_session(session_id, new_name).await
}

/// Settle a conversation (move it to the Settled shelf) or un-settle it.
/// Returns the settled time, or null when un-settled.
#[tauri::command]
pub async fn agent_set_settled(session_id: String, settled: bool) -> Result<Option<String>, String> {
    set_settled(session_id, settled).await
}

#[tauri::command]
pub async fn agent_set_working_folder(session_id: String, folder_path: String) -> Result<(), String> {
    set_working_folder(session_id, folder_path).await
}

#[tauri::command]
pub async fn agent_get_working_folder(session_id: String) -> Result<Option<String>, String> {
    get_working_folder(session_id).await
}

/// Switch a task to another OpenRouter model id (applies to its next prompt).
#[tauri::command]
pub async fn agent_switch_model(model_id: String, session_id: String) -> Result<(), String> {
    let model_id = model_id.trim().to_string();
    if model_id.is_empty() {
        return Err("Model id cannot be empty.".to_string());
    }
    switch_model(session_id, model_id).await
}

/// The OpenRouter model id of a task (the default model if none is stored).
#[tauri::command]
pub async fn agent_get_model(session_id: String) -> Result<String, String> {
    get_model(session_id).await
}

#[tauri::command]
pub async fn agent_get_usage(session_id: String) -> Result<UsageTotals, String> {
    get_usage(session_id).await
}

/// The permission mode of a task, or the default for new tasks.
#[tauri::command]
pub async fn agent_get_permission_mode(session_id: Option<String>) -> Result<String, String> {
    let mode = match session_id {
        Some(id) => get_mode(id).await?,
        None => crate::config::get_default_permission_mode(),
    };
    Ok(mode.name().into())
}

#[tauri::command]
pub async fn agent_set_permission_mode(session_id: Option<String>, mode: String) -> Result<(), String> {
    let mode = super::policy::Mode::parse(&mode)?;
    match session_id {
        Some(id) => set_mode(id, mode).await,
        None => {
            crate::config::set_default_permission_mode(mode);
            Ok(())
        }
    }
}

#[cfg(test)]mod migration_tests {use super::*;
 #[test]fn opencode_migration_keeps_identity_history_folder_and_mode(){let session=json!({"id":"ses_old","model":{"id":"deepseek/test"},"location":{"directory":"/tmp/old"},"time":{"created":1000,"updated":2000},"metadata":{"vibework":{"engine":"opencode","appSessionId":"task-old","name":"Task","conversationName":"Old title","permissionMode":"ask","workingFolder":"/tmp/old","folderChosen":true,"settledAt":"yesterday"}}});let messages=vec![json!({"role":"user","content":[{"type":"text","text":"keep exactly"}],"notes":["old note"]})];let task=migrated_open_task("task-old","ses_old".into(),&session,session_info(&session),messages.clone());assert_eq!(task.id,"task-old");assert_eq!(task.folder,"/tmp/old");assert_eq!(task.name,"Old title");assert_eq!(task.mode,"ask");assert_eq!(task.settled.as_deref(),Some("yesterday"));assert_eq!(task.messages,messages);assert_eq!(task.open_seen,1);assert_eq!(task.natives["opencode"].id.as_deref(),Some("ses_old"));}
}
