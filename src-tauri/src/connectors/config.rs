//! The connectors file: the engine's own global `opencode.json`
//! (`<app data>/opencode/config/opencode/opencode.json`), where OpenCode keeps
//! MCP servers under `mcp.servers`.
//!
//! The app writes its generated engine config to `opencode.jsonc` in the same
//! folder; the engine merges both, and `opencode mcp add --global` (and
//! Settings → Connectors) edit only this file, so a connector added either way
//! survives the app rewriting its config at every launch.
//!
//! Entries are kept in OpenCode's V2 shape:
//!
//! ```json
//! { "mcp": { "servers": {
//!     "files":   { "type": "local", "command": ["npx", "-y", "srv", "/tmp"], "environment": { "X": "y" } },
//!     "granola": { "type": "remote", "url": "https://mcp.granola.ai/mcp" },
//!     "github":  { "type": "remote", "url": "https://api.githubcopilot.com/mcp/", "oauth": false, "headers": { "Authorization": "Bearer …" } }
//! } } }
//! ```
//!
//! The UI keeps speaking the form's shape (`{command, args, env}` or
//! `{type: "http", url, headers}`); [`to_native`] and [`summarize`] translate.
//! Unknown fields (top level and per entry) survive every rewrite.

use std::path::Path;

use serde_json::{json, Map, Value};

pub const SCHEMA_URL: &str = "https://opencode.ai/config.json";

/// The whole connectors file.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ConnectorsDoc {
    root: Map<String, Value>,
}

impl ConnectorsDoc {
    /// Parse the file. Empty text is an empty file.
    pub fn parse(text: &str) -> Result<Self, String> {
        if text.trim().is_empty() {
            return Ok(Self::fresh());
        }
        let value: Value = serde_json::from_str(text).map_err(|e| format!("opencode.json is not valid JSON: {e}"))?;
        let Value::Object(root) = value else {
            return Err("opencode.json must hold a JSON object".into());
        };
        match root.get("mcp").map(|m| m.get("servers")) {
            None | Some(None) | Some(Some(Value::Object(_))) => Ok(Self { root }),
            Some(Some(_)) => Err("\"mcp.servers\" in opencode.json must be an object of server name → config".into()),
        }
    }

    /// An empty file with the schema line.
    pub fn fresh() -> Self {
        let mut root = Map::new();
        root.insert("$schema".into(), json!(SCHEMA_URL));
        root.insert("mcp".into(), json!({ "servers": {} }));
        Self { root }
    }

    /// Read from disk. A missing file is an empty one.
    pub fn load(path: &Path) -> Result<Self, String> {
        match std::fs::read_to_string(path) {
            Ok(text) => Self::parse(&text),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Self::fresh()),
            Err(e) => Err(format!("Could not read {}: {e}", path.display())),
        }
    }

    /// Write atomically, owner-only.
    pub fn save(&self, path: &Path) -> Result<(), String> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
        }
        let text = serde_json::to_string_pretty(&Value::Object(self.root.clone())).unwrap_or_else(|_| "{}".into()) + "\n";
        let tmp = path.with_extension(format!("json.tmp-{}", uuid::Uuid::new_v4().simple()));
        std::fs::write(&tmp, text).map_err(|e| format!("Could not write {}: {e}", tmp.display()))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600));
        }
        std::fs::rename(&tmp, path).map_err(|e| format!("Could not write {}: {e}", path.display()))
    }

    fn servers_map(&self) -> Option<&Map<String, Value>> {
        self.root.get("mcp")?.get("servers")?.as_object()
    }

    fn servers_mut(&mut self) -> &mut Map<String, Value> {
        let mcp = self.root.entry("mcp").or_insert_with(|| json!({}));
        if !mcp.is_object() {
            *mcp = json!({});
        }
        let servers = mcp.as_object_mut().unwrap().entry("servers").or_insert_with(|| json!({}));
        if !servers.is_object() {
            *servers = json!({});
        }
        servers.as_object_mut().unwrap()
    }

    /// (name, entry) in name order.
    pub fn servers(&self) -> Vec<(String, Value)> {
        let mut out: Vec<(String, Value)> = self.servers_map().map(|m| m.iter().map(|(k, v)| (k.clone(), v.clone())).collect()).unwrap_or_default();
        out.sort_by(|a, b| a.0.cmp(&b.0));
        out
    }

    pub fn get(&self, name: &str) -> Option<&Value> {
        self.servers_map()?.get(name)
    }

    pub fn contains(&self, name: &str) -> bool {
        self.get(name).is_some()
    }

    pub fn set(&mut self, name: &str, entry: Value) {
        self.servers_mut().insert(name.to_string(), entry);
    }

    pub fn remove(&mut self, name: &str) -> Option<Value> {
        self.servers_mut().remove(name)
    }

    #[cfg(test)]
    pub fn to_value(&self) -> Value {
        Value::Object(self.root.clone())
    }
}

/// What the UI shows about an entry (lenient: also for entries it can't use).
#[derive(Debug, Clone, PartialEq)]
pub struct EntrySummary {
    /// "stdio" (local) | "http" (remote)
    pub transport: &'static str,
    pub command: Option<String>,
    pub args: Vec<String>,
    pub url: Option<String>,
    pub disabled: bool,
    /// Remote and signs in through the browser (OAuth not switched off).
    pub oauth: bool,
}

fn strings(v: Option<&Value>) -> Vec<String> {
    v.and_then(Value::as_array).map(|a| a.iter().filter_map(scalar).collect()).unwrap_or_default()
}

fn scalar(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}

pub fn summarize(entry: &Value) -> EntrySummary {
    let local = entry["type"] == "local" || (entry["type"].is_null() && entry.get("command").is_some());
    let disabled = entry["disabled"].as_bool().unwrap_or(false);
    if local {
        let mut command = strings(entry.get("command"));
        let program = if command.is_empty() { None } else { Some(command.remove(0)) };
        EntrySummary { transport: "stdio", command: program, args: command, url: None, disabled, oauth: false }
    } else {
        EntrySummary {
            transport: "http",
            command: None,
            args: Vec::new(),
            url: entry["url"].as_str().map(str::to_string),
            disabled,
            oauth: entry["oauth"] != Value::Bool(false),
        }
    }
}

/// Names (never values) of an entry's environment variables and headers.
pub fn secret_names(entry: &Value) -> (Vec<String>, Vec<String>) {
    let keys = |k: &str| entry.get(k).and_then(Value::as_object).map(|m| m.keys().cloned().collect()).unwrap_or_default();
    (keys("environment"), keys("headers"))
}

fn string_map(v: Option<&Value>, field: &str) -> Result<Map<String, Value>, String> {
    match v {
        None | Some(Value::Null) => Ok(Map::new()),
        Some(Value::Object(m)) => {
            let mut out = Map::new();
            for (k, v) in m {
                let s = scalar(v).ok_or_else(|| format!("\"{field}\" values must be text"))?;
                out.insert(k.clone(), Value::String(s));
            }
            Ok(out)
        }
        Some(_) => Err(format!("\"{field}\" must be an object of text values")),
    }
}

const SSE_UNSUPPORTED: &str = "This address uses the older SSE connection, which Vibework no longer supports. Use the provider's Streamable HTTP address (it usually ends in /mcp).";

/// A form (or mcp.json, or pasted) entry → OpenCode's shape. Accepts the
/// native shape too (`type: "local" | "remote"`), unchanged but checked.
///
/// A remote connector with headers gets `oauth: false`: it signs in with its
/// header (a key), as the app's own manager did, so OpenCode does not start
/// a browser sign-in when the key is turned down.
pub fn to_native(entry: &Value) -> Result<Value, String> {
    let Value::Object(obj) = entry else { return Err("A connector's settings must be a JSON object".into()) };
    let ty = match obj.get("type") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) => Some(s.trim().to_ascii_lowercase()),
        Some(_) => return Err("\"type\" must be text".into()),
    };
    let has_command = obj.get("command").is_some_and(|v| !v.is_null());
    let has_url = obj.get("url").is_some_and(|v| !v.is_null());
    let kind = match ty.as_deref() {
        Some("local") | Some("stdio") => "local",
        Some("remote") | Some("http") | Some("streamable-http") | Some("streamable_http") | Some("streamablehttp") => "remote",
        Some("sse") => return Err(SSE_UNSUPPORTED.into()),
        Some(other) => return Err(format!("Unknown connector type \"{other}\" (use a command for a local one, or an https:// address)")),
        None if has_command => "local",
        None if has_url => "remote",
        None => return Err("A connector needs either a command (local) or an address (remote)".into()),
    };
    let mut out = Map::new();
    out.insert("type".into(), json!(kind));
    if kind == "local" {
        // Native: command is the whole argv. Form/mcp.json: command + args.
        let mut argv: Vec<String> = match obj.get("command") {
            Some(Value::Array(a)) => a.iter().filter_map(scalar).collect(),
            Some(Value::String(s)) => vec![s.trim().to_string()],
            _ => return Err("A local connector needs a command".into()),
        };
        argv.extend(strings(obj.get("args")));
        if argv.first().is_none_or(|c| c.is_empty()) {
            return Err("A local connector needs a command".into());
        }
        out.insert("command".into(), json!(argv));
        let mut env = string_map(obj.get("environment"), "environment")?;
        env.extend(string_map(obj.get("env"), "env")?);
        if !env.is_empty() {
            out.insert("environment".into(), Value::Object(env));
        }
        if let Some(cwd) = obj.get("cwd").and_then(Value::as_str).filter(|c| !c.trim().is_empty()) {
            out.insert("cwd".into(), json!(cwd));
        }
    } else {
        let url = obj.get("url").and_then(Value::as_str).map(str::trim).unwrap_or_default();
        let parsed = reqwest::Url::parse(url).map_err(|_| format!("\"{url}\" is not a web address"))?;
        if !matches!(parsed.scheme(), "http" | "https") {
            return Err("A remote connector's address must start with https://".into());
        }
        out.insert("url".into(), json!(url));
        let headers = string_map(obj.get("headers"), "headers")?;
        if !headers.is_empty() {
            out.insert("headers".into(), Value::Object(headers));
            out.insert("oauth".into(), json!(false));
        } else if let Some(oauth) = obj.get("oauth") {
            out.insert("oauth".into(), oauth.clone());
        }
    }
    if obj.get("disabled").and_then(Value::as_bool) == Some(true) {
        out.insert("disabled".into(), json!(true));
    }
    // Native-only settings written by hand or by the CLI.
    for key in ["timeout", "protocol", "pool", "codemode"] {
        if let Some(v) = obj.get(key) {
            out.insert(key.into(), v.clone());
        }
    }
    Ok(Value::Object(out))
}

/// The entry an edit in Settings produces: the form's `edited` entry, plus
/// from `old` the values of the variables or headers named in `keep` (the UI
/// never sees values), the off switch, and, when the kind is unchanged, the
/// settings the form doesn't show (OAuth client, timeouts, folder, ...).
pub fn merge_edit_keeping(old: &Value, edited: &Value, keep: &[String]) -> Result<Value, String> {
    let mut out = to_native(edited)?;
    let same_kind = old["type"] == out["type"];
    let secrets_key = if out["type"] == "local" { "environment" } else { "headers" };
    if same_kind {
        if let Some(kept) = old.get(secrets_key).and_then(Value::as_object) {
            let kept: Vec<(String, Value)> = kept.iter().filter(|(k, _)| keep.contains(k)).map(|(k, v)| (k.clone(), v.clone())).collect();
            if !kept.is_empty() {
                let obj = out.as_object_mut().unwrap();
                let map = obj.entry(secrets_key).or_insert_with(|| json!({}));
                for (k, v) in kept {
                    map.as_object_mut().unwrap().entry(k).or_insert(v);
                }
                if secrets_key == "headers" {
                    obj.insert("oauth".into(), json!(false));
                }
            }
        }
        let obj = out.as_object_mut().unwrap();
        for (k, v) in old.as_object().into_iter().flatten() {
            if !matches!(k.as_str(), "type" | "command" | "environment" | "url" | "headers" | "disabled") {
                if k == "oauth" && obj.get("headers").is_some() {
                    continue;
                }
                obj.entry(k.clone()).or_insert_with(|| v.clone());
            }
        }
    }
    if old["disabled"] == true {
        out["disabled"] = json!(true);
    }
    Ok(out)
}

/// Connector names: letters, digits, `-` and `_` (they become part of tool
/// names). `vibework` is the app's own server.
pub fn validate_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Connector name cannot be empty".into());
    }
    if name.len() > 40 {
        return Err(format!("Connector name '{name}' is too long (max 40 characters)"));
    }
    if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err(format!("Connector name '{name}' is invalid: use only letters, digits, '-' and '_'"));
    }
    if name.eq_ignore_ascii_case(crate::engine::bridge::MCP_SERVER_NAME) || name.eq_ignore_ascii_case("opencode") {
        return Err(format!("'{name}' is taken by Vibework itself; choose another name"));
    }
    Ok(())
}

/// Parse pasted JSON: `{"mcpServers": {...}}` (Claude Desktop), `{"servers": {...}}`
/// (VS Code), `{"mcp": {"servers": {...}}}` (OpenCode) or a bare name → entry map.
pub fn parse_import(text: &str) -> Result<Vec<(String, Value)>, String> {
    let value: Value = serde_json::from_str(text.trim()).map_err(|e| format!("Invalid JSON: {e}"))?;
    let Value::Object(root) = value else {
        return Err("Expected a JSON object like {\"mcpServers\": {...}}".into());
    };
    let map = match (root.get("mcpServers"), root.get("servers"), root.get("mcp").and_then(|m| m.get("servers"))) {
        (Some(Value::Object(m)), _, _) => m.clone(),
        (Some(_), _, _) => return Err("\"mcpServers\" must be an object of server name → config".into()),
        (None, Some(Value::Object(m)), _) => m.clone(),
        (None, _, Some(Value::Object(m))) => m.clone(),
        _ if root.values().all(Value::is_object) => root,
        _ => {
            return Err("Expected {\"mcpServers\": {...}} or an object of server name → config. \
                 If you pasted a single server, wrap it as {\"name\": {...}}."
                .into())
        }
    };
    if map.is_empty() {
        return Err("No servers found in the pasted JSON".into());
    }
    let mut out = Vec::new();
    for (name, entry) in map {
        validate_name(&name)?;
        let native = to_native(&entry).map_err(|e| format!("{name}: {e}"))?;
        out.push((name, native));
    }
    Ok(out)
}

/// What one carry-over from the app's old `mcp.json` did.
#[derive(Debug, Default, PartialEq)]
pub struct CarryOver {
    pub added: Vec<String>,
    /// Already in opencode.json (that one wins).
    pub kept: Vec<String>,
    /// (name, why) for entries that could not be used as they were.
    pub skipped: Vec<(String, String)>,
}

/// Bring the entries of the app's old `mcp.json` (Claude Desktop shape) into
/// `doc`, never replacing one already there. An entry on the old SSE
/// transport is kept, switched off, so it isn't lost: its row says why.
pub fn carry_over(doc: &mut ConnectorsDoc, old_mcp_json: &str) -> Result<CarryOver, String> {
    let value: Value = serde_json::from_str(old_mcp_json).map_err(|e| format!("mcp.json is not valid JSON: {e}"))?;
    let servers = value.get("mcpServers").and_then(Value::as_object).cloned().unwrap_or_default();
    let mut out = CarryOver::default();
    for (name, entry) in servers {
        if doc.contains(&name) {
            out.kept.push(name);
            continue;
        }
        if validate_name(&name).is_err() {
            out.skipped.push((name, "its name can't be used".into()));
            continue;
        }
        match to_native(&entry) {
            Ok(native) => {
                doc.set(&name, native);
                out.added.push(name);
            }
            Err(e) if e == SSE_UNSUPPORTED => {
                let url = entry["url"].as_str().unwrap_or_default();
                let mut kept = json!({ "type": "remote", "url": url, "disabled": true });
                if let Ok(headers) = string_map(entry.get("headers"), "headers") {
                    if !headers.is_empty() {
                        kept["headers"] = Value::Object(headers);
                        kept["oauth"] = json!(false);
                    }
                }
                doc.set(&name, kept);
                out.added.push(name.clone());
                out.skipped.push((name, "it uses the older SSE connection".into()));
            }
            Err(e) => out.skipped.push((name, e)),
        }
    }
    Ok(out)
}

/// Whether an address looks like an old SSE endpoint.
pub fn looks_like_sse(url: &str) -> bool {
    reqwest::Url::parse(url).is_ok_and(|u| u.path().trim_end_matches('/').ends_with("/sse"))
}

pub const SSE_ROW_MESSAGE: &str = "Uses the older SSE connection, which Vibework no longer supports. Edit it with the provider's address that ends in /mcp.";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn form_entries_become_native_and_back() {
        let local = to_native(&json!({"command": "npx", "args": ["-y", "srv"], "env": {"TOKEN": "s"}})).unwrap();
        assert_eq!(local, json!({"type": "local", "command": ["npx", "-y", "srv"], "environment": {"TOKEN": "s"}}));
        let s = summarize(&local);
        assert_eq!((s.transport, s.command.as_deref(), s.args.clone()), ("stdio", Some("npx"), vec!["-y".to_string(), "srv".to_string()]));
        assert_eq!(secret_names(&local), (vec!["TOKEN".to_string()], vec![]));

        let remote = to_native(&json!({"type": "http", "url": "https://mcp.granola.ai/mcp"})).unwrap();
        assert_eq!(remote, json!({"type": "remote", "url": "https://mcp.granola.ai/mcp"}));
        assert!(summarize(&remote).oauth);

        let keyed = to_native(&json!({"type": "http", "url": "https://x.example/mcp", "headers": {"Authorization": "Bearer k"}})).unwrap();
        assert_eq!(keyed["oauth"], false);
        assert!(!summarize(&keyed).oauth);
        assert_eq!(secret_names(&keyed).1, vec!["Authorization".to_string()]);

        // The native shape (CLI-written) passes through.
        let cli = json!({"type": "remote", "url": "http://127.0.0.1:1/mcp"});
        assert_eq!(to_native(&cli).unwrap(), cli);
        let cli_local = json!({"type": "local", "command": ["npx", "-y", "a"], "environment": {"L": "1"}});
        assert_eq!(to_native(&cli_local).unwrap(), cli_local);
    }

    #[test]
    fn bad_entries_are_refused_plainly() {
        assert!(to_native(&json!({"type": "sse", "url": "https://x/sse"})).unwrap_err().contains("older SSE"));
        assert!(to_native(&json!({"type": "http", "url": "ftp://x"})).is_err());
        assert!(to_native(&json!({"type": "http", "url": "not a url"})).is_err());
        assert!(to_native(&json!({})).is_err());
        assert!(to_native(&json!({"command": ""})).is_err());
        assert!(validate_name("vibework").is_err());
        assert!(validate_name("a b").is_err());
        assert!(validate_name("fake-notes_2").is_ok());
    }

    #[test]
    fn an_edit_keeps_unchanged_secret_values_and_hand_written_fields() {
        let old = json!({"type": "local", "command": ["npx", "a"], "environment": {"TOKEN": "s3cret", "OLD": "x"}, "cwd": "/tmp", "timeout": {"startup": 5}, "disabled": true});
        let out = merge_edit_keeping(&old, &json!({"command": "npx", "args": ["a", "b"], "env": {"NEW": "v"}}), &["TOKEN".to_string()]).unwrap();
        assert_eq!(out["environment"], json!({"NEW": "v", "TOKEN": "s3cret"}));
        assert_eq!(out["command"], json!(["npx", "a", "b"]));
        assert_eq!(out["cwd"], "/tmp");
        assert_eq!(out["timeout"], json!({"startup": 5}));
        assert_eq!(out["disabled"], true);
        // A value typed in the form wins over the kept one
        let out = merge_edit_keeping(&old, &json!({"command": "npx", "env": {"TOKEN": "new"}}), &["TOKEN".to_string()]).unwrap();
        assert_eq!(out["environment"]["TOKEN"], "new");
        // Switching to remote drops the local fields and their secrets
        let out = merge_edit_keeping(&old, &json!({"type": "http", "url": "https://x/mcp"}), &["TOKEN".to_string()]).unwrap();
        assert!(out.get("environment").is_none() && out.get("cwd").is_none() && out.get("command").is_none());
        assert_eq!(out["disabled"], true);
        // A kept header keeps the connector on its key
        let old = json!({"type": "remote", "url": "https://x/mcp", "headers": {"Authorization": "Bearer k"}, "oauth": false});
        let out = merge_edit_keeping(&old, &json!({"type": "http", "url": "https://x/mcp", "headers": {}}), &["Authorization".to_string()]).unwrap();
        assert_eq!(out["headers"]["Authorization"], "Bearer k");
        assert_eq!(out["oauth"], false);
    }

    #[test]
    fn the_file_keeps_what_it_does_not_know() {
        let mut doc = ConnectorsDoc::parse(r#"{"$schema":"x","other":{"keep":1},"mcp":{"timeout":{"startup":1},"servers":{"a":{"type":"remote","url":"https://a/mcp","future":true}}}}"#).unwrap();
        doc.set("b", json!({"type": "local", "command": ["x"]}));
        let a = doc.remove("a").unwrap();
        doc.set("c", a);
        let v = doc.to_value();
        assert_eq!(v["other"]["keep"], 1);
        assert_eq!(v["mcp"]["timeout"]["startup"], 1);
        assert_eq!(v["mcp"]["servers"]["c"]["future"], true);
        assert_eq!(doc.servers().iter().map(|(n, _)| n.as_str()).collect::<Vec<_>>(), vec!["b", "c"]);
        assert!(ConnectorsDoc::parse("[]").is_err());
        assert!(ConnectorsDoc::parse(r#"{"mcp":{"servers":[]}}"#).is_err());
        assert_eq!(ConnectorsDoc::parse("").unwrap(), ConnectorsDoc::fresh());
    }

    #[test]
    fn saved_owner_only() {
        let dir = std::env::temp_dir().join(format!("vw-conn-save-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let path = dir.join("opencode.json");
        let mut doc = ConnectorsDoc::fresh();
        doc.set("a", json!({"type": "remote", "url": "https://a/mcp"}));
        doc.save(&path).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(std::fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o600);
        }
        assert_eq!(ConnectorsDoc::load(&path).unwrap(), doc);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn old_mcp_json_carries_over_without_losing_anything() {
        let mut doc = ConnectorsDoc::fresh();
        doc.set("kept", json!({"type": "remote", "url": "https://new/mcp"}));
        let old = r#"{"mcpServers":{
            "kept":{"type":"http","url":"https://old/mcp"},
            "files":{"command":"npx","args":["-y","srv"],"env":{"K":"v"},"disabled":true},
            "github":{"type":"http","url":"https://api.githubcopilot.com/mcp/","headers":{"Authorization":"Bearer ghp_x"}},
            "granola":{"type":"http","url":"https://mcp.granola.ai/mcp"},
            "legacy":{"type":"sse","url":"https://old.example/sse"},
            "bad name":{"command":"x"}
        }}"#;
        let result = carry_over(&mut doc, old).unwrap();
        assert_eq!(result.kept, vec!["kept"]);
        assert_eq!(result.added, vec!["files", "github", "granola", "legacy"]);
        assert_eq!(result.skipped.len(), 2);
        assert_eq!(doc.get("kept").unwrap()["url"], "https://new/mcp");
        assert_eq!(doc.get("files").unwrap(), &json!({"type": "local", "command": ["npx", "-y", "srv"], "environment": {"K": "v"}, "disabled": true}));
        assert_eq!(doc.get("github").unwrap()["headers"]["Authorization"], "Bearer ghp_x");
        assert_eq!(doc.get("github").unwrap()["oauth"], false);
        assert_eq!(doc.get("granola").unwrap(), &json!({"type": "remote", "url": "https://mcp.granola.ai/mcp"}));
        assert_eq!(doc.get("legacy").unwrap()["disabled"], true);
        assert!(looks_like_sse("https://old.example/sse") && !looks_like_sse("https://mcp.granola.ai/mcp"));
    }

    #[test]
    fn imports_every_common_shape() {
        for text in [
            r#"{"mcpServers":{"a":{"command":"x"}}}"#,
            r#"{"servers":{"a":{"command":"x"}}}"#,
            r#"{"mcp":{"servers":{"a":{"type":"local","command":["x"]}}}}"#,
            r#"{"a":{"command":"x"}}"#,
        ] {
            let got = parse_import(text).unwrap();
            assert_eq!(got, vec![("a".to_string(), json!({"type": "local", "command": ["x"]}))], "{text}");
        }
        assert!(parse_import(r#"{"mcpServers":{"a":{"type":"sse","url":"https://x/sse"}}}"#).unwrap_err().contains("older SSE"));
    }
}
