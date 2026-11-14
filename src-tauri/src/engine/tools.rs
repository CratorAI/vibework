//! Translate OpenCode tool calls into the shapes the UI already renders
//! (Claude-style tool names and inputs: `Bash {command}`,
//! `Write {file_path, content}`, ...).

use serde_json::{json, Map, Value};
use std::path::Path;

/// Names of the user's connectors seen in this app run (removed ones stay, so
/// their calls in older history keep their labels).
static CONNECTORS: std::sync::RwLock<Vec<String>> = std::sync::RwLock::new(Vec::new());

#[cfg(test)]
pub fn set_connector_names(names: Vec<String>) {
    CONNECTORS.write().unwrap().clear();
    add_connector_names(&names);
}

pub fn add_connector_names(names: &[String]) {
    let mut known = CONNECTORS.write().unwrap();
    for name in names {
        if !known.contains(name) {
            known.push(name.clone());
        }
    }
    // Longest first, so `a_b` wins over `a` when both exist.
    known.sort_by_key(|n| std::cmp::Reverse(n.len()));
}

/// MCP tools: the app's own server (`vibework_present_file` → `PresentFile`)
/// and the user's connectors (`linear_create_issue` → `mcp__linear__create_issue`,
/// the UI's naming, which it labels "Create issue in Linear").
fn mcp_tool_name(engine_name: &str) -> Option<String> {
    if let Some(tool) = engine_name.strip_prefix(&format!("{}_", super::bridge::MCP_SERVER_NAME)) {
        if let Some((_, app)) = super::app_tools::TOOLS.iter().find(|(t, _)| *t == tool) {
            return Some(app.to_string());
        }
    }
    let names = CONNECTORS.read().unwrap();
    names.iter().find_map(|server| {
        engine_name
            .strip_prefix(server.as_str())
            .and_then(|rest| rest.strip_prefix('_'))
            .filter(|tool| !tool.is_empty())
            .map(|tool| format!("{}{server}__{tool}", crate::connectors::TOOL_NAME_PREFIX))
    })
}

/// Whether a finished tool may have produced a file for the gallery.
pub fn produces_files(app_name: &str) -> bool {
    matches!(app_name, "Write" | "Edit" | "PresentFile" | "Bash")
}

/// OpenCode tool name → app tool name. Unknown tools keep their engine name.
pub fn app_tool_name(engine_name: &str) -> String {
    if let Some(name) = mcp_tool_name(engine_name) {
        return name;
    }
    match engine_name {
        "shell" | "bash" => "Bash",
        "write" => "Write",
        "edit" | "patch" | "apply_patch" | "multiedit" => "Edit",
        "read" => "Read",
        "glob" => "Glob",
        "grep" => "Grep",
        "todowrite" => "TodoWrite",
        "webfetch" => "WebFetch",
        "websearch" => "WebSearch",
        "question" => "AskUserQuestion",
        "skill" => "Skill",
        // The engine's subagent tool: a helper (see `engine::prompt`).
        "subagent" => "Helper",
        other => other,
    }
    .to_string()
}

fn absolute(path: &str, working_dir: Option<&str>) -> String {
    if Path::new(path).is_absolute() {
        return path.to_string();
    }
    match working_dir {
        Some(dir) => Path::new(dir).join(path).to_string_lossy().to_string(),
        None => path.to_string(),
    }
}

/// Rename keys the UI reads (camelCase or `path` → snake_case `file_path`, ...),
/// keeping every other field as it is.
pub fn app_tool_input(engine_name: &str, input: &Value, working_dir: Option<&str>) -> Value {
    let Some(obj) = input.as_object() else { return input.clone() };
    let mut out: Map<String, Value> = Map::new();
    for (key, value) in obj {
        let renamed = match key.as_str() {
            "filePath" | "path" if matches!(engine_name, "write" | "edit" | "read" | "multiedit") => "file_path",
            "oldString" => "old_string",
            "newString" => "new_string",
            "replaceAll" => "replace_all",
            // The native Skill tool names the skill `skill`
            "id" if engine_name == "skill" => "skill",
            other => other,
        };
        out.insert(renamed.to_string(), value.clone());
    }
    if let Some(Value::String(path)) = out.get("file_path").cloned() {
        out.insert("file_path".into(), Value::String(absolute(&path, working_dir)));
    }
    if engine_name == "todowrite" {
        if let Some(Value::Array(todos)) = out.get_mut("todos") {
            for todo in todos.iter_mut() {
                if let Some(item) = todo.as_object_mut() {
                    if !item.contains_key("activeForm") {
                        let content = item.get("content").cloned().unwrap_or(Value::String(String::new()));
                        item.insert("activeForm".into(), content);
                    }
                }
            }
        }
    }
    Value::Object(out)
}

/// What a helper's step shows as its result: the helper's answer without the
/// engine's `<subagent …>` wrapper, or its failure without session ids (the
/// model still gets the engine's own text).
pub fn helper_result(text: &str, failed: bool) -> String {
    let text = text.trim();
    if !failed {
        let inner = text.strip_prefix("<subagent").and_then(|rest| rest.split_once('>')).map(|(_, body)| body).unwrap_or(text);
        return inner.trim_end().strip_suffix("</subagent>").unwrap_or(inner).trim().to_string();
    }
    // "Subagent failed (sessionID: ses_x): reason", "Subagent cancelled (sessionID: ses_x)",
    // "Tool execution interrupted (sessionID: ses_x)".
    let mut out = String::new();
    let mut rest = text;
    while let Some(start) = rest.find(" (sessionID: ") {
        out.push_str(&rest[..start]);
        rest = rest[start..].find(')').map(|end| &rest[start + end + 1..]).unwrap_or("");
    }
    out.push_str(rest);
    if let Some(reason) = out.strip_prefix("Subagent failed: ") {
        return format!("The helper stopped with an error: {reason}");
    }
    match out.as_str() {
        "Subagent cancelled" | "Tool execution interrupted" => "Stopped before it finished".into(),
        _ => out,
    }
}

/// Join a tool's result content parts into the text the UI shows.
pub fn content_text(content: &Value) -> String {
    let Some(parts) = content.as_array() else {
        return content.as_str().map(str::to_string).unwrap_or_default();
    };
    parts
        .iter()
        .map(|part| match part["type"].as_str() {
            Some("text") => part["text"].as_str().unwrap_or_default().to_string(),
            Some("image") | Some("media") => "[Image]".to_string(),
            Some("file") => format!("[File: {}]", part["name"].as_str().or(part["uri"].as_str()).unwrap_or("attachment")),
            _ => String::new(),
        })
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

/// `ToolResult` in the shape the UI reads: `{content: {Text}, is_error}`.
pub fn tool_result(text: String, is_error: bool) -> Value {
    json!({ "content": { "Text": text }, "is_error": is_error })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_names_and_inputs() {
        assert_eq!(app_tool_name("shell"), "Bash");
        assert_eq!(app_tool_name("write"), "Write");
        assert_eq!(app_tool_name("mystery"), "mystery");
        let input = app_tool_input("write", &json!({"path": "hello.txt", "content": "hi"}), Some("/w"));
        assert_eq!(input, json!({"file_path": "/w/hello.txt", "content": "hi"}));
        let edit = app_tool_input("edit", &json!({"filePath": "/a/b.txt", "oldString": "x", "newString": "y"}), Some("/w"));
        assert_eq!(edit, json!({"file_path": "/a/b.txt", "old_string": "x", "new_string": "y"}));
        let shell = app_tool_input("shell", &json!({"command": "ls -la"}), Some("/w"));
        assert_eq!(shell, json!({"command": "ls -la"}));
    }

    #[test]
    fn maps_mcp_tools() {
        assert_eq!(app_tool_name("vibework_present_file"), "PresentFile");
        assert_eq!(app_tool_name("vibework_browser"), "Browser");
        assert_eq!(app_tool_name("vibework_web_search"), "WebSearch");
        set_connector_names(vec!["notes".into(), "notes_pro".into()]);
        assert_eq!(app_tool_name("notes_add_note"), "mcp__notes__add_note");
        assert_eq!(app_tool_name("notes_pro_list"), "mcp__notes_pro__list");
        assert_eq!(app_tool_name("vibework_unknown"), "vibework_unknown");
    }

    #[test]
    fn todos_get_active_form() {
        let input = app_tool_input("todowrite", &json!({"todos": [{"content": "Do it", "status": "pending"}]}), None);
        assert_eq!(input["todos"][0]["activeForm"], "Do it");
    }

    #[test]
    fn joins_result_text() {
        let content = json!([{"type": "text", "text": "a"}, {"type": "image"}, {"type": "text", "text": "b"}]);
        assert_eq!(content_text(&content), "a\n[Image]\nb");
    }
}
