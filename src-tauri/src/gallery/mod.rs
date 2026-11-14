//! The Artifacts page's index: files each task wrote or presented, read
//! from task histories. Metadata only; never opens artifact contents.
use serde::Serialize;
use crate::engine::types::{MessageInfo, SessionInfo};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::OnceLock,
    time::SystemTime,
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    session_id: String,
    task_name: String,
    task_settled: bool,
    path: String,
    name: String,
    type_hint: String,
    size_bytes: u64,
    modified_ms: u64,
    exists: bool,
    presented: bool,
    last_touched_at: String,
    /// Older histories do not record tool timing. Be honest about the fallback.
    touch_time_estimated: bool,
}
fn extensions() -> &'static Vec<String> {
    static EXTS: OnceLock<Vec<String>> = OnceLock::new();
    EXTS.get_or_init(|| {
        serde_json::from_str(include_str!("../../../src/gallery/extensions.json"))
            .expect("artifact extensions")
    })
}
fn hint(name: &str) -> String {
    let lower = name.to_lowercase();
    extensions()
        .iter()
        .find(|e| lower.ends_with(&format!(".{e}")))
        .cloned()
        .unwrap_or_else(|| {
            lower
                .rsplit_once('.')
                .map(|(_, e)| e.to_owned())
                .unwrap_or_default()
        })
}
fn excluded(path: &Path) -> bool {
    path.components().any(|c| {
        let s = c.as_os_str().to_string_lossy();
        s.starts_with('.') || matches!(s.as_ref(), "node_modules" | "venv" | "env" | "__pycache__")
    })
}
fn absolute(path: &str, root: &Path) -> PathBuf {
    let p = if let Some(p) = path.strip_prefix("~/") {
        dirs::home_dir().unwrap_or_default().join(p)
    } else {
        PathBuf::from(path)
    };
    let p = if p.is_absolute() { p } else { root.join(p) };
    let mut normalized = PathBuf::new();
    for c in p.components() {
        match c {
            std::path::Component::ParentDir => {
                normalized.pop();
            }
            std::path::Component::CurDir => {}
            _ => normalized.push(c),
        }
    }
    normalized.canonicalize().unwrap_or(normalized)
}
/// The files one task wrote or presented, from its history (one item per path).
fn task_items(session: &SessionInfo, root: &str, messages: &[MessageInfo]) -> Vec<Item> {
    let mut files: HashMap<String, Item> = HashMap::new();
    for message in messages {
        if message.role != "assistant" { continue; }
        for block in message.content.as_array().into_iter().flatten() {
            let tool = block["name"].as_str().unwrap_or("");
            if block["type"] != "tool_use" || !matches!(tool,"PresentFile"|"Write"|"Edit"|"MultiEdit") { continue; }
            let Some(raw) = block["input"]["file_path"].as_str() else {continue};
            let path = absolute(raw, &PathBuf::from(root));
            let path = crate::motion::project_ancestor(&path, Path::new(root)).unwrap_or(path);
            let motion = crate::motion::is_project(&path);
            if excluded(&path) {continue;}
            let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            let presented = tool == "PresentFile";
            if !motion && !presented && !extensions().iter().any(|e|name.to_lowercase().ends_with(&format!(".{e}"))) {continue;}
            let stat = fs::metadata(&path).ok().filter(|s|s.is_file() || motion);
            let path = path.to_string_lossy().to_string();
            let presented = presented || files.get(&path).is_some_and(|f|f.presented);
            files.insert(path.clone(), Item {
                session_id:session.session_id.clone(), task_name:session.conversation_name.clone().unwrap_or(session.name.clone()),
                task_settled:session.settled_at.is_some(),path:path.clone(),name:name.clone(),type_hint:if motion {"motion".into()} else {hint(&name)},
                size_bytes:stat.as_ref().map_or(0,|s|s.len()),
                modified_ms:if motion {crate::motion::project_stamp(Path::new(&path))} else {stat.as_ref().and_then(|s|s.modified().ok()).and_then(|s|s.duration_since(SystemTime::UNIX_EPOCH).ok()).map_or(0,|d|d.as_millis() as u64)},
                exists:stat.is_some(),presented,last_touched_at:session.updated_at.clone(),touch_time_estimated:true,
            });
        }
    }
    files.into_values().collect()
}

async fn engine_index() -> Result<Vec<Item>, String> {
    use futures::{stream, StreamExt, TryStreamExt};
    let sessions = crate::engine::commands::list_sessions().await?;
    // buffered (not unordered) preserves the original session order, including
    // stable-sort ties. Bound both engine requests and filesystem jobs to four.
    let batches: Vec<Vec<Item>> = stream::iter(sessions.into_iter().map(|session| async move {
        let root = crate::engine::commands::get_working_folder(session.session_id.clone()).await?.unwrap_or_default();
        let messages = crate::engine::commands::load_session(session.session_id.clone()).await?;
        tauri::async_runtime::spawn_blocking(move || task_items(&session, &root, &messages))
            .await.map_err(|e| e.to_string())
    })).buffered(4).try_collect().await?;
    let mut items: Vec<Item> = batches.into_iter().flatten().collect();
    items.sort_by(|a,b|b.last_touched_at.cmp(&a.last_touched_at).then(a.path.cmp(&b.path)));
    Ok(items)
}

#[tauri::command]
pub async fn artifacts_index(window: tauri::WebviewWindow) -> Result<Vec<Item>, String> {
    if window.label() != "main" {
        return Err("Gallery is only available in the main window".into());
    }
    engine_index().await
}

#[cfg(test)]
mod tests {
    use super::*;
    fn tool(name: &str, path: &str) -> serde_json::Value {
        serde_json::json!({"type":"tool_use","id":path,"name":name,"input":{"file_path":path}})
    }
    #[test]
    fn task_items_keep_artifacts_and_presented_files() {
        let root = std::env::temp_dir().join(format!("gallery-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("doc.md"), "hello").unwrap();
        let session = SessionInfo {
            session_id: "task".into(), name: "Task".into(), description: String::new(), agent_type: "assistant".into(),
            created_at: "2026-01-01T00:00:00Z".into(), updated_at: "2026-01-02T00:00:00Z".into(),
            conversation_name: Some("Named".into()), settled_at: Some("2026-01-03T00:00:00Z".into()), cost_usd: None, working_folder: None,
        };
        let blocks = vec![
            tool("Write", "doc.md"), tool("PresentFile", "doc.md"), tool("Edit", "doc.md"),
            tool("Write", "missing.slides.md"), tool("Write", "scratch.json"), tool("Write", "script.py"),
            tool("Write", "node_modules/a.md"), tool("PresentFile", ".hidden/a.md"), tool("PresentFile", "report.docx"),
            tool("Read", "other.md"),
        ];
        let messages = vec![
            MessageInfo { timings: vec![], role: "user".into(), content: serde_json::json!([tool("Write", "user.md")]), notes: vec![], end: None, source_ids: Vec::new() },
            MessageInfo { timings: vec![], role: "assistant".into(), content: serde_json::Value::Array(blocks), notes: vec![], end: None, source_ids: Vec::new() },
        ];
        let items = task_items(&session, root.to_str().unwrap(), &messages);
        assert_eq!(items.len(), 3, "{items:?}");
        let doc = items.iter().find(|i| i.name == "doc.md").unwrap();
        assert!(doc.presented && doc.exists && doc.task_settled);
        assert_eq!((doc.size_bytes, doc.task_name.as_str()), (5, "Named"));
        assert!(items.iter().any(|i| i.type_hint == "slides.md" && !i.exists));
        assert!(items.iter().any(|i| i.name == "report.docx" && i.presented));
        fs::remove_dir_all(root).unwrap();
    }
}
