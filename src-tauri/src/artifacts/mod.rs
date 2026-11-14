//! Artifacts: read-only, sandboxed access to the files the agent produced.
//!
//! The agent writes deliverables (HTML pages, React components, Markdown, SVG,
//! PDFs, images, office files) into the session's working folder. The
//! workspace panel renders them. Their content is model output and therefore
//! untrusted, so everything here is built around three rules:
//!
//! 1. Only files inside the session's working folder (or the default working
//!    directory when the session has none) can be read, after resolving
//!    symlinks. The app's own data directory is always refused, even when it
//!    happens to sit inside a working folder.
//! 2. Rendered content is served on a dedicated `artifact:` scheme whose every
//!    response carries a sandboxing Content-Security-Policy (opaque origin, no
//!    Tauri IPC key, no network beyond a small CDN allowlist).
//! 3. Only the app's own `main` webview may use the commands or the scheme, so
//!    a future browser-panel webview gets nothing.
//!
//! Wiring (see `lib.rs`): `.plugin(artifacts::init())` registers the scheme and
//! the lifecycle hooks; the `artifact_*` commands go in `generate_handler!`.

mod commands;
mod inline;
mod mime;
pub(crate) mod paths;
mod protocol;
mod sheet_head;
mod watch;
pub(crate) use watch::remove_owned_by_session;

pub use commands::*;

use serde::Serialize;
use tauri::{plugin::TauriPlugin, Runtime};

/// The custom URI scheme name.
pub const SCHEME: &str = "artifact";

/// Event emitted when a watched artifact changes on disk.
pub const CHANGED_EVENT: &str = "artifact:changed";

/// Webview labels allowed to use the artifact commands and the `artifact:` scheme.
/// Only the main app UI; never the loading/overlay windows or any child webview.
pub const ALLOWED_WEBVIEWS: &[&str] = &["main"];

/// Largest file returned as text by `artifact_read` (2 MB).
pub const MAX_TEXT_BYTES: u64 = 2 * 1024 * 1024;
/// Largest file returned as binary by `artifact_read`, or served on the scheme (25 MB).
pub const MAX_BINARY_BYTES: u64 = 25 * 1024 * 1024;
/// Maximum entries returned by `artifact_list`.
pub const MAX_LIST_ENTRIES: usize = 500;
/// Maximum concurrent file watches.
pub const MAX_WATCHES: usize = 32;

/// Error returned by every artifact command. Serialised to the frontend as
/// `{ code, message }`. Codes are stable and meant to be switched on.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ArtifactError {
    pub code: &'static str,
    pub message: String,
}

impl ArtifactError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
    pub fn invalid_path(message: impl Into<String>) -> Self {
        Self::new("invalid_path", message)
    }
    pub fn outside_root(message: impl Into<String>) -> Self {
        Self::new("outside_root", message)
    }
    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new("not_found", message)
    }
    pub fn too_large(size: u64, limit: u64) -> Self {
        Self::new(
            "too_large",
            format!(
                "File is {} bytes, over the {} byte limit for this view",
                size, limit
            ),
        )
    }
    pub fn io(err: std::io::Error) -> Self {
        Self::new("io", err.to_string())
    }
    pub fn forbidden() -> Self {
        Self::new("forbidden", "Artifacts are only available to the main window")
    }
    /// HTTP status used when the error is returned over the `artifact:` scheme.
    pub fn http_status(&self) -> u16 {
        match self.code {
            "invalid_path" | "invalid_session" => 400,
            "outside_root" | "forbidden" => 403,
            "not_found" | "no_session" | "no_working_folder" => 404,
            "too_large" => 413,
            "not_ready" => 503,
            _ => 500,
        }
    }
}

impl std::fmt::Display for ArtifactError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for ArtifactError {}

/// The plugin that registers the `artifact:` scheme and cleans up per-webview
/// state (watches, inline documents) on reload and window destruction.
/// It has no commands of its own, so it needs no ACL permissions.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("artifacts")
        .register_asynchronous_uri_scheme_protocol(SCHEME, protocol::handle)
        .on_page_load(|webview, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Started {
                watch::remove_owned_by_webview(webview.label());
                inline::remove_owned_by(webview.label());
            }
        })
        .on_event(|_app, event| {
            if let tauri::RunEvent::WindowEvent {
                label,
                event: tauri::WindowEvent::Destroyed,
                ..
            } = event
            {
                watch::remove_owned_by_window(label);
                inline::remove_owned_by(label);
            }
        })
        .build()
}
