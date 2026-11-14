//! Reduce the engine's live event stream (`/api/event`) into the Tauri events
//! and payloads the UI consumes today (`agent:text-delta`, `agent:tool-start`,
//! `agent:usage`, `agent:done`, ...).
//!
//! [`Reducer`] is pure (events in, effects out) so it can be tested against
//! captured streams. The runtime in `mod.rs` feeds it and performs the effects.

use std::collections::{HashMap, VecDeque};

use serde_json::{json, Value};
use super::types::UsageTotals;

use super::history::iso;
use super::permissions::{self, Decision, PermissionAsk, PolicyContext};
use super::tools;

/// Something the runtime must do after applying an event.
#[derive(Debug, Clone, PartialEq)]
pub enum Effect {
    /// Emit a Tauri event with this payload.
    Emit(&'static str, Value),
    ShellOutput { engine_id: String, app_id: String, tool_id: String, shell_id: String },
    /// Answer a permission request without asking the user.
    Reply { engine_session_id: String, request_id: String, decision: &'static str, message: Option<String> },
    /// A task's command added or removed a connector (`opencode mcp …`).
    Connector(crate::connectors::launcher::AgentCommand),
    /// A task started a helper (a child session): give its commands the
    /// task's environment and scratch folder before any of them runs.
    Helper { child: String, parent: String },
    /// A turn that used helpers ended: record what they cost on the task.
    HelperUsage { parent: String },
}

/// A helper the engine's subagent tool started for a tracked task: a child
/// session whose events show inside the parent's step, and whose permission
/// requests dock in the parent's conversation.
#[derive(Debug, Default)]
struct HelperTrack {
    /// The parent's engine session id.
    parent: String,
    /// The parent's subagent call this helper runs under.
    tool_id: Option<String>,
    /// What the helper was asked to do (the call's description).
    description: String,
    tool_names: HashMap<String, String>,
    /// The helper's own tool calls: engine name, input, started, waited ms.
    tools: HashMap<String, (String, Value, Option<f64>, f64)>,
    /// Requests waiting on the user: request id → (helper call id, asked at).
    waiting: HashMap<String, (String, f64)>,
    stream_deltas: HashMap<String, usize>,
}

#[derive(Debug, Clone)]
struct ToolTrack {
    engine_name: String,
    input: Value,
    started: Option<f64>,
    open: bool,
    timing_index: (usize, usize),
    /// Time spent waiting for the user's answer to its permission requests
    /// (the engine counts it in the step's time; the app does not).
    waited_ms: f64,
}

/// What the adapter tracks for one engine session.
#[derive(Debug, Default)]
pub struct SessionTrack {
    pub app_id: String,
    /// The engine session id this track follows.
    engine_id: String,
    pub working_dir: Option<String>,
    pub skip_permissions: bool,
    pub mode: super::policy::Mode,
    pub busy: bool,
    inbox: HashMap<String, Value>,
    turn_started: Option<f64>,
    tool_names: HashMap<String, String>,
    tools: HashMap<String, ToolTrack>,
    stream_started: HashMap<String, f64>,
    stream_deltas: HashMap<String, usize>,
    step: usize,
    block: usize,
    pending_call: Option<UsageTotals>,
    turn_usage: UsageTotals,
    session_usage: UsageTotals,
    queue: VecDeque<PermissionAsk>,
    shown: Option<String>,
    shown_ask: Option<PermissionAsk>,
    /// Requests shown in the current run of prompts (for "2 of 3").
    batch: usize,
    /// Permission requests waiting on the user: request id → (tool call id, when asked).
    waiting_since: HashMap<String, (String, f64)>,
    /// When the current turn waited for the user (approvals answered,
    /// questions asked): left out of "Worked for".
    turn_waits: Vec<(f64, f64)>,
    /// Reply text streamed in the current step. The engine saves a step's
    /// text when the step ends, so if it dies mid-step this is all that is
    /// left of it (see `interrupted`).
    unsaved_text: String,
    pub remembered: Vec<permissions::RememberedRule>,
    /// What the task's helpers used in this app run (the engine counts a
    /// helper's usage on its own session, not the parent's).
    helper_usage: UsageTotals,
    /// The current turn started a helper.
    turn_had_helpers: bool,
}

#[derive(Debug, Default)]
pub struct Reducer {
    sessions: HashMap<String, SessionTrack>,
    /// Helpers of tracked tasks, by their own engine session id.
    helpers: HashMap<String, HelperTrack>,
    seen: std::collections::HashSet<String>,
    seen_order: VecDeque<String>,
}

fn usage_from(data: &Value) -> UsageTotals {
    let tokens = &data["tokens"];
    let n = |v: &Value| v.as_u64().unwrap_or(0);
    let cache_read = n(&tokens["cache"]["read"]);
    let cache_write = n(&tokens["cache"]["write"]);
    UsageTotals {
        // The engine reports uncached input separately; the UI's inputTokens
        // includes cached input (as OpenRouter's prompt_tokens does).
        input_tokens: n(&tokens["input"]) + cache_read + cache_write,
        cached_input_tokens: Some(cache_read),
        output_tokens: n(&tokens["output"]),
        reasoning_tokens: Some(n(&tokens["reasoning"])),
        cost_usd: data["cost"].as_f64(),
        calls: 1,
    }
}

impl Reducer {
    pub fn remember_inbox(&mut self,id:&str,rows:&[Value]){if let Some(t)=self.sessions.get_mut(id){for row in rows {if let Some(key)=row["id"].as_str(){t.inbox.insert(key.into(),row.clone());}}}}
    /// Start routing events for an engine session to an app session.
    pub fn track(&mut self, engine_id: &str, app_id: &str, working_dir: Option<String>, skip_permissions: bool, session_usage: UsageTotals) {
        let track = self.sessions.entry(engine_id.to_string()).or_default();
        track.engine_id = engine_id.to_string();
        track.app_id = app_id.to_string();
        track.working_dir = working_dir;
        track.skip_permissions = skip_permissions;
        track.mode = if skip_permissions {super::policy::Mode::Skip} else {super::policy::Mode::Auto};
        if track.session_usage == UsageTotals::default() {
            track.session_usage = session_usage;
        }
    }

    pub fn untrack(&mut self, engine_id: &str) {
        self.sessions.remove(engine_id);
        self.helpers.retain(|_, h| h.parent != engine_id);
    }

    /// The task a helper works for (its parent's engine id), if `engine_id` is a helper.
    pub fn helper_parent(&self, engine_id: &str) -> Option<String> {
        self.helpers.get(engine_id).map(|h| h.parent.clone())
    }

    /// The session whose scratch folder and environment `engine_id` uses: a
    /// helper uses its task's.
    pub fn scratch_owner(&self, engine_id: &str) -> String {
        self.helper_parent(engine_id).unwrap_or_else(|| engine_id.to_string())
    }

    /// The engine session a shown or queued request belongs to (a helper's
    /// requests dock in its task's conversation but are answered on the helper).
    pub fn request_session(&self, engine_id: &str, request_id: &str) -> Option<String> {
        let track = self.sessions.get(engine_id)?;
        track.shown_ask.iter().chain(track.queue.iter()).find(|a| a.request_id == request_id).map(|a| a.engine_session_id.clone())
    }

    /// Register a helper of a tracked task (on `session.created`, or on the
    /// parent's subagent call when it continues an existing helper).
    fn add_helper(&mut self, child: &str, parent: &str, description: &str) -> Vec<Effect> {
        if child.is_empty() || !self.sessions.contains_key(parent) || self.helpers.contains_key(child) {
            return Vec::new();
        }
        self.helpers.insert(child.to_string(), HelperTrack { parent: parent.to_string(), description: description.to_string(), ..Default::default() });
        if let Some(track) = self.sessions.get_mut(parent) { track.turn_had_helpers = true; }
        vec![Effect::Helper { child: child.to_string(), parent: parent.to_string() }]
    }

    pub fn is_tracked(&self, engine_id: &str) -> bool {
        self.sessions.contains_key(engine_id)
    }

    pub fn app_ids(&self) -> Vec<String> {
        self.sessions.values().map(|s| s.app_id.clone()).collect()
    }

    pub fn session(&self, engine_id: &str) -> Option<&SessionTrack> {
        self.sessions.get(engine_id)
    }

    pub fn set_mode(&mut self, engine_id:&str, mode:super::policy::Mode) {
        if let Some(track)=self.sessions.get_mut(engine_id){track.mode=mode;track.skip_permissions=mode==super::policy::Mode::Skip;}
    }

    /// What the task's helpers used before this app run (recorded on the
    /// task); the engine's usage events count only the task's own calls.
    pub fn set_helper_usage(&mut self, engine_id: &str, usage: UsageTotals) {
        if let Some(track) = self.sessions.get_mut(engine_id) { track.helper_usage = usage; }
    }

    pub fn set_working_dir(&mut self, engine_id: &str, dir: String) {
        if let Some(track) = self.sessions.get_mut(engine_id) {
            track.working_dir = Some(dir);
        }
    }

    /// Busy engine sessions (a turn is running as far as the adapter knows).
    /// The working folders of tracked sessions, each once.
    pub fn working_dirs(&self) -> Vec<String> {
        let mut dirs: Vec<String> = self.sessions.values().filter_map(|s| s.working_dir.clone()).collect();
        dirs.sort_unstable();
        dirs.dedup();
        dirs
    }

    /// The folders of the tasks this app run has opened.
    pub fn folders(&self) -> Vec<String> {
        let mut out: Vec<String> = self.sessions.values().filter_map(|s| s.working_dir.clone()).collect();
        out.sort();
        out.dedup();
        out
    }

    pub fn busy(&self) -> Vec<String> {
        self.sessions.iter().filter(|(_, s)| s.busy).map(|(id, _)| id.clone()).collect()
    }

    /// What the model is told when the user denies `request_id`.
    pub fn denial_message(&self, engine_id: &str, request_id: &str) -> String {
        let ask = self.sessions.get(engine_id).and_then(|t| t.shown_ask.as_ref()).filter(|a| a.request_id == request_id);
        permissions::denial_message(ask)
    }

    /// The permission request currently shown for an engine session, if any.
    pub fn shown_request(&self, engine_id: &str) -> Option<String> {
        self.sessions.get(engine_id).and_then(|s| s.shown.clone())
    }

    pub fn set_remembered(&mut self, engine_id: &str, rules: Vec<permissions::RememberedRule>) {
        if let Some(track) = self.sessions.get_mut(engine_id) { track.remembered = rules; }
    }

    pub fn remembered_answer(&self, engine_id: &str, request_id: &str, allowed: bool) -> Option<Vec<permissions::RememberedRule>> {
        let track = self.sessions.get(engine_id)?;
        let ask = track.shown_ask.as_ref().filter(|a| a.request_id == request_id && track.shown.as_deref() == Some(request_id))?;
        let mut rules = track.remembered.clone();
        rules.push(permissions::RememberedRule::new(ask, track.working_dir.clone(), allowed));
        Some(rules)
    }

    pub fn tool_open(&self, session: &str, tool: &str) -> bool {
        self.sessions.get(session).and_then(|s| s.tools.get(tool)).is_some_and(|t| t.open)
    }

    /// Apply one engine event.
    pub fn apply(&mut self, event: &Value) -> Vec<Effect> {
        if let Some(id) = event["id"].as_str() {
            if !self.seen.insert(id.into()) { return Vec::new(); }
            self.seen_order.push_back(id.into());
            if self.seen_order.len() > 8192 { if let Some(old) = self.seen_order.pop_front() { self.seen.remove(&old); } }
        }
        let kind = event["type"].as_str().unwrap_or_default();
        let data = &event["data"];
        let created = event["created"].as_f64();
        let engine_id = data["sessionID"].as_str().unwrap_or_default().to_string();
        if !self.sessions.contains_key(&engine_id) {
            if self.helpers.contains_key(&engine_id) {
                return self.apply_helper(&engine_id, kind, data, created);
            }
            // A task's subagent call made a child session: a helper.
            if kind == "session.created" {
                if let Some(parent) = data["parentID"].as_str() {
                    return self.add_helper(&engine_id, parent, data["title"].as_str().unwrap_or_default());
                }
            }
            return Vec::new();
        }
        // The parent's subagent call names its helper (a continued helper
        // has no `session.created`).
        let mut linked = Vec::new();
        if kind == "session.tool.progress" {
            if let (Some(call), Some(child)) = (data["id"].as_str(), data["metadata"]["sessionID"].as_str()) {
                let description = self.sessions.get(&engine_id).and_then(|t| t.tools.get(call)).and_then(|t| t.input["description"].as_str().map(str::to_string)).unwrap_or_default();
                linked = self.add_helper(child, &engine_id, &description);
                if let Some(helper) = self.helpers.get_mut(child) {
                    if helper.parent == engine_id {
                        helper.tool_id = Some(call.to_string());
                        if !description.is_empty() { helper.description = description; }
                    }
                }
            }
        }
        let Some(track) = self.sessions.get_mut(&engine_id) else {
            return linked;
        };
        let app_id = track.app_id.clone();
        let emit = |name: &'static str, data: Value| Effect::Emit(name, json!({ "sessionId": app_id, "data": data }));
        let mut out = linked;
        let stream_key = || format!("{}:{}:{}", kind.split('.').nth(1).unwrap_or_default(), data["assistantMessageID"].as_str().unwrap_or_default(), data["ordinal"]);

        match kind {
            "session.inbox.enqueued" => {
                if let Some(id)=data["inboxID"].as_str(){let mut row=data["item"].clone();row["id"]=json!(id);track.inbox.insert(id.into(),row);}
                out.push(emit("agent:inbox",json!({})));
            }
            "session.inbox.delivered" => {
                if let Some(row)=data["inboxID"].as_str().and_then(|id|track.inbox.remove(id)) {
                    if row["type"]=="user" && row["payload"]["metadata"]["vibeworkInbox"]==true {out.push(emit("agent:user-message",json!({"UserMessage":{"id":row["id"],"text":row["payload"]["text"]}})));}
                }
                out.push(emit("agent:inbox",json!({})));
            }
            "session.inbox.cancelled"|"session.inbox.delivery.changed" => {out.push(emit("agent:inbox",json!({})));}
            "session.execution.started" => {
                track.busy = true;
                track.turn_started = created;
                track.turn_usage = UsageTotals::default();
                track.turn_waits.clear();
                track.tools.clear();
                track.tool_names.clear();
                track.stream_started.clear();
                track.stream_deltas.clear();
                out.push(emit("agent:state-change", json!({ "StateChange": "Processing" })));
            }
            "session.step.started" => {
                track.unsaved_text.clear();
                track.step += 1;
                track.block = 0;
                track.busy = true;
            }
            "session.reasoning.started" | "session.text.started" => {
                track.stream_started.insert(stream_key(), created.unwrap_or(0.0));
            }
            "session.reasoning.delta" | "session.text.delta" => {
                let delta = data["delta"].as_str().unwrap_or_default();
                if !delta.is_empty() {
                    *track.stream_deltas.entry(stream_key()).or_default() += 1;
                    let (name, chunk) = if kind == "session.reasoning.delta" {
                        ("agent:thinking-delta", json!({ "ThinkingDelta": delta }))
                    } else {
                        if track.stream_deltas.get(&stream_key()).copied() == Some(1) && !track.unsaved_text.is_empty() {
                            track.unsaved_text.push_str("\n\n");
                        }
                        track.unsaved_text.push_str(delta);
                        ("agent:text-delta", json!({ "TextDelta": delta }))
                    };
                    out.push(emit(name, chunk));
                }
            }
            "session.reasoning.ended" | "session.text.ended" => {
                let key = stream_key();
                let text = data["text"].as_str().unwrap_or_default();
                let reasoning = kind == "session.reasoning.ended";
                // A model that does not stream still produces a block.
                if track.stream_deltas.get(&key).copied().unwrap_or(0) == 0 && !text.is_empty() {
                    if !reasoning {
                        if !track.unsaved_text.is_empty() { track.unsaved_text.push_str("\n\n"); }
                        track.unsaved_text.push_str(text);
                    }
                    out.push(if reasoning {
                        emit("agent:thinking-delta", json!({ "ThinkingDelta": text }))
                    } else {
                        emit("agent:text-delta", json!({ "TextDelta": text }))
                    });
                }
                let started = track.stream_started.remove(&key);
                if reasoning {
                    out.push(emit("agent:thinking-complete", json!({ "ThinkingComplete": text })));
                    if !text.trim().is_empty() {
                        let timing = json!({
                            "kind": "thinking", "id": iso(started), "startedAt": iso(started),
                            "durationMs": started.zip(created).map(|(s, e)| (e - s).max(0.0) as u64),
                            "messageIndex": track.step, "blockIndex": track.block,
                        });
                        track.block += 1;
                        out.push(Effect::Emit("agent:timing", json!({ "sessionId": app_id, "timing": timing })));
                    }
                } else {
                    out.push(emit("agent:text-complete", json!({ "TextComplete": text })));
                    track.block += 1;
                }
            }
            "session.tool.input.started" => {
                if let (Some(id), Some(name)) = (data["id"].as_str(), data["name"].as_str()) {
                    track.tool_names.insert(id.to_string(), name.to_string());
                }
            }
            "session.tool.called" => {
                let id = data["id"].as_str().unwrap_or_default().to_string();
                let engine_name = track.tool_names.get(&id).cloned().unwrap_or_else(|| "tool".into());
                let input = data["input"].clone();
                let app_name = tools::app_tool_name(&engine_name);
                let app_input = tools::app_tool_input(&engine_name, &input, track.working_dir.as_deref());
                let timing_index = (track.step, track.block);
                track.block += 1;
                track.tools.insert(id.clone(), ToolTrack { engine_name, input, started: created, open: true, timing_index, waited_ms: 0.0 });
                out.push(emit("agent:tool-start", json!({ "ToolStart": { "id": id, "name": app_name, "input": app_input } })));
                let timing = json!({
                    "kind": "tool", "id": id, "startedAt": iso(created), "durationMs": null,
                    "messageIndex": timing_index.0, "blockIndex": timing_index.1,
                });
                out.push(Effect::Emit("agent:timing", json!({ "sessionId": app_id, "timing": timing })));
                out.push(emit("agent:state-change", json!({ "StateChange": { "ExecutingTool": { "tool_name": app_name, "tool_use_id": id } } })));
            }
            "session.tool.progress" => {
                if let (Some(id), Some(shell)) = (data["id"].as_str(), data["metadata"]["shellID"].as_str()) {
                    out.push(Effect::ShellOutput {engine_id:engine_id.clone(),app_id:app_id.clone(),tool_id:id.into(),shell_id:shell.into()});
                }
                if let (Some(id), Some(output)) = (data["id"].as_str(), data["metadata"]["output"].as_str()) {
                    if !output.is_empty() {
                        out.push(emit("agent:tool-progress", json!({ "ToolProgress": { "id": id, "output": output } })));
                    }
                }
            }
            "session.tool.success" | "session.tool.failed" => {
                let id = data["id"].as_str().unwrap_or_default().to_string();
                let failed = kind == "session.tool.failed";
                let text = if failed {
                    data["error"]["message"].as_str().unwrap_or("The tool failed").to_string()
                } else {
                    tools::content_text(&data["content"])
                };
                let is_helper = track.tools.get(&id).is_some_and(|t| t.engine_name == "subagent");
                let text = if is_helper { tools::helper_result(&text, failed) } else { text };
                if let Some(tool) = track.tools.get_mut(&id) {
                    if tool.open {
                        tool.open = false;
                        // A question's step is all waiting for the answer.
                        if tool.engine_name == "question" {
                            if let (Some(s), Some(e)) = (tool.started, created) { track.turn_waits.push((s, e)); }
                        }
                        // The step's own run time: waiting for the user's answer is not part of it.
                        let mut timing = json!({
                            "kind": "tool", "id": id, "startedAt": iso(tool.started),
                            "durationMs": tool.started.zip(created).map(|(s, e)| (e - s - tool.waited_ms).max(0.0) as u64),
                            "messageIndex": tool.timing_index.0, "blockIndex": tool.timing_index.1,
                        });
                        if tool.waited_ms > 0.0 { timing["waitMs"] = json!(tool.waited_ms as u64); }
                        out.push(emit("agent:tool-end", json!({ "ToolEnd": { "id": id, "result": tools::tool_result(text, failed) } })));
                        let app_name = tools::app_tool_name(&tool.engine_name);
                        if !failed && matches!(tool.engine_name.as_str(), "shell" | "bash") {
                            if let Some(change) = tool.input["command"].as_str().and_then(crate::connectors::launcher::agent_change) {
                                out.push(Effect::Connector(change));
                            }
                        }
                        if !failed && tools::produces_files(&app_name) {
                            out.push(Effect::Emit("gallery:changed", json!({ "sessionId": app_id })));
                        }
                        out.push(Effect::Emit("agent:timing", json!({ "sessionId": app_id, "timing": timing })));
                        out.push(emit("agent:state-change", json!({ "StateChange": "Processing" })));
                    }
                }
            }
            "session.step.ended" | "session.step.failed" => {
                if data.get("tokens").is_some() {
                    let call = usage_from(data);
                    track.turn_usage.add(&call);
                    track.session_usage.calls += 1;
                    track.pending_call = Some(call);
                }
            }
            "session.usage.updated" => {
                let mut session = usage_from(data);
                session.add(&track.helper_usage);
                session.calls = track.session_usage.calls;
                track.session_usage = session.clone();
                out.push(Effect::Emit(
                    "agent:usage",
                    json!({ "sessionId": app_id, "call": track.pending_call.take(), "turn": track.turn_usage, "session": session }),
                ));
            }
            "session.execution.succeeded" | "session.execution.interrupted" => {
                out.extend(Self::finish(track, None, created));
                // A helper runs within its task's turn.
                self.helpers.retain(|_, h| h.parent != engine_id);
            }
            "session.execution.failed" => {
                let message = data["error"]["message"].as_str().unwrap_or("The model request failed").to_string();
                out.extend(Self::finish(track, Some(message), created));
                self.helpers.retain(|_, h| h.parent != engine_id);
            }
            "permission.asked" => {
                if let (Some(request), Some(call)) = (data["id"].as_str(), data["source"]["id"].as_str()) {
                    let at = created.unwrap_or_else(|| chrono::Utc::now().timestamp_millis() as f64);
                    track.waiting_since.entry(request.to_string()).or_insert((call.to_string(), at));
                }
                let ask = PermissionAsk {
                    request_id: data["id"].as_str().unwrap_or_default().to_string(),
                    engine_session_id: engine_id.clone(),
                    action: data["action"].as_str().unwrap_or_default().to_string(),
                    resources: data["resources"]
                        .as_array()
                        .map(|r| r.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
                        .unwrap_or_default(),
                    metadata: data["metadata"].clone(),
                    tool: data["source"]["id"]
                        .as_str()
                        .and_then(|call| track.tools.get(call))
                        .map(|t| (t.engine_name.clone(), t.input.clone())),
                };
                out.extend(Self::admit(track, ask, &engine_id));
            }
            "permission.replied" => {
                let request_id = data["requestID"].as_str().unwrap_or_default();
                out.extend(Self::resolved(track, request_id));
            }
            // The engine titles a task early in its first turn; the sidebar
            // and title bar pick it up now rather than when the turn ends.
            "session.renamed" => {
                if let Some(title) = data["title"].as_str().filter(|t| !t.trim().is_empty()) {
                    out.push(emit("agent:session-renamed", json!({ "title": title })));
                }
            }
            _ => {}
        }
        out
    }

    /// Route a new request through the app's policy, then queue or show it.
    /// `scratch_owner` is the task whose scratch folder the request's session
    /// uses (a helper's request: its task's).
    fn admit(track: &mut SessionTrack, mut ask: PermissionAsk, scratch_owner: &str) -> Vec<Effect> {
        if ask.request_id.is_empty()
            || track.shown.as_deref() == Some(ask.request_id.as_str())
            || track.queue.iter().any(|a| a.request_id == ask.request_id)
        {
            return Vec::new();
        }
        let scratch = super::scratch::dir_string(scratch_owner);
        permissions::prepare(&mut ask, track.working_dir.as_deref(), scratch.as_deref());
        let ctx = PolicyContext { mode: track.mode, protected_folder: Some(crate::paths::get_app_data_dir().to_string_lossy().to_string()), working_folder: track.working_dir.clone(), working_folder_resolved: track.working_dir.as_deref().and_then(|d| std::fs::canonicalize(d).ok()).map(|p| p.to_string_lossy().to_string()), remembered: track.remembered.clone(), scratch_folder: scratch, home: std::env::var("HOME").ok(), resolve: Some(permissions::physical_paths) };
        match permissions::decide(&ask, &ctx) {
            Decision::Allow => vec![Effect::Reply { engine_session_id: ask.engine_session_id, request_id: ask.request_id, decision: "once", message: None }],
            // A refusal is an answer, not a failure of the turn: the step
            // shows it ("Couldn't run …" and the reason) and the agent goes
            // on. Sending it as a turn error raised a sticky error toast and
            // marked a still-running task as stopped.
            Decision::Reject(reason) => vec![
                Effect::Reply { engine_session_id: ask.engine_session_id, request_id: ask.request_id, decision: "reject", message: Some(reason) },
            ],
            Decision::Ask(reason) => {
                if !ask.metadata.is_object() { ask.metadata = json!({}); }
                ask.metadata["vibeworkAskReason"] = json!(reason);
                track.queue.push_back(ask);
                if track.shown.is_some() {
                    // The one on screen keeps its place; its count grows.
                    return Self::emit_shown(track);
                }
                Self::show_next(track)
            }
        }
    }

    /// The UI shows one request per session at a time; the rest wait in order.
    fn show_next(track: &mut SessionTrack) -> Vec<Effect> {
        if track.shown.is_some() {
            return Vec::new();
        }
        let Some(ask) = track.queue.pop_front() else { return Vec::new() };
        track.shown_ask = Some(ask.clone());
        track.shown = Some(ask.request_id.clone());
        track.batch += 1;
        let mut out = Self::emit_shown(track);
        out.push(Effect::Emit("agent:state-change", json!({ "sessionId": track.app_id, "data": { "StateChange": "WaitingForPermission" } })));
        out
    }

    /// The request on screen, with its place in the queue and why it asks.
    fn shown_payload(track: &SessionTrack) -> Option<Value> {
        let ask = track.shown_ask.as_ref().filter(|a| track.shown.as_deref() == Some(a.request_id.as_str()))?;
        let mut payload = permissions::ui_payload(ask, track.working_dir.as_deref());
        payload["position"] = json!(track.batch);
        payload["total"] = json!(track.batch + track.queue.len());
        payload["reason"] = ask.metadata.get("vibeworkAskReason").cloned().unwrap_or(Value::Null);
        // A helper's request says whose it is.
        if let Some(helper) = ask.metadata.get("vibeworkHelper").filter(|v| v.is_string()) {
            payload["helper"] = helper.clone();
        }
        Some(payload)
    }

    fn emit_shown(track: &SessionTrack) -> Vec<Effect> {
        let Some(payload) = Self::shown_payload(track) else { return Vec::new() };
        vec![Effect::Emit("agent:permission-request", json!({ "sessionId": track.app_id, "data": { "PermissionRequest": payload } }))]
    }

    /// The `PermissionRequest` payload on screen for a session (after a page
    /// reload or reopening a task, the UI asks for it again).
    pub fn pending_payload(&self, engine_id: &str) -> Option<Value> {
        self.sessions.get(engine_id).and_then(Self::shown_payload)
    }

    /// Reconcile with the engine's list of pending requests for one session:
    /// requests it no longer holds are dropped, requests the stream never
    /// delivered are admitted (duplicates are ignored).
    pub fn reconcile(&mut self, engine_id: &str, pending: &[Value]) -> Vec<Effect> {
        // The task's own requests and its helpers'.
        let ours = |r: &Value| r["sessionID"] == engine_id || r["sessionID"].as_str().and_then(|s| self.helpers.get(s)).is_some_and(|h| h.parent == engine_id);
        let pending: Vec<Value> = pending.iter().filter(|r| ours(r)).cloned().collect();
        let pending = pending.as_slice();
        let live: Vec<&str> = pending.iter().filter_map(|r| r["id"].as_str()).collect();
        let mut out = Vec::new();
        if let Some(track) = self.sessions.get_mut(engine_id) {
            // Queued ones first, so the shown one is replaced by a live request.
            let gone: Vec<String> = track.queue.iter().map(|a| a.request_id.clone())
                .chain(track.shown.iter().cloned())
                .filter(|id| !live.contains(&id.as_str()))
                .collect();
            for id in gone { out.extend(Self::resolved(track, &id)); }
        }
        for request in pending {
            out.extend(self.recover_request(request));
        }
        out
    }

    fn resolved(track: &mut SessionTrack, request_id: &str) -> Vec<Effect> {
        let mut out = Vec::new();
        if let Some((call, asked)) = track.waiting_since.remove(request_id) {
            let now = chrono::Utc::now().timestamp_millis() as f64;
            track.turn_waits.push((asked, now));
            if let Some(tool) = track.tools.get_mut(&call) {
                tool.waited_ms += (now - asked).max(0.0);
                // The running clock goes on from the step's own run time.
                if tool.open && tool.waited_ms >= 1000.0 {
                    let timing = json!({
                        "kind": "tool", "id": call, "startedAt": iso(tool.started.map(|s| s + tool.waited_ms)),
                        "durationMs": null, "waitMs": tool.waited_ms as u64,
                        "messageIndex": tool.timing_index.0, "blockIndex": tool.timing_index.1,
                    });
                    out.push(Effect::Emit("agent:timing", json!({ "sessionId": track.app_id, "timing": timing })));
                }
            }
        }
        out.extend(Self::resolved_queue(track, request_id));
        out
    }

    fn resolved_queue(track: &mut SessionTrack, request_id: &str) -> Vec<Effect> {
        track.queue.retain(|a| a.request_id != request_id);
        if track.shown.as_deref() == Some(request_id) {
            track.shown = None;
            let next = Self::show_next(track);
            if next.is_empty() { track.batch = 0; }
            if next.is_empty() && track.busy {
                // Answered and nothing else waiting: back to "Working".
                return vec![Effect::Emit(
                    "agent:state-change",
                    json!({ "sessionId": track.app_id, "data": { "StateChange": "Processing" } }),
                )];
            }
            return next;
        }
        Vec::new()
    }

    /// The app answered a request: forget it and show the next one, if any.
    pub fn replied(&mut self, engine_id: &str, request_id: &str) -> Vec<Effect> {
        match self.sessions.get_mut(engine_id) {
            Some(track) => Self::resolved(track, request_id),
            None => Vec::new(),
        }
    }

    /// A pending request found while reconciling after a reconnect.
    pub fn recover_request(&mut self, request: &Value) -> Vec<Effect> {
        let event = json!({ "type": "permission.asked", "data": request });
        self.apply(&event)
    }

    /// A running session's app id and the reply text of its current step
    /// that the engine has not saved yet.
    pub fn unsaved_text(&self, engine_id: &str) -> Option<(String, String)> {
        self.sessions.get(engine_id).filter(|t| t.busy).map(|t| (t.app_id.clone(), t.unsaved_text.clone()))
    }

    /// Time each of the session's steps spent waiting for the user's answer
    /// to a permission request, by tool call id (ms).
    pub fn tool_waits(&self, engine_id: &str) -> HashMap<String, u64> {
        self.sessions.get(engine_id).map(|t| t.tools.iter().filter(|(_, tool)| tool.waited_ms > 0.0).map(|(id, tool)| (id.clone(), tool.waited_ms as u64)).collect()).unwrap_or_default()
    }

    /// End a turn the stream will not finish (engine restarted or stream lost
    /// while the session went idle). `error` is shown when given.
    pub fn end_turn(&mut self, engine_id: &str, error: Option<String>) -> Vec<Effect> {
        let out = match self.sessions.get_mut(engine_id) {
            Some(track) if track.busy => Self::finish(track, error, Some(chrono::Utc::now().timestamp_millis() as f64)),
            _ => Vec::new(),
        };
        if !out.is_empty() { self.helpers.retain(|_, h| h.parent != engine_id); }
        out
    }

    /// One event of a helper, shown inside its task's subagent step. Its
    /// permission requests go through the task's policy and queue.
    fn apply_helper(&mut self, child: &str, kind: &str, data: &Value, created: Option<f64>) -> Vec<Effect> {
        let Some(helper) = self.helpers.get_mut(child) else { return Vec::new() };
        let Some(track) = self.sessions.get_mut(&helper.parent) else { return Vec::new() };
        let app_id = track.app_id.clone();
        let parent = helper.parent.clone();
        let tool_id = helper.tool_id.clone();
        let mut out = Vec::new();
        // A step inside the helper's row; nothing shows before the parent's
        // call names the helper (the engine does that before the helper runs).
        let show = |out: &mut Vec<Effect>, event: Value| {
            if let Some(tool_id) = &tool_id {
                let mut event = event;
                event["toolId"] = json!(tool_id);
                out.push(Effect::Emit("agent:helper", json!({ "sessionId": app_id, "data": { "Helper": event } })));
            }
        };
        let stream_key = format!("{}:{}", data["assistantMessageID"].as_str().unwrap_or_default(), data["ordinal"]);
        match kind {
            "session.tool.input.started" => {
                if let (Some(id), Some(name)) = (data["id"].as_str(), data["name"].as_str()) {
                    helper.tool_names.insert(id.to_string(), name.to_string());
                }
            }
            "session.tool.called" => {
                let id = data["id"].as_str().unwrap_or_default().to_string();
                let engine_name = helper.tool_names.get(&id).cloned().unwrap_or_else(|| "tool".into());
                let input = data["input"].clone();
                let step = json!({
                    "kind": "step", "id": id, "name": tools::app_tool_name(&engine_name),
                    "input": tools::app_tool_input(&engine_name, &input, track.working_dir.as_deref()),
                    "startedAt": iso(created),
                });
                helper.tools.insert(id, (engine_name, input, created, 0.0));
                show(&mut out, step);
            }
            "session.tool.success" | "session.tool.failed" => {
                let id = data["id"].as_str().unwrap_or_default().to_string();
                let failed = kind == "session.tool.failed";
                let text = if failed { data["error"]["message"].as_str().unwrap_or("The tool failed").to_string() } else { tools::content_text(&data["content"]) };
                let (started, waited) = helper.tools.get(&id).map(|t| (t.2, t.3)).unwrap_or((None, 0.0));
                let mut event = json!({
                    "kind": "step-end", "id": id, "result": tools::tool_result(text, failed),
                    "durationMs": started.zip(created).map(|(s, e)| (e - s - waited).max(0.0) as u64),
                });
                if waited > 0.0 { event["waitMs"] = json!(waited as u64); }
                show(&mut out, event);
                if !failed {
                    if let Some((name, input, _, _)) = helper.tools.get(&id) {
                        if matches!(name.as_str(), "shell" | "bash") {
                            if let Some(change) = input["command"].as_str().and_then(crate::connectors::launcher::agent_change) {
                                out.push(Effect::Connector(change));
                            }
                        }
                    }
                }
                if !failed && helper.tools.get(&id).is_some_and(|t| tools::produces_files(&tools::app_tool_name(&t.0))) {
                    out.push(Effect::Emit("gallery:changed", json!({ "sessionId": app_id })));
                }
            }
            "session.step.started" => show(&mut out, json!({ "kind": "step-started" })),
            "session.text.delta" => {
                let delta = data["delta"].as_str().unwrap_or_default();
                if !delta.is_empty() {
                    *helper.stream_deltas.entry(stream_key).or_default() += 1;
                    show(&mut out, json!({ "kind": "text", "delta": delta }));
                }
            }
            "session.text.ended" => {
                let text = data["text"].as_str().unwrap_or_default();
                if helper.stream_deltas.remove(&stream_key).unwrap_or(0) == 0 && !text.is_empty() {
                    show(&mut out, json!({ "kind": "text", "delta": text }));
                }
            }
            // A helper's model calls are the task's cost.
            "session.step.ended" | "session.step.failed" => {
                if data.get("tokens").is_some() {
                    let call = usage_from(data);
                    track.turn_usage.add(&call);
                    track.helper_usage.add(&call);
                    track.session_usage.add(&call);
                    out.push(Effect::Emit("agent:usage", json!({ "sessionId": app_id, "call": call, "turn": track.turn_usage, "session": track.session_usage })));
                }
            }
            "session.execution.succeeded" => show(&mut out, json!({ "kind": "end", "status": "done" })),
            "session.execution.interrupted" => show(&mut out, json!({ "kind": "end", "status": "stopped" })),
            "session.execution.failed" => {
                let error = data["error"]["message"].as_str().unwrap_or("The model request failed");
                show(&mut out, json!({ "kind": "end", "status": "failed", "error": error }));
            }
            "session.retry.scheduled" => {
                let error = data["error"]["message"].as_str().unwrap_or_default();
                show(&mut out, json!({ "kind": "retry", "attempt": data["attempt"], "error": error }));
            }
            "permission.asked" => {
                let request = data["id"].as_str().unwrap_or_default().to_string();
                let call = data["source"]["id"].as_str().map(str::to_string);
                let at = created.unwrap_or_else(|| chrono::Utc::now().timestamp_millis() as f64);
                if let Some(call) = &call {
                    helper.waiting.entry(request.clone()).or_insert((call.clone(), at));
                }
                // The task's helper step waits for the answer: its clock and
                // the turn's "Worked for" leave the wait out.
                if let Some(tool_id) = &tool_id {
                    track.waiting_since.entry(request.clone()).or_insert((tool_id.clone(), at));
                }
                let mut metadata = data["metadata"].clone();
                if !metadata.is_object() { metadata = json!({}); }
                metadata["vibeworkHelper"] = json!(helper.description);
                let ask = PermissionAsk {
                    request_id: request,
                    engine_session_id: child.to_string(),
                    action: data["action"].as_str().unwrap_or_default().to_string(),
                    resources: data["resources"].as_array().map(|r| r.iter().filter_map(|v| v.as_str().map(str::to_string)).collect()).unwrap_or_default(),
                    metadata,
                    tool: call.as_deref().and_then(|c| helper.tools.get(c)).map(|t| (t.0.clone(), t.1.clone())),
                };
                out.extend(Self::admit(track, ask, &parent));
            }
            "permission.replied" => {
                let request = data["requestID"].as_str().unwrap_or_default();
                if let Some((call, asked)) = helper.waiting.remove(request) {
                    let now = chrono::Utc::now().timestamp_millis() as f64;
                    if let Some(tool) = helper.tools.get_mut(&call) { tool.3 += (now - asked).max(0.0); }
                }
                out.extend(Self::resolved(track, request));
            }
            _ => {}
        }
        out
    }

    /// Done/Error belong to the end of the execution, not to step ends.
    fn finish(track: &mut SessionTrack, error: Option<String>, ended: Option<f64>) -> Vec<Effect> {
        let app_id = track.app_id.clone();
        let emit = |name: &'static str, data: Value| Effect::Emit(name, json!({ "sessionId": app_id, "data": data }));
        let mut out = Vec::new();
        // Tools that never finished (interrupted) must not spin forever.
        let mut open: Vec<_> = track.tools.iter_mut().filter(|(_, t)| t.open).collect();
        open.sort_by(|a, b| a.1.timing_index.cmp(&b.1.timing_index));
        for (id, tool) in open {
            tool.open = false;
            out.push(emit("agent:tool-end", json!({ "ToolEnd": { "id": id, "result": tools::tool_result("Stopped before it finished".into(), true) } })));
        }
        if let Some(message) = error {
            out.push(emit("agent:error", json!({ "Error": message })));
        }
        if let Some(started) = track.turn_started.take() {
            // "Worked for" is the agent's own time: waits for the user are left out.
            let end = ended.unwrap_or(started);
            let mut waits: Vec<(f64, f64)> = track.turn_waits.drain(..).map(|(a, b)| (a.max(started), b.min(end))).collect();
            // A request still waiting when the turn ended waited until then.
            waits.extend(track.waiting_since.values().map(|(_, asked)| (asked.max(started), end)));
            let waited = super::history::union_ms(waits);
            let mut timing = json!({
                "kind": "turn", "id": iso(Some(started)), "startedAt": iso(Some(started)),
                "durationMs": ended.map(|e| (e - started - waited).max(0.0) as u64),
                "messageIndex": 0, "blockIndex": null,
            });
            if waited >= 1.0 { timing["waitMs"] = json!(waited as u64); }
            out.push(Effect::Emit("agent:timing", json!({ "sessionId": app_id, "timing": timing })));
        }
        // The composer shows "Working" until the state leaves Processing.
        out.push(emit("agent:state-change", json!({ "StateChange": "Idle" })));
        track.busy = false;
        track.unsaved_text.clear();
        track.waiting_since.clear();
        track.queue.clear();
        track.shown = None;
        track.batch = 0;
        track.step = 0;
        track.block = 0;
        track.pending_call = None;
        if std::mem::take(&mut track.turn_had_helpers) {
            out.push(Effect::HelperUsage { parent: track.engine_id.clone() });
        }
        out.push(Effect::Emit("agent:done", json!({ "sessionId": app_id, "data": "Done" })));
        out.push(Effect::Emit("gallery:changed", json!({ "sessionId": app_id })));
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(events: &[Value], skip: bool) -> Vec<Effect> {
        let mut reducer = Reducer::default();
        let engine_id = events.iter().find_map(|e| e["data"]["sessionID"].as_str()).unwrap().to_string();
        reducer.track(&engine_id, "app-1", Some("/work".into()), skip, UsageTotals::default());
        events.iter().flat_map(|e| reducer.apply(e)).collect()
    }

    fn names(effects: &[Effect]) -> Vec<&'static str> {
        effects
            .iter()
            .filter_map(|e| match e {
                Effect::Emit(name, _) => Some(*name),
                _ => None,
            })
            .collect()
    }

    fn helper_reducer(mode: super::super::policy::Mode) -> Reducer {
        let mut r = Reducer::default();
        r.track("parent", "task", Some("/work".into()), false, UsageTotals::default());
        r.set_mode("parent", mode);
        for (kind, data) in [
            ("session.execution.started", json!({})),
            ("session.tool.input.started", json!({"id":"delegate", "name":"subagent"})),
            ("session.tool.called", json!({"id":"delegate", "input":{"agent":"general", "description":"Check the files"}})),
            ("session.tool.progress", json!({"id":"delegate", "metadata":{"sessionID":"child"}})),
        ] { let mut data = data; data["sessionID"] = json!("parent"); r.apply(&json!({"type":kind,"data":data})); }
        r
    }

    fn helper_ask(r: &mut Reducer, child: &str, id: &str, command: &str) -> Vec<Effect> {
        r.apply(&json!({"type":"session.tool.input.started","data":{"sessionID":child,"id":id,"name":"shell"}}));
        r.apply(&json!({"type":"session.tool.called","data":{"sessionID":child,"id":id,"input":{"command":command}}}));
        r.apply(&json!({"type":"permission.asked","data":{"sessionID":child,"id":format!("ask-{id}"),"action":"shell","resources":[command],"source":{"id":id}}}))
    }

    #[test]
    fn helper_permissions_use_task_mode_and_reply_on_child() {
        use super::super::policy::Mode;
        for (mode, command, expected) in [(Mode::Ask,"ls","ask"), (Mode::Auto,"ls","once"), (Mode::Auto,"rm -rf junk","ask"), (Mode::Skip,"rm -rf junk","once"), (Mode::Auto,"sudo ls","reject")] {
            let mut r = helper_reducer(mode);
            let effects = helper_ask(&mut r,"child","shell",command);
            if expected == "ask" {
                let payload = r.pending_payload("parent").unwrap();
                assert_eq!(payload["helper"],"Check the files");
                assert_eq!(r.request_session("parent","ask-shell").as_deref(),Some("child"));
                assert!(effects.iter().any(|e| matches!(e,Effect::Emit("agent:permission-request",p) if p["sessionId"] == "task")));
            } else {
                assert!(effects.iter().any(|e| matches!(e,Effect::Reply {engine_session_id,decision,..} if engine_session_id == "child" && *decision == expected)), "{effects:?}");
                assert!(r.pending_payload("parent").is_none());
            }
            assert_eq!(r.scratch_owner("child"),"parent");
        }
    }

    #[test]
    fn parallel_helpers_queue_in_parent_and_finish_without_finishing_task() {
        let mut r = helper_reducer(super::super::policy::Mode::Ask);
        r.add_helper("second","parent","Second job");
        helper_ask(&mut r,"child","one","ls");
        helper_ask(&mut r,"second","two","ls");
        assert_eq!(r.pending_payload("parent").unwrap()["total"],2);
        r.replied("parent","ask-one");
        assert_eq!(r.request_session("parent","ask-two").as_deref(),Some("second"));
        let finished = r.apply(&json!({"type":"session.execution.succeeded","data":{"sessionID":"child"}}));
        assert!(!names(&finished).contains(&"agent:done"));
        assert!(r.session("parent").unwrap().busy);
        r.end_turn("parent",None);
        assert!(r.helper_parent("child").is_none());
        assert!(r.pending_payload("parent").is_none());
    }

    #[test]
    fn helper_steps_and_text_only_emit_inside_parent_tool() {
        let mut r = helper_reducer(super::super::policy::Mode::Auto);
        let effects = r.apply(&json!({"type":"session.text.delta","data":{"sessionID":"child","delta":"found it"}}));
        assert_eq!(names(&effects),vec!["agent:helper"]);
        assert!(matches!(&effects[0],Effect::Emit(_,p) if p["sessionId"] == "task" && p["data"]["Helper"]["toolId"] == "delegate"));
        let effects = r.apply(&json!({"type":"session.tool.success","data":{"sessionID":"parent","id":"delegate","content":[{"type":"text","text":"<subagent sessionID=\"child\" state=\"completed\">answer</subagent>"}]}}));
        assert!(effects.iter().any(|e| matches!(e,Effect::Emit("agent:tool-end",p) if p["data"]["ToolEnd"]["result"]["content"]["Text"] == "answer")));
    }

    fn fixture() -> Vec<Value> {
        serde_json::from_str(include_str!("fixtures/events-write-shell.json")).unwrap()
    }

    #[test]
    fn a_steps_time_leaves_out_the_wait_for_approval() {
        let mut reducer = Reducer::default();
        reducer.track("ses_x", "app", Some("/work".into()), false, UsageTotals::default());
        reducer.set_mode("ses_x", super::super::policy::Mode::Ask);
        let now = chrono::Utc::now().timestamp_millis() as f64;
        reducer.apply(&json!({ "type": "session.execution.started", "data": { "sessionID": "ses_x" } }));
        reducer.apply(&json!({ "type": "session.tool.input.started", "data": { "sessionID": "ses_x", "id": "call_1", "name": "shell" } }));
        reducer.apply(&json!({ "type": "session.tool.called", "created": now - 300_000.0, "data": { "sessionID": "ses_x", "id": "call_1", "input": { "command": "ls" } } }));
        reducer.apply(&json!({ "type": "permission.asked", "created": now - 299_000.0, "data": { "id": "per_1", "sessionID": "ses_x", "action": "shell", "resources": ["ls"], "source": { "id": "call_1" } } }));
        let resumed = reducer.replied("ses_x", "per_1");
        let waited = reducer.tool_waits("ses_x")["call_1"];
        assert!((298_000..=301_000).contains(&waited), "{waited}");
        assert!(resumed.iter().any(|e| matches!(e, Effect::Emit("agent:timing", p) if p["timing"]["waitMs"].is_number())));
        let ended = reducer.apply(&json!({ "type": "session.tool.success", "created": now + 2_000.0, "data": { "sessionID": "ses_x", "id": "call_1", "content": [] } }));
        let timing = ended.iter().find_map(|e| match e { Effect::Emit("agent:timing", p) => Some(p["timing"].clone()), _ => None }).unwrap();
        let ms = timing["durationMs"].as_u64().unwrap();
        assert!(ms < 5_000, "{ms}");
        assert!(timing["waitMs"].as_u64().unwrap() >= 298_000);
    }

    #[test]
    fn long_shell_and_step_end_stay_busy_until_execution_idle_marker() {
        let mut reducer = Reducer::default();
        reducer.track("ses_race", "app", None, false, UsageTotals::default());
        let event = |kind:&str, data:Value| { let mut data=data; data["sessionID"]=json!("ses_race"); json!({"type":kind,"data":data}) };
        reducer.apply(&event("session.execution.started",json!({})));
        reducer.apply(&event("session.tool.input.started",json!({"id":"shell","name":"shell"})));
        reducer.apply(&event("session.tool.called",json!({"id":"shell","input":{"command":"sleep 253"}})));
        reducer.apply(&event("session.tool.success",json!({"id":"shell","content":[]})));
        reducer.apply(&event("session.step.ended",json!({})));
        assert!(reducer.session("ses_race").unwrap().busy);
        let idle=reducer.apply(&event("session.execution.succeeded",json!({})));
        assert!(!reducer.session("ses_race").unwrap().busy);
        assert!(names(&idle).contains(&"agent:done"));
    }

    #[test]
    fn worked_for_leaves_out_waits_for_approvals_and_answers() {
        let mut reducer = Reducer::default();
        reducer.track("ses_x", "app", Some("/work".into()), false, UsageTotals::default());
        reducer.set_mode("ses_x", super::super::policy::Mode::Ask);
        let now = chrono::Utc::now().timestamp_millis() as f64;
        let ev = |kind: &str, at: f64, data: Value| { let mut d = data; d["sessionID"] = json!("ses_x"); json!({ "type": kind, "created": at, "data": d }) };
        reducer.apply(&ev("session.execution.started", now - 400_000.0, json!({})));
        // A question answered after 60s
        reducer.apply(&ev("session.tool.input.started", now - 399_000.0, json!({ "id": "q", "name": "question" })));
        reducer.apply(&ev("session.tool.called", now - 399_000.0, json!({ "id": "q", "input": {} })));
        reducer.apply(&ev("session.tool.success", now - 339_000.0, json!({ "id": "q", "content": [] })));
        // An approval answered now, asked 300s ago
        reducer.apply(&ev("session.tool.input.started", now - 301_000.0, json!({ "id": "call_1", "name": "shell" })));
        reducer.apply(&ev("session.tool.called", now - 301_000.0, json!({ "id": "call_1", "input": { "command": "ls" } })));
        reducer.apply(&ev("permission.asked", now - 300_000.0, json!({ "id": "per_1", "action": "shell", "resources": ["ls"], "source": { "id": "call_1" } })));
        reducer.replied("ses_x", "per_1");
        reducer.apply(&ev("session.tool.success", now + 1_000.0, json!({ "id": "call_1", "content": [] })));
        let done = reducer.apply(&ev("session.execution.succeeded", now + 2_000.0, json!({})));
        let turn = done.iter().find_map(|e| match e { Effect::Emit("agent:timing", p) if p["timing"]["kind"] == "turn" => Some(p["timing"].clone()), _ => None }).unwrap();
        let worked = turn["durationMs"].as_u64().unwrap();
        let waited = turn["waitMs"].as_u64().unwrap();
        assert!((40_000..=44_000).contains(&worked), "{worked}");
        assert!((359_000..=361_000).contains(&waited), "{waited}");
    }

    #[test]
    fn unsaved_text_is_the_current_steps_reply() {
        let mut reducer = Reducer::default();
        reducer.track("ses_x", "app", None, false, UsageTotals::default());
        let ev = |kind: &str, data: Value| json!({ "type": kind, "data": { "sessionID": "ses_x", "assistantMessageID": "m", "ordinal": 0, "delta": data["delta"], "text": data["text"] } });
        reducer.apply(&json!({ "type": "session.execution.started", "data": { "sessionID": "ses_x" } }));
        reducer.apply(&json!({ "type": "session.step.started", "data": { "sessionID": "ses_x" } }));
        reducer.apply(&ev("session.text.delta", json!({ "delta": "word0 " })));
        reducer.apply(&ev("session.reasoning.delta", json!({ "delta": "hmm" })));
        reducer.apply(&ev("session.text.delta", json!({ "delta": "word1" })));
        assert_eq!(reducer.unsaved_text("ses_x").unwrap().1, "word0 word1");
        // A new step starts from nothing (the engine saved the last one)
        reducer.apply(&json!({ "type": "session.step.started", "data": { "sessionID": "ses_x" } }));
        assert_eq!(reducer.unsaved_text("ses_x").unwrap().1, "");
    }

    #[test]
    fn reasoning_and_text_can_share_an_ordinal_without_duplicating_text() {
        let mut reducer=Reducer::default();
        reducer.track("ses_1","app",None,false,UsageTotals::default());
        let event=|kind:&str,fields:Value| {let mut data=json!({"sessionID":"ses_1","assistantMessageID":"msg_1","ordinal":0});for(k,v) in fields.as_object().unwrap(){data[k]=v.clone();}json!({"type":kind,"data":data})};
        reducer.apply(&event("session.reasoning.delta",json!({"delta":"thinking"})));
        reducer.apply(&event("session.text.delta",json!({"delta":"hello"})));
        reducer.apply(&event("session.reasoning.ended",json!({"text":"thinking"})));
        let ended=reducer.apply(&event("session.text.ended",json!({"text":"hello"})));
        assert!(!names(&ended).contains(&"agent:text-delta"));
        let replay=reducer.apply(&event("session.text.ended",json!({"text":"hello"})));
        assert!(!names(&replay).contains(&"agent:text-delta"));
    }

    #[test]
    fn real_stream_maps_to_ui_events() {
        let effects = run(&fixture(), false);
        let names = names(&effects);
        // Starts processing, streams thinking and text, runs two tools, asks once, ends once.
        assert_eq!(names.iter().find(|n| **n != "agent:inbox"), Some(&"agent:state-change"));
        assert!(names.contains(&"agent:thinking-delta"));
        assert!(names.contains(&"agent:text-delta"));
        assert_eq!(names.iter().filter(|n| **n == "agent:tool-start").count(), 2);
        assert_eq!(names.iter().filter(|n| **n == "agent:tool-end").count(), 2);
        assert_eq!(names.iter().filter(|n| **n == "agent:permission-request").count(), 0);
        assert_eq!(names.iter().filter(|n| **n == "agent:done").count(), 1);
        // Done is the last agent event: it closes the execution, not a step.
        let done = names.iter().rposition(|n| *n == "agent:done").unwrap();
        assert!(names[done + 1..].iter().all(|n| *n == "gallery:changed"));
        // ...and the state returns to Idle before it
        let idle = effects.iter().rposition(|e| matches!(e, Effect::Emit("agent:state-change", p) if p["data"]["StateChange"] == "Idle")).unwrap();
        let done_effect = effects.iter().rposition(|e| matches!(e, Effect::Emit("agent:done", _))).unwrap();
        assert!(idle < done_effect);

        let start = effects.iter().find_map(|e| match e {
            Effect::Emit("agent:tool-start", p) if p["data"]["ToolStart"]["name"] == "Write" => Some(p.clone()),
            _ => None,
        });
        assert_eq!(start.unwrap()["data"]["ToolStart"]["input"]["file_path"], "/work/hello.txt");

        assert!(effects.iter().any(|e| matches!(e, Effect::Reply { decision: "once", .. })));

        // Usage: cumulative session totals with every step counted once
        let last_usage = effects.iter().rev().find_map(|e| match e {
            Effect::Emit("agent:usage", p) => Some(p.clone()),
            _ => None,
        });
        let usage = last_usage.unwrap();
        assert_eq!(usage["session"]["calls"], 3);
        assert!(usage["session"]["costUsd"].as_f64().unwrap() > 0.0);
        assert!(usage["session"]["inputTokens"].as_u64().unwrap() >= usage["session"]["cachedInputTokens"].as_u64().unwrap());
    }

    #[test]
    fn skip_permissions_answers_without_asking() {
        let effects = run(&fixture(), true);
        assert!(!names(&effects).contains(&"agent:permission-request"));
        assert!(effects.iter().any(|e| matches!(e, Effect::Reply { decision: "once", .. })));
    }

    #[test]
    fn concurrent_requests_are_shown_one_at_a_time() {
        let mut reducer = Reducer::default();
        reducer.track("ses_1", "app", None, false, UsageTotals::default());
        let ask = |id: &str| json!({ "type": "permission.asked", "data": { "id": id, "sessionID": "ses_1", "action": "shell", "resources": ["rm scratch.txt"] } });
        let first = reducer.apply(&ask("per_a"));
        let second = reducer.apply(&ask("per_b"));
        let payload = |effects: &[Effect]| effects.iter().find_map(|e| match e { Effect::Emit("agent:permission-request", p) => Some(p["data"]["PermissionRequest"].clone()), _ => None }).unwrap();
        assert_eq!(names(&first).iter().filter(|n| **n == "agent:permission-request").count(), 1);
        assert_eq!((payload(&first)["position"].as_u64(), payload(&first)["total"].as_u64()), (Some(1), Some(1)));
        assert!(payload(&first)["reason"].as_str().is_some_and(|r| !r.is_empty()));
        // The second waits; the first stays on screen and now reads "1 of 2"
        let shown = payload(&second);
        assert_eq!((shown["request_id"].as_str(), shown["position"].as_u64(), shown["total"].as_u64()), (Some("per_a"), Some(1), Some(2)));
        assert_eq!(reducer.shown_request("ses_1").as_deref(), Some("per_a"));
        let next = reducer.replied("ses_1", "per_a");
        assert_eq!(reducer.shown_request("ses_1").as_deref(), Some("per_b"));
        assert_eq!((payload(&next)["position"].as_u64(), payload(&next)["total"].as_u64()), (Some(2), Some(2)));
        // Last one answered while the turn runs: the state goes back to Processing
        reducer.apply(&json!({ "type": "session.execution.started", "data": { "sessionID": "ses_1" } }));
        let last = reducer.replied("ses_1", "per_b");
        assert!(matches!(&last[..], [Effect::Emit("agent:state-change", p)] if p["data"]["StateChange"] == "Processing"));
        // The engine's own `permission.replied` for an already handled request changes nothing
        let echo = reducer.apply(&json!({ "type": "permission.replied", "data": { "sessionID": "ses_1", "requestID": "per_a" } }));
        assert!(echo.is_empty());
    }

    #[test]
    fn pending_request_is_recovered_after_the_ui_lost_it() {
        let mut reducer = Reducer::default();
        reducer.track("ses_1", "app_1", Some("/work".into()), false, UsageTotals::default());
        reducer.set_mode("ses_1", super::super::policy::Mode::Ask);
        let request = |id: &str, cmd: &str| json!({ "id": id, "sessionID": "ses_1", "action": "shell", "resources": [cmd] });
        // The stream delivered per_a; the UI then reloaded and lost it.
        reducer.apply(&json!({ "type": "permission.asked", "data": request("per_a", "rm a.txt") }));
        let shown = reducer.pending_payload("ses_1").expect("shown request");
        assert_eq!((shown["request_id"].as_str(), shown["action"].as_str(), shown["position"].as_u64(), shown["total"].as_u64()), (Some("per_a"), Some("Run a command"), Some(1), Some(1)));
        // The engine also holds per_b, which the stream never delivered: it queues behind per_a.
        let effects = reducer.reconcile("ses_1", &[request("per_a", "rm a.txt"), request("per_b", "rm b.txt"), json!({"id":"per_x","sessionID":"ses_other","action":"shell","resources":["ls"]})]);
        assert_eq!(names(&effects), vec!["agent:permission-request"]);
        assert_eq!(reducer.pending_payload("ses_1").unwrap()["total"].as_u64(), Some(2));
        // per_a was answered elsewhere (the engine no longer holds it): per_b takes its place.
        reducer.reconcile("ses_1", &[request("per_b", "rm b.txt")]);
        let shown = reducer.pending_payload("ses_1").unwrap();
        assert_eq!(shown["request_id"].as_str(), Some("per_b"));
        assert!(shown["input"].as_str().unwrap().contains("rm b.txt"));
        // Nothing pending in the engine: nothing to show.
        reducer.reconcile("ses_1", &[]);
        assert!(reducer.pending_payload("ses_1").is_none());
        assert!(reducer.pending_payload("ses_unknown").is_none());
    }

    #[test]
    fn failure_ends_with_error_then_done_and_closes_tools() {
        let mut reducer = Reducer::default();
        reducer.track("ses_1", "app", None, false, UsageTotals::default());
        let events = [
            json!({ "type": "session.execution.started", "created": 1.0, "data": { "sessionID": "ses_1" } }),
            json!({ "type": "session.tool.input.started", "data": { "sessionID": "ses_1", "id": "c1", "name": "shell" } }),
            json!({ "type": "session.tool.called", "created": 2.0, "data": { "sessionID": "ses_1", "id": "c1", "input": { "command": "sleep 9" } } }),
            json!({ "type": "session.step.failed", "data": { "sessionID": "ses_1", "error": { "message": "boom" } } }),
            json!({ "type": "session.execution.failed", "created": 3.0, "data": { "sessionID": "ses_1", "error": { "message": "boom" } } }),
        ];
        let effects: Vec<Effect> = events.iter().flat_map(|e| reducer.apply(e)).collect();
        let names = names(&effects);
        let end = names.iter().position(|n| *n == "agent:tool-end").unwrap();
        let error = names.iter().position(|n| *n == "agent:error").unwrap();
        let done = names.iter().position(|n| *n == "agent:done").unwrap();
        assert!(end < error && error < done);
        assert_eq!(names.iter().filter(|n| **n == "agent:error").count(), 1);
    }

    #[test]
    fn a_refusal_is_not_a_turn_error() {
        let mut reducer = Reducer::default();
        reducer.track("ses_1", "app_1", Some("/work".into()), false, UsageTotals::default());
        let effects = reducer.apply(&json!({ "type": "permission.asked", "data": { "id": "per_s", "sessionID": "ses_1", "action": "shell", "resources": ["sudo ls"] } }));
        assert!(matches!(&effects[..], [Effect::Reply { decision: "reject", .. }]), "{:?}", names(&effects));
    }

    #[test]
    fn engine_title_reaches_the_ui_during_the_first_turn() {
        let mut reducer = Reducer::default();
        reducer.track("ses_1", "app_1", None, false, UsageTotals::default());
        let effects = reducer.apply(&json!({ "type": "session.renamed", "data": { "sessionID": "ses_1", "title": "Cafe loyalty deck" } }));
        assert!(matches!(&effects[..], [Effect::Emit("agent:session-renamed", p)] if p["sessionId"] == "app_1" && p["data"]["title"] == "Cafe loyalty deck"));
        let blank = reducer.apply(&json!({ "type": "session.renamed", "data": { "sessionID": "ses_1", "title": " " } }));
        assert!(blank.is_empty());
    }

    #[test]
    fn untracked_sessions_are_ignored() {
        let mut reducer = Reducer::default();
        let effects = reducer.apply(&json!({ "type": "session.text.delta", "data": { "sessionID": "ses_x", "delta": "hi" } }));
        assert!(effects.is_empty());
    }
}
