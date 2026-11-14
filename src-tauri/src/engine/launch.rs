//! Everything one engine launch needs: the config file (no secrets), the
//! launch payload for the engine's stdin (the capability), extra
//! environment for the engine process, and the environment shell commands get.

use std::collections::BTreeMap;
use std::path::Path;

use serde_json::{json, Map, Value};

use super::sidecar::EnginePaths;

/// What `sidecar::launch` needs for one start.
pub struct LaunchPlan {
    pub config: Value,
    /// Written to the engine's stdin, then closed. Holds the capability.
    pub payload: Value,
    /// Extra environment for the engine process (never a secret).
    pub env: Vec<(String, String)>,
    /// Strings to redact from engine logs.
    pub redact: Vec<String>,
}

/// Variables the engine process gets that commands must not inherit as they are.
const ENGINE_OVERRIDES: &[&str] = &["XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME", "TMPDIR"];

const PLUGIN_FILES: &[(&str, &str)] = &[
    ("package.json", include_str!("plugin/package.json")),
    ("channel.cjs", include_str!("plugin/channel.cjs")),
    ("server.js", include_str!("plugin/server.js")),
];

/// Write the plugin fresh before every launch (owner-only).
fn write_plugin(dir: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("Cannot create the engine plugin folder: {e}"))?;
    for (name, text) in PLUGIN_FILES {
        let path = dir.join(name);
        std::fs::write(&path, text).map_err(|e| format!("Cannot write the engine plugin: {e}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
        }
    }
    Ok(())
}

/// How shell commands get back the user's own values of the variables the
/// engine process overrides (set when the app had them, removed otherwise).
fn shell_env_restore() -> Value {
    let mut set = Map::new();
    let mut unset = Vec::new();
    for name in ENGINE_OVERRIDES {
        match std::env::var(name) {
            Ok(value) => {
                set.insert(name.to_string(), Value::String(value));
            }
            Err(_) => unset.push(Value::String(name.to_string())),
        }
    }
    json!({ "set": set, "unset": unset })
}

/// Whether an environment variable must never reach a command or connector.
pub fn is_secret_name(name: &str) -> bool {
    name == "OPENROUTER_API_KEY"
        || name.starts_with("OPENCODE_")
        || name.starts_with("VIBEWORK_")
}

/// Join PATH lists in order, dropping empty and repeated entries.
fn merge_path(lists: &[Option<&str>]) -> String {
    let mut seen = std::collections::HashSet::new();
    lists
        .iter()
        .flatten()
        .flat_map(|list| list.split(':'))
        .filter(|dir| !dir.is_empty() && seen.insert(dir.to_string()))
        .collect::<Vec<_>>()
        .join(":")
}

/// The PATH the engine, task commands and connectors get: the user's
/// login-shell PATH first (an app opened from Finder only has launchd's
/// `/usr/bin:/bin:/usr/sbin:/sbin`, so Homebrew and similar tools would be
/// missing), then this process's own entries. The login-shell PATH is read
/// once before the engine starts; until then this is the process PATH.
pub fn user_path() -> String {
    let login = super::login_path::cached_login_shell_path();
    let process = std::env::var("PATH").ok();
    merge_path(&[login.as_deref(), process.as_deref()])
}

/// The engine's own PATH, which local connectors inherit: [`user_path`],
/// then the app's runtimes (`npx`, `uvx`, ... for connectors that use them).
pub fn engine_path() -> String {
    let runtimes = crate::runtimes::bin_dir().to_string_lossy().to_string();
    merge_path(&[Some(user_path().as_str()), Some(runtimes.as_str())])
}

/// The environment shell commands of a session run with: the app's own
/// environment, minus anything that could reach the engine or the user's key,
/// with [`user_path`] as PATH.
pub fn session_environment(key: Option<&str>) -> BTreeMap<String, String> {
    let mut env: BTreeMap<String, String> = std::env::vars()
        .filter(|(name, value)| {
            !is_secret_name(name) && !key.is_some_and(|k| k.len() >= 8 && value.contains(k))
        })
        .collect();
    // Vibework's own `opencode` (connectors only) goes first, so the
    // person's own OpenCode on their login PATH never runs in a task; the
    // app's runtimes go last (skills run Python and JavaScript with them via
    // shell): see `crate::connectors::launcher` and `crate::runtimes`.
    let mut parts: Vec<String> = vec![crate::connectors::launcher_dir().to_string_lossy().to_string(), user_path()];
    parts.push(crate::runtimes::bin_dir().to_string_lossy().to_string());
    let path = merge_path(&parts.iter().map(|p| Some(p.as_str())).collect::<Vec<_>>());
    if !path.is_empty() {
        env.insert("PATH".into(), path);
    }
    env
}

/// Build the plan for one launch (rotates the capability).
pub fn plan(paths: &EnginePaths) -> Result<LaunchPlan, String> {
    let bridge = super::bridge::start()?;
    let capability = bridge.rotate();
    let plugin_dir = paths.root.join("plugin");
    write_plugin(&plugin_dir)?;
    let skills = super::skills::launch_settings();
    let config = super::prompt::agent_config(&super::prompt::ConfigInputs {
        bridge_url: bridge.base_url(),
        plugin_dir: plugin_dir.clone(),
        shell_env: shell_env_restore(),
        skills: skills.clone(),
    });
    // Connectors are the engine's own (its global opencode.json, which the
    // app's generated opencode.jsonc never touches).
    crate::connectors::prepare_files()?;
    super::tools::add_connector_names(&crate::connectors::names());
    let payload = json!({ "capability": capability });
    Ok(LaunchPlan { config, payload, env: skills.engine_env(), redact: vec![capability] })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secret_names() {
        for name in ["OPENROUTER_API_KEY", "OPENCODE_PASSWORD", "OPENCODE_SERVER_PASSWORD", "VIBEWORK_DEV_OPENROUTER_KEY"] {
            assert!(is_secret_name(name), "{name}");
        }
        assert!(!is_secret_name("PATH"));
    }

    #[test]
    fn session_env_drops_values_holding_the_key() {
        std::env::set_var("VW_TEST_HOLDS_KEY", "prefix-sk-or-v1-testtesttest");
        let env = session_environment(Some("sk-or-v1-testtesttest"));
        assert!(!env.contains_key("VW_TEST_HOLDS_KEY"));
        assert!(env.contains_key("PATH") || std::env::var("PATH").is_err());
        std::env::remove_var("VW_TEST_HOLDS_KEY");
    }

    #[test]
    fn path_lists_merge_in_order_without_repeats() {
        assert_eq!(merge_path(&[Some("/opt/homebrew/bin:/usr/bin"), Some("/usr/bin:/bin:"), None]), "/opt/homebrew/bin:/usr/bin:/bin");
        assert_eq!(merge_path(&[None, Some("/usr/bin")]), "/usr/bin");
        assert_eq!(merge_path(&[None]), "");
    }

    #[test]
    fn plugin_files_are_bundled() {
        assert!(PLUGIN_FILES.iter().any(|(n, t)| *n == "server.js" && t.contains("create.before")));
        assert!(PLUGIN_FILES.iter().any(|(n, t)| *n == "channel.cjs" && t.contains("readFileSync(0")));
    }
}
