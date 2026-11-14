//! Startup setup - handles initialization tasks on app startup
//!
//! This module coordinates all startup tasks including:
//! - Unbundling .vibework resources from app bundle to app data directory
//! - Setting up agent-browser in .vibework/agent-browser
//! - Writing the runtime launchers (`crate::runtimes`)
//! - Ensuring default working directory exists

#[cfg(target_os = "macos")]
mod vibework_macos;
#[cfg(target_os = "macos")]
use vibework_macos as vibework;

#[cfg(target_os = "windows")]
mod vibework_windows;
#[cfg(target_os = "windows")]
use vibework_windows as vibework;



use anyhow::Result;
use tauri::AppHandle;
use tracing::{error, info};

use crate::paths::get_app_data_dir;

/// Initialize all startup tasks asynchronously
///
/// This is the main entry point for startup setup. It coordinates all initialization
/// tasks in the correct order and handles errors gracefully.
///
/// Runs in a background thread to avoid blocking the main UI thread.
pub async fn initialize(app_handle: AppHandle) -> Result<()> {
    info!("Starting startup initialization");

    // Get app data directory (used by multiple setup tasks)
    let app_data_dir = get_app_data_dir();
    info!("App data directory: {:?}", app_data_dir);

    // Run blocking file I/O operations in a separate thread pool
    // to avoid blocking the async runtime
    let app_handle_clone = app_handle.clone();

    tokio::task::spawn_blocking(move || {
        // 1. Unbundle .vibework (skills, scripts, uv, etc.) from bundled resources
        // to the app data directory
        if let Err(e) = vibework::unbundle_vibework(&app_handle_clone) {
            error!("Failed to unbundle .vibework: {}", e);
            // Log the full error chain for debugging
            let mut error_chain = format!("{}", e);
            let mut source = e.source();
            while let Some(err) = source {
                error_chain.push_str(&format!("\n  Caused by: {}", err));
                source = err.source();
            }
            error!("Full error chain: {}", error_chain);
        } else {
            info!(".vibework unbundling completed successfully");
        }

        // 2. The runtime launchers commands and connectors run (vibework-js, ...)
        if let Err(e) = crate::runtimes::install() {
            error!("Failed to install the runtime launchers: {}", e);
        }
        // Vibework's `opencode` for task commands (connectors only)
        if let Err(e) = crate::connectors::install_launcher() {
            error!("Failed to install the opencode launcher: {}", e);
        }

        // Folder creation belongs to task creation (engine/commands.rs).
        // Even probing Desktop here can trigger a macOS folder-access prompt.

    })
    .await
    .map_err(|e| anyhow::anyhow!("Blocking task failed: {}", e))?;

    info!("Startup initialization completed");

    Ok(())
}
