use serde_json::{json, Value};

/// Largest attachment the engine inlines into the model request (about 50k
/// tokens of text).
const INLINE_TEXT_LIMIT: u64 = 200 * 1024;

fn is_image(ext: &str) -> bool {
    matches!(ext, "png" | "jpg" | "jpeg" | "gif" | "webp")
}

/// Whether an attachment goes to the engine's file API (which inlines it) or
/// only stays named in the message.
fn inlined(ext: &str, len: u64) -> bool {
    is_image(ext) || ext == "pdf" || len <= INLINE_TEXT_LIMIT
}

/// Preserve the original text tags for native-equivalent history rendering,
/// while passing actual files through OpenCode's prompt file API.
pub async fn files(message: &str, folder: &str, model: &str) -> Result<Vec<Value>, String> {
    if !message.contains("<vibe-work-attachment>") { return Ok(Vec::new()); }
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    crate::models::ensure_loaded().await;
    let models = crate::models::list(false).await?;
    let images = models.iter().find(|m| m.id == model).is_some_and(|m| m.supports_images);
    for part in message.split("<vibe-work-attachment>").skip(1) {
        let Some((raw, _)) = part.split_once("</vibe-work-attachment>") else { continue };
        let path = std::path::Path::new(raw.trim());
        let path = if path.is_absolute() {path.to_path_buf()} else {std::path::Path::new(folder).join(path)};
        let path = path.canonicalize().map_err(|e| format!("Cannot attach {}: {e}", path.display()))?;
        if !seen.insert(path.clone()) { continue; }
        let stat = path.metadata().map_err(|e| e.to_string())?;
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
        if is_image(&ext) {
            if !images { return Err(format!("{model} does not accept images. Choose an image-capable model or remove the image.")); }
            if stat.len() > 5 * 1024 * 1024 { return Err("Image exceeds the 5 MB attachment limit".into()); }
        }
        if ext == "pdf" && stat.len() > 32 * 1024 * 1024 {return Err("PDF exceeds the 32 MB attachment limit".into());}
        // The engine puts a text file's whole content into the request (and
        // every later one). A large file stays a path in the message, which
        // the agent reads with its tools a part at a time.
        if !inlined(&ext, stat.len()) { continue; }
        let uri = reqwest::Url::from_file_path(&path).map_err(|_| "Cannot represent attachment path")?;
        out.push(json!({"uri":uri.as_str(),"name":path.file_name().unwrap_or_default().to_string_lossy()}));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn large_text_attachments_stay_a_path() {
        assert!(inlined("csv", 40 * 1024));
        assert!(!inlined("csv", 60 * 1024 * 1024));
        assert!(!inlined("txt", INLINE_TEXT_LIMIT + 1));
        // Images and PDFs have their own limits above.
        assert!(inlined("png", 4 * 1024 * 1024));
        assert!(inlined("pdf", 10 * 1024 * 1024));
    }
}
