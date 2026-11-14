//! MIME type and text/binary detection: callers use the extension table first
//! and fall back to a content sniff (magic numbers via `infer`, then a UTF-8 /
//! NUL-byte heuristic) only when the extension is unknown.

use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Text,
    Binary,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Text => "text",
            Kind::Binary => "binary",
        }
    }
}

/// Bytes read from the start of a file for sniffing.
pub const SNIFF_BYTES: usize = 8192;

use Kind::{Binary as B, Text as T};

/// Extension (lowercase, no dot) -> (mime, kind).
const TABLE: &[(&str, &str, Kind)] = &[
    // Web
    ("html", "text/html", T),
    ("htm", "text/html", T),
    ("xhtml", "application/xhtml+xml", T),
    ("css", "text/css", T),
    ("js", "text/javascript", T),
    ("mjs", "text/javascript", T),
    ("cjs", "text/javascript", T),
    ("jsx", "text/jsx", T),
    ("ts", "text/typescript", T),
    ("mts", "text/typescript", T),
    ("cts", "text/typescript", T),
    ("tsx", "text/tsx", T),
    ("vue", "text/x-vue", T),
    ("svelte", "text/x-svelte", T),
    ("json", "application/json", T),
    ("jsonl", "application/jsonl", T),
    ("ndjson", "application/x-ndjson", T),
    ("map", "application/json", T),
    ("webmanifest", "application/manifest+json", T),
    ("ipynb", "application/x-ipynb+json", T),
    ("svg", "image/svg+xml", T),
    ("xml", "application/xml", T),
    // Docs and data
    ("md", "text/markdown", T),
    ("markdown", "text/markdown", T),
    ("mdx", "text/mdx", T),
    ("txt", "text/plain", T),
    ("text", "text/plain", T),
    ("log", "text/plain", T),
    ("csv", "text/csv", T),
    ("tsv", "text/tab-separated-values", T),
    ("yaml", "application/yaml", T),
    ("yml", "application/yaml", T),
    ("toml", "application/toml", T),
    ("ini", "text/plain", T),
    ("cfg", "text/plain", T),
    ("conf", "text/plain", T),
    ("env", "text/plain", T),
    ("mmd", "text/x-mermaid", T),
    ("mermaid", "text/x-mermaid", T),
    ("tex", "text/x-tex", T),
    ("bib", "text/x-bibtex", T),
    ("rst", "text/x-rst", T),
    ("adoc", "text/asciidoc", T),
    ("org", "text/x-org", T),
    ("diff", "text/x-diff", T),
    ("patch", "text/x-diff", T),
    ("graphql", "application/graphql", T),
    ("gql", "application/graphql", T),
    ("sql", "application/sql", T),
    ("rtf", "application/rtf", T),
    // Code
    ("py", "text/x-python", T),
    ("pyi", "text/x-python", T),
    ("rs", "text/x-rust", T),
    ("sh", "text/x-shellscript", T),
    ("bash", "text/x-shellscript", T),
    ("zsh", "text/x-shellscript", T),
    ("fish", "text/x-shellscript", T),
    ("ps1", "text/plain", T),
    ("bat", "text/plain", T),
    ("c", "text/x-c", T),
    ("h", "text/x-c", T),
    ("cc", "text/x-c++", T),
    ("cpp", "text/x-c++", T),
    ("cxx", "text/x-c++", T),
    ("hpp", "text/x-c++", T),
    ("cs", "text/x-csharp", T),
    ("java", "text/x-java", T),
    ("kt", "text/x-kotlin", T),
    ("kts", "text/x-kotlin", T),
    ("swift", "text/x-swift", T),
    ("go", "text/x-go", T),
    ("rb", "text/x-ruby", T),
    ("php", "text/x-php", T),
    ("pl", "text/x-perl", T),
    ("lua", "text/x-lua", T),
    ("r", "text/x-r", T),
    ("scala", "text/x-scala", T),
    ("dart", "text/x-dart", T),
    ("ex", "text/x-elixir", T),
    ("exs", "text/x-elixir", T),
    ("erl", "text/x-erlang", T),
    ("hs", "text/x-haskell", T),
    ("clj", "text/x-clojure", T),
    ("zig", "text/x-zig", T),
    ("nim", "text/x-nim", T),
    ("scss", "text/x-scss", T),
    ("sass", "text/x-sass", T),
    ("less", "text/x-less", T),
    ("dockerfile", "text/plain", T),
    ("makefile", "text/plain", T),
    ("gitignore", "text/plain", T),
    // Images
    ("png", "image/png", B),
    ("jpg", "image/jpeg", B),
    ("jpeg", "image/jpeg", B),
    ("gif", "image/gif", B),
    ("webp", "image/webp", B),
    ("avif", "image/avif", B),
    ("bmp", "image/bmp", B),
    ("ico", "image/x-icon", B),
    ("tif", "image/tiff", B),
    ("tiff", "image/tiff", B),
    ("heic", "image/heic", B),
    // Documents
    ("pdf", "application/pdf", B),
    ("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", B),
    ("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", B),
    ("pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", B),
    ("doc", "application/msword", B),
    ("xls", "application/vnd.ms-excel", B),
    ("ppt", "application/vnd.ms-powerpoint", B),
    ("odt", "application/vnd.oasis.opendocument.text", B),
    ("ods", "application/vnd.oasis.opendocument.spreadsheet", B),
    ("odp", "application/vnd.oasis.opendocument.presentation", B),
    ("epub", "application/epub+zip", B),
    // Media
    ("mp4", "video/mp4", B),
    ("m4v", "video/mp4", B),
    ("webm", "video/webm", B),
    ("mov", "video/quicktime", B),
    ("mp3", "audio/mpeg", B),
    ("wav", "audio/wav", B),
    ("ogg", "audio/ogg", B),
    ("oga", "audio/ogg", B),
    ("m4a", "audio/mp4", B),
    ("aac", "audio/aac", B),
    ("flac", "audio/flac", B),
    // Fonts, archives, misc
    ("woff", "font/woff", B),
    ("woff2", "font/woff2", B),
    ("ttf", "font/ttf", B),
    ("otf", "font/otf", B),
    ("wasm", "application/wasm", B),
    ("zip", "application/zip", B),
    ("gz", "application/gzip", B),
    ("tgz", "application/gzip", B),
    ("tar", "application/x-tar", B),
    ("7z", "application/x-7z-compressed", B),
    ("sqlite", "application/vnd.sqlite3", B),
    ("db", "application/octet-stream", B),
    ("bin", "application/octet-stream", B),
];

/// Lookup by extension (case-insensitive). Files without an extension are
/// matched by their whole name (e.g. `Makefile`, `Dockerfile`).
pub fn by_extension(path: &Path) -> Option<(&'static str, Kind)> {
    let key = match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => ext.to_ascii_lowercase(),
        None => path.file_name()?.to_str()?.trim_start_matches('.').to_ascii_lowercase(),
    };
    TABLE
        .iter()
        .find(|(ext, _, _)| *ext == key)
        .map(|(_, mime, kind)| (*mime, *kind))
}

/// Content sniff for files whose extension is unknown.
pub fn sniff(head: &[u8]) -> (&'static str, Kind) {
    if head.is_empty() {
        return ("text/plain", Kind::Text);
    }
    if let Some(t) = infer::get(head) {
        let mime = t.mime_type();
        let textual = mime.starts_with("text/")
            || mime == "application/xml"
            || mime == "image/svg+xml"
            || mime == "application/json";
        return (mime, if textual { Kind::Text } else { Kind::Binary });
    }
    if looks_like_text(head) {
        let trimmed = head
            .strip_prefix(b"\xEF\xBB\xBF")
            .unwrap_or(head)
            .trim_ascii_start();
        let lower: Vec<u8> = trimmed.iter().take(15).map(u8::to_ascii_lowercase).collect();
        if lower.starts_with(b"<!doctype html") || lower.starts_with(b"<html") {
            return ("text/html", Kind::Text);
        }
        return ("text/plain", Kind::Text);
    }
    ("application/octet-stream", Kind::Binary)
}

/// No NUL bytes and valid UTF-8 (allowing a code point cut off at the end of
/// the sniff window).
fn looks_like_text(head: &[u8]) -> bool {
    if head.contains(&0) {
        return false;
    }
    match std::str::from_utf8(head) {
        Ok(_) => true,
        Err(e) => e.error_len().is_none(),
    }
}

/// `Content-Type` header value for the `artifact:` scheme.
pub fn content_type(mime: &str, kind: Kind) -> String {
    if kind == Kind::Text {
        format!("{}; charset=utf-8", mime)
    } else {
        mime.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extension_table() {
        let cases = [
            ("a/index.html", "text/html", Kind::Text),
            ("x.HTM", "text/html", Kind::Text),
            ("app.tsx", "text/tsx", Kind::Text),
            ("app.ts", "text/typescript", Kind::Text), // not video/mp2t
            ("Comp.jsx", "text/jsx", Kind::Text),
            ("s.css", "text/css", Kind::Text),
            ("m.mjs", "text/javascript", Kind::Text),
            ("README.md", "text/markdown", Kind::Text),
            ("d.csv", "text/csv", Kind::Text),
            ("logo.svg", "image/svg+xml", Kind::Text),
            ("c.yml", "application/yaml", Kind::Text),
            ("Cargo.toml", "application/toml", Kind::Text),
            ("main.rs", "text/x-rust", Kind::Text),
            ("run.sh", "text/x-shellscript", Kind::Text),
            ("Makefile", "text/plain", Kind::Text),
            ("chart.png", "image/png", Kind::Binary),
            ("photo.JPG", "image/jpeg", Kind::Binary),
            ("report.pdf", "application/pdf", Kind::Binary),
            (
                "memo.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                Kind::Binary,
            ),
            (
                "sheet.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                Kind::Binary,
            ),
            ("clip.mp4", "video/mp4", Kind::Binary),
        ];
        for (p, mime, kind) in cases {
            assert_eq!(by_extension(Path::new(p)), Some((mime, kind)), "{p}");
        }
        assert_eq!(by_extension(Path::new("noext")), None);
        assert_eq!(by_extension(Path::new("x.unknownext")), None);
    }

    #[test]
    fn sniff_binary_magic() {
        let png = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR";
        assert_eq!(sniff(png), ("image/png", Kind::Binary));
        let pdf = b"%PDF-1.7\n%\xE2\xE3\xCF\xD3\n";
        assert_eq!(sniff(pdf), ("application/pdf", Kind::Binary));
        let zip = b"PK\x03\x04\x14\0\0\0\x08\0";
        assert_eq!(sniff(zip).1, Kind::Binary);
    }

    #[test]
    fn sniff_text_and_html() {
        assert_eq!(sniff(b"hello world\n"), ("text/plain", Kind::Text));
        assert_eq!(sniff("héllo".as_bytes()), ("text/plain", Kind::Text));
        assert_eq!(sniff(b"  <!DOCTYPE html><html>"), ("text/html", Kind::Text));
        assert_eq!(sniff(b"\xEF\xBB\xBF<html><body>"), ("text/html", Kind::Text));
        assert_eq!(sniff(b""), ("text/plain", Kind::Text));
        // Truncated multi-byte sequence at the end of the window is still text.
        let mut cut = "ab€".as_bytes().to_vec();
        cut.pop();
        assert_eq!(sniff(&cut).1, Kind::Text);
    }

    #[test]
    fn sniff_unknown_binary() {
        assert_eq!(
            sniff(b"\x00\x01\x02\x03garbage"),
            ("application/octet-stream", Kind::Binary)
        );
        assert_eq!(sniff(b"\xff\xfe\xfd text").1, Kind::Binary);
    }

    /// Extension table, falling back to the content sniff (what callers do).
    fn detect(path: &Path, head: &[u8]) -> (&'static str, Kind) {
        by_extension(path).unwrap_or_else(|| sniff(head))
    }

    #[test]
    fn detect_prefers_extension() {
        // A .txt file that starts with PNG magic is still served as text/plain.
        assert_eq!(
            detect(Path::new("x.txt"), b"\x89PNG\r\n\x1a\n"),
            ("text/plain", Kind::Text)
        );
        assert_eq!(
            detect(Path::new("blob"), b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR"),
            ("image/png", Kind::Binary)
        );
    }

    #[test]
    fn content_type_charset() {
        assert_eq!(content_type("text/html", Kind::Text), "text/html; charset=utf-8");
        assert_eq!(content_type("image/png", Kind::Binary), "image/png");
    }
}
