//! Tauri commands for app utilities
//!
//! This module contains commands for window management and other app utilities.

use serde::Serialize;
use std::path::Path;
use tauri::Manager;
use tracing::{debug, error, info};

/// Result type for app operations
#[derive(Debug, Serialize)]
pub struct AppResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl AppResult {
    pub fn success() -> Self {
        Self {
            success: true,
            error: None,
        }
    }

    pub fn error(message: impl Into<String>) -> Self {
        Self {
            success: false,
            error: Some(message.into()),
        }
    }
}

/// Set the window size with optional centering
#[tauri::command]
pub async fn app_set_window_size(
    app_handle: tauri::AppHandle,
    width: u32,
    height: u32,
    center: Option<bool>,
) -> AppResult {
    let should_center = center.unwrap_or(false);

    match app_handle.get_webview_window("main") {
        Some(window) => {
            // Never size the window larger than the screen it is on
            let (width, height) = match window.current_monitor().ok().flatten() {
                Some(monitor) => {
                    let scale = monitor.scale_factor();
                    let max_w = (monitor.size().width as f64 / scale - 40.0).max(400.0) as u32;
                    let max_h = (monitor.size().height as f64 / scale - 110.0).max(300.0) as u32;
                    (width.min(max_w), height.min(max_h))
                }
                None => (width, height),
            };

            // Get current position for relative centering
            let current_position = window.outer_position().ok();
            let current_size = window.outer_size().ok();

            // Set the new size (using Logical size to handle DPI scaling properly)
            if let Err(e) = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
                width: width as f64,
                height: height as f64,
            })) {
                error!("Error setting window size: {}", e);
                return AppResult::error(format!("Failed to set window size: {}", e));
            }

            // Center the window if requested
            if should_center {
                if let Err(e) = window.center() {
                    error!("Error centering window: {}", e);
                    return AppResult::error(format!("Failed to center window: {}", e));
                }
            } else if let (Some(pos), Some(size)) = (current_position, current_size) {
                // Calculate new position to keep window centered relative to its previous position
                let new_x = pos.x + ((size.width as i32 - width as i32) / 2);
                let new_y = pos.y + ((size.height as i32 - height as i32) / 2);

                if let Err(e) =
                    window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                        x: new_x,
                        y: new_y,
                    }))
                {
                    // Non-fatal error, just log it
                    debug!("Could not adjust window position: {}", e);
                }
            }

            debug!(
                "Window size set to {}x{}{}",
                width,
                height,
                if should_center { " and centered" } else { "" }
            );
            AppResult::success()
        }
        None => {
            error!("No main window found");
            AppResult::error("No main window found")
        }
    }
}

/// Set the minimum window size
#[tauri::command]
pub async fn app_set_min_window_size(
    app_handle: tauri::AppHandle,
    min_width: u32,
    min_height: u32,
) -> AppResult {
    match app_handle.get_webview_window("main") {
        Some(window) => {
            if let Err(e) = window.set_min_size(Some(tauri::Size::Logical(tauri::LogicalSize {
                width: min_width as f64,
                height: min_height as f64,
            }))) {
                error!("Error setting min window size: {}", e);
                return AppResult::error(format!("Failed to set min window size: {}", e));
            }

            debug!("Window min size set to {}x{}", min_width, min_height);
            AppResult::success()
        }
        None => {
            error!("No main window found");
            AppResult::error("No main window found")
        }
    }
}

/// File information returned by app_get_file_info
#[derive(Debug, Serialize)]
pub struct FileInfo {
    pub name: String,
    pub size: u64,
    pub path: String,
}

/// Get file information (name and size) for a given path
#[tauri::command]
pub async fn app_get_file_info(path: String) -> Result<FileInfo, String> {
    let file_path = Path::new(&path);

    if !file_path.exists() {
        return Err(format!("File not found: {}", path));
    }

    let metadata =
        std::fs::metadata(&path).map_err(|e| format!("Failed to read file metadata: {}", e))?;

    let name = file_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    Ok(FileInfo {
        name,
        size: metadata.len(),
        path,
    })
}

/// Reveal a file or folder in the system file manager (Finder on macOS)
#[tauri::command]
pub async fn app_reveal_in_finder(app: tauri::AppHandle, path: String) -> AppResult {
    use tauri_plugin_opener::OpenerExt;

    match app.opener().reveal_item_in_dir(std::path::Path::new(&path)) {
        Ok(_) => AppResult::success(),
        Err(e) => AppResult::error(format!("Failed to reveal in Finder: {}", e)),
    }
}

/// Open a file with its default application
#[tauri::command]
pub async fn app_open_file(app: tauri::AppHandle, path: String) -> AppResult {
    use tauri_plugin_opener::OpenerExt;

    match app.opener().open_path(path, None::<&str>) {
        Ok(_) => AppResult::success(),
        Err(e) => AppResult::error(format!("Failed to open file: {}", e)),
    }
}

/// The name of the app that opens `path` by default ("Microsoft Word",
/// "Keynote"), for "Open in …" wording; None when there is none or it cannot
/// be told (and on other systems than macOS).
#[tauri::command]
pub async fn app_default_app_name(path: String) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        use appkit_new::NSWorkspace;
        use foundation_new::{NSString, NSURL};
        let url = NSURL::fileURLWithPath(&NSString::from_str(&path));
        let app = NSWorkspace::sharedWorkspace().URLForApplicationToOpenURL(&url)?;
        let app_path = app.path()?.to_string();
        let name = std::path::Path::new(&app_path).file_stem()?.to_string_lossy().to_string();
        (!name.is_empty()).then_some(name)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        None
    }
}

/// Minimize the window
#[tauri::command]
pub async fn app_minimize_window(app_handle: tauri::AppHandle) -> AppResult {
    match app_handle.get_webview_window("main") {
        Some(window) => {
            if let Err(e) = window.minimize() {
                error!("Error minimizing window: {}", e);
                return AppResult::error(format!("Failed to minimize window: {}", e));
            }
            debug!("Window minimized");
            AppResult::success()
        }
        None => {
            error!("No main window found");
            AppResult::error("No main window found")
        }
    }
}

/// Toggle maximize the window
#[tauri::command]
pub async fn app_toggle_maximize_window(app_handle: tauri::AppHandle) -> AppResult {
    match app_handle.get_webview_window("main") {
        Some(window) => {
            let is_maximized = window.is_maximized().unwrap_or(false);

            let result = if is_maximized {
                window.unmaximize()
            } else {
                window.maximize()
            };

            if let Err(e) = result {
                error!("Error toggling maximize: {}", e);
                return AppResult::error(format!("Failed to toggle maximize: {}", e));
            }
            debug!("Window maximize toggled");
            AppResult::success()
        }
        None => {
            error!("No main window found");
            AppResult::error("No main window found")
        }
    }
}

/// Close the window
#[tauri::command]
pub async fn app_close_window(app_handle: tauri::AppHandle) -> AppResult {
    match app_handle.get_webview_window("main") {
        Some(window) => {
            if let Err(e) = window.close() {
                error!("Error closing window: {}", e);
                return AppResult::error(format!("Failed to close window: {}", e));
            }
            debug!("Window closed");
            AppResult::success()
        }
        None => {
            error!("No main window found");
            AppResult::error("No main window found")
        }
    }
}

/// Start dragging the window
#[tauri::command]
pub async fn app_start_drag(app_handle: tauri::AppHandle) -> AppResult {
    match app_handle.get_webview_window("main") {
        Some(window) => {
            if let Err(e) = window.start_dragging() {
                error!("Error starting drag: {}", e);
                return AppResult::error(format!("Failed to start drag: {}", e));
            }
            debug!("Window drag started");
            AppResult::success()
        }
        None => {
            error!("No main window found");
            AppResult::error("No main window found")
        }
    }
}

// ============================================================================
// Overlay Window Commands
// ============================================================================

/// Overlay status types
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum OverlayStatus {
    Permission { message: String, session_id: String, session_name: Option<String> },
    Question { message: String, session_id: String, session_name: Option<String> },
    Done { message: String, session_id: String, session_name: Option<String> },
}

/// Show the overlay window with status notification
#[tauri::command]
pub async fn overlay_show(app_handle: tauri::AppHandle, status: OverlayStatus) -> AppResult {
    use tauri::Emitter;

    info!("overlay_show called with status: {:?}", status);

    // A dev copy kept in the background (VIBEWORK_DEV_BACKGROUND) never puts
    // its floating overlay over the screen of whoever is using the Mac
    if crate::paths::dev_background() {
        debug!("Dev background mode, skipping overlay");
        return AppResult::success();
    }

    // Check if main window is focused - if so, skip overlay
    if let Some(main_window) = app_handle.get_webview_window("main") {
        if main_window.is_focused().unwrap_or(false) {
            debug!("Main window is focused, skipping overlay");
            return AppResult::success();
        }
    }

    // Check if notifications are disabled in settings
    if !crate::config::get_notifications_enabled() {
        debug!("Notifications disabled in settings, skipping overlay");
        return AppResult::success();
    }

    match app_handle.get_webview_window("overlay") {
        Some(window) => {
            // Use the main window's display and its usable area, below the menu
            // bar. Physical coordinates preserve offsets on secondary monitors.
            let monitor = app_handle.get_webview_window("main")
                .and_then(|main| main.current_monitor().ok().flatten())
                .or_else(|| window.primary_monitor().ok().flatten());
            if let Some(monitor) = monitor {
                let area = monitor.work_area();
                let scale = monitor.scale_factor();
                let width = (380.0 * scale).round() as i32;
                let padding = (12.0 * scale).round() as i32;
                let x = area.position.x + (area.size.width as i32 - width - padding).max(0);
                let y = area.position.y + padding;
                if let Err(e) = window.set_position(tauri::PhysicalPosition::new(x, y)) {
                    debug!("Could not set overlay position: {}", e);
                }
            }

            // Emit the status to the overlay window
            if let Err(e) = app_handle.emit_to("overlay", "overlay:status", &status) {
                error!("Error emitting overlay status: {}", e);
                return AppResult::error(format!("Failed to emit status: {}", e));
            }

            // Show the window
            if let Err(e) = window.show() {
                error!("Error showing overlay: {}", e);
                return AppResult::error(format!("Failed to show overlay: {}", e));
            }

            debug!("Overlay shown with status: {:?}", status);
            AppResult::success()
        }
        None => {
            error!("No overlay window found");
            AppResult::error("No overlay window found")
        }
    }
}

/// Hide the overlay window
#[tauri::command]
pub async fn overlay_hide(app_handle: tauri::AppHandle) -> AppResult {
    use tauri::Emitter;

    match app_handle.get_webview_window("overlay") {
        Some(window) => {
            // Emit hide event first
            let _ = app_handle.emit_to("overlay", "overlay:hide", ());

            if let Err(e) = window.hide() {
                error!("Error hiding overlay: {}", e);
                return AppResult::error(format!("Failed to hide overlay: {}", e));
            }
            debug!("Overlay hidden");
            AppResult::success()
        }
        None => {
            // Overlay window may not exist yet, that's fine
            debug!("Overlay window not found (may not be initialized yet)");
            AppResult::success()
        }
    }
}

/// Get notifications enabled setting
#[tauri::command]
pub fn get_notifications_enabled() -> bool {
    crate::config::get_notifications_enabled()
}

/// Set notifications enabled setting
#[tauri::command]
pub fn set_notifications_enabled(enabled: bool) -> AppResult {
    crate::config::set_notifications_enabled(enabled);
    AppResult::success()
}

/// Focus the main window (called when overlay is clicked)
#[tauri::command]
pub async fn overlay_focus_main(app_handle: tauri::AppHandle, session_id: Option<String>) -> AppResult {
    use tauri::Emitter;
    // First focus the main window
    match app_handle.get_webview_window("main") {
        Some(window) => {
            if let Some(session_id) = session_id {
                if let Err(e) = app_handle.emit_to("main", "overlay:open-task", session_id) {
                    return AppResult::error(format!("Failed to open task: {e}"));
                }
            }
            if let Err(e) = window.show() {
                return AppResult::error(format!("Failed to show main window: {e}"));
            }
            // Unminimize if minimized
            if window.is_minimized().unwrap_or(false) {
                if let Err(e) = window.unminimize() {
                    debug!("Could not unminimize window: {}", e);
                }
            }

            if let Err(e) = window.set_focus() {
                error!("Error focusing main window: {}", e);
                return AppResult::error(format!("Failed to focus main window: {}", e));
            }
            debug!("Main window focused");

            // Clear the frontend timer as well as hiding the window.
            let _ = overlay_hide(app_handle.clone()).await;

            AppResult::success()
        }
        None => {
            error!("No main window found");
            AppResult::error("No main window found")
        }
    }
}

// ============================================================================
// Default Working Directory Commands
// ============================================================================

/// Get the default working directory
#[tauri::command]
pub fn get_default_working_directory() -> String {
    crate::config::get_default_working_directory()
}

/// Set the default working directory
#[tauri::command]
pub fn set_default_working_directory(directory: String) -> AppResult {
    crate::config::set_default_working_directory(&directory);
    AppResult::success()
}

/// The home folder picker's saved state: recents, pins, the folder home
/// starts in, and the default folder (where tasks without a folder work).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderPrefs {
    pub recents: Vec<crate::config::RecentFolder>,
    pub pinned: Vec<String>,
    pub home_folder: Option<String>,
    pub default_folder: String,
}

fn expand_home(path: &str) -> String {
    match (path.strip_prefix("~/"), dirs::home_dir()) {
        (Some(rest), Some(home)) => home.join(rest).to_string_lossy().to_string(),
        _ => path.to_string(),
    }
}

#[tauri::command]
pub fn folders_get() -> FolderPrefs {
    let (recents, pinned, home_folder) = crate::config::get_folder_prefs();
    FolderPrefs { recents, pinned, home_folder, default_folder: expand_home(&crate::config::get_default_working_directory()) }
}

/// A task started from home in this folder (or it was chosen there).
#[tauri::command]
pub fn folders_note_used(path: String) -> FolderPrefs {
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0);
    crate::config::note_folder_used(&path, now);
    folders_get()
}

#[tauri::command]
pub fn folders_set_pinned(path: String, pinned: bool) -> FolderPrefs {
    crate::config::set_folder_pinned(&path, pinned);
    folders_get()
}

/// Home's folder picker, typing a path: the folders in the directory it
/// names, filtered by its last segment. `base` is the folder `./` starts
/// from (the one chosen on home), else the home folder.
#[tauri::command]
pub async fn folders_complete(query: String, base: Option<String>) -> Result<super::folder_complete::FolderCompletion, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let home = dirs::home_dir().ok_or("No home folder")?;
        let (dir, filter) = super::folder_complete::split_query(&query, &home, base.as_deref().map(Path::new));
        Ok(super::folder_complete::complete_in(&dir, &filter, &super::folder_complete::protected_dirs()))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// A folder typed into home's picker, before the consent step: it must
/// exist and not be the app's own data folder. Returns the path to use.
#[tauri::command]
pub fn folders_check(path: String) -> Result<String, String> {
    super::folder_complete::check_choice(Path::new(&expand_home(&path)), &super::folder_complete::protected_dirs())
}

/// The folder home starts in next time; null means no folder.
#[tauri::command]
pub fn folders_set_home(path: Option<String>) -> FolderPrefs {
    crate::config::set_home_folder(path);
    folders_get()
}

// ============================================================================
// Onboarding Commands
// ============================================================================

/// Get whether onboarding has been completed
#[tauri::command]
pub fn get_onboarding_completed() -> bool {
    crate::config::get_onboarding_completed()
}

/// Set whether onboarding has been completed
#[tauri::command]
pub fn set_onboarding_completed(completed: bool) -> AppResult {
    crate::config::set_onboarding_completed(completed);
    AppResult::success()
}
