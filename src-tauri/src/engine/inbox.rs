//! OpenCode owns its durable inbox. External tasks keep their pending input with task metadata.
use super::{client::engine_session_id, commands, external, get};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    sync::Mutex,
};
use tauri::Emitter;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub text: String,
    pub created_at: i64,
    #[serde(default)]
    pub draft: Value,
}
static ARMED: Lazy<Mutex<HashSet<String>>> = Lazy::new(|| Mutex::new(HashSet::new()));
static DELIVERING: Lazy<Mutex<HashSet<String>>> = Lazy::new(|| Mutex::new(HashSet::new()));
type Receipt = tokio::sync::oneshot::Sender<Result<(), String>>;
static STARTING: Lazy<Mutex<HashMap<String, (Item, Receipt)>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
/// A queued native turn is removed only after its provider confirms startup.
pub async fn started(id: &str) -> Result<(), String> {
    let pending = STARTING.lock().unwrap().remove(id);
    if let Some((item, receipt)) = pending {
        let result = remove(id, &item.id).await;
        if result.is_ok() {
            delivered(id, &item);
        }
        let _ = receipt.send(result.clone());
        result?;
    }
    Ok(())
}
pub fn ended(id: &str) {
    if let Some((_, reply)) = STARTING.lock().unwrap().remove(id) {
        let _ = reply.send(Err(
            "The agent did not start. Your message is still queued.".into(),
        ));
    }
}
pub fn arm(id: &str) {
    ARMED.lock().unwrap().insert(id.into());
}
pub fn park(id: &str) {
    ARMED.lock().unwrap().remove(id);
}
pub fn changed(id: &str) {
    if let Ok(e) = get() {
        let _ = e.app.emit("agent:inbox", json!({"sessionId":id}));
    }
}
pub fn delivered(id: &str, item: &Item) {
    if let Ok(e) = get() {
        let _ = e.app.emit(
            "agent:user-message",
            json!({"sessionId":id,"data":{"UserMessage":{"id":item.id,"text":item.text}}}),
        );
    }
    changed(id);
}
fn open_exists(id: &str) -> bool {
    external::read(id)
        .map(|t| t.engine == external::Engine::OpenCode || t.natives.contains_key("opencode"))
        .unwrap_or(true)
}
fn current_open(id: &str) -> bool {
    external::read(id)
        .map(|t| t.choice().engine == external::Engine::OpenCode)
        .unwrap_or(true)
}
pub fn normalize(v: &Value) -> Option<Item> {
    if v["type"] != "user" {
        return None;
    }
    Some(Item {
        id: v["id"].as_str()?.into(),
        text: v["payload"]["text"].as_str().unwrap_or("").into(),
        created_at: v["time"]["created"].as_i64().unwrap_or(0),
        draft: v["payload"]["metadata"]["vibeworkDraft"].clone(),
    })
}
async fn open_list(id: &str) -> Result<Vec<Item>, String> {
    if !open_exists(id) {
        return Ok(vec![]);
    }
    let e = get()?;
    let client = e.client().await?;
    let native = engine_session_id(id);
    let v = client.get(&format!("/api/session/{native}/inbox")).await?;
    let rows = v["data"].as_array().cloned().unwrap_or_default();
    e.reducer.lock().unwrap().remember_inbox(&native, &rows);
    Ok(rows.iter().filter_map(normalize).collect())
}
#[tauri::command]
pub async fn agent_inbox(session_id: String) -> Result<Vec<Item>, String> {
    let mut items = open_list(&session_id).await?;
    if let Ok(t) = external::read(&session_id) {
        for item in t.inbox {
            if !items.iter().any(|i| i.id == item.id) {
                items.push(item);
            }
        }
    }
    items.sort_by_key(|i| i.created_at);
    Ok(items)
}
async fn enqueue_open(id: &str, item: &Item) -> Result<(), String> {
    let e = get()?;
    let (client, native, session) = e.load(id).await?;
    if !e.reducer.lock().unwrap().is_tracked(&native) {
        e.attach(&client, &native, &session, None).await;
    }
    e.ensure_environment(&client, &native).await?;
    let folder = commands::working_folder(&session).unwrap_or_default();
    let model = session["model"]["id"]
        .as_str()
        .unwrap_or(crate::models::DEFAULT_MODEL);
    let files = super::attachments::files(&item.text, &folder, model).await?;
    let skills = if super::skills::tagged_skills(&item.text).is_empty() {
        vec![]
    } else {
        let offered = tauri::async_runtime::spawn_blocking(crate::skills::available)
            .await
            .unwrap_or_default();
        super::skills::requested_skills(&item.text, &offered)?
    };
    client.post(&format!("/api/session/{native}/prompt"),&json!({"id":item.id,"text":item.text,"files":files,"skills":skills.iter().map(|id|json!({"id":id})).collect::<Vec<_>>(),"metadata":{"vibeworkInbox":true,"vibeworkDraft":item.draft},"delivery":"queue","resume":false})).await?;
    Ok(())
}
#[tauri::command]
pub async fn agent_enqueue(
    session_id: String,
    text: String,
    draft: Option<Value>,
) -> Result<Item, String> {
    if text.trim().is_empty() {
        return Err("Write a message first.".into());
    }
    let item = Item {
        id: format!("msg_{}", uuid::Uuid::new_v4().simple()),
        text,
        created_at: chrono::Utc::now().timestamp_millis(),
        draft: draft.unwrap_or(Value::Null),
    };
    if current_open(&session_id) && !external::running(&session_id) {
        enqueue_open(&session_id, &item).await?;
    } else {
        external::mutate_inbox(&session_id, |q| {
            q.push(item.clone());
        })?;
    }
    changed(&session_id);
    // The idle event can win the race with an enqueue request from a still-working UI.
    // ARMED deliberately stays false after Stop and after relaunch.
    complete(session_id, true);
    Ok(item)
}
async fn waiting(id: &str) -> Result<bool, String> {
    if external::running(id) {
        return Ok(external::pending(id).is_some() || external::question(id).is_some());
    }
    Ok(commands::agent_pending_permission(id.into())
        .await?
        .is_some()
        || commands::agent_pending_question(id.into()).is_some())
}
pub async fn remove(id: &str, item_id: &str) -> Result<(), String> {
    if open_exists(id) {
        let c = get()?.client().await?;
        c.delete(&format!(
            "/api/session/{}/inbox/{item_id}",
            engine_session_id(id)
        ))
        .await?;
    }
    if external::exists(id) {
        external::mutate_inbox(id, |q| q.retain(|i| i.id != item_id))?;
    }
    changed(id);
    Ok(())
}
#[tauri::command]
pub async fn agent_inbox_action(
    session_id: String,
    item_id: String,
    action: String,
) -> Result<Item, String> {
    let items = agent_inbox(session_id.clone()).await?;
    let item = items
        .into_iter()
        .find(|i| i.id == item_id)
        .or_else(|| {
            (action == "send").then(|| Item {
                id: item_id.clone(),
                text: String::new(),
                created_at: 0,
                draft: Value::Null,
            })
        })
        .ok_or("This message was already delivered or removed.")?;
    if action == "send" && item.text.is_empty() {
        changed(&session_id);
        return Ok(item);
    }
    match action.as_str() {
        "remove" | "edit" => {
            if DELIVERING.lock().unwrap().contains(&item_id) {
                return Err("This message is being delivered.".into());
            }
            remove(&session_id, &item_id).await?;
        }
        "send" => {
            if waiting(&session_id).await? {
                return Err("Answer the pending prompt first.".into());
            }
            arm(&session_id);
            send_item(&session_id, &item).await?;
        }
        _ => return Err("Unknown queue action".into()),
    }
    Ok(item)
}
async fn send_item(id: &str, item: &Item) -> Result<(), String> {
    if !DELIVERING.lock().unwrap().insert(item.id.clone()) {
        return Ok(());
    }
    let result = async {
        if current_open(id) && !external::running(id) {
            // A model/harness selection needs its normal handoff before the native inbox can wake.
            let transition = external::read(id)
                .is_ok_and(|t| t.pending.is_some() || t.engine != external::Engine::OpenCode);
            if !transition {
                if external::read(id).is_ok_and(|t| t.inbox.iter().any(|i| i.id == item.id)) {
                    enqueue_open(id, item).await?;
                    external::mutate_inbox(id, |q| q.retain(|i| i.id != item.id))?;
                }
                let c = get()?.client().await?;
                let native = engine_session_id(id);
                return promote_open(item, |action, body| {
                    let c = c.clone();
                    let path = match action {
                        "list" => format!("/api/session/{native}/inbox"),
                        "wake" => format!("/api/session/{native}/prompt"),
                        _ => format!("/api/session/{native}/inbox/{}", item.id),
                    };
                    async move { match action {
                        "list" => c.get(&path).await,
                        "wake" => c.post(&path, &body).await,
                        _ => c.patch(&path, &body).await,
                    }}
                }).await;
            }
        }
        if external::running(id) {
            for _ in 0..3 {
                match external::steer(id, item.clone()).await {
                    Ok(()) => return Ok(()),
                    Err(error) => {
                        tracing::warn!("Native steering refused: {error}");
                        let pending = external::read(id)?.inbox.iter().any(|i| i.id == item.id);
                        match native_refusal(&error, pending, external::running(id)) {
                            NativeRefusal::Delivered => return Ok(()),
                            NativeRefusal::Uncertain => {
                                park(id); // Never automatically resend input with an unknown receipt.
                                return Err("The agent has not confirmed delivery. Check the task before retrying.".into());
                            }
                            NativeRefusal::Start => break,
                            NativeRefusal::Retry => tokio::time::sleep(std::time::Duration::from_millis(150)).await,
                        }
                    }
                }
            }
            if external::running(id) { return Err("Couldn't send this now. It will go when this turn finishes.".into()); }
        }
        // Keep the durable row until startup accepts the message. No model call is used to move a queue.
        if current_open(id) {
            commands::send_message(id.into(), item.text.clone()).await?;
            remove(id, &item.id).await?;
            delivered(id, item);
            return Ok(());
        }
        let (tx, rx) = tokio::sync::oneshot::channel();
        STARTING
            .lock()
            .unwrap()
            .insert(id.into(), (item.clone(), tx));
        if let Err(error) = commands::send_message(id.into(), item.text.clone()).await {
            ended(id);
            return Err(error);
        }
        rx.await.unwrap_or_else(|_| {
            Err("The agent did not confirm startup. Your message is still queued.".into())
        })
    }
    .await;
    DELIVERING.lock().unwrap().remove(&item.id);
    changed(id);
    result
}
/// Bring queued input from a formerly external task into OpenCode's durable inbox before it runs.
pub async fn adopt_open(id: &str) -> Result<(), String> {
    let items = external::read(id).map(|t| t.inbox).unwrap_or_default();
    for item in items {
        if DELIVERING.lock().unwrap().contains(&item.id) {
            continue;
        }
        enqueue_open(id, &item).await?;
        external::mutate_inbox(id, |q| q.retain(|i| i.id != item.id))?;
    }
    Ok(())
}
/// Only a successfully completed native turn drains external pending input. A restart never arms it.
pub fn complete(id: String, success: bool) {
    if !success {
        park(&id);
        return;
    }
    if !ARMED.lock().unwrap().contains(&id) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        if !ARMED.lock().unwrap().contains(&id) || external::switching::busy(&id) {
            return;
        }
        match agent_inbox(id.clone()).await {
            Ok(items) => {
                if let Some(item) = items.first() {
                    if !ARMED.lock().unwrap().contains(&id) {
                        return;
                    }
                    if let Err(error) = send_item(&id, item).await {
                        tracing::warn!("Automatic queue delivery failed: {error}");
                        park(&id);
                        if let Ok(e) = get() {
                            let _ = e.app.emit(
                                "agent:error",
                                json!({"sessionId":id,"data":{"Error":"Could not start the queued message. It is still queued."}}),
                            );
                        }
                    }
                }
            }
            Err(_) => park(&id),
        }
    });
}

/// 2.2.7's PATCH requires delivery=queue. A concurrent admission or promotion
/// returns 409 too, so read back before deciding whether anything failed.
async fn promote_open<F, Fut>(item: &Item, mut request: F) -> Result<(), String>
where
    F: FnMut(&'static str, Value) -> Fut,
    Fut: std::future::Future<Output = Result<Value, String>>,
{
    for attempt in 0..=4 {
        let rows = request("list", Value::Null).await?;
        match promotion_state(&rows, &item.id) {
            Promotion::Gone => return Ok(()),
            Promotion::Wake => {
                // Native prompt reconciliation with the SAME id preserves the original
                // payload, attachments and order and wakes a parked execution.
                request("wake", json!({"id":item.id,"text":item.text,"resume":true})).await?;
                return Ok(());
            }
            Promotion::Promote if attempt == 4 => break,
            Promotion::Promote => {}
        }
        match request("promote", json!({"delivery":"steer"})).await {
            Ok(_) => return Ok(()),
            Err(error) => tracing::warn!("Inbox promotion attempt failed: {error}"),
        }
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
    }
    Err("Couldn't send this now. It will go when this turn finishes.".into())
}
#[derive(Debug, PartialEq)]
enum NativeRefusal {
    Delivered,
    Uncertain,
    Start,
    Retry,
}
fn native_refusal(error: &str, pending: bool, running: bool) -> NativeRefusal {
    if !pending {
        NativeRefusal::Delivered
    } else if error.contains("not confirmed") || error.contains("before confirming") {
        NativeRefusal::Uncertain
    } else if !running {
        NativeRefusal::Start
    } else {
        NativeRefusal::Retry
    }
}

#[derive(Debug, PartialEq)]
enum Promotion {
    Gone,
    Wake,
    Promote,
}
fn promotion_state(rows: &Value, id: &str) -> Promotion {
    match rows["data"]
        .as_array()
        .and_then(|rows| rows.iter().find(|row| row["id"] == id))
    {
        None => Promotion::Gone,
        Some(row) if row["delivery"] == "steer" => Promotion::Wake,
        Some(_) => Promotion::Promote,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn item() -> Item {
        Item {
            id: "m".into(),
            text: "status".into(),
            created_at: 0,
            draft: json!({"attachments":["/tmp/a"]}),
        }
    }
    fn rows(delivery: &str) -> Value {
        json!({"data":[{"id":"m","delivery":delivery}]})
    }
    async fn sequence(
        replies: Vec<Result<Value, String>>,
    ) -> (Result<(), String>, Vec<(&'static str, Value)>) {
        let mut replies = std::collections::VecDeque::from(replies);
        let mut calls = vec![];
        let result = promote_open(&item(), |action, body| {
            calls.push((action, body));
            std::future::ready(replies.pop_front().expect("unexpected request"))
        })
        .await;
        assert!(replies.is_empty());
        (result, calls)
    }
    #[tokio::test]
    async fn long_tool_step_gap_idle_and_parked_use_native_promotion() {
        for _state in [
            "long tool",
            "last step gap",
            "stale busy UI",
            "parked",
            "new turn",
        ] {
            let (result, calls) = sequence(vec![Ok(rows("queue")), Ok(Value::Null)]).await;
            assert!(result.is_ok());
            assert_eq!(
                calls.iter().map(|c| c.0).collect::<Vec<_>>(),
                vec!["list", "promote"]
            );
            assert_eq!(calls[1].1, json!({"delivery":"steer"}));
        }
    }
    #[tokio::test]
    async fn admission_wins_promotion_race_without_resending() {
        let (result, calls) = sequence(vec![
            Ok(rows("queue")),
            Err("Engine returned HTTP 409: Pending input cannot change to steer: m".into()),
            Ok(json!({"data":[]})),
        ])
        .await;
        assert!(result.is_ok());
        assert_eq!(calls.len(), 3);
    }
    #[tokio::test]
    async fn duplicate_promotion_wakes_same_id_without_replacing_attachments() {
        let (result, calls) = sequence(vec![
            Ok(rows("queue")),
            Err("409".into()),
            Ok(rows("steer")),
            Ok(Value::Null),
        ])
        .await;
        assert!(result.is_ok());
        assert_eq!(
            calls[3],
            ("wake", json!({"id":"m","text":"status","resume":true}))
        );
        assert!(calls.iter().all(|c| !matches!(c.0, "cancel" | "delete")));
    }
    #[tokio::test]
    async fn temporary_refusal_retries_then_succeeds() {
        let (result, calls) = sequence(vec![
            Ok(rows("queue")),
            Err("409".into()),
            Ok(rows("queue")),
            Ok(Value::Null),
        ])
        .await;
        assert!(result.is_ok());
        assert_eq!(calls.iter().filter(|c| c.0 == "promote").count(), 2);
    }
    #[tokio::test]
    async fn persistent_refusal_keeps_row_and_returns_plain_note() {
        let mut replies = vec![];
        for _ in 0..4 {
            replies.extend([
                Ok(rows("queue")),
                Err("Engine returned HTTP 409: private-id".into()),
            ]);
        }
        replies.push(Ok(rows("queue")));
        let (result, calls) = sequence(replies).await;
        assert_eq!(
            result.unwrap_err(),
            "Couldn't send this now. It will go when this turn finishes."
        );
        assert_eq!(calls.len(), 9);
    }
    #[test]
    fn native_refusals_distinguish_retry_idle_delivered_and_unknown_receipt() {
        for provider in ["Codex turn/steer refused", "Claude priority-now refused"] {
            assert_eq!(native_refusal(provider, true, true), NativeRefusal::Retry);
            assert_eq!(native_refusal(provider, true, false), NativeRefusal::Start);
            assert_eq!(
                native_refusal(provider, false, true),
                NativeRefusal::Delivered
            );
        }
        for message in [
            "The agent has not confirmed delivery",
            "The agent stopped before confirming delivery",
        ] {
            assert_eq!(
                native_refusal(message, true, false),
                NativeRefusal::Uncertain
            );
        }
    }
    #[test]
    fn durable_draft_roundtrip_and_native_normalization() {
        let row = json!({"id":"m","type":"user","time":{"created":42},"payload":{"text":"hello","metadata":{"vibeworkDraft":{"snapshot":"editor","attachments":[{"path":"/tmp/a"}]}}}});
        let item = normalize(&row).unwrap();
        assert_eq!(item.created_at, 42);
        assert_eq!(
            serde_json::from_slice::<Item>(&serde_json::to_vec(&item).unwrap()).unwrap(),
            item
        );
        assert!(normalize(&json!({"type":"compaction"})).is_none());
    }
    #[test]
    fn stop_parks_without_discarding_persisted_items() {
        let id = "queue-stop-test";
        arm(id);
        assert!(ARMED.lock().unwrap().contains(id));
        park(id);
        assert!(!ARMED.lock().unwrap().contains(id));
    }
    #[test]
    fn failure_parks_and_relaunch_is_not_armed() {
        let id = "queue-failure-test";
        assert!(!ARMED.lock().unwrap().contains(id));
        arm(id);
        complete(id.into(), false);
        assert!(!ARMED.lock().unwrap().contains(id));
    }
}
