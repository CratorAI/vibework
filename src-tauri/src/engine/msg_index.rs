//! Message search: a local full-text index of what the user and the agent
//! said in each task, for the search window (⌘K).
//!
//! Only the visible message text goes in: the user's typed messages (with
//! attachment tags removed, so neither an attachment's path nor its content)
//! and the assistant's reply text. Never reasoning, tool input or output,
//! file contents, the app's synthetic context, keys or connector settings.
//! It lives in the app's data folder (`search/messages.sqlite`, 0600 in a
//! 0700 folder) as an SQLite FTS5 table, is built in the background from the
//! engine's history (only tasks whose history changed are read again), is
//! brought up to date when a turn ends, and loses a task when the task is
//! deleted (and again when the trash is purged).

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use once_cell::sync::Lazy;
use rusqlite::{params, Connection};
use serde::Serialize;
use serde_json::Value;

/// Bump when what goes into the index changes, so every task is read again.
const SCHEMA: &str = "v1";
/// Longest text indexed per message (characters).
const MAX_BODY: usize = 20_000;
/// Words around a match in a snippet.
const SNIPPET_WORDS: i32 = 12;
/// Rows looked at per query before keeping the best one per task.
const MAX_ROWS: usize = 600;

static DB: Lazy<Mutex<Option<Connection>>> = Lazy::new(|| Mutex::new(None));

fn path() -> PathBuf {
    crate::paths::get_app_data_dir().join("search").join("messages.sqlite")
}

fn open() -> Result<Connection, String> {
    let path = path();
    let dir = path.parent().unwrap();
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700));
    }
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    init(&conn)?;
    Ok(conn)
}

fn init(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         CREATE TABLE IF NOT EXISTS tasks (task TEXT PRIMARY KEY, version TEXT NOT NULL);
         CREATE VIRTUAL TABLE IF NOT EXISTS messages USING fts5(
             body, task UNINDEXED, msg UNINDEXED, role UNINDEXED, at UNINDEXED,
             tokenize = 'unicode61 remove_diacritics 2'
         );",
    )
    .map_err(|e| e.to_string())
}

/// Run `f` on the index, opening it the first time.
fn with<T>(f: impl FnOnce(&mut Connection) -> rusqlite::Result<T>) -> Result<T, String> {
    let mut guard = DB.lock().unwrap();
    if guard.is_none() {
        *guard = Some(open()?);
    }
    f(guard.as_mut().unwrap()).map_err(|e| e.to_string())
}

/// One indexed message.
#[derive(Debug, Clone, PartialEq)]
pub struct Entry {
    /// The engine's message id (the conversation scrolls to it)
    pub msg: String,
    pub role: &'static str,
    pub at: f64,
    pub body: String,
}

/// Remove `<tag>…</tag>` spans (attachments, the app's hidden blocks).
fn drop_tags(text: &str, open: &str, close_prefix: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(start) = rest.find(open) {
        out.push_str(&rest[..start]);
        let after = &rest[start..];
        match after.find(close_prefix).and_then(|i| after[i..].find('>').map(|j| i + j + 1)) {
            Some(end) => rest = &after[end..],
            None => { rest = ""; break; }
        }
    }
    out.push_str(rest);
    out
}

/// The text a user message shows: attachment tags and the app's hidden
/// blocks removed, file mentions as their names.
pub fn user_text(text: &str) -> String {
    let text = drop_tags(text, "<vibe-work-attachment>", "</vibe-work-attachment");
    let text = drop_tags(&text, "<vibe-working-agent-", "</vibe-working-agent-");
    // A skill chosen with "/" reads as it was typed: "/vibework-slides"
    let text = text.replace("<vibe-work-skill>", "/").replace("</vibe-work-skill>", "");
    let mut out = String::new();
    let mut rest = text.as_str();
    while let Some(start) = rest.find("<vibe-work-file>") {
        out.push_str(&rest[..start]);
        let inner = &rest[start + "<vibe-work-file>".len()..];
        match inner.find("</vibe-work-file>") {
            Some(end) => {
                let path = inner[..end].trim();
                out.push_str(path.rsplit('/').next().unwrap_or(path));
                rest = &inner[end + "</vibe-work-file>".len()..];
            }
            None => { rest = ""; break; }
        }
    }
    out.push_str(rest);
    out.trim().to_string()
}

fn clipped(text: &str) -> String {
    text.chars().take(MAX_BODY).collect()
}

/// What to index from a task's history (`messages` oldest first, as the
/// engine returns them). `hidden` are user messages the conversation does
/// not show as typed text (answers sent after a relaunch).
pub fn entries(messages: &[Value], hidden: &[String]) -> Vec<Entry> {
    let mut out = Vec::new();
    for message in messages {
        let id = message["id"].as_str().unwrap_or_default();
        if id.is_empty() { continue; }
        let at = message["time"]["created"].as_f64().unwrap_or(0.0);
        match message["type"].as_str().unwrap_or_default() {
            "user" => {
                let raw = message["text"].as_str().unwrap_or_default();
                if hidden.iter().any(|h| h == raw) { continue; }
                let body = user_text(raw);
                if !body.is_empty() {
                    out.push(Entry { msg: id.to_string(), role: "user", at, body: clipped(&body) });
                }
            }
            "assistant" => {
                // Reply text only: no reasoning, tools or their output
                let body = message["content"].as_array().into_iter().flatten()
                    .filter(|p| p["type"] == "text")
                    .filter_map(|p| p["text"].as_str())
                    .filter(|t| !t.trim().is_empty())
                    .collect::<Vec<_>>()
                    .join("\n\n");
                if !body.trim().is_empty() {
                    out.push(Entry { msg: id.to_string(), role: "assistant", at, body: clipped(body.trim()) });
                }
            }
            // Synthetic context, system entries, shells, switches: not shown
            _ => {}
        }
    }
    out
}

/// The version the index records for a task, from the engine's session.
pub fn version(session: &Value) -> String {
    let updated = session["time"]["updated"].as_f64().or(session["time"]["created"].as_f64()).unwrap_or(0.0);
    format!("{SCHEMA}:{updated}")
}

/// Replace what the index holds for a task.
pub fn replace_task(task: &str, version: &str, entries: &[Entry]) -> Result<(), String> {
    with(|conn| {
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM messages WHERE task = ?1", params![task])?;
        {
            let mut insert = tx.prepare("INSERT INTO messages (body, task, msg, role, at) VALUES (?1, ?2, ?3, ?4, ?5)")?;
            for e in entries {
                insert.execute(params![e.body, task, e.msg, e.role, e.at])?;
            }
        }
        tx.execute("INSERT OR REPLACE INTO tasks (task, version) VALUES (?1, ?2)", params![task, version])?;
        tx.commit()
    })
}

/// Forget a task (deleted or purged).
pub fn remove_task(task: &str) -> Result<(), String> {
    with(|conn| {
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM messages WHERE task = ?1", params![task])?;
        tx.execute("DELETE FROM tasks WHERE task = ?1", params![task])?;
        tx.commit()
    })
}

/// The version indexed for each task.
pub fn versions() -> Result<HashMap<String, String>, String> {
    with(|conn| {
        let mut stmt = conn.prepare("SELECT task, version FROM tasks")?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
        rows.collect()
    })
}

/// The words of a query, as FTS5 prefix terms ("invoice"*), all required.
fn fts_query(query: &str) -> Option<String> {
    let terms: Vec<String> = query
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .take(12)
        .map(|w| format!("\"{}\"*", w.replace('"', "")))
        .collect();
    (!terms.is_empty()).then(|| terms.join(" AND "))
}

/// A task whose messages match a query: its best message and a snippet of
/// it, with the matched words as UTF-16 ranges (as the web view counts).
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Hit {
    pub task: String,
    pub message_id: String,
    pub role: String,
    pub snippet: String,
    pub ranges: Vec<[usize; 2]>,
    /// The snippet starts or ends inside the message
    pub cut_start: bool,
    pub cut_end: bool,
}

const MARK_OPEN: char = '\u{1}';
const MARK_CLOSE: char = '\u{2}';

/// Turn FTS5's marked snippet into text and highlight ranges (UTF-16).
fn unmark(marked: &str) -> (String, Vec<[usize; 2]>) {
    let mut text = String::new();
    let mut ranges = Vec::new();
    let mut units = 0usize;
    let mut start = None;
    for c in marked.chars() {
        match c {
            MARK_OPEN => start = Some(units),
            MARK_CLOSE => {
                if let Some(s) = start.take() { if units > s { ranges.push([s, units]); } }
            }
            '\n' | '\r' | '\t' => { text.push(' '); units += 1; }
            c => { text.push(c); units += c.len_utf16(); }
        }
    }
    (text, ranges)
}

/// Tasks whose messages match `query`, best first, one hit per task.
pub fn search(query: &str, limit: usize) -> Result<Vec<Hit>, String> {
    let Some(q) = fts_query(query) else { return Ok(Vec::new()) };
    let rows: Vec<(String, String, String, String)> = with(|conn| {
        let mut stmt = conn.prepare(&format!(
            "SELECT task, msg, role, snippet(messages, 0, char(1), char(2), '…', {SNIPPET_WORDS}) \
             FROM messages WHERE messages MATCH ?1 ORDER BY bm25(messages) LIMIT {MAX_ROWS}"
        ))?;
        let rows = stmt.query_map(params![q], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?;
        rows.collect()
    })?;
    let mut seen = std::collections::HashSet::new();
    let mut hits = Vec::new();
    for (task, msg, role, marked) in rows {
        if !seen.insert(task.clone()) { continue; }
        let (mut snippet, mut ranges) = unmark(&marked);
        let cut_start = snippet.starts_with('…');
        let cut_end = snippet.ends_with('…');
        if cut_start {
            snippet = snippet['…'.len_utf8()..].to_string();
            for r in &mut ranges { r[0] -= 1; r[1] -= 1; }
        }
        if cut_end { snippet.truncate(snippet.len() - '…'.len_utf8()); }
        hits.push(Hit { task, message_id: msg, role, snippet: snippet.trim_end().to_string(), ranges, cut_start, cut_end });
        if hits.len() >= limit { break; }
    }
    Ok(hits)
}

/// Drop the whole index (tests).
#[cfg(test)]
fn reset_for_tests() {
    let conn = Connection::open_in_memory().unwrap();
    init(&conn).unwrap();
    *DB.lock().unwrap() = Some(conn);
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn indexes_only_visible_message_text() {
        let messages = vec![
            json!({ "id": "m1", "type": "user", "time": { "created": 1.0 }, "text": "Check <vibe-work-attachment>/home/example/secret-plan.pdf</vibe-work-attachment> and <vibe-work-file>/work/budget.xlsx</vibe-work-file> please" }),
            json!({ "id": "m2", "type": "synthetic", "time": { "created": 2.0 }, "text": "[Vibework note] lost text" }),
            json!({ "id": "m3", "type": "assistant", "time": { "created": 3.0 }, "content": [
                { "type": "reasoning", "text": "thinking about invoices" },
                { "type": "tool", "id": "c1", "name": "read", "state": { "status": "completed", "input": { "path": "x" }, "content": [{ "type": "text", "text": "file contents" }] } },
                { "type": "text", "text": "Three invoices from Northwind have no receipt." },
            ] }),
            json!({ "id": "m4", "type": "user", "time": { "created": 4.0 }, "text": "My answers to your pending questions:\nTea" }),
        ];
        let got = entries(&messages, &["My answers to your pending questions:\nTea".into()]);
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].body, "Check  and budget.xlsx please");
        assert_eq!(got[1].body, "Three invoices from Northwind have no receipt.");
        let all: String = got.iter().map(|e| e.body.clone()).collect();
        for absent in ["secret-plan", "/home/example", "thinking", "file contents", "lost text", "Tea"] {
            assert!(!all.contains(absent), "{absent}");
        }
    }

    #[test]
    fn finds_tasks_by_word_starts_without_accents_and_keeps_one_hit_each() {
        reset_for_tests();
        let e = |msg: &str, role: &'static str, body: &str| Entry { msg: msg.into(), role, at: 1.0, body: body.into() };
        replace_task("task-a", "v1:1", &[e("a1", "user", "Please chase the overdue invoices"), e("a2", "assistant", "Done: three invoices from Northwind have no receipt attached, and the café paid the rest.")]).unwrap();
        replace_task("task-b", "v1:1", &[e("b1", "assistant", "Nothing about that here")]).unwrap();
        let hits = search("invoic northw", 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].task, "task-a");
        assert_eq!(hits[0].message_id, "a2");
        let marked: Vec<&str> = hits[0].ranges.iter().map(|r| &hits[0].snippet[r[0]..r[1]]).collect();
        assert_eq!(marked, vec!["invoices", "Northwind"]);
        // Accent-insensitive, case-insensitive
        assert_eq!(search("CAFE", 10).unwrap()[0].task, "task-a");
        // Middle of a word does not match; nothing to search is no result
        assert!(search("voices", 10).unwrap().is_empty());
        assert!(search("  \"' ", 10).unwrap().is_empty());
        // Removing a task removes its messages
        remove_task("task-a").unwrap();
        assert!(search("invoices", 10).unwrap().is_empty());
        assert!(!versions().unwrap().contains_key("task-a"));
        assert_eq!(versions().unwrap().get("task-b").map(String::as_str), Some("v1:1"));
    }

    #[test]
    fn snippet_ranges_count_utf16_units() {
        let (text, ranges) = unmark("…😀 \u{1}café\u{2} au lait…");
        assert_eq!(text, "…😀 café au lait…");
        // "…" is 1 unit, the emoji 2, the space 1: "café" starts at 4
        assert_eq!(ranges, vec![[4, 8]]);
    }
}
