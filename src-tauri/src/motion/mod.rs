//! Motion is a scoped HyperFrames project, not a Vibework animation format.
use once_cell::sync::Lazy;
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::Webview;
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::Command,
};
const VERSION: &str = "0.9.41";
#[derive(Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub installed: bool,
    pub ffmpeg: bool,
    pub browser: bool,
    pub skills: bool,
    pub running: bool,
    pub busy: bool,
    pub job: String,
    pub url: Option<String>,
    pub lines: Vec<String>,
    pub error: Option<String>,
    pub outputs: Vec<String>,
}
#[derive(Default)]
struct Project {
    session: String,
    owners: HashSet<String>,
    preview: Option<u32>,
    job_pid: Option<u32>,
    status: Status,
}
static PROJECTS: Lazy<Mutex<HashMap<PathBuf, Arc<Mutex<Project>>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static OPERATIONS: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static INSTALL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
fn cache() -> PathBuf {
    crate::runtimes::runtimes_dir().join(format!("hyperframes-{VERSION}"))
}
fn cli() -> PathBuf {
    cache().join("node_modules/hyperframes/bin/hyperframes.mjs")
}
pub fn is_project(path: &Path) -> bool {
    let marker = path.join("hyperframes.json");
    let Ok(root) = path.canonicalize() else {
        return false;
    };
    path.is_dir()
        && ["index.html", "hyperframes.json"].iter().all(|name| {
            path.join(name)
                .canonicalize()
                .is_ok_and(|p| p.starts_with(&root))
        })
        && path.join("index.html").is_file()
        && std::fs::metadata(&marker).is_ok_and(|m| m.len() < 1024 * 1024)
        && std::fs::read(&marker)
            .ok()
            .and_then(|v| serde_json::from_slice::<serde_json::Value>(&v).ok())
            .is_some_and(|v| v.is_object())
}
pub fn project_ancestor(path: &Path, root: &Path) -> Option<PathBuf> {
    let root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    path.ancestors()
        .take_while(|p| p.starts_with(&root))
        .find(|p| is_project(p))
        .map(Path::to_path_buf)
}
pub fn project_stamp(path: &Path) -> u64 {
    walkdir::WalkDir::new(path)
        .max_depth(8)
        .into_iter()
        .filter_entry(|e| {
            e.depth() == 0
                || !matches!(
                    e.file_name().to_str(),
                    Some("node_modules" | ".git" | ".hyperframes" | ".thumbnails" | "output")
                )
        })
        .filter_map(Result::ok)
        .take(2000)
        .filter_map(|e| e.metadata().ok())
        .filter_map(|m| m.modified().ok())
        .filter_map(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|t| t.as_millis() as u64)
        .max()
        .unwrap_or(0)
}
fn executable(path: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        path.metadata()
            .is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
    }
    #[cfg(not(unix))]
    {
        path.is_file()
    }
}
fn find_in_path(name: &str, path: &str) -> Option<PathBuf> {
    std::env::split_paths(path)
        .map(|p| p.join(name))
        .find(|p| executable(p))
}
async fn search_path() -> String {
    #[cfg(any(debug_assertions, feature = "dev-release-probe"))]
    if let Ok(path) = std::env::var("VIBEWORK_DEV_MOTION_PATH") {
        return path;
    }
    crate::engine::login_path::login_shell_path()
        .await
        .unwrap_or_default()
}
fn browser_path() -> Option<PathBuf> {
    #[cfg(any(debug_assertions, feature = "dev-release-probe"))]
    if let Some(path) = std::env::var_os("VIBEWORK_DEV_MOTION_BROWSER") {
        return Some(PathBuf::from(path)).filter(|p| executable(p));
    }

    if let Some(p) = std::env::var_os("HYPERFRAMES_BROWSER_PATH")
        .map(PathBuf::from)
        .filter(|p| executable(p))
    {
        return Some(p);
    }
    let installed = PathBuf::from("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
    if executable(&installed) {
        return Some(installed);
    }
    // Only the app's cache. Never initiate a download here.
    walkdir::WalkDir::new(cache().join("browser"))
        .max_depth(7)
        .into_iter()
        .filter_map(Result::ok)
        .find(|e| e.file_name() == "chrome-headless-shell" && executable(e.path()))
        .map(|e| e.into_path())
}
fn has_skills() -> bool {
    dirs::home_dir().is_some_and(|h| {
        [
            ".claude/skills/hyperframes/SKILL.md",
            ".agents/skills/hyperframes/SKILL.md",
        ]
        .iter()
        .any(|p| h.join(p).is_file())
    })
}
async fn scoped(session: &str, path: &str) -> Result<PathBuf, String> {
    let roots = crate::artifacts::paths::roots_for_session(session)
        .await
        .map_err(|e| e.to_string())?;
    present_project(&roots, path)
}
pub fn present_project(
    roots: &crate::artifacts::paths::Roots,
    path: &str,
) -> Result<PathBuf, String> {
    let path = roots.resolve(path).map_err(|e| e.to_string())?;
    if !is_project(&path) {
        return Err("This folder needs hyperframes.json and index.html to open as Motion.".into());
    }
    Ok(path)
}
fn launch_files() -> Result<PathBuf, String> {
    let dir = cache().join("launcher");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    for (name, body) in [
        ("guard.mjs", include_str!("guard.mjs")),
        ("runner.mjs", include_str!("runner.mjs")),
        ("supervisor.mjs", include_str!("supervisor.mjs")),
    ] {
        let destination = dir.join(name);
        if std::fs::read_to_string(&destination).ok().as_deref() != Some(body) {
            let temporary = dir.join(format!(".{name}.{}.tmp", uuid::Uuid::new_v4()));
            std::fs::write(&temporary, body).map_err(|e| e.to_string())?;
            std::fs::rename(temporary, destination).map_err(|e| e.to_string())?;
        }
    }
    Ok(dir)
}
async fn command(project: &Path, args: &[String], package: bool) -> Result<Command, String> {
    let launcher = launch_files()?;
    let engine = crate::engine::sidecar::binary_path()?;
    let mut cmd = Command::new(engine);
    cmd.arg(launcher.join("supervisor.mjs"))
        .arg(std::process::id().to_string());
    if package {
        cmd.args(args);
    } else {
        cmd.arg(launcher.join("runner.mjs")).arg(cli()).args(args);
    }
    let path = search_path().await;
    cmd.current_dir(project)
        .env("BUN_BE_BUN", "1")
        .env("PATH", &path)
        .env("HYPERFRAMES_NO_TELEMETRY", "1")
        .env("HYPERFRAMES_SKIP_SKILLS", "1")
        .env("HYPERFRAMES_CONFIG_DIR", cache().join("config"))
        .env("HYPERFRAMES_CACHE_DIR", cache().join("browser"))
        .env("BUN_INSTALL_CACHE_DIR", cache().join("packages"))
        .env("CI", "1")
        .env("NO_COLOR", "1")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    cmd.env_remove("HYPERFRAMES_BROWSER_PATH");
    if let Some(p) = browser_path() {
        cmd.env("HYPERFRAMES_BROWSER_PATH", p);
    }
    cmd.env_remove("HYPERFRAMES_FFMPEG_PATH");
    if let Some(p) = find_in_path("ffmpeg", &path) {
        cmd.env("HYPERFRAMES_FFMPEG_PATH", p);
    }
    Ok(cmd)
}
fn signal(pid: u32) {
    #[cfg(unix)]
    unsafe {
        libc::kill(pid as i32, libc::SIGTERM);
    }
}
fn stop(p: &mut Project) {
    if let Some(pid) = p.preview.take() {
        signal(pid)
    }
    if let Some(pid) = p.job_pid.take() {
        signal(pid)
    }
    p.status.running = false;
    p.status.busy = false;
    p.status.url = None;
}
pub fn shutdown_all() {
    for p in PROJECTS.lock().unwrap().values() {
        stop(&mut p.lock().unwrap())
    }
}
fn release(p: &mut Project, session: &str) {
    if p.owners.remove(session) && p.owners.is_empty() {
        if let Some(pid) = p.preview.take() {
            signal(pid);
        }
        p.status.running = false;
        p.status.url = None;
        if p.status.job == "preview" {
            p.status.busy = false;
        }
    }
    if p.session == session {
        if let Some(pid) = p.job_pid.take() {
            signal(pid);
        }
        if p.status.job != "preview" {
            p.status.busy = false;
        }
    }
}
pub fn close_session(session: &str) {
    for p in PROJECTS.lock().unwrap().values() {
        release(&mut p.lock().unwrap(), session);
    }
}

async fn run(
    project: PathBuf,
    p: Arc<Mutex<Project>>,
    args: Vec<String>,
    job: &str,
    package: bool,
) -> Result<(), String> {
    let preview = job == "preview";
    {
        let mut state = p.lock().unwrap();
        if (preview && state.preview.is_some()) || (!preview && state.job_pid.is_some()) {
            return Ok(());
        }
        state.status.error = None;
        state.status.lines.clear();
        state.status.job = job.into();
        state.status.busy = true;
    }
    let spawned = async {
        let mut cmd = command(&project, &args, package).await?;
        cmd.spawn().map_err(|e| e.to_string())
    }
    .await;
    let mut child = match spawned {
        Ok(child) => child,
        Err(error) => {
            let mut state = p.lock().unwrap();
            state.status.busy = false;
            state.status.error = Some(error.clone());
            return Err(error);
        }
    };
    let pid = child.id().ok_or("Could not start HyperFrames")?;
    {
        let mut s = p.lock().unwrap();
        if preview {
            s.preview = Some(pid)
        } else {
            s.job_pid = Some(pid)
        }
    }
    let out = child.stdout.take().unwrap();
    let err = child.stderr.take().unwrap();
    fn reader<R: tokio::io::AsyncRead + Unpin + Send + 'static>(
        r: R,
        p: Arc<Mutex<Project>>,
        preview: bool,
        pid: u32,
    ) {
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(r).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let mut s = p.lock().unwrap();
                if s.preview != Some(pid) && s.job_pid != Some(pid) {
                    break;
                }
                if preview {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) {
                        if let Some(port) = v["motionPort"].as_u64() {
                            s.status.url = Some(format!("http://127.0.0.1:{port}"));
                            s.status.running = true;
                            s.status.busy = false;
                        }
                    }
                }
                if s.status.lines.len() >= 30 {
                    s.status.lines.remove(0);
                }
                s.status.lines.push(line.chars().take(1000).collect());
            }
        });
    }
    reader(out, p.clone(), preview, pid);
    reader(err, p.clone(), preview, pid);
    if preview {
        let pending = p.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(120)).await;
            let mut s = pending.lock().unwrap();
            if s.preview == Some(pid) && s.status.url.is_none() {
                signal(pid);
                s.preview = None;
                s.status.busy = false;
                s.status.error = Some(
                    "Studio did not start within two minutes. Check the tool output and retry."
                        .into(),
                )
            }
        });
    }

    tauri::async_runtime::spawn(async move {
        let result = child.wait().await;
        let mut s = p.lock().unwrap();
        if preview && s.preview == Some(pid) {
            s.preview = None;
            s.status.running = false;
            s.status.url = None;
            s.status.busy = false;
        } else if !preview && s.job_pid == Some(pid) {
            s.job_pid = None;
            s.status.busy = false;
        } else {
            return;
        }
        if !result.is_ok_and(|v| v.success()) {
            s.status.error =
                Some("HyperFrames stopped. The last lines below explain what happened.".into())
        }
    });
    Ok(())
}
#[tauri::command]
pub fn motion_close_session(webview: Webview, session_id: String) -> Result<(), String> {
    crate::artifacts::ensure_main(webview.label()).map_err(|e| e.to_string())?;
    close_session(&session_id);
    Ok(())
}
#[tauri::command]
pub async fn motion_action(
    webview: Webview,
    session_id: String,
    path: String,
    action: String,
    quality: Option<String>,
) -> Result<Status, String> {
    crate::artifacts::ensure_main(webview.label()).map_err(|e| e.to_string())?;
    if matches!(action.as_str(), "stop" | "release") {
        let key = PathBuf::from(&path)
            .canonicalize()
            .unwrap_or_else(|_| PathBuf::from(&path));
        if let Some(p) = PROJECTS.lock().unwrap().get(&key) {
            let mut p = p.lock().unwrap();
            if p.owners.contains(&session_id) || p.session == session_id {
                if action == "release" {
                    release(&mut p, &session_id);
                } else {
                    stop(&mut p);
                }
                return Ok(p.status.clone());
            }
        }
        return Ok(Status::default());
    }
    let project = scoped(&session_id, &path).await?;
    if matches!(action.as_str(), "start" | "render") {
        if browser_path().is_none() || find_in_path("ffmpeg", &search_path().await).is_none() {
            return Err("Set up Chrome and FFmpeg before starting Motion.".into());
        }
    }
    let p = PROJECTS
        .lock()
        .unwrap()
        .entry(project.clone())
        .or_insert_with(|| {
            Arc::new(Mutex::new(Project {
                session: session_id.clone(),
                ..Default::default()
            }))
        })
        .clone();
    let _operation = OPERATIONS.lock().await;
    if matches!(action.as_str(), "install" | "browser" | "render") {
        let mut state = p.lock().unwrap();
        if state.job_pid.is_none() {
            state.session = session_id.clone();
        }
    }
    match action.as_str() {
        "status" => {}
        "attach" => {
            p.lock().unwrap().owners.insert(session_id.clone());
        }
        "stop" => stop(&mut p.lock().unwrap()),
        "cancel" => {
            let mut s = p.lock().unwrap();
            if let Some(pid) = s.job_pid.take() {
                signal(pid)
            }
            s.status.busy = false;
        }
        "install" => {
            let _lock = INSTALL.lock().await;
            if PROJECTS.lock().unwrap().values().any(|p| {
                let p = p.lock().unwrap();
                p.status.busy && p.status.job == "install"
            }) {
                return Err("HyperFrames is already downloading in another Motion tab.".into());
            }
            if !cli().is_file() {
                std::fs::create_dir_all(cache()).map_err(|e| e.to_string())?;
                std::fs::write(
                    cache().join("package.json"),
                    format!(
                        "{{\"private\":true,\"dependencies\":{{\"hyperframes\":\"{VERSION}\"}}}}"
                    ),
                )
                .map_err(|e| e.to_string())?;
                run(
                    cache(),
                    p.clone(),
                    vec!["install".into(), "--ignore-scripts".into()],
                    "install",
                    true,
                )
                .await?;
            }
        }
        "browser" => {
            if !cli().is_file() {
                return Err("Download HyperFrames first.".into());
            }
            run(
                project.clone(),
                p.clone(),
                vec!["browser".into(), "ensure".into()],
                "browser",
                false,
            )
            .await?;
        }
        "start" => {
            p.lock().unwrap().owners.insert(session_id.clone());
            if !cli().is_file() {
                return Err("Download HyperFrames first.".into());
            }
            let pin = project.join(".vibework-hyperframes.json");
            if pin.exists() {
                let v: serde_json::Value =
                    serde_json::from_slice(&std::fs::read(&pin).map_err(|e| e.to_string())?)
                        .map_err(|e| e.to_string())?;
                if v["version"] != VERSION {
                    return Err("This project pins another HyperFrames version. Use that version outside Vibework or update its pin deliberately.".into());
                }
            } else {
                std::fs::write(pin, format!("{{\"version\":\"{VERSION}\"}}\n"))
                    .map_err(|e| e.to_string())?;
            }
            run(
                project.clone(),
                p.clone(),
                vec![
                    "preview".into(),
                    project.to_string_lossy().into(),
                    "--foreground".into(),
                    "--no-open".into(),
                    "--json".into(),
                ],
                "preview",
                false,
            )
            .await?;
        }
        "render" => {
            let quality = quality.unwrap_or("draft".into());
            if !["draft", "looks", "delivery"].contains(&quality.as_str()) {
                return Err("Unknown render quality".into());
            }
            let output = project.join("output");
            std::fs::create_dir_all(&output).map_err(|e| e.to_string())?;
            let output = output.canonicalize().map_err(|e| e.to_string())?;
            if !output.starts_with(&project) {
                return Err("The output folder must be inside the project.".into());
            }
            let file = output.join(format!(
                "motion-{}.mp4",
                chrono::Utc::now().format("%Y%m%d-%H%M%S")
            ));
            run(
                project.clone(),
                p.clone(),
                vec![
                    "render".into(),
                    project.to_string_lossy().into(),
                    "--quality".into(),
                    quality,
                    "--output".into(),
                    file.to_string_lossy().into(),
                ],
                "render",
                false,
            )
            .await?;
        }
        _ => return Err("Unknown Motion action".into()),
    }
    let path = search_path().await;
    let mut s = p.lock().unwrap().status.clone();
    s.installed = cli().is_file();
    s.ffmpeg = find_in_path("ffmpeg", &path).is_some();
    s.browser = browser_path().is_some();
    s.skills = has_skills();
    s.outputs = std::fs::read_dir(project.join("output"))
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| {
            p.extension().is_some_and(|v| v == "mp4")
                && p.canonicalize().is_ok_and(|p| p.starts_with(&project))
        })
        .map(|p| p.to_string_lossy().into())
        .collect();
    s.outputs.sort();
    // Stop/release return immediately, including if the folder was deleted.
    // Retain the last observed setup metadata so Stop cannot flash first-use UI.
    {
        let mut state = p.lock().unwrap();
        state.status.installed = s.installed;
        state.status.ffmpeg = s.ffmpeg;
        state.status.browser = s.browser;
        state.status.skills = s.skills;
        state.status.outputs = s.outputs.clone();
    }
    Ok(s)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn detection_requires_object_and_entry() {
        let d = tempfile::tempdir().unwrap();
        assert!(!is_project(d.path()));
        std::fs::write(d.path().join("hyperframes.json"), "{}").unwrap();
        assert!(!is_project(d.path()));
        std::fs::write(d.path().join("index.html"), "<!doctype html>").unwrap();
        assert!(is_project(d.path()));
        std::fs::write(d.path().join("hyperframes.json"), "[]").unwrap();
        assert!(!is_project(d.path()));
    }
    #[test]
    fn present_folder_stays_in_task_and_gallery_collapses_descendants() {
        let task = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        for path in [task.path().join("piece"), other.path().join("piece")] {
            std::fs::create_dir(&path).unwrap();
            std::fs::write(path.join("hyperframes.json"), "{}").unwrap();
            std::fs::write(path.join("index.html"), "<!doctype html>").unwrap();
        }
        let roots = crate::artifacts::paths::Roots::new(task.path(), &[]).unwrap();
        let project = present_project(&roots, "piece").unwrap();
        assert_eq!(
            project_ancestor(&project.join("index.html"), task.path()),
            Some(project)
        );
        assert!(present_project(&roots, ".").is_err());
        assert!(present_project(&roots, "piece/index.html").is_err());
        assert!(present_project(&roots, other.path().join("piece").to_str().unwrap()).is_err());
    }
    #[cfg(unix)]
    #[test]
    fn detection_rejects_external_entry_symlink() {
        let task = tempfile::tempdir().unwrap();
        let outside = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(task.path().join("hyperframes.json"), "{}").unwrap();
        std::os::unix::fs::symlink(outside.path(), task.path().join("index.html")).unwrap();
        assert!(!is_project(task.path()));
    }
    #[test]
    fn shared_project_preview_lives_until_last_task_releases_it() {
        let mut project = Project::default();
        project.owners.extend(["first".into(), "second".into()]);
        project.status.running = true;
        project.status.url = Some("http://127.0.0.1:1234".into());
        release(&mut project, "first");
        assert!(project.status.running);
        release(&mut project, "unrelated");
        assert!(project.status.running);
        release(&mut project, "second");
        assert!(!project.status.running);
        assert!(project.status.url.is_none());
    }
    #[test]
    fn fake_path_requires_executable() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("ffmpeg");
        std::fs::write(&p, "").unwrap();
        assert!(find_in_path("ffmpeg", d.path().to_str().unwrap()).is_none());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(p, std::fs::Permissions::from_mode(0o755)).unwrap();
            assert!(find_in_path("ffmpeg", d.path().to_str().unwrap()).is_some());
        }
    }
}

/// A lazy, local CLI snapshot. No server is left running by a gallery card.
#[tauri::command]
pub async fn motion_thumbnail(
    webview: Webview,
    session_id: String,
    path: String,
) -> Result<String, String> {
    use base64::Engine;
    use sha2::{Digest, Sha256};
    crate::artifacts::ensure_main(webview.label()).map_err(|e| e.to_string())?;
    let project = scoped(&session_id, &path).await?;
    if !cli().is_file()
        || browser_path().is_none()
        || find_in_path("ffmpeg", &search_path().await).is_none()
    {
        return Err("Motion prerequisites are missing".into());
    }
    let mut hash = Sha256::new();
    hash.update(project.to_string_lossy().as_bytes());
    hash.update(project_stamp(&project).to_le_bytes());
    for file in [
        "index.html",
        "hyperframes.json",
        ".hyperframes/studio/manual-edits.json",
        ".hyperframes/studio/motion.json",
    ] {
        if let Ok(bytes) = std::fs::read(project.join(file)) {
            hash.update(bytes)
        }
    }
    let dir = cache()
        .join("thumbnails")
        .join(format!("{:x}", hash.finalize()));
    let cached = dir.join("preview.png");
    if !cached.exists() {
        let _lock = INSTALL.lock().await;
        if !cached.exists() {
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let p = PROJECTS
                .lock()
                .unwrap()
                .entry(project.clone())
                .or_insert_with(|| {
                    Arc::new(Mutex::new(Project {
                        session: session_id.clone(),
                        ..Default::default()
                    }))
                })
                .clone();
            if p.lock().unwrap().job_pid.is_some() {
                return Err("Motion is busy".into());
            }
            p.lock().unwrap().session = session_id;
            // The CLI's own snapshot route seeks and renders the framework's native animation.
            let html = std::fs::read_to_string(project.join("index.html")).unwrap_or_default();
            let duration = html
                .split("data-duration=")
                .nth(1)
                .and_then(|v| {
                    let quote = v.chars().next()?;
                    v[1..].split(quote).next()?.parse::<f64>().ok()
                })
                .filter(|n| n.is_finite() && *n > 0.0)
                .unwrap_or(3.0);
            run(
                project.clone(),
                p.clone(),
                vec![
                    "snapshot".into(),
                    project.to_string_lossy().into(),
                    "--at".into(),
                    (duration / 3.0).to_string(),
                    "--no-end".into(),
                    "--output".into(),
                    dir.join("frames").to_string_lossy().into(),
                ],
                "snapshot",
                false,
            )
            .await?;
            for _ in 0..240 {
                if p.lock().unwrap().job_pid.is_none() {
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            }
            if p.lock().unwrap().job_pid.is_some() {
                let mut s = p.lock().unwrap();
                if let Some(pid) = s.job_pid.take() {
                    signal(pid)
                }
                s.status.busy = false;
                return Err("Snapshot timed out".into());
            }
            let frame = walkdir::WalkDir::new(dir.join("frames"))
                .into_iter()
                .filter_map(Result::ok)
                .find(|e| {
                    e.path().extension().is_some_and(|x| x == "png")
                        && !e.file_name().to_string_lossy().contains("contact")
                })
                .ok_or("No snapshot produced")?;
            let img = image::open(frame.path())
                .map_err(|e| e.to_string())?
                .thumbnail(640, 400);
            img.save(&cached).map_err(|e| e.to_string())?;
            let _ = std::fs::remove_dir_all(dir.join("frames"));
        }
    }
    Ok(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD
            .encode(std::fs::read(cached).map_err(|e| e.to_string())?)
    ))
}
