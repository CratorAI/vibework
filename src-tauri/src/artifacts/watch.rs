//! File change notifications for open artifacts.
//!
//! Each watch observes the file's parent directory non-recursively (so atomic
//! "write temp + rename" saves are seen) and filters events by file name.
//! Events are debounced: after the first event, we wait until 150 ms pass with
//! no further events, then emit `artifact:changed` once to the owning webview.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use notify::{RecursiveMode, Watcher};
use once_cell::sync::Lazy;
use serde::Serialize;
use tauri::{AppHandle, Emitter, EventTarget, Runtime};
use tokio::sync::mpsc;

use super::commands::modified_ms;
use super::{ArtifactError, CHANGED_EVENT, MAX_WATCHES};

pub const DEBOUNCE: Duration = Duration::from_millis(150);

/// Payload of the `artifact:changed` event.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedPayload {
    pub watch_id: String,
    /// Canonical path of the watched file.
    pub path: String,
    /// New modification time (ms since epoch), or null if the file was deleted.
    pub modified_ms: Option<u64>,
}

struct Entry {
    session_id: String,
    owner_webview: String,
    owner_window: String,
    // Dropping the watcher stops the OS watch and closes the event channel,
    // which ends the debounce task; the task is also aborted explicitly.
    _watcher: notify::RecommendedWatcher,
    task: tauri::async_runtime::JoinHandle<()>,
}

static WATCHES: Lazy<Mutex<HashMap<String, Entry>>> = Lazy::new(|| Mutex::new(HashMap::new()));

fn watches() -> std::sync::MutexGuard<'static, HashMap<String, Entry>> {
    WATCHES.lock().unwrap_or_else(|p| p.into_inner())
}

/// True if a notify event concerns `file_name` in the watched directory.
fn event_matches(event: &notify::Event, file_name: &std::ffi::OsStr) -> bool {
    use notify::EventKind;
    if matches!(event.kind, EventKind::Access(_)) {
        return false;
    }
    event
        .paths
        .iter()
        .any(|p| p.file_name() == Some(file_name))
}

pub fn add<R: Runtime>(
    app: AppHandle<R>,
    owner_webview: String,
    owner_window: String,
    path: PathBuf,
    session_id: String,
) -> Result<String, ArtifactError> {
    let (Some(dir), Some(file_name)) = (path.parent(), path.file_name()) else {
        return Err(ArtifactError::invalid_path("Cannot watch this path"));
    };
    let dir = dir.to_path_buf();
    let file_name = file_name.to_os_string();

    // Reserve the slot under the lock so concurrent calls cannot exceed the cap.
    let mut map = watches();
    if map.len() >= MAX_WATCHES {
        return Err(ArtifactError::new(
            "watch_limit",
            format!("At most {} artifacts can be watched at once", MAX_WATCHES),
        ));
    }

    let (watcher, rx) = start_watch(&dir, RecursiveMode::NonRecursive, move |event| event_matches(event, &file_name))?;

    let watch_id = uuid::Uuid::new_v4().to_string();
    let task = {
        let owner = owner_webview.clone();
        let watch_id = watch_id.clone();
        let path_str = path.to_string_lossy().into_owned();
        tauri::async_runtime::spawn(debounce_loop(path, rx, move |modified_ms| {
            let payload = ChangedPayload {
                watch_id: watch_id.clone(),
                path: path_str.clone(),
                modified_ms,
            };
            let _ = app.emit_to(EventTarget::labeled(owner.clone()), CHANGED_EVENT, payload);
        }))
    };
    map.insert(
        watch_id.clone(),
        Entry {
            session_id,
            owner_webview,
            owner_window,
            _watcher: watcher,
            task,
        },
    );
    Ok(watch_id)
}

/// Start an OS watch on `dir` that signals on events `wanted` accepts.
fn start_watch(
    dir: &Path,
    mode: RecursiveMode,
    wanted: impl Fn(&notify::Event) -> bool + Send + 'static,
) -> Result<(notify::RecommendedWatcher, mpsc::UnboundedReceiver<()>), ArtifactError> {
    let (tx, rx) = mpsc::unbounded_channel::<()>();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            if wanted(&event) {
                let _ = tx.send(());
            }
        }
    })
    .map_err(|e| ArtifactError::new("watch_failed", e.to_string()))?;
    watcher
        .watch(dir, mode)
        .map_err(|e| ArtifactError::new("watch_failed", e.to_string()))?;
    Ok((watcher, rx))
}

/// Folders whose churn is not worth refreshing a file tree for.
const QUIET_DIRS: &[&str] = &[".git", "node_modules", "target", "__pycache__", ".venv", "venv"];

/// True if a notify event changes what a tree of `root` would list: not an
/// access, and not inside a version-control or dependency folder.
fn tree_event_matters(event: &notify::Event, root: &Path) -> bool {
    if matches!(event.kind, notify::EventKind::Access(_)) {
        return false;
    }
    event.paths.iter().any(|p| {
        let rel = p.strip_prefix(root).unwrap_or(p);
        !rel.components().any(|c| QUIET_DIRS.iter().any(|q| c.as_os_str() == *q))
    })
}

/// Watch a whole working folder (recursively) for the Files tab. Emits
/// `artifact:changed { watchId, path: <folder>, modifiedMs: <now> }`, debounced,
/// whenever something in it is created, changed, renamed or deleted (outside
/// `.git`, `node_modules` and similar). Counts against the same limit as file
/// watches and is cleaned up the same way.
pub fn add_tree<R: Runtime>(
    app: AppHandle<R>,
    owner_webview: String,
    owner_window: String,
    root: PathBuf,
    session_id: String,
) -> Result<String, ArtifactError> {
    let mut map = watches();
    if map.len() >= MAX_WATCHES {
        return Err(ArtifactError::new(
            "watch_limit",
            format!("At most {} artifacts can be watched at once", MAX_WATCHES),
        ));
    }
    let filter_root = root.clone();
    let (watcher, rx) = start_watch(&root, RecursiveMode::Recursive, move |event| tree_event_matters(event, &filter_root))?;
    let watch_id = uuid::Uuid::new_v4().to_string();
    let task = {
        let owner = owner_webview.clone();
        let watch_id = watch_id.clone();
        let path_str = root.to_string_lossy().into_owned();
        tauri::async_runtime::spawn(debounce_loop(root, rx, move |_| {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .ok();
            let payload = ChangedPayload {
                watch_id: watch_id.clone(),
                path: path_str.clone(),
                modified_ms: now,
            };
            let _ = app.emit_to(EventTarget::labeled(owner.clone()), CHANGED_EVENT, payload);
        }))
    };
    map.insert(
        watch_id.clone(),
        Entry {
            session_id,
            owner_webview,
            owner_window,
            _watcher: watcher,
            task,
        },
    );
    Ok(watch_id)
}

/// Debounce raw signals: after a signal, wait until DEBOUNCE passes with no
/// further signal, then call `emit` once with the file's current mtime.
async fn debounce_loop<F: Fn(Option<u64>) + Send + 'static>(
    path: PathBuf,
    mut rx: mpsc::UnboundedReceiver<()>,
    emit: F,
) {
    while rx.recv().await.is_some() {
        loop {
            match tokio::time::timeout(DEBOUNCE, rx.recv()).await {
                Ok(Some(())) => continue,
                Ok(None) => return,
                Err(_) => break,
            }
        }
        emit(current_modified(&path));
    }
}

fn current_modified(path: &Path) -> Option<u64> {
    std::fs::metadata(path).ok().map(|m| modified_ms(&m))
}

fn drop_entries(entries: Vec<Entry>) {
    for e in entries {
        e.task.abort();
        drop(e._watcher);
    }
}

pub fn remove(watch_id: &str) {
    let removed = watches().remove(watch_id);
    drop_entries(removed.into_iter().collect());
}

fn remove_where(pred: impl Fn(&Entry) -> bool) {
    let removed: Vec<Entry> = {
        let mut map = watches();
        let ids: Vec<String> = map
            .iter()
            .filter(|(_, e)| pred(e))
            .map(|(id, _)| id.clone())
            .collect();
        ids.iter().filter_map(|id| map.remove(id)).collect()
    };
    drop_entries(removed);
}

/// Called when a webview starts loading a page (reload / navigation).
pub fn remove_owned_by_webview(label: &str) {
    remove_where(|e| e.owner_webview == label);
}

/// Called when a window is destroyed.
pub fn remove_owned_by_window(label: &str) {
    remove_where(|e| e.owner_window == label || e.owner_webview == label);
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{AccessKind, CreateKind, ModifyKind};
    use notify::{Event, EventKind};
    use std::sync::{Arc, Mutex as StdMutex};

    fn rt() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .unwrap()
    }

    #[test]
    fn debounce_coalesces_bursts() {
        rt().block_on(async {
            let (tx, rx) = mpsc::unbounded_channel();
            let hits = Arc::new(StdMutex::new(0u32));
            let h = hits.clone();
            let task = tokio::spawn(debounce_loop(PathBuf::from("/nonexistent"), rx, move |m| {
                assert_eq!(m, None);
                *h.lock().unwrap() += 1;
            }));
            // A burst of 6 signals 20 ms apart -> one emission.
            for _ in 0..6 {
                tx.send(()).unwrap();
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
            assert_eq!(*hits.lock().unwrap(), 0, "must wait for the quiet period");
            tokio::time::sleep(Duration::from_millis(300)).await;
            assert_eq!(*hits.lock().unwrap(), 1);
            // A later single signal -> a second emission.
            tx.send(()).unwrap();
            tokio::time::sleep(Duration::from_millis(300)).await;
            assert_eq!(*hits.lock().unwrap(), 2);
            // Closing the channel ends the loop.
            drop(tx);
            tokio::time::timeout(Duration::from_secs(1), task).await.unwrap().unwrap();
        });
    }

    #[test]
    fn real_file_change_is_reported() {
        let dir = std::env::temp_dir().join(format!("vw-watch-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("index.html"), "v1").unwrap();
        let file = dir.join("index.html").canonicalize().unwrap();
        rt().block_on(async {
            let name = file.file_name().unwrap().to_os_string();
            let (watcher, rx) =
                start_watch(file.parent().unwrap(), RecursiveMode::NonRecursive, move |e| event_matches(e, &name))
                    .unwrap();
            let seen = Arc::new(StdMutex::new(Vec::new()));
            let s = seen.clone();
            tokio::spawn(debounce_loop(file.clone(), rx, move |m| s.lock().unwrap().push(m)));
            tokio::time::sleep(Duration::from_millis(500)).await;
            seen.lock().unwrap().clear();
            // Unrelated sibling: must not trigger.
            std::fs::write(dir.join("other.txt"), "x").unwrap();
            tokio::time::sleep(Duration::from_millis(600)).await;
            assert!(seen.lock().unwrap().is_empty(), "sibling change leaked");
            // Atomic save (write temp + rename over the file), then a plain write.
            std::fs::write(dir.join(".tmp-save"), "v2").unwrap();
            std::fs::rename(dir.join(".tmp-save"), &file).unwrap();
            std::fs::write(&file, "v3").unwrap();
            let deadline = std::time::Instant::now() + Duration::from_secs(5);
            while seen.lock().unwrap().is_empty() && std::time::Instant::now() < deadline {
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
            let got = seen.lock().unwrap().clone();
            assert!(!got.is_empty(), "no change event within 5s");
            assert!(got.last().unwrap().is_some());
            drop(watcher);
        });
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn tree_ignores_dependency_folders() {
        let root = Path::new("/w");
        let ev = |kind, p: &str| Event::new(kind).add_path(PathBuf::from(p));
        assert!(tree_event_matters(&ev(EventKind::Create(CreateKind::File), "/w/sub/a.md"), root));
        assert!(!tree_event_matters(&ev(EventKind::Create(CreateKind::File), "/w/node_modules/x/y.js"), root));
        assert!(!tree_event_matters(&ev(EventKind::Modify(ModifyKind::Any), "/w/.git/index"), root));
        assert!(!tree_event_matters(&ev(EventKind::Access(AccessKind::Any), "/w/a.md"), root));
    }

    #[test]
    fn matches_by_file_name_and_ignores_access() {
        let name = std::ffi::OsStr::new("index.html");
        let ev = |kind, p: &str| Event::new(kind).add_path(PathBuf::from(p));
        assert!(event_matches(
            &ev(EventKind::Modify(ModifyKind::Any), "/private/tmp/w/index.html"),
            name
        ));
        assert!(event_matches(
            &ev(EventKind::Create(CreateKind::File), "/tmp/w/index.html"),
            name
        ));
        assert!(!event_matches(
            &ev(EventKind::Modify(ModifyKind::Any), "/tmp/w/other.html"),
            name
        ));
        assert!(!event_matches(
            &ev(EventKind::Access(AccessKind::Any), "/tmp/w/index.html"),
            name
        ));
    }
}

pub fn remove_owned_by_session(id: &str) {
    remove_where(|e| e.session_id == id);
}
