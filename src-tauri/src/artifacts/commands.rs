//! Tauri commands: `artifact_read`, `artifact_stat`, `artifact_list`,
//! `artifact_tree_list`, `artifact_tree_find`, `artifact_watch`,
//! `artifact_watch_tree`, `artifact_unwatch`, `artifact_inline_create`,
//! `artifact_inline_release`, `artifact_sheet_head`.
//!
//! Every command refuses callers other than the `main` webview.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use base64::Engine as _;
use serde::Serialize;
use tauri::{AppHandle, Webview};

use super::mime::{self, Kind};
use super::paths::{roots_for_session, Roots};
use super::{inline, protocol, watch, ArtifactError, ALLOWED_WEBVIEWS};
use super::{MAX_BINARY_BYTES, MAX_LIST_ENTRIES, MAX_TEXT_BYTES};

/// Metadata for one artifact file (no contents).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactStat {
    pub artifact_type: Option<&'static str>,
    /// Absolute, canonical path (symlinks resolved).
    pub path: String,
    pub name: String,
    pub mime: String,
    pub size: u64,
    /// Last modification time, ms since the Unix epoch (0 if unavailable).
    pub modified_ms: u64,
    /// "text" or "binary".
    pub kind: &'static str,
    /// `artifact:` URL that serves this file (relative to the working folder).
    pub url: String,
}

/// An artifact file with its contents.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactFile {
    #[serde(flatten)]
    pub stat: ArtifactStat,
    /// UTF-8 (lossy) text when `kind == "text"`, else null.
    pub text: Option<String>,
    /// Standard base64 when `kind == "binary"`, else null.
    pub base64: Option<String>,
}

/// One directory entry for `artifact_list`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactEntry {
    pub artifact_type: Option<&'static str>,
    pub name: String,
    /// Absolute, canonical path.
    pub path: String,
    pub is_dir: bool,
    /// Bytes for files, 0 for directories.
    pub size: u64,
    pub modified_ms: u64,
}

/// Result of `artifact_inline_create`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InlineDoc {
    pub id: String,
    pub url: String,
}

pub(crate) fn ensure_main(webview_label: &str) -> Result<(), ArtifactError> {
    if ALLOWED_WEBVIEWS.contains(&webview_label) {
        Ok(())
    } else {
        Err(ArtifactError::forbidden())
    }
}

pub(crate) fn modified_ms(meta: &std::fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Open a canonical path, check it is a regular file, sniff its type.
/// Returns the open handle (so size checks and reads use the same inode).
fn open_and_stat(
    roots: &Roots,
    session_id: &str,
    path: &Path,
) -> Result<(File, ArtifactStat, Kind), ArtifactError> {
    let mut file = File::open(path).map_err(ArtifactError::io)?;
    let meta = file.metadata().map_err(ArtifactError::io)?;
    if meta.is_dir() {
        return Err(ArtifactError::new("is_directory", "Path is a directory"));
    }
    if !meta.is_file() {
        return Err(ArtifactError::invalid_path("Not a regular file"));
    }
    let (mime, kind) = match mime::by_extension(path) {
        Some(found) => found,
        None => {
            let mut head = Vec::with_capacity(mime::SNIFF_BYTES);
            (&mut file)
                .take(mime::SNIFF_BYTES as u64)
                .read_to_end(&mut head)
                .map_err(ArtifactError::io)?;
            file.seek(SeekFrom::Start(0)).map_err(ArtifactError::io)?;
            mime::sniff(&head)
        }
    };
    let url = roots
        .relative(path)
        .map(|rel| protocol::file_url(session_id, &rel))
        .unwrap_or_default();
    let stat = ArtifactStat {
        artifact_type: None,
        path: path.to_string_lossy().into_owned(),
        name: file_name(path),
        mime: mime.to_string(),
        size: meta.len(),
        modified_ms: modified_ms(&meta),
        kind: kind.as_str(),
        url,
    };
    Ok((file, stat, kind))
}

/// Read a file fully, refusing anything over the limit for its kind.
pub(crate) fn read_file(
    roots: &Roots,
    session_id: &str,
    path: &Path,
) -> Result<ArtifactFile, ArtifactError> {
    let (file, stat, kind) = open_and_stat(roots, session_id, path)?;
    let limit = match kind {
        Kind::Text => MAX_TEXT_BYTES,
        Kind::Binary => MAX_BINARY_BYTES,
    };
    if stat.size > limit {
        return Err(ArtifactError::too_large(stat.size, limit));
    }
    let mut bytes = Vec::with_capacity(stat.size as usize);
    // Read at most limit+1 bytes so a file that grows mid-read is still capped.
    file.take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(ArtifactError::io)?;
    if bytes.len() as u64 > limit {
        return Err(ArtifactError::too_large(bytes.len() as u64, limit));
    }
    let (text, base64) = match kind {
        Kind::Text => {
            let body = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(&bytes);
            (Some(String::from_utf8_lossy(body).into_owned()), None)
        }
        Kind::Binary => (
            None,
            Some(base64::engine::general_purpose::STANDARD.encode(&bytes)),
        ),
    };
    Ok(ArtifactFile { stat, text, base64 })
}

/// Directory names never listed.
const SKIPPED_DIRS: &[&str] = &["node_modules", "target", "__pycache__", ".git"];

pub(crate) fn list_dir(roots: &Roots, dir: &Path) -> Result<Vec<ArtifactEntry>, ArtifactError> {
    let meta = std::fs::metadata(dir).map_err(ArtifactError::io)?;
    if !meta.is_dir() {
        return Err(ArtifactError::invalid_path("Not a directory"));
    }
    let mut out = Vec::new();
    for entry in std::fs::read_dir(dir).map_err(ArtifactError::io)? {
        if out.len() >= MAX_LIST_ENTRIES {
            break;
        }
        let Ok(entry) = entry else { continue };
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || SKIPPED_DIRS.contains(&name.as_str()) {
            continue;
        }
        // Resolve symlinks and drop anything that escapes the root.
        let Ok(canonical) = entry.path().canonicalize() else { continue };
        if roots.ensure_contained(&canonical).is_err() {
            continue;
        }
        let Ok(meta) = std::fs::metadata(&canonical) else { continue };
        let is_dir = meta.is_dir();
        out.push(ArtifactEntry {
            artifact_type: crate::motion::is_project(&canonical).then_some("motion"),
            name,
            path: canonical.to_string_lossy().into_owned(),
            is_dir,
            size: if is_dir { 0 } else { meta.len() },
            modified_ms: modified_ms(&meta),
        });
    }
    out.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(out)
}

/// One entry of the Files tab's tree.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeEntry {
    pub artifact_type: Option<&'static str>,
    pub name: String,
    /// Absolute, canonical path.
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified_ms: u64,
    /// Hidden (dot) entries and dependency/build folders: shown quietly, never expanded by default.
    pub quiet: bool,
}

/// One folder of the Files tab's tree.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeListing {
    /// The folder listed (absolute, canonical).
    pub dir: String,
    /// Folders first, then by name (case-insensitive); at most 500.
    pub entries: Vec<TreeEntry>,
    /// Entries left out past the cap.
    pub more: usize,
}

/// A name match anywhere in the working folder.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeMatch {
    pub artifact_type: Option<&'static str>,
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    /// Folder of the match relative to the working folder ("" at the top).
    pub folder: String,
    pub modified_ms: u64,
}

/// Folders that hold dependencies, caches or build output.
const HEAVY_DIRS: &[&str] = &["node_modules", "target", "__pycache__", ".git", "venv", ".venv", "dist", "build", ".next"];

fn is_quiet(name: &str, is_dir: bool) -> bool {
    name.starts_with('.') || (is_dir && HEAVY_DIRS.contains(&name))
}

/// Every entry of `dir` (hidden and heavy ones included, flagged `quiet`),
/// sorted folders first, capped at `MAX_LIST_ENTRIES`. Entries whose real
/// location is outside the root (symlinks) or in a protected folder are left out.
pub(crate) fn tree_list(roots: &Roots, dir: &Path) -> Result<TreeListing, ArtifactError> {
    let meta = std::fs::metadata(dir).map_err(ArtifactError::io)?;
    if !meta.is_dir() {
        return Err(ArtifactError::invalid_path("Not a directory"));
    }
    let mut all = Vec::new();
    for entry in std::fs::read_dir(dir).map_err(ArtifactError::io)?.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let Ok(canonical) = entry.path().canonicalize() else { continue };
        if roots.ensure_contained(&canonical).is_err() {
            continue;
        }
        let Ok(meta) = std::fs::metadata(&canonical) else { continue };
        let is_dir = meta.is_dir();
        all.push(TreeEntry {
            artifact_type: crate::motion::is_project(&canonical).then_some("motion"),
            quiet: is_quiet(&name, is_dir),
            name,
            path: canonical.to_string_lossy().into_owned(),
            is_dir,
            size: if is_dir { 0 } else { meta.len() },
            modified_ms: modified_ms(&meta),
        });
    }
    all.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            .then_with(|| a.name.cmp(&b.name))
    });
    let more = all.len().saturating_sub(MAX_LIST_ENTRIES);
    all.truncate(MAX_LIST_ENTRIES);
    Ok(TreeListing { dir: dir.to_string_lossy().into_owned(), entries: all, more })
}

/// Most entries looked at by one name search, and most matches returned.
const FIND_VISITS: usize = 20_000;
const FIND_MATCHES: usize = 200;

/// Names containing `query` (case-insensitive) anywhere under the root,
/// breadth first, skipping hidden entries and dependency folders. Bounded.
pub(crate) fn tree_find(roots: &Roots, query: &str) -> Vec<TreeMatch> {
    let needle = query.trim().to_lowercase();
    let mut out = Vec::new();
    if needle.is_empty() {
        return out;
    }
    let mut queue = std::collections::VecDeque::from([roots.root.clone()]);
    let mut visited = 0usize;
    while let Some(dir) = queue.pop_front() {
        let Ok(read) = std::fs::read_dir(&dir) else { continue };
        let mut entries: Vec<_> = read.flatten().collect();
        entries.sort_by_key(|e| e.file_name().to_string_lossy().to_lowercase());
        for entry in entries {
            visited += 1;
            if visited > FIND_VISITS || out.len() >= FIND_MATCHES {
                return out;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            let Ok(file_type) = entry.file_type() else { continue };
            // Symlinks are not followed while searching.
            if file_type.is_symlink() {
                continue;
            }
            let is_dir = file_type.is_dir();
            if is_quiet(&name, is_dir) {
                continue;
            }
            let path = entry.path();
            if roots.ensure_contained(&path).is_err() {
                continue;
            }
            if name.to_lowercase().contains(&needle) {
                let folder = path
                    .parent()
                    .and_then(|p| p.strip_prefix(&roots.root).ok())
                    .map(|p| p.to_string_lossy().into_owned())
                    .unwrap_or_default();
                let modified = entry.metadata().map(|m| modified_ms(&m)).unwrap_or(0);
                out.push(TreeMatch { artifact_type: crate::motion::is_project(&path).then_some("motion"), name, path: path.to_string_lossy().into_owned(), is_dir, folder, modified_ms: modified });
            }
            if is_dir && !crate::motion::is_project(&path) {
                queue.push_back(path);
            }
        }
    }
    out
}

async fn blocking<T, F>(f: F) -> Result<T, ArtifactError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, ArtifactError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| ArtifactError::new("internal", e.to_string()))?
}

/// Read an artifact's contents. `path` is absolute or relative to the
/// session's working folder. Text is capped at 2 MB, binary at 25 MB.
#[tauri::command]
pub async fn artifact_read(
    webview: Webview,
    session_id: String,
    path: String,
) -> Result<ArtifactFile, ArtifactError> {
    ensure_main(webview.label())?;
    let roots = roots_for_session(&session_id).await?;
    blocking(move || {
        let canonical = roots.resolve(&path)?;
        read_file(&roots, &session_id, &canonical)
    })
    .await
}

/// Same metadata as `artifact_read`, without the contents.
/// Write `bytes` to `path` atomically (temp file in the same folder, then rename).
pub(crate) fn write_file(path: &Path, bytes: &[u8]) -> Result<(), ArtifactError> {
    use std::io::Write;
    if bytes.len() as u64 > MAX_BINARY_BYTES {
        return Err(ArtifactError::new(
            "too_large",
            format!("File is larger than {} MB", MAX_BINARY_BYTES / (1024 * 1024)),
        ));
    }
    if path.is_dir() {
        return Err(ArtifactError::new("is_directory", "Path is a directory"));
    }
    let dir = path
        .parent()
        .ok_or_else(|| ArtifactError::invalid_path("Path has no parent folder"))?;
    let name = path
        .file_name()
        .ok_or_else(|| ArtifactError::invalid_path("Path must end in a file name"))?
        .to_string_lossy();
    let tmp = dir.join(format!(".{}.{}.tmp", name, std::process::id()));
    let result = (|| {
        let mut file = File::create(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        std::fs::rename(&tmp, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    result.map_err(ArtifactError::io)
}

/// Save a file inside the session's working folder. Exactly one of `text` or
/// `base64` must be given. Creates the file if it does not exist; the parent
/// folder must already exist.
#[tauri::command]
pub async fn artifact_write(
    webview: Webview,
    session_id: String,
    path: String,
    text: Option<String>,
    base64: Option<String>,
) -> Result<ArtifactStat, ArtifactError> {
    ensure_main(webview.label())?;
    let roots = roots_for_session(&session_id).await?;
    blocking(move || {
        let bytes = match (text, base64) {
            (Some(t), None) => t.into_bytes(),
            (None, Some(b)) => base64::engine::general_purpose::STANDARD
                .decode(b.as_bytes())
                .map_err(|_| ArtifactError::invalid_path("base64 content is not valid"))?,
            _ => {
                return Err(ArtifactError::invalid_path(
                    "Provide exactly one of text or base64",
                ))
            }
        };
        let target = roots.resolve_for_write(&path)?;
        write_file(&target, &bytes)?;
        let canonical = roots.resolve(&target.to_string_lossy())?;
        open_and_stat(&roots, &session_id, &canonical).map(|(_, stat, _)| stat)
    })
    .await
}

#[tauri::command]
pub async fn artifact_stat(
    webview: Webview,
    session_id: String,
    path: String,
) -> Result<ArtifactStat, ArtifactError> {
    ensure_main(webview.label())?;
    let roots = roots_for_session(&session_id).await?;
    blocking(move || {
        let canonical = roots.resolve(&path)?;
        if crate::motion::is_project(&canonical) {
            return Ok(ArtifactStat { artifact_type: Some("motion"), path: canonical.to_string_lossy().into(), name: file_name(&canonical), mime: "application/x-hyperframes-project".into(), size: 0, modified_ms: crate::motion::project_stamp(&canonical), kind: "binary", url: String::new() });
        }
        open_and_stat(&roots, &session_id, &canonical).map(|(_, stat, _)| stat)
    })
    .await
}

/// The first rows (up to 6 × 5, as text) of a workbook's first sheet, for
/// the Artifacts page thumbnail. Only .xlsx/.xlsm; workbooks over 25 MB and
/// anything that is not a readable workbook give an error.
#[tauri::command]
pub async fn artifact_sheet_head(
    webview: Webview,
    session_id: String,
    path: String,
) -> Result<Vec<Vec<super::sheet_head::PreviewCell>>, ArtifactError> {
    ensure_main(webview.label())?;
    let roots = roots_for_session(&session_id).await?;
    blocking(move || {
        let canonical = roots.resolve(&path)?;
        let ext = canonical.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
        if !matches!(ext.as_str(), "xlsx" | "xlsm") {
            return Err(ArtifactError::invalid_path("Not an .xlsx workbook"));
        }
        super::sheet_head::head(&canonical).map_err(|e| ArtifactError::new("io", e))
    })
    .await
}

/// The cells of `sheet!r1c1:r2c2` (1-based, inclusive, at most 400) of an
/// .xlsx as text: the values stored in the file, for a dashboard's
/// thumbnail (no spreadsheet engine).
#[tauri::command]
pub async fn artifact_sheet_range(
    webview: Webview,
    session_id: String,
    path: String,
    sheet: String,
    r1: usize,
    c1: usize,
    r2: usize,
    c2: usize,
) -> Result<Vec<Vec<String>>, ArtifactError> {
    ensure_main(webview.label())?;
    let roots = roots_for_session(&session_id).await?;
    blocking(move || {
        let canonical = roots.resolve(&path)?;
        let ext = canonical.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
        if !matches!(ext.as_str(), "xlsx" | "xlsm") {
            return Err(ArtifactError::invalid_path("Not an .xlsx workbook"));
        }
        super::sheet_head::range(&canonical, &sheet, r1, c1, r2, c2).map_err(|e| ArtifactError::new("io", e))
    })
    .await
}

/// Non-recursive listing of `dir` (default: the working folder). Hidden
/// entries, node_modules, target, __pycache__ are skipped; at most 500 entries.
#[tauri::command]
pub async fn artifact_list(
    webview: Webview,
    session_id: String,
    dir: Option<String>,
) -> Result<Vec<ArtifactEntry>, ArtifactError> {
    ensure_main(webview.label())?;
    let roots = roots_for_session(&session_id).await?;
    blocking(move || {
        let dir: PathBuf = match dir.as_deref().filter(|d| !d.is_empty()) {
            Some(d) => roots.resolve(d)?,
            None => roots.root.clone(),
        };
        list_dir(&roots, &dir)
    })
    .await
}

/// One folder of the Files tab (default: the working folder): every entry,
/// hidden and dependency folders included and flagged, folders first.
#[tauri::command]
pub async fn artifact_tree_list(
    webview: Webview,
    session_id: String,
    dir: Option<String>,
) -> Result<TreeListing, ArtifactError> {
    ensure_main(webview.label())?;
    let roots = roots_for_session(&session_id).await?;
    blocking(move || {
        let dir: PathBuf = match dir.as_deref().filter(|d| !d.is_empty()) {
            Some(d) => roots.resolve(d)?,
            None => roots.root.clone(),
        };
        tree_list(&roots, &dir)
    })
    .await
}

/// Names matching `query` anywhere in the working folder (the Files tab's filter).
#[tauri::command]
pub async fn artifact_tree_find(
    webview: Webview,
    session_id: String,
    query: String,
) -> Result<Vec<TreeMatch>, ArtifactError> {
    ensure_main(webview.label())?;
    let roots = roots_for_session(&session_id).await?;
    blocking(move || Ok(tree_find(&roots, &query))).await
}

/// Watch the whole working folder; emits `artifact:changed` with the folder
/// as `path` when anything in it changes. Returns the watch id (stop it with
/// `artifact_unwatch`).
#[tauri::command]
pub async fn artifact_watch_tree(
    app: AppHandle,
    webview: Webview,
    session_id: String,
) -> Result<String, ArtifactError> {
    ensure_main(webview.label())?;
    let roots = roots_for_session(&session_id).await?;
    let window_label = webview.window().label().to_string();
    watch::add_tree(app, webview.label().to_string(), window_label, roots.root.clone(), session_id)
}

/// Watch one file; emits `artifact:changed { watchId, path, modifiedMs }`
/// (debounced ~150 ms). Returns the watch id.
#[tauri::command]
pub async fn artifact_watch(
    app: AppHandle,
    webview: Webview,
    session_id: String,
    path: String,
) -> Result<String, ArtifactError> {
    ensure_main(webview.label())?;
    let roots = roots_for_session(&session_id).await?;
    let canonical = blocking(move || {
        let canonical = roots.resolve(&path)?;
        if canonical.is_dir() {
            return Err(ArtifactError::new("is_directory", "Path is a directory"));
        }
        Ok(canonical)
    })
    .await?;
    let window_label = webview.window().label().to_string();
    watch::add(app, webview.label().to_string(), window_label, canonical, session_id)
}

/// Stop a watch. Unknown ids are ignored.
#[tauri::command]
pub async fn artifact_unwatch(
    webview: Webview,
    watch_id: String,
) -> Result<(), ArtifactError> {
    ensure_main(webview.label())?;
    watch::remove(&watch_id);
    Ok(())
}

/// Register generated HTML (e.g. a React/Markdown/Mermaid harness) and get an
/// `artifact:` URL that serves it with the sandboxing CSP. Kept in memory until
/// released, the page reloads, or 32 newer documents evict it.
#[tauri::command]
pub async fn artifact_inline_create(
    webview: Webview,
    html: String,
) -> Result<InlineDoc, ArtifactError> {
    ensure_main(webview.label())?;
    let id = inline::insert(webview.label(), html)?;
    Ok(InlineDoc {
        url: protocol::inline_url(&id),
        id,
    })
}

/// Drop an inline document. Unknown ids are ignored.
#[tauri::command]
pub async fn artifact_inline_release(
    webview: Webview,
    id: String,
) -> Result<(), ArtifactError> {
    ensure_main(webview.label())?;
    inline::remove(&id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    struct Dir(PathBuf);
    impl Drop for Dir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn setup() -> (Dir, Roots) {
        let base = std::env::temp_dir().join(format!("vw-artifacts-cmd-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(base.join("sub")).unwrap();
        fs::create_dir_all(base.join("node_modules")).unwrap();
        fs::write(base.join("index.html"), "\u{feff}<h1>héllo</h1>").unwrap();
        fs::write(base.join("chart.png"), b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR").unwrap();
        fs::write(base.join(".hidden"), "x").unwrap();
        fs::write(base.join("sub/a.md"), "# a").unwrap();
        let roots = Roots::new(&base, &[]).unwrap();
        (Dir(base), roots)
    }

    #[test]
    fn reads_text_lossy_without_bom() {
        let (_d, roots) = setup();
        let p = roots.resolve("index.html").unwrap();
        let f = read_file(&roots, "sess-1", &p).unwrap();
        assert_eq!(f.stat.kind, "text");
        assert_eq!(f.stat.mime, "text/html");
        assert_eq!(f.text.as_deref(), Some("<h1>héllo</h1>"));
        assert!(f.base64.is_none());
        assert_eq!(f.stat.name, "index.html");
        assert!(f.stat.modified_ms > 0);
        assert_eq!(f.stat.url, protocol::file_url("sess-1", Path::new("index.html")));
    }

    #[test]
    fn reads_binary_as_base64() {
        let (_d, roots) = setup();
        let p = roots.resolve("chart.png").unwrap();
        let f = read_file(&roots, "s", &p).unwrap();
        assert_eq!(f.stat.kind, "binary");
        assert_eq!(f.stat.mime, "image/png");
        assert!(f.text.is_none());
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(f.base64.unwrap())
            .unwrap();
        assert_eq!(decoded, b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR");
    }

    #[test]
    fn invalid_utf8_text_is_lossy() {
        let (d, roots) = setup();
        fs::write(d.0.join("bad.txt"), b"ok \xff\xfe end").unwrap();
        let p = roots.resolve("bad.txt").unwrap();
        let f = read_file(&roots, "s", &p).unwrap();
        assert_eq!(f.text.as_deref(), Some("ok \u{fffd}\u{fffd} end"));
    }

    #[test]
    fn text_size_cap() {
        let (d, roots) = setup();
        let big = d.0.join("big.txt");
        fs::write(&big, vec![b'a'; (MAX_TEXT_BYTES + 1) as usize]).unwrap();
        let p = roots.resolve("big.txt").unwrap();
        let e = read_file(&roots, "s", &p).unwrap_err();
        assert_eq!(e.code, "too_large");
        // Exactly at the limit is fine.
        fs::write(&big, vec![b'a'; MAX_TEXT_BYTES as usize]).unwrap();
        assert!(read_file(&roots, "s", &p).is_ok());
    }

    #[test]
    fn binary_size_cap() {
        let (d, roots) = setup();
        let big = d.0.join("big.bin");
        let f = File::create(&big).unwrap();
        f.set_len(MAX_BINARY_BYTES + 1).unwrap(); // sparse
        let p = roots.resolve("big.bin").unwrap();
        assert_eq!(read_file(&roots, "s", &p).unwrap_err().code, "too_large");
        // A 3 MB binary is over the text cap but within the binary cap.
        f.set_len(3 * 1024 * 1024).unwrap();
        assert!(read_file(&roots, "s", &p).is_ok());
    }

    #[test]
    fn stat_rejects_directory() {
        let (_d, roots) = setup();
        let p = roots.resolve("sub").unwrap();
        assert_eq!(open_and_stat(&roots, "s", &p).unwrap_err().code, "is_directory");
    }

    #[test]
    fn list_skips_hidden_and_node_modules_dirs_first() {
        let (_d, roots) = setup();
        let entries = list_dir(&roots, &roots.root).unwrap();
        let names: Vec<_> = entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["sub", "chart.png", "index.html"]);
        assert!(entries[0].is_dir);
        assert_eq!(entries[0].size, 0);
    }

    #[test]
    fn list_cap() {
        let (d, roots) = setup();
        let many = d.0.join("many");
        fs::create_dir_all(&many).unwrap();
        for i in 0..(MAX_LIST_ENTRIES + 20) {
            fs::write(many.join(format!("f{i}.txt")), "").unwrap();
        }
        assert_eq!(list_dir(&roots, &many).unwrap().len(), MAX_LIST_ENTRIES);
    }

    #[cfg(unix)]
    #[test]
    fn list_drops_escaping_symlinks() {
        let (d, roots) = setup();
        std::os::unix::fs::symlink("/etc", d.0.join("etc_link")).unwrap();
        let entries = list_dir(&roots, &roots.root).unwrap();
        assert!(entries.iter().all(|e| e.name != "etc_link"));
    }

    #[test]
    fn tree_lists_everything_quiet_ones_flagged() {
        let (d, roots) = setup();
        fs::create_dir_all(d.0.join(".git")).unwrap();
        let listing = tree_list(&roots, &roots.root).unwrap();
        let names: Vec<(&str, bool)> = listing.entries.iter().map(|e| (e.name.as_str(), e.quiet)).collect();
        assert_eq!(
            names,
            vec![(".git", true), ("node_modules", true), ("sub", false), (".hidden", true), ("chart.png", false), ("index.html", false)]
        );
        assert_eq!(listing.more, 0);
    }

    #[test]
    fn tree_cap_reports_the_rest() {
        let (d, roots) = setup();
        let many = d.0.join("many");
        fs::create_dir_all(&many).unwrap();
        for i in 0..(MAX_LIST_ENTRIES + 7) {
            fs::write(many.join(format!("f{i:04}.txt")), "").unwrap();
        }
        let listing = tree_list(&roots, &many).unwrap();
        assert_eq!(listing.entries.len(), MAX_LIST_ENTRIES);
        assert_eq!(listing.more, 7);
        assert_eq!(listing.entries[0].name, "f0000.txt");
    }

    #[test]
    fn find_searches_nested_names_but_not_dependencies() {
        let (d, roots) = setup();
        fs::create_dir_all(d.0.join("sub/deeper")).unwrap();
        fs::write(d.0.join("sub/deeper/Report.md"), "").unwrap();
        fs::write(d.0.join("node_modules/report.js"), "").unwrap();
        let found = tree_find(&roots, "repo");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "Report.md");
        assert_eq!(found[0].folder, "sub/deeper");
        assert!(tree_find(&roots, "  ").is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn tree_drops_escaping_symlinks() {
        let (d, roots) = setup();
        std::os::unix::fs::symlink("/etc", d.0.join("etc_link")).unwrap();
        assert!(tree_list(&roots, &roots.root).unwrap().entries.iter().all(|e| e.name != "etc_link"));
        assert!(tree_find(&roots, "etc").is_empty());
    }

    #[test]
    fn only_main_webview() {
        assert!(ensure_main("main").is_ok());
        for label in ["overlay", "loading", "browser", "main-child"] {
            assert_eq!(ensure_main(label).unwrap_err().code, "forbidden");
        }
    }
}
