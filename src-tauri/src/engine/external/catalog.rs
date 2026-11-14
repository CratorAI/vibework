//! Native model metadata only: no inference request or native configuration access.
use super::*;
static PROBES: Lazy<Mutex<Vec<u32>>> = Lazy::new(|| Mutex::new(Vec::new()));
pub(super) struct Owned(u32);
impl Owned { pub(super) fn new(pid:u32)->Self { PROBES.lock().unwrap().push(pid);Self(pid) } }
impl Drop for Owned {
    fn drop(&mut self) {
        kill_group(self.0);
        PROBES.lock().unwrap().retain(|p| *p != self.0);
    }
}
pub fn shutdown() {
    for pid in PROBES.lock().unwrap().iter() {
        kill_group(*pid);
    }
}
pub(super) fn claude_command(exe: PathBuf) -> Result<tokio::process::Command, String> {
    let dir = directory().join("runtime");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let script = dir.join("claude.mjs");
    let bytes = include_bytes!("../../../resources/agents/claude.mjs");
    if std::fs::read(&script).ok().as_deref() != Some(bytes.as_slice()) {
        let tmp = dir.join(format!("{}.mjs", uuid::Uuid::new_v4()));
        std::fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
        std::fs::rename(tmp, &script).map_err(|e| e.to_string())?;
    }
    let mut cmd = tokio::process::Command::new(super::super::sidecar::binary_path()?);
    cmd.env("BUN_BE_BUN", "1").arg(script).arg(exe);
    Ok(cmd)
}
fn fallback(engine: Engine) -> Vec<Value> {
    vec![row(engine, "", "Default", vec![], None)]
}
fn row(engine: Engine, id: &str, name: &str, efforts: Vec<String>, default: Option<&str>) -> Value {
    let key = Selection {
        engine,
        model: (!id.is_empty()).then(|| id.into()),
        effort: None,
    }
    .key();
    json!({"id":key,"nativeModel":id,"harness":engine.model(),"name":name,"efforts":efforts,"defaultEffort":default,"contextLength":null,"promptPrice":null,"completionPrice":null,"supportsReasoning":!efforts.is_empty(),"supportsImages":false,"agent":true})
}
pub fn normalize(engine: Engine, rows: &[Value]) -> Vec<Value> {
    rows.iter()
        .filter(|m| m["hidden"] != true)
        .filter_map(|m| {
            if engine == Engine::Codex {
                Some({
                    let mut r = row(
                        engine,
                        m["model"].as_str()?,
                        m["displayName"].as_str().unwrap_or("Default"),
                        m["supportedReasoningEfforts"]
                            .as_array()
                            .into_iter()
                            .flatten()
                            .filter_map(|e| e["reasoningEffort"].as_str().map(str::to_string))
                            .collect(),
                        m["defaultReasoningEffort"].as_str(),
                    );
                    r["isDefault"] = json!(m["isDefault"] == true);
                    r
                })
            } else {
                Some({
                    let mut r = row(
                        engine,
                        m["value"].as_str()?,
                        m["displayName"].as_str().unwrap_or("Default"),
                        m["supportedEffortLevels"]
                            .as_array()
                            .into_iter()
                            .flatten()
                            .filter_map(|e| e.as_str().map(str::to_string))
                            .collect(),
                        None,
                    );
                    r["isDefault"] = json!(m["value"] == "default");
                    r
                })
            }
        })
        .collect()
}
async fn probe(engine: Engine) -> Result<Vec<Value>, String> {
    let name = if engine == Engine::Codex {
        "codex"
    } else {
        "claude"
    };
    let exe = executable(name).await.ok_or("Agent not installed")?;
    let dir = directory().join("catalog");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut cmd = if engine == Engine::Codex {
        let mut c = tokio::process::Command::new(exe);
        c.args(["app-server", "--stdio"]);
        c
    } else {
        let mut c = claude_command(exe)?;
        c.arg("--catalog");
        c
    };
    cmd.current_dir(&dir)
        .env("PATH", super::super::launch::user_path())
        .env_remove("OPENROUTER_API_KEY")
        .env_remove("VIBEWORK_DEV_OPENROUTER_KEY")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true);
    #[cfg(unix)]
    cmd.process_group(0);
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let pid = child.id().ok_or("No child pid")?;
    PROBES.lock().unwrap().push(pid);
    let guard = Owned(pid);
    let mut input = child.stdin.take().ok_or("No catalog input")?;
    let mut lines = BufReader::new(child.stdout.take().ok_or("No catalog output")?).lines();
    let result=tokio::time::timeout(Duration::from_secs(300),async{
 if engine==Engine::Codex {write(&mut input,json!({"id":1,"method":"initialize","params":{"clientInfo":{"name":"vibework_models","version":"1.0"}}})).await?;}
 let mut rows=Vec::new();
 while let Some(line)=lines.next_line().await.map_err(|e|e.to_string())?{
  let Ok(m)=serde_json::from_str::<Value>(&line)else{continue};
  if engine==Engine::ClaudeCode {if let Some(a)=m.as_array(){return Ok(normalize(engine,a))}return Err("Claude Code could not list models".into());}
  if m.get("error").is_some(){return Err("Codex could not list models".into())}
  if m["id"]==1{write(&mut input,json!({"method":"initialized"})).await?;write(&mut input,json!({"id":2,"method":"model/list","params":{}})).await?;}
  if m["id"]==2{rows.extend(m["result"]["data"].as_array().cloned().unwrap_or_default());if let Some(cursor)=m["result"]["nextCursor"].as_str(){write(&mut input,json!({"id":2,"method":"model/list","params":{"cursor":cursor}})).await?;}else{return Ok(normalize(engine,&rows))}}
 }
 Err("Agent closed before listing models".into())
 }).await.map_err(|_|"Model catalog timed out".to_string()).and_then(|r|r);
    drop(guard);
    let _ = child.wait().await;
    result
}
#[tauri::command]
pub async fn agent_models(harness: String, refresh: Option<bool>) -> Result<Vec<Value>, String> {
    let engine = selected(&harness).ok_or("Unknown agent")?;
    let file = directory().join(if engine == Engine::Codex {
        "codex-models.json"
    } else {
        "claude-models.json"
    });
    if !refresh.unwrap_or(false) {
        if let Ok(b) = std::fs::read(&file) {
            if let Ok(rows) = serde_json::from_slice::<Vec<Value>>(&b) {
                return Ok(rows);
            }
        }
        return Ok(fallback(engine));
    }
    let rows = probe(engine).await.unwrap_or_else(|_| fallback(engine));
    let rows = if rows.is_empty() {
        fallback(engine)
    } else {
        rows
    };
    std::fs::create_dir_all(directory()).map_err(|e| e.to_string())?;
    std::fs::write(file, serde_json::to_vec(&rows).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    Ok(rows)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_efforts_are_not_invented() {
        let rows = normalize(
            Engine::ClaudeCode,
            &[json!({"value":"test","displayName":"Test"})],
        );
        assert_eq!(rows[0]["efforts"], json!([]));
        let rows = normalize(
            Engine::Codex,
            &[
                json!({"model":"test","displayName":"Test","supportedReasoningEfforts":[{"reasoningEffort":"future"}]}),
            ],
        );
        assert_eq!(rows[0]["efforts"], json!(["future"]));
    }
}
