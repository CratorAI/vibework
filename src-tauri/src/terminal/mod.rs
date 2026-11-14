//! Integrated terminal for the workspace panel (rendered with xterm.js on the frontend).
//!
//! Commands: `terminal_open`, `terminal_write`, `terminal_resize`, `terminal_close`,
//! `terminal_list`, `terminal_snapshot`.
//! Events: `terminal:data { id, data }` (base64 of raw output bytes, coalesced to ~60/s per
//! terminal) and `terminal:exit { id, exitCode }`.

mod session;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use base64::Engine as _;
use once_cell::sync::Lazy;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tracing::{info, warn};

use session::{EventSink, Session, SessionEvent, SpawnOptions};

const MAX_TERMINALS: usize = 8;
/// Exited terminals are kept (for `terminal_list` / `terminal_snapshot`) up to this many entries.
const MAX_ENTRIES: usize = 16;

static TERMINALS: Lazy<Mutex<HashMap<String, Arc<Session>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TerminalInfo {
    pub id: String,
    pub shell: String,
    pub cwd: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TerminalListEntry {
    pub id: String,
    pub shell: String,
    pub cwd: String,
    pub alive: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSnapshot {
    pub data: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalDataEvent<'a> {
    id: &'a str,
    data: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalExitEvent<'a> {
    id: &'a str,
    exit_code: Option<i32>,
}

fn b64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

pub(crate) fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 64
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(format!(
            "Invalid id {id:?}: use 1-64 letters, digits, '-' or '_'"
        ));
    }
    Ok(())
}

fn resolve_cwd(cwd: Option<String>) -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine the home directory")?;
    let path = match cwd.as_deref().map(str::trim) {
        None | Some("") => PathBuf::from(crate::config::get_default_working_directory()),
        Some("~") => home,
        Some(p) if p.starts_with("~/") => home.join(&p[2..]),
        Some(p) => PathBuf::from(p),
    };
    if !path.is_absolute() {
        return Err(format!("Working directory must be an absolute path: {}", path.display()));
    }
    if !path.is_dir() {
        return Err(format!("Working directory does not exist: {}", path.display()));
    }
    Ok(path.canonicalize().unwrap_or(path))
}

/// Variables of the app's environment the user's shell must not inherit: the
/// same rule as task commands (the engine's and the app's own variables, the
/// dev key override) plus any value that contains the OpenRouter key.
fn scrubbed_names() -> Vec<String> {
    let key = crate::byok::loaded_key();
    std::env::vars_os()
        .filter_map(|(name, value)| {
            let name = name.to_string_lossy().into_owned();
            let value = value.to_string_lossy();
            let secret = crate::engine::launch::is_secret_name(&name)
                || key.as_deref().is_some_and(|k| k.len() >= 8 && value.contains(k));
            secret.then_some(name)
        })
        .collect()
}

fn get(id: &str) -> Result<Arc<Session>, String> {
    TERMINALS
        .lock()
        .unwrap()
        .get(id)
        .cloned()
        .ok_or_else(|| format!("No terminal with id {id:?}"))
}

#[tauri::command]
pub async fn terminal_open(
    app_handle: AppHandle,
    id: String,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<TerminalInfo, String> {
    validate_id(&id)?;
    let mut terminals = TERMINALS.lock().unwrap();

    if let Some(existing) = terminals.get(&id) {
        if existing.is_alive() {
            // The panel remounted: hand back the running terminal.
            let _ = existing.resize(cols, rows);
            return Ok(TerminalInfo {
                id,
                shell: existing.shell.clone(),
                cwd: existing.cwd.clone(),
            });
        }
        // The shell exited earlier: start a fresh one under the same id.
        terminals.remove(&id);
    }

    let cwd = resolve_cwd(cwd)?;
    if terminals.values().filter(|s| s.is_alive()).count() >= MAX_TERMINALS {
        return Err(format!(
            "Too many terminals open (limit {MAX_TERMINALS}). Close one first."
        ));
    }
    if terminals.len() >= MAX_ENTRIES {
        terminals.retain(|_, s| s.is_alive());
    }

    let sink: EventSink = {
        let app = app_handle.clone();
        let id = id.clone();
        Arc::new(move |event| match event {
            SessionEvent::Data(bytes) => {
                let _ = app.emit(
                    "terminal:data",
                    TerminalDataEvent {
                        id: &id,
                        data: b64(&bytes),
                    },
                );
            }
            SessionEvent::Exit(exit_code) => {
                info!("[terminal] {id} exited with {exit_code:?}");
                let _ = app.emit("terminal:exit", TerminalExitEvent { id: &id, exit_code });
            }
        })
    };

    let session = Session::spawn(SpawnOptions { cwd, cols, rows, remove_env: scrubbed_names() }, sink)?;
    info!(
        "[terminal] opened {id}: {} in {} (pid {:?})",
        session.shell,
        session.cwd,
        session.pid()
    );
    let info = TerminalInfo {
        id: id.clone(),
        shell: session.shell.clone(),
        cwd: session.cwd.clone(),
    };
    terminals.insert(id, session);
    Ok(info)
}

#[tauri::command]
pub async fn terminal_write(id: String, data: String) -> Result<(), String> {
    get(&id)?.write(data.as_bytes())
}

#[tauri::command]
pub async fn terminal_resize(id: String, cols: u16, rows: u16) -> Result<(), String> {
    let session = get(&id)?;
    if !session.is_alive() {
        return Ok(());
    }
    session.resize(cols, rows)
}

#[tauri::command]
pub async fn terminal_close(id: String) -> Result<(), String> {
    let session = TERMINALS.lock().unwrap().remove(&id);
    match session {
        Some(session) => {
            info!("[terminal] closing {id}");
            session.kill();
            Ok(())
        }
        None => Ok(()),
    }
}

#[tauri::command]
pub async fn terminal_list() -> Result<Vec<TerminalListEntry>, String> {
    let terminals = TERMINALS.lock().unwrap();
    let mut list: Vec<TerminalListEntry> = terminals
        .iter()
        .map(|(id, s)| TerminalListEntry {
            id: id.clone(),
            shell: s.shell.clone(),
            cwd: s.cwd.clone(),
            alive: s.is_alive(),
        })
        .collect();
    list.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(list)
}

#[tauri::command]
pub async fn terminal_snapshot(id: String) -> Result<TerminalSnapshot, String> {
    Ok(TerminalSnapshot {
        data: b64(&get(&id)?.snapshot()),
    })
}

/// Kill every terminal. Called when the app exits.
pub fn shutdown_all() {
    let sessions: Vec<Arc<Session>> = TERMINALS.lock().unwrap().drain().map(|(_, s)| s).collect();
    if sessions.is_empty() {
        return;
    }
    info!("[terminal] killing {} terminal(s) on exit", sessions.len());
    for s in &sessions {
        s.kill();
    }
    // Give the SIGHUP/SIGKILL escalation a moment before the process goes away.
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(600);
    while std::time::Instant::now() < deadline && sessions.iter().any(|s| s.is_alive()) {
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    if sessions.iter().any(|s| s.is_alive()) {
        warn!("[terminal] some shells were still running at exit");
    }
}
