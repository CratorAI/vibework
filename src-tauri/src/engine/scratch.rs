//! Each task's private scratch folder, owned by the app:
//! `<app data>/scratch/<engine session id>`.
//!
//! Skills and the agent put working files there (check images, helper
//! scripts, unpacked documents) so only deliverables land in the person's
//! folder. The agent learns the path from a line the model proxy adds to the
//! system message and from `VIBEWORK_SCRATCH` in the task's command
//! environment. The Auto policy treats it like the task's own folder; every
//! other part of the app's data stays refused.
//!
//! Cleaned when the task is deleted or purged, and by [`prune`] at start-up
//! (folders untouched for [`MAX_AGE`], then the oldest until all of them fit
//! in [`MAX_TOTAL_BYTES`]).

use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

/// The command environment variable that holds the path.
pub const ENV_NAME: &str = "VIBEWORK_SCRATCH";
/// Scratch folders not touched for this long are removed at start-up.
pub const MAX_AGE: Duration = Duration::from_secs(7 * 24 * 60 * 60);
/// All scratch folders together are kept under this size at start-up.
pub const MAX_TOTAL_BYTES: u64 = 2 * 1024 * 1024 * 1024;

/// `<app data>/scratch`.
pub fn root() -> PathBuf {
    crate::paths::get_app_data_dir().join("scratch")
}

/// Engine session ids are `ses_` plus letters and digits; anything else is
/// refused so a path can never be built from it.
fn valid(engine_id: &str) -> bool {
    engine_id.len() > 4 && engine_id.len() <= 80 && engine_id.starts_with("ses_") && engine_id[4..].chars().all(|c| c.is_ascii_alphanumeric())
}

/// The task's scratch folder (not created).
pub fn dir(engine_id: &str) -> Option<PathBuf> {
    valid(engine_id).then(|| root().join(engine_id))
}

/// The task's scratch folder as text, for the policy and the prompt.
pub fn dir_string(engine_id: &str) -> Option<String> {
    dir(engine_id).map(|p| p.to_string_lossy().to_string())
}

/// Create the folder (owner-only) and return it.
pub fn ensure(engine_id: &str) -> Result<PathBuf, String> {
    let dir = dir(engine_id).ok_or("Invalid task id for a scratch folder")?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot create the task's scratch folder: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(root(), std::fs::Permissions::from_mode(0o700));
        let _ = std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700));
    }
    Ok(dir)
}

/// Remove the task's scratch folder (task deleted or purged).
pub fn remove(engine_id: &str) {
    if let Some(dir) = dir(engine_id) {
        if dir.exists() {
            if let Err(e) = std::fs::remove_dir_all(&dir) {
                tracing::warn!("Could not remove the scratch folder of {engine_id}: {e}");
            }
        }
    }
}

/// Total size and newest modification time under `path` (symlinks are not followed).
fn usage(path: &Path) -> (u64, SystemTime) {
    let mut size = 0u64;
    let mut newest = SystemTime::UNIX_EPOCH;
    let mut stack = vec![path.to_path_buf()];
    while let Some(p) = stack.pop() {
        let Ok(meta) = std::fs::symlink_metadata(&p) else { continue };
        if let Ok(m) = meta.modified() {
            newest = newest.max(m);
        }
        if meta.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&p) {
                stack.extend(entries.flatten().map(|e| e.path()));
            }
        } else {
            size += meta.len();
        }
    }
    (size, newest)
}

/// What to remove: folders older than `max_age`, then the oldest of the rest
/// until the total fits in `max_total`. Folders in `keep` are never chosen.
fn choose(mut folders: Vec<(String, u64, SystemTime)>, now: SystemTime, max_age: Duration, max_total: u64, keep: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    folders.retain(|(name, _, modified)| {
        if keep.contains(name) {
            return true;
        }
        let old = now.duration_since(*modified).is_ok_and(|age| age >= max_age);
        if old {
            out.push(name.clone());
        }
        !old
    });
    let mut total: u64 = folders.iter().map(|(_, size, _)| size).sum();
    folders.sort_by_key(|(_, _, modified)| *modified);
    for (name, size, _) in folders {
        if total <= max_total {
            break;
        }
        if keep.contains(&name) {
            continue;
        }
        total = total.saturating_sub(size);
        out.push(name);
    }
    out
}

/// Remove stale scratch folders (start-up, before any turn runs). `keep`:
/// engine ids that must stay (running tasks).
pub fn prune(keep: &[String]) -> usize {
    let Ok(entries) = std::fs::read_dir(root()) else { return 0 };
    let folders: Vec<(String, u64, SystemTime)> = entries
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_dir()))
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            valid(&name).then(|| {
                let (size, modified) = usage(&e.path());
                (name, size, modified)
            })
        })
        .collect();
    let chosen = choose(folders, SystemTime::now(), MAX_AGE, MAX_TOTAL_BYTES, keep);
    for name in &chosen {
        remove(name);
    }
    chosen.len()
}

/// The line the model proxy adds to a task's system message.
pub fn prompt_line(engine_id: &str) -> Option<String> {
    let dir = dir_string(engine_id)?;
    Some(format!(
        "\n\n==This task's scratch folder==\n\nThis task's scratch folder is \"{dir}\" (also in the environment variable {ENV_NAME}; quote it in commands, the path has a space). Put working files there: helper scripts, check images and screenshots you take for yourself, unpacked documents, intermediate data and logs. Only the deliverables the user asked for go in the working folder."
    ))
}

/// Add [`prompt_line`] to an OpenAI-compatible chat request body: appended
/// to the last leading system message, or as a new first system message.
/// Bodies that are not chat requests are returned unchanged.
pub fn add_to_request(body: &[u8], engine_id: &str) -> Option<Vec<u8>> {
    let line = prompt_line(engine_id)?;
    let mut value: serde_json::Value = serde_json::from_slice(body).ok()?;
    let messages = value.get_mut("messages")?.as_array_mut()?;
    if messages.iter().any(|m| m["content"].as_str().is_some_and(|c| c.contains("==This task's scratch folder=="))) {
        return None;
    }
    let last_system = messages.iter().take_while(|m| m["role"] == "system").count();
    if last_system == 0 {
        messages.insert(0, serde_json::json!({ "role": "system", "content": line.trim_start() }));
    } else {
        let message = &mut messages[last_system - 1];
        match message.get_mut("content") {
            Some(serde_json::Value::String(text)) => text.push_str(&line),
            Some(serde_json::Value::Array(parts)) => parts.push(serde_json::json!({ "type": "text", "text": line.trim_start() })),
            _ => message["content"] = serde_json::Value::String(line.trim_start().to_string()),
        }
    }
    serde_json::to_vec(&value).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn only_engine_session_ids_make_a_path() {
        assert!(dir("ses_8c6cddef21bc401b").is_some());
        for bad in ["", "ses_", "../x", "ses_a/b", "ses_..", "x_abc", "ses_a b"] {
            assert!(dir(bad).is_none(), "{bad}");
        }
        assert!(dir("ses_abc").unwrap().ends_with("scratch/ses_abc"));
    }

    #[test]
    fn prune_chooses_old_then_oldest_over_the_limit() {
        let now = SystemTime::now();
        let day = Duration::from_secs(86400);
        let folders = vec![
            ("ses_old".to_string(), 10, now - day * 9),
            ("ses_a".to_string(), 60, now - day * 3),
            ("ses_b".to_string(), 60, now - day * 2),
            ("ses_c".to_string(), 60, now - day),
            ("ses_run".to_string(), 500, now - day * 30),
        ];
        let chosen = choose(folders, now, MAX_AGE, 650, &["ses_run".to_string()]);
        assert_eq!(chosen, vec!["ses_old".to_string(), "ses_a".to_string()]);
    }

    #[test]
    fn the_line_joins_the_system_message() {
        let body = json!({"model":"m","messages":[{"role":"system","content":"You are Vibework"},{"role":"user","content":"hi"}]});
        let out: serde_json::Value = serde_json::from_slice(&add_to_request(&serde_json::to_vec(&body).unwrap(), "ses_abc").unwrap()).unwrap();
        let system = out["messages"][0]["content"].as_str().unwrap();
        assert!(system.starts_with("You are Vibework"));
        assert!(system.contains("scratch/ses_abc\""));
        assert_eq!(out["messages"].as_array().unwrap().len(), 2);
        // Parts form, and no system message at all
        let parts = json!({"messages":[{"role":"system","content":[{"type":"text","text":"A"}]},{"role":"user","content":"x"}]});
        let out: serde_json::Value = serde_json::from_slice(&add_to_request(&serde_json::to_vec(&parts).unwrap(), "ses_abc").unwrap()).unwrap();
        assert_eq!(out["messages"][0]["content"].as_array().unwrap().len(), 2);
        let none = json!({"messages":[{"role":"user","content":"x"}]});
        let out: serde_json::Value = serde_json::from_slice(&add_to_request(&serde_json::to_vec(&none).unwrap(), "ses_abc").unwrap()).unwrap();
        assert_eq!(out["messages"][0]["role"], "system");
        // Not a chat body, or a bad id: unchanged
        assert!(add_to_request(b"{\"input\":\"x\"}", "ses_abc").is_none());
        assert!(add_to_request(&serde_json::to_vec(&body).unwrap(), "../x").is_none());
    }
}
