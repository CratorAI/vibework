//! Convert an engine session's message list into the history format the UI
//! loads today (`MessageInfo`: Anthropic-style messages with `thinking`,
//! `text`, `tool_use` blocks and `tool_result` blocks in a following user
//! message), with step timings derived from the engine's own timestamps.

use serde_json::{json, Value};

use super::tools;
use super::types::MessageInfo;

pub fn iso(ms: Option<f64>) -> String {
    let ms = ms.unwrap_or(0.0) as i64;
    chrono::DateTime::<chrono::Utc>::from_timestamp_millis(ms)
        .unwrap_or_default()
        .to_rfc3339()
}

fn duration(start: Option<f64>, end: Option<f64>) -> Option<u64> {
    match (start, end) {
        (Some(s), Some(e)) if e >= s => Some((e - s) as u64),
        _ => None,
    }
}

fn timing(kind: &str, id: String, started: Option<f64>, ended: Option<f64>, message_index: usize, block_index: Option<usize>) -> Value {
    json!({
        "kind": kind,
        "id": id,
        "startedAt": iso(started),
        "durationMs": duration(started, ended),
        "messageIndex": message_index,
        "blockIndex": block_index,
    })
}

/// Total length of a set of time intervals, overlaps counted once (ms).
pub fn union_ms(mut spans: Vec<(f64, f64)>) -> f64 {
    spans.retain(|(s, e)| e > s);
    spans.sort_by(|a, b| a.0.total_cmp(&b.0));
    let mut total = 0.0;
    let mut current: Option<(f64, f64)> = None;
    for (s, e) in spans {
        match current {
            Some((cs, ce)) if s <= ce => current = Some((cs, ce.max(e))),
            Some((cs, ce)) => { total += ce - cs; current = Some((s, e)); }
            None => current = Some((s, e)),
        }
    }
    if let Some((cs, ce)) = current { total += ce - cs; }
    total
}

/// A turn's timing: "Worked for" is the agent's own time, so the time it
/// waited for the user's approvals and answers is left out (and kept as
/// `waitMs` for the tooltip).
fn turn_timing(start: Option<f64>, end: Option<f64>, waits: &[(f64, f64)], message_index: usize) -> Value {
    let mut value = timing("turn", iso(start), start, end, message_index, None);
    let clipped: Vec<(f64, f64)> = match (start, end) {
        (Some(s), Some(e)) => waits.iter().map(|&(a, b)| (a.max(s), b.min(e))).collect(),
        _ => Vec::new(),
    };
    let waited = union_ms(clipped) as u64;
    if waited > 0 {
        if let Some(ms) = value["durationMs"].as_u64() { value["durationMs"] = json!(ms.saturating_sub(waited)); }
        value["waitMs"] = json!(waited);
    }
    value
}

/// A turn the engine could not finish because it died or restarted: when,
/// the reply text it had streamed in its unsaved step, and why it stopped.
#[derive(Debug, Clone, PartialEq)]
pub struct Interrupted {
    pub at: f64,
    pub text: String,
    pub reason: String,
}

/// Answers to a question that was still pending when the app relaunched.
/// They went back to the agent as a message (`text`); the history shows that
/// message as the answered question instead of a typed one.
#[derive(Debug, Clone, PartialEq)]
pub struct RelaunchAnswer {
    pub text: String,
    /// The questions as the UI shows them (`header`, `question`, ...).
    pub questions: Value,
    /// header → the answer as shown.
    pub answers: Value,
}

/// What the app adds to the engine's history.
#[derive(Debug, Clone, Default)]
pub struct Extras {
    pub interrupted: Vec<Interrupted>,
    pub answers: Vec<RelaunchAnswer>,
    /// Time steps spent waiting for the user's approval, by tool call id
    /// (ms). The engine counts it in the step's time; the app does not.
    pub tool_waits: std::collections::HashMap<String, u64>,
}

/// `messages` oldest first, as returned by `GET /api/session/{id}/message?order=asc`.
#[cfg(test)]
pub fn to_message_infos(messages: &[Value], working_dir: Option<&str>) -> Vec<MessageInfo> {
    to_message_infos_with(messages, working_dir, &Extras::default())
}

/// Like [`to_message_infos`], with interrupted turns put back where they
/// happened (the text that streamed and the reason, inline) and answers
/// sent after a relaunch shown as the answered question.
pub fn to_message_infos_with(messages: &[Value], working_dir: Option<&str>, extras: &Extras) -> Vec<MessageInfo> {
    let interrupted = &extras.interrupted;
    let mut answers: Vec<&RelaunchAnswer> = extras.answers.iter().collect();
    let mut out: Vec<MessageInfo> = Vec::new();
    // Index (in `out`) of the user message whose turn is still open.
    let mut open_turn: Option<(usize, Option<f64>)> = None;
    // When the open turn waited for the user: approvals and questions.
    let mut turn_waits: Vec<(f64, f64)> = Vec::new();
    // The turn's last step was cut off by Stop: mark the reply "Stopped"
    // when the turn ends there (an aborted step the turn went on from is not).
    let mut stopped: Option<usize> = None;
    let mut interrupted: Vec<&Interrupted> = interrupted.iter().collect();
    interrupted.sort_by(|a, b| a.at.total_cmp(&b.at));
    let mut interrupted = interrupted.into_iter().peekable();
    let end_stopped = |out: &mut Vec<MessageInfo>, stopped: &mut Option<usize>| {
        if let Some(index) = stopped.take() {
            out[index].end = Some(json!({ "kind": "stopped" }));
        }
    };
    let put_interrupted = |out: &mut Vec<MessageInfo>, note: &Interrupted| {
        let content = if note.text.trim().is_empty() { json!([]) } else { json!([{ "type": "text", "text": note.text }]) };
        out.push(MessageInfo { timings: Vec::new(), role: "assistant".into(), content, notes: Vec::new(), end: Some(json!({ "kind": "failed", "text": note.reason })), source_ids: Vec::new() });
    };

    for message in messages {
        let created = message["time"]["created"].as_f64();
        if let Some(at) = created {
            while interrupted.peek().is_some_and(|n| n.at < at && message["type"] != "assistant") {
                end_stopped(&mut out, &mut stopped);
                put_interrupted(&mut out, interrupted.next().unwrap());
            }
        }
        match message["type"].as_str().unwrap_or_default() {
            "user" => {
                let text = message["text"].as_str().unwrap_or_default().to_string();
                let answer_at = answers.iter().position(|a| a.text == text);
                if answer_at.is_some() {
                    // Answers after a relaunch continue the turn the quit cut off: not a stop.
                    stopped = None;
                } else {
                    end_stopped(&mut out, &mut stopped);
                }
                let steered = message["metadata"]["vibeworkInbox"] == true && open_turn.is_some();
                if !steered { if let Some((index, start)) = open_turn.take() {
                    // A new prompt without an idle marker: close the previous turn here.
                    out[index].timings.push(turn_timing(start, created, &std::mem::take(&mut turn_waits), index));
                }}
                if let Some(pos) = answer_at {
                    let answer = answers.remove(pos);
                    let id = format!("relaunch-answer-{}", out.len());
                    out.push(MessageInfo { timings: Vec::new(), role: "assistant".into(), content: json!([{ "type": "tool_use", "id": id, "name": "AskUserQuestion", "input": { "questions": answer.questions } }]), notes: Vec::new(), end: None, source_ids: Vec::new() });
                    out.push(MessageInfo { timings: Vec::new(), role: "user".into(), content: json!([{ "type": "tool_result", "tool_use_id": id, "content": format!("User responded with the following answers:\n{}", answer.answers), "is_error": false }]), notes: Vec::new(), end: None, source_ids: Vec::new() });
                    continue;
                }
                // The user's own attachments stay previewable when the task is reopened
                crate::app_utils::attachment_preview::register_message(&text, working_dir);
                if steered {open_turn=Some((out.len(),open_turn.and_then(|(_,start)|start)));} else {open_turn = Some((out.len(), created));turn_waits.clear();}
                let source_ids = message["id"].as_str().map(|id| vec![id.to_string()]).unwrap_or_default();
                out.push(MessageInfo { timings: Vec::new(), role: "user".into(), content: Value::String(text), notes: Vec::new(), end: None, source_ids });
            }
            "assistant" => {
                let index = out.len();
                let mut blocks = Vec::new();
                let mut results = Vec::new();
                let mut timings = Vec::new();
                for part in message["content"].as_array().into_iter().flatten() {
                    let block_index = blocks.len();
                    match part["type"].as_str().unwrap_or_default() {
                        "reasoning" => {
                            let text = part["text"].as_str().unwrap_or_default();
                            if text.trim().is_empty() {
                                continue;
                            }
                            let start = part["time"]["created"].as_f64();
                            timings.push(timing("thinking", iso(start), start, part["time"]["completed"].as_f64(), index, Some(block_index)));
                            blocks.push(json!({ "type": "thinking", "thinking": text }));
                        }
                        "text" => {
                            let text = part["text"].as_str().unwrap_or_default();
                            if !text.is_empty() {
                                blocks.push(json!({ "type": "text", "text": text }));
                            }
                        }
                        "tool" => {
                            let id = part["id"].as_str().unwrap_or_default().to_string();
                            let engine_name = part["name"].as_str().unwrap_or_default();
                            let state = &part["state"];
                            let input = tools::app_tool_input(engine_name, &state["input"], working_dir);
                            let start = part["time"]["created"].as_f64();
                            let completed = part["time"]["completed"].as_f64();
                            let mut step = timing("tool", id.clone(), start, completed, index, Some(block_index));
                            // A question's step is all waiting for the answer.
                            if engine_name == "question" {
                                if let Some(s) = start { turn_waits.push((s, completed.unwrap_or(s))); }
                            }
                            if let Some(&wait) = extras.tool_waits.get(&id) {
                                if let Some(s) = start { turn_waits.push((s, s + wait as f64)); }
                                if let Some(ms) = step["durationMs"].as_u64() { step["durationMs"] = json!(ms.saturating_sub(wait)); }
                                step["waitMs"] = json!(wait);
                            }
                            timings.push(step);
                            blocks.push(json!({ "type": "tool_use", "id": id, "name": tools::app_tool_name(engine_name), "input": input }));
                            match state["status"].as_str() {
                                Some("completed") => results.push(json!({
                                    "type": "tool_result", "tool_use_id": id,
                                    "content": if engine_name == "subagent" { tools::helper_result(&tools::content_text(&state["content"]), false) } else { tools::content_text(&state["content"]) }, "is_error": false,
                                })),
                                Some("error") => results.push(json!({
                                    "type": "tool_result", "tool_use_id": id,
                                    "content": if engine_name == "subagent" { tools::helper_result(state["error"]["message"].as_str().or(state["error"].as_str()).unwrap_or("The helper failed"), true) } else { plain_error(state["error"]["message"].as_str().or(state["error"].as_str()).unwrap_or("The tool failed")).to_string() },
                                    "is_error": true,
                                })),
                                // Still running or interrupted before it ran: no result.
                                _ => {}
                            }
                        }
                        _ => {}
                    }
                }
                let aborted = message["error"]["type"] == "aborted" || message["error"]["message"] == "Step interrupted";
                if let Some(message) = message["error"]["message"].as_str() {
                    if !message.is_empty() && message != "Step interrupted" && !aborted {
                        blocks.push(json!({ "type": "text", "text": format!("Error: {message}") }));
                    }
                }
                if blocks.is_empty() && !aborted {
                    continue;
                }
                stopped = aborted.then_some(out.len());
                let source_ids = message["id"].as_str().map(|id| vec![id.to_string()]).unwrap_or_default();
                out.push(MessageInfo { timings, role: "assistant".into(), content: Value::Array(blocks), notes: Vec::new(), end: None, source_ids });
                if !results.is_empty() {
                    out.push(MessageInfo { timings: Vec::new(), role: "user".into(), content: Value::Array(results), notes: Vec::new(), end: None, source_ids: Vec::new() });
                }
            }
            // The stop is decided at the next prompt (or the end): answers
            // sent after a relaunch come after the idle the quit left.
            "idle" => {
                if let Some((index, start)) = open_turn.take() {
                    out[index].timings.push(turn_timing(start, created, &std::mem::take(&mut turn_waits), index));
                }
            }
            // Model/agent/location switches, synthetic and system entries are not shown.
            _ => {}
        }
    }
    end_stopped(&mut out, &mut stopped);
    for note in interrupted {
        put_interrupted(&mut out, note);
    }
    out
}

/// The engine's wording for a step cut off by the app quitting or restarting
/// ("location" is an engine term), in the user's words.
fn plain_error(message: &str) -> &str {
    if message.starts_with("Interaction cancelled because the location shut down") {
        "Stopped because Vibework quit or restarted before this step finished."
    } else {
        message
    }
}

/// Put each saved note (time in ms, text) on the first message the user sent
/// at or after it: notes are recorded just before that message goes out.
/// `infos` must come from `to_message_infos(messages, …)`.
pub fn with_notes(mut infos: Vec<MessageInfo>, messages: &[Value], notes: &[(f64, String)], extras: &Extras) -> Vec<MessageInfo> {
    if notes.is_empty() {
        return infos;
    }
    // The prompts in order, with their times; `infos` holds the same prompts in
    // the same order (as string-content user messages), less the answers
    // shown as answered questions.
    let mut answers: Vec<&str> = extras.answers.iter().map(|a| a.text.as_str()).collect();
    let times: Vec<f64> = messages
        .iter()
        .filter(|m| m["type"] == "user")
        .filter(|m| match answers.iter().position(|a| m["text"].as_str() == Some(*a)) {
            Some(pos) => { answers.remove(pos); false }
            None => true,
        })
        .map(|m| m["time"]["created"].as_f64().unwrap_or(0.0))
        .collect();
    let prompts: Vec<usize> = infos.iter().enumerate().filter(|(_, m)| m.role == "user" && m.content.is_string()).map(|(i, _)| i).collect();
    for (at, text) in notes {
        if let Some(n) = times.iter().position(|t| *t >= *at) {
            if let Some(&index) = prompts.get(n) {
                infos[index].notes.push(text.clone());
            }
        }
    }
    infos
}

/// Number of model calls (assistant steps) in a history, for usage totals.
pub fn count_calls(messages: &[Value]) -> u64 {
    messages.iter().filter(|m| m["type"] == "assistant" && m.get("tokens").is_some()).count() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_reply_cut_by_stop_ends_with_a_stopped_marker() {
        let messages = vec![
            json!({ "type": "user", "time": { "created": 1.0 }, "text": "go" }),
            json!({ "type": "assistant", "time": { "created": 2.0 }, "error": { "type": "aborted", "message": "Step interrupted" }, "content": [{ "type": "text", "text": "word0 word1" }] }),
            json!({ "type": "idle", "time": { "created": 3.0 } }),
        ];
        let infos = to_message_infos(&messages, None);
        assert_eq!(infos[1].content[0]["text"], "word0 word1");
        assert_eq!(infos[1].end, Some(json!({ "kind": "stopped" })));
        // Stop before any output still says so
        let empty = vec![messages[0].clone(), json!({ "type": "assistant", "time": { "created": 2.0 }, "error": { "type": "aborted", "message": "Step interrupted" }, "content": [] })];
        assert_eq!(to_message_infos(&empty, None)[1].end, Some(json!({ "kind": "stopped" })));
        // An aborted step the turn went on from is not a stop
        let went_on = vec![messages[0].clone(), messages[1].clone(), json!({ "type": "assistant", "time": { "created": 2.5 }, "content": [{ "type": "text", "text": "more" }] }), messages[2].clone()];
        assert!(to_message_infos(&went_on, None).iter().all(|m| m.end.is_none()));
    }

    #[test]
    fn answers_sent_after_a_relaunch_show_as_the_answered_question() {
        let text = "My answers to your pending questions:\nTea or coffee? Tea\nPlease continue.";
        let messages = vec![
            json!({ "type": "user", "time": { "created": 1.0 }, "text": "ask me" }),
            json!({ "type": "assistant", "time": { "created": 2.0 }, "error": { "type": "aborted", "message": "Step interrupted" }, "content": [{ "type": "text", "text": "Let me ask." }] }),
            json!({ "type": "idle", "time": { "created": 3.0 } }),
            json!({ "type": "user", "time": { "created": 5.0 }, "text": text }),
            json!({ "type": "assistant", "time": { "created": 6.0 }, "content": [{ "type": "text", "text": "Tea it is." }] }),
            json!({ "type": "user", "time": { "created": 9.0 }, "text": "thanks" }),
        ];
        let extras = Extras { answers: vec![RelaunchAnswer { text: text.into(), questions: json!([{ "header": "1 · Drink", "question": "Tea or coffee?" }]), answers: json!({ "1 · Drink": "Tea" }) }], ..Default::default() };
        let infos = to_message_infos_with(&messages, None, &extras);
        assert!(infos.iter().all(|m| m.content.as_str() != Some(text)));
        assert!(infos.iter().all(|m| m.end.is_none()), "the quit before the answer is not a stop");
        let card = infos.iter().find(|m| m.content[0]["name"] == "AskUserQuestion").unwrap();
        assert_eq!(card.role, "assistant");
        let result = infos.iter().find(|m| m.content[0]["type"] == "tool_result").unwrap();
        assert!(result.content[0]["content"].as_str().unwrap().contains("\"1 · Drink\":\"Tea\""));
        // Notes still land on the right prompt
        let with = with_notes(infos, &messages, &[(8.0, "Connector added: linear".into())], &extras);
        assert_eq!(with.iter().find(|m| m.content == "thanks").unwrap().notes, vec!["Connector added: linear".to_string()]);
    }

    #[test]
    fn a_steps_time_leaves_out_the_wait_for_approval() {
        let messages = vec![
            json!({ "type": "user", "time": { "created": 1.0 }, "text": "go" }),
            json!({ "type": "assistant", "time": { "created": 2.0 }, "content": [{ "type": "tool", "id": "call_1", "name": "shell", "time": { "created": 1000.0, "ran": 1003.0, "completed": 319000.0 }, "state": { "status": "completed", "input": { "command": "ls" }, "content": [] } }] }),
        ];
        let mut extras = Extras::default();
        extras.tool_waits.insert("call_1".into(), 316000);
        let infos = to_message_infos_with(&messages, None, &extras);
        let step = &infos[1].timings[0];
        assert_eq!(step["durationMs"], 2000);
        assert_eq!(step["waitMs"], 316000);
    }

    #[test]
    fn worked_for_leaves_out_waits_for_approvals_and_answers() {
        let messages = vec![
            json!({ "type": "user", "time": { "created": 0.0 }, "text": "go" }),
            json!({ "type": "assistant", "time": { "created": 1.0 }, "content": [
                { "type": "tool", "id": "q", "name": "question", "time": { "created": 1_000.0, "completed": 61_000.0 }, "state": { "status": "completed", "input": {}, "content": [] } },
                { "type": "tool", "id": "call_1", "name": "shell", "time": { "created": 70_000.0, "completed": 371_000.0 }, "state": { "status": "completed", "input": { "command": "ls" }, "content": [] } },
            ] }),
            json!({ "type": "idle", "time": { "created": 400_000.0 } }),
        ];
        let mut extras = Extras::default();
        extras.tool_waits.insert("call_1".into(), 300_000);
        let infos = to_message_infos_with(&messages, None, &extras);
        let turn = infos[0].timings.iter().find(|t| t["kind"] == "turn").unwrap();
        assert_eq!(turn["waitMs"], 360_000);
        assert_eq!(turn["durationMs"], 40_000);
        assert_eq!(union_ms(vec![(0.0, 10.0), (5.0, 20.0), (30.0, 40.0)]), 30.0);
    }

    #[test]
    fn a_turn_cut_by_an_engine_crash_keeps_its_text_and_reason() {
        let messages = vec![
            json!({ "type": "user", "time": { "created": 1.0 }, "text": "go" }),
            json!({ "type": "assistant", "time": { "created": 2.0 }, "content": [{ "type": "text", "text": "" }] }),
            json!({ "type": "user", "time": { "created": 10.0 }, "text": "again" }),
        ];
        let note = Interrupted { at: 5.0, text: "word0 word1".into(), reason: "The agent restarted.".into() };
        let infos = to_message_infos_with(&messages, None, &Extras { interrupted: vec![note.clone()], ..Default::default() });
        assert_eq!(infos.len(), 3);
        assert_eq!(infos[1].content[0]["text"], "word0 word1");
        assert_eq!(infos[1].end, Some(json!({ "kind": "failed", "text": "The agent restarted." })));
        assert_eq!(infos[2].content, "again");
        // At the end of the history too
        let infos = to_message_infos_with(&messages[..2], None, &Extras { interrupted: vec![note], ..Default::default() });
        assert_eq!(infos.last().unwrap().end.as_ref().unwrap()["kind"], "failed");
    }

    fn sample() -> Vec<Value> {
        serde_json::from_str(include_str!("fixtures/history-write-shell.json")).unwrap()
    }

    #[test]
    fn converts_a_real_history() {
        let infos = to_message_infos(&sample(), Some("/work"));
        let roles: Vec<&str> = infos.iter().map(|m| m.role.as_str()).collect();
        // user, assistant (thinking + text + write), tool results, assistant (shell), results, assistant (done)
        assert_eq!(roles, ["user", "assistant", "user", "assistant", "user", "assistant"]);
        let first = infos[1].content.as_array().unwrap();
        assert_eq!(first[0]["type"], "thinking");
        let write = first.iter().find(|b| b["type"] == "tool_use").unwrap();
        assert_eq!(write["name"], "Write");
        assert_eq!(write["input"]["file_path"], "/work/hello.txt");
        let result = &infos[2].content[0];
        assert_eq!(result["tool_use_id"], write["id"]);
        assert_eq!(result["is_error"], false);
        let shell = &infos[3].content[0];
        assert_eq!(shell["name"], "Bash");
        assert_eq!(shell["input"]["command"], "ls -la");
        // Turn timing on the user message, tool timings with durations
        let turn = infos[0].timings.iter().find(|t| t["kind"] == "turn").unwrap();
        assert!(turn["durationMs"].as_u64().unwrap() > 0);
        let tool_timing = infos[3].timings.iter().find(|t| t["kind"] == "tool").unwrap();
        assert_eq!(tool_timing["id"], shell["id"]);
        assert_eq!(tool_timing["blockIndex"], 0);
        assert_eq!(count_calls(&sample()), 3);
    }

    #[test]
    fn notes_go_on_the_next_prompt() {
        let messages = vec![
            json!({ "type": "user", "text": "one", "time": { "created": 100.0 } }),
            json!({ "type": "user", "text": "two", "time": { "created": 200.0 } }),
        ];
        let infos = to_message_infos(&messages, None);
        let infos = with_notes(infos, &messages, &[(150.0, "Connector added: a".into()), (250.0, "Connector removed: b".into())], &Extras::default());
        assert!(infos[0].notes.is_empty());
        assert_eq!(infos[1].notes, vec!["Connector added: a"]);
        assert_eq!(infos.len(), 2);
    }

    #[test]
    fn a_step_cut_off_by_a_quit_says_so_plainly() {
        let messages = vec![
            json!({ "type": "user", "text": "go", "time": { "created": 1.0 } }),
            json!({ "type": "assistant", "time": { "created": 2.0 }, "error": { "type": "aborted", "message": "Step interrupted" }, "content": [
                { "type": "tool", "id": "c1", "name": "shell", "state": { "status": "error", "input": { "command": "ls" }, "error": { "type": "aborted", "message": "Interaction cancelled because the location shut down" } } }
            ] }),
        ];
        let infos = to_message_infos(&messages, None);
        let result = &infos.last().unwrap().content[0];
        assert_eq!(result["is_error"], true);
        assert_eq!(result["content"], "Stopped because Vibework quit or restarted before this step finished.");
    }
}

/// Restore the steps of a helper from its native child-session history.
/// A continued helper shows only the calls made during this invocation.
pub fn helper_state(messages: &[Value], start: f64, end: f64, working_dir: Option<&str>) -> Value {
    let mut steps = Vec::new();
    let mut text = String::new();
    for message in messages.iter().filter(|m| m["type"] == "assistant") {
        let at = message["time"]["created"].as_f64().unwrap_or(0.0);
        if at < start || at > end { continue; }
        text.clear();
        for part in message["content"].as_array().into_iter().flatten() {
            if part["type"] == "text" { text.push_str(part["text"].as_str().unwrap_or_default()); }
            if part["type"] != "tool" { continue; }
            let state = &part["state"];
            let failed = state["status"] == "error";
            let output = if failed { state["error"]["message"].as_str().or(state["error"].as_str()).unwrap_or("The step failed").to_string() } else { tools::content_text(&state["content"]) };
            let name = part["name"].as_str().unwrap_or_default();
            steps.push(json!({ "type": "tool", "id": part["id"],
                "call": { "id": part["id"], "name": tools::app_tool_name(name), "input": tools::app_tool_input(name, &state["input"], working_dir), "isExecuting": false,
                    "result": { "success": !failed, "output": output, "error": if failed { Some(&output) } else { None } } },
                "timing": timing("tool", part["id"].as_str().unwrap_or_default().into(), part["time"]["created"].as_f64(), part["time"]["completed"].as_f64(), 0, None)
            }));
        }
    }
    json!({ "steps": steps, "text": text })
}

#[cfg(test)]
mod helper_tests {
    use super::*;
    #[test]
    fn native_helper_history_restores_steps_answers_and_invocation_boundaries() {
        let messages = vec![
            json!({"type":"assistant","time":{"created":10},"content":[{"type":"tool","id":"old","name":"shell","state":{"status":"completed","input":{"command":"old"},"content":[]}}]}),
            json!({"type":"assistant","time":{"created":20},"content":[{"type":"tool","id":"new","name":"shell","time":{"created":20,"completed":30},"state":{"status":"completed","input":{"command":"ls"},"content":[{"type":"text","text":"file.txt"}]}}]}),
            json!({"type":"assistant","time":{"created":40},"content":[{"type":"text","text":"Found file.txt"}]}),
        ];
        let state = helper_state(&messages,15.0,50.0,Some("/work"));
        assert_eq!(state["steps"].as_array().unwrap().len(),1);
        assert_eq!(state["steps"][0]["call"]["name"],"Bash");
        assert_eq!(state["steps"][0]["call"]["result"]["output"],"file.txt");
        assert_eq!(state["steps"][0]["timing"]["durationMs"],10);
        assert_eq!(state["text"],"Found file.txt");
    }
}
