//! Connector notes in a task's timeline.
//!
//! Connectors are the engine's own MCP servers (`crate::connectors`): the
//! engine applies a change to the connectors file in every open folder
//! without a restart, and the very next turn sees it. Each task remembers
//! which connectors it last worked with (`metadata.vibework.connectors`,
//! name → a hash of what defines the connector, never its env or header
//! values), so its timeline can say "Connector added: <name>" when that set
//! changes between two of its messages.

use std::collections::BTreeMap;

use serde_json::{json, Map, Value};

/// Most notes kept per task (oldest dropped first).
const MAX_NOTES: usize = 100;

/// The connectors a task should have now (see `crate::connectors::desired`).
pub fn desired() -> BTreeMap<String, String> {
    crate::connectors::desired()
}

/// Connectors still configured whose sign-in lapsed (their tools left the task).
pub fn lapsed() -> Vec<String> {
    crate::connectors::lapsed()
}

/// The timeline notes for a task whose connectors were `before` and are now
/// `now`: added, then updated, then removed (or waiting for a new sign-in,
/// for those in `lapsed`), each by name.
pub fn notes(before: &Map<String, Value>, now: &BTreeMap<String, String>, lapsed: &[String]) -> Vec<String> {
    let mut out: Vec<String> = now.keys().filter(|name| !before.contains_key(*name)).map(|name| format!("Connector added: {name}")).collect();
    for (name, hash) in now {
        if before.get(name).and_then(Value::as_str).is_some_and(|old| old != hash) {
            out.push(format!("Connector updated: {name}"));
        }
    }
    for name in before.keys() {
        if !now.contains_key(name) {
            if lapsed.contains(name) {
                out.push(format!("Connector needs sign-in: {name}"));
            } else {
                out.push(format!("Connector removed: {name}"));
            }
        }
    }
    out
}

/// `metadata.vibework` fields recording that the task now works with `now`
/// (and the notes it gets for that), given its current `metadata.vibework`.
/// None when nothing changed. A task with no record yet gets one, silently.
pub fn session_update(meta: &Map<String, Value>, now: &BTreeMap<String, String>, lapsed: &[String], at_ms: i64) -> Option<(Value, Vec<String>)> {
    let record: Map<String, Value> = now.iter().map(|(k, v)| (k.clone(), Value::String(v.clone()))).collect();
    let Some(before) = meta.get("connectors").and_then(Value::as_object) else {
        return Some((json!({ "connectors": record }), Vec::new()));
    };
    let notes = notes(before, now, lapsed);
    if notes.is_empty() {
        return None;
    }
    let mut kept: Vec<Value> = meta.get("connectorNotes").and_then(Value::as_array).cloned().unwrap_or_default();
    kept.extend(notes.iter().map(|text| json!({ "at": at_ms, "text": text })));
    let drop = kept.len().saturating_sub(MAX_NOTES);
    kept.drain(..drop);
    Some((json!({ "connectors": record, "connectorNotes": kept }), notes))
}

/// The notes saved on a task, as (time in ms, text), oldest first.
pub fn saved_notes(meta: &Map<String, Value>) -> Vec<(f64, String)> {
    meta.get("connectorNotes")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|n| Some((n["at"].as_f64()?, n["text"].as_str()?.to_string())))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn map(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn notes_name_what_changed() {
        let before = json!({ "a": "1", "b": "1", "c": "1" });
        let now = map(&[("a", "1"), ("b", "2"), ("d", "1")]);
        assert_eq!(
            notes(before.as_object().unwrap(), &now, &[]),
            vec!["Connector added: d", "Connector updated: b", "Connector removed: c"]
        );
        assert_eq!(notes(before.as_object().unwrap(), &now, &["c".to_string()]).last().unwrap(), "Connector needs sign-in: c");
    }

    #[test]
    fn first_record_is_silent_then_changes_are_noted() {
        let now = map(&[("a", "1")]);
        let (fields, notes) = session_update(&Map::new(), &now, &[], 5).unwrap();
        assert!(notes.is_empty());
        assert_eq!(fields, json!({ "connectors": { "a": "1" } }));

        let meta = fields.as_object().unwrap().clone();
        assert!(session_update(&meta, &now, &[], 6).is_none());

        let later = map(&[("a", "1"), ("b", "9")]);
        let (fields, notes) = session_update(&meta, &later, &[], 7).unwrap();
        assert_eq!(notes, vec!["Connector added: b"]);
        assert_eq!(fields["connectorNotes"], json!([{ "at": 7, "text": "Connector added: b" }]));
        assert_eq!(saved_notes(fields.as_object().unwrap()), vec![(7.0, "Connector added: b".to_string())]);
    }

    #[test]
    fn notes_are_capped() {
        let mut meta = Map::new();
        meta.insert("connectors".into(), json!({}));
        meta.insert("connectorNotes".into(), Value::Array((0..MAX_NOTES).map(|i| json!({ "at": i, "text": "x" })).collect()));
        let (fields, _) = session_update(&meta, &map(&[("z", "1")]), &[], 999).unwrap();
        let kept = fields["connectorNotes"].as_array().unwrap();
        assert_eq!(kept.len(), MAX_NOTES);
        assert_eq!(kept.last().unwrap()["text"], "Connector added: z");
        assert_eq!(kept[0]["at"], 1);
    }
}
