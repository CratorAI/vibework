//! Rules-only policy. No I/O and no reviewer model. The adapter supplies path
//! facts (`PolicyContext::resolve`); changing this table never changes
//! permission transport or dialogs.
//!
//! Auto, as agreed: work inside the task's folder is free (reading anywhere
//! the scanner can see, creating and editing files in the folder, commands
//! that stay inside it, interpreters, network reads). It asks before writing
//! outside the folder, deleting, installing software, publishing, piping a
//! download into a shell, controlling processes, and for anything it cannot
//! analyse; sudo and writes to the app's own data are refused. The task's
//! scratch folder counts as inside the task; the app's bundled skills may be
//! read and their scripts run.
//!
//! A shell command is judged as a whole (the engine's own split into pieces
//! loses loop variables and `cd`s): every command it contains, in loops,
//! branches, substitutions, `sh -c`, `find -exec` and `xargs`, and the
//! strictest answer wins.
use serde::{Serialize, Deserialize};
use super::permissions::{Decision, PermissionAsk, PolicyContext};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all="snake_case")]
pub enum Mode { Ask, #[default] Auto, Skip }
impl Mode {
    pub fn parse(s: &str) -> Result<Self,String> { match s {"ask"=>Ok(Self::Ask),"auto"=>Ok(Self::Auto),"skip"=>Ok(Self::Skip),_=>Err("Unknown permission mode".into())} }
    pub fn name(self) -> &'static str {match self {Self::Ask=>"ask",Self::Auto=>"auto",Self::Skip=>"skip"}}
}

const PRIVILEGE: &[&str] = &["sudo","su","doas"];
const DELETE: &[&str] = &["rm","rmdir","unlink"];
const SYSTEM: &[&str] = &["brew","apt","apt-get","dnf","yum","pacman","launchctl","kill","pkill","killall"];
/// Programs that only read the files they name. (`find`, `sort`, `uniq`,
/// `tree`, `rg`, `printf` lose this with their writing options.)
const READ_ONLY: &[&str] = &["ls","cat","head","tail","pwd","grep","egrep","fgrep","rg","stat","wc","find","less","file","md5","md5sum","shasum","sha1sum","sha256sum","sha512sum","cksum","du","tree","sort","uniq","cut","tr","diff","cmp","comm","nl","column","basename","dirname","realpath","readlink","echo","printf","test","[","true","false",":","which","type","sleep","seq","expr","date","jq","tac","rev","fold","paste","strings","od","hexdump","pdfinfo"];
/// Programs whose arguments are only text: a value known only when the
/// command runs is harmless here (`echo "$f: $(md5 -q "$f")"`).
const TEXT_ONLY: &[&str] = &["echo","printf","test","[","true","false",":","expr","seq","sleep","basename","dirname","read"];
/// Programs that run the rest of their arguments as a command.
const WRAPPERS: &[&str] = &["env","nohup","time","timeout","nice","command","builtin","exec","stdbuf","caffeinate"];
const SHELLS: &[&str] = &["sh","bash","zsh","dash","ksh","fish"];
const INTERPRETERS: &[&str] = &["uv","python","python3","node","bun","vibework-js","deno","ruby","perl","php"];
/// Settings a command may be given for one program (`IFS= read -r f`).
/// Settings that change how the programs after them run (`PATH=...`).
fn sensitive_env(name: &str) -> bool {
    matches!(name, "PATH"|"HOME"|"IFS"|"CDPATH"|"ENV"|"BASH_ENV"|"SHELLOPTS"|"BASHOPTS"|"PS4"|"PROMPT_COMMAND"|"GLOBIGNORE"|"TMPDIR"|"SHELL"|"EDITOR"|"VISUAL"|"PAGER"|"MANPATH"|"TERMINFO"|"LESSOPEN"|"LESSCLOSE")
        || ["LD_","DYLD_","PYTHON","NODE_","PERL","RUBY","GIT_","NPM_","npm_","UV_","BUN_","PIP_","XDG_","SSH_","HOMEBREW_","VIBEWORK_","OPENROUTER","OPENCODE","BASH_"].iter().any(|p| name.starts_with(p))
}
const SAFE_ENV: &[&str] = &["IFS","LC_ALL","LANG","LC_CTYPE","LC_COLLATE","LC_NUMERIC","TZ","NO_COLOR","FORCE_COLOR","TERM","COLUMNS","LINES","PYTHONIOENCODING","PYTHONUTF8","PYTHONUNBUFFERED","PYTHONDONTWRITEBYTECODE","PYTHONWARNINGS","CI","HYPERFRAMES_NO_TELEMETRY","HYPERFRAMES_SKIP_SKILLS"];

pub const REFUSE_PRIVILEGE: &str = "Privilege escalation (sudo, su, doas) is refused in every mode.";
pub const REFUSE_APP_DATA: &str = "Writing the app's data or engine files is refused in every mode.";
const REFUSE_RUN_IN_APP_DATA: &str = "Running a program inside the app's own files is refused in every mode, because it could change them. Read them with cat, grep or the Read tool instead.";

/// Lexical path comparison only. Runtime path resolution is an adapter fact.
pub fn within(raw: &str, folder: &str) -> bool {
    use std::path::{Path,PathBuf,Component};
    if raw.contains('$') || raw.starts_with('~') || folder.is_empty() {return false;}
    let path = if Path::new(raw).is_absolute(){PathBuf::from(raw)}else{Path::new(folder).join(raw)};
    let mut normalized = PathBuf::new();
    for c in path.components() {match c {Component::ParentDir=>{normalized.pop();},Component::CurDir=>{},_=>normalized.push(c.as_os_str())}}
    normalized.starts_with(folder)
}
/// `.` and `..` steps applied to the text (absolute paths).
fn normalize(path: &str) -> String {
    let mut parts: Vec<&str> = Vec::new();
    for c in path.split('/') {
        match c { "" | "." => {}, ".." => {parts.pop();}, other => parts.push(other) }
    }
    format!("/{}", parts.join("/"))
}
fn program(s:&str)->&str { s.rsplit('/').next().unwrap_or(s) }
/// Words that may name a path. A `)` or `]` does not end one: in
/// `sum(p)/len(p)` (inline code) the `/` is division, not the start of
/// `/len`. A path is still found after a quote, a space, `(`, `=` or `,`.
fn path_words(s:&str)->impl Iterator<Item=&str> {
    s.split(|c:char| c.is_whitespace() || matches!(c,'\''|'"'|'('|'['|','|';'|'=')) .filter(|s|!s.is_empty())
}
fn secret(path:&str)->bool {
    path.split('/').any(|s| (s.starts_with(".env") && s!=".env.example") || matches!(s,".ssh"|".aws"|".gnupg"|"Keychains") || (s.starts_with('.') && s.contains(['*','?','[']))) || path.to_lowercase().contains(".keychain")
}
fn quoted_list(items: &[String]) -> String {
    let shown: Vec<&str> = items.iter().take(3).map(String::as_str).collect();
    let more = if items.len() > 3 { format!(" and {} more", items.len() - 3) } else { String::new() };
    format!("{}{more}", shown.join(", "))
}

/// Where a path lands.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Place { Device, Task, Scratch, Bundled, AppData, Outside }

/// The folders a path is compared with, in the form paths are resolved to.
struct Roots { task: Vec<String>, scratch: Option<String>, bundled: Option<String>, app: Option<String>, home: Option<String> }

impl Roots {
    fn new(ctx: &PolicyContext) -> Self {
        let fix = |p: &str| { let n = normalize(p); ctx.resolve.and_then(|r| r(&n).into_iter().next()).unwrap_or(n) };
        let mut task: Vec<String> = Vec::new();
        for f in [ctx.working_folder.as_deref(), ctx.working_folder_resolved.as_deref()].into_iter().flatten() {
            if f.starts_with('/') { task.push(normalize(f)); task.push(fix(f)); }
        }
        task.dedup();
        let app = ctx.protected_folder.as_deref().filter(|p| p.starts_with('/'));
        Roots {
            task,
            scratch: ctx.scratch_folder.as_deref().filter(|p| p.starts_with('/')).map(fix),
            bundled: app.map(|a| fix(&format!("{}/.vibework", a.trim_end_matches('/')))),
            app: app.map(fix),
            home: ctx.home.clone().filter(|h| h.starts_with('/')),
        }
    }
}

fn under(path: &str, root: &str) -> bool { std::path::Path::new(path).starts_with(root) }

/// One argument (or redirection target): its text and every value it takes.
#[derive(Debug, Clone)]
struct Arg { text: String, value: Result<Vec<String>, super::bash_parser::Unresolved> }
impl Arg {
    fn literal(text: &str) -> Self { Arg { text: text.into(), value: Ok(vec![text.into()]) } }
    fn values(&self) -> &[String] { self.value.as_deref().unwrap_or(&[]) }
    fn is(&self, s: &str) -> bool { self.text == s }
}
#[derive(Debug, Clone)]
struct Redir { op: String, writes: bool, target: Arg, body: Option<String> }
/// A command to judge: one the parser found, or the one a wrapper runs.
#[derive(Debug, Clone)]
struct Cmd { program: Arg, literal: bool, args: Vec<Arg>, redirs: Vec<Redir>, env: Vec<String>, piped: bool, sets: Vec<String> }

/// The outcome of judging a shell command: the first refusal and the first
/// reason to ask, if any.
#[derive(Debug, Default)]
struct Verdict { refuse: Option<String>, ask: Option<String> }

struct Walk<'a> { ctx: &'a PolicyContext, roots: Roots, verdict: Verdict }

impl<'a> Walk<'a> {
    fn new(ctx: &'a PolicyContext) -> Self { Walk { ctx, roots: Roots::new(ctx), verdict: Verdict::default() } }
    fn ask(&mut self, why: impl Into<String>) { if self.verdict.ask.is_none() { self.verdict.ask = Some(why.into()); } }
    fn refuse(&mut self, why: &str) { if self.verdict.refuse.is_none() { self.verdict.refuse = Some(why.into()); } }

    /// The task's folder, where commands start.
    fn folder(&self) -> Option<String> { self.ctx.working_folder.as_deref().filter(|f| f.starts_with('/')).map(normalize) }

    fn place(&self, raw: &str, cwd: &str) -> Place {
        if matches!(raw, "/dev/null"|"/dev/stdout"|"/dev/stderr"|"/dev/stdin"|"/dev/tty") || raw.starts_with("/dev/fd/") { return Place::Device; }
        if raw.starts_with("/\u{1}B") { return Place::Bundled; }
        if raw.starts_with("/\u{1}A") { return Place::AppData; }
        let absolute = if raw == "~" || raw.starts_with("~/") {
            match &self.roots.home { Some(h) => format!("{h}{}", &raw[1..]), None => return Place::Outside }
        } else if raw.starts_with('~') { return Place::Outside }
        else if raw.starts_with('/') { raw.to_string() }
        else { format!("{}/{raw}", cwd.trim_end_matches('/')) };
        let paths = match self.ctx.resolve { Some(resolve) => resolve(&absolute), None => vec![normalize(&absolute)] };
        // A pattern may match several files: the one that lands worst counts.
        paths.iter().map(|p| self.root_of(p)).max_by_key(|p| match p { Place::Device|Place::Task|Place::Scratch => 0, Place::Bundled => 1, Place::AppData => 2, Place::Outside => 3 }).unwrap_or(Place::Outside)
    }

    fn root_of(&self, path: &str) -> Place {
        let r = &self.roots;
        if r.scratch.as_deref().is_some_and(|s| under(path, s)) { return Place::Scratch; }
        if r.bundled.as_deref().is_some_and(|b| under(path, b)) { return Place::Bundled; }
        if r.app.as_deref().is_some_and(|a| under(path, a)) { return Place::AppData; }
        if r.task.iter().any(|t| under(path, t)) { return Place::Task; }
        Place::Outside
    }

    /// Mentions of the task's folders and the app's data in `text` replaced
    /// by short markers, so a path with a space in it stays one word. A
    /// mention followed by a `..` step is left as written.
    fn without_known(&self, text: &str) -> String {
        let mut known: Vec<(String, &str)> = Vec::new();
        if let Some(s) = self.ctx.scratch_folder.as_deref() { known.push((s.trim_end_matches('/').to_string(), ".")); }
        if let Some(a) = self.ctx.protected_folder.as_deref() {
            known.push((format!("{}/.vibework", a.trim_end_matches('/')), "/\u{1}B"));
            known.push((a.trim_end_matches('/').to_string(), "/\u{1}A"));
        }
        for f in [self.ctx.working_folder.as_deref(), self.ctx.working_folder_resolved.as_deref()].into_iter().flatten() { known.push((f.trim_end_matches('/').to_string(), ".")); }
        known.retain(|(k, _)| k.len() > 1);
        known.sort_by_key(|(k, _)| std::cmp::Reverse(k.len()));
        let mut out = String::new();
        let mut rest = text;
        'outer: while !rest.is_empty() {
            for (dir, marker) in &known {
                if let Some(after) = rest.strip_prefix(dir.as_str()) {
                    let ends = after.chars().next().is_none_or(|c| c=='/'||c=='"'||c=='\''||c.is_whitespace()||matches!(c,')'|','|';'));
                    let token_end = after.find(|c:char| c.is_whitespace()||c=='"'||c=='\'').unwrap_or(after.len());
                    let climbs = after[..token_end].split('/').any(|p| p=="..");
                    if ends && !climbs { out.push_str(marker); rest = after; continue 'outer; }
                }
            }
            let c = rest.chars().next().unwrap();
            out.push(c);
            rest = &rest[c.len_utf8()..];
        }
        out
    }

    /// The path-like pieces of one value: the whole value when it is a path,
    /// else the words in it that start a path or climb with `..`.
    /// A plain relative name (`notes.txt`, `out/`, `--out=x`'s `x`) is a
    /// path too: it lands where the command runs, and through a symlink it
    /// may land outside.
    fn path_tokens(&self, value: &str) -> Vec<String> {
        if value.starts_with('/') || value.starts_with('~') { return vec![value.to_string()]; }
        let plain = !value.is_empty() && !value.contains(|c: char| c.is_whitespace() || matches!(c, '\''|'"'|'('|')'|'['|']'|','|';'|'{'|'}'|'|'|'&'|'<'|'>'|'\\'|'`')) && !value.contains("://");
        if plain {
            let name = if value.starts_with('-') { match value.split_once('=') { Some((_, v)) => v, None => return Vec::new() } } else { value };
            return if name.is_empty() { Vec::new() } else { vec![name.to_string()] };
        }
        let text = self.without_known(value);
        path_words(&text)
            .filter(|t| !t.contains("://"))
            .filter(|t| t.starts_with('/') || t.starts_with('~') || t.contains("../") || *t == "..")
            .map(str::to_string)
            .collect()
    }

    // ---- scripts and commands ----

    fn script(&mut self, text: &str, cwds: &mut Vec<String>, depth: usize) {
        if depth > 4 { return self.ask("The command nests shells too deeply to check."); }
        #[cfg(target_os="windows")] { let _=(text,cwds); return self.ask("The command scanner is not available for this shell."); }
        #[cfg(not(target_os="windows"))] {
            let parsed = super::bash_parser::parse_bash_command(text);
            if !parsed.success { return self.ask("The command uses shell syntax the app can't check in advance."); }
            if parsed.bound_names.contains(super::scratch::ENV_NAME) { self.ask("The command changes VIBEWORK_SCRATCH, the task's scratch folder setting."); }
            let commands = parsed.commands.clone().unwrap_or_default();
            let download = commands.iter().any(|c| matches!(program(&c.program),"curl"|"wget"));
            if download && !parsed.pipes.as_deref().unwrap_or_default().is_empty() && commands.iter().any(|c| SHELLS.contains(&program(&c.program))) {
                self.ask("The command pipes a download into a shell, which runs code from the internet.");
            }
            for c in &commands {
                let cmd = self.view(&parsed, c, cwds);
                self.judge(cmd, cwds, depth);
            }
        }
    }

    #[cfg(not(target_os="windows"))]
    fn view(&self, parsed: &super::bash_parser::ParsedBashCommand, c: &super::bash_parser::CommandInfo, cwds: &[String]) -> Cmd {
        let scratch = self.ctx.scratch_folder.clone();
        let cwds = cwds.to_vec();
        let env = move |name: &str| -> Option<Vec<String>> {
            match name {
                super::scratch::ENV_NAME => scratch.clone().map(|s| vec![s]),
                "PWD" => Some(cwds.clone()),
                _ => None,
            }
        };
        let arg = |text: &str, parts: &[super::bash_parser::Part]| Arg { text: text.to_string(), value: parsed.values(&c.scope, parts, &env) };
        Cmd {
            program: Arg::literal(&c.program),
            literal: c.program_is_literal,
            args: c.args.iter().zip(&c.arg_parts).map(|(t, p)| arg(t, p)).collect(),
            redirs: c.redirections.iter().map(|r| Redir { op: r.op.clone(), writes: r.writes_file(), target: arg(&r.target, &r.parts), body: parsed.heredoc_body(r).map(str::to_string) }).collect(),
            env: if c.program.is_empty() { Vec::new() } else { c.assignment_values.iter().map(|(n, _)| n.trim_end_matches('+').to_string()).collect() },
            piped: c.stdin_piped,
            sets: if c.program.is_empty() { c.assignment_values.iter().map(|(n, _)| n.trim_end_matches('+').to_string()).collect() } else if matches!(c.program.as_str(), "export"|"declare"|"typeset"|"readonly"|"local") { c.args.iter().filter(|a| !a.starts_with('-')).map(|a| a.split(['=','+']).next().unwrap_or(a).to_string()).collect() } else { Vec::new() },
        }
    }

    fn judge(&mut self, cmd: Cmd, cwds: &mut Vec<String>, depth: usize) {
        if !cmd.literal { return self.ask("The command runs a program whose name is only known when it runs."); }
        for name in &cmd.env {
            if !SAFE_ENV.contains(&name.as_str()) { self.ask(format!("The command sets {name} for the program it runs, which can change what that program does.")); }
        }
        for name in &cmd.sets {
            if sensitive_env(name) { self.ask(format!("The command changes {name}, which changes how the programs after it run.")); }
        }
        let prog = program(&cmd.program.text).to_string();
        if PRIVILEGE.contains(&prog.as_str()) { return self.refuse(REFUSE_PRIVILEGE); }
        self.redirections(&cmd, &prog, cwds, depth);
        if prog.is_empty() { return; }

        // Programs that run another command.
        if WRAPPERS.contains(&prog.as_str()) { return self.wrapper(&cmd, &prog, cwds, depth); }
        if prog == "xargs" { return self.xargs(&cmd, cwds, depth); }
        if prog == "eval" { return self.ask("The command runs text as a command (eval), which can't be checked in advance."); }
        if prog == "trap" {
            // `trap 'commands' EXIT`: the commands are judged like `sh -c`.
            if let Some(action) = cmd.args.iter().find(|a| !a.text.starts_with('-')) {
                match &action.value { Ok(v) => for s in v.clone() { let mut inner = cwds.clone(); self.script(&s, &mut inner, depth + 1); }, Err(_) => self.ask("The command sets a trap that runs commands only known when it runs.") }
            }
            return;
        }
        if SHELLS.contains(&prog.as_str()) && self.shell(&cmd, cwds, depth) { return; }
        if prog == "find" { self.find_exec(&cmd, cwds, depth); }

        // Values only known when it runs.
        for a in &cmd.args {
            match &a.value {
                Err(super::bash_parser::Unresolved::Var(name)) => self.ask(format!("The command uses ${}, a value the app can't see before it runs.", name.trim_start_matches('$'))),
                Err(super::bash_parser::Unresolved::Computed) if !TEXT_ONLY.contains(&prog.as_str()) => self.ask(format!("The command gives {prog} a file name that is only known when it runs, so it can't be checked in advance.")),
                _ => {}
            }
        }
        let values: Vec<String> = cmd.args.iter().flat_map(|a| a.values().to_vec()).collect();
        if let Some(v) = values.iter().find(|v| self.path_tokens(v).iter().any(|t| secret(t)) || secret(v)) {
            self.ask(format!("The command reads {v}, which may hold a password or key."));
        }

        // HyperFrames: only the local authoring loop is automatic. Do not
        // bypass cwd/path checks below; packages and servers still ask.
        let hf = if prog == "hyperframes" { Some(values.as_slice()) }
            else if prog == "npx" && values.first().is_some_and(|s|s=="--no-install") && values.get(1).is_some_and(|s|s=="hyperframes") { Some(&values[2..]) }
            else { None };
        if let Some(args)=hf {
            if !args.first().is_some_and(|s|matches!(s.as_str(),"init"|"lint"|"check"|"snapshot"|"timeline"|"render")) {
                self.ask("Only HyperFrames local authoring commands run automatically; servers, accounts and installs need approval.");
            }
        } else if matches!(prog.as_str(),"npx"|"bunx") && values.iter().any(|s|s=="hyperframes"||s.starts_with("hyperframes@")) {
            self.ask("Fetching the HyperFrames package needs approval. Use the installed hyperframes command for local work.");
        }
        // Deleting, publishing, system changes, installs.
        let operands: Vec<&Arg> = cmd.args.iter().filter(|a| !a.text.starts_with('-')).collect();
        if DELETE.contains(&prog.as_str()) {
            let scratch_only = !operands.is_empty() && operands.iter().all(|a| a.value.is_ok() && a.values().iter().all(|v| cwds.iter().all(|cwd| self.place(v, cwd) == Place::Scratch)));
            if !scratch_only {
                let names: Vec<String> = operands.iter().map(|a| a.text.clone()).collect();
                self.ask(format!("The command deletes {} ({prog}). Auto asks before deleting anything.", if names.is_empty() { "files".into() } else { quoted_list(&names) }));
            }
        }
        if values.iter().any(|a| matches!(a.as_str(),"-delete"|"--delete")) { self.ask(format!("The command deletes files ({prog} {}). Auto asks before deleting anything.", if values.iter().any(|a| a=="-delete") {"-delete"} else {"--delete"})); }
        if let Some(word) = values.iter().find(|a| matches!(a.as_str(),"publish"|"deploy"|"push")) { self.ask(format!("The command publishes or uploads ({prog} {word}).")); }
        if matches!(prog.as_str(), "kill"|"pkill"|"killall") { self.ask(format!("The command stops other programs ({prog}).")); }
        else if SYSTEM.contains(&prog.as_str()) { self.ask(format!("The command installs software or changes the system ({prog}).")); }
        let has = |s: &str| values.iter().any(|a| a == s);
        if prog == "git" && (has("clean") || has("--hard") || (has("checkout") && has("--"))) { self.ask("The command discards changes with git (clean, reset --hard or checkout --)."); }
        let folder = self.folder().unwrap_or_default();
        let venv = |bin: &str| cmd.program.text.contains(bin) && within(&cmd.program.text, &folder);
        if (matches!(prog.as_str(),"npm"|"pnpm"|"bun"|"vibework-js"|"yarn") && values.iter().any(|a| matches!(a.as_str(),"-g"|"--global"|"global"|"--location=global")))
            || (matches!(prog.as_str(),"pip"|"pip3") && has("install") && !venv("/bin/pip")) {
            self.ask(format!("The command installs software for the whole computer ({prog} install)."));
        }
        if prog == "defaults" && has("write") { self.ask("The command changes a macOS setting (defaults write)."); }
        if matches!(prog.as_str(),"python"|"python3"|"uv") && has("pip") && has("install") && !venv("/bin/python") { self.ask("The command installs Python packages outside a virtual environment in the task folder."); }

        // Where it reads and writes.
        let read_only = is_read_only(&prog, &cmd.args);
        let script = self.bundled_script(&prog, &cmd, cwds);
        if !read_only && !matches!(prog.as_str(), "cd"|"pushd") {
            for cwd in cwds.iter() {
                match self.place(cwd, cwd) {
                    Place::Bundled | Place::AppData => self.refuse(REFUSE_RUN_IN_APP_DATA),
                    Place::Outside => self.ask(format!("The command runs {prog} in {cwd}, which is outside the task folder.")),
                    _ => {}
                }
            }
            // The app's data named inside a longer argument (inline code).
            if let Some(root) = self.ctx.protected_folder.as_deref() {
                for (i, a) in cmd.args.iter().enumerate() {
                    if Some(i) == script { continue; }
                    for v in a.values() {
                        let text = self.without_known(v);
                        if text.contains("/\u{1}B") || text.contains("/\u{1}A") || text.contains(root) || text.contains("~/Library/Application Support/com.vibeworkapp.vibework") { self.refuse(REFUSE_APP_DATA); }
                    }
                }
            }
        }
        for (i, a) in cmd.args.iter().enumerate() {
            for v in a.values() {
                for token in self.path_tokens(v) {
                    for cwd in cwds.clone() {
                        match self.place(&token, &cwd) {
                            Place::Device | Place::Task | Place::Scratch => {}
                            Place::Bundled if read_only || Some(i) == script || matches!(prog.as_str(), "cd"|"pushd") => {}
                            Place::Bundled => self.refuse(REFUSE_APP_DATA),
                            Place::AppData if read_only => self.ask(format!("The command reads the app's own files ({token}).")),
                            Place::AppData => self.refuse(REFUSE_APP_DATA),
                            Place::Outside => self.ask(format!("The command uses {}, which is outside the task folder.", token.replace("/\u{1}B", "the app's skills").replace("/\u{1}A", "the app's data"))),
                        }
                    }
                }
            }
        }
        // Interpreter code given in a heredoc or here-string.
        if INTERPRETERS.contains(&prog.as_str()) || prog == "awk" {
            let bodies: Vec<String> = cmd.redirs.iter().filter_map(|r| if r.op == "<<<" { r.target.values().first().cloned() } else { r.body.clone() }).collect();
            for body in bodies {
                for token in self.path_tokens_in_code(&body) {
                    for cwd in cwds.clone() {
                        match self.place(&token, &cwd) {
                            Place::Device | Place::Task | Place::Scratch => {}
                            Place::Bundled | Place::AppData => self.refuse(REFUSE_APP_DATA),
                            Place::Outside => self.ask(format!("The command's code uses {token}, which is outside the task folder.")),
                        }
                    }
                }
            }
        }

        if matches!(prog.as_str(), "cd"|"pushd") { self.change_dir(&cmd, cwds); }
        if prog == "popd" { self.ask("The command changes folder with popd, which can't be followed."); }
    }

    fn path_tokens_in_code(&self, code: &str) -> Vec<String> {
        let text = self.without_known(code);
        path_words(&text).filter(|t| !(t.starts_with("https://") || t.starts_with("http://"))).filter(|t| t.starts_with('/') || t.starts_with('~') || t.contains("../") || *t == "..").map(str::to_string).collect()
    }

    fn redirections(&mut self, cmd: &Cmd, prog: &str, cwds: &[String], depth: usize) {
        let _ = depth;
        for r in &cmd.redirs {
            if matches!(r.op.as_str(), "<<" | "<<-" | "<<<") { continue; }
            if !r.writes && !r.op.starts_with('<') { continue; }
            let targets = match &r.target.value {
                Ok(v) => v.clone(),
                Err(super::bash_parser::Unresolved::Var(name)) => { self.ask(format!("The command uses ${name}, a value the app can't see before it runs.")); continue; }
                Err(_) => { self.ask("The command writes to a file whose name is only known when it runs."); continue; }
            };
            for t in targets {
                if secret(&t) { self.ask(format!("The command reads {t}, which may hold a password or key.")); }
                for cwd in cwds {
                    match self.place(&t, cwd) {
                        Place::Device | Place::Task | Place::Scratch => {}
                        Place::Bundled if !r.writes => {}
                        Place::AppData if !r.writes => self.ask(format!("The command reads the app's own files ({t}).")),
                        Place::Bundled | Place::AppData => self.refuse(REFUSE_APP_DATA),
                        Place::Outside if r.writes => self.ask(format!("The command writes {t}, which is outside the task folder.")),
                        Place::Outside => self.ask(format!("The command uses {t}, which is outside the task folder.")),
                    }
                }
            }
        }
        let _ = prog;
    }

    /// `bun "<skills>/x/scripts/export.ts" ...`: the position of a bundled
    /// script an interpreter runs, if any.
    fn bundled_script(&self, prog: &str, cmd: &Cmd, cwds: &[String]) -> Option<usize> {
        if !(INTERPRETERS.contains(&prog) || SHELLS.contains(&prog)) || cmd.args.iter().any(|a| matches!(a.text.as_str(),"-c"|"-e"|"--eval"|"-p"|"--print")) { return None; }
        let i = cmd.args.iter().position(|a| [".py",".js",".mjs",".cjs",".ts",".sh"].iter().any(|e| a.text.ends_with(e)))?;
        let values = cmd.args[i].values();
        (!values.is_empty() && values.iter().all(|v| cwds.iter().all(|cwd| self.place(v, cwd) == Place::Bundled))).then_some(i)
    }

    fn change_dir(&mut self, cmd: &Cmd, cwds: &mut Vec<String>) {
        let targets: Vec<&Arg> = cmd.args.iter().filter(|a| !matches!(a.text.as_str(), "-L"|"-P"|"-e"|"-@")).collect();
        let values: Vec<String> = match targets.first() {
            None => match &self.roots.home { Some(h) => vec![h.clone()], None => return self.ask("The command changes to the home folder.") },
            Some(a) if a.is("-") => return self.ask("The command changes back to the previous folder (cd -), which can't be followed."),
            Some(a) => match &a.value { Ok(v) => v.clone(), Err(_) => return self.ask("The command changes to a folder only known when it runs.") },
        };
        let mut next = cwds.clone();
        for v in values {
            for cwd in cwds.iter() {
                let absolute = if v == "~" || v.starts_with("~/") { match &self.roots.home { Some(h) => format!("{h}{}", &v[1..]), None => continue } } else if v.starts_with('/') { v.clone() } else { format!("{}/{v}", cwd.trim_end_matches('/')) };
                let n = normalize(&absolute);
                if !next.contains(&n) { next.push(n); }
            }
        }
        *cwds = next;
    }

    fn wrapper(&mut self, cmd: &Cmd, prog: &str, cwds: &mut Vec<String>, depth: usize) {
        let args = &cmd.args;
        let mut i = 0;
        let mut env = Vec::new();
        match prog {
            "env" => {
                while i < args.len() {
                    let t = args[i].text.as_str();
                    if matches!(t, "-i"|"--ignore-environment"|"-0"|"--null"|"-") { i += 1; }
                    else if t == "-u" || t == "--unset" { if args.get(i+1).is_some_and(|a| a.is(super::scratch::ENV_NAME)) { self.ask("The command changes VIBEWORK_SCRATCH, the task's scratch folder setting."); } i += 2; }
                    else if t.starts_with('-') { return self.ask(format!("The command runs env with an option ({t}) the app can't follow.")); }
                    else if let Some((name, _)) = t.split_once('=').filter(|(n, _)| !n.is_empty() && n.chars().all(|c| c=='_'||c.is_ascii_alphanumeric())) { env.push(name.to_string()); i += 1; }
                    else { break; }
                }
            }
            "command" => {
                if args.iter().any(|a| a.text.starts_with("-v") || a.text.starts_with("-V")) { return; }
                while i < args.len() && args[i].text.starts_with('-') { i += 1; }
            }
            "timeout" => {
                while i < args.len() && args[i].text.starts_with('-') { if matches!(args[i].text.as_str(), "-s"|"-k"|"--signal"|"--kill-after") { i += 1; } i += 1; }
                i += 1; // the duration
            }
            "nice" => { while i < args.len() && args[i].text.starts_with('-') { if args[i].is("-n") { i += 1; } i += 1; } }
            "exec" => { while i < args.len() && args[i].text.starts_with('-') { if args[i].is("-a") { i += 1; } i += 1; } }
            _ => { while i < args.len() && args[i].text.starts_with('-') { i += 1; } }
        }
        if i >= args.len() { return; }
        let inner_program = &args[i];
        let literal = matches!(&inner_program.value, Ok(v) if v.len() == 1 && v[0] == inner_program.text);
        let inner = Cmd { program: inner_program.clone(), literal, args: args[i+1..].to_vec(), redirs: Vec::new(), env, piped: cmd.piped, sets: Vec::new() };
        self.judge(inner, cwds, depth);
    }

    fn xargs(&mut self, cmd: &Cmd, cwds: &mut Vec<String>, depth: usize) {
        let args = &cmd.args;
        let mut i = 0;
        while i < args.len() && args[i].text.starts_with('-') {
            if matches!(args[i].text.as_str(), "-n"|"-L"|"-P"|"-s"|"-d"|"-E"|"-I"|"-a") { i += 1; }
            i += 1;
        }
        let input = Arg { text: "(input)".into(), value: Err(super::bash_parser::Unresolved::Computed) };
        let (program, rest) = match args.get(i) { Some(p) => (p.clone(), args[i+1..].to_vec()), None => (Arg::literal("echo"), Vec::new()) };
        let literal = matches!(&program.value, Ok(v) if v.len() == 1 && v[0] == program.text);
        let mut inner_args = rest;
        inner_args.push(input);
        self.judge(Cmd { program, literal, args: inner_args, redirs: Vec::new(), env: Vec::new(), piped: true, sets: Vec::new() }, cwds, depth);
    }

    /// `find ... -exec cmd {} ;`: the command is judged with `{}` standing
    /// for anything under the folders searched.
    fn find_exec(&mut self, cmd: &Cmd, cwds: &mut Vec<String>, depth: usize) {
        let args = &cmd.args;
        let mut i = 0;
        while i < args.len() && matches!(args[i].text.as_str(), "-H"|"-L"|"-P") { i += 1; }
        let mut found: Vec<String> = Vec::new();
        while i < args.len() && !args[i].text.starts_with('-') && !args[i].is("(") && !args[i].is("!") {
            match &args[i].value { Ok(v) => found.extend(v.iter().map(|d| format!("{}/*", d.trim_end_matches('/')))), Err(_) => return self.ask("The command searches a folder only known when it runs.") }
            i += 1;
        }
        if found.is_empty() { found.push("./*".into()); }
        while i < args.len() {
            let t = args[i].text.as_str();
            if matches!(t, "-exec"|"-execdir"|"-ok"|"-okdir") {
                let start = i + 1;
                let mut end = start;
                while end < args.len() && !args[end].is(";") && !args[end].is("+") { end += 1; }
                let Some(program) = args.get(start).cloned() else { return self.ask("The command's find -exec has no command.") };
                let literal = matches!(&program.value, Ok(v) if v.len() == 1 && v[0] == program.text);
                let inner_args = args[start+1..end.min(args.len())].iter().map(|a| if a.text.contains("{}") { Arg { text: a.text.clone(), value: Ok(found.iter().map(|f| a.text.replace("{}", f)).collect()) } } else { a.clone() }).collect();
                self.judge(Cmd { program, literal, args: inner_args, redirs: Vec::new(), env: Vec::new(), piped: false, sets: Vec::new() }, cwds, depth);
                i = end;
            } else if matches!(t, "-fprint"|"-fprint0"|"-fprintf"|"-fls") {
                if let Some(target) = args.get(i+1) {
                    let redir = Redir { op: ">".into(), writes: true, target: target.clone(), body: None };
                    self.redirections(&Cmd { redirs: vec![redir], ..cmd.clone() }, "find", cwds, depth);
                }
                i += 1;
            }
            i += 1;
        }
    }

    /// A shell running a script: `sh -c '...'` and a heredoc are judged as
    /// commands; a script from a pipe asks. Returns whether it was handled.
    fn shell(&mut self, cmd: &Cmd, cwds: &mut Vec<String>, depth: usize) -> bool {
        if let Some(i) = cmd.args.iter().position(|a| a.text == "-c" || (a.text.starts_with('-') && !a.text.starts_with("--") && a.text.contains('c'))) {
            match cmd.args.get(i + 1).map(|a| a.value.clone()) {
                Some(Ok(scripts)) => { for s in scripts { let mut inner = cwds.clone(); self.script(&s, &mut inner, depth + 1); } }
                _ => self.ask("The command runs shell code that is only known when it runs."),
            }
            return true;
        }
        if cmd.args.iter().any(|a| !a.text.starts_with('-')) { return false; } // a script file
        let bodies: Vec<String> = cmd.redirs.iter().filter_map(|r| if r.op == "<<<" { r.target.values().first().cloned() } else { r.body.clone() }).collect();
        if !bodies.is_empty() {
            for b in bodies { let mut inner = cwds.clone(); self.script(&b, &mut inner, depth + 1); }
        } else if !cmd.redirs.iter().any(|r| r.op == "<") {
            self.ask("The command runs shell commands that come from another command's output, which can't be checked in advance.");
        }
        true
    }
}

fn is_read_only(prog: &str, args: &[Arg]) -> bool {
    if !READ_ONLY.contains(&prog) { return false; }
    let any = |f: &dyn Fn(&str) -> bool| args.iter().any(|a| f(&a.text));
    match prog {
        "sort" => !any(&|a| a.starts_with("-o") || a.starts_with("--output")),
        "uniq" => args.iter().filter(|a| !a.text.starts_with('-')).count() <= 1,
        "tree" => !any(&|a| a.starts_with("-o")),
        "find" => !any(&|a| matches!(a, "-delete"|"-fprint"|"-fprint0"|"-fprintf"|"-fls")),
        "rg" => !any(&|a| a.starts_with("--pre")),
        "printf" => !any(&|a| a == "-v"),
        _ => true,
    }
}

/// The text a shell request runs: the whole command from the tool call when
/// known (the engine splits it into pieces that lose loop variables and
/// `cd`s), else the pieces.
fn shell_texts(ask: &PermissionAsk) -> (Vec<String>, Option<String>) {
    if let Some((name, input)) = &ask.tool {
        if matches!(name.as_str(), "shell"|"bash") {
            if let Some(command) = input["command"].as_str() {
                let workdir = ["workdir","cwd","workingDirectory","working_dir"].iter().find_map(|k| input[*k].as_str()).map(str::to_string);
                return (vec![command.to_string()], workdir);
            }
        }
    }
    (ask.resources.clone(), None)
}

/// Judge shell text in Auto's terms (refusals hold in every mode).
fn judge_shell(ask: &PermissionAsk, ctx: &PolicyContext) -> Verdict {
    let (texts, workdir) = shell_texts(ask);
    let mut walk = Walk::new(ctx);
    let Some(folder) = walk.folder() else {
        // No folder: still look for refusals, from the root.
        for text in &texts { let mut cwds = vec!["/".to_string()]; walk.script(text, &mut cwds, 0); }
        return walk.verdict;
    };
    let mut start = folder.clone();
    if let Some(dir) = workdir {
        match walk.place(&dir, &folder) {
            Place::Task | Place::Scratch => start = if dir.starts_with('/') { normalize(&dir) } else { normalize(&format!("{folder}/{dir}")) },
            _ => walk.ask(format!("The command runs in {dir}, which is outside the task folder.")),
        }
    }
    for text in &texts { let mut cwds = vec![start.clone()]; walk.script(text, &mut cwds, 0); }
    walk.verdict
}

fn privileged(text: &str) -> bool {
    #[cfg(not(target_os="windows"))] {
        let parsed=super::bash_parser::parse_bash_command(text);
        if parsed.success {
            return parsed.commands.unwrap_or_default().iter().any(|c| {
                let prog=program(&c.program);
                PRIVILEGE.contains(&prog)
                    || (WRAPPERS.contains(&prog) && c.args.iter().any(|a|PRIVILEGE.contains(&program(a))))
                    || (SHELLS.contains(&prog) && c.args.iter().any(|a|a=="-c") && c.args.iter().any(|a|words(a).any(|w|PRIVILEGE.contains(&program(w)))))
            });
        }
    }
    words(text).any(|s|PRIVILEGE.contains(&program(s)))
}
fn words(s:&str)->impl Iterator<Item=&str> {
    s.split(|c:char| c.is_whitespace() || matches!(c,'\''|'"'|'('|')'|'['|']'|','|';'|'=')) .filter(|s|!s.is_empty())
}
fn shell_tool(ask: &PermissionAsk) -> bool { ask.tool.as_ref().is_some_and(|(n, i)| matches!(n.as_str(), "shell"|"bash") && i["command"].is_string()) }

/// Mandatory refusals take precedence over mode and remembered answers.
pub fn mandatory(ask:&PermissionAsk, ctx:&PolicyContext)->Option<String> {
    if ask.action=="shell" || (ask.action=="external_directory" && shell_tool(ask)) {
        let (texts, _) = shell_texts(ask);
        if texts.iter().chain(ask.resources.iter().filter(|_| ask.action=="shell")).any(|t| privileged(t)) { return Some(REFUSE_PRIVILEGE.into()); }
        if let Some(reason) = judge_shell(ask, ctx).refuse { return Some(reason); }
    }
    if ask.action=="edit" && ask.metadata["vibeworkProtectedWrite"]==true {
        return Some(REFUSE_APP_DATA.into());
    }
    None
}

/// Inside the task's scratch folder (absolute, no `..` step).
fn in_scratch(token:&str, ctx:&PolicyContext)->bool {
    let token=token.trim_end_matches("/**").trim_end_matches("/*");
    ctx.scratch_folder.as_deref().is_some_and(|s| token.starts_with('/') && !token.split('/').any(|c|c=="..") && within(token,s.trim_end_matches('/')))
}

/// A task's connector commands (`opencode mcp …`, see `crate::connectors::launcher`):
/// listing never asks; adding or removing one asks once, in plain words, in
/// Ask and Auto alike; one that would change nothing does not ask.
fn connector_command(ask:&PermissionAsk)->Option<Decision> {
    if !(ask.action=="shell" || (ask.action=="external_directory" && shell_tool(ask))) {return None;}
    let (texts, _) = shell_texts(ask);
    let [text] = texts.as_slice() else {return None};
    let commands = crate::connectors::launcher::agent_commands(text)?;
    let changes: Vec<_> = commands.iter().filter(|c| c.changes()).collect();
    match changes.as_slice() {
        [] => Some(Decision::Allow),
        [_] if ask.metadata["vibeworkConnectorUnchanged"]==true => Some(Decision::Allow),
        [change] => Some(Decision::Ask(change.reason())),
        _ => Some(Decision::Ask("Changes several connectors at once.".into())),
    }
}

/// The engine's database and the connectors file hold connector sign-ins
/// and keys (and every task's history): reading them asks.
fn holds_sign_ins(path:&str, ctx:&PolicyContext)->bool {
    let Some(app) = ctx.protected_folder.as_deref().filter(|a| a.starts_with('/')) else {return false};
    let engine = format!("{}/opencode", app.trim_end_matches('/'));
    let path = path.trim_end_matches("/**").trim_end_matches("/*");
    let fix = |p:&str| { let n = normalize(p); ctx.resolve.and_then(|r| r(&n).into_iter().next()).unwrap_or(n) };
    let target = fix(path);
    let name = std::path::Path::new(&target).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    [engine.clone(), fix(&engine)].iter().any(|root| under(&target, &format!("{root}/data")) || target == format!("{root}/config/opencode/opencode.json") || target == format!("{root}/config"))
        || (under(&target, &fix(app)) && name.starts_with("opencode.db"))
}

pub fn evaluate(ask:&PermissionAsk, ctx:&PolicyContext)->Decision {
    let ask_first=|reason:String|Decision::Ask(reason);
    if ctx.mode==Mode::Skip {return Decision::Allow;}
    if let Some(decision) = connector_command(ask) {return decision;}
    if matches!(ask.action.as_str(),"read"|"external_directory") && ask.tool.as_ref().is_none_or(|(name,_)|matches!(name.as_str(),"read"|"glob"|"grep")) {
        if let Some(p) = ask.resources.iter().find(|p| holds_sign_ins(p, ctx)) {
            return ask_first(format!("Reads {p}, which holds your connector sign-ins and keys."));
        }
    }
    let dirs = || ask.resources.iter().map(|p| p.trim_end_matches("/**").trim_end_matches("/*").to_string()).collect::<Vec<_>>();
    match ask.action.as_str() {
        // The task's scratch folder counts as the task's own.
        "external_directory" if !ask.resources.is_empty() && ask.resources.iter().all(|p|in_scratch(p,ctx)) => Decision::Allow,
        "external_directory" if ask.tool.as_ref().is_some_and(|(name,_)|matches!(name.as_str(),"read"|"glob"|"grep")) => {
            match ask.resources.iter().find(|p|secret(p)) { Some(p) => ask_first(format!("Reads {p}, which may hold a password or key.")), None => Decision::Allow }
        }
        // A command that uses folders outside the task's: judged as the command.
        "external_directory" if shell_tool(ask) => {
            if ctx.mode==Mode::Ask {return ask_first("Ask mode asks before every command.".into());}
            let verdict = judge_shell(ask, ctx);
            if let Some(reason) = verdict.ask { return ask_first(reason); }
            let walk = Walk::new(ctx);
            let folder = walk.folder().unwrap_or_else(|| "/".into());
            let outside: Vec<String> = dirs().into_iter().filter(|d| matches!(walk.place(d, &folder), Place::Outside | Place::AppData)).collect();
            if outside.is_empty() { Decision::Allow } else { ask_first(format!("The command uses {}, outside the task folder.", quoted_list(&outside))) }
        }
        "external_directory" => {
            let what = if ask.tool.as_ref().is_some_and(|(n,_)| matches!(n.as_str(),"write"|"edit"|"patch"|"apply_patch"|"multiedit")) { "Changes a file in" } else { "Uses" };
            ask_first(format!("{what} {}, outside the task folder.", quoted_list(&dirs())))
        }
        "read" => {
            match ask.resources.iter().find(|p|secret(p)) { Some(p) => ask_first(format!("Reads {p}, which may hold a password or key.")), None => Decision::Allow }
        }
        "edit" => {
            if ctx.mode==Mode::Auto && ask.metadata["vibeworkInTaskFolder"]==true {Decision::Allow}
            else if ctx.mode==Mode::Ask {ask_first("Ask mode asks before every file change.".into())}
            else {ask_first(format!("Changes {}, outside the task folder.", quoted_list(&ask.resources)))}
        }
        "shell" => {
            if ctx.mode==Mode::Ask {return ask_first("Ask mode asks before every command.".into());}
            if ctx.working_folder.is_none() {return ask_first("The task has no folder, so Auto asks before every command.".into());}
            if ask.resources.is_empty() && !shell_tool(ask) {return ask_first("The command could not be read, so it can't be checked.".into());}
            match judge_shell(ask, ctx).ask { Some(reason) => ask_first(reason), None => Decision::Allow }
        }
        "doom_loop" => ask_first("The agent has repeated the same step several times without getting further.".into()),
        // Looking at what the connectors offer changes nothing and reads no data.
        "opencode_list_mcp_resources" => Decision::Allow,
        // Reading from a connector is a use of that connector.
        "opencode_read_mcp_resource" => {
            let what = ask.resources.first().cloned().unwrap_or_default();
            match what.split_once(':') {
                Some((server, uri)) => ask_first(format!("Reads {uri} from the {server} connector. Connectors ask before each use.")),
                None => ask_first("Reads from a connector. Connectors ask before each use.".into()),
            }
        }
        // Connector tools keep their approval flow.
        other => {
            let name = ask.tool.as_ref().map(|(n,_)| super::tools::app_tool_name(n)).unwrap_or_else(|| other.to_string());
            match name.strip_prefix("mcp__").and_then(|s| s.split_once("__")) {
                Some((server, tool)) => ask_first(format!("Uses {tool} from the {server} connector. Connectors ask before each use.")),
                None => ask_first(format!("Uses {name}, which Auto doesn't run on its own.")),
            }
        }
    }
}

#[cfg(test)]
mod motion_tests {
    use super::*;
    fn judge(command:&str)->Decision {
        let ask=PermissionAsk {request_id:"p".into(),engine_session_id:"s".into(),action:"shell".into(),resources:vec![command.into()],metadata:serde_json::json!({"vibeworkInTaskFolder":true}),tool:None};
        evaluate(&ask,&PolicyContext {mode:Mode::Auto,working_folder:Some("/work".into()),..Default::default()})
    }
    #[test] fn hyperframes_local_loop_stays_in_task(){for command in ["hyperframes init film","hyperframes lint film","hyperframes check film","hyperframes snapshot film --output film/output/check","hyperframes timeline film --json","hyperframes render film --output film/output/movie.mp4","npx --no-install hyperframes lint film","HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_SKIP_SKILLS=1 hyperframes lint film"]{assert_eq!(judge(command),Decision::Allow,"{command}")}}
    #[test] fn hyperframes_does_not_exempt_install_accounts_servers_or_outside_paths(){for command in ["npx hyperframes init film","bunx hyperframes@0.9.41 lint film","hyperframes login","hyperframes usage","hyperframes skills","hyperframes preview film --background","hyperframes publish film","hyperframes render film --output /outside/movie.mp4","hyperframes snapshot ../elsewhere","cd /outside && hyperframes lint ."]{assert!(!matches!(judge(command),Decision::Allow),"{command}")}}
}
