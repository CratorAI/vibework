//! `opencode` for task commands, and reading what an agent's command does
//! with connectors.
//!
//! A task's agent sets connectors up the way it would in plain OpenCode
//! (the built-in `opencode` skill): `opencode mcp add <name> --url <address>`.
//! The app puts its own `opencode` first on the PATH of task commands (in a
//! folder of its own: the person's login PATH may hold their own OpenCode,
//! which must never be the one that runs). It:
//! - `mcp add`: runs the engine's own CLI against the engine's config folder,
//!   always with `--global`, so the connector lands in the connectors file
//!   every folder uses (a project `opencode.json` is ignored by Vibework's
//!   engine, and would litter the person's folder). Header values must be
//!   `{env:NAME}` references: keys are pasted in Settings → Connectors;
//! - `mcp list`: prints the status the app last saw (the CLI's own `list`
//!   would start a second background engine, or need the engine's password);
//! - `mcp remove <name>`: deletes the entry (plain OpenCode says to edit the
//!   file, which task commands may not do in the app's data);
//! - `mcp auth` / `logout` and everything else: a plain sentence saying where
//!   that is done in Vibework.

use std::path::Path;

use once_cell::sync::Lazy;
use serde::Deserialize;

/// Quote for POSIX sh: the whole text in single quotes.
fn sh_quote(text: &str) -> String {
    format!("'{}'", text.replace('\'', r"'\''"))
}

/// Removes one server from the connectors file (run by Bun inside the engine binary).
const REMOVE_JS: &str = r#"const fs=require("fs");const f=process.env.VW_FILE,n=process.env.VW_NAME;let d;try{d=JSON.parse(fs.readFileSync(f,"utf8"))}catch(e){console.error("opencode: the connectors file could not be read: "+e.message);process.exit(1)}const s=d&&d.mcp&&d.mcp.servers;if(!s||!Object.prototype.hasOwnProperty.call(s,n)){console.log("No MCP server named \""+n+"\".");process.exit(1)}delete s[n];fs.writeFileSync(f,JSON.stringify(d,null,2)+"\n");console.log("MCP server \""+n+"\" removed. Vibework deletes its sign-in too.")"#;

/// The launcher's text. `engine` is the engine binary, `xdg` its folders
/// (config, data, cache, state, tmp), `status` the file the app keeps the
/// connectors' status in.
pub fn launcher_script(engine: &Path, xdg: &crate::engine::sidecar::EnginePaths, status: &Path) -> String {
    let q = |p: &Path| sh_quote(&p.to_string_lossy());
    let file = xdg.engine_config_dir().join("opencode.json");
    format!(
        r#"#!/bin/sh
# Vibework's `opencode` for task commands: connectors only.
# Written by Vibework at startup; changes are overwritten.
engine={engine}
file={file}
status={status}
if [ ! -x "$engine" ]; then
  echo "opencode: Vibework's engine is missing ($engine). Reopen Vibework, then try again." >&2
  exit 1
fi
run() {{
  env -i HOME="$HOME" PATH="/usr/bin:/bin:/usr/sbin:/sbin" LANG="${{LANG:-en_US.UTF-8}}" \
    XDG_CONFIG_HOME={config} XDG_DATA_HOME={data} XDG_CACHE_HOME={cache} XDG_STATE_HOME={state} TMPDIR={tmp} \
    OPENCODE_DISABLE_AUTOUPDATE=1 OPENCODE_DISABLE_PROJECT_CONFIG=1 "$engine" "$@"
}}
where="In Vibework, connectors are signed in to and managed in Settings → Connectors; Vibework opens a connector's sign-in page in the browser by itself after it is added."
if [ "$1" = "mcp" ]; then
  sub="$2"
  case "$sub" in
    add)
      shift 2
      # Always --global (added once below), so drop one the agent wrote.
      after=""
      for a in "$@"; do
        shift
        if [ -z "$after" ]; then
          case "$a" in --) after=1 ;; --global|-g) continue ;; esac
        fi
        set -- "$@" "$a"
      done
      prev=""
      for a in "$@"; do
        if [ "$a" = "--" ]; then break; fi
        if [ "$prev" = "--header" ] || [ "$prev" = "-H" ]; then
          case "$a" in
            *=\{{env:*\}}|*=Bearer\ \{{env:*\}}) ;;
            *) echo "opencode: don't put a key in a command. Add the connector without --header (or with --header 'Name={{env:NAME}}'), then ask the person to paste the key in Settings → Connectors (Edit)." >&2; exit 2 ;;
          esac
        fi
        case "$a" in --header=*) echo "opencode: use --header 'Name={{env:NAME}}' and ask the person to paste the key in Settings → Connectors (Edit)." >&2; exit 2 ;; esac
        prev="$a"
      done
      name=""
      skip=""
      for a in "$@"; do
        if [ -n "$skip" ]; then skip=""; continue; fi
        case "$a" in
          --) break ;;
          --url|--header|-H|--env|-e) skip=1 ;;
          -*) ;;
          *) name="$a"; break ;;
        esac
      done
      case "$name" in
        vibework|Vibework|opencode) echo "opencode: \"$name\" is taken by Vibework itself; choose another name." >&2; exit 2 ;;
      esac
      run mcp add --global "$@"
      code=$?
      if [ $code -eq 0 ]; then
        echo "Vibework will show it in Settings → Connectors. If it signs in through the browser, Vibework opens its sign-in page now; it is ready once \`opencode mcp list\` says connected."
      fi
      exit $code
      ;;
    list|ls)
      if [ -s "$status" ]; then cat "$status"; else echo "No MCP servers configured"; fi
      exit 0
      ;;
    remove|rm)
      if [ -z "$3" ]; then echo "Usage: opencode mcp remove <name>" >&2; exit 2; fi
      BUN_BE_BUN=1 VW_FILE="$file" VW_NAME="$3" exec "$engine" -e {remove_js}
      ;;
    auth|login|logout|connect|disconnect)
      echo "opencode: $where" >&2
      exit 2
      ;;
  esac
fi
case "$1" in
  --version|-v|version) run --version; exit $? ;;
esac
echo "opencode: inside Vibework only \`opencode mcp add\`, \`opencode mcp list\` and \`opencode mcp remove\` work. $where" >&2
exit 2
"#,
        engine = q(engine),
        file = q(&file),
        status = q(status),
        config = q(&xdg.config),
        data = q(&xdg.data),
        cache = q(&xdg.cache),
        state = q(&xdg.state),
        tmp = q(&xdg.tmp),
        remove_js = sh_quote(REMOVE_JS),
    )
}

// ---------------------------------------------------------------------------
// Popular connectors (shared with Settings) and plain words
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
pub struct Popular {
    pub name: String,
    pub label: String,
    pub auth: PopularAuth,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum PopularAuth {
    Browser,
    /// Needs a key in a header (pasted in Settings).
    Key,
}

static POPULAR: Lazy<Vec<Popular>> = Lazy::new(|| {
    serde_json::from_str(include_str!("../../../src/components/settings/popularConnectors.json")).expect("popularConnectors.json is valid")
});

/// The Popular entry for a name or label.
pub fn popular(name: &str) -> Option<&'static Popular> {
    let key = name.trim().to_lowercase();
    POPULAR.iter().find(|p| p.name == key || p.label.to_lowercase() == key)
}

/// How a connector is named in prose: its Popular label, else its own name.
pub fn label(name: &str) -> String {
    popular(name).map(|p| p.label.clone()).unwrap_or_else(|| name.trim().to_string())
}

fn host(url: &str) -> String {
    reqwest::Url::parse(url).ok().map(|u| match u.port() { Some(p) => format!("{}:{p}", u.host_str().unwrap_or("")), None => u.host_str().unwrap_or("").to_string() }).unwrap_or_else(|| url.to_string())
}

// ---------------------------------------------------------------------------
// What an agent's shell command does with connectors
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AgentCommand {
    Add { name: String, url: Option<String>, command: Option<String>, headers: Vec<String> },
    Remove { name: String },
    List,
}

impl AgentCommand {
    pub fn changes(&self) -> bool {
        !matches!(self, AgentCommand::List)
    }

    /// The prompt's title: "Add the Granola connector".
    pub fn title(&self) -> String {
        match self {
            AgentCommand::Add { name, .. } => format!("Add the {} connector", label(name)),
            AgentCommand::Remove { name } => format!("Remove the {} connector", label(name)),
            AgentCommand::List => "Check your connectors".into(),
        }
    }

    /// Why it asks, in plain words.
    pub fn reason(&self) -> String {
        match self {
            AgentCommand::Add { name, url, command, headers } => {
                let known = popular(name);
                let who = match (known, url) {
                    (Some(p), _) => p.label.clone(),
                    (None, Some(url)) => format!("{} ({})", name, host(url)),
                    (None, None) => name.clone(),
                };
                if command.is_some() {
                    format!("{who} will run on this Mac and offer its tools to your tasks.")
                } else if !headers.is_empty() || known.is_some_and(|p| matches!(p.auth, PopularAuth::Key)) {
                    format!("{who} will be able to offer its tools to your tasks. You paste its key in Settings → Connectors.")
                } else if let Some(p) = known {
                    format!("{who} will be able to offer its tools to your tasks. You sign in on {}'s own page.", p.label)
                } else {
                    format!("{who} will be able to offer its tools to your tasks. If it needs you to sign in, you do that on its own page.")
                }
            }
            AgentCommand::Remove { name } => format!("{} will no longer offer its tools to your tasks, and its sign-in is deleted from this Mac.", label(name)),
            AgentCommand::List => String::new(),
        }
    }

    /// What the model is told when the person says no.
    pub fn denial(&self) -> String {
        match self {
            AgentCommand::Add { name, .. } => format!("The user chose not to add {}. Nothing was added. Say so plainly and don't try to add it another way.", label(name)),
            AgentCommand::Remove { name } => format!("The user chose to keep {}. Nothing was removed.", label(name)),
            AgentCommand::List => "Action denied by the user. Choose another approach.".into(),
        }
    }

    /// The prompt's preview line: the address (or command).
    pub fn details(&self) -> Option<String> {
        match self {
            AgentCommand::Add { url: Some(url), .. } => Some(url.clone()),
            AgentCommand::Add { command: Some(c), .. } => Some(c.clone()),
            _ => None,
        }
    }
}

fn program_name(p: &str) -> &str {
    p.rsplit('/').next().unwrap_or(p)
}

/// One `opencode mcp …` invocation's arguments (after the program).
fn read_mcp(args: &[String]) -> Option<AgentCommand> {
    if args.first().map(String::as_str) != Some("mcp") {
        return None;
    }
    match args.get(1).map(String::as_str)? {
        "list" | "ls" => Some(AgentCommand::List),
        "remove" | "rm" => args.get(2).filter(|n| !n.starts_with('-')).map(|n| AgentCommand::Remove { name: n.clone() }),
        "add" => {
            let rest = &args[2..];
            let (mut name, mut url, mut headers, mut command) = (None, None, Vec::new(), None);
            let mut i = 0;
            while i < rest.len() {
                let a = rest[i].as_str();
                match a {
                    "--" => {
                        let argv = rest[i + 1..].join(" ");
                        if !argv.is_empty() { command = Some(argv); }
                        break;
                    }
                    "--url" => { url = rest.get(i + 1).cloned(); i += 1; }
                    "--header" | "-H" => { if let Some(h) = rest.get(i + 1) { headers.push(h.split('=').next().unwrap_or_default().to_string()); } i += 1; }
                    "--env" | "-e" => { i += 1; }
                    _ if a.starts_with("--url=") => url = Some(a["--url=".len()..].to_string()),
                    _ if a.starts_with('-') => {}
                    _ => if name.is_none() { name = Some(a.to_string()); },
                }
                i += 1;
            }
            Some(AgentCommand::Add { name: name?, url, command, headers })
        }
        _ => None,
    }
}

/// The connector commands in a shell command, when it is made only of
/// `opencode mcp add | remove | list` invocations (joined by `&&`, `;` or a
/// new line). None for anything else, which is judged as a normal command.
pub fn agent_commands(text: &str) -> Option<Vec<AgentCommand>> {
    #[cfg(target_os = "windows")]
    { let _ = text; return None; }
    #[cfg(not(target_os = "windows"))]
    {
        let parsed = crate::engine::bash_parser::parse_bash_command(text);
        if !parsed.success || parsed.opaque || !parsed.pipes.as_ref().is_none_or(Vec::is_empty) {
            return None;
        }
        let commands = parsed.commands?;
        if commands.is_empty() {
            return None;
        }
        let mut out = Vec::new();
        for c in &commands {
            if !c.program_is_literal || program_name(&c.program) != "opencode" || !c.assignments.is_empty() {
                return None;
            }
            // Output redirections only to /dev/null or the other stream.
            if c.redirections.iter().any(|r| !matches!(r.target.as_str(), "/dev/null" | "&1" | "&2" | "1" | "2")) {
                return None;
            }
            out.push(read_mcp(&c.args)?);
        }
        Some(out)
    }
}

/// The one connector change in a command (`opencode mcp add|remove`), if the
/// command is only connector commands and changes exactly one connector.
pub fn agent_change(text: &str) -> Option<AgentCommand> {
    let mut changes: Vec<AgentCommand> = agent_commands(text)?.into_iter().filter(AgentCommand::changes).collect();
    if changes.len() == 1 { changes.pop() } else { None }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_agents_connector_commands() {
        assert_eq!(
            agent_change("opencode mcp add granola --url https://mcp.granola.ai/mcp"),
            Some(AgentCommand::Add { name: "granola".into(), url: Some("https://mcp.granola.ai/mcp".into()), command: None, headers: vec![] })
        );
        assert_eq!(
            agent_change("opencode mcp add --global fakenotes --url=http://127.0.0.1:5/mcp && opencode mcp list"),
            Some(AgentCommand::Add { name: "fakenotes".into(), url: Some("http://127.0.0.1:5/mcp".into()), command: None, headers: vec![] })
        );
        assert_eq!(
            agent_change("opencode mcp add gh --url https://api.githubcopilot.com/mcp/ --header 'Authorization=Bearer {env:GH}'"),
            Some(AgentCommand::Add { name: "gh".into(), url: Some("https://api.githubcopilot.com/mcp/".into()), command: None, headers: vec!["Authorization".into()] })
        );
        assert_eq!(
            agent_change("opencode mcp add everything --env LOG=1 -- npx -y @modelcontextprotocol/server-everything"),
            Some(AgentCommand::Add { name: "everything".into(), url: None, command: Some("npx -y @modelcontextprotocol/server-everything".into()), headers: vec![] })
        );
        assert_eq!(agent_change("/x/runtimes/engine-bin/opencode mcp remove granola"), Some(AgentCommand::Remove { name: "granola".into() }));
        assert_eq!(agent_commands("opencode mcp list"), Some(vec![AgentCommand::List]));
        assert_eq!(agent_commands("opencode mcp list 2>&1"), Some(vec![AgentCommand::List]));
        // Anything else is an ordinary command.
        for other in ["opencode mcp add a --url https://a/mcp | tee x", "opencode serve", "X=1 opencode mcp list", "echo hi && opencode mcp list", "opencode mcp list > out.txt", "$(which opencode) mcp list", "opencode mcp auth granola"] {
            assert!(agent_commands(other).is_none(), "{other}");
        }
        // Two changes at once: not one plain prompt.
        assert!(agent_change("opencode mcp add a --url https://a/mcp; opencode mcp add b --url https://b/mcp").is_none());
    }

    #[test]
    fn plain_titles_reasons_and_denials() {
        let add = agent_change("opencode mcp add granola --url https://mcp.granola.ai/mcp").unwrap();
        assert_eq!(add.title(), "Add the Granola connector");
        assert_eq!(add.reason(), "Granola will be able to offer its tools to your tasks. You sign in on Granola's own page.");
        assert_eq!(add.details().as_deref(), Some("https://mcp.granola.ai/mcp"));
        assert_eq!(add.denial(), "The user chose not to add Granola. Nothing was added. Say so plainly and don't try to add it another way.");
        let custom = agent_change("opencode mcp add fakenotes --url http://127.0.0.1:52652/mcp").unwrap();
        assert_eq!(custom.title(), "Add the fakenotes connector");
        assert!(custom.reason().starts_with("fakenotes (127.0.0.1:52652) will be able"));
        let key = agent_change("opencode mcp add github --url https://api.githubcopilot.com/mcp/").unwrap();
        assert!(key.reason().ends_with("You paste its key in Settings → Connectors."));
        let local = agent_change("opencode mcp add tide -- python3 tide.py").unwrap();
        assert_eq!(local.reason(), "tide will run on this Mac and offer its tools to your tasks.");
        let remove = agent_change("opencode mcp remove fakenotes").unwrap();
        assert_eq!(remove.title(), "Remove the fakenotes connector");
        assert_eq!(remove.denial(), "The user chose to keep fakenotes. Nothing was removed.");
    }

    fn paths(root: &Path) -> crate::engine::sidecar::EnginePaths {
        crate::engine::sidecar::EnginePaths::under(root)
    }

    /// Runs the launcher against a stand-in engine that prints what it got.
    #[cfg(unix)]
    #[test]
    fn launcher_adds_globally_lists_and_refuses_the_rest() {
        use std::os::unix::fs::PermissionsExt;
        use std::process::Command;
        let root = std::env::temp_dir().join(format!("vw-oc-launcher-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let engine = root.join("engine");
        std::fs::write(&engine, "#!/bin/sh\necho \"XDG=$XDG_CONFIG_HOME KEY=${OPENROUTER_API_KEY:-none}\"\nfor a in \"$@\"; do echo \"[$a]\"; done\n").unwrap();
        std::fs::set_permissions(&engine, std::fs::Permissions::from_mode(0o755)).unwrap();
        let p = paths(&root.join("app"));
        let status = root.join("status.txt");
        let launcher = root.join("opencode");
        std::fs::write(&launcher, launcher_script(&engine, &p, &status)).unwrap();
        std::fs::set_permissions(&launcher, std::fs::Permissions::from_mode(0o755)).unwrap();
        let run = |args: &[&str]| {
            let out = Command::new(&launcher).args(args).env("OPENROUTER_API_KEY", "sk-or-v1-should-not-pass").env("XDG_CONFIG_HOME", "/Users/x/.config").output().unwrap();
            (out.status.code().unwrap_or(-1), String::from_utf8_lossy(&out.stdout).to_string(), String::from_utf8_lossy(&out.stderr).to_string())
        };
        let (code, out, _) = run(&["mcp", "add", "fakenotes", "--url", "http://127.0.0.1:5/mcp"]);
        assert_eq!(code, 0);
        assert!(out.contains(&format!("XDG={}", p.config.display())), "{out}");
        assert!(out.contains("KEY=none"), "{out}");
        assert!(out.contains("[mcp]\n[add]\n[--global]\n[fakenotes]\n[--url]\n[http://127.0.0.1:5/mcp]"), "{out}");
        let (code, _, err) = run(&["mcp", "add", "gh", "--url", "https://x/mcp", "--header", "Authorization=Bearer ghp_secret"]);
        assert_eq!(code, 2);
        assert!(err.contains("don't put a key in a command"), "{err}");
        let (code, out, _) = run(&["mcp", "add", "gh", "--url", "https://x/mcp", "--header", "Authorization=Bearer {env:GH}"]);
        assert_eq!(code, 0, "{out}");
        assert_eq!(run(&["mcp", "add", "vibework", "--url", "https://x/mcp"]).0, 2);
        // `--global` written by the agent is not passed twice.
        let (_, out, _) = run(&["mcp", "add", "--global", "a", "--url", "https://a/mcp"]);
        assert_eq!(out.matches("[--global]").count(), 1, "{out}");
        let (_, out, _) = run(&["mcp", "add", "loc", "--", "npx", "-g", "srv"]);
        assert!(out.contains("[--]\n[npx]\n[-g]\n[srv]"), "{out}");
        assert_eq!(run(&["mcp", "list"]).1, "No MCP servers configured\n");
        std::fs::write(&status, "✓ fakenotes  connected\n").unwrap();
        assert_eq!(run(&["mcp", "list"]).1, "✓ fakenotes  connected\n");
        let (code, _, err) = run(&["mcp", "auth", "fakenotes"]);
        assert_eq!(code, 2);
        assert!(err.contains("Settings → Connectors"));
        assert_eq!(run(&["serve"]).0, 2);
        assert_eq!(run(&["service", "restart"]).0, 2);
        let _ = std::fs::remove_dir_all(&root);
    }
}
