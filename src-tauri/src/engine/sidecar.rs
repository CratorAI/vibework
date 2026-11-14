//! Lifecycle of the OpenCode engine process.
//!
//! The app owns exactly one `opencode serve` child:
//! - bound to 127.0.0.1 on a free port, HTTP Basic auth (user `opencode`). The
//!   engine generates its own random password and prints it on its stdout,
//!   which only this process reads: the password is never in the engine's
//!   environment (any process of the same user can read a Bun binary's
//!   exec-time environment with `ps eww`), an argument or a file;
//! - every XDG directory and TMPDIR inside `<app data>/opencode/`, so a user's
//!   own OpenCode install is never read or written;
//! - no OpenRouter key at all: model requests go through the app's loopback
//!   proxy (`bridge`), authorised by a per-launch capability that reaches the
//!   engine's plugin over the engine's stdin (written once, then closed);
//! - ready once its stdout announces the listener and `/api/info` reports the
//!   child's own PID;
//! - restarted with backoff when it dies unexpectedly (a turn that was running
//!   is reported as failed, never replayed);
//! - stopped with SIGTERM, then SIGKILL, for its whole process tree.

use std::collections::HashSet;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use base64::Engine as _;
use tokio::sync::watch;
use tracing::{error, info, warn};

/// What a client needs to reach the running engine. Never sent to the webview.
#[derive(Clone)]
pub struct Connection {
    pub base_url: String,
    password: String,
    pub pid: u32,
    /// Increments on every (re)start, so listeners can tell a new engine from the old one.
    pub generation: u64,
}

impl Connection {
    pub fn authorization(&self) -> String {
        let token = base64::engine::general_purpose::STANDARD.encode(format!("opencode:{}", self.password));
        format!("Basic {token}")
    }
}

impl std::fmt::Debug for Connection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Connection")
            .field("base_url", &self.base_url)
            .field("pid", &self.pid)
            .field("generation", &self.generation)
            .finish_non_exhaustive()
    }
}

/// Directories the engine is confined to.
#[derive(Clone, Debug)]
pub struct EnginePaths {
    pub root: PathBuf,
    pub config: PathBuf,
    pub data: PathBuf,
    pub cache: PathBuf,
    pub state: PathBuf,
    pub tmp: PathBuf,
    pub pid_file: PathBuf,
}

impl EnginePaths {
    pub fn under(app_data: &Path) -> Self {
        let root = app_data.join("opencode");
        Self {
            config: root.join("config"),
            data: root.join("data"),
            cache: root.join("cache"),
            state: root.join("state"),
            tmp: root.join("tmp"),
            pid_file: root.join("sidecar.pid"),
            root,
        }
    }

    fn create(&self) -> std::io::Result<()> {
        for dir in [&self.root, &self.config, &self.data, &self.cache, &self.state, &self.tmp] {
            std::fs::create_dir_all(dir)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))?;
            }
        }
        Ok(())
    }

    /// The engine's global config directory (`$XDG_CONFIG_HOME/opencode`).
    pub fn engine_config_dir(&self) -> PathBuf {
        self.config.join("opencode")
    }
}

/// Environment the engine inherits from the app: OS paths and locale only.
/// Everything else (including any `VIBEWORK_*` or provider variables of the
/// app's own environment) is dropped.
const INHERITED_ENV: &[&str] = &[
    "PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "TERM",
    "SSL_CERT_FILE", "SSL_CERT_DIR", "NODE_EXTRA_CA_CERTS",
];

/// Locate the sidecar binary: next to the app executable (Tauri copies
/// `externalBin` there in dev and bundles it in Contents/MacOS), with the
/// prepared file under src-tauri/binaries as a debug fallback.
pub fn binary_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("Cannot locate the app executable: {e}"))?;
    let beside = exe.parent().map(|dir| dir.join("opencode"));
    if let Some(path) = beside.filter(|p| p.is_file()) {
        return Ok(path);
    }
    #[cfg(debug_assertions)]
    {
        let triple = if cfg!(target_arch = "aarch64") { "aarch64-apple-darwin" } else { "x86_64-apple-darwin" };
        let fallback = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries").join(format!("opencode-{triple}"));
        if fallback.is_file() {
            return Ok(fallback);
        }
    }
    Err("The OpenCode engine binary is missing. Run `bun run prepare:opencode`.".into())
}

fn free_port() -> std::io::Result<u16> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
    Ok(listener.local_addr()?.port())
}

/// Replace every occurrence of a secret in a log line.
fn redact(line: &str, secrets: &[&str]) -> String {
    let mut out = line.to_string();
    for secret in secrets.iter().filter(|s| s.len() >= 8) {
        out = out.replace(secret, "[redacted]");
    }
    out
}

struct Running {
    child: Child,
    pid: u32,
}

/// Owns the engine process and publishes its connection.
pub struct Supervisor {
    paths: EnginePaths,
    running: Mutex<Option<Running>>,
    stopping: AtomicBool,
    generation: AtomicU64,
    conn_tx: watch::Sender<Option<Arc<Connection>>>,
    /// Serialises starts and restarts.
    restart_lock: tokio::sync::Mutex<()>,
}

/// How many unexpected exits are restarted within RESTART_WINDOW before giving up.
const MAX_RESTARTS: usize = 5;
const RESTART_WINDOW: Duration = Duration::from_secs(120);
const READY_TIMEOUT: Duration = Duration::from_secs(45);
const STOP_GRACE: Duration = Duration::from_secs(2);

impl Supervisor {
    pub fn new(paths: EnginePaths) -> Arc<Self> {
        let (conn_tx, _) = watch::channel(None);
        Arc::new(Self {
            paths,
            running: Mutex::new(None),
            stopping: AtomicBool::new(false),
            generation: AtomicU64::new(0),
            conn_tx,
            restart_lock: tokio::sync::Mutex::new(()),
        })
    }

    pub fn subscribe(&self) -> watch::Receiver<Option<Arc<Connection>>> {
        self.conn_tx.subscribe()
    }

    pub fn current(&self) -> Option<Arc<Connection>> {
        self.conn_tx.borrow().clone()
    }

    /// Wait up to `timeout` for a ready engine.
    pub async fn connection(&self, timeout: Duration) -> Result<Arc<Connection>, String> {
        let mut rx = self.subscribe();
        let wait = async {
            loop {
                if let Some(conn) = rx.borrow_and_update().clone() {
                    return Ok(conn);
                }
                if rx.changed().await.is_err() {
                    return Err("The engine supervisor stopped".to_string());
                }
            }
        };
        tokio::time::timeout(timeout, wait)
            .await
            .map_err(|_| "The OpenCode engine is not ready yet. Try again in a moment.".to_string())?
    }

    /// Start the engine (stopping a previous one first) and wait until it is ready.
    pub async fn start(self: &Arc<Self>) -> Result<Arc<Connection>, String> {
        let _guard = self.restart_lock.lock().await;
        self.stopping.store(false, Ordering::SeqCst);
        let this = self.clone();
        let paths = self.paths.clone();
        let stop_previous = {
            let this = self.clone();
            let paths = paths.clone();
            tauri::async_runtime::spawn_blocking(move || {
                // An engine left by a force-quit app first (its pid file), then our own.
                if this.running.lock().unwrap().is_none() {
                    reap_stale(&paths);
                }
                this.stop_child();
            })
        };
        let _ = stop_previous.await;

        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let plan = super::launch_plan(&paths)?;
        let launched = tauri::async_runtime::spawn_blocking(move || launch(&paths, plan))
            .await
            .map_err(|e| format!("Engine launch task failed: {e}"))??;
        let (running, base_url, pid, announced) = launched;
        *this.running.lock().unwrap() = Some(running);

        match wait_ready(&base_url, pid, generation, announced).await {
            Ok(conn) => {
                info!("OpenCode engine ready (pid {}, generation {})", conn.pid, conn.generation);
                let conn = Arc::new(conn);
                let _ = this.conn_tx.send(Some(conn.clone()));
                this.clone().watch_exit(conn.pid, generation);
                Ok(conn)
            }
            Err(e) => {
                error!("OpenCode engine did not become ready: {e}");
                let this2 = this.clone();
                let _ = tauri::async_runtime::spawn_blocking(move || this2.stop_child()).await;
                Err(e)
            }
        }
    }

    /// Restart unexpectedly exited engines with backoff; never replays work.
    fn watch_exit(self: Arc<Self>, pid: u32, generation: u64) {
        std::thread::spawn(move || {
            loop {
                std::thread::sleep(Duration::from_millis(300));
                let mut guard = self.running.lock().unwrap();
                let Some(running) = guard.as_mut() else { return };
                if running.pid != pid {
                    return;
                }
                match running.child.try_wait() {
                    Ok(None) => continue,
                    Ok(Some(status)) => {
                        *guard = None;
                        drop(guard);
                        if self.stopping.load(Ordering::SeqCst) || self.generation.load(Ordering::SeqCst) != generation {
                            return;
                        }
                        warn!("OpenCode engine exited unexpectedly ({status}); restarting");
                        let _ = self.conn_tx.send(None);
                        tauri::async_runtime::spawn(self.clone().restart_after_crash());
                        return;
                    }
                    Err(e) => {
                        warn!("Could not poll the OpenCode engine: {e}");
                        return;
                    }
                }
            }
        });
    }

    async fn restart_after_crash(self: Arc<Self>) {
        static RECENT: Mutex<Vec<Instant>> = Mutex::new(Vec::new());
        let attempt = {
            let mut recent = RECENT.lock().unwrap();
            recent.retain(|t| t.elapsed() < RESTART_WINDOW);
            recent.push(Instant::now());
            recent.len()
        };
        if attempt > MAX_RESTARTS {
            error!("OpenCode engine crashed {attempt} times in {RESTART_WINDOW:?}; not restarting again");
            return;
        }
        let delay = Duration::from_millis(500 * (1u64 << (attempt - 1).min(5)));
        tokio::time::sleep(delay).await;
        if self.stopping.load(Ordering::SeqCst) {
            return;
        }
        if let Err(e) = self.start().await {
            error!("OpenCode engine restart failed: {e}");
        }
    }

    /// Restart deliberately (for example after the OpenRouter key changed).
    pub async fn restart(self: &Arc<Self>) -> Result<(), String> {
        let _ = self.conn_tx.send(None);
        self.start().await.map(|_| ())
    }

    /// Stop the engine and everything it started. Blocking; safe to call twice.
    pub fn shutdown_blocking(&self) {
        self.stopping.store(true, Ordering::SeqCst);
        let _ = self.conn_tx.send(None);
        self.stop_child();
    }

    fn stop_child(&self) {
        let running = self.running.lock().unwrap().take();
        if let Some(mut running) = running {
            terminate_tree(&mut running.child, running.pid);
            let _ = std::fs::remove_file(&self.paths.pid_file);
        }
    }
}

/// What the engine announced on its stdout: its listener and its password.
#[derive(Default)]
struct Announced {
    url: Option<String>,
    password: Option<String>,
}

type Launched = (Running, String, u32, Arc<Mutex<Announced>>);

const PASSWORD_PREFIX: &str = "server password ";

fn launch(paths: &EnginePaths, plan: super::LaunchPlan) -> Result<Launched, String> {
    paths.create().map_err(|e| format!("Cannot create the engine folders: {e}"))?;
    super::prompt::write_config(&paths.engine_config_dir(), &plan.config)?;

    let binary = binary_path()?;
    let port = free_port().map_err(|e| format!("No free local port: {e}"))?;

    let mut cmd = Command::new(&binary);
    cmd.args(["serve", "--hostname", "127.0.0.1", "--port", &port.to_string()])
        .current_dir(&paths.root)
        .env_clear()
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for name in INHERITED_ENV {
        if let Ok(value) = std::env::var(name) {
            cmd.env(name, value);
        }
    }
    let path = super::launch::engine_path();
    if !path.is_empty() {
        cmd.env("PATH", path);
    }
    cmd.env("XDG_CONFIG_HOME", &paths.config)
        .env("XDG_DATA_HOME", &paths.data)
        .env("XDG_CACHE_HOME", &paths.cache)
        .env("XDG_STATE_HOME", &paths.state)
        .env("TMPDIR", &paths.tmp)
        .env("OPENCODE_DISABLE_AUTOUPDATE", "1")
        // A working folder's own opencode.json or .opencode/ plugins must not
        // load: the agent can write files there without asking, and such a
        // file could change permission rules or run code inside the engine.
        .env("OPENCODE_DISABLE_PROJECT_CONFIG", "1");
    for (name, value) in &plan.env {
        cmd.env(name, value);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // Own process group, so the whole tree can be signalled at once.
        cmd.process_group(0);
    }

    let mut child = cmd.spawn().map_err(|e| format!("Cannot start the OpenCode engine: {e}"))?;
    let pid = child.id();
    let _ = std::fs::write(&paths.pid_file, pid.to_string());

    // The launch payload goes over stdin once; closing it marks the end.
    if let Some(mut stdin) = child.stdin.take() {
        let payload = serde_json::to_vec(&plan.payload).map_err(|e| e.to_string())?;
        if let Err(e) = stdin.write_all(&payload) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("Cannot hand the launch payload to the engine: {e}"));
        }
    }

    let secrets = Arc::new(Mutex::new(plan.redact.clone()));
    let announced = Arc::new(Mutex::new(Announced::default()));
    let log_path = paths.root.join("sidecar.log");
    let log = Arc::new(Mutex::new(
        std::fs::OpenOptions::new().create(true).append(true).open(&log_path).ok(),
    ));
    if let Some(stdout) = child.stdout.take() {
        let announced = announced.clone();
        let secrets = secrets.clone();
        let log = log.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let clean = if let Some(password) = line.strip_prefix(PASSWORD_PREFIX) {
                    let password = password.trim().to_string();
                    secrets.lock().unwrap().push(password.clone());
                    announced.lock().unwrap().password = Some(password);
                    format!("{PASSWORD_PREFIX}[redacted]")
                } else {
                    let refs = secrets.lock().unwrap().clone();
                    let refs: Vec<&str> = refs.iter().map(String::as_str).collect();
                    redact(&line, &refs)
                };
                if let Some(url) = clean.strip_prefix("server listening on ") {
                    announced.lock().unwrap().url = Some(url.trim().to_string());
                }
                if let Some(file) = log.lock().unwrap().as_mut() {
                    let _ = writeln!(file, "[out] {clean}");
                }
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        let secrets = secrets.clone();
        let log = log.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                let refs = secrets.lock().unwrap().clone();
                let refs: Vec<&str> = refs.iter().map(String::as_str).collect();
                if let Some(file) = log.lock().unwrap().as_mut() {
                    let _ = writeln!(file, "[err] {}", redact(&line, &refs));
                }
            }
        });
    }

    Ok((Running { child, pid }, format!("http://127.0.0.1:{port}"), pid, announced))
}

/// Ready = the child announced the expected listener and its password, then
/// `/api/info` answered with the child's PID.
async fn wait_ready(base_url: &str, pid: u32, generation: u64, announced: Arc<Mutex<Announced>>) -> Result<Connection, String> {
    let deadline = Instant::now() + READY_TIMEOUT;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    loop {
        if Instant::now() > deadline {
            return Err(format!("Timed out after {READY_TIMEOUT:?} waiting for the engine"));
        }
        let (url, password) = {
            let a = announced.lock().unwrap();
            (a.url.clone(), a.password.clone())
        };
        if let Some(url) = &url {
            if url.trim_end_matches('/') != base_url {
                return Err(format!("The engine announced an unexpected listener: {url}"));
            }
        }
        if let (Some(_), Some(password)) = (url, password) {
            let conn = Connection { base_url: base_url.to_string(), password, pid, generation };
            let info = client
                .get(format!("{}/api/info", conn.base_url))
                .header("Authorization", conn.authorization())
                .send()
                .await;
            if let Ok(response) = info {
                if response.status().is_success() {
                    let body: serde_json::Value = response.json().await.unwrap_or_default();
                    if body["pid"].as_u64() == Some(pid as u64) {
                        return Ok(conn);
                    }
                    return Err("The engine on the port is not the process we started".into());
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

/// All descendants of `pid` (children first found by walking `ps` output).
fn descendants(pid: u32) -> Vec<u32> {
    let Ok(output) = Command::new("/bin/ps").args(["-A", "-o", "pid=,ppid="]).output() else {
        return Vec::new();
    };
    let table: Vec<(u32, u32)> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            Some((parts.next()?.parse().ok()?, parts.next()?.parse().ok()?))
        })
        .collect();
    let mut found = Vec::new();
    let mut frontier = vec![pid];
    let mut seen = HashSet::new();
    while let Some(parent) = frontier.pop() {
        for &(child, ppid) in &table {
            if ppid == parent && seen.insert(child) {
                found.push(child);
                frontier.push(child);
            }
        }
    }
    found
}

#[cfg(unix)]
fn signal_tree(pid: u32, tree: &[u32], signal: libc::c_int) {
    unsafe {
        // The engine leads its own process group (process_group(0)).
        libc::kill(-(pid as libc::pid_t), signal);
        libc::kill(pid as libc::pid_t, signal);
        for &p in tree {
            libc::kill(p as libc::pid_t, signal);
        }
    }
}

/// SIGTERM the engine and its descendants, then SIGKILL whatever is left after STOP_GRACE.
fn terminate_tree(child: &mut Child, pid: u32) {
    #[cfg(unix)]
    {
        let tree = descendants(pid);
        signal_tree(pid, &tree, libc::SIGTERM);
        let deadline = Instant::now() + STOP_GRACE;
        while Instant::now() < deadline {
            if matches!(child.try_wait(), Ok(Some(_))) {
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        let mut left = descendants(pid);
        left.extend(tree.iter().copied().filter(|p| alive(*p)));
        signal_tree(pid, &left, libc::SIGKILL);
    }
    let _ = child.kill();
    let _ = child.wait();
    info!("OpenCode engine stopped (pid {pid})");
}

#[cfg(unix)]
fn alive(pid: u32) -> bool {
    unsafe { libc::kill(pid as libc::pid_t, 0) == 0 }
}

/// An engine left behind by a crashed or force-killed app (pid file present
/// and the process is still an `opencode`): stop it before starting a new one.
fn reap_stale(paths: &EnginePaths) {
    let Ok(text) = std::fs::read_to_string(&paths.pid_file) else { return };
    let Ok(pid) = text.trim().parse::<u32>() else { return };
    let Ok(output) = Command::new("/bin/ps").args(["-o", "comm=", "-p", &pid.to_string()]).output() else { return };
    let comm = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if comm.rsplit('/').next() == Some("opencode") {
        warn!("Stopping a stale OpenCode engine left by a previous run (pid {pid})");
        #[cfg(unix)]
        {
            let tree = descendants(pid);
            signal_tree(pid, &tree, libc::SIGTERM);
            std::thread::sleep(STOP_GRACE);
            signal_tree(pid, &tree, libc::SIGKILL);
        }
    }
    let _ = std::fs::remove_file(&paths.pid_file);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_secrets() {
        assert_eq!(redact("key=sk-or-v1-abcdef123456 ok", &["sk-or-v1-abcdef123456"]), "key=[redacted] ok");
        // Short strings are never treated as secrets (avoid mangling logs)
        assert_eq!(redact("a b", &["a"]), "a b");
    }

    #[test]
    fn connection_debug_hides_password() {
        let conn = Connection { base_url: "http://127.0.0.1:1".into(), password: "supersecretpassword".into(), pid: 1, generation: 1 };
        assert!(!format!("{conn:?}").contains("supersecret"));
        assert!(conn.authorization().starts_with("Basic "));
    }

    #[test]
    fn paths_stay_inside_app_data() {
        let paths = EnginePaths::under(Path::new("/x/app"));
        for p in [&paths.config, &paths.data, &paths.cache, &paths.state, &paths.tmp] {
            assert!(p.starts_with("/x/app/opencode"));
        }
    }
}
