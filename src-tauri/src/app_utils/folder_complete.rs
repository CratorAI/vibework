//! Folder-path completion for home's folder picker: the folders inside the
//! directory a typed path names, filtered by its last segment, like a
//! shell's Tab completion.
//!
//! Directories only (a symlink counts when it points at one; nothing is read
//! below the listed directory, so a symlink loop cannot be followed), at
//! most `MAX_READ` entries read and `MAX_RESULTS` returned. The app's own
//! data folder is never listed or offered.

use serde::Serialize;
use std::path::{Path, PathBuf};

/// Entries read from one directory at most.
const MAX_READ: usize = 5000;
/// Folders returned at most.
const MAX_RESULTS: usize = 200;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FolderEntry {
    pub name: String,
    /// Absolute path (as listed, not resolved through symlinks)
    pub path: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FolderCompletion {
    /// The directory listed, absolute
    pub dir: String,
    pub entries: Vec<FolderEntry>,
    /// More folders matched than were returned
    pub truncated: bool,
    /// Why nothing can be listed or chosen here
    pub refused: Option<String>,
    /// The directory the path names does not exist
    pub missing: bool,
}

/// The app's own data folders: where it runs from now and the standard
/// location (a dev copy on its own folder still refuses the installed one).
pub fn protected_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![crate::paths::get_app_data_dir()];
    if let Some(standard) = dirs::data_dir().map(|d| d.join("com.vibeworkapp.vibework")) {
        if !dirs.contains(&standard) {
            dirs.push(standard);
        }
    }
    dirs
}

fn canonical(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

/// Whether `path` is one of the app's data folders or inside one.
pub fn is_protected(path: &Path, protected: &[PathBuf]) -> bool {
    let path = canonical(path);
    protected.iter().any(|p| path.starts_with(canonical(p)))
}

pub const REFUSED_APP_DATA: &str = "Vibework keeps its own data here, so it can’t be a task folder.";

/// Split what was typed into the directory to list and the name filter,
/// expanding `~` to `home` and resolving `./` against `base` (else `home`)
/// and any other relative path against `home`.
pub fn split_query(query: &str, home: &Path, base: Option<&Path>) -> (PathBuf, String) {
    let query = if query == "~" { "~/" } else { query };
    let (dir_part, last) = match query.rfind('/') {
        Some(i) => (&query[..=i], &query[i + 1..]),
        None => ("", query),
    };
    let dir = if dir_part == "~/" {
        home.to_path_buf()
    } else if let Some(rest) = dir_part.strip_prefix("~/") {
        home.join(rest)
    } else if dir_part.starts_with('/') {
        PathBuf::from(dir_part)
    } else if let Some(rest) = dir_part.strip_prefix("./") {
        base.unwrap_or(home).join(rest)
    } else {
        home.join(dir_part)
    };
    (dir, last.to_string())
}

/// The folders in `dir` whose names match `filter` (case-insensitive: the
/// exact name, then names starting with it, then names containing it).
/// Hidden folders only when `filter` starts with a dot.
pub fn complete_in(dir: &Path, filter: &str, protected: &[PathBuf]) -> FolderCompletion {
    let display = dir.to_string_lossy().to_string();
    let mut out = FolderCompletion { dir: display, entries: Vec::new(), truncated: false, refused: None, missing: false };
    if is_protected(dir, protected) {
        out.refused = Some(REFUSED_APP_DATA.into());
        return out;
    }
    let Ok(read) = std::fs::read_dir(dir) else {
        out.missing = !dir.is_dir();
        return out;
    };
    let wanted = filter.to_lowercase();
    let show_hidden = filter.starts_with('.');
    let mut found: Vec<(u8, String, FolderEntry)> = Vec::new();
    for entry in read.take(MAX_READ).filter_map(Result::ok) {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') && !show_hidden {
            continue;
        }
        let lower = name.to_lowercase();
        let rank = if lower == wanted {
            0
        } else if lower.starts_with(&wanted) {
            1
        } else if !wanted.is_empty() && lower.contains(&wanted) {
            2
        } else {
            continue;
        };
        // Follows a symlink one step to see whether it names a directory
        let path = entry.path();
        if !std::fs::metadata(&path).map(|m| m.is_dir()).unwrap_or(false) {
            continue;
        }
        if is_protected(&path, protected) {
            continue;
        }
        found.push((rank, lower, FolderEntry { name, path: path.to_string_lossy().to_string() }));
    }
    found.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
    out.truncated = found.len() > MAX_RESULTS;
    out.entries = found.into_iter().take(MAX_RESULTS).map(|(_, _, e)| e).collect();
    out
}

/// Whether a folder may be chosen as a task's folder from the picker:
/// it must exist and not be (or be inside) the app's data folder.
pub fn check_choice(path: &Path, protected: &[PathBuf]) -> Result<String, String> {
    if !path.is_absolute() || !path.is_dir() {
        return Err("That folder doesn’t exist.".into());
    }
    if is_protected(path, protected) {
        return Err(REFUSED_APP_DATA.into());
    }
    let text = path.to_string_lossy();
    let trimmed = text.trim_end_matches('/');
    Ok(if trimmed.is_empty() { "/".into() } else { trimmed.into() })
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Temp(PathBuf);
    impl Temp {
        fn new() -> Self {
            let dir = std::env::temp_dir().join(format!("vibework-fc-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir_all(&dir).unwrap();
            Temp(canonical(&dir))
        }
    }
    impl Drop for Temp {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn splits_typed_paths() {
        let home = Path::new("/home/example");
        let cur = Path::new("/work/here");
        assert_eq!(split_query("~", home, None), (home.to_path_buf(), "".into()));
        assert_eq!(split_query("~/", home, None), (home.to_path_buf(), "".into()));
        assert_eq!(split_query("~/dev/sam", home, None), (home.join("dev/"), "sam".into()));
        assert_eq!(split_query("/home/example/Desk", home, None), (PathBuf::from("/home/example/"), "Desk".into()));
        assert_eq!(split_query("./src/x", home, Some(cur)), (cur.join("src/"), "x".into()));
        assert_eq!(split_query("./a", home, None), (home.join("a").parent().unwrap().to_path_buf(), "a".into()));
        assert_eq!(split_query("dev/sam", home, None), (home.join("dev/"), "sam".into()));
    }

    #[test]
    fn lists_matching_folders_only() {
        let t = Temp::new();
        for d in ["sample", "sample-site", "asamble", "other", ".hidden", ".crate"] {
            std::fs::create_dir(t.0.join(d)).unwrap();
        }
        std::fs::write(t.0.join("crate.txt"), "x").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(t.0.join("sample"), t.0.join("sam-link")).unwrap();
        let names = |filter: &str| complete_in(&t.0, filter, &[]).entries.into_iter().map(|e| e.name).collect::<Vec<_>>();
        assert_eq!(names("sample"), ["sample", "sample-site"]);
        assert_eq!(names("sam"), ["sam-link", "sample", "sample-site", "asamble"]);
        assert_eq!(names(""), ["asamble", "other", "sam-link", "sample", "sample-site"]);
        assert_eq!(names(".c"), [".crate"]);
        assert!(complete_in(&t.0.join("nope"), "", &[]).missing);
    }

    #[test]
    fn a_symlink_loop_is_listed_once_and_never_entered() {
        let t = Temp::new();
        std::fs::create_dir(t.0.join("a")).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&t.0, t.0.join("a").join("loop")).unwrap();
        let inside = complete_in(&t.0.join("a"), "", &[]);
        assert_eq!(inside.entries.len(), 1);
        assert_eq!(inside.entries[0].name, "loop");
    }

    #[test]
    fn refuses_the_app_data_folder() {
        let t = Temp::new();
        let data = t.0.join("appdata");
        std::fs::create_dir_all(data.join("skills")).unwrap();
        std::fs::create_dir(t.0.join("work")).unwrap();
        let protected = vec![data.clone()];
        let listed = complete_in(&t.0, "", &protected);
        assert_eq!(listed.entries.iter().map(|e| e.name.as_str()).collect::<Vec<_>>(), ["work"]);
        assert!(complete_in(&data, "", &protected).refused.is_some());
        assert!(complete_in(&data.join("skills"), "", &protected).refused.is_some());
        assert!(check_choice(&data.join("skills"), &protected).is_err());
        assert_eq!(check_choice(&t.0.join("work"), &protected).unwrap(), t.0.join("work").to_string_lossy());
        assert!(check_choice(&t.0.join("missing"), &protected).is_err());
    }
}
