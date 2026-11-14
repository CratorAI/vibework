//! The `artifact:` URI scheme.
//!
//! URL forms (macOS/Linux; on Windows the base is `http://artifact.localhost`):
//!
//! - `artifact://localhost/<sessionId>/<relative path under the working folder>`
//!   Each path segment is percent-encoded separately and joined with literal
//!   `/` so relative URLs inside the page (CSS, JS, images) resolve correctly.
//!   A `?query` is ignored (use `?v=<modifiedMs>` to bust caches on reload).
//! - `artifact://localhost/~inline/<id>` serves an in-memory document created
//!   with `artifact_inline_create`.
//!
//! Every response carries [`ARTIFACT_CSP`] (sandboxed, opaque origin, network
//! limited to [`CDN_ALLOWLIST`]), `Cache-Control: no-store`,
//! `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`.
//! Only the `main` webview is served. Single `Range: bytes=` requests are
//! honoured (206), which media elements and PDF viewers use.

use std::borrow::Cow;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use once_cell::sync::Lazy;
use percent_encoding::{percent_decode_str, utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use tauri::http::{header, Method, Request, Response, StatusCode};
use tauri::{Runtime, UriSchemeContext, UriSchemeResponder};

use super::commands::ensure_main;
use super::mime;
use super::paths::{roots_for_session, validate_session_id, Roots};
use super::{inline, ArtifactError, MAX_BINARY_BYTES};

/// External origins artifact pages may load scripts, styles, fonts and images
/// from, and connect to. Edit here; the CSP is derived from it.
pub const CDN_ALLOWLIST: &[&str] = &[
    "https://cdnjs.cloudflare.com",
    "https://cdn.jsdelivr.net",
    "https://unpkg.com",
    "https://esm.sh",
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
];

/// The CSP `sandbox` directive: scripts, forms (submission is still blocked by
/// `form-action 'none'`), popups and modals; never `allow-same-origin`,
/// `allow-top-navigation` or `allow-popups-to-escape-sandbox`.
pub const SANDBOX_DIRECTIVE: &str = "sandbox allow-scripts allow-forms allow-popups allow-modals";

/// Path segment reserved for inline documents (not a valid session id).
pub const INLINE_SEGMENT: &str = "~inline";

/// Base URL of the scheme as WebKit/WebKitGTK and WebView2 see it.
pub fn base_url() -> &'static str {
    if cfg!(windows) {
        "http://artifact.localhost"
    } else {
        "artifact://localhost"
    }
}

/// Sources that mean "this scheme" in the artifact CSP.
fn local_sources() -> &'static str {
    if cfg!(windows) {
        "'self' http://artifact.localhost"
    } else {
        "'self' artifact:"
    }
}

/// Content-Security-Policy sent with every `artifact:` response.
pub static ARTIFACT_CSP: Lazy<String> = Lazy::new(|| {
    let cdn = CDN_ALLOWLIST.join(" ");
    let local = local_sources();
    [
        "default-src 'none'".to_string(),
        format!("script-src {local} blob: 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' {cdn}"),
        format!("style-src {local} 'unsafe-inline' {cdn}"),
        format!("img-src {local} data: blob: {cdn}"),
        format!("font-src {local} data: {cdn}"),
        format!("media-src {local} data: blob:"),
        format!("connect-src {local} {cdn}"),
        format!("worker-src {local} blob:"),
        format!("frame-src {local} blob: data:"),
        format!("child-src {local} blob: data:"),
        "object-src 'none'".to_string(),
        format!("base-uri {local}"),
        "form-action 'none'".to_string(),
        "manifest-src 'none'".to_string(),
        SANDBOX_DIRECTIVE.to_string(),
    ]
    .join("; ")
});

/// Characters left unescaped in a path segment: RFC 3986 unreserved.
const SEGMENT: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'.')
    .remove(b'_')
    .remove(b'~');

/// URL serving `rel` (relative to the session's working folder).
pub fn file_url(session_id: &str, rel: &Path) -> String {
    let mut url = format!("{}/{}", base_url(), utf8_percent_encode(session_id, SEGMENT));
    for comp in rel.components() {
        url.push('/');
        url.extend(utf8_percent_encode(&comp.as_os_str().to_string_lossy(), SEGMENT));
    }
    url
}

/// URL serving an inline document.
pub fn inline_url(id: &str) -> String {
    format!("{}/{}/{}", base_url(), INLINE_SEGMENT, id)
}

/// What a request path points at.
#[derive(Debug, PartialEq, Eq)]
pub enum Target {
    File { session_id: String, rel: PathBuf },
    Inline { id: String },
}

/// Parse the path part of an `artifact:` URL (`/<sessionId>/<encoded path>`).
/// The query string must already be stripped (`Uri::path()` does that).
pub fn parse_path(path: &str) -> Result<Target, ArtifactError> {
    let path = path.strip_prefix('/').unwrap_or(path);
    let (first, rest) = path.split_once('/').unwrap_or((path, ""));
    let first = percent_decode_str(first)
        .decode_utf8()
        .map_err(|_| ArtifactError::invalid_path("Invalid UTF-8 in URL"))?;
    if first.is_empty() {
        return Err(ArtifactError::new("invalid_session", "Missing session id"));
    }
    if first == INLINE_SEGMENT {
        let id = rest.trim_end_matches('/');
        if !inline::valid_id(id) {
            return Err(ArtifactError::not_found("Unknown inline document"));
        }
        return Ok(Target::Inline { id: id.to_string() });
    }
    validate_session_id(&first)?;

    // Decode the whole remainder: a segment-encoded path and a fully encoded
    // one (`a%2Fb.html`) both work, but only the former keeps relative URLs
    // inside the page resolving against the right directory.
    let decoded = percent_decode_str(rest)
        .decode_utf8()
        .map_err(|_| ArtifactError::invalid_path("Invalid UTF-8 in URL"))?;
    if decoded.contains('\0') || decoded.contains('\\') {
        return Err(ArtifactError::invalid_path("Invalid character in path"));
    }
    let mut rel = PathBuf::new();
    for comp in decoded.split('/') {
        match comp {
            "" => continue,
            "." | ".." => {
                return Err(ArtifactError::invalid_path("Relative segments are not allowed"))
            }
            c if cfg!(windows) && c.contains(':') => {
                return Err(ArtifactError::invalid_path("Invalid character in path"))
            }
            c => rel.push(c),
        }
    }
    Ok(Target::File {
        session_id: first.into_owned(),
        rel,
    })
}

/// Origins (the app's own pages) allowed to read artifact responses via
/// fetch/XHR. Artifact pages themselves have an opaque (`null`) origin and are
/// never granted CORS access, so they cannot read file contents.
fn app_origins<R: Runtime>(app: &tauri::AppHandle<R>) -> Vec<String> {
    let mut origins = vec![
        "tauri://localhost".to_string(),
        "http://tauri.localhost".to_string(),
        "https://tauri.localhost".to_string(),
    ];
    if tauri::is_dev() {
        if let Some(dev) = &app.config().build.dev_url {
            origins.push(dev.origin().ascii_serialization());
        }
    }
    origins
}

fn cors_origin(request_origin: Option<&str>, allowed: &[String]) -> Option<String> {
    let origin = request_origin?;
    allowed.iter().any(|o| o == origin).then(|| origin.to_string())
}

type Body = Cow<'static, [u8]>;

fn base_response(status: u16, cors: Option<&str>) -> tauri::http::response::Builder {
    let mut b = Response::builder()
        .status(status)
        .header("Content-Security-Policy", ARTIFACT_CSP.as_str())
        .header(header::CACHE_CONTROL, "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .header("Referrer-Policy", "no-referrer")
        .header(header::ACCEPT_RANGES, "bytes");
    if let Some(origin) = cors {
        b = b
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin)
            .header(
                header::ACCESS_CONTROL_EXPOSE_HEADERS,
                "Content-Length, Content-Range, Content-Type",
            )
            .header(header::VARY, "Origin");
    }
    b
}

fn error_response(err: &ArtifactError, cors: Option<&str>) -> Response<Body> {
    base_response(err.http_status(), cors)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(Cow::Owned(err.to_string().into_bytes()))
        .unwrap_or_else(|_| Response::new(Cow::Borrowed(&b""[..])))
}

/// A parsed `Range` header for a file of `len` bytes.
#[derive(Debug, PartialEq, Eq)]
pub enum RangeSpec {
    /// No (usable) range: serve everything.
    Full,
    /// Inclusive byte range.
    Partial(u64, u64),
    /// Range cannot be satisfied (416).
    Unsatisfiable,
}

/// Parse a single `bytes=` range. Multi-range, malformed and invalid
/// (`last < first`) headers fall back to a full response, as RFC 9110 allows.
pub fn parse_range(header: Option<&str>, len: u64) -> RangeSpec {
    use RangeSpec::*;
    let Some(spec) = header.and_then(|h| h.trim().strip_prefix("bytes=")) else {
        return Full;
    };
    if spec.contains(',') {
        return Full;
    }
    let Some((start, end)) = spec.split_once('-') else {
        return Full;
    };
    let (start, end) = (start.trim(), end.trim());
    if start.is_empty() {
        // Suffix range: the last N bytes.
        let Ok(n) = end.parse::<u64>() else {
            return Full;
        };
        if n == 0 || len == 0 {
            return Unsatisfiable;
        }
        return Partial(len.saturating_sub(n), len - 1);
    }
    let Ok(first) = start.parse::<u64>() else {
        return Full;
    };
    let last = if end.is_empty() {
        None
    } else {
        match end.parse::<u64>() {
            Ok(e) if e >= first => Some(e),
            _ => return Full,
        }
    };
    if first >= len {
        return Unsatisfiable;
    }
    Partial(first, last.map_or(len - 1, |e| e.min(len - 1)))
}

/// Build the response for a resolved, contained file path.
fn serve_file(
    path: &Path,
    range_header: Option<&str>,
    head_only: bool,
    cors: Option<&str>,
) -> Result<Response<Body>, ArtifactError> {
    let mut file = File::open(path).map_err(ArtifactError::io)?;
    let meta = file.metadata().map_err(ArtifactError::io)?;
    if !meta.is_file() {
        return Err(ArtifactError::invalid_path("Not a regular file"));
    }
    let len = meta.len();
    if len > MAX_BINARY_BYTES {
        return Err(ArtifactError::too_large(len, MAX_BINARY_BYTES));
    }
    let (mime, kind) = match mime::by_extension(path) {
        Some(found) => found,
        None => {
            let mut head = Vec::with_capacity(mime::SNIFF_BYTES);
            (&mut file)
                .take(mime::SNIFF_BYTES as u64)
                .read_to_end(&mut head)
                .map_err(ArtifactError::io)?;
            mime::sniff(&head)
        }
    };
    let content_type = mime::content_type(mime, kind);

    let (status, start, end) = match parse_range(range_header, len) {
        RangeSpec::Full => (200u16, 0, len.saturating_sub(1)),
        RangeSpec::Partial(s, e) => (206, s, e),
        RangeSpec::Unsatisfiable => {
            return Ok(base_response(416, cors)
                .header(header::CONTENT_RANGE, format!("bytes */{len}"))
                .header(header::CONTENT_TYPE, content_type)
                .body(Cow::Borrowed(&b""[..]))
                .map_err(|e| ArtifactError::new("internal", e.to_string()))?);
        }
    };
    let count = if len == 0 { 0 } else { end - start + 1 };

    let mut builder = base_response(status, cors)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_LENGTH, count.to_string());
    if status == 206 {
        builder = builder.header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{len}"));
    }
    let body = if head_only || count == 0 {
        Vec::new()
    } else {
        file.seek(SeekFrom::Start(start)).map_err(ArtifactError::io)?;
        let mut buf = Vec::with_capacity(count as usize);
        file.take(count).read_to_end(&mut buf).map_err(ArtifactError::io)?;
        buf
    };
    builder
        .body(Cow::Owned(body))
        .map_err(|e| ArtifactError::new("internal", e.to_string()))
}

/// Resolve a relative path; a directory serves its `index.html`.
fn resolve_target(roots: &Roots, rel: &Path) -> Result<PathBuf, ArtifactError> {
    let path = if rel.as_os_str().is_empty() {
        roots.root.clone()
    } else {
        roots.resolve_relative(rel)?
    };
    if path.is_dir() {
        roots.resolve_relative(&roots.relative(&path).unwrap_or_default().join("index.html"))
    } else {
        Ok(path)
    }
}

fn serve_inline(id: &str, head_only: bool, cors: Option<&str>) -> Result<Response<Body>, ArtifactError> {
    let html = inline::get(id).ok_or_else(|| ArtifactError::not_found("Unknown inline document"))?;
    let body = if head_only { Vec::new() } else { html.as_ref().clone() };
    base_response(200, cors)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .header(header::CONTENT_LENGTH, html.len().to_string())
        .body(Cow::Owned(body))
        .map_err(|e| ArtifactError::new("internal", e.to_string()))
}

/// The scheme handler registered by `artifacts::init()`.
pub fn handle<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let app = ctx.app_handle().clone();
    let request_origin = request
        .headers()
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    let cors = cors_origin(request_origin.as_deref(), &app_origins(&app));
    let cors = cors.as_deref();

    if let Err(e) = ensure_main(ctx.webview_label()) {
        responder.respond(error_response(&e, None));
        return;
    }

    let method = request.method().clone();
    if method == Method::OPTIONS {
        let mut b = base_response(StatusCode::NO_CONTENT.as_u16(), cors);
        if cors.is_some() {
            b = b
                .header(header::ACCESS_CONTROL_ALLOW_METHODS, "GET, HEAD")
                .header(header::ACCESS_CONTROL_ALLOW_HEADERS, "Range");
        }
        responder.respond(b.body(Cow::Borrowed(&b""[..])).unwrap());
        return;
    }
    if method != Method::GET && method != Method::HEAD {
        let e = ArtifactError::new("method_not_allowed", "Only GET and HEAD are supported");
        let mut resp = error_response(&e, cors);
        *resp.status_mut() = StatusCode::METHOD_NOT_ALLOWED;
        responder.respond(resp);
        return;
    }
    let head_only = method == Method::HEAD;

    let target = match parse_path(request.uri().path()) {
        Ok(t) => t,
        Err(e) => {
            responder.respond(error_response(&e, cors));
            return;
        }
    };
    let range = request
        .headers()
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    let cors = cors.map(str::to_string);

    match target {
        Target::Inline { id } => {
            let resp = serve_inline(&id, head_only, cors.as_deref())
                .unwrap_or_else(|e| error_response(&e, cors.as_deref()));
            responder.respond(resp);
        }
        Target::File { session_id, rel } => {
            tauri::async_runtime::spawn(async move {
                let result = match roots_for_session(&session_id).await {
                    Ok(roots) => tauri::async_runtime::spawn_blocking({
                        let cors = cors.clone();
                        move || {
                            let path = resolve_target(&roots, &rel)?;
                            serve_file(&path, range.as_deref(), head_only, cors.as_deref())
                        }
                    })
                    .await
                    .unwrap_or_else(|e| Err(ArtifactError::new("internal", e.to_string()))),
                    Err(e) => Err(e),
                };
                responder.respond(result.unwrap_or_else(|e| error_response(&e, cors.as_deref())));
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn parse_simple_and_nested() {
        assert_eq!(
            parse_path("/sess-1/index.html").unwrap(),
            Target::File { session_id: "sess-1".into(), rel: "index.html".into() }
        );
        assert_eq!(
            parse_path("/sess-1/site/css/app.css").unwrap(),
            Target::File { session_id: "sess-1".into(), rel: "site/css/app.css".into() }
        );
    }

    #[test]
    fn parse_encoded_segments() {
        assert_eq!(
            parse_path("/s/My%20Report%20%28final%29.html").unwrap(),
            Target::File { session_id: "s".into(), rel: "My Report (final).html".into() }
        );
        // Unicode
        assert_eq!(
            parse_path("/s/%E0%A4%A6%E0%A4%BE%E0%A4%A6%E0%A5%80.md").unwrap(),
            Target::File { session_id: "s".into(), rel: "दादी.md".into() }
        );
        // Fully encoded remainder (as convertFileSrc would produce) also works.
        assert_eq!(
            parse_path("/s/site%2Findex.html").unwrap(),
            Target::File { session_id: "s".into(), rel: "site/index.html".into() }
        );
        // Double slashes collapse; a decoded leading slash stays relative.
        assert_eq!(
            parse_path("/s//a//b.txt").unwrap(),
            Target::File { session_id: "s".into(), rel: "a/b.txt".into() }
        );
        assert_eq!(
            parse_path("/s/%2Fetc%2Fpasswd").unwrap(),
            Target::File { session_id: "s".into(), rel: "etc/passwd".into() }
        );
        // Empty remainder points at the root (served as index.html).
        assert_eq!(
            parse_path("/s/").unwrap(),
            Target::File { session_id: "s".into(), rel: PathBuf::new() }
        );
    }

    #[test]
    fn parse_rejects_traversal() {
        for bad in [
            "/s/../secret",
            "/s/a/../../secret",
            "/s/%2E%2E/secret",
            "/s/a%2F..%2F..%2Fsecret",
            "/s/./x",
            "/s/a%5C..%5Csecret",
            "/s/a%00b",
            "/s/%FF%FE",
        ] {
            assert_eq!(parse_path(bad).unwrap_err().code, "invalid_path", "{bad}");
        }
    }

    #[test]
    fn parse_rejects_bad_or_missing_session() {
        for bad in ["/", "", "//index.html", "/..%2F..%2Fetc/x", "/a%20b/x", "/%2E%2E/x"] {
            assert_eq!(parse_path(bad).unwrap_err().code, "invalid_session", "{bad}");
        }
    }

    #[test]
    fn parse_inline() {
        let id = "0123456789abcdef0123456789abcdef";
        assert_eq!(
            parse_path(&format!("/~inline/{id}")).unwrap(),
            Target::Inline { id: id.into() }
        );
        assert_eq!(
            parse_path(&format!("/%7Einline/{id}")).unwrap(),
            Target::Inline { id: id.into() }
        );
        assert_eq!(parse_path("/~inline/../x").unwrap_err().code, "not_found");
        assert_eq!(parse_path("/~inline/").unwrap_err().code, "not_found");
    }

    #[test]
    fn url_round_trip() {
        let rel = Path::new("My Site/css/app (1).css");
        let url = file_url("sess-1", rel);
        assert_eq!(
            url,
            format!("{}/sess-1/My%20Site/css/app%20%281%29.css", base_url())
        );
        let path = url.strip_prefix(base_url()).unwrap();
        assert_eq!(
            parse_path(path).unwrap(),
            Target::File { session_id: "sess-1".into(), rel: rel.to_path_buf() }
        );
        assert!(inline_url("abc").ends_with("/~inline/abc"));
    }

    #[test]
    fn csp_is_sandboxed_and_restricted() {
        let csp = ARTIFACT_CSP.as_str();
        assert!(csp.contains("sandbox allow-scripts allow-forms allow-popups allow-modals"));
        assert!(!csp.contains("allow-same-origin"));
        assert!(!csp.contains("allow-top-navigation"));
        assert!(csp.starts_with("default-src 'none'"));
        assert!(csp.contains("form-action 'none'"));
        assert!(csp.contains("object-src 'none'"));
        let connect = csp
            .split("; ")
            .find(|d| d.starts_with("connect-src"))
            .unwrap();
        for cdn in CDN_ALLOWLIST {
            assert!(connect.contains(cdn));
        }
        // Only the listed https origins: no bare `https:` scheme source or wildcard.
        assert_eq!(connect.matches("https://").count(), CDN_ALLOWLIST.len());
        assert!(!connect.split(' ').any(|s| s == "https:" || s == "*" || s == "http:"));
        assert!(!connect.contains("ipc:"));
    }

    #[test]
    fn range_parsing() {
        use RangeSpec::*;
        assert_eq!(parse_range(None, 100), Full);
        assert_eq!(parse_range(Some("bytes=0-9"), 100), Partial(0, 9));
        assert_eq!(parse_range(Some("bytes=90-"), 100), Partial(90, 99));
        assert_eq!(parse_range(Some("bytes=90-500"), 100), Partial(90, 99));
        assert_eq!(parse_range(Some("bytes=-10"), 100), Partial(90, 99));
        assert_eq!(parse_range(Some("bytes=-500"), 100), Partial(0, 99));
        assert_eq!(parse_range(Some("bytes=100-"), 100), Unsatisfiable);
        assert_eq!(parse_range(Some("bytes=50-10"), 100), Full);
        assert_eq!(parse_range(Some("bytes=-0"), 100), Unsatisfiable);
        assert_eq!(parse_range(Some("bytes=0-"), 0), Unsatisfiable);
        assert_eq!(parse_range(Some("bytes=0-1,5-6"), 100), Full);
        assert_eq!(parse_range(Some("items=0-1"), 100), Full);
        assert_eq!(parse_range(Some("bytes=abc"), 100), Full);
    }

    fn header<'a>(r: &'a Response<Body>, name: &str) -> Option<&'a str> {
        r.headers().get(name).and_then(|v| v.to_str().ok())
    }

    #[test]
    fn serve_file_full_range_head() {
        let dir = std::env::temp_dir().join(format!("vw-proto-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(dir.join("site")).unwrap();
        fs::write(dir.join("site/index.html"), "<p>0123456789</p>").unwrap();
        let roots = Roots::new(&dir, &[]).unwrap();

        // Directory serves index.html
        let p = resolve_target(&roots, Path::new("site")).unwrap();
        assert!(p.ends_with("site/index.html"));

        let full = serve_file(&p, None, false, None).unwrap();
        assert_eq!(full.status(), 200);
        assert_eq!(full.body().as_ref(), b"<p>0123456789</p>");
        assert_eq!(header(&full, "content-type"), Some("text/html; charset=utf-8"));
        assert_eq!(header(&full, "cache-control"), Some("no-store"));
        assert_eq!(header(&full, "content-security-policy"), Some(ARTIFACT_CSP.as_str()));
        assert_eq!(header(&full, "x-content-type-options"), Some("nosniff"));
        assert_eq!(header(&full, "content-length"), Some("17"));
        assert!(header(&full, "access-control-allow-origin").is_none());

        let part = serve_file(&p, Some("bytes=3-6"), false, Some("tauri://localhost")).unwrap();
        assert_eq!(part.status(), 206);
        assert_eq!(part.body().as_ref(), b"0123");
        assert_eq!(header(&part, "content-range"), Some("bytes 3-6/17"));
        assert_eq!(header(&part, "access-control-allow-origin"), Some("tauri://localhost"));

        let bad = serve_file(&p, Some("bytes=99-"), false, None).unwrap();
        assert_eq!(bad.status(), 416);
        assert_eq!(header(&bad, "content-range"), Some("bytes */17"));

        let head = serve_file(&p, None, true, None).unwrap();
        assert_eq!(head.status(), 200);
        assert!(head.body().is_empty());
        assert_eq!(header(&head, "content-length"), Some("17"));

        // Size cap
        let big = dir.join("big.bin");
        File::create(&big).unwrap().set_len(MAX_BINARY_BYTES + 1).unwrap();
        assert_eq!(serve_file(&big, None, false, None).unwrap_err().code, "too_large");

        // Escapes through the scheme are refused at resolution time.
        assert_eq!(
            resolve_target(&roots, Path::new("../x")).unwrap_err().code,
            "invalid_path"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn error_responses_carry_csp() {
        let e = ArtifactError::outside_root("nope");
        let r = error_response(&e, None);
        assert_eq!(r.status(), 403);
        assert_eq!(header(&r, "content-security-policy"), Some(ARTIFACT_CSP.as_str()));
        assert_eq!(error_response(&ArtifactError::not_found("x"), None).status(), 404);
        assert_eq!(error_response(&ArtifactError::too_large(2, 1), None).status(), 413);
    }

    #[test]
    fn cors_only_for_app_origins() {
        let allowed = vec!["tauri://localhost".to_string(), "http://localhost:1420".to_string()];
        assert_eq!(cors_origin(Some("tauri://localhost"), &allowed).as_deref(), Some("tauri://localhost"));
        assert_eq!(cors_origin(Some("http://localhost:1420"), &allowed).as_deref(), Some("http://localhost:1420"));
        assert_eq!(cors_origin(Some("null"), &allowed), None);
        assert_eq!(cors_origin(Some("artifact://localhost"), &allowed), None);
        assert_eq!(cors_origin(Some("https://evil.example"), &allowed), None);
        assert_eq!(cors_origin(None, &allowed), None);
    }
}
