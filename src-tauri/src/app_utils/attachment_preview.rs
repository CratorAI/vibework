//! Downscaled previews of images the user attached.
//!
//! The composer and sent messages show attached images as small tiles. The
//! webview cannot read arbitrary local files, so it asks for a preview here.
//! Only paths the user handed to the app are readable: ones picked in the
//! native file dialog, dropped on the main window, or named in the user's own
//! messages (loaded history). Anything else, and anything that is not a
//! raster image, is refused.

use std::collections::{HashMap, HashSet};
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

use base64::Engine as _;
use once_cell::sync::Lazy;

/// Larger files are not decoded for a preview.
const MAX_INPUT_BYTES: u64 = 40 * 1024 * 1024;
/// Decoder limits: refuse images whose pixels would not fit sensibly in memory.
const MAX_DIMENSION: u32 = 16_384;
const MAX_ALLOC: u64 = 512 * 1024 * 1024;
const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp"];
const CACHE_ENTRIES: usize = 48;

static ATTACHED: Lazy<Mutex<HashSet<PathBuf>>> = Lazy::new(|| Mutex::new(HashSet::new()));
type CacheKey = (PathBuf, u32);
static CACHE: Lazy<Mutex<HashMap<CacheKey, (SystemTime, u64, String)>>> = Lazy::new(|| Mutex::new(HashMap::new()));

/// Paths the user handed to the app. Unresolvable paths are ignored.
pub fn register<I, P>(paths: I)
where
    I: IntoIterator<Item = P>,
    P: AsRef<Path>,
{
    let resolved: Vec<PathBuf> = paths.into_iter().filter_map(|p| p.as_ref().canonicalize().ok()).collect();
    if resolved.is_empty() {
        return;
    }
    let mut set = ATTACHED.lock().unwrap();
    set.extend(resolved);
}

/// Paths named in `<vibe-work-attachment>` tags of a message the user sent.
pub fn register_message(text: &str, working_dir: Option<&str>) {
    if !text.contains("<vibe-work-attachment>") {
        return;
    }
    let paths = text.split("<vibe-work-attachment>").skip(1).filter_map(|part| {
        let (raw, _) = part.split_once("</vibe-work-attachment>")?;
        let path = Path::new(raw.trim());
        Some(if path.is_absolute() { path.to_path_buf() } else { Path::new(working_dir.unwrap_or("")).join(path) })
    });
    register(paths);
}

fn is_registered(path: &Path) -> bool {
    ATTACHED.lock().unwrap().contains(path)
}

fn is_image_extension(path: &Path) -> bool {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    IMAGE_EXTENSIONS.contains(&ext.as_str())
}

/// A data URL of the image at `path`, no larger than `max_px` on its longer side.
pub fn preview(path: &str, max_px: u32) -> Result<String, String> {
    let max_px = max_px.clamp(16, 2048);
    let path = Path::new(path).canonicalize().map_err(|_| "Couldn’t find the file.".to_string())?;
    if !is_image_extension(&path) {
        return Err("Not an image.".into());
    }
    if !is_registered(&path) {
        return Err("Only attached files can be previewed.".into());
    }
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("Not an image.".into());
    }
    if meta.len() > MAX_INPUT_BYTES {
        return Err("The image is too large to preview.".into());
    }
    let modified = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
    let key = (path.clone(), max_px);
    if let Some((mtime, len, url)) = CACHE.lock().unwrap().get(&key) {
        if *mtime == modified && *len == meta.len() {
            return Ok(url.clone());
        }
    }

    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    // The extension is a hint; the content decides.
    if !infer::get(&bytes).is_some_and(|t| t.matcher_type() == infer::MatcherType::Image) {
        return Err("Not an image.".into());
    }
    let mut reader = image::ImageReader::new(Cursor::new(&bytes)).with_guessed_format().map_err(|e| e.to_string())?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(MAX_DIMENSION);
    limits.max_image_height = Some(MAX_DIMENSION);
    limits.max_alloc = Some(MAX_ALLOC);
    reader.limits(limits);
    let image = reader.decode().map_err(|_| "Couldn’t read the image.".to_string())?;
    let image = if image.width() > max_px || image.height() > max_px { image.thumbnail(max_px, max_px) } else { image };

    let mut out = Vec::new();
    let mime = if image.color().has_alpha() {
        image.write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png).map_err(|e| e.to_string())?;
        "image/png"
    } else {
        let rgb = image.to_rgb8();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 85).encode_image(&rgb).map_err(|e| e.to_string())?;
        "image/jpeg"
    };
    let url = format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(&out));

    let mut cache = CACHE.lock().unwrap();
    if cache.len() >= CACHE_ENTRIES {
        cache.clear();
    }
    cache.insert(key, (modified, meta.len(), url.clone()));
    Ok(url)
}

/// A downscaled data URL of an attached image (off the main thread).
#[tauri::command]
pub async fn attachment_preview(path: String, max_px: u32) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || preview(&path, max_px))
        .await
        .map_err(|e| e.to_string())?
}

/// Original image bytes for the design editor, scoped to user-granted attachments.
/// Very large images use the existing bounded preview decoder instead.
#[tauri::command]
pub async fn attachment_design_image(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || design_image(&path)).await.map_err(|e| e.to_string())?
}

fn design_image(path: &str) -> Result<String, String> {
    let canonical = Path::new(path).canonicalize().map_err(|_| "Couldn’t find the image.")?;
    if !is_registered(&canonical) { return Err("Only attached images can be imported.".into()); }
    let meta = std::fs::metadata(&canonical).map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.len() > MAX_INPUT_BYTES { return Err("Choose an image under 40 MB.".into()); }
    let bytes = std::fs::read(&canonical).map_err(|e| e.to_string())?;
    let kind = infer::get(&bytes).ok_or("Not an image.")?;
    if !["image/png", "image/jpeg", "image/webp", "image/gif"].contains(&kind.mime_type()) {
        return Err("Choose a PNG, JPEG, WebP or GIF image.".into());
    }
    let reader = image::ImageReader::new(Cursor::new(&bytes)).with_guessed_format().map_err(|e| e.to_string())?;
    let (w,h) = reader.into_dimensions().map_err(|_| "Couldn’t read the image size.")?;
    if u64::from(w) * u64::from(h) > 24_000_000 || meta.len() > 8 * 1024 * 1024 {
        return preview(path, 2048);
    }
    Ok(format!("data:{};base64,{}",kind.mime_type(),base64::engine::general_purpose::STANDARD.encode(bytes)))
}

/// The native file picker for attachments. What the user picks becomes
/// previewable; nothing else does.
#[tauri::command]
pub async fn attachment_pick(app: tauri::AppHandle) -> Result<Option<Vec<String>>, String> {
    use tauri_plugin_dialog::DialogExt;
    let picked = tauri::async_runtime::spawn_blocking(move || app.dialog().file().blocking_pick_files())
        .await
        .map_err(|e| e.to_string())?;
    let Some(files) = picked else { return Ok(None) };
    let paths: Vec<PathBuf> = files.into_iter().filter_map(|f| f.into_path().ok()).collect();
    register(&paths);
    Ok(Some(paths.into_iter().map(|p| p.to_string_lossy().to_string()).collect()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("vibework-preview-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_png(path: &Path, w: u32, h: u32) {
        let img = image::RgbImage::from_fn(w, h, |x, y| image::Rgb([(x % 255) as u8, (y % 255) as u8, 90]));
        img.save(path).unwrap();
    }

    #[test]
    fn previews_an_attached_image_downscaled() {
        let dir = temp_dir();
        let png = dir.join("photo.png");
        write_png(&png, 640, 320);
        register([&png]);
        let url = preview(png.to_str().unwrap(), 112).unwrap();
        assert!(url.starts_with("data:image/jpeg;base64,"));
        let bytes = base64::engine::general_purpose::STANDARD.decode(url.split_once(',').unwrap().1).unwrap();
        let thumb = image::load_from_memory(&bytes).unwrap();
        assert_eq!((thumb.width(), thumb.height()), (112, 56));
        // Cached by path and size
        assert_eq!(preview(png.to_str().unwrap(), 112).unwrap(), url);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn refuses_unattached_and_non_images() {
        let dir = temp_dir();
        let png = dir.join("never-attached.png");
        write_png(&png, 8, 8);
        assert!(preview(png.to_str().unwrap(), 112).unwrap_err().contains("attached"));

        let text = dir.join("notes.txt");
        std::fs::write(&text, "hello").unwrap();
        register([&text]);
        assert_eq!(preview(text.to_str().unwrap(), 112).unwrap_err(), "Not an image.");

        // A text file dressed as an image is still refused
        let fake = dir.join("fake.png");
        std::fs::write(&fake, "not really a png").unwrap();
        register([&fake]);
        assert_eq!(preview(fake.to_str().unwrap(), 112).unwrap_err(), "Not an image.");

        assert!(preview(dir.join("missing.png").to_str().unwrap(), 112).is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn design_import_preserves_original_and_requires_grant() {
        let dir = temp_dir(); let path = dir.join("original.png"); write_png(&path, 640, 320);
        assert!(design_image(path.to_str().unwrap()).is_err());
        register([&path]); let url = design_image(path.to_str().unwrap()).unwrap();
        assert!(url.starts_with("data:image/png;base64,"));
        let bytes = base64::engine::general_purpose::STANDARD.decode(url.split_once(',').unwrap().1).unwrap();
        assert_eq!(bytes, std::fs::read(&path).unwrap());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn registers_paths_from_message_tags() {
        let dir = temp_dir();
        let png = dir.join("from-history.png");
        write_png(&png, 4, 4);
        register_message("<vibe-work-attachment>from-history.png</vibe-work-attachment>\nhello", dir.to_str());
        assert!(preview(png.to_str().unwrap(), 64).is_ok());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
