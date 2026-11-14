//! Tauri commands for Settings → Connectors (names kept from the app-run
//! connectors, so the frontend is unchanged). All return quickly; the engine
//! connects in the background and the results arrive as `mcp:servers-changed`.

use serde_json::Value;

use super::McpServerView;

/// Every configured connector with its status.
#[tauri::command]
pub async fn mcp_list_servers() -> Result<Vec<McpServerView>, String> {
    Ok(super::list().await)
}

/// Add a connector. `config` is the form's entry (`{command, args, env}` or
/// `{type: "http", url, headers}`) or OpenCode's own shape.
#[tauri::command]
pub async fn mcp_add_server(name: String, config: Value) -> Result<Vec<McpServerView>, String> {
    super::add(name, config).await
}

/// Edit a connector (and rename it to `new_name`); `keep` names variables or
/// headers whose saved values stay.
#[tauri::command]
pub async fn mcp_update_server(name: String, new_name: String, config: Value, keep: Vec<String>) -> Result<Vec<McpServerView>, String> {
    super::update(name, new_name, config, keep).await
}

/// Remove a connector and its sign-in.
#[tauri::command]
pub async fn mcp_remove_server(name: String) -> Result<Vec<McpServerView>, String> {
    super::remove(name).await
}

/// Switch a connector on or off (`"disabled": true` in the file).
#[tauri::command]
pub async fn mcp_set_server_enabled(name: String, enabled: bool) -> Result<Vec<McpServerView>, String> {
    super::set_enabled(name, enabled).await
}

/// Add pasted connectors (`{"mcpServers": {...}}` and similar), replacing same-named ones.
#[tauri::command]
pub async fn mcp_import_json(json: String) -> Result<Vec<McpServerView>, String> {
    super::import(json).await
}

/// Re-read the connectors file (the engine watches it on its own).
#[tauri::command]
pub async fn mcp_reload() -> Result<Vec<McpServerView>, String> {
    super::reload().await
}

/// Absolute path of the connectors file.
#[tauri::command]
pub fn mcp_config_path() -> String {
    super::file_path().to_string_lossy().to_string()
}

/// Why the connectors file could not be read (`null` when fine).
#[tauri::command]
pub async fn mcp_config_error() -> Result<Option<String>, String> {
    Ok(super::config_error().await)
}

/// Start a browser sign-in (returns at once; the result arrives as an event).
#[tauri::command]
pub async fn mcp_sign_in(name: String) -> Result<Vec<McpServerView>, String> {
    super::sign_in(name).await
}

/// Stop waiting for the browser.
#[tauri::command]
pub async fn mcp_cancel_sign_in(name: String) -> Result<Vec<McpServerView>, String> {
    super::cancel_sign_in(name).await
}

/// Delete the connector's sign-in (in the engine's store).
#[tauri::command]
pub async fn mcp_sign_out(name: String) -> Result<Vec<McpServerView>, String> {
    super::sign_out(name).await
}
