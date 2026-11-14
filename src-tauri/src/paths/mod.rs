//! Centralized path management for the application
//!
//! This module provides consistent path resolution across the app for:
//! - App data directory (where .vibework, the engine's data, config, etc. are stored)
//! - Platform-specific paths

use std::path::PathBuf;

/// Get the application data directory
/// 
/// This is where all app data is stored:
/// - .vibework/ (bundled resources)
/// - opencode/ (the engine's data: tasks, logs, its own config)
/// - config.json
/// - logs/
///
/// Platform-specific base dir:
/// - Windows: `%APPDATA%`
/// - macOS: `$HOME/Library/Application Support`
/// - Linux: `$HOME/.local/share`
///
/// We then append our app identifier: `com.vibeworkapp.vibework`.
pub fn get_app_data_dir() -> PathBuf {
    #[cfg(any(debug_assertions, feature = "dev-release-probe"))]
    if let Some(dir) = dev_data_dir_override() {
        return dir;
    }
    dirs::data_dir()
        .or_else(|| dirs::data_local_dir())
        .expect("Failed to get data directory")
        .join("com.vibeworkapp.vibework")
}

/// Debug and `dev-release-probe` builds only: `VIBEWORK_DEV_DATA_DIR=/abs/folder` runs the app on a
/// data folder of its own (config, engine data, skills, search index, dev
/// bridge file), so a dev copy can run beside an installed app without
/// sharing its tasks or settings. It must be an absolute path; anything else
/// is ignored. Shipped release builds never read it.
#[cfg(any(debug_assertions, feature = "dev-release-probe"))]
pub fn dev_data_dir_override() -> Option<PathBuf> {
    let dir = PathBuf::from(std::env::var_os("VIBEWORK_DEV_DATA_DIR")?);
    dir.is_absolute().then_some(dir)
}

/// Debug builds started with `VIBEWORK_DEV_BACKGROUND=1` stay out of the way
/// of whoever is using the Mac: no Dock icon, never activated, the main window
/// kept behind other windows (still drawing, so it can be captured). Release
/// builds ignore the variable.
#[cfg(any(debug_assertions, feature = "dev-release-probe"))]
pub fn dev_background() -> bool {
    std::env::var("VIBEWORK_DEV_BACKGROUND").is_ok_and(|v| v == "1")
}
#[cfg(not(any(debug_assertions, feature = "dev-release-probe")))]
pub fn dev_background() -> bool {
    false
}

/// Get the .vibework directory path
pub fn get_vibework_dir() -> PathBuf {
    get_app_data_dir().join(".vibework")
}

/// Get the skills directory path
pub fn get_skills_dir() -> PathBuf {
    get_vibework_dir().join("skills")
}


