//! Installed agents own authentication, configuration and approvals. Never read their home files.
pub mod handoff;
pub mod selection;
pub mod catalog;
pub mod usage;
pub mod switching;
use selection::{Selection, NativeSession};
use super::types::{MessageInfo, SessionInfo};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap,HashSet},
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::Emitter;
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    sync::mpsc,
};

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum Engine {
    OpenCode,
    Codex,
    ClaudeCode,
}
impl Engine {
    pub fn model(self) -> &'static str {
        match self {
            Self::OpenCode => "opencode",
            Self::Codex => "agent:codex",
            Self::ClaudeCode => "agent:claude-code",
        }
    }
}
pub fn selected(model: &str) -> Option<Engine> {
    match model.split('|').next().unwrap_or(model) {
        "agent:codex" => Some(Engine::Codex),
        "agent:claude-code" => Some(Engine::ClaudeCode),
        _ => None,
    }
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub engine: Engine,
    pub name: String,
    pub folder: String,
    pub mode: String,
    pub native: Option<String>,
    #[serde(default)] pub model: Option<String>,
    #[serde(default)] pub effort: Option<String>,
    #[serde(default)] pub natives: HashMap<String, NativeSession>,
    #[serde(default)] pub pending: Option<Selection>,
    #[serde(default)] pub open_seen: usize,
    #[serde(default)] pub open_start: Option<usize>,
    #[serde(default)] pub open_note: Option<String>,
    pub created: String,
    pub updated: String,
    pub settled: Option<String>,
    #[serde(default)]
    pub deleted: bool,
    #[serde(default)] pub deleted_at:Option<i64>,
    #[serde(default)] pub usage: Vec<usage::TurnUsage>,
    #[serde(default)] pub inbox:Vec<super::inbox::Item>,
    pub messages: Vec<Value>,
}
pub(super) fn directory() -> PathBuf {
    crate::paths::get_app_data_dir().join("external-tasks")
}
fn path(id: &str) -> Result<PathBuf, String> {
    if id.is_empty()
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Invalid task id".into());
    }
    Ok(directory().join(format!("{id}.json")))
}
pub fn exists(id: &str) -> bool {
    path(id).is_ok_and(|p| p.is_file())
}
pub fn read(id: &str) -> Result<Task, String> {
    let mut task: Task = serde_json::from_slice(&std::fs::read(path(id)?).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    task.migrate();
    Ok(task)
}
static TASK_WRITES:Lazy<Mutex<()>>=Lazy::new(||Mutex::new(()));
pub fn mutate_inbox(id:&str,mutate:impl FnOnce(&mut Vec<super::inbox::Item>))->Result<(),String>{let _guard=TASK_WRITES.lock().unwrap();let mut t=read(id)?;mutate(&mut t.inbox);save_raw(&t)}
pub(super) fn save(t:&Task)->Result<(),String>{let _guard=TASK_WRITES.lock().unwrap();let mut t=t.clone();if let Ok(previous)=read(&t.id){t.inbox=previous.inbox;}save_raw(&t)}
fn save_raw(t: &Task) -> Result<(), String> {
    std::fs::create_dir_all(directory()).map_err(|e| e.to_string())?;
    let p = path(&t.id)?;
    let temp = p.with_extension("tmp");
    std::fs::write(&temp, serde_json::to_vec(t).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    std::fs::rename(temp, p).map_err(|e| e.to_string())
}
pub fn update(id: &str, f: impl FnOnce(&mut Task)) -> Result<(), String> {
    if switching::busy(id) {
        return Err("Stop this task before changing its settings.".into());
    }
    let mut t = read(id)?;
    f(&mut t);
    save(&t)
}
pub fn history(id: &str) -> Result<Vec<MessageInfo>, String> {
    read(id)?
        .messages
        .into_iter()
        .map(|m| serde_json::from_value(m).map_err(|e| e.to_string()))
        .collect()
}
pub fn info(t: Task) -> SessionInfo {
    SessionInfo {
        session_id: t.id,
        name: t.name.clone(),
        description: String::new(),
        agent_type: t.engine.model().into(),
        created_at: t.created,
        updated_at: t.updated,
        conversation_name: Some(t.name),
        settled_at: t.settled,
        cost_usd: None,
        working_folder: Some(t.folder),
    }
}
pub fn list() -> Vec<SessionInfo> {
    std::fs::read_dir(directory())
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
        .filter_map(|e| std::fs::read(e.path()).ok())
        .filter_map(|b| serde_json::from_slice::<Task>(&b).ok())
        .filter(|t| !t.deleted)
        .map(info)
        .collect()
}
pub async fn executable(name: &str) -> Option<PathBuf> {
    let mut paths = vec![
        dirs::home_dir()?.join(".local/bin").join(name),
        dirs::home_dir()?.join(".npm-global/bin").join(name),
        dirs::home_dir()?.join(".volta/bin").join(name),
        dirs::home_dir()?.join(".bun/bin").join(name),
        PathBuf::from("/opt/homebrew/bin").join(name),
        PathBuf::from("/usr/local/bin").join(name),
    ];
    if let Some(p) = super::login_path::login_shell_path().await {
        paths.extend(std::env::split_paths(&p).map(|p| p.join(name)));
    }
    paths.extend(std::env::split_paths(&super::launch::user_path()).map(|p| p.join(name)));
    paths.into_iter().find(|p| p.is_file())
}
async fn output(p: &PathBuf, args: &[&str]) -> Option<String> {
    let mut c = tokio::process::Command::new(p);
    c.args(args)
        .env("PATH", super::launch::user_path())
        .kill_on_drop(true);
    let o = tokio::time::timeout(Duration::from_secs(12), c.output())
        .await
        .ok()?
        .ok()?;
    Some(format!(
        "{}{}",
        String::from_utf8_lossy(&o.stdout),
        String::from_utf8_lossy(&o.stderr)
    ))
}
#[tauri::command]
pub async fn agent_installed_agents() -> Vec<Value> {
    let mut result = vec![];
    if let Some(p) = executable("codex").await {
        let version = output(&p, &["--version"]).await.unwrap_or_default();
        let supported = version
            .split_whitespace()
            .nth(1)
            .map(|s| version_at_least(s, [0, 167, 2]))
            .unwrap_or(false);
        let login = output(&p, &["login", "status"]).await.unwrap_or_default();
        let note = if !supported {
            Some("Requires Codex 0.167.2 or newer.")
        } else if !login.contains("Logged in using ChatGPT") {
            Some("Sign in with codex login in Terminal.")
        } else {
            None
        };
        result.push(json!({"id":"agent:codex","name":"Codex","contextLength":null,"promptPrice":null,"completionPrice":null,"supportsReasoning":true,"supportsImages":false,"agent":true,"disabledReason":note}));
    }
    if let Some(p) = executable("claude").await {
        let version = output(&p, &["--version"]).await.unwrap_or_default();
        let supported = version
            .split_whitespace()
            .next()
            .map(|s| version_at_least(s, [2, 1, 323]))
            .unwrap_or(false);
        let auth = output(&p, &["auth", "status"])
            .await
            .and_then(|v| serde_json::from_str::<Value>(&v).ok())
            .unwrap_or(Value::Null);
        let note = if !supported {
            Some("Requires Claude Code 2.1.323 or newer.")
        } else if auth["loggedIn"] != true || auth["authMethod"] != "claude.ai" {
            Some("Sign in with claude auth login in Terminal.")
        } else {
            None
        };
        result.push(json!({"id":"agent:claude-code","name":"Claude Code","contextLength":null,"promptPrice":null,"completionPrice":null,"supportsReasoning":true,"supportsImages":false,"agent":true,"disabledReason":note}));
    }
    for row in &mut result { if let Some(engine)=row["id"].as_str().and_then(selected) { row["limitReason"]=json!(usage::blocked_message(engine)); } }
    result
}
pub async fn create(
    id: String,
    name: String,
    folder: Option<String>,
    model: String,
    mode: Option<String>,
) -> Result<(), String> {
    let engine = selected(&model).ok_or("Unknown agent")?;
    if !agent_installed_agents()
        .await
        .iter()
        .any(|a| a["id"] == engine.model() && a["disabledReason"].is_null())
    {
        return Err("Sign in to a supported installation of this agent first.".into());
    }
    if exists(&id) {
        return Err("Task already exists".into());
    }
    let folder = folder.unwrap_or_else(|| {
        crate::config::get_default_working_directory().replacen(
            '~',
            &dirs::home_dir().unwrap_or_default().to_string_lossy(),
            1,
        )
    });
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let mode = mode.unwrap_or_else(|| crate::config::get_default_permission_mode().name().into());
    super::policy::Mode::parse(&mode)?;
    let now = chrono::Utc::now().to_rfc3339();
    save(&Task {
        usage: vec![], inbox:vec![],
        id,
        engine,
        name,
        folder,
        mode,
        native: None,
        model: Selection::parse(&model).model, effort:Selection::parse(&model).effort, natives:HashMap::new(),pending:None,open_seen:0,open_start:None,open_note:None,
        created: now.clone(),
        updated: now,
        settled: None,
        deleted: false, deleted_at:None,
        messages: vec![],
    })
}
struct Live {
    status: Option<Value>,
    tx: mpsc::UnboundedSender<Value>,
    pid: u32,
    pending: Arc<Mutex<Vec<Value>>>,
}
static STEER_REPLIES:Lazy<Mutex<HashMap<String,tokio::sync::oneshot::Sender<Result<(),String>>>>>=Lazy::new(||Mutex::new(HashMap::new()));
pub async fn steer(id:&str,item:super::inbox::Item)->Result<(),String>{let (tx,rx)=tokio::sync::oneshot::channel();{let live=LIVE.lock().unwrap();let l=live.get(id).ok_or("The turn finished. Send this queued message again.")?;if !l.pending.lock().unwrap().is_empty(){return Err("Answer the pending prompt first.".into());}STEER_REPLIES.lock().unwrap().insert(item.id.clone(),tx);if l.tx.send(json!({"steer":item})).is_err(){STEER_REPLIES.lock().unwrap().remove(&item.id);return Err("The turn finished. Your message is still queued.".into());}}{let result=tokio::time::timeout(Duration::from_secs(300),rx).await;STEER_REPLIES.lock().unwrap().remove(&item.id);match result{Ok(Ok(r))=>r,_=>Err("The agent has not confirmed delivery. Check the task before retrying.".into())}}}
static LIVE: Lazy<Mutex<HashMap<String, Live>>> = Lazy::new(|| Mutex::new(HashMap::new()));
pub fn running(id: &str) -> bool {
    LIVE.lock().unwrap().contains_key(id)
}
pub fn running_ids() -> Vec<String> {
    LIVE.lock().unwrap().keys().cloned().collect()
}
pub fn pending(id: &str) -> Option<Value> {
    LIVE.lock()
        .unwrap()
        .get(id)
        .and_then(|l| l.pending.lock().unwrap().first().cloned())
        .filter(|v| v["kind"] != "question")
        .map(|v| v["ui"].clone())
}
pub fn waiting() -> Vec<String> {
    running_ids()
        .into_iter()
        .filter(|id| pending(id).is_some() || question(id).is_some())
        .collect()
}
pub fn question(id: &str) -> Option<Value> {
    LIVE.lock()
        .unwrap()
        .get(id)
        .and_then(|l| l.pending.lock().unwrap().first().cloned())
        .filter(|v| v["kind"] == "question")
        .map(|v| v["ui"].clone())
}
pub fn answer(id: &str, request: &str, answers: HashMap<String, String>) -> Result<bool, String> {
    let live = LIVE.lock().unwrap();
    let l = live
        .get(id)
        .ok_or("The agent stopped; send your answer as a new message.")?;
    let p = l.pending.lock().unwrap();
    let q = p
        .first()
        .filter(|q| q["kind"] == "question" && q["ui"]["request_id"] == request)
        .ok_or("This question is no longer pending")?;
    let mut result = serde_json::Map::new();
    for field in q["questions"].as_array().into_iter().flatten() {
        let key = field["id"].as_str().unwrap_or("");
        let header = field["header"].as_str().unwrap_or(key);
        let value = answers.get(header).ok_or("An answer is missing")?;
        result.insert(key.into(), json!({"answers":[value]}));
    }
    l.tx.send(json!({"answer":q["id"],"result":{"answers":result}}))
        .map_err(|e| e.to_string())?;
    Ok(false)
}
pub fn stop(id: &str) -> Result<(), String> {
    super::inbox::park(id);
    if let Some(l) = LIVE.lock().unwrap().get(id) {
        l.tx.send(json!({"stop":true})).map_err(|e| e.to_string())?
    }
    Ok(())
}
pub fn respond(
    id: &str,
    request: Option<String>,
    allowed: bool,
    remember: bool,
) -> Result<(), String> {
    let live = LIVE.lock().unwrap();
    let l = live
        .get(id)
        .ok_or("This agent has stopped. Send a message to continue.")?;
    let p = l.pending.lock().unwrap();
    let first = p.first().ok_or("No pending approval")?;
    if request
        .as_deref()
        .is_some_and(|id| Some(id) != first["ui"]["request_id"].as_str())
    {
        return Err("This approval is no longer current".into());
    }
    l.tx.send(json!({"approval":first["id"],"result":if first.get("permissions").is_some(){json!({"permissions":if allowed{first["permissions"].clone()}else{json!({})},"scope":if allowed&&remember{"session"}else{"turn"}})}else{decision(allowed,remember)}}))
        .map_err(|e| e.to_string())
}
fn kill_group(pid: u32) {
    #[cfg(unix)]
    unsafe {
        libc::kill(-(pid as i32), libc::SIGKILL);
    }
}
pub fn shutdown_blocking() {
    catalog::shutdown();
    for l in LIVE.lock().unwrap().values() {
        kill_group(l.pid)
    }
}
fn emit(id: &str, event: &str, data: Value) {
    if let Ok(e) = super::get() {
        let payload = if event == "agent:timing" {
            json!({"sessionId":id,"timing":data})
        } else {
            json!({"sessionId":id,"data":data})
        };
        let _ = e.app.emit(event, payload);
    }
}
fn message(role: &str, block: Value) -> Value {
    json!({"role":role,"content":[block],"timings":[],"notes":[],"sourceIds":[]})
}
pub fn modes(mode: &str) -> (&'static str, &'static str) {
    match mode {
        "ask" => ("untrusted", "read-only"),
        "skip" => ("never", "danger-full-access"),
        _ => ("on-request", "workspace-write"),
    }
}
async fn write(w: &mut tokio::process::ChildStdin, v: Value) -> Result<(), String> {
    let s = serde_json::to_string(&v).map_err(|e| e.to_string())?;
    w.write_all(format!("{s}\n").as_bytes())
        .await
        .map_err(|e| e.to_string())
}

/// Pure stream reducer; event shapes remain identical to the OpenCode adapter.
#[derive(Default)]
pub struct Reducer {
    text: HashMap<String, String>,
    thinking:HashSet<String>,
    text_order:Vec<String>,
    output:HashMap<String,String>,
    text_prefix: HashMap<String,String>,
    tools: HashMap<String, Value>,
    pub blocks: Vec<Value>,
    pub results: Vec<Value>,
    timings: Vec<Value>,
    waits: HashMap<String, u64>,
}
impl Reducer {
    fn flush_text(&mut self){
        for id in self.text_order.drain(..){if let Some(text)=self.text.remove(&id){if !text.is_empty(){self.text_prefix.entry(id.clone()).or_default().push_str(&text);self.blocks.push(if self.thinking.contains(&id){json!({"type":"thinking","thinking":text})}else{json!({"type":"text","text":text})});}}}
    }
    fn mark_user(&mut self,item:&super::inbox::Item){
        self.flush_text();
        self.blocks.push(json!({"type":"inbox_user","id":item.id,"text":item.text}));
    }
    fn messages(&self,end:Value)->Vec<Value>{
        let mut out=vec![];let mut blocks=vec![];
        for block in &self.blocks {if block["type"]=="inbox_user" {if !blocks.is_empty(){out.push(json!({"role":"assistant","content":blocks,"timings":[],"notes":[],"sourceIds":[]}));blocks=vec![];}out.push(message("user",json!({"type":"text","text":block["text"]})));}else{blocks.push(block.clone());}}
        for id in &self.text_order {if let Some(text)=self.text.get(id){if !text.is_empty(){blocks.push(if self.thinking.contains(id){json!({"type":"thinking","thinking":text})}else{json!({"type":"text","text":text})});}}}
        out.push(json!({"role":"assistant","content":blocks,"timings":self.timings,"end":end,"notes":[],"sourceIds":[]}));
        let mut results=self.results.clone();for id in self.tools.keys(){results.push(json!({"type":"tool_result","tool_use_id":id,"content":format!("{}\nStopped before it finished",self.output.get(id).cloned().unwrap_or_default()),"is_error":true}));}if !results.is_empty(){out.push(json!({"role":"user","content":results,"timings":[],"notes":[],"sourceIds":[]}));}
        for m in &mut out {if m["role"]=="assistant"{let blocks=m["content"].as_array().unwrap();let timings:Vec<Value>=self.timings.iter().filter_map(|t|blocks.iter().position(|b|b["id"]==t["id"]).map(|index|{let mut t=t.clone();t["blockIndex"]=json!(index);t})).collect();m["timings"]=json!(timings);}}
        out
    }
    pub fn apply(&mut self, m: &Value) -> Vec<(&'static str, Value)> {
        let mut out = vec![];
        let p = &m["params"];
        let method = m["method"].as_str().unwrap_or("");
        let item = &p["item"];
        let id = item["id"].as_str().unwrap_or("");
        match method {
            "item/agentMessage/delta"
            | "item/reasoning/summaryTextDelta"
            | "item/reasoning/textDelta" => {
                let thinking = method != "item/agentMessage/delta";
                let key = p["itemId"].as_str().unwrap_or("");
                let delta = p["delta"].as_str().unwrap_or("");
                if !self.text.contains_key(key){self.text_order.push(key.into());}if thinking{self.thinking.insert(key.into());}self.text.entry(key.into()).or_default().push_str(delta);
                out.push(if thinking {
                    ("agent:thinking-delta", json!({"ThinkingDelta":delta}))
                } else {
                    ("agent:text-delta", json!({"TextDelta":delta}))
                });
            }
            "item/started" => {
                self.flush_text();
                if let Some((name, input)) = tool(item) {
                    let mut tracked = item.clone();
                    if !tracked["startedAtMs"].is_number() {
                        tracked["startedAtMs"] = json!(chrono::Utc::now().timestamp_millis());
                    }
                    self.tools.insert(id.into(), tracked);
                    self.blocks
                        .push(json!({"type":"tool_use","id":id,"name":name,"input":input}));
                    out.push((
                        "agent:tool-start",
                        json!({"ToolStart":{"id":id,"name":name,"input":input}}),
                    ));
                }
            }
            "item/completed" => match item["type"].as_str().unwrap_or("") {
                "agentMessage" => {
                    let full = item["text"].as_str().unwrap_or("");
                    let prefix=self.text_prefix.remove(id).unwrap_or_default();let text=full.strip_prefix(&prefix).unwrap_or(full);
                    self.blocks.push(json!({"type":"text","text":text}));
                    out.push(("agent:text-complete", json!({"TextComplete":text})));
                    self.text.remove(id);
                }
                "reasoning" => {
                    if let Some(text) = self.text.remove(id).filter(|s| !s.is_empty()) {
                        self.blocks.push(json!({"type":"thinking","thinking":text}));
                        out.push(("agent:thinking-complete", json!({"ThinkingComplete":text})));
                    }
                }
                _ => {
                    if let Some(started) = self.tools.remove(id) {
                        let start = started["startedAtMs"].as_i64().unwrap_or(0);
                        let end = item["completedAtMs"]
                            .as_i64()
                            .unwrap_or_else(|| chrono::Utc::now().timestamp_millis());
                        let wait = self.waits.remove(id).unwrap_or(0);
                        let timing = json!({"kind":"tool","id":id,"startedAt":chrono::DateTime::from_timestamp_millis(start).unwrap_or_default().to_rfc3339(),"durationMs":((end-start).max(0) as u64).saturating_sub(wait),"waitMs":wait,"messageIndex":0,"blockIndex":self.blocks.iter().position(|b|b["id"]==id)});
                        self.timings.push(timing.clone());
                        out.push(("agent:timing", timing));
                        let failed = matches!(item["status"].as_str(), Some("failed" | "declined"));
                        let text = item["aggregatedOutput"]
                            .as_str()
                            .map(str::to_string)
                            .unwrap_or_else(|| {
                                self.output.remove(id).unwrap_or_else(||item["status"].as_str().unwrap_or("Completed").into())
                            });
                        self.results.push(json!({"type":"tool_result","tool_use_id":id,"content":text,"is_error":failed}));
                        out.push(("agent:tool-end",json!({"ToolEnd":{"id":id,"result":super::tools::tool_result(text,failed)}})));
                        if item["type"] == "fileChange" && !failed {
                            for (n, c) in
                                item["changes"].as_array().into_iter().flatten().enumerate()
                            {
                                if c["kind"]["type"] == "delete" {
                                    continue;
                                }
                                let path = c["path"].as_str().unwrap_or("");
                                let fid = format!("{id}-file-{n}");
                                let input = json!({"file_path":path,"file_name":std::path::Path::new(path).file_name().unwrap_or_default().to_string_lossy()});
                                self.blocks.push(json!({"type":"tool_use","id":fid,"name":"PresentFile","input":input}));
                                self.results.push(json!({"type":"tool_result","tool_use_id":fid,"content":path,"is_error":false}));
                                out.push(("agent:tool-start",json!({"ToolStart":{"id":fid,"name":"PresentFile","input":input}})));
                                out.push(("agent:tool-end",json!({"ToolEnd":{"id":fid,"result":super::tools::tool_result(path.into(),false)}})));
                            }
                        }
                    }
                }
            },
            "turn/plan/updated" => {
                let id = format!("plan-{}", self.blocks.len());
                let todos:Vec<Value>=p["plan"].as_array().into_iter().flatten().map(|v|json!({"content":v["step"],"activeForm":v["step"],"status":match v["status"].as_str(){Some("inProgress")=>"in_progress",Some("completed")=>"completed",_=>"pending"}})).collect();
                let input = json!({"todos":todos});
                self.blocks
                    .push(json!({"type":"tool_use","id":id,"name":"TodoWrite","input":input}));
                self.results.push(json!({"type":"tool_result","tool_use_id":id,"content":"Plan updated","is_error":false}));
                out.push((
                    "agent:tool-start",
                    json!({"ToolStart":{"id":id,"name":"TodoWrite","input":input}}),
                ));
                out.push(("agent:tool-end",json!({"ToolEnd":{"id":id,"result":super::tools::tool_result("Plan updated".into(),false)}})));
            }
            "item/commandExecution/outputDelta" => {self.output.entry(p["itemId"].as_str().unwrap_or("").into()).or_default().push_str(p["delta"].as_str().unwrap_or(""));out.push(("agent:tool-progress",json!({"ToolProgress":{"id":p["itemId"],"output":p["delta"]}})));},
            _ => {}
        }
        out
    }
    fn finish(&mut self) -> Vec<(&'static str, Value)> {
        let mut out = vec![];
        for (id, _) in self.tools.drain() {
            self.results.push(json!({"type":"tool_result","tool_use_id":id,"content":format!("{}\nStopped before it finished",self.output.remove(&id).unwrap_or_default()),"is_error":true}));
            out.push(("agent:tool-end",json!({"ToolEnd":{"id":id,"result":super::tools::tool_result("Stopped before it finished".into(),true)}})));
        }
        self.flush_text();
        out
    }
}
fn tool(item: &Value) -> Option<(&'static str, Value)> {
    match item["type"].as_str()? {
        "commandExecution" => Some(("Bash", json!({"command":item["command"],"cwd":item["cwd"]}))),
        "fileChange" => Some((
            "Edit",
            json!({"file_path":item["changes"][0]["path"],"changes":item["changes"]}),
        )),
        "mcpToolCall" => Some((
            "MCP",
            json!({"server":item["server"],"tool":item["tool"],"arguments":item["arguments"]}),
        )),
        _ => None,
    }
}
pub fn approval(m: &Value) -> Value {
    let p = &m["params"];
    let file = m["method"] == "item/fileChange/requestApproval";
    json!({"id":m["id"],"ui":{"request_id":m["id"].to_string(),"tool_name":if file{"Edit"}else{"Bash"},"action":if file{"Change files"}else{"Run a command"},"details":p["command"].as_str().or(p["reason"].as_str()).unwrap_or("Your agent requests approval."),"input":json!({"command":p["command"],"file_path":p["grantRoot"]}).to_string(),"reason":"This agent’s native permissions apply.","position":1,"total":1}})
}
pub fn decision(allowed: bool, remember: bool) -> Value {
    json!({"decision":if !allowed{"decline"}else if remember{"acceptForSession"}else{"accept"}})
}

pub async fn send(id: String, prompt: String) -> Result<Vec<String>, String> {
    let before = read(&id)?;
    let mut t = before.clone();
    t.activate();
    if !std::path::Path::new(&t.folder).is_dir() {
        return Err("This task’s folder is unavailable. Restore it or choose another folder, then try again.".into());
    }
    let switched = t.engine != before.engine;
    let since = t.handoff_cursor();
    let mut wire_prompt = if since < t.messages.len() {
        let handoff=handoff::build(&t.messages,since,&t.folder,&t.mode,handoff::BUDGET);
        tracing::debug!(included=handoff.included,omitted=handoff.omitted,"Built task handoff");
        format!("{}\n\nCurrent user request:\n{}",handoff.text,prompt)
    }else{prompt.clone()};
    if running(&id) {
        return Err("This task is already working.".into());
    }
    let cli_name = if t.engine == Engine::Codex {
        "codex"
    } else {
        "claude"
    };
    let exe = executable(cli_name)
        .await
        .ok_or("This agent is no longer installed. Install and sign in to continue this task.")?;
    let mut cmd = if t.engine == Engine::Codex {
        let mut cmd = tokio::process::Command::new(exe);
        cmd.args(["app-server", "--stdio"]);
        cmd
    } else {
        catalog::claude_command(exe)?
    };
    cmd.env(
        "PATH",
        format!(
            "{}:{}",
            dirs::home_dir()
                .unwrap_or_default()
                .join(".local/bin")
                .display(),
            super::launch::user_path()
        ),
    )
    .env_remove("VIBEWORK_DEV_OPENROUTER_KEY")
    .env_remove("OPENROUTER_API_KEY");
    cmd.current_dir(&t.folder)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true);
    #[cfg(unix)]
    {
        cmd.process_group(0);
    }
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let pid = child.id().ok_or("No agent PID")?;
    let mut input = child.stdin.take().ok_or("No agent input")?;
    let stdout = child.stdout.take().ok_or("No agent output")?;
    let (tx, mut rx) = mpsc::unbounded_channel();
    let pending = Arc::new(Mutex::new(Vec::<Value>::new()));
    {
        let mut live = LIVE.lock().unwrap();
        if live.contains_key(&id) {
            kill_group(pid);
            return Err("This task is already working".into());
        }
        live.insert(
            id.clone(),
            Live {
                status: None,
                tx,
                pid,
                pending: pending.clone(),
            },
        );
    }
    t.messages
        .push(message("user", json!({"type":"text","text":prompt})));
    t.updated = chrono::Utc::now().to_rfc3339();
    t.settled = None;
    if let Err(e) = switching::save_starting(&t,&before,false) {
        kill_group(pid);
        LIVE.lock().unwrap().remove(&id);
        return Err(e);
    }
    emit(
        &id,
        "agent:state-change",
        json!({"StateChange":"Processing"}),
    );
    status(
        &id,
        Some(if t.engine == Engine::Codex {
            "Starting Codex…"
        } else {
            "Starting Claude Code…"
        }),
        false,
    );
    tauri::async_runtime::spawn(async move {
        let started = std::time::Instant::now();
        let started_at = chrono::Utc::now().to_rfc3339();
        let mut wait_ms = 0u64;
        let mut waiting_since = None;
        let mut reducer = Reducer::default();
        let mut stopped = false;
        let mut turn = None::<String>;
        let mut terminal = None::<String>;
        let mut ready=false;
        let mut meter=usage::TurnMeter::default();
        let mut limit_failure=None;
        let mut steers=HashMap::<String,super::inbox::Item>::new();
        let result:Result<(),String>=async{
 write(&mut input,json!({"id":1,"method":"initialize","params":{"clientInfo":{"name":"vibework","version":"1.0"},"capabilities":{"experimentalApi":true}}})).await?;
 let mut lines=BufReader::new(stdout).lines();let timeout=tokio::time::sleep(Duration::from_secs(300));tokio::pin!(timeout);
 loop {tokio::select! {
 _=&mut timeout,if !ready=>{return Err("The agent did not start within five minutes. Retry to start it again.".into())},
 command=rx.recv()=>{let Some(c)=command else{break};if c.get("steer").is_some(){let item:super::inbox::Item=serde_json::from_value(c["steer"].clone()).map_err(|e|e.to_string())?;
 if stopped||!ready||!pending.lock().unwrap().is_empty(){if let Some(reply)=STEER_REPLIES.lock().unwrap().remove(&item.id){let _=reply.send(Err("Wait for the agent to start and answer any pending prompt first.".into()));}}
 else {write(&mut input,json!({"id":item.id,"method":"turn/steer","params":{"threadId":t.native,"expectedTurnId":turn,"clientUserMessageId":item.id,"input":[{"type":"text","text":item.text}]}})).await?;steers.insert(item.id.clone(),item);}
 }else if c["stop"]==true{stopped=true;if let Some(turn)=&turn{write(&mut input,json!({"id":90,"method":"turn/interrupt","params":{"threadId":t.native,"turnId":turn}})).await?;}else{break;}}else if c.get("answer").is_some(){let question=pending.lock().unwrap().first().cloned();if let Some(q)=question{let qid=format!("question-{}",c["answer"]);let input=json!({"questions":q["questions"]});reducer.blocks.push(json!({"type":"tool_use","id":qid,"name":"AskUserQuestion","input":input}));reducer.results.push(json!({"type":"tool_result","tool_use_id":qid,"content":c["result"].to_string(),"is_error":false}));}write(&mut input,json!({"id":c["answer"],"result":c["result"]})).await?;let next={let mut q=pending.lock().unwrap();if !q.is_empty(){q.remove(0);}q.first().cloned()};if let Some(n)=next{show_pending(&id,&n);}if let Some(s)=waiting_since.take(){wait_ms+=std::time::Instant::now().duration_since(s).as_millis() as u64;}emit(&id,"agent:state-change",json!({"StateChange":"Processing"}));}else if c.get("approval").is_some(){write(&mut input,json!({"id":c["approval"],"result":c["result"].clone()})).await?;let next={let mut q=pending.lock().unwrap();if !q.is_empty(){let done=q.remove(0);if let (Some(item),Some(s))=(done["itemId"].as_str(),waiting_since){reducer.waits.insert(item.into(),s.elapsed().as_millis() as u64);}}q.first().cloned()};if let Some(n)=next{show_pending(&id,&n);}else{if let Some(s)=waiting_since.take(){wait_ms+=std::time::Instant::now().duration_since(s).as_millis() as u64;}emit(&id,"agent:state-change",json!({"StateChange":"Processing"}));}}},
 line=lines.next_line()=>{let Some(line)=line.map_err(|e|e.to_string())? else{return Err("The agent closed unexpectedly. Retry to resume this task.".into())};let Ok(m)=serde_json::from_str::<Value>(&line)else{continue};
 if m["method"]!="thread/tokenUsage/updated" || (ready && m["params"]["turnId"].as_str()==turn.as_deref()){meter.observe(&m);}usage::observe_limits(t.engine,&m);
 if m["method"]=="native/limits" && m["params"]["status"]=="rejected" {limit_failure=usage::blocked_message(t.engine);}
 if let Some(message)=usage::failed_message(t.engine,&m){limit_failure=Some(message);}
 if let Some(key)=m["id"].as_str().filter(|key|steers.contains_key(*key)).map(str::to_string){let item=steers.remove(&key).unwrap();let receipt=if m.get("error").is_some(){tracing::warn!("Native steering request refused: {}",m["error"]);Err(steering_receipt_error(&m["error"]))}else{reducer.mark_user(&item);super::inbox::delivered(&id,&item);super::inbox::remove(&id,&item.id).await?;Ok(())};if let Some(reply)=STEER_REPLIES.lock().unwrap().remove(&key){let _=reply.send(receipt);}continue;}
 if !ready && t.native.is_some() && ((m["id"]==2 && m["error"]["code"]==-32600 && missing_native_session(m["error"]["message"].as_str().unwrap_or(""))) || m["method"]=="native/sessionMissing") {
 let label=if t.engine==Engine::ClaudeCode{"Claude Code"}else{"Codex"};
 if let Some(user)=t.messages.last_mut(){user["notes"]=json!([format!("{label} no longer has this conversation, so it was given a summary of it")]);}
 t.native=None;
 if let Some(native)=t.natives.get_mut(t.engine.model()){native.id=None;}
 wire_prompt=format!("{}\n\nCurrent user request:\n{}",handoff::build(&before.messages,0,&t.folder,&t.mode,handoff::BUDGET).text,prompt);
 let(policy,sandbox)=modes(&t.mode);
 write(&mut input,json!({"id":2,"method":"thread/start","params":{"cwd":t.folder,"approvalPolicy":policy,"sandbox":sandbox,"approvalsReviewer":"user","usageBaseline":{}}})).await?;
 continue;
 }
 if m.get("error").is_some()&&m.get("id").is_some(){return Err(m["error"]["message"].as_str().unwrap_or("Codex request failed").into())}
 if m["id"]==1&&m.get("result").is_some(){write(&mut input,json!({"method":"initialized"})).await?;let (policy,sandbox)=modes(&t.mode);let mut params=json!({"cwd":t.folder,"approvalPolicy":policy,"sandbox":sandbox,"approvalsReviewer":"user"});if t.engine==Engine::ClaudeCode {params["usageBaseline"]=t.usage.iter().rev().find(|u|u.engine==t.engine && u.native_session.is_some() && u.native_session==t.native).and_then(|u|u.model_totals.clone()).unwrap_or(Value::Null);}if let Some(native)=&t.native{params["threadId"]=json!(native);}write(&mut input,json!({"id":2,"method":if t.native.is_some(){"thread/resume"}else{"thread/start"},"params":params})).await?;}
 else if m["id"]==2&&m.get("result").is_some(){t.native=m["result"]["thread"]["id"].as_str().map(str::to_string);if t.native.as_deref()==Some("pending"){t.native=None;}if t.native.is_none()&&t.engine==Engine::Codex{return Err("Codex did not return a session id".into())}switching::save_starting(&t,&before,ready)?;write(&mut input,json!({"id":3,"method":"turn/start","params":{"threadId":t.native,"input":[{"type":"text","text":wire_prompt}],"model":t.model,"effort":t.effort}})).await?;}
 else if m["method"]=="thread/native"{t.native=m["params"]["id"].as_str().map(str::to_string);switching::save_starting(&t,&before,ready)?;}
 else if m["method"]=="turn/started"{ready=true;super::inbox::started(&id).await?;if switched && t.messages.last().is_some_and(|m|m["notes"].as_array().is_none_or(|n|n.is_empty())) {let label=if t.engine==Engine::Codex{"Codex"}else{"Claude Code"};if let Some(user)=t.messages.last_mut(){user["notes"]=json!([format!("Switched to {label}")]);}}save(&t)?;status(&id,None,false);turn=m["params"]["turn"]["id"].as_str().map(str::to_string);}
 else if m["method"]=="turn/completed"{terminal=m["params"]["turn"]["status"].as_str().map(str::to_string);if terminal.as_deref()==Some("failed"){return Err(m["params"]["turn"]["error"]["message"].as_str().unwrap_or("Codex could not finish this turn.").into())}break;}
 else if m.get("id").is_some()&&m.get("method").is_some(){if m["method"]=="item/tool/requestUserInput"{let questions=m["params"]["questions"].as_array().cloned().unwrap_or_default();let ui=json!({"request_id":m["id"].to_string(),"questions":questions.iter().map(|q|json!({"header":q["header"],"question":q["question"],"options":q["options"],"multiSelect":false})).collect::<Vec<_>>()});let q=json!({"id":m["id"],"kind":"question","ui":ui,"questions":questions});let first={let mut pending=pending.lock().unwrap();pending.push(q.clone());pending.len()==1};if first{waiting_since=Some(std::time::Instant::now());show_pending(&id,&q);}}else if matches!(m["method"].as_str(),Some("item/fileChange/requestApproval"|"item/commandExecution/requestApproval"|"item/permissions/requestApproval")){let mut a=approval(&m);if m["method"]=="item/permissions/requestApproval"{a["permissions"]=m["params"]["permissions"].clone();a["ui"]["action"]=json!("Grant agent permissions");a["ui"]["details"]=json!(m["params"]["permissions"].to_string());}a["itemId"]=m["params"]["itemId"].clone();if let Some(item)=m["params"]["itemId"].as_str().and_then(|id|reducer.tools.get(id)){if let Some((_,input))=tool(item){a["ui"]["input"]=json!(input.to_string());if let Some(path)=input["file_path"].as_str(){a["ui"]["details"]=json!(path);}}}let show={let mut q=pending.lock().unwrap();q.push(a.clone());q.len()==1};if show{waiting_since=Some(std::time::Instant::now());emit(&id,"agent:permission-request",json!({"PermissionRequest":a["ui"]}));emit(&id,"agent:state-change",json!({"StateChange":"WaitingForPermission"}));}}else{write(&mut input,json!({"id":m["id"],"error":{"code":-32601,"message":"This host does not support this request."}})).await?;}}
 for(event,data)in reducer.apply(&m){emit(&id,event,data);}
 let mut snapshot=t.clone();
 snapshot.messages.extend(reducer.messages(json!({"kind":"stopped"})));switching::save_starting(&snapshot,&before,ready)?;
 }
 }}Ok(())}.await;
        if let Some(s) = waiting_since {
            wait_ms += s.elapsed().as_millis() as u64;
        }
        for (event, data) in reducer.finish() {
            emit(&id, event, data);
        }
        let error = result.err().map(|e|limit_failure.or_else(||usage::failed_message(t.engine,&json!({"message":e}))).unwrap_or(e));
        if let Some(mut record)=meter.record(t.engine,turn.clone().unwrap_or_else(||started_at.clone()),started_at.clone()){record.native_session=t.native.clone();t.usage.push(record);}
        let failed = error.is_some();
        let end = if let Some(e) = &error {
            Some(json!({"kind":"failed","text":e}))
        } else if stopped || terminal.as_deref() == Some("interrupted") {
            Some(json!({"kind":"stopped"}))
        } else {
            None
        };
        let timing = json!({"kind":"turn","id":started_at,"startedAt":started_at,"durationMs":(started.elapsed().as_millis() as u64).saturating_sub(wait_ms),"waitMs":wait_ms,"messageIndex":t.messages.len(),"blockIndex":null});
        t.messages.extend(reducer.messages(json!(end)));
        if let Some(user)=t.messages.iter_mut().rev().find(|m| m["role"]=="user" && m["content"].as_array().is_some_and(|b| b.iter().any(|b| b["type"]=="text"))){user["timings"]=json!([timing.clone()]);}
        t.updated = chrono::Utc::now().to_rfc3339();
        if ready {t.checkpoint();}else {t.engine=before.engine;t.model=before.model.clone();t.effort=before.effort.clone();t.native=before.native.clone();t.natives=before.natives.clone();t.pending=None;}
        let save_error = save(&t).err();
        drop(input);
        kill_group(pid);
        let _ = child.wait().await;
        LIVE.lock().unwrap().remove(&id);
        super::inbox::ended(&id);
        while let Ok(c)=rx.try_recv(){if let Some(key)=c["steer"]["id"].as_str(){if let Some(reply)=STEER_REPLIES.lock().unwrap().remove(key){let _=reply.send(Err("The turn ended. Your message is still queued.".into()));}}}
        for key in steers.keys(){if let Some(reply)=STEER_REPLIES.lock().unwrap().remove(key){let _=reply.send(Err("The agent stopped before confirming delivery. Your message is still queued.".into()));}}
        if let Some(e) = error.or(save_error) {
            emit(&id, "agent:error", json!({"Error":e}));
        }
        if let Ok(e) = super::get() {
            let _ = e
                .app
                .emit("agent:timing", json!({"sessionId":id,"timing":timing}));
        }
        emit(&id, "agent:state-change", json!({"StateChange":"Idle"}));
        emit(&id, "agent:done", json!("Done"));
        status(
            &id,
            if failed {
                Some("The agent could not finish. Retry to continue this task.")
            } else {
                None
            },
            failed,
        );
        super::inbox::complete(id.clone(),!failed&&!stopped&&terminal.as_deref()!=Some("interrupted"));
    });
    Ok(vec![])
}

fn steering_receipt_error(error: &Value) -> String {
    // The Claude wrapper reports this after sending input but before its read receipt.
    // A native JSON-RPC rejection, by contrast, confirms that input was not accepted.
    if error["message"].as_str().is_some_and(|s| s.contains("did not confirm reading")) {
        "The agent has not confirmed delivery. Check the task before retrying.".into()
    } else {
        "The agent could not take this message. It is still queued.".into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn steer_error_payloads_preserve_uncertain_claude_receipts() {
        assert!(steering_receipt_error(&json!({"message":"Claude did not confirm reading the message."})).contains("not confirmed"));
        for error in [
            json!({"code":-32600,"message":"expectedTurnId does not match the active turn"}),
            json!({"message":"Turn is no longer active"}),
        ] {
            assert_eq!(steering_receipt_error(&error),"The agent could not take this message. It is still queued.");
        }
    }

    #[test]
    fn recorded_text_edit_and_approval() {
        let events: Vec<Value> = serde_json::from_str(include_str!("fixtures/codex.json")).unwrap();
        let mut r = Reducer::default();
        let mut names = vec![];
        for m in events {
            if m["method"] == "item/fileChange/requestApproval" {
                assert_eq!(approval(&m)["ui"]["request_id"], "0");
            }
            names.extend(r.apply(&m).into_iter().map(|(n, _)| n));
        }
        assert!(names.contains(&"agent:text-delta"));
        assert!(r.blocks.iter().any(|b| b["name"] == "PresentFile"));
        assert!(r
            .blocks
            .iter()
            .any(|b| b["type"] == "text" && b["text"].as_str().unwrap().contains("hello")));
        assert_eq!(r.results.len(), 2);
    }
    #[test]
    fn native_modes() {
        assert_eq!(modes("ask"), ("untrusted", "read-only"));
        assert_eq!(modes("auto"), ("on-request", "workspace-write"));
        assert_eq!(modes("skip"), ("never", "danger-full-access"));
    }
    #[test]
    fn recorded_resume_does_not_replay_old_edits() {
        let events: Vec<Value> =
            serde_json::from_str(include_str!("fixtures/codex-resume.json")).unwrap();
        let mut r = Reducer::default();
        for m in events {
            r.apply(&m);
        }
        assert!(r
            .blocks
            .iter()
            .any(|b| b["text"].as_str().is_some_and(|s| s.contains("hello.txt"))));
        assert!(!r.blocks.iter().any(|b| b["name"] == "PresentFile"));
        assert!(r.results.is_empty());
    }
    #[test]
    fn allow_deny_and_remember() {
        assert_eq!(decision(true, false), json!({"decision":"accept"}));
        assert_eq!(decision(false, true), json!({"decision":"decline"}));
        assert_eq!(decision(true, true), json!({"decision":"acceptForSession"}));
    }
    #[test]
    fn stopped_tools_are_closed() {
        let mut r = Reducer::default();
        r.apply(&json!({"method":"item/started","params":{"item":{"id":"x","type":"commandExecution","command":"sleep 10"}}}));
        assert_eq!(r.finish().len(), 1);
        assert_eq!(r.results[0]["is_error"], true);
        assert!(r.finish().is_empty());
    }
    #[test]
    fn failed_edits_do_not_present_files() {
        let mut r = Reducer::default();
        let item = json!({"id":"edit","type":"fileChange","changes":[{"path":"/tmp/no.md"}],"status":"failed"});
        r.apply(&json!({"method":"item/started","params":{"item":item}}));
        r.apply(&json!({"method":"item/completed","params":{"item":item}}));
        assert!(!r.blocks.iter().any(|b| b["name"] == "PresentFile"));
    }
    #[test]
    fn reasoning_is_not_invented() {
        let mut r = Reducer::default();
        r.apply(&json!({"method":"item/completed","params":{"item":{"type":"reasoning","id":"x","summary":[]}}}));
        assert!(r.blocks.is_empty());
        r.apply(&json!({"method":"item/reasoning/summaryTextDelta","params":{"itemId":"x","delta":"Checking"}}));
        r.apply(
            &json!({"method":"item/completed","params":{"item":{"type":"reasoning","id":"x"}}}),
        );
        assert_eq!(r.blocks[0]["thinking"], "Checking");
    }
    #[test]
    fn persisted_engine_and_native_resume_identity() {
        let t = Task {
            usage: vec![], inbox:vec![],
            id: "test".into(),
            engine: Engine::Codex,
            name: "Task".into(),
            folder: "/tmp".into(),
            mode: "ask".into(),
            native: Some("native-thread".into()),
            model:None,effort:None,natives:HashMap::new(),pending:None,open_seen:0,open_start:None,open_note:None,
            created: "now".into(),
            updated: "now".into(),
            settled: None,
            deleted: false, deleted_at:None,
            messages: vec![],
        };
        let saved = serde_json::to_vec(&t).unwrap();
        let loaded: Task = serde_json::from_slice(&saved).unwrap();
        assert_eq!(loaded.engine, Engine::Codex);
        assert_eq!(loaded.native.as_deref(), Some("native-thread"));
        assert_eq!(info(loaded).cost_usd, None);
    }
    #[test]
    fn storage_path_rejects_traversal() {
        for id in ["../x", "/tmp/x", "a/b", ""] {
            assert!(path(id).is_err())
        }
    }
}

fn version_at_least(version: &str, min: [u32; 3]) -> bool {
    let v: Vec<u32> = version
        .split('.')
        .take(3)
        .filter_map(|s| s.parse().ok())
        .collect();
    v.len() == 3 && v.as_slice() >= min.as_slice()
}
fn status(id: &str, message: Option<&str>, retry: bool) {
    if let Some(l) = LIVE.lock().unwrap().get_mut(id) {
        l.status = Some(json!({"message":message,"retry":retry}));
    }
    emit(
        id,
        "agent:external-status",
        json!({"message":message,"retry":retry}),
    );
}
#[tauri::command]
pub async fn agent_retry_external(session_id: String) -> Result<(), String> {
    let t = read(&session_id)?;
    let prompt = t
        .messages
        .iter()
        .rev()
        .find(|m| m["role"] == "user" && m["content"][0]["type"] == "text")
        .and_then(|m| m["content"][0]["text"].as_str())
        .ok_or("No message to retry")?
        .to_string();
    switching::send(session_id, prompt).await.map(|_| ())
}

fn show_pending(id: &str, pending: &Value) {
    if pending["kind"] == "question" {
        emit(
            id,
            "agent:ask-user-question",
            json!({"AskUserQuestion":pending["ui"]}),
        );
    } else {
        emit(
            id,
            "agent:permission-request",
            json!({"PermissionRequest":pending["ui"]}),
        );
    }
}

#[tauri::command]
pub fn agent_external_status(session_id: String) -> Option<Value> {
    if let Some(l) = LIVE.lock().unwrap().get(&session_id) {
        return l.status.clone();
    }
    let t = read(&session_id).ok()?;
    let last = t.messages.iter().rev().find(|m| m["role"] == "assistant")?;
    (last["end"]["kind"]=="failed").then(||json!({"message":"The agent could not finish. Retry to continue this task.","retry":true}))
}

/// Only an explicit missing-session response permits a fresh session. Auth,
/// network, permission and quota failures must retain the existing identity.
fn missing_native_session(message:&str)->bool {
 let m=message.to_ascii_lowercase();
 m.contains("no conversation found with session id") || m.contains("no rollout found for thread")
}
#[cfg(test)] mod durable_tests {
 use super::*;
 #[test] fn missing_session_is_distinct_from_transient_failures(){
  for message in ["No conversation found with session ID: redacted","no rollout found for thread redacted"]{assert!(missing_native_session(message));}
  for message in ["Authentication failed","usage limit reached","connection reset","permission denied"]{assert!(!missing_native_session(message));}
 }
}

pub async fn purge_deleted(now:i64,client:&super::client::Client)->Result<usize,String>{
 let mut count=0;
 let Ok(files)=std::fs::read_dir(directory())else{return Ok(0)};
 for file in files.flatten(){let path=file.path();if path.extension().and_then(|e|e.to_str())!=Some("json"){continue;}
  let Ok(task)=std::fs::read(&path).ok().and_then(|b|serde_json::from_slice::<Task>(&b).ok()).ok_or(())else{continue;};
  if trash_expired(&task,now){if task.natives.contains_key("opencode") {client.delete_session(&super::client::engine_session_id(&task.id)).await?;}std::fs::remove_file(path).map_err(|e|e.to_string())?;count+=1;}
 }Ok(count)
}
pub(super) fn trash_expired(task:&Task,now:i64)->bool{task.deleted&&task.deleted_at.is_some_and(|at|now.saturating_sub(at)>=7*24*60*60*1000)}

#[cfg(test)] mod durable_history_tests {
 use super::*;
 #[test] fn recorded_codex_missing_session(){let m:Value=serde_json::from_str(include_str!("fixtures/codex-missing.json")).unwrap();assert_eq!(m["error"]["code"],-32600);assert!(missing_native_session(m["error"]["message"].as_str().unwrap()));}
 #[test] fn interrupted_reasoning_and_tool_output_survive_serialization(){
  let mut r=Reducer::default();r.apply(&json!({"method":"item/reasoning/textDelta","params":{"itemId":"reason","delta":"Thinking first"}}));
  r.apply(&json!({"method":"item/started","params":{"item":{"id":"shell","type":"commandExecution","command":"pwd"}}}));
  r.apply(&json!({"method":"item/commandExecution/outputDelta","params":{"itemId":"shell","delta":"/tmp/task"}}));
  let snapshot=r.messages(json!({"kind":"stopped"}));let reopened:Vec<MessageInfo>=serde_json::from_slice(&serde_json::to_vec(&snapshot).unwrap()).unwrap();
  assert_eq!(reopened[0].content[0]["type"],"thinking");assert!(reopened.last().unwrap().content[0]["content"].as_str().unwrap().contains("/tmp/task"));
  r.finish();let final_history=r.messages(Value::Null);assert_eq!(final_history[0]["content"][0]["thinking"],"Thinking first");
 }
 #[test] fn active_history_never_expires_and_trash_uses_deletion_time(){
  let mut t:Task=serde_json::from_value(json!({"id":"test","engine":"codex","name":"old","folder":"/tmp","mode":"ask","native":null,"created":"2000","updated":"2000","settled":null,"deleted":false,"messages":[]})).unwrap();
  assert!(!trash_expired(&t,i64::MAX));t.deleted=true;assert!(!trash_expired(&t,i64::MAX));t.deleted_at=Some(1000);assert!(!trash_expired(&t,1001));assert!(trash_expired(&t,1000+7*24*60*60*1000));
 }
}
