//! App-owned pending forms survive an engine shutdown (2.2.7 keeps forms in memory).
use serde_json::{json, Value};
use super::events::Effect;

fn path(session: &str) -> Result<std::path::PathBuf, String> {
    if !session.starts_with("ses_") || !session.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err("Invalid engine session ID".into());
    }
    Ok(crate::paths::get_app_data_dir().join("opencode/pending-forms").join(format!("{session}.json")))
}

pub fn pending(session: &str) -> Vec<Value> {
    path(session).ok().and_then(|p| std::fs::read(p).ok())
        .and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

pub fn save(session: &str, forms: &[Value]) -> Result<(), String> {
    let path = path(session)?;
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let temp = path.with_extension("tmp");
    std::fs::write(&temp, serde_json::to_vec(forms).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    #[cfg(unix)] {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&temp, std::fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
    }
    std::fs::rename(temp, path).map_err(|e| e.to_string())
}

pub fn payload(form: &Value) -> Value {
    let fields = form["fields"].as_array().cloned().unwrap_or_default();
    let questions: Vec<Value> = fields.iter().enumerate().map(|(i,f)| json!({
        "header": format!("{} · {}", i + 1, f["title"].as_str().unwrap_or("Question")),
        "question": f["description"].as_str().or(f["title"].as_str()).unwrap_or("Your answer"),
        "multiSelect": f["type"] == "multiselect",
        "options": f["options"].as_array().cloned().unwrap_or_default().iter().map(|o| json!({"label":o["label"],"description":o["description"]})).collect::<Vec<_>>()
    })).collect();
    json!({"request_id":form["id"],"questions":questions})
}

pub fn show(app_id: &str, form: &Value) -> Vec<Effect> {
    vec![Effect::Emit("agent:ask-user-question",json!({"sessionId":app_id,"data":{"AskUserQuestion":payload(form)}}))]
}

/// Answers sent as a message after a relaunch (`record_relaunch_answer`).
pub fn saved_answers(meta: &serde_json::Map<String, Value>) -> Vec<super::history::RelaunchAnswer> {
    meta.get("relaunchAnswers").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|v| Some(super::history::RelaunchAnswer {
        text: v["text"].as_str()?.to_string(),
        questions: v["questions"].clone(),
        answers: v["answers"].clone(),
    })).collect()).unwrap_or_default()
}

/// An answer as the answered-question card shows it (several choices joined).
pub fn shown_answer(value: &str) -> String {
    serde_json::from_str::<Vec<String>>(value).map(|v| v.join(", ")).unwrap_or_else(|_| value.to_string())
}

/// Returns true when the answers went back as a new message (the engine had
/// restarted since the question was asked).
pub async fn answer(app_id: String, request: String, answers: std::collections::HashMap<String,String>) -> Result<bool, String> {
    let engine = super::get()?;
    let session = super::client::engine_session_id(&app_id);
    let mut forms = pending(&session);
    let form = forms.iter().find(|f| f["id"] == request).cloned().ok_or("This question is no longer pending")?;
    let mut answer = serde_json::Map::new();
    let display = payload(&form);
    for (i,field) in form["fields"].as_array().ok_or("Question has no fields")?.iter().enumerate() {
        let key = field["key"].as_str().ok_or("Question field has no key")?;
        let header = display["questions"][i]["header"].as_str().unwrap_or(key);
        let value = answers.get(header).ok_or("An answer is missing")?;
        let value = if field["type"] == "multiselect" {
            // UI now sends lossless JSON for multiple selection; accept legacy values too.
            serde_json::from_str::<Vec<String>>(value).map(|v| json!(v))
                .unwrap_or_else(|_| json!([value]))
        } else { json!(value) };
        let options = field["options"].as_array();
        let map = |v: &Value| options.and_then(|o| o.iter().find(|o| o["label"] == *v)).map(|o| o["value"].clone()).unwrap_or_else(|| v.clone());
        answer.insert(key.into(), if let Some(a) = value.as_array() {Value::Array(a.iter().map(map).collect())} else {map(&value)});
    }
    let client = engine.client().await?;
    let live = client.get(&format!("/api/session/{session}/form")).await?;
    let exists = live["data"].as_array().is_some_and(|v| v.iter().any(|f| f["id"] == request));
    if exists {
        client.post(&format!("/api/session/{session}/form/{request}/reply"), &json!({"answer":answer})).await?;
    } else {
        // After an engine restart there is no suspended execution to resume.
        // Send an explicit human answer as a new turn; never replay the old tool.
        let text = format!("My answers to your pending questions:\n{}\nPlease continue.", form["fields"].as_array().unwrap().iter().map(|f| {
            let question = f["description"].as_str().or(f["title"].as_str()).unwrap_or("Question");
            let value = &answer[f["key"].as_str().unwrap_or("")];
            let value = if let Some(values)=value.as_array(){values.iter().filter_map(Value::as_str).collect::<Vec<_>>().join(", ")}else{value.as_str().unwrap_or("").to_string()};
            format!("{question} {value}")
        }).collect::<Vec<_>>().join("\n"));
        // The conversation shows it as the answered question, not a typed message.
        let shown: serde_json::Map<String, Value> = answers.iter().map(|(k, v)| (k.clone(), json!(shown_answer(v)))).collect();
        if let Err(e) = super::commands::record_relaunch_answer(&app_id, &text, display["questions"].clone(), Value::Object(shown)).await {
            tracing::warn!("Could not record the answered question: {e}");
        }
        super::commands::send_message(app_id.clone(), text).await?;
    }
    forms.retain(|f| f["id"] != request);
    save(&session, &forms)?;
    if let Some(next) = forms.first() { engine.perform(show(&app_id, next)); }
    Ok(!exists)
}

pub fn forget(session: &str) {
    if let Ok(path)=path(session) {let _=std::fs::remove_file(path);}
}
