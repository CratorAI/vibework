//! Signed updates. Configuration is embedded at build time, never read from the environment.
use serde::Serialize;
use std::sync::Mutex;
use tauri::{Manager, Emitter};
use tauri_plugin_updater::{UpdaterExt, Update};

pub(crate) static TASK_GATE: tokio::sync::RwLock<()> = tokio::sync::RwLock::const_new(());
static INSTALLING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
#[derive(Default)]
pub(crate) struct Updates {
    pending: Mutex<Option<(Update, Vec<u8>)>>,
    checking: tokio::sync::Mutex<()>,
    status: Mutex<Option<Status>>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Status {
    current_version: String,
    version: Option<String>,
    notes: Option<String>,
    ready: bool,
    message: String,
}
pub(crate) fn accepting_tasks() -> Result<(), String> {
    if INSTALLING.load(std::sync::atomic::Ordering::SeqCst) { Err("An update is installing. Restart Vibework before starting a task.".into()) } else { Ok(()) }
}
#[tauri::command]
pub(crate) fn update_status(app: tauri::AppHandle) -> Status {
    app.state::<Updates>().status.lock().unwrap().clone().unwrap_or(Status {
        current_version: app.package_info().version.to_string(), version: None, notes: None, ready: false,
        message: if configured(&app) { "Updates have not been checked yet." } else { "Updates are not configured until the owner supplies the updater public key." }.into(),
    })
}
fn configured(app: &tauri::AppHandle) -> bool {
    app.config().plugins.0.get("updater").and_then(|v|v.get("pubkey")).and_then(|v|v.as_str()).is_some_and(|s| !s.is_empty() && !s.starts_with("REPLACE_"))
}
#[tauri::command]
pub(crate) async fn update_check(app: tauri::AppHandle) -> Result<Status, String> {
    let state = app.state::<Updates>();
    let _check = state.checking.lock().await;
    if state.pending.lock().unwrap().is_some() { return Ok(update_status(app.clone())); }
    if !configured(&app) { return Err("Updates are not configured: the updater public key is missing.".into()); }
    let updater = app.updater().map_err(|_| "Could not initialize updates.")?;
    let result = updater.check().await.map_err(|_| "Could not check for updates. Check your connection and try again.")?;
    let mut status = Status { current_version: app.package_info().version.to_string(), version: None, notes: None, ready: false, message: "You have the latest version.".into() };
    if let Some(update) = result {
        status.version = Some(update.version.clone()); status.notes = update.body.clone();
        status.message = "Downloading update in the background…".into();
        *state.status.lock().unwrap() = Some(status.clone());
        let _ = app.emit("update-status", &status);
        let bytes = update.download(|_,_| {}, || {}).await.map_err(|_| "Could not download or verify the update. Try again.")?;
        *state.pending.lock().unwrap() = Some((update, bytes));
        status.ready = true; status.message = "Ready to install when you quit, or restart to update. Running tasks defer installation.".into();
    }
    *state.status.lock().unwrap() = Some(status.clone());
    let _ = app.emit("update-status", &status);
    Ok(status)
}
pub(crate) fn launch(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        if !configured(&app) { return; }
        let path = crate::paths::get_app_data_dir().join("update-last-check");
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
        let last = std::fs::read_to_string(&path).ok().and_then(|s|s.parse::<u64>().ok()).unwrap_or(0);
        if now.saturating_sub(last) < 86400 { return; }
        if std::fs::write(path, now.to_string()).is_err() { return; }
        if let Err(message) = update_check(app.clone()).await {
            let mut status = update_status(app.clone()); status.message = message;
            *app.state::<Updates>().status.lock().unwrap() = Some(status);
        }
    });
}
fn may_install(running: usize) -> Result<(), String> {
    if running > 0 { Err("A task is running. Finish or stop it before installing the update.".into()) } else { Ok(()) }
}
#[tauri::command]
pub(crate) async fn update_install(app: tauri::AppHandle, restart: bool) -> Result<(), String> {
    let _gate = TASK_GATE.write().await;
    may_install(crate::engine::commands::agent_list_running().len())?;
    let pending = app.state::<Updates>().pending.lock().unwrap().take();
    let Some((update, bytes)) = pending else { return Err("No downloaded update is ready.".into()); };
    INSTALLING.store(true, std::sync::atomic::Ordering::SeqCst);
    if update.install(&bytes).is_err() {
        INSTALLING.store(false, std::sync::atomic::Ordering::SeqCst);
        return Err("Could not install the update. Download it again or install from Releases.".into());
    }
    if restart { app.restart(); } else { app.exit(0); }
    Ok(())
}
pub(crate) fn on_quit(app: &tauri::AppHandle, api: &tauri::ExitRequestApi) {
    if INSTALLING.load(std::sync::atomic::Ordering::SeqCst) { return; }
    if app.state::<Updates>().pending.lock().unwrap().is_none() { return; }
    api.prevent_exit();
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(message) = update_install(app.clone(), false).await {
            let mut status = update_status(app.clone()); status.message = message;
            *app.state::<Updates>().status.lock().unwrap() = Some(status.clone());
            let _ = app.emit("update-status", status);
        }
    });
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn running_tasks_defer() { assert!(may_install(1).is_err()); assert!(may_install(0).is_ok()); }
    #[test] fn versions_are_semantic() {
        assert!(semver::Version::parse("1.10.0").unwrap() > semver::Version::parse("1.9.0").unwrap());
        assert!(semver::Version::parse("2.0.0-beta.1").unwrap() < semver::Version::parse("2.0.0").unwrap());
    }
}

#[cfg(test)]
mod manifest_tests {
    use std::{io::{Read, Write}, net::TcpListener};
    #[tokio::test]
    async fn local_fake_server_manifest_and_versions() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream.set_read_timeout(Some(std::time::Duration::from_secs(5))).unwrap();
            let mut request = [0; 4096]; stream.read(&mut request).unwrap();
            let body = r#"{"version":"1.10.0","notes":"Example release","platforms":{"darwin-aarch64":{"url":"https://example.invalid/update.tar.gz","signature":"invalid-test-signature"}}}"#;
            write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body).unwrap();
        });
        let body = reqwest::Client::new().get(format!("http://{address}/latest.json")).timeout(std::time::Duration::from_secs(5)).send().await.unwrap().text().await.unwrap();
        let release: tauri_plugin_updater::RemoteRelease = serde_json::from_str(&body).unwrap();
        assert!(release.version > semver::Version::parse("1.9.0").unwrap());
        assert_eq!(release.notes.as_deref(), Some("Example release"));
        assert!(release.download_url("darwin-x86_64").is_err());
        assert!(serde_json::from_str::<tauri_plugin_updater::RemoteRelease>(r#"{"version":"invalid"}"#).is_err());
        server.join().unwrap();
    }
}

// Retry is a second task admission route. Keep the external adapter untouched.
#[tauri::command]
pub(crate) async fn update_safe_retry_external(session_id: String) -> Result<(), String> {
    let _gate = TASK_GATE.read().await;
    accepting_tasks()?;
    crate::engine::external::agent_retry_external(session_id).await
}

// Preserve the existing IPC name without changing the external adapter or composer.
pub(crate) use update_safe_retry_external as agent_retry_external;
pub(crate) use __cmd__update_safe_retry_external as __cmd__agent_retry_external;
