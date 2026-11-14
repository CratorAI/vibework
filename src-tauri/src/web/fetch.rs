//! WebFetch: download a public http(s) URL from the user's machine and turn
//! it into readable text for the model.

use reqwest::redirect::{Attempt, Policy};
use reqwest::Url;
use std::time::Duration;

use super::net::{check_url, find_blocked, guarded_resolver};

/// Default and maximum number of characters returned to the model.
pub const DEFAULT_MAX_CHARS: usize = 20_000;
pub const MAX_MAX_CHARS: usize = 100_000;

/// Stop downloading after this many bytes.
const MAX_DOWNLOAD_BYTES: usize = 5 * 1024 * 1024;
/// Maximum number of redirects followed.
const MAX_REDIRECTS: usize = 5;
/// Whole-request timeout (connect + headers + body).
const TIMEOUT: Duration = Duration::from_secs(20);

/// A normal desktop browser User-Agent; many sites refuse unknown clients.
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/// Tags whose content is page chrome or code rather than readable text.
const SKIPPED_TAGS: &[&str] = &[
    "head", "script", "style", "noscript", "template", "nav", "footer", "aside", "svg", "canvas",
    "iframe", "form", "button", "select", "input", "textarea", "dialog", "object", "embed",
];

/// Error raised by the redirect policy (too many redirects / refused target).
#[derive(Debug)]
struct RedirectRefused(String);

impl std::fmt::Display for RedirectRefused {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for RedirectRefused {}

/// Whether to follow a redirect to `next`, given how many URLs were already
/// requested in this chain (including the original one).
fn redirect_decision(next: &Url, previous: usize) -> Result<(), String> {
    if previous > MAX_REDIRECTS {
        return Err(format!("Stopped after {} redirects.", MAX_REDIRECTS));
    }
    check_url(next).map_err(|msg| format!("Redirect to {} refused. {}", next, msg))
}

fn redirect_policy() -> Policy {
    Policy::custom(|attempt: Attempt| {
        match redirect_decision(attempt.url(), attempt.previous().len()) {
            Ok(()) => attempt.follow(),
            Err(msg) => attempt.error(RedirectRefused(msg)),
        }
    })
}

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(TIMEOUT)
        .connect_timeout(Duration::from_secs(10))
        // Proxies would resolve names where our resolver cannot check them.
        .no_proxy()
        .dns_resolver(guarded_resolver())
        .redirect(redirect_policy())
        .build()
        .map_err(|e| format!("Could not create the HTTP client: {}", e))
}

/// Describe a request error, preferring our own guard messages.
fn describe_error(err: &reqwest::Error) -> String {
    if let Some(blocked) = find_blocked(err) {
        return blocked;
    }
    let mut current: Option<&(dyn std::error::Error + 'static)> = Some(err);
    while let Some(e) = current {
        if let Some(refused) = e.downcast_ref::<RedirectRefused>() {
            return refused.0.clone();
        }
        current = e.source();
    }
    if err.is_timeout() {
        return format!("The request timed out after {} seconds.", TIMEOUT.as_secs());
    }
    let mut msg = err.to_string();
    let mut source = std::error::Error::source(err);
    while let Some(s) = source {
        msg.push_str(": ");
        msg.push_str(&s.to_string());
        source = s.source();
    }
    msg
}

/// What kind of body a content type is.
#[derive(Debug, PartialEq, Eq)]
enum BodyKind {
    Html,
    Text,
    Other,
}

fn classify(mime: &str) -> BodyKind {
    let mime = mime.trim().to_ascii_lowercase();
    if mime == "text/html" || mime == "application/xhtml+xml" {
        return BodyKind::Html;
    }
    if mime.starts_with("text/")
        || mime == "application/json"
        || mime.ends_with("+json")
        || mime == "application/xml"
        || mime.ends_with("+xml")
        || mime == "application/javascript"
        || mime == "application/x-javascript"
        || mime == "application/ecmascript"
        || mime == "application/yaml"
        || mime == "application/x-yaml"
        || mime == "application/toml"
        || mime == "application/x-sh"
        || mime == "application/sql"
        || mime == "application/graphql"
    {
        return BodyKind::Text;
    }
    BodyKind::Other
}

/// Guess the kind of a body that came without a content type.
fn sniff(bytes: &[u8]) -> BodyKind {
    let head = &bytes[..bytes.len().min(2048)];
    if head.contains(&0) || std::str::from_utf8(head).is_err() && String::from_utf8_lossy(head).matches('\u{FFFD}').count() > 8 {
        return BodyKind::Other;
    }
    let start = String::from_utf8_lossy(head).trim_start().to_ascii_lowercase();
    if start.starts_with("<!doctype html") || start.starts_with("<html") || start.contains("<body") {
        BodyKind::Html
    } else {
        BodyKind::Text
    }
}

fn human_size(bytes: u64) -> String {
    if bytes >= 1024 * 1024 {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    } else if bytes >= 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{} bytes", bytes)
    }
}

/// Extract the `<title>` text of an HTML document.
fn extract_title(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let open = lower.find("<title")?;
    let content_start = open + lower[open..].find('>')? + 1;
    let content_end = content_start + lower[content_start..].find("</title")?;
    let raw = &html[content_start..content_end];
    let text = htmd::convert(&format!("<p>{}</p>", raw)).unwrap_or_else(|_| raw.to_string());
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    (!text.is_empty()).then_some(text)
}

/// Remove markdown images whose source is an inline `data:` URI (often huge).
fn strip_data_images(markdown: &str) -> String {
    let mut out = String::with_capacity(markdown.len());
    let mut rest = markdown;
    while let Some(start) = rest.find("![") {
        let after = &rest[start..];
        let data_link = after
            .find("](data:")
            .filter(|close| !after[2..*close].contains('\n'));
        match data_link {
            Some(close) => {
                let link_start = close + 2;
                match after[link_start..].find(')') {
                    Some(end) => {
                        out.push_str(&rest[..start]);
                        rest = &after[link_start + end + 1..];
                    }
                    None => {
                        out.push_str(&rest[..start]);
                        rest = "";
                    }
                }
            }
            None => {
                out.push_str(&rest[..start + 2]);
                rest = &rest[start + 2..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// Collapse runs of blank lines and trailing whitespace.
fn tidy(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut blank_run = 0;
    for line in text.lines() {
        let line = line.trim_end();
        if line.is_empty() {
            blank_run += 1;
            if blank_run > 1 {
                continue;
            }
        } else {
            blank_run = 0;
        }
        out.push_str(line);
        out.push('\n');
    }
    out.trim().to_string()
}

/// Convert an HTML page to readable markdown (title, then body text).
pub fn html_to_text(html: &str) -> (Option<String>, String) {
    let title = extract_title(html);
    let converter = htmd::HtmlToMarkdown::builder()
        .skip_tags(SKIPPED_TAGS.to_vec())
        .build();
    let markdown = converter.convert(html).unwrap_or_default();
    (title, tidy(&strip_data_images(&markdown)))
}

/// Truncate to `max_chars` characters; returns the text and whether it was cut.
fn truncate_chars(text: &str, max_chars: usize) -> (String, bool) {
    match text.char_indices().nth(max_chars) {
        Some((byte_idx, _)) => (text[..byte_idx].to_string(), true),
        None => (text.to_string(), false),
    }
}

/// Fetch a URL and return the text shown to the model.
pub async fn fetch_url(url: &str, max_chars: usize) -> Result<String, String> {
    let max_chars = max_chars.clamp(1, MAX_MAX_CHARS);
    let url = Url::parse(url.trim()).map_err(|e| format!("Invalid URL '{}': {}", url.trim(), e))?;
    check_url(&url)?;

    let client = build_client()?;
    let request = client
        .get(url.clone())
        .header(
            reqwest::header::ACCEPT,
            "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
        )
        .header(reqwest::header::ACCEPT_LANGUAGE, "en-US,en;q=0.9");

    let work = async {
        let mut response = request.send().await.map_err(|e| describe_error(&e))?;
        let final_url = response.url().to_string();
        let status = response.status();
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(|v| v.to_string());
        let mime = content_type
            .as_deref()
            .map(|ct| ct.split(';').next().unwrap_or("").trim().to_ascii_lowercase());
        let declared_len = response.content_length();

        // Non-text content: describe it instead of downloading it.
        if let Some(mime) = mime.as_deref() {
            if classify(mime) == BodyKind::Other && status.is_success() {
                let size = declared_len
                    .map(human_size)
                    .unwrap_or_else(|| "unknown size".to_string());
                return Ok(format!(
                    "URL: {}\nContent-Type: {}\n\nThis URL returned {} content ({}), which is not text, so it was not downloaded.",
                    final_url, mime, mime, size
                ));
            }
        }

        // Download, capped.
        let mut body: Vec<u8> = Vec::new();
        let mut download_capped = false;
        while let Some(chunk) = response.chunk().await.map_err(|e| describe_error(&e))? {
            let room = MAX_DOWNLOAD_BYTES - body.len();
            if chunk.len() > room {
                body.extend_from_slice(&chunk[..room]);
                download_capped = true;
                break;
            }
            body.extend_from_slice(&chunk);
        }

        let kind = match mime.as_deref() {
            Some(m) if !m.is_empty() => classify(m),
            _ => sniff(&body),
        };
        let shown_type = mime.clone().filter(|m| !m.is_empty()).unwrap_or_else(|| "unknown".to_string());

        if kind == BodyKind::Other {
            return Ok(format!(
                "URL: {}\nContent-Type: {}\n\nThis URL returned non-text content ({}), so it is not shown.",
                final_url,
                shown_type,
                human_size(declared_len.unwrap_or(body.len() as u64))
            ));
        }

        let raw_text = String::from_utf8_lossy(&body).into_owned();
        let (title, text) = if kind == BodyKind::Html {
            html_to_text(&raw_text)
        } else {
            (None, raw_text.trim().to_string())
        };

        if !status.is_success() {
            let (excerpt, _) = truncate_chars(&text, 1_000);
            return Err(format!(
                "HTTP {} from {}.{}",
                status,
                final_url,
                if excerpt.is_empty() { String::new() } else { format!(" Page content:\n{}", excerpt) }
            ));
        }

        let total_chars = text.chars().count();
        let (shown, truncated) = truncate_chars(&text, max_chars);

        let mut out = format!("URL: {}\nContent-Type: {}\n", final_url, shown_type);
        if let Some(title) = title {
            out.push_str(&format!("Title: {}\n", title));
        }
        out.push('\n');
        if shown.is_empty() {
            out.push_str("(The page has no readable text. It may need JavaScript; the Browser tool can render it.)");
        } else {
            out.push_str(&shown);
        }
        if truncated {
            out.push_str(&format!(
                "\n\n[Truncated: showing the first {} of {} characters. Call WebFetch again with a larger max_chars (up to {}) to see more.]",
                max_chars, total_chars, MAX_MAX_CHARS
            ));
        }
        if download_capped {
            out.push_str(&format!(
                "\n\n[Download stopped at {}; the rest of the page was not fetched.]",
                human_size(MAX_DOWNLOAD_BYTES as u64)
            ));
        }
        Ok(out)
    };

    // Belt and braces on top of the client timeout.
    match tokio::time::timeout(TIMEOUT + Duration::from_secs(2), work).await {
        Ok(result) => result,
        Err(_) => Err(format!("The request timed out after {} seconds.", TIMEOUT.as_secs())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rt() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap()
    }

    #[test]
    fn html_to_text_strips_noise() {
        let html = r#"<!doctype html><html><head><title>Hello &amp; welcome</title>
            <style>body { color: red }</style><script>var secret = 1;</script></head>
            <body><nav><a href="/">Home</a><a href="/about">About</a></nav>
            <article><h1>Main heading</h1><p>First <b>paragraph</b> with a <a href="https://example.com/x">link</a>.</p>
            <ul><li>one</li><li>two</li></ul>
            <img src="data:image/png;base64,AAAABBBBCCCC" alt="inline">
            <script>alert('x')</script><noscript>enable js</noscript></article>
            <footer>Copyright junk</footer></body></html>"#;
        let (title, text) = html_to_text(html);
        assert_eq!(title.as_deref(), Some("Hello & welcome"));
        assert!(text.contains("# Main heading"), "{}", text);
        assert!(text.contains("First **paragraph** with a [link](https://example.com/x)."), "{}", text);
        assert!(text.contains("one") && text.contains("two"), "{}", text);
        for noise in ["color: red", "secret", "alert", "Home", "About", "Copyright", "enable js", "data:image", "Hello & welcome"] {
            assert!(!text.contains(noise), "found {:?} in {}", noise, text);
        }
    }

    #[test]
    fn classify_content_types() {
        assert_eq!(classify("text/html"), BodyKind::Html);
        assert_eq!(classify("application/xhtml+xml"), BodyKind::Html);
        assert_eq!(classify("text/plain"), BodyKind::Text);
        assert_eq!(classify("text/markdown"), BodyKind::Text);
        assert_eq!(classify("application/json"), BodyKind::Text);
        assert_eq!(classify("application/ld+json"), BodyKind::Text);
        assert_eq!(classify("application/rss+xml"), BodyKind::Text);
        assert_eq!(classify("application/pdf"), BodyKind::Other);
        assert_eq!(classify("image/png"), BodyKind::Other);
        assert_eq!(classify("application/octet-stream"), BodyKind::Other);
        assert_eq!(classify("application/zip"), BodyKind::Other);
    }

    #[test]
    fn sniffing_without_content_type() {
        assert_eq!(sniff(b"<!DOCTYPE html><html></html>"), BodyKind::Html);
        assert_eq!(sniff(b"  <html><body>x</body></html>"), BodyKind::Html);
        assert_eq!(sniff(b"{\"a\": 1}"), BodyKind::Text);
        assert_eq!(sniff(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"), BodyKind::Other);
    }

    #[test]
    fn truncation_counts_characters() {
        let (t, cut) = truncate_chars("héllo wörld", 5);
        assert_eq!(t, "héllo");
        assert!(cut);
        let (t, cut) = truncate_chars("short", 10);
        assert_eq!(t, "short");
        assert!(!cut);
    }

    #[test]
    fn data_images_are_stripped() {
        assert_eq!(strip_data_images("a ![x](data:image/png;base64,AAA) b"), "a  b");
        assert_eq!(strip_data_images("![ok](https://e.com/i.png)"), "![ok](https://e.com/i.png)");
    }

    #[test]
    fn refuses_local_and_non_http_urls_before_any_request() {
        let rt = rt();
        for url in [
            "http://127.0.0.1:1/",
            "http://localhost:8080/admin",
            "http://169.254.169.254/latest/meta-data/",
            "http://[::1]/",
            "http://192.168.0.1/",
            "http://metadata.google.internal/",
        ] {
            let err = rt.block_on(fetch_url(url, 1000)).unwrap_err();
            assert!(err.contains("not allowed"), "{}: {}", url, err);
        }
        let err = rt.block_on(fetch_url("file:///etc/passwd", 1000)).unwrap_err();
        assert!(err.contains("http and https"), "{}", err);
        let err = rt.block_on(fetch_url("not a url", 1000)).unwrap_err();
        assert!(err.contains("Invalid URL"), "{}", err);
    }

    /// Live: fetch a real public page. Run with `cargo test -- --ignored live_webfetch`.
    #[test]
    #[ignore]
    fn live_webfetch_public_page() {
        let out = rt().block_on(fetch_url("https://www.rust-lang.org/", 3_000)).unwrap();
        println!("{}", out);
        assert!(out.contains("Content-Type: text/html"));
        assert!(out.contains("Rust"));
        assert!(out.contains("[Truncated"));
    }

    #[test]
    fn redirects_are_checked_and_capped() {
        let public = Url::parse("https://example.com/next").unwrap();
        assert!(redirect_decision(&public, 1).is_ok());
        assert!(redirect_decision(&public, MAX_REDIRECTS).is_ok());
        let err = redirect_decision(&public, MAX_REDIRECTS + 1).unwrap_err();
        assert!(err.contains("Stopped after 5 redirects"), "{}", err);
        for target in ["http://127.0.0.1/", "http://169.254.169.254/", "http://localhost/", "file:///etc/passwd"] {
            let err = redirect_decision(&Url::parse(target).unwrap(), 1).unwrap_err();
            assert!(err.contains("refused"), "{}: {}", target, err);
        }
    }

    /// Live: a public DNS name that resolves to 127.0.0.1 is refused after
    /// resolution (the same resolver guards every redirect hop).
    #[test]
    #[ignore]
    fn live_webfetch_name_resolving_to_loopback_is_refused() {
        let err = rt().block_on(fetch_url("http://localtest.me/", 1_000)).unwrap_err();
        println!("{}", err);
        assert!(err.contains("resolves to 127.0.0.1") || err.contains("resolves to ::1"), "{}", err);
        assert!(err.contains("not allowed"), "{}", err);
    }
}
