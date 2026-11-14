//! PTY-backed shell sessions, independent of Tauri so they can be tested directly.
//!
//! Each session owns four pieces:
//! - the PTY master (resize, foreground process group lookup),
//! - a writer thread fed by a channel (so `write` never blocks the caller),
//! - a reader thread that pushes raw output into a coalescing emitter thread
//!   (at most one `Data` event per ~16 ms, i.e. ~60 events per second),
//! - a waiter thread that reaps the child and reports its exit.
//!
//! Output is forwarded as raw bytes; decoding (UTF-8, escape sequences) is left
//! to the terminal emulator on the frontend, so multi-byte sequences split across
//! reads are never mangled here.

use std::collections::VecDeque;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use tracing::{debug, warn};

/// How much recent output is kept for `snapshot` (repainting a remounted panel).
pub const SCROLLBACK_BYTES: usize = 256 * 1024;
/// Minimum interval between two data events for one terminal (~60 per second).
const FRAME: Duration = Duration::from_millis(16);
/// Emit early if a single frame accumulates more than this.
const MAX_EVENT_BYTES: usize = 512 * 1024;

/// Something the session reports to its owner.
pub enum SessionEvent {
    /// Raw output bytes (coalesced).
    Data(Vec<u8>),
    /// The shell exited. `None` when it was killed by a signal or the status is unknown.
    Exit(Option<i32>),
}

pub type EventSink = Arc<dyn Fn(SessionEvent) + Send + Sync + 'static>;

pub struct SpawnOptions {
    pub cwd: PathBuf,
    pub cols: u16,
    pub rows: u16,
    /// Inherited variables the shell must not get (credentials).
    pub remove_env: Vec<String>,
}

pub struct Session {
    pub shell: String,
    pub cwd: String,
    pid: Option<u32>,
    master: Mutex<Option<Box<dyn MasterPty + Send>>>,
    input: Mutex<Option<mpsc::Sender<Vec<u8>>>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    alive: Arc<AtomicBool>,
    scrollback: Arc<Mutex<Scrollback>>,
}

impl Session {
    pub fn spawn(opts: SpawnOptions, sink: EventSink) -> Result<Arc<Session>, String> {
        let pty = native_pty_system();
        let pair = pty
            .openpty(pty_size(opts.cols, opts.rows))
            .map_err(|e| format!("Failed to open a pseudo-terminal: {e}"))?;

        let (mut cmd, shell) = shell_command(&opts.cwd);
        for name in &opts.remove_env {
            cmd.env_remove(name);
        }
        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to start {shell}: {e}"))?;
        // The parent must not keep the slave side open, otherwise the reader never sees EOF.
        drop(pair.slave);

        let pid = child.process_id();
        let killer = child.clone_killer();
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to read from the terminal: {e}"))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to write to the terminal: {e}"))?;

        let alive = Arc::new(AtomicBool::new(true));
        let scrollback = Arc::new(Mutex::new(Scrollback::default()));

        // Writer thread: keystrokes are queued so callers never block on a full PTY buffer.
        let (input_tx, input_rx) = mpsc::channel::<Vec<u8>>();
        std::thread::Builder::new()
            .name("terminal-writer".into())
            .spawn(move || writer_loop(writer, input_rx))
            .map_err(|e| e.to_string())?;

        // Reader -> emitter.
        let (chunk_tx, chunk_rx) = mpsc::channel::<Vec<u8>>();
        let (drained_tx, drained_rx) = mpsc::channel::<()>();
        std::thread::Builder::new()
            .name("terminal-reader".into())
            .spawn(move || reader_loop(reader, chunk_tx))
            .map_err(|e| e.to_string())?;
        {
            let sink = sink.clone();
            let scrollback = scrollback.clone();
            std::thread::Builder::new()
                .name("terminal-emitter".into())
                .spawn(move || {
                    emitter_loop(chunk_rx, &scrollback, &sink);
                    let _ = drained_tx.send(());
                })
                .map_err(|e| e.to_string())?;
        }

        // Waiter: reap the child, let remaining output drain, then report the exit.
        {
            let alive = alive.clone();
            let mut child = child;
            std::thread::Builder::new()
                .name("terminal-waiter".into())
                .spawn(move || {
                    let code = match child.wait() {
                        Ok(status) if status.signal().is_none() => Some(status.exit_code() as i32),
                        Ok(_) => None,
                        Err(e) => {
                            warn!("[terminal] wait failed: {e}");
                            None
                        }
                    };
                    // Background jobs may keep the PTY open; don't wait for them forever.
                    let _ = drained_rx.recv_timeout(Duration::from_millis(750));
                    alive.store(false, Ordering::SeqCst);
                    sink(SessionEvent::Exit(code));
                })
                .map_err(|e| e.to_string())?;
        }

        Ok(Arc::new(Session {
            shell,
            cwd: opts.cwd.to_string_lossy().into_owned(),
            pid,
            master: Mutex::new(Some(pair.master)),
            input: Mutex::new(Some(input_tx)),
            killer: Mutex::new(killer),
            alive,
            scrollback,
        }))
    }

    pub fn is_alive(&self) -> bool {
        self.alive.load(Ordering::SeqCst)
    }

    pub fn pid(&self) -> Option<u32> {
        self.pid
    }

    pub fn write(&self, data: &[u8]) -> Result<(), String> {
        if !self.is_alive() {
            return Err("Terminal has exited".into());
        }
        let guard = self.input.lock().unwrap();
        match guard.as_ref() {
            Some(tx) => tx
                .send(data.to_vec())
                .map_err(|_| "Terminal input is closed".to_string()),
            None => Err("Terminal is closed".into()),
        }
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        let guard = self.master.lock().unwrap();
        match guard.as_ref() {
            Some(master) => master
                .resize(pty_size(cols, rows))
                .map_err(|e| format!("Failed to resize terminal: {e}")),
            None => Err("Terminal is closed".into()),
        }
    }

    pub fn snapshot(&self) -> Vec<u8> {
        self.scrollback.lock().unwrap().contents()
    }

    /// Kill the shell and everything in its session's process groups, then close the PTY.
    pub fn kill(&self) {
        // Stop accepting input.
        self.input.lock().unwrap().take();

        #[cfg(unix)]
        {
            // The foreground job (e.g. a running `npm run dev`) lives in its own process group
            // under job control; the shell is a session leader (setsid), so its pgid == pid.
            let foreground = self
                .master
                .lock()
                .unwrap()
                .as_ref()
                .and_then(|m| m.process_group_leader());
            let groups: Vec<libc::pid_t> = foreground
                .into_iter()
                .chain(self.pid.map(|p| p as libc::pid_t))
                .filter(|g| *g > 1)
                .collect();
            for g in &groups {
                unsafe {
                    libc::killpg(*g, libc::SIGHUP);
                }
            }
            // Closing the master hangs up the terminal, which also SIGHUPs the session.
            self.master.lock().unwrap().take();

            if self.is_alive() || groups.iter().any(|g| group_exists(*g)) {
                let groups = groups.clone();
                let alive = self.alive.clone();
                let mut killer = self.killer.lock().unwrap().clone_killer();
                std::thread::spawn(move || {
                    let deadline = Instant::now() + Duration::from_millis(500);
                    while Instant::now() < deadline
                        && (alive.load(Ordering::SeqCst) || groups.iter().any(|g| group_exists(*g)))
                    {
                        std::thread::sleep(Duration::from_millis(25));
                    }
                    for g in &groups {
                        if group_exists(*g) {
                            debug!("[terminal] SIGKILL to process group {g}");
                            unsafe {
                                libc::killpg(*g, libc::SIGKILL);
                            }
                        }
                    }
                    if alive.load(Ordering::SeqCst) {
                        let _ = killer.kill();
                    }
                });
            }
        }

        #[cfg(not(unix))]
        {
            let _ = self.killer.lock().unwrap().kill();
            self.master.lock().unwrap().take();
        }
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        if self.is_alive() {
            self.kill();
        }
    }
}

#[cfg(unix)]
fn group_exists(pgid: libc::pid_t) -> bool {
    unsafe { libc::killpg(pgid, 0) == 0 }
}

fn pty_size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        rows: rows.clamp(1, 1000),
        cols: cols.clamp(1, 1000),
        pixel_width: 0,
        pixel_height: 0,
    }
}

/// Build the command for the user's interactive login shell.
fn shell_command(cwd: &Path) -> (CommandBuilder, String) {
    #[cfg(unix)]
    let (mut cmd, shell) = {
        let mut cmd = CommandBuilder::new_default_prog();
        let shell = resolve_unix_shell(&mut cmd);
        // `new_default_prog` runs $SHELL with argv[0] = "-<name>", i.e. as a login shell;
        // it is interactive because stdin is a tty.
        cmd.env("SHELL", &shell);
        (cmd, shell)
    };

    #[cfg(windows)]
    let (mut cmd, shell) = {
        let shell = "powershell.exe".to_string();
        let mut cmd = CommandBuilder::new(&shell);
        cmd.arg("-NoLogo");
        (cmd, shell)
    };

    cmd.cwd(cwd);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "Vibework");
    // Inherited from whatever terminal launched the app (dev mode); they would make
    // shell rc files behave as if they were running in that terminal.
    for key in [
        "TERM_PROGRAM_VERSION",
        "TERM_SESSION_ID",
        "ITERM_SESSION_ID",
        "ITERM_PROFILE",
        "LC_TERMINAL",
        "LC_TERMINAL_VERSION",
        "KITTY_WINDOW_ID",
        "WEZTERM_PANE",
        "VSCODE_INJECTION",
    ] {
        cmd.env_remove(key);
    }
    let has_locale = ["LANG", "LC_ALL", "LC_CTYPE"]
        .iter()
        .any(|k| cmd.get_env(k).map(|v| !v.is_empty()).unwrap_or(false));
    if !has_locale {
        cmd.env("LANG", "en_US.UTF-8");
    }
    (cmd, shell)
}

#[cfg(unix)]
fn resolve_unix_shell(cmd: &mut CommandBuilder) -> String {
    use std::os::unix::fs::PermissionsExt;
    let executable = |p: &str| {
        std::fs::metadata(p)
            .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    };
    if let Ok(shell) = std::env::var("SHELL") {
        if !shell.is_empty() && executable(&shell) {
            return shell;
        }
    }
    // Ask the password database (portable-pty falls back to it when SHELL is unset).
    cmd.env_remove("SHELL");
    let from_passwd = cmd.get_shell();
    if executable(&from_passwd) && from_passwd != "/bin/sh" {
        return from_passwd;
    }
    if executable("/bin/zsh") {
        return "/bin/zsh".into();
    }
    from_passwd
}

fn writer_loop(mut writer: Box<dyn Write + Send>, rx: mpsc::Receiver<Vec<u8>>) {
    while let Ok(data) = rx.recv() {
        if let Err(e) = writer.write_all(&data).and_then(|_| writer.flush()) {
            debug!("[terminal] write failed: {e}");
            break;
        }
    }
}

fn reader_loop(mut reader: Box<dyn Read + Send>, tx: mpsc::Sender<Vec<u8>>) {
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                if tx.send(buf[..n].to_vec()).is_err() {
                    break;
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            // EIO once the slave side is closed (the shell exited).
            Err(_) => break,
        }
    }
}

fn emitter_loop(rx: mpsc::Receiver<Vec<u8>>, scrollback: &Mutex<Scrollback>, sink: &EventSink) {
    let mut last_emit = Instant::now() - FRAME;
    let mut pending: Vec<u8> = Vec::new();
    loop {
        let first = match rx.recv() {
            Ok(chunk) => chunk,
            Err(_) => break,
        };
        pending.extend_from_slice(&first);
        let mut disconnected = false;
        // Collect until the frame interval has elapsed since the previous event.
        let deadline = last_emit + FRAME;
        while pending.len() < MAX_EVENT_BYTES {
            let now = Instant::now();
            if now >= deadline {
                break;
            }
            match rx.recv_timeout(deadline - now) {
                Ok(chunk) => pending.extend_from_slice(&chunk),
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => {
                    disconnected = true;
                    break;
                }
            }
        }
        while pending.len() < MAX_EVENT_BYTES {
            match rx.try_recv() {
                Ok(chunk) => pending.extend_from_slice(&chunk),
                Err(_) => break,
            }
        }
        scrollback.lock().unwrap().push(&pending);
        sink(SessionEvent::Data(std::mem::take(&mut pending)));
        last_emit = Instant::now();
        if disconnected {
            break;
        }
    }
}

/// Byte ring holding the most recent output.
#[derive(Default)]
struct Scrollback {
    buf: VecDeque<u8>,
    truncated: bool,
}

impl Scrollback {
    fn push(&mut self, data: &[u8]) {
        if data.len() >= SCROLLBACK_BYTES {
            self.buf.clear();
            self.buf.extend(&data[data.len() - SCROLLBACK_BYTES..]);
            self.truncated = true;
            return;
        }
        let overflow = (self.buf.len() + data.len()).saturating_sub(SCROLLBACK_BYTES);
        if overflow > 0 {
            self.buf.drain(..overflow);
            self.truncated = true;
        }
        self.buf.extend(data);
    }

    fn contents(&self) -> Vec<u8> {
        let (a, b) = self.buf.as_slices();
        let mut out = Vec::with_capacity(a.len() + b.len());
        out.extend_from_slice(a);
        out.extend_from_slice(b);
        if self.truncated {
            // Start on a line boundary so the repaint doesn't begin mid escape sequence.
            if let Some(nl) = out.iter().take(8 * 1024).position(|b| *b == b'\n') {
                out.drain(..=nl);
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scrollback_keeps_tail() {
        let mut s = Scrollback::default();
        s.push(b"hello\n");
        assert_eq!(s.contents(), b"hello\n");
        let big = vec![b'x'; SCROLLBACK_BYTES];
        s.push(&big);
        s.push(b"\ntail");
        let c = s.contents();
        assert!(c.len() <= SCROLLBACK_BYTES);
        assert!(c.ends_with(b"tail"));
    }

    /// Opens a real shell. Run with `cargo test -- --ignored terminal`.
    #[test]
    #[ignore]
    #[cfg(unix)]
    fn terminal_echo_resize_close() {
        let output = Arc::new(Mutex::new(Vec::<u8>::new()));
        let exited = Arc::new(Mutex::new(None::<Option<i32>>));
        let sink: EventSink = {
            let output = output.clone();
            let exited = exited.clone();
            Arc::new(move |ev| match ev {
                SessionEvent::Data(d) => output.lock().unwrap().extend(d),
                SessionEvent::Exit(code) => *exited.lock().unwrap() = Some(code),
            })
        };
        let home = dirs::home_dir().unwrap();
        let session = Session::spawn(
            SpawnOptions {
                cwd: home,
                cols: 80,
                rows: 24,
                remove_env: Vec::new(),
            },
            sink,
        )
        .expect("spawn");
        let pid = session.pid().expect("pid") as libc::pid_t;
        eprintln!("shell = {}, pid = {pid}", session.shell);

        session.write(b"echo hello-$((1+1))\n").unwrap();
        let wait_for = |pred: &dyn Fn() -> bool, secs: u64| {
            let deadline = Instant::now() + Duration::from_secs(secs);
            while Instant::now() < deadline {
                if pred() {
                    return true;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            false
        };
        let saw = wait_for(
            &|| String::from_utf8_lossy(&output.lock().unwrap()).contains("hello-2"),
            20,
        );
        assert!(
            saw,
            "did not see hello-2 in output: {:?}",
            String::from_utf8_lossy(&output.lock().unwrap())
        );
        // The typed command echoes as `hello-$((1+1))`; `hello-2` only appears as real output.
        assert!(String::from_utf8_lossy(&session.snapshot()).contains("hello-2"));

        session.resize(120, 40).unwrap();
        session.write(b"stty size\n").unwrap();
        assert!(
            wait_for(
                &|| String::from_utf8_lossy(&output.lock().unwrap()).contains("40 120"),
                10
            ),
            "resize not visible to the shell"
        );

        // A foreground job in its own process group must die too.
        session.write(b"sleep 7391\n").unwrap();
        let sleep_pids = || {
            std::process::Command::new("pgrep")
                .args(["-f", "^sleep 7391$"])
                .output()
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                .unwrap_or_default()
        };
        assert!(
            wait_for(&|| !sleep_pids().is_empty(), 5),
            "foreground job did not start"
        );

        session.kill();
        let gone = wait_for(&|| unsafe { libc::kill(pid, 0) } != 0, 5);
        assert!(gone, "shell process {pid} still exists after close");
        assert!(wait_for(&|| exited.lock().unwrap().is_some(), 5), "no exit event");
        assert!(!session.is_alive());
        // The foreground job is in its own process group and may need the SIGKILL escalation.
        wait_for(&|| sleep_pids().is_empty(), 3);
        let sleep_left = sleep_pids();
        eprintln!("exit = {:?}, leftover sleep pids = {sleep_left:?}", exited.lock().unwrap());
        assert!(sleep_left.is_empty(), "foreground job survived: {sleep_left}");
    }
}
