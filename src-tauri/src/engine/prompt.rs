//! The `vibework` agent the engine runs: system prompt and permission rules.
//!
//! Written to `<app data>/opencode/config/opencode/opencode.jsonc` (the
//! engine's private global config) before each launch. Contains no
//! credentials. The `opencode.json` beside it holds the user's connectors
//! (see `crate::connectors`); the engine merges the two, and this file never
//! touches the connectors.

use std::path::Path;

use serde_json::{json, Value};

pub const AGENT_ID: &str = "vibework";

/// The engine's built-in subagent the `vibework` agent may start as a helper.
/// Configured here with Vibework's prompt and the same rules as the parent
/// (a subagent uses its own rules, not its parent's).
pub const HELPER_AGENT: &str = "general";

/// What the helper's prompt adds to Vibework's own.
const HELPER_SECTION: &str = r#"
==You are a helper==

The main Vibework agent started you for one self-contained piece of work, described in the first message. Work in the same working folder with the same tools; the user's approvals apply to you as they do to the main agent, and the user sees your steps inside the main conversation. You can't ask the user questions and you can't start helpers of your own: when something is unclear, make the most reasonable choice and say so in your answer. Don't present files to the user or write a reply for them; your final message goes to the main agent, so make it a complete, plain report of what you found or did (file paths, figures, sources), with nothing left only in your earlier steps.
"#;

/// Sections of SYSTEM_PROMPT.md this engine replaces or does not have yet.
/// AskUserQuestion uses engine forms; the Python and
/// JavaScript sections describe native-only tools and are rewritten below.
const REPLACED_SECTIONS: &[&str] = &["==AskUserQuestion Tool==", "==Python Execution==", "==JavaScript Execution=="];

/// Native tool name → this engine's tool name (the app's MCP tools are
/// `vibework_<tool>`; built-ins are lowercase).
pub const TOOL_ALIASES: &[(&str, &str)] = &[
    ("PresentFile", "vibework_present_file"),
    ("Browser", "vibework_browser"),
    ("WebSearch", "vibework_web_search"),
    ("WebFetch", "vibework_web_fetch"),
    ("TodoWrite", "todowrite"),
    ("Bash", "shell"),
    ("Read", "read"),
    ("Write", "write"),
    ("Edit", "edit"),
    ("Glob", "glob"),
    ("Grep", "grep"),
    ("Skill", "skill"),
];

const ENGINE_SECTIONS: &str = r#"
==Running Python and JavaScript==

Run Python and JavaScript with the shell tool, using the uv and vibework-js on the PATH (the app provides both). Python: write the script to a file and run `uv run --with <package> --with <package> python <script.py> [args]`; never `pip install`. JavaScript and TypeScript: run `vibework-js <args>`, which takes Bun's commands and options (for example `vibework-js script.ts`, `vibework-js run script.js`, `vibework-js init`, `vibework-js add <package>`, `vibework-js x <package>`); where a skill says `bun`, use `vibework-js`. The first `uv` command may pause while Vibework downloads uv (once); if it reports that the download failed or that the computer seems to be offline, tell the user so in plain words and don't try to install Python another way. When a JavaScript project needs dependencies, create a dedicated directory for it inside the working folder rather than installing packages at its root.

==Tools==

Ask clarification using the question tool; it supports options, multiple selection and free-text answers.

Your tools are: question, shell (runs a command with the user's shell in the working folder), read, write, edit, glob, grep, todowrite, skill (loads a skill's instructions by name), subagent (starts a helper, below), vibework_present_file, vibework_browser, vibework_web_search and vibework_web_fetch, plus the tools of any connectors the user has added. Work inside the working folder unless the user asks otherwise; anything outside it needs the user's approval.

Connectors (MCP servers such as Granola, Notion or Linear) are the engine's own: you run on OpenCode, and its built-in `opencode` skill applies to them, with these differences in Vibework. Add one with `opencode mcp add <name> --url <address>` (a local one: `opencode mcp add <name> -- <command>`); here it is always global, so it reaches every task, and the user approves the add once. Take the address from the provider's own documentation, never a guess. After an add that signs in through the browser, Vibework opens the provider's sign-in page in the user's browser by itself: tell the user to approve it there, and report the connector as added and waiting for sign-in until `opencode mcp list` says connected; its tools reach the task from the user's next message. Never run or suggest `/mcps` or `opencode mcp auth`: signing in and out, keys and switching connectors off are done in Settings → Connectors. Never ask for a key, token or password in chat or put one in a command: for a service that needs a key, add it with `--header 'Authorization=Bearer {env:KEY}'` and ask the user to paste the key in Settings → Connectors (Edit). Remove one with `opencode mcp remove <name>`. Load the vibework-setup skill for more. Never read or edit Vibework's own app data or config files to work out how setup works.

Helpers: the subagent tool hands a self-contained piece of work to a helper (the `general` agent), which works in its own fresh conversation, in the same working folder, with the same tools and the same approvals as you, and returns its final answer to you. The user watches it as one step in this conversation. Use one for independent research across many sources, or a long side job whose details would flood this conversation (reading through a large folder, checking many files or pages); start several at once when the jobs don't depend on each other. Don't use one for a small step you can do directly, or for work that needs the user's answers: a helper can't ask the user questions. Give it everything it needs in the prompt (it sees nothing of this conversation), say exactly what to return, and keep the description to a few plain words saying what it is doing ("Compare the three supplier quotes"). In Vibework a helper always finishes within your turn: don't set `background` or `model`. Build your reply from the helper's answer: the user sees that answer only inside the collapsed step, not as a message.

Skills were written for this app's tool names; use these equivalents: PresentFile is vibework_present_file (arguments `file_path`, `file_name`, optional `description`); Browser is vibework_browser; WebSearch is vibework_web_search; WebFetch is vibework_web_fetch; Bash is shell; Read, Write, Edit, Glob and Grep are read, write, edit, glob and grep; TodoWrite is todowrite; the Skill tool is skill. Where a skill says to run a script with the Python tool and `packages`, run `uv run --with <each package> python <script>` with shell; where it says to use the Bun tool, run `vibework-js <args>` with shell.

==Working files==

Every task has a private scratch folder that Vibework owns, outside the user's folder: its path is given at the end of these instructions and in the environment variable VIBEWORK_SCRATCH. Put everything you make for your own use there: helper scripts (build_*.py, check.py), check images and screenshots, unpacked documents, intermediate data, logs and test output. Only the deliverables the user asked for (the deck, sheet, document, board, export) go in the working folder, so the user's folder holds nothing but their work. Never tidy up the user's folder on your own initiative; there should be nothing of yours in it to tidy (what the user asks you to delete is a different matter). Vibework clears the scratch folder when the task is deleted.

==Operating System==

The user is running **macOS**.
"#;

/// The app's system prompt with this engine's tool names.
pub fn system_prompt() -> String {
    let source = include_str!("SYSTEM_PROMPT.md");
    let mut out = String::new();
    let mut skipping = false;
    for line in source.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("==") && trimmed.ends_with("==") && trimmed.len() > 4 {
            skipping = REPLACED_SECTIONS.contains(&trimmed);
        }
        if trimmed == "</behavior_instructions>" {
            skipping = false;
            out.push_str(ENGINE_SECTIONS);
            out.push('\n');
        }
        if !skipping {
            out.push_str(line);
            out.push('\n');
        }
    }
    let mut out = out
        .replace("Review Skills / AskUserQuestion (if clarification needed) → TodoWrite → Actual work", "Load skills (if relevant) → todowrite → Actual work")
        .replace("read the appropriate SKILL.md files", "load the appropriate skills with the skill tool")
        .replace("**MCP tool calls**", "**connector tool calls**")
        .replace("leaves WebFetch with", "leaves vibework_web_fetch with");
    // Tool names in prose: `PresentFile`, **WebSearch**, "Browser tool", "TodoWrite tool", ...
    for (native, engine) in TOOL_ALIASES {
        for (from, to) in [
            (format!("`{native}`"), format!("`{engine}`")),
            (format!("**{native}**"), format!("**{engine}**")),
            (format!("**{native} tool**"), format!("**{engine} tool**")),
            (format!("{native} tool"), format!("{engine} tool")),
            (format!("use {native}"), format!("use {engine}")),
            (format!("skip {native}"), format!("skip {engine}")),
            (format!("call {native}"), format!("call {engine}")),
            (format!("Use {native}"), format!("Use {engine}")),
            (format!("Use **{native}**"), format!("Use **{engine}**")),
            (format!("{native}/"), format!("{engine}/")),
            (format!("/{native} "), format!("/{engine} ")),
            (format!("{native} instead"), format!("{engine} instead")),
            (format!("{native} or {}", "WebFetch"), format!("{engine} or vibework_web_fetch")),
        ] {
            out = out.replace(&from, &to);
        }
    }
    out
}

/// MCP tools of the app's own server, as the engine names them (`<server>_<tool>`).
pub fn app_tool_actions() -> Vec<String> {
    super::app_tools::TOOLS.iter().map(|(tool, _)| format!("{}_{}", super::bridge::MCP_SERVER_NAME, tool)).collect()
}

/// The helper's system prompt: Vibework's, plus what a helper is.
pub fn helper_prompt() -> String {
    let mut out = system_prompt();
    out.push_str(HELPER_SECTION);
    out
}

/// Rules for the helper: the parent's, except that it never asks the user a
/// question and never starts helpers of its own (as the engine's own
/// `general` agent).
pub fn helper_permissions(denied_skills: &[String]) -> Value {
    let mut rules = agent_permissions(denied_skills);
    if let Some(list) = rules.as_array_mut() {
        list.push(json!({ "action": "question", "resource": "*", "effect": "deny" }));
        list.push(json!({ "action": "subagent", "resource": "*", "effect": "deny" }));
    }
    rules
}

/// Rules for the `vibework` agent. The engine applies the last matching rule.
pub fn agent_permissions(denied_skills: &[String]) -> Value {
    let mut rules = vec![
        json!({ "action": "*", "resource": "*", "effect": "ask" }),
        json!({ "action": "read", "resource": "*", "effect": "allow" }),
        json!({ "action": "read", "resource": "*.env", "effect": "ask" }),
        json!({ "action": "read", "resource": "*.env.*", "effect": "ask" }),
        json!({ "action": "read", "resource": "*.env.example", "effect": "allow" }),
        json!({ "action": "glob", "resource": "*", "effect": "allow" }),
        json!({ "action": "grep", "resource": "*", "effect": "allow" }),
        json!({ "action": "todowrite", "resource": "*", "effect": "allow" }),
        // Edits inside the working folder; anything outside it raises
        // `external_directory` first, which stays "ask".
        json!({ "action": "edit", "resource": "*", "effect": "allow" }),
        json!({ "action": "shell", "resource": "*", "effect": "ask" }),
        json!({ "action": "external_directory", "resource": "*", "effect": "ask" }),
        // Loading a skill only reads its instructions.
        json!({ "action": "skill", "resource": "*", "effect": "allow" }),
        // The app's web tools replace the engine's own (they use the user's
        // chosen search provider).
        json!({ "action": "webfetch", "resource": "*", "effect": "deny" }),
        json!({ "action": "websearch", "resource": "*", "effect": "deny" }),
        // Helpers: only the engine's `general` subagent (it gets these same
        // rules below). Starting one grants nothing new, so it never asks.
        json!({ "action": "subagent", "resource": "*", "effect": "deny" }),
        json!({ "action": "subagent", "resource": HELPER_AGENT, "effect": "allow" }),
        json!({ "action": "question", "resource": "*", "effect": "allow" }),
        // Code Mode stays off (see the subagents report): its programs' tool
        // calls would reach the policy as one `execute` call.
        json!({ "action": "execute", "resource": "*", "effect": "deny" }),
        json!({ "action": "experimental_image_generate", "resource": "*", "effect": "deny" }),
    ];
    // PresentFile, Browser, WebSearch, WebFetch: allowed as on the native
    // engine. The user's connectors stay "ask" (the first rule).
    for action in app_tool_actions() {
        rules.push(json!({ "action": action, "resource": "*", "effect": "allow" }));
    }
    // Skill sources switched off in Settings: denied skills are left out of
    // the catalogue the model sees, and the skill tool refuses them.
    for name in denied_skills {
        rules.push(json!({ "action": "skill", "resource": name, "effect": "deny" }));
    }
    Value::Array(rules)
}

/// What the config needs from the launch (none of it is secret).
pub struct ConfigInputs {
    pub bridge_url: String,
    pub plugin_dir: std::path::PathBuf,
    pub shell_env: Value,
    pub skills: super::skills::SkillLaunch,
}

/// The engine config document. Model requests go to the app's loopback
/// OpenRouter proxy; the plugin adds the per-launch capability to them.
pub fn agent_config(inputs: &ConfigInputs) -> Value {
    json!({
        "$schema": "https://opencode.ai/config.json",
        "plugins": [{
            "package": format!("file://{}", inputs.plugin_dir.to_string_lossy()),
            "options": {
                "bridgeUrl": inputs.bridge_url,
                "capabilityHeader": super::bridge::CAPABILITY_HEADER,
                "mcpServerName": super::bridge::MCP_SERVER_NAME,
                "shellEnv": inputs.shell_env,
            }
        }],
        "providers": {
            "openrouter": {
                "models": crate::models::engine_models(),
                "settings": {
                    "baseURL": format!("{}/openrouter/api/v1", inputs.bridge_url),
                    // Placeholder: the proxy adds the user's key.
                    "apiKey": "vibework-local-proxy",
                }
            }
        },
        "skills": inputs.skills.skill_paths(),
        // OpenCode 2.2.7 offers `todowrite` (the task's plan) only behind
        // this flag; without it every plan update failed.
        "experimental": { "todo": true },
        "agents": {
            AGENT_ID: {
                "name": "Vibework",
                "description": "Vibework's desktop assistant",
                "mode": "primary",
                "system": system_prompt(),
                "permissions": agent_permissions(&inputs.skills.denied_skill_ids()),
            },
            // The engine's own subagent, as a helper: same model (it
            // inherits the parent's), same folder, same proxy, same rules.
            HELPER_AGENT: {
                "system": helper_prompt(),
                "permissions": helper_permissions(&inputs.skills.denied_skill_ids()),
            }
        }
    })
}

/// The app's generated config file in the engine's global config folder
/// (`opencode.json` beside it is the connectors file).
pub const CONFIG_FILE: &str = "opencode.jsonc";

/// Write the config atomically with owner-only permissions.
pub fn write_config(dir: &Path, config: &Value) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("Cannot create the engine config folder: {e}"))?;
    let target = dir.join(CONFIG_FILE);
    let text = serde_json::to_string_pretty(config).map_err(|e| e.to_string())? + "\n";
    if std::fs::read_to_string(&target).ok().as_deref() == Some(text.as_str()) {
        return Ok(());
    }
    let temp = dir.join(format!("{CONFIG_FILE}.tmp-{}", uuid::Uuid::new_v4().simple()));
    std::fs::write(&temp, text).map_err(|e| format!("Cannot write the engine config: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&temp, std::fs::Permissions::from_mode(0o600));
    }
    std::fs::rename(&temp, &target).map_err(|e| format!("Cannot write the engine config: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prompt_is_complete_with_engine_tool_names() {
        let prompt = system_prompt();
        for kept in [
            "You are Vibework", "==Skills System==", "==Web Search and Fetch==", "==Browser Automation==",
            "==Citation Requirements==", "==Tone and Formatting==", "==Knowledge Cutoff==", "==Tools==",
            "`.slides.md`", "`.dashboard.md`", "`.excalidraw`", "(`.xlsx`", "(`.md`",
            "vibework_present_file", "vibework_web_search", "vibework_web_fetch", "vibework_browser", "todowrite",
            "uv run --with", "vibework-js <args>", "VIBEWORK_SCRATCH",
            "opencode mcp add <name> --url <address>", "Settings → Connectors", "vibework-setup", "Never run or suggest `/mcps`",
        ] {
            assert!(prompt.contains(kept), "prompt lacks {kept}");
        }
        // Native-only names remain only inside the alias explanation.
        let body = &prompt[..prompt.find("==Tools==").unwrap()];
        for gone in ["WebFetch", "`PresentFile`", "**WebSearch**", "**WebFetch**", "**Browser**", "Python tool", "Bun tool", "AskUserQuestion", "TodoWrite"] {
            assert!(!body.contains(gone), "prompt body still says {gone}");
        }
    }

    #[test]
    fn rules_allow_app_tools_and_skills() {
        let rules = agent_permissions(&["far-away-skill".to_string()]);
        let last = |action: &str| rules.as_array().unwrap().iter().rev().find(|r| r["action"] == action).unwrap()["effect"].clone();
        let skill_all = rules.as_array().unwrap().iter().rev().find(|r| r["action"] == "skill" && r["resource"] == "*").unwrap();
        assert_eq!(skill_all["effect"], "allow");
        assert_eq!(last("vibework_present_file"), "allow");
        assert_eq!(last("vibework_browser"), "allow");
        assert_eq!(last("websearch"), "deny");
        let denied = rules.as_array().unwrap().iter().rev().find(|r| r["resource"] == "far-away-skill").unwrap();
        assert_eq!(denied["effect"], "deny");
    }

    #[test]
    fn helpers_are_the_engines_general_agent_with_the_parents_rules() {
        let rules = agent_permissions(&[]);
        let effect = |rules: &Value, action: &str, resource: &str| {
            rules.as_array().unwrap().iter().rev()
                .find(|r| (r["action"] == action || r["action"] == "*") && (r["resource"] == resource || r["resource"] == "*"))
                .unwrap()["effect"].clone()
        };
        // The main agent may start the engine's `general` helper, nothing else.
        assert_eq!(effect(&rules, "subagent", "general"), "allow");
        assert_eq!(effect(&rules, "subagent", "explore"), "deny");
        assert_eq!(effect(&rules, "execute", "*"), "deny");
        // The helper keeps every rule of the parent, then can't ask or nest.
        let helper = helper_permissions(&["far-away-skill".to_string()]);
        let parent = agent_permissions(&["far-away-skill".to_string()]);
        assert_eq!(&helper.as_array().unwrap()[..parent.as_array().unwrap().len()], parent.as_array().unwrap().as_slice());
        assert_eq!(effect(&helper, "subagent", "general"), "deny");
        assert_eq!(effect(&helper, "question", "*"), "deny");
        for (action, resource) in [("shell", "ls"), ("external_directory", "/x/*"), ("read", "a.env"), ("vibework_linear_create_issue", "*")] {
            assert_eq!(effect(&helper, action, resource), effect(&parent, action, resource), "{action}");
        }
        assert_eq!(effect(&helper, "webfetch", "*"), "deny");
        assert_eq!(effect(&helper, "execute", "*"), "deny");
        let prompt = helper_prompt();
        assert!(prompt.starts_with(&system_prompt()));
        assert!(prompt.contains("==You are a helper=="));
        assert!(system_prompt().contains("Helpers: the subagent tool"));
    }

    #[test]
    fn config_has_no_secrets_and_points_at_the_proxy() {
        let config = agent_config(&ConfigInputs {
            bridge_url: "http://127.0.0.1:1".into(),
            plugin_dir: "/x/plugin".into(),
            shell_env: json!({}),
            skills: crate::engine::skills::SkillLaunch { claude: true, agents: true, user: true },
        });
        assert_eq!(config["providers"]["openrouter"]["settings"]["baseURL"], "http://127.0.0.1:1/openrouter/api/v1");
        assert_eq!(config["plugins"][0]["package"], "file:///x/plugin");
        let text = config.to_string();
        assert!(!text.contains("sk-or-"));
        // The plan tool exists only behind this flag in OpenCode 2.2.7.
        assert_eq!(config["experimental"]["todo"], true);
        // The helper: the engine's own `general`, with no model of its own
        // (it inherits the task's), Vibework's prompt and rules.
        let helper = &config["agents"]["general"];
        assert!(helper.get("model").is_none() && helper.get("mode").is_none());
        assert_eq!(helper["permissions"], helper_permissions(&[]));
        assert!(helper["system"].as_str().unwrap().contains("==You are a helper=="));
    }
}
