//! Working-folder lookup and path containment.
//!
//! Allowed root per session: the task's working folder, or the configured
//! default working directory when it has none. That is where the agent's
//! commands run and where the system prompt's working-folder reminder tells
//! it to put files. Nothing else is allowed: not `/tmp`, not the app data
//! directory (engine data, config, mcp.json, bundled skills).

use std::path::{Component, Path, PathBuf};

use super::ArtifactError;

/// Session IDs are UUIDs (optionally prefixed); only a conservative character
/// set is accepted.
pub fn validate_session_id(id: &str) -> Result<(), ArtifactError> {
    let ok = !id.is_empty()
        && id.len() <= 128
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if ok {
        Ok(())
    } else {
        Err(ArtifactError::new("invalid_session", "Invalid session id"))
    }
}

/// Expand a leading `~/` the same way the agent does.
pub fn expand_home(path: &str) -> PathBuf {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(path)
}

/// The resolved, canonical root a session may read from, plus paths that are
/// always refused even inside it.
#[derive(Debug, Clone)]
pub struct Roots {
    pub root: PathBuf,
    pub denied: Vec<PathBuf>,
}

impl Roots {
    /// Build from a (possibly non-canonical) root folder.
    pub fn new(root: &Path, denied: &[PathBuf]) -> Result<Self, ArtifactError> {
        let root = root.canonicalize().map_err(|_| {
            ArtifactError::new(
                "no_working_folder",
                format!("Working folder does not exist: {}", root.display()),
            )
        })?;
        let denied = denied
            .iter()
            .filter_map(|d| d.canonicalize().ok())
            .collect();
        Ok(Self { root, denied })
    }

    /// Resolve `requested` (absolute, `~/`-prefixed, or relative to the root),
    /// follow symlinks, and make sure the result is inside the root and not in
    /// a denied directory. Returns the canonical path. The target must exist.
    pub fn resolve(&self, requested: &str) -> Result<PathBuf, ArtifactError> {
        if requested.is_empty() {
            return Err(ArtifactError::invalid_path("Empty path"));
        }
        if requested.contains('\0') {
            return Err(ArtifactError::invalid_path("Path contains a NUL byte"));
        }
        let p = expand_home(requested);
        let joined = if p.is_absolute() { p } else { self.root.join(p) };
        self.check(&joined)
    }

    /// Resolve a path made only of normal components relative to the root
    /// (used by the URI scheme, which never accepts absolute paths or `..`).
    pub fn resolve_relative(&self, rel: &Path) -> Result<PathBuf, ArtifactError> {
        if !rel.components().all(|c| matches!(c, Component::Normal(_))) {
            return Err(ArtifactError::invalid_path(
                "Only plain relative paths are allowed",
            ));
        }
        self.check(&self.root.join(rel))
    }

    fn check(&self, joined: &Path) -> Result<PathBuf, ArtifactError> {
        let canonical = joined.canonicalize().map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                ArtifactError::not_found(format!("No such file: {}", joined.display()))
            } else {
                ArtifactError::io(e)
            }
        })?;
        self.ensure_contained(&canonical)?;
        Ok(canonical)
    }

    /// Resolve a path that is about to be written. The file itself may not exist
    /// yet, but its parent folder must, and must be inside the root. An existing
    /// target is resolved through symlinks like any read.
    pub fn resolve_for_write(&self, requested: &str) -> Result<PathBuf, ArtifactError> {
        if requested.is_empty() {
            return Err(ArtifactError::invalid_path("Empty path"));
        }
        if requested.contains('\0') {
            return Err(ArtifactError::invalid_path("Path contains a NUL byte"));
        }
        let p = expand_home(requested);
        let joined = if p.is_absolute() { p } else { self.root.join(p) };
        if joined.symlink_metadata().is_ok() {
            return self.check(&joined);
        }
        let name = match joined.components().next_back() {
            Some(Component::Normal(name)) => name.to_owned(),
            _ => return Err(ArtifactError::invalid_path("Path must end in a file name")),
        };
        let parent = joined
            .parent()
            .ok_or_else(|| ArtifactError::invalid_path("Path has no parent folder"))?;
        let parent = self.check(parent)?;
        Ok(parent.join(name))
    }

    /// Containment check on an already-canonical path.
    pub fn ensure_contained(&self, canonical: &Path) -> Result<(), ArtifactError> {
        if !canonical.starts_with(&self.root) {
            return Err(ArtifactError::outside_root(format!(
                "{} is outside the working folder",
                canonical.display()
            )));
        }
        if self.denied.iter().any(|d| canonical.starts_with(d)) {
            return Err(ArtifactError::outside_root(format!(
                "{} is in a protected app directory",
                canonical.display()
            )));
        }
        Ok(())
    }

    /// Path of `canonical` relative to the root (for building scheme URLs).
    pub fn relative(&self, canonical: &Path) -> Option<PathBuf> {
        canonical.strip_prefix(&self.root).ok().map(Path::to_path_buf)
    }
}

/// Directories that are never served even if inside a working folder.
pub fn denied_dirs() -> Vec<PathBuf> {
    vec![crate::paths::get_app_data_dir()]
}

/// Look up the allowed root for a session.
pub async fn roots_for_session(session_id: &str) -> Result<Roots, ArtifactError> {
    validate_session_id(session_id)?;
    let folder = crate::engine::commands::get_working_folder(session_id.to_string())
        .await
        .map_err(|_| ArtifactError::new("no_session", format!("Unknown session: {}", session_id)))?
        .filter(|f| !f.trim().is_empty())
        .unwrap_or_else(crate::config::get_default_working_directory);
    Roots::new(&expand_home(&folder), &denied_dirs())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("vw-artifacts-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    struct Fixture {
        base: PathBuf,
        roots: Roots,
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.base);
        }
    }

    /// base/
    ///   work/ (root)  index.html, sub/page.html, link_out -> ../outside/secret.txt,
    ///                 link_in -> index.html, appdata/ (denied)
    ///   outside/secret.txt
    fn fixture() -> Fixture {
        let base = tmp();
        let work = base.join("work");
        fs::create_dir_all(work.join("sub")).unwrap();
        fs::create_dir_all(work.join("appdata")).unwrap();
        fs::create_dir_all(base.join("outside")).unwrap();
        fs::write(work.join("index.html"), "<h1>hi</h1>").unwrap();
        fs::write(work.join("sub/page.html"), "page").unwrap();
        fs::write(work.join("appdata/config.json"), "{}").unwrap();
        fs::write(base.join("outside/secret.txt"), "secret").unwrap();
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(base.join("outside/secret.txt"), work.join("link_out"))
                .unwrap();
            std::os::unix::fs::symlink(base.join("outside"), work.join("dir_out")).unwrap();
            std::os::unix::fs::symlink(work.join("index.html"), work.join("link_in")).unwrap();
        }
        let roots = Roots::new(&work, &[work.join("appdata")]).unwrap();
        Fixture { base, roots }
    }

    #[test]
    fn relative_path_inside_root() {
        let f = fixture();
        let p = f.roots.resolve("sub/page.html").unwrap();
        assert!(p.ends_with("work/sub/page.html"));
        assert!(p.is_absolute());
    }

    #[test]
    fn absolute_path_inside_root() {
        let f = fixture();
        let abs = f.base.join("work/index.html");
        let p = f.roots.resolve(abs.to_str().unwrap()).unwrap();
        assert_eq!(p, abs.canonicalize().unwrap());
    }

    #[test]
    fn dotdot_that_stays_inside_is_allowed() {
        let f = fixture();
        assert!(f.roots.resolve("sub/../index.html").is_ok());
    }

    #[test]
    fn dotdot_traversal_is_refused() {
        let f = fixture();
        let e = f.roots.resolve("../outside/secret.txt").unwrap_err();
        assert_eq!(e.code, "outside_root");
        let e = f.roots.resolve("sub/../../outside/secret.txt").unwrap_err();
        assert_eq!(e.code, "outside_root");
    }

    #[test]
    fn absolute_path_outside_is_refused() {
        let f = fixture();
        let abs = f.base.join("outside/secret.txt");
        let e = f.roots.resolve(abs.to_str().unwrap()).unwrap_err();
        assert_eq!(e.code, "outside_root");
        let e = f.roots.resolve("/etc/hosts").unwrap_err();
        assert_eq!(e.code, "outside_root");
    }

    #[cfg(unix)]
    #[test]
    fn symlink_escaping_root_is_refused() {
        let f = fixture();
        assert_eq!(f.roots.resolve("link_out").unwrap_err().code, "outside_root");
        assert_eq!(
            f.roots.resolve("dir_out/secret.txt").unwrap_err().code,
            "outside_root"
        );
        // A symlink that stays inside is fine and resolves to its target.
        let p = f.roots.resolve("link_in").unwrap();
        assert!(p.ends_with("work/index.html"));
    }

    #[test]
    fn denied_dir_inside_root_is_refused() {
        let f = fixture();
        assert_eq!(
            f.roots.resolve("appdata/config.json").unwrap_err().code,
            "outside_root"
        );
    }

    #[test]
    fn missing_and_empty_paths() {
        let f = fixture();
        assert_eq!(f.roots.resolve("nope.html").unwrap_err().code, "not_found");
        assert_eq!(f.roots.resolve("").unwrap_err().code, "invalid_path");
        assert_eq!(f.roots.resolve("a\0b").unwrap_err().code, "invalid_path");
    }

    #[test]
    fn resolve_relative_rejects_non_normal_components() {
        let f = fixture();
        assert!(f.roots.resolve_relative(Path::new("sub/page.html")).is_ok());
        for bad in ["../outside/secret.txt", "sub/../index.html", "/etc/hosts", "./index.html"] {
            assert_eq!(
                f.roots.resolve_relative(Path::new(bad)).unwrap_err().code,
                "invalid_path",
                "{bad}"
            );
        }
    }

    #[test]
    fn missing_root_is_an_error() {
        let e = Roots::new(Path::new("/definitely/not/here/vw"), &[]).unwrap_err();
        assert_eq!(e.code, "no_working_folder");
    }

    #[test]
    fn session_id_validation() {
        assert!(validate_session_id("3f2b6c1e-8a4d-4f7e-9c2a-1b2c3d4e5f60").is_ok());
        assert!(validate_session_id("sub-agent_1").is_ok());
        for bad in ["", "../x", "a/b", "a b", "~inline", "x%2F", &"a".repeat(129)] {
            assert!(validate_session_id(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn relative_of_canonical() {
        let f = fixture();
        let p = f.roots.resolve("sub/page.html").unwrap();
        assert_eq!(f.roots.relative(&p).unwrap(), PathBuf::from("sub/page.html"));
    }

    #[test]
    fn write_targets_must_stay_inside_the_root() {
        let base = std::env::temp_dir().join(format!("vw-artifacts-write-{}", uuid::Uuid::new_v4()));
        let root = base.join("work");
        std::fs::create_dir_all(root.join("sub")).unwrap();
        let roots = Roots::new(&root, &[]).unwrap();

        // New file in the root and in an existing subfolder
        assert!(roots.resolve_for_write("new.md").is_ok());
        assert!(roots.resolve_for_write("sub/new.md").is_ok());
        // Parent folder must exist
        assert!(roots.resolve_for_write("missing/new.md").is_err());
        // Traversal and absolute paths outside the root
        assert!(roots.resolve_for_write("../escape.md").is_err());
        let outside = base.join("escape.md");
        assert!(roots.resolve_for_write(&outside.to_string_lossy()).is_err());
        // An existing symlink pointing outside is refused
        #[cfg(unix)]
        {
            std::fs::write(&outside, "x").unwrap();
            std::os::unix::fs::symlink(&outside, root.join("link.md")).unwrap();
            assert!(roots.resolve_for_write("link.md").is_err());
        }
        let _ = std::fs::remove_dir_all(&base);
    }
}
