//! Subscription telemetry from native public protocols. No prices or account identifiers.
use super::*;
use chrono::{DateTime, Local, Utc};

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Tokens {
    pub input: u64,
    pub output: u64,
    pub cached: Option<u64>,
    pub cache_write: Option<u64>,
}
impl Tokens {
    fn minus(&self, base: &Self) -> Self {
        Self {
            input: self.input.saturating_sub(base.input),
            output: self.output.saturating_sub(base.output),
            cached: self
                .cached
                .map(|v| v.saturating_sub(base.cached.unwrap_or(0))),
            cache_write: self
                .cache_write
                .map(|v| v.saturating_sub(base.cache_write.unwrap_or(0))),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnUsage {
    pub engine: Engine,
    pub turn_id: String,
    pub at: String,
    pub tokens: Tokens,
    #[serde(default)]
    pub main_only: bool,
    #[serde(default)]
    pub native_session: Option<String>,
    #[serde(default)]
    pub model_totals: Option<Value>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Window {
    pub id: String,
    pub label: String,
    pub used: Option<f64>,
    pub resets_at: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Limits {
    pub plan: Option<String>,
    pub windows: Vec<Window>,
    pub fetched_at: String,
    pub unavailable: bool,
    #[serde(default)]
    pub blocked: bool,
    pub blocked_until: Option<String>,
}
fn stamp(v: &Value) -> Option<String> {
    v.as_i64()
        .and_then(|n| DateTime::from_timestamp(n, 0))
        .map(|d| d.to_rfc3339())
        .or_else(|| {
            v.as_str()
                .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
                .map(|d| d.to_rfc3339())
        })
}
fn label(key: &str) -> String {
    match key {
        "five_hour" => "5 hours".into(),
        "seven_day" => "7 days".into(),
        "seven_day_opus" => "Opus · 7 days".into(),
        "seven_day_sonnet" => "Sonnet · 7 days".into(),
        "seven_day_oauth_apps" => "OAuth apps · 7 days".into(),
        _ => key.replace('_', " "),
    }
}
pub fn parse_limits(engine: Engine, value: &Value) -> Limits {
    let mut out = Limits {
        fetched_at: Utc::now().to_rfc3339(),
        ..Default::default()
    };
    if engine == Engine::ClaudeCode {
        out.plan = value["subscription_type"].as_str().map(str::to_string);
        out.unavailable = value["rate_limits_available"] == false;
        if let Some(windows) = value["rate_limits"].as_object() {
            for (id, v) in windows {
                if id == "model_scoped" {
                    for (i, m) in v.as_array().into_iter().flatten().enumerate() {
                        out.windows.push(Window {
                            id: format!("model-{i}"),
                            label: format!(
                                "{} · 7 days",
                                m["display_name"].as_str().unwrap_or("Model")
                            ),
                            used: m["utilization"].as_f64(),
                            resets_at: stamp(&m["resets_at"]),
                        });
                    }
                } else if v.is_object() && id != "extra_usage" && v.get("utilization").is_some() {
                    out.windows.push(Window {
                        id: id.clone(),
                        label: label(id),
                        used: v["utilization"].as_f64(),
                        resets_at: stamp(&v["resets_at"]),
                    });
                }
            }
        }
        let extra = &value["rate_limits"]["extra_usage"];
        if extra["is_enabled"] == true && extra["utilization"].is_number() {
            out.windows.push(Window {
                id: "extra_usage".into(),
                label: "Extra usage".into(),
                used: extra["utilization"].as_f64(),
                resets_at: None,
            });
        }
        out.windows.sort_by_key(|w| match w.id.as_str() {
            "five_hour" => 0,
            "seven_day" => 1,
            _ => 2,
        });
        // Percentages alone do not establish a failure (extra usage can still be available).
    } else {
        let buckets: Vec<(String, Value)> = value["rateLimitsByLimitId"]
            .as_object()
            .filter(|m| !m.is_empty())
            .map(|m| m.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
            .unwrap_or_else(|| vec![("codex".into(), value["rateLimits"].clone())]);
        for (id, b) in buckets {
            if out.plan.is_none() {
                out.plan = b["planType"].as_str().map(str::to_string);
            }
            for key in ["primary", "secondary"] {
                let w = &b[key];
                if !w.is_object() {
                    continue;
                }
                let duration = match w["windowDurationMins"].as_u64() {
                    Some(n) if n % 1440 == 0 => format!("{} days", n / 1440),
                    Some(n) if n % 60 == 0 => format!("{} hours", n / 60),
                    Some(n) => format!("{n} minutes"),
                    None => key.into(),
                };
                let name = b["limitName"].as_str().unwrap_or(&id);
                out.windows.push(Window {
                    id: format!("{id}-{key}"),
                    label: if id == "codex" {
                        duration
                    } else {
                        format!("{name} · {duration}")
                    },
                    used: w["usedPercent"].as_f64(),
                    resets_at: stamp(&w["resetsAt"]),
                });
            }
            let individual = &b["individualLimit"];
            if let Some(remaining) = individual["remainingPercent"].as_f64() {
                out.windows.push(Window {
                    id: format!("{id}-individual"),
                    label: "Individual limit".into(),
                    used: Some(100. - remaining),
                    resets_at: stamp(&individual["resetsAt"]),
                });
            }
            if b["rateLimitReachedType"].is_string() || b["spendControlReached"] == true {
                out.blocked = true;
            }
        }
        out.unavailable = out.windows.is_empty();
        if value["ordinaryUsageAllowed"] == true {
            out.blocked = false;
        }
        if value["ordinaryUsageAllowed"] == false {
            out.blocked = true;
        }
    }
    out.blocked_until = out
        .windows
        .iter()
        .filter(|w| w.used.is_some_and(|v| v >= 100.))
        .filter_map(|w| w.resets_at.clone())
        .max();
    out
}
fn cache_path(engine: Engine) -> PathBuf {
    directory().join(format!(
        "{}-usage.json",
        if engine == Engine::Codex {
            "codex"
        } else {
            "claude"
        }
    ))
}
pub fn cached(engine: Engine) -> Option<Limits> {
    std::fs::read(cache_path(engine))
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
}
fn store(engine: Engine, limits: &Limits) {
    let _ = std::fs::create_dir_all(directory());
    if let Ok(bytes) = serde_json::to_vec(limits) {
        let p = cache_path(engine);
        let tmp = p.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
        if std::fs::write(&tmp, bytes).is_ok() {
            let _ = std::fs::rename(tmp, p);
        }
    }
}
pub fn limit_message(engine: Engine, reset: Option<&str>) -> String {
    let name = if engine == Engine::Codex {
        "Codex"
    } else {
        "Claude Code"
    };
    let suffix = reset
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|d| {
            let d = d.with_timezone(&Local);
            let fmt = if d.date_naive() == Local::now().date_naive() {
                "%-I:%M %P"
            } else {
                "%b %-d at %-I:%M %P"
            };
            format!(" It resets at {}.", d.format(fmt))
        })
        .unwrap_or_default();
    format!("{name} has reached its limit.{suffix}")
}
pub fn blocked_message(engine: Engine) -> Option<String> {
    let c = cached(engine)?;
    if !c.blocked {
        return None;
    }
    if c.blocked_until
        .as_deref()
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .is_some_and(|d| d <= Utc::now())
    {
        return None;
    }
    Some(limit_message(engine, c.blocked_until.as_deref()))
}
pub fn is_limit_error(m: &Value) -> bool {
    let s = m.to_string().to_lowercase();
    [
        "usagelimitexceeded",
        "ratelimitexceeded",
        "usage_limit_reached",
        "rate_limit_exceeded",
        "rate_limit_error",
        "rate_limit_reached",
        "hit your limit",
        "rate limit reached",
        "usage limit reached",
        "reached your usage limit",
    ]
    .iter()
    .any(|x| s.contains(x))
}
pub fn failed_message(engine: Engine, m: &Value) -> Option<String> {
    if m["method"] == "error" && m["params"]["willRetry"] == true {
        return None;
    }
    if !(m.get("error").is_some()
        || m["method"] == "error"
        || m["method"] == "turn/completed"
        || m["method"] == "native/limitReached"
        || m.get("message").is_some())
        || !is_limit_error(m)
    {
        return None;
    }
    let mut c = cached(engine).unwrap_or_default();
    c.blocked = true;
    c.fetched_at = Utc::now().to_rfc3339();
    store(engine, &c);
    Some(limit_message(engine, c.blocked_until.as_deref()))
}
pub fn observe_limits(engine: Engine, m: &Value) {
    if m["method"] == "account/rateLimits/updated" {
        let mut c = parse_limits(engine, &m["params"]);
        if let Some(old) = cached(engine) {
            if c.plan.is_none() {
                c.plan = old.plan;
            }
        }
        store(engine, &c);
    }
    if m["method"] == "native/limits" {
        let v = &m["params"];
        let mut c = cached(engine).unwrap_or_default();
        let id = v["rateLimitType"].as_str().unwrap_or("current");
        c.windows.retain(|w| w.id != id);
        c.windows.push(Window {
            id: id.into(),
            label: label(id),
            used: v["utilization"].as_f64().map(|n| n * 100.),
            resets_at: stamp(&v["resetsAt"]),
        });
        c.fetched_at = Utc::now().to_rfc3339();
        c.blocked = v["status"] == "rejected" && v["overageStatus"] != "allowed";
        c.blocked_until = if c.blocked {
            stamp(&v["resetsAt"])
        } else {
            None
        };
        store(engine, &c);
    }
}
#[derive(Default)]
pub struct TurnMeter {
    baseline: Option<Tokens>,
    latest: Option<Tokens>,
    main_only: bool,
    model_totals: Option<Value>,
}
fn codex_tokens(v: &Value) -> Tokens {
    Tokens {
        input: v["inputTokens"].as_u64().unwrap_or(0),
        output: v["outputTokens"].as_u64().unwrap_or(0),
        cached: v["cachedInputTokens"].as_u64(),
        cache_write: v["cacheWriteInputTokens"].as_u64(),
    }
}
impl TurnMeter {
    pub fn observe(&mut self, m: &Value) {
        if m["method"] == "native/modelUsage" {
            self.model_totals = Some(m["params"].clone());
        }
        if m["method"] == "thread/tokenUsage/updated" {
            let v = &m["params"]["tokenUsage"];
            let total = codex_tokens(&v["total"]);
            let last = codex_tokens(&v["last"]);
            let base = self.baseline.get_or_insert_with(|| total.minus(&last));
            self.latest = Some(total.minus(base));
        }
        if m["method"] == "native/usage" {
            let v = &m["params"];
            self.main_only = v["scope"] == "main";
            self.latest = Some(Tokens {
                input: v["input_tokens"].as_u64().unwrap_or(0),
                output: v["output_tokens"].as_u64().unwrap_or(0),
                cached: v["cache_read_input_tokens"].as_u64(),
                cache_write: v["cache_creation_input_tokens"].as_u64(),
            });
        }
    }
    pub fn record(self, engine: Engine, turn_id: String, at: String) -> Option<TurnUsage> {
        self.latest.map(|tokens| TurnUsage {
            engine,
            turn_id,
            at,
            tokens,
            main_only: self.main_only,
            native_session: None,
            model_totals: self.model_totals,
        })
    }
}
#[tauri::command]
pub async fn agent_usage(harness: String, refresh: Option<bool>) -> Result<Value, String> {
    let engine = selected(&harness).ok_or("Unknown agent")?;
    let mut error = None;
    if refresh.unwrap_or(false) {
        match probe(engine).await {
            Ok(v) => {
                let mut fresh = parse_limits(engine, &v);
                if engine == Engine::ClaudeCode {
                    if let Some(old) = cached(engine) {
                        if old.blocked
                            && old
                                .blocked_until
                                .as_deref()
                                .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
                                .is_some_and(|d| d > Utc::now())
                        {
                            fresh.blocked = true;
                            fresh.blocked_until = old.blocked_until;
                        }
                    }
                }
                store(engine, &fresh)
            }
            Err(e) => error = Some(e),
        }
    }
    let tasks: Vec<Value> = std::fs::read_dir(directory())
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
        .filter_map(|e| std::fs::read(e.path()).ok())
        .filter_map(|b| serde_json::from_slice::<Task>(&b).ok())
        .filter_map(|t| {
            let turns: Vec<_> = t.usage.into_iter().filter(|u| u.engine == engine).collect();
            (!turns.is_empty()).then(|| json!({"id":t.id,"name":t.name,"turns":turns}))
        })
        .collect();
    Ok(json!({"limits":cached(engine),"tasks":tasks,"error":error}))
}
async fn probe(engine: Engine) -> Result<Value, String> {
    let exe = executable(if engine == Engine::Codex {
        "codex"
    } else {
        "claude"
    })
    .await
    .ok_or("Agent not installed")?;
    let dir = directory().join("usage-probe");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut cmd = if engine == Engine::Codex {
        let mut c = tokio::process::Command::new(exe);
        c.args(["app-server", "--stdio"]);
        c
    } else {
        let mut c = catalog::claude_command(exe)?;
        c.arg("--usage");
        c
    };
    cmd.current_dir(dir)
        .env("PATH", super::super::launch::user_path())
        .env_remove("OPENROUTER_API_KEY")
        .env_remove("VIBEWORK_DEV_OPENROUTER_KEY")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true);
    #[cfg(unix)]
    cmd.process_group(0);
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let guard = catalog::Owned::new(child.id().ok_or("No usage child pid")?);
    let mut input = child.stdin.take().ok_or("No usage input")?;
    let mut lines = BufReader::new(child.stdout.take().ok_or("No usage output")?).lines();
    let result=tokio::time::timeout(Duration::from_secs(if engine==Engine::Codex{30}else{300}),async{
        if engine==Engine::Codex{write(&mut input,json!({"id":1,"method":"initialize","params":{"clientInfo":{"name":"vibework_usage","version":"1.0"}}})).await?;}
        while let Some(line)=lines.next_line().await.map_err(|e|e.to_string())?{let Ok(m)=serde_json::from_str::<Value>(&line)else{continue};
            if m.get("error").is_some(){return Err("Couldn’t refresh limits. Last known values are shown.".into());}
            if engine==Engine::ClaudeCode{return Ok(m);}
            if m["id"]==1{write(&mut input,json!({"method":"initialized"})).await?;write(&mut input,json!({"id":2,"method":"account/rateLimits/read","params":{}})).await?;}
            if m["id"]==2{return Ok(m["result"].clone());}
        }Err("The agent closed before returning limits.".into())
    }).await.map_err(|_|"Limits are taking too long. Try refreshing again.".to_string()).and_then(|r|r);
    drop(guard);
    let _ = child.wait().await;
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recorded_limits() {
        let c = parse_limits(
            Engine::ClaudeCode,
            &serde_json::from_str(include_str!("fixtures/claude-limits.json")).unwrap(),
        );
        assert_eq!(c.plan.as_deref(), Some("team"));
        assert_eq!(c.windows.len(), 3);
        assert_eq!(c.windows[0].used, Some(36.));
        assert!(!c.blocked);
        let c = parse_limits(
            Engine::Codex,
            &serde_json::from_str(include_str!("fixtures/codex-limits.json")).unwrap(),
        );
        assert_eq!(c.windows.len(), 1);
        assert_eq!(c.windows[0].label, "7 days");
        assert_eq!(c.windows[0].used, Some(28.));
        assert_eq!(c.plan.as_deref(), Some("prolite"));
    }
    #[test]
    fn codex_turn_deduplicates_and_excludes_prior_session() {
        let mut frames: Vec<Value> =
            serde_json::from_str(include_str!("fixtures/codex-tokens.json")).unwrap();
        for m in &mut frames {
            m["params"]["tokenUsage"]["total"]["inputTokens"] = json!(
                m["params"]["tokenUsage"]["total"]["inputTokens"]
                    .as_u64()
                    .unwrap()
                    + 1000
            );
        }
        let mut meter = TurnMeter::default();
        meter.observe(&frames[0]);
        meter.observe(&frames[1]);
        meter.observe(&frames[1]);
        let r = meter
            .record(Engine::Codex, "t".into(), "now".into())
            .unwrap();
        assert_eq!(r.tokens.input, 55041);
        assert_eq!(r.tokens.output, 112);
        assert_eq!(r.tokens.cached, Some(40832));
    }
    #[test]
    fn claude_turn_and_missing_usage() {
        assert!(TurnMeter::default()
            .record(Engine::ClaudeCode, "t".into(), "now".into())
            .is_none());
        let mut m = TurnMeter::default();
        m.observe(&json!({"method":"native/usage","params":{"input_tokens":2,"output_tokens":4,"cache_read_input_tokens":13411,"cache_creation_input_tokens":25008,"scope":"main"}}));
        let r = m
            .record(Engine::ClaudeCode, "t".into(), "now".into())
            .unwrap();
        assert_eq!(r.tokens.cached, Some(13411));
        assert!(r.main_only);
    }
    #[test]
    fn legacy_and_usage_persistence() {
        let value = json!({"id":"old","engine":"codex","name":"Task","folder":"/tmp","mode":"ask","native":null,"created":"now","updated":"now","settled":null,"messages":[]});
        let mut t: Task = serde_json::from_value(value).unwrap();
        assert!(t.usage.is_empty());
        t.usage.push(TurnUsage {
            engine: Engine::Codex,
            turn_id: "turn".into(),
            at: "now".into(),
            tokens: Tokens {
                input: 42,
                ..Default::default()
            },
            main_only: false,
            native_session: None,
            model_totals: None,
        });
        let roundtrip: Task = serde_json::from_slice(&serde_json::to_vec(&t).unwrap()).unwrap();
        assert_eq!(roundtrip.usage[0].tokens.input, 42);
    }
    #[test]
    fn limit_failures_and_local_reset_message() {
        assert!(is_limit_error(
            &json!({"codexErrorInfo":"usageLimitExceeded"})
        ));
        assert!(!is_limit_error(&json!({"error":"offline"})));
        assert_eq!(
            limit_message(Engine::ClaudeCode, None),
            "Claude Code has reached its limit."
        );
        let text = limit_message(Engine::Codex, Some("2026-11-16T12:59:59Z"));
        assert!(text.starts_with("Codex has reached its limit. It resets at "));
        assert!(!text.contains("2026-11-16T"));
    }
    #[test]
    fn missing_windows_and_multiple_buckets() {
        assert!(
            parse_limits(Engine::ClaudeCode, &json!({"rate_limits_available":false})).unavailable
        );
        let c = parse_limits(
            Engine::Codex,
            &json!({"rateLimitsByLimitId":{"codex":{"primary":{"usedPercent":100,"windowDurationMins":300,"resetsAt":2000000000},"secondary":{"usedPercent":20,"windowDurationMins":10080},"rateLimitReachedType":"rate_limit_reached"},"special":{"limitName":"Special","primary":{"usedPercent":5}}}}),
        );
        assert_eq!(c.windows.len(), 3);
        assert!(c.blocked);
        assert!(c.blocked_until.is_some());
    }
}
