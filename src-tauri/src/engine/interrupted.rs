//! Turns the engine could not finish because it died or restarted.
//!
//! The engine saves a step's reply text only when the step ends, so a crash
//! mid-step leaves an empty message behind. The app keeps what had streamed
//! (`Reducer::unsaved_text`) with the reason, first in memory (so the history
//! reload right after the crash already has it), then in the task's
//! metadata (`metadata.vibework.interruptedTurns`), and the history puts it
//! back inline where it happened (`history::to_message_infos_with`).
//!
//! The model never saw that text either, so on "continue" it would start
//! over. With the user's next message the lost text goes to the model as
//! context it sees but the conversation does not show (`context_text`,
//! sent as an engine synthetic message), once (`interruptedGiven`).

use std::collections::HashMap;
use std::sync::Mutex;

use once_cell::sync::Lazy;
use serde_json::{json, Map, Value};

use super::history::Interrupted;

/// Most interrupted turns kept per task (oldest dropped first).
const MAX_KEPT: usize = 50;
/// Longest text kept per turn (characters).
const MAX_TEXT: usize = 100_000;

static PENDING: Lazy<Mutex<HashMap<String, Vec<Interrupted>>>> = Lazy::new(|| Mutex::new(HashMap::new()));

/// Remember a turn that just ended without finishing (engine session id).
pub fn record(engine_id: &str, at: f64, text: String, reason: String) {
    let text: String = text.chars().take(MAX_TEXT).collect();
    PENDING.lock().unwrap().entry(engine_id.to_string()).or_default().push(Interrupted { at, text, reason });
}

/// Not yet written to the task's metadata.
pub fn pending(engine_id: &str) -> Vec<Interrupted> {
    PENDING.lock().unwrap().get(engine_id).cloned().unwrap_or_default()
}

/// Written: drop these from memory.
pub fn forget(engine_id: &str, written: &[Interrupted]) {
    let mut all = PENDING.lock().unwrap();
    if let Some(list) = all.get_mut(engine_id) {
        list.retain(|n| !written.contains(n));
        if list.is_empty() {
            all.remove(engine_id);
        }
    }
}

fn from_value(v: &Value) -> Option<Interrupted> {
    Some(Interrupted { at: v["at"].as_f64()?, text: v["text"].as_str().unwrap_or_default().to_string(), reason: v["reason"].as_str()?.to_string() })
}

fn to_value(n: &Interrupted) -> Value {
    json!({ "at": n.at, "text": n.text, "reason": n.reason })
}

/// Saved in the task's app metadata.
pub fn saved(meta: &Map<String, Value>) -> Vec<Interrupted> {
    meta.get("interruptedTurns").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(from_value).collect()).unwrap_or_default()
}

/// Everything the history should show: saved, plus pending ones not saved yet.
pub fn all(meta: &Map<String, Value>, engine_id: &str) -> Vec<Interrupted> {
    let mut out = saved(meta);
    for n in pending(engine_id) {
        if !out.iter().any(|s| s.at == n.at) {
            out.push(n);
        }
    }
    out
}

/// The metadata value with `new` added (deduplicated, capped).
pub fn merged_value(meta: &Map<String, Value>, new: &[Interrupted]) -> Value {
    let mut list = saved(meta);
    for n in new {
        if !list.iter().any(|s| s.at == n.at) {
            list.push(n.clone());
        }
    }
    let skip = list.len().saturating_sub(MAX_KEPT);
    Value::Array(list.iter().skip(skip).map(to_value).collect())
}

/// Longest lost text given back to the model (characters, the end kept).
const MAX_CONTEXT: usize = 30_000;

/// Interrupted turns whose text the model has not been given yet, only
/// those after the user's last message (older ones were followed by more
/// conversation and are no longer the turn the user is continuing).
pub fn not_given(meta: &Map<String, Value>, engine_id: &str, last_prompt_at: Option<f64>) -> Vec<Interrupted> {
    let given: Vec<f64> = meta.get("interruptedGiven").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(Value::as_f64).collect()).unwrap_or_default();
    let mut list: Vec<Interrupted> = all(meta, engine_id)
        .into_iter()
        .filter(|n| !n.text.trim().is_empty() && !given.contains(&n.at) && last_prompt_at.is_none_or(|p| n.at > p))
        .collect();
    list.sort_by(|a, b| a.at.total_cmp(&b.at));
    list
}

/// The metadata value with these turns marked as given (capped).
pub fn given_value(meta: &Map<String, Value>, new: &[Interrupted]) -> Value {
    let mut list: Vec<Value> = meta.get("interruptedGiven").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    list.extend(new.iter().map(|n| json!(n.at)));
    let skip = list.len().saturating_sub(MAX_KEPT);
    Value::Array(list.into_iter().skip(skip).collect())
}

/// What the model is told before the user's next message: its own reply
/// that was cut off and never saved, clearly marked as such.
pub fn context_text(lost: &[Interrupted]) -> String {
    let text = lost.iter().map(|n| n.text.trim()).collect::<Vec<_>>().join("\n\n");
    let count = text.chars().count();
    let text = if count > MAX_CONTEXT {
        format!("[…beginning left out…]\n{}", text.chars().skip(count - MAX_CONTEXT).collect::<String>())
    } else {
        text
    };
    format!(
        "[Vibework note, not written by the user] Your previous reply was cut off: the agent engine stopped before it finished, \
so that reply was never saved and is missing from the conversation above. The user saw this much of it:\n\n\
<interrupted_reply>\n{text}\n</interrupted_reply>\n\n\
This is your own unfinished text, not a message from the user. Anything it says it was about to do was not done. \
Continue from where it stopped instead of starting the answer over, unless the user's next message asks for something else."
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pending_until_saved_then_from_metadata() {
        let id = "ses_interruptedtest";
        record(id, 5.0, "word0".into(), "The agent restarted.".into());
        let meta = Map::new();
        assert_eq!(all(&meta, id).len(), 1);
        let value = merged_value(&meta, &pending(id));
        let mut meta = Map::new();
        meta.insert("interruptedTurns".into(), value);
        forget(id, &pending(id));
        assert!(pending(id).is_empty());
        let shown = all(&meta, id);
        assert_eq!(shown, vec![Interrupted { at: 5.0, text: "word0".into(), reason: "The agent restarted.".into() }]);
        // No duplicates when the same note is merged again
        assert_eq!(merged_value(&meta, &shown).as_array().unwrap().len(), 1);
    }

    #[test]
    fn lost_text_is_given_once_and_only_for_the_latest_turn() {
        let id = "ses_givenonce";
        let mut meta = Map::new();
        meta.insert("interruptedTurns".into(), json!([
            { "at": 5.0, "text": "old answer", "reason": "r" },
            { "at": 50.0, "text": "", "reason": "r" },
            { "at": 60.0, "text": "Step one is", "reason": "r" },
        ]));
        // The user wrote at 20: only what was lost after that counts
        let lost = not_given(&meta, id, Some(20.0));
        assert_eq!(lost.iter().map(|n| n.at).collect::<Vec<_>>(), vec![60.0]);
        let text = context_text(&lost);
        assert!(text.contains("<interrupted_reply>\nStep one is\n</interrupted_reply>"));
        assert!(text.contains("not written by the user"));
        meta.insert("interruptedGiven".into(), given_value(&meta, &lost));
        assert!(not_given(&meta, id, Some(20.0)).is_empty());
        // Long text keeps its end
        let long = Interrupted { at: 1.0, text: "x".repeat(40_000) + "END", reason: "r".into() };
        let text = context_text(&[long]);
        assert!(text.contains("beginning left out") && text.contains("END") && text.len() < 31_000);
    }
}
