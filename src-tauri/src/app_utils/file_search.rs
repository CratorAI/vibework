//! File search command for @ mention autocomplete

use std::path::{Path};
use serde::{Deserialize, Serialize};
use tracing::{debug, info};
use walkdir::WalkDir;

/// Maximum number of results to return
const MAX_RESULTS: usize = 50;

/// Maximum depth to search
const MAX_DEPTH: usize = 10;

/// Directories and files to ignore during search
const IGNORE_PATTERNS: &[&str] = &[
    // Dependencies
    "node_modules",
    "bower_components",
    "vendor",
    "packages",

    // Python
    "venv",
    ".venv",
    "env",
    ".env",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    "*.pyc",
    ".tox",
    "*.egg-info",

    // Build outputs
    "dist",
    "build",
    "target",
    "out",
    ".next",
    ".nuxt",
    ".output",
    "_site",

    // IDE and editors
    ".idea",
    ".vscode",
    ".vs",
    "*.swp",
    "*.swo",
    "*~",

    // Version control
    ".git",
    ".svn",
    ".hg",

    // OS files
    ".DS_Store",
    "Thumbs.db",
    "desktop.ini",

    // Cache and temp
    ".cache",
    "tmp",
    "temp",
    ".tmp",
    ".temp",

    // Logs
    "logs",
    "*.log",
];

/// Check if a file or directory should be ignored
fn should_ignore(name: &str) -> bool {
    for pattern in IGNORE_PATTERNS {
        if pattern.contains('*') {
            // Simple wildcard matching for patterns like "*.pyc"
            let pattern_without_star = pattern.trim_start_matches('*');
            if name.ends_with(pattern_without_star) {
                return true;
            }
        } else if name == *pattern {
            return true;
        }
    }
    false
}

/// File search result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSearchResult {
    /// Relative path from working directory
    pub path: String,
    /// Whether this is a directory
    pub is_directory: bool,
    /// File size (if it's a file)
    pub size: Option<u64>,
}

/// Search for files matching a partial path
#[tauri::command]
pub async fn search_files(
    working_dir: String,
    partial_path: String,
) -> Result<Vec<FileSearchResult>, String> {
    info!("Searching files in {} for: {}", working_dir, partial_path);

    let working_path = Path::new(&working_dir);
    if !working_path.exists() {
        return Err(format!("Working directory does not exist: {}", working_dir));
    }

    // Normalize partial path (remove leading ./ or /)
    let query = partial_path.trim_start_matches("./").trim_start_matches('/');

    // If empty query, return top-level items
    if query.is_empty() {
        return get_directory_contents(&working_path, "")
            .map_err(|e| format!("Failed to list directory: {}", e));
    }

    // Split the query into directory part and filename part
    let query_path = Path::new(query);
    let (dir_part, file_part): (String, String) = if query.ends_with('/') {
        // User is looking inside a directory
        (query.to_string(), String::new())
    } else if let Some(parent) = query_path.parent() {
        let parent_str = parent.to_string_lossy().to_string();
        let file_name = query_path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        (parent_str, file_name)
    } else {
        (String::new(), query.to_string())
    };

    debug!("Directory part: '{}', File part: '{}'", dir_part, file_part);

    // Determine which directory to search in
    let search_dir = if dir_part.is_empty() {
        working_path.to_path_buf()
    } else {
        working_path.join(&dir_part)
    };

    if !search_dir.exists() {
        // Directory doesn't exist yet, return empty results
        return Ok(Vec::new());
    }

    // Get matching files from the search directory
    get_matching_files(&search_dir, working_path, &dir_part, &file_part)
        .map_err(|e| format!("Failed to search files: {}", e))
}

/// Get contents of a directory (non-recursive, immediate children only)
fn get_directory_contents(
    dir_path: &Path,
    prefix: &str,
) -> Result<Vec<FileSearchResult>, std::io::Error> {
    let mut results = Vec::new();

    for entry in std::fs::read_dir(dir_path)? {
        let entry = entry?;
        let path = entry.path();

        // Skip hidden files (starting with .) and ignored patterns
        if let Some(name) = path.file_name() {
            let name_str = name.to_string_lossy();
            if name_str.starts_with('.') || should_ignore(&name_str) {
                continue;
            }
        }

        let relative_path = if prefix.is_empty() {
            path.file_name()
                .unwrap()
                .to_string_lossy()
                .to_string()
        } else {
            format!("{}/{}", prefix, path.file_name().unwrap().to_string_lossy())
        };

        let metadata = entry.metadata()?;
        let is_directory = metadata.is_dir();

        results.push(FileSearchResult {
            path: if is_directory {
                format!("{}/", relative_path)
            } else {
                relative_path
            },
            is_directory,
            size: if is_directory { None } else { Some(metadata.len()) },
        });

        if results.len() >= MAX_RESULTS {
            break;
        }
    }

    // Sort: directories first, then alphabetically
    results.sort_by(|a, b| {
        match (a.is_directory, b.is_directory) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.path.cmp(&b.path),
        }
    });

    Ok(results)
}

/// Get files matching a partial filename in a directory
fn get_matching_files(
    search_dir: &Path,
    working_dir: &Path,
    dir_prefix: &str,
    file_query: &str,
) -> Result<Vec<FileSearchResult>, std::io::Error> {
    let mut results = Vec::new();
    let file_query_lower = file_query.to_lowercase();

    // If no file query, just list directory contents
    if file_query.is_empty() {
        return get_directory_contents(search_dir, dir_prefix);
    }

    // Search through directory entries
    for entry in WalkDir::new(search_dir)
        .max_depth(MAX_DEPTH)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            // Filter out ignored directories before traversing into them
            if let Some(name) = e.file_name().to_str() {
                !name.starts_with('.') && !should_ignore(name)
            } else {
                true
            }
        })
        .filter_map(|e| e.ok())
    {
        let path = entry.path();

        // Get relative path from working directory
        let relative_path = match path.strip_prefix(working_dir) {
            Ok(p) => p.to_string_lossy().to_string(),
            Err(_) => continue,
        };

        // Check if filename matches the query (case-insensitive)
        let file_name = path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        if !file_name.to_lowercase().contains(&file_query_lower) {
            continue;
        }

        let metadata = entry.metadata()?;
        let is_directory = metadata.is_dir();

        results.push(FileSearchResult {
            path: if is_directory {
                format!("{}/", relative_path)
            } else {
                relative_path
            },
            is_directory,
            size: if is_directory { None } else { Some(metadata.len()) },
        });

        if results.len() >= MAX_RESULTS {
            break;
        }
    }

    // Sort: directories first, then by relevance (exact prefix match first)
    results.sort_by(|a, b| {
        let a_name = Path::new(&a.path).file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let b_name = Path::new(&b.path).file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let a_exact = a_name.to_lowercase().starts_with(&file_query_lower);
        let b_exact = b_name.to_lowercase().starts_with(&file_query_lower);

        match (a.is_directory, b.is_directory) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => match (a_exact, b_exact) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.path.cmp(&b.path),
            }
        }
    });

    Ok(results)
}
