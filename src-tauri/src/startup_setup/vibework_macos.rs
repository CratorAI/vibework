//! Vibework resource bundling for macOS
//! Handles copying .vibework directory from bundled resources to app data directory

use anyhow::{Context, Result};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tracing::{info, warn};
use crate::paths::get_app_data_dir;

/// Copy the entire `.vibework` directory from bundled resources to app data directory.
/// This ensures all vibework resources (skills, scripts, uv, etc.) are always
/// up-to-date by refreshing on each startup.
///
/// In development mode, tries source directory first, then resource directory
/// In production mode, uses resource directory via resolve_resource
pub fn unbundle_vibework(app: &AppHandle) -> Result<()> {
    // Path to .vibework in app data directory
    let target_vibework_path = get_app_data_dir().join(".vibework");

    // Try to find .vibework in multiple locations (dev vs production)
    let bundled_vibework_path = find_vibework_source(app)?;

    let Some(bundled_vibework_path) = bundled_vibework_path else {
        warn!(
            "Bundled .vibework folder not found in any expected location, skipping unbundling"
        );
        return Ok(());
    };

    info!(
        "Unbundling .vibework from {:?} to {:?}",
        bundled_vibework_path,
        target_vibework_path
    );

    // Create .vibework directory if it doesn't exist
    if !target_vibework_path.exists() {
        info!("Creating .vibework directory at {:?}", target_vibework_path);
        fs::create_dir_all(&target_vibework_path)
            .context("Failed to create .vibework directory")?;
    }

    // Only delete and recopy the bundled skills. This preserves other
    // directories like agent-browser. (Earlier versions also bundled
    // `scripts` with bun and uv; `crate::runtimes` replaces and removes it.)
    let dirs_to_update = vec!["skills"];

    for dir_name in dirs_to_update {
        let source_dir = bundled_vibework_path.join(dir_name);
        let target_dir = target_vibework_path.join(dir_name);

        // Skip if source directory doesn't exist in bundle
        if !source_dir.exists() {
            info!("Skipping {} (not found in bundle)", dir_name);
            continue;
        }

        // Check version files to determine if copy is needed
        if should_skip_copy(&source_dir, &target_dir, dir_name)? {
            info!("Skipping {} (already up to date)", dir_name);
            continue;
        }

        // Remove existing directory if it exists
        if target_dir.exists() {
            info!("Removing existing {} directory at {:?}", dir_name, target_dir);
            fs::remove_dir_all(&target_dir)
                .context(format!("Failed to remove existing {} directory", dir_name))?;
        }

        // Copy directory from bundle
        info!("Copying {} from bundle to {:?}", dir_name, target_dir);
        copy_dir_all(&source_dir, &target_dir)
            .context(format!("Failed to copy {} directory", dir_name))?;

        // Recreate symlinks from .symlink files
        info!("Recreating symlinks from .symlink files in {}", dir_name);
        recreate_symlinks_from_files(&target_dir)
            .context(format!("Failed to recreate symlinks in {} directory", dir_name))?;
    }

    info!(
        "Successfully unbundled .vibework (skills, scripts) to {:?}",
        target_vibework_path
    );

    Ok(())
}

/// Check if copy operation should be skipped based on .vibework-dir-version file
///
/// Returns:
/// - Ok(true) if versions match (skip copy)
/// - Ok(false) if copy is needed
/// - Err if source is missing version file but target has it (corrupted bundle)
fn should_skip_copy(source_dir: &Path, target_dir: &Path, dir_name: &str) -> Result<bool> {
    let version_file_name = ".vibework-dir-version";
    let source_version_file = source_dir.join(version_file_name);
    let target_version_file = target_dir.join(version_file_name);

    // If target directory doesn't exist, copy is needed
    if !target_dir.exists() {
        info!("{} target directory doesn't exist, copy needed", dir_name);
        return Ok(false);
    }

    // If target has no version file, copy is needed (old installation)
    if !target_version_file.exists() {
        info!("{} target has no version file, copy needed", dir_name);
        return Ok(false);
    }

    // Target has version file - source MUST have it too
    if !source_version_file.exists() {
        anyhow::bail!(
            "FATAL: Source {} directory is missing {} file. \
            The app bundle may be corrupted. Please reinstall the application.",
            dir_name,
            version_file_name
        );
    }

    // Both have version files - compare contents
    let source_version = fs::read_to_string(&source_version_file)
        .context(format!("Failed to read source {} version file", dir_name))?
        .trim()
        .to_string();

    let target_version = fs::read_to_string(&target_version_file)
        .context(format!("Failed to read target {} version file", dir_name))?
        .trim()
        .to_string();

    if source_version == target_version {
        info!(
            "{} versions match ({}), skipping copy",
            dir_name, source_version
        );
        Ok(true)
    } else {
        info!(
            "{} versions differ (source: {}, target: {}), copy needed",
            dir_name, source_version, target_version
        );
        Ok(false)
    }
}

/// Development mode is a debug build (`tauri dev`). A release build always
/// reads the bundle's own resources, even when the app is run from the build
/// output folder (under target/release/bundle).
fn is_dev_mode() -> bool {
    cfg!(debug_assertions)
}

/// Find the source of the `.vibework` directory.
/// In dev mode: looks in target/debug/.vibework (then the older _up_/.vibework)
/// In prod mode: looks only in app resources, crashes if not found
fn find_vibework_source(app: &AppHandle) -> Result<Option<PathBuf>> {
    let dev_mode = is_dev_mode();
    info!("Running in {} mode", if dev_mode { "development" } else { "production" });

    if dev_mode {
        // DEV MODE: Look in target/{debug,release}/.vibework, then _up_/.vibework
        if let Ok(exe_path) = std::env::current_exe() {
            info!("Executable path: {:?}", exe_path);

            // Navigate up from executable to find target directory
            let mut current = exe_path.parent();
            while let Some(dir) = current {
                let dir_name = dir.file_name().and_then(|n| n.to_str()).unwrap_or("");

                if dir_name == "debug" || dir_name == "release" {
                    // Found target/debug or target/release
                    // bundle.resources maps the staged skills to `.vibework`
                    // (older builds left them in `_up_/.vibework`).
                    let staged = dir.join(".vibework");
                    let vibework_path = if staged.exists() { staged } else { dir.join("_up_").join(".vibework") };
                    if vibework_path.exists() {
                        info!("Found .vibework in dev mode at: {:?}", vibework_path);
                        return Ok(Some(vibework_path));
                    } else {
                        warn!("Dev mode: .vibework not found at {:?}", vibework_path);
                    }
                }
                current = dir.parent();
            }
        }

        warn!("Dev mode: Could not find .vibework in target/debug or target/release");
        return Ok(None);
    } else {
        // PRODUCTION MODE: Only look in resource directory
        match app.path().resource_dir() {
            Ok(resource_dir) => {
                info!("Production mode: Resource directory: {:?}", resource_dir);

                // Try .vibework first
                let resource_vibework = resource_dir.join(".vibework");
                if resource_vibework.exists() {
                    info!("Found .vibework in resource directory: {:?}", resource_vibework);
                    return Ok(Some(resource_vibework));
                }

                // Try _up_/.vibework (bundled with ../ prefix)
                let resource_vibework_fallback = resource_dir.join("_up_").join(".vibework");
                if resource_vibework_fallback.exists() {
                    info!("Found .vibework in _up_ directory: {:?}", resource_vibework_fallback);
                    return Ok(Some(resource_vibework_fallback));
                }

                // Not found in any production location - this is a critical error
                anyhow::bail!(
                    "FATAL: .vibework directory not found in production bundle. \
                    Checked locations: {:?} and {:?}. \
                    The app bundle may be corrupted.",
                    resource_vibework,
                    resource_vibework_fallback
                );
            }
            Err(e) => {
                anyhow::bail!(
                    "FATAL: Could not access resource directory in production mode: {}. \
                    The app bundle may be corrupted.",
                    e
                );
            }
        }
    }
}

/// Recursively recreate symlinks from .symlink files
fn recreate_symlinks_from_files(dir: &Path) -> Result<()> {
    for entry in fs::read_dir(dir)
        .context(format!("Failed to read directory: {:?}", dir))?
    {
        let entry = entry.context("Failed to read directory entry")?;
        let path = entry.path();

        if path.is_dir() {
            recreate_symlinks_from_files(&path)
                .context(format!("Failed to process subdirectory: {:?}", path))?;
        } else if let Some(file_name) = path.file_name() {
            let file_name_str = file_name.to_string_lossy();

            if file_name_str.ends_with(".symlink") {
                info!("Found .symlink file: {:?}", path);

                let target = fs::read_to_string(&path)
                    .context(format!("Failed to read .symlink file: {:?}", path))?;
                let target = target.trim();

                let symlink_path = path.with_file_name(
                    file_name_str.trim_end_matches(".symlink")
                );

                info!("Creating symlink: {:?} -> {}", symlink_path, target);

                std::os::unix::fs::symlink(target, &symlink_path)
                    .context(format!("Failed to create symlink: {:?}", symlink_path))?;

                fs::remove_file(&path)
                    .context(format!("Failed to remove .symlink file: {:?}", path))?;

                info!("Successfully created symlink and removed .symlink file");
            }
        }
    }

    Ok(())
}

/// Recursively copy a directory, preserving symlinks
fn copy_dir_all(src: &Path, dst: &Path) -> Result<()> {
    fs::create_dir_all(dst)
        .context(format!("Failed to create destination directory: {:?}", dst))?;

    for entry in fs::read_dir(src)
        .context(format!("Failed to read source directory: {:?}", src))?
    {
        let entry = entry.context("Failed to read directory entry")?;
        let path = entry.path();
        let file_name = entry.file_name();
        let dst_path = dst.join(&file_name);

        if path.is_symlink() {
            let target = fs::read_link(&path)
                .context(format!("Failed to read symlink: {:?}", path))?;

            std::os::unix::fs::symlink(&target, &dst_path)
                .context(format!("Failed to create symlink: {:?} -> {:?}", dst_path, target))?;
        } else if path.is_dir() {
            copy_dir_all(&path, &dst_path)
                .context(format!("Failed to copy subdirectory: {:?}", path))?;
        } else {
            fs::copy(&path, &dst_path)
                .context(format!("Failed to copy file: {:?} to {:?}", path, dst_path))?;
        }
    }

    Ok(())
}
