//! Vibework resource bundling for Windows
//! Handles copying .vibework directory from bundled resources to app data directory
//!
//! Windows-specific implementation uses deep file-by-file copying to handle locked files gracefully.

use anyhow::{Context, Result};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tracing::{info, warn};
use crate::paths::{get_app_data_dir};

/// Deep copy directory on Windows - file by file approach
/// This handles locked files gracefully by skipping them instead of failing entirely.
/// Locked files (like node.js held by daemon) won't block other files from updating.
fn deep_copy_windows(source_dir: &Path, target_dir: &Path, dir_name: &str) -> Result<()> {
    info!("Starting deep copy of {} from {:?} to {:?}", dir_name, source_dir, target_dir);

    // Ensure target directory exists
    if !target_dir.exists() {
        fs::create_dir_all(target_dir)
            .context(format!("Failed to create target directory: {:?}", target_dir))?;
    }

    // Walk through all files in source directory recursively
    walk_and_copy(source_dir, target_dir, source_dir)?;

    info!("Deep copy of {} completed", dir_name);
    Ok(())
}

/// Recursively walk through directories and copy files individually on Windows
fn walk_and_copy(current_source: &Path, current_target: &Path, _base_source: &Path) -> Result<()> {
    for entry in fs::read_dir(current_source)
        .context(format!("Failed to read directory: {:?}", current_source))?
    {
        let entry = entry.context("Failed to read directory entry")?;
        let source_path = entry.path();
        let file_name = entry.file_name();
        let target_path = current_target.join(&file_name);

        if source_path.is_dir() {
            // Create target directory if it doesn't exist
            if !target_path.exists() {
                if let Err(e) = fs::create_dir_all(&target_path) {
                    warn!("Failed to create directory {:?}: {}. Continuing...", target_path, e);
                    continue;
                }
            }
            // Recurse into subdirectory
            walk_and_copy(&source_path, &target_path, _base_source)?;
        } else {
            // Handle file
            // If target file exists, try to delete it first
            if target_path.exists() {
                if let Err(e) = fs::remove_file(&target_path) {
                    warn!(
                        "Could not delete existing file {:?}: {}. File may be locked. Skipping update for this file.",
                        target_path, e
                    );
                    continue;
                }
            }

            // Copy file
            if let Err(e) = fs::copy(&source_path, &target_path) {
                warn!(
                    "Failed to copy file {:?} to {:?}: {}. Continuing...",
                    source_path, target_path, e
                );
                continue;
            }
        }
    }

    Ok(())
}

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

        // Use deep copy that handles locked files gracefully
        info!("Deep copying {} from bundle to {:?}", dir_name, target_dir);
        deep_copy_windows(&source_dir, &target_dir, dir_name)
            .context(format!("Failed to deep copy {} directory", dir_name))?;

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

/// Normalize Windows path by removing UNC prefix (\\?\) if present
/// This prevents issues with paths like \\?\C:\... appearing in logs/errors
fn normalize_windows_path(path: PathBuf) -> PathBuf {
    let path_str = path.to_string_lossy();
    if path_str.starts_with(r"\\?\") {
        PathBuf::from(&path_str[4..])
    } else {
        path
    }
}

/// Detect if we're running in development mode
fn is_dev_mode() -> bool {
    if let Ok(exe_path) = std::env::current_exe() {
        let exe_str = exe_path.to_string_lossy();
        // Check if executable is in target\debug or target\release
        exe_str.contains(r"\target\debug\") || exe_str.contains(r"\target\release\")
    } else {
        false
    }
}

/// Find the source of the `.vibework` directory.
/// In dev mode: looks in target\debug\.vibework (then the older _up_\.vibework)
/// In prod mode: looks only in app resources, crashes if not found
fn find_vibework_source(app: &AppHandle) -> Result<Option<PathBuf>> {
    let dev_mode = is_dev_mode();
    info!("Running in {} mode", if dev_mode { "development" } else { "production" });

    if dev_mode {
        // DEV MODE: Look in target\{debug,release}\.vibework, then _up_\.vibework
        if let Ok(exe_path) = std::env::current_exe() {
            let normalized_exe = normalize_windows_path(exe_path.clone());
            info!("Executable path: {:?}", normalized_exe);

            // Navigate up from executable to find target directory
            let mut current = exe_path.parent();
            while let Some(dir) = current {
                let dir_name = dir.file_name().and_then(|n| n.to_str()).unwrap_or("");

                if dir_name == "debug" || dir_name == "release" {
                    // Found target\debug or target\release
                    // bundle.resources maps the staged skills to `.vibework`
                    // (older builds left them in `_up_/.vibework`).
                    let staged = dir.join(".vibework");
                    let vibework_path = if staged.exists() { staged } else { dir.join("_up_").join(".vibework") };
                    if vibework_path.exists() {
                        let normalized = normalize_windows_path(vibework_path);
                        info!("Found .vibework in dev mode at: {:?}", normalized);
                        return Ok(Some(normalized));
                    } else {
                        warn!("Dev mode: .vibework not found at {:?}", vibework_path);
                    }
                }
                current = dir.parent();
            }
        }

        warn!("Dev mode: Could not find .vibework in target\\debug\\_up_ or target\\release\\_up_");
        return Ok(None);
    } else {
        // PRODUCTION MODE: Only look in resource directory
        match app.path().resource_dir() {
            Ok(resource_dir) => {
                let normalized_resource = normalize_windows_path(resource_dir.clone());
                info!("Production mode: Resource directory: {:?}", normalized_resource);

                // Try .vibework first
                let resource_vibework = resource_dir.join(".vibework");
                if resource_vibework.exists() {
                    let normalized = normalize_windows_path(resource_vibework);
                    info!("Found .vibework in resource directory: {:?}", normalized);
                    return Ok(Some(normalized));
                }

                // Try _up_\.vibework (bundled with ../ prefix)
                let resource_vibework_fallback = resource_dir.join("_up_").join(".vibework");
                if resource_vibework_fallback.exists() {
                    let normalized = normalize_windows_path(resource_vibework_fallback);
                    info!("Found .vibework in _up_ directory: {:?}", normalized);
                    return Ok(Some(normalized));
                }

                // Not found in any production location - this is a critical error
                anyhow::bail!(
                    "FATAL: .vibework directory not found in production bundle. \
                    Checked locations: {:?} and {:?}. \
                    The app bundle may be corrupted.",
                    normalize_windows_path(resource_vibework),
                    normalize_windows_path(resource_vibework_fallback)
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

                // Determine if target is a directory or file
                let target_path = if Path::new(target).is_absolute() {
                    Path::new(target).to_path_buf()
                } else {
                    symlink_path.parent()
                        .map(|p| p.join(target))
                        .unwrap_or_else(|| Path::new(target).to_path_buf())
                };

                let target_is_dir = target_path.is_dir();

                if target_is_dir {
                    std::os::windows::fs::symlink_dir(target, &symlink_path)
                } else {
                    std::os::windows::fs::symlink_file(target, &symlink_path)
                }
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

            let target_is_dir = if target.is_absolute() {
                target.is_dir()
            } else {
                path.parent()
                    .map(|p| p.join(&target).is_dir())
                    .unwrap_or(false)
            };

            if target_is_dir {
                std::os::windows::fs::symlink_dir(&target, &dst_path)
            } else {
                std::os::windows::fs::symlink_file(&target, &dst_path)
            }
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
