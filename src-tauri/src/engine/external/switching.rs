//! Task identity and UI history stay stable while native sessions change.
use super::super::{client::engine_session_id, commands};
use super::*;
use std::collections::HashSet;
static TRANSITIONS: Lazy<Mutex<HashSet<String>>> = Lazy::new(|| Mutex::new(HashSet::new()));
struct Transition(String);
impl Transition {
    fn enter(id: &str) -> Result<Self, String> {
        if !TRANSITIONS.lock().unwrap().insert(id.into()) {
            return Err("This task is already changing. Try again shortly.".into());
        }
        Ok(Self(id.into()))
    }
}
impl Drop for Transition {
    fn drop(&mut self) {
        TRANSITIONS.lock().unwrap().remove(&self.0);
    }
}
pub fn native_external(id: &str) -> bool {
    running(id) || read(id).is_ok_and(|t| t.engine != Engine::OpenCode)
}
pub fn busy(id: &str) -> bool {
    running(id)
        || super::super::get().is_ok_and(|e| {
            e.reducer
                .lock()
                .unwrap()
                .session(&engine_session_id(id))
                .is_some_and(|s| s.busy)
        })
}
pub async fn sync_open(id: &str) -> Result<(), String> {
    let mut t = read(id)?;
    if t.engine != Engine::OpenCode {
        return Ok(());
    }
    let history = commands::load_opencode(id.into()).await?;
    merge_open_history(
        &mut t,
        history
            .into_iter()
            .map(|m| serde_json::to_value(m).unwrap_or(Value::Null))
            .collect(),
        busy(id),
    );
    t.updated = chrono::Utc::now().to_rfc3339();
    save(&t)
}
fn merge_open_history(t: &mut Task, history: Vec<Value>, working: bool) {
    let start = t.open_start.unwrap_or(t.messages.len());
    if history.len() > t.open_seen {
        let mut added: Vec<Value> = history.into_iter().skip(t.open_seen).collect();
        if let (Some(note), Some(user)) =
            (&t.open_note, added.iter_mut().find(|m| m["role"] == "user"))
        {
            let mut notes = user["notes"].as_array().cloned().unwrap_or_default();
            notes.insert(0, json!(note));
            user["notes"] = json!(notes);
        }
        t.messages.truncate(start);
        t.messages.extend(added);
        t.open_start = Some(start);
    }
    if !working && t.open_start.is_some() {
        t.open_seen += t.messages.len().saturating_sub(start);
        t.open_start = None;
        t.open_note = None;
        t.checkpoint();
    }
}

pub async fn history(id: &str) -> Result<Vec<MessageInfo>, String> {
    if read(id)?.engine == Engine::OpenCode {
        sync_open(id).await?;
    }
    super::history(id)
}
pub async fn choose(id: String, key: String) -> Result<(), String> {
    let _guard = Transition::enter(&id)?;
    let waiting = if native_external(&id) {
        pending(&id).is_some() || question(&id).is_some()
    } else {
        commands::agent_pending_permission(id.clone())
            .await?
            .is_some()
            || commands::agent_pending_question(id.clone()).is_some()
    };
    if busy(&id) || waiting {
        return Err("Stop this task and resolve its pending prompt before changing models.".into());
    }
    if !exists(&id) {
        commands::migrate_open_task(&id).await?;
    } else if read(&id)?.engine == Engine::OpenCode {
        sync_open(&id).await?;
    }
    let choice = Selection::parse(&key);
    if choice.engine != Engine::OpenCode {
        if !agent_installed_agents()
            .await
            .iter()
            .any(|a| a["id"] == choice.engine.model() && a["disabledReason"].is_null())
        {
            return Err("Sign in to a supported installation of this agent first.".into());
        }
    }
    let mut t = read(&id)?;
    t.choose(choice, false, false)?;
    save(&t)
}
pub async fn send(id: String, prompt: String) -> Result<Vec<String>, String> {
    let _guard = Transition::enter(&id)?;
    if busy(&id) {
        return Err("Stop this task before sending another turn.".into());
    }
    if read(&id)?.engine == Engine::OpenCode {
        sync_open(&id).await?;
    }
    let before = read(&id)?;
    if before.choice().engine != Engine::OpenCode {
        let result = super::send(id.clone(), prompt.clone()).await;
        if let Err(error) = &result {
            save_failure(&before, &prompt, error)?;
        }
        return result;
    }
    let mut t = before.clone();
    t.activate();
    let switched = before.engine != t.engine;
    let native = engine_session_id(&id);
    let result: Result<Vec<String>, String> = async {
        // A missing key is a start failure, before any task metadata changes.
        crate::byok::require_key().await?;
        if t.natives
            .get(Engine::OpenCode.model())
            .and_then(|n| n.id.as_ref())
            .is_none()
            && super::super::get()?
                .client()
                .await?
                .session(&native)
                .await
                .is_err()
        {
            commands::create_opencode(
                id.clone(),
                t.name.clone(),
                Some(t.folder.clone()),
                t.model.clone(),
                Some(t.mode.clone()),
            )
            .await?;
            t.open_seen = 0;
        }
        let e = super::super::get()?;
        let client = e.client().await?;
        client
            .set_model(
                &native,
                t.model.as_deref().unwrap_or(crate::models::DEFAULT_MODEL),
            )
            .await?;
        commands::set_opencode_mode(id.clone(), super::super::policy::Mode::parse(&t.mode)?)
            .await?;
        let since = t.handoff_cursor();
        if since < t.messages.len() {
            let h = handoff::build(&t.messages, since, &t.folder, &t.mode, handoff::BUDGET);
            client
                .synthetic(&native, &h.text, "provider-context-handoff")
                .await?;
        }
        t.native = Some(native.clone());
        t.open_start = Some(t.messages.len());
        t.open_note = switched.then(|| "Switched to Open models".into());
        save(&t)?;
        let mut notes = commands::send_opencode(id.clone(), prompt.clone()).await?;
        if let Some(note) = &t.open_note {
            notes.insert(0, note.clone());
        }
        Ok(notes)
    }
    .await;
    if let Err(error) = &result {
        if let Ok(e) = super::super::get() {
            if let Ok(client) = e.client().await {
                let _ = client.interrupt(&native).await;
            }
        }
        save_failure(&before, &prompt, error)?;
    }
    result
}
/// During startup the on-disk current harness remains the previous one.
pub(super) fn save_starting(task: &Task, before: &Task, ready: bool) -> Result<(), String> {
    if ready {
        return save(task);
    }
    let mut saved = before.clone();
    saved.messages = task.messages.clone();
    saved.updated = task.updated.clone();
    save(&saved)
}

fn failed_snapshot(before: &Task, prompt: &str, error: &str) -> Task {
    let mut old = before.clone();
    old.pending = None;
    old.updated = chrono::Utc::now().to_rfc3339();
    old.messages
        .push(message("user", json!({"type":"text","text":prompt})));
    old.messages.push(json!({"role":"assistant","content":[],"end":{"kind":"failed","text":error},"notes":[],"timings":[],"sourceIds":[]}));
    old
}
fn save_failure(before: &Task, prompt: &str, error: &str) -> Result<(), String> {
    save(&failed_snapshot(before, prompt, error))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn failed_switch_keeps_previous_harness_native_history_and_new_request() {
        let mut before:Task=serde_json::from_value(json!({"id":"test","name":"Test","engine":"codex","folder":"/tmp","mode":"ask","native":"codex-native","created":"now","updated":"now","settled":null,"messages":[{"role":"user","content":[{"type":"text","text":"old request"}]}]})).unwrap();
        before.migrate();
        before
            .choose(Selection::parse("agent:claude-code"), false, false)
            .unwrap();
        let after = failed_snapshot(&before, "new request", "Tool failed to start");
        assert_eq!(after.engine, Engine::Codex);
        assert_eq!(after.native, before.native);
        assert!(after.pending.is_none());
        assert_eq!(after.messages[0], before.messages[0]);
        assert_eq!(after.messages[1]["content"][0]["text"], "new request");
        assert_eq!(after.messages[2]["end"]["kind"], "failed");
    }
    #[test]
    fn open_cursor_advances_only_for_its_own_finished_segment() {
        let mut t:Task=serde_json::from_value(json!({"id":"test","name":"Test","engine":"open-code","folder":"/tmp","mode":"ask","native":"open-native","created":"now","updated":"now","settled":null,"messages":[]})).unwrap();
        t.migrate();
        t.messages.push(message(
            "user",
            json!({"type":"text","text":"other harness"}),
        ));
        merge_open_history(&mut t, vec![], false);
        assert_eq!(
            t.natives["opencode"].seen, 0,
            "reading unchanged native history must not acknowledge other harness messages"
        );
        let user = message("user", json!({"type":"text","text":"new open request"}));
        t.open_start = Some(1);
        merge_open_history(&mut t, vec![user.clone()], true);
        assert_eq!(t.messages.len(), 2);
        assert_eq!(t.open_seen, 0);
        let reply = message("assistant", json!({"type":"text","text":"reply"}));
        merge_open_history(&mut t, vec![user.clone(), reply.clone()], false);
        assert_eq!(t.messages.len(), 3);
        assert_eq!(t.open_seen, 2);
        assert_eq!(t.natives["opencode"].seen, 3);
        merge_open_history(&mut t, vec![user, reply], false);
        assert_eq!(t.messages.len(), 3);
    }
}
