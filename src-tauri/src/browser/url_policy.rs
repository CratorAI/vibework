//! URL normalisation for typed input and the navigation policy of browser webviews.

use std::net::{Ipv4Addr, Ipv6Addr};

use url::{Host, Url};

/// Turn what the user typed into an http(s) URL, or explain why it isn't one.
///
/// - `https://example.com/x`, `http://localhost:5173` are kept (after parsing).
/// - `example.com`, `docs.rs/serde` get `https://`.
/// - `localhost:3000`, `127.0.0.1:8080/x`, `192.168.1.20`, `my-mac.local` get `http://`.
/// - Other schemes (`file:`, `tauri:`, `javascript:` ...) and things that don't look like
///   a host (`hello world`, `foo`) are rejected.
pub fn normalize_input(input: &str) -> Result<String, String> {
    let s = input.trim();
    if s.is_empty() {
        return Err("Enter a URL".into());
    }
    if s.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(format!("{s:?} is not a URL"));
    }

    if let Some(scheme) = explicit_scheme(s) {
        let lower = scheme.to_ascii_lowercase();
        if lower != "http" && lower != "https" {
            return Err(format!(
                "Only http and https addresses can be opened here (got {lower}:)"
            ));
        }
        let url = Url::parse(s).map_err(|e| format!("{s:?} is not a valid URL ({e})"))?;
        if url.host_str().map(str::is_empty).unwrap_or(true) {
            return Err(format!("{s:?} has no host"));
        }
        return Ok(url.to_string());
    }

    // No scheme: decide from the host part.
    if s.starts_with('/') || s.starts_with('.') {
        return Err(format!("{s:?} is not a URL"));
    }
    let authority_end = s.find(['/', '?', '#']).unwrap_or(s.len());
    let authority = &s[..authority_end];
    if authority.contains('@') {
        return Err(format!("{s:?} is not a URL"));
    }
    let (host, port) = split_host_port(authority).ok_or_else(|| format!("{s:?} is not a URL"))?;
    if !plausible_host(host) {
        return Err(format!("{s:?} is not a URL"));
    }
    if let Some(port) = port {
        if port.is_empty() || port.parse::<u16>().is_err() {
            return Err(format!("{s:?} has an invalid port"));
        }
    }
    let scheme = if is_local_host(host) { "http" } else { "https" };
    let url = Url::parse(&format!("{scheme}://{s}"))
        .map_err(|e| format!("{s:?} is not a valid URL ({e})"))?;
    Ok(url.to_string())
}

/// Whether a navigation (typed, link, redirect, subframe) may proceed inside a browser webview.
///
/// http/https are the point; `about:` (blank/srcdoc), `blob:` and `data:` are needed by
/// ordinary pages for iframes and generated content and carry no privileges here, because
/// the webview has no IPC bridge and no custom protocols registered.
pub fn navigation_allowed(url: &str) -> bool {
    let Some(scheme) = url.split_once(':').map(|(s, _)| s.to_ascii_lowercase()) else {
        return false;
    };
    matches!(scheme.as_str(), "http" | "https" | "about" | "blob" | "data")
}

/// http(s) only: what may be opened in place or in the system browser.
pub fn is_web_url(url: &str) -> bool {
    Url::parse(url)
        .map(|u| matches!(u.scheme(), "http" | "https") && u.host().is_some())
        .unwrap_or(false)
}

/// `scheme` if the input starts with `scheme:` in a way that isn't `host:port`.
fn explicit_scheme(s: &str) -> Option<&str> {
    let colon = s.find(':')?;
    let scheme = &s[..colon];
    let mut chars = scheme.chars();
    let first = chars.next()?;
    if !first.is_ascii_alphabetic()
        || !chars.all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '-' || c == '.')
    {
        return None;
    }
    let rest = &s[colon + 1..];
    if rest.starts_with("//") {
        return Some(scheme);
    }
    // `localhost:3000`, `example.com:8443/path` -> host:port, not a scheme.
    let port_like = rest
        .split(['/', '?', '#'])
        .next()
        .map(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()))
        .unwrap_or(false);
    if port_like {
        None
    } else {
        Some(scheme)
    }
}

fn split_host_port(authority: &str) -> Option<(&str, Option<&str>)> {
    if authority.is_empty() {
        return None;
    }
    if let Some(rest) = authority.strip_prefix('[') {
        let end = rest.find(']')?;
        let host = &authority[..end + 2];
        let after = &rest[end + 1..];
        return match after.strip_prefix(':') {
            Some(port) => Some((host, Some(port))),
            None if after.is_empty() => Some((host, None)),
            None => None,
        };
    }
    match authority.rsplit_once(':') {
        Some((host, port)) => Some((host, Some(port))),
        None => Some((authority, None)),
    }
}

fn plausible_host(host: &str) -> bool {
    if host.eq_ignore_ascii_case("localhost") {
        return true;
    }
    if host.starts_with('[') {
        return host
            .trim_start_matches('[')
            .trim_end_matches(']')
            .parse::<Ipv6Addr>()
            .is_ok();
    }
    if host.parse::<Ipv4Addr>().is_ok() {
        return true;
    }
    let labels: Vec<&str> = host.split('.').collect();
    if labels.len() < 2 {
        return false;
    }
    let label_ok = |l: &str| {
        !l.is_empty()
            && l.len() <= 63
            && !l.starts_with('-')
            && !l.ends_with('-')
            && l.chars().all(|c| c.is_alphanumeric() || c == '-')
    };
    if !labels.iter().all(|l| label_ok(l)) {
        return false;
    }
    // The last label must look like a TLD (letters or punycode), not a number.
    let tld = labels[labels.len() - 1];
    tld.len() >= 2 && tld.chars().all(|c| c.is_alphabetic() || c == '-' || c.is_ascii_digit())
        && !tld.chars().all(|c| c.is_ascii_digit())
}

/// Hosts that should default to plain http: loopback, private ranges, link-local, mDNS.
pub fn is_local_host(host: &str) -> bool {
    let h = host.to_ascii_lowercase();
    if h == "localhost" || h.ends_with(".localhost") || h.ends_with(".local") {
        return true;
    }
    match Host::parse(&h) {
        Ok(Host::Ipv4(ip)) => {
            ip.is_loopback() || ip.is_private() || ip.is_link_local() || ip.is_unspecified()
        }
        Ok(Host::Ipv6(ip)) => {
            ip.is_loopback()
                || ip.is_unspecified()
                // fc00::/7 unique local, fe80::/10 link-local
                || (ip.segments()[0] & 0xfe00) == 0xfc00
                || (ip.segments()[0] & 0xffc0) == 0xfe80
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_typed_input() {
        let ok = |i: &str, o: &str| assert_eq!(normalize_input(i).as_deref(), Ok(o), "{i}");
        ok("localhost:3000", "http://localhost:3000/");
        ok("localhost", "http://localhost/");
        ok("http://localhost:5173", "http://localhost:5173/");
        ok("127.0.0.1:8080/x?y=1", "http://127.0.0.1:8080/x?y=1");
        ok("192.168.1.20", "http://192.168.1.20/");
        ok("10.0.0.5:9000", "http://10.0.0.5:9000/");
        ok("my-mac.local:3000", "http://my-mac.local:3000/");
        ok("app.localhost:4000", "http://app.localhost:4000/");
        ok("[::1]:3000", "http://[::1]:3000/");
        ok("example.com", "https://example.com/");
        ok("docs.rs/serde", "https://docs.rs/serde");
        ok("example.com:8443/a#b", "https://example.com:8443/a#b");
        ok("8.8.8.8", "https://8.8.8.8/");
        ok("https://example.com/x", "https://example.com/x");
        ok("  HTTPS://Example.com  ", "https://example.com/");
    }

    #[test]
    fn rejects_non_urls_and_other_schemes() {
        for bad in [
            "",
            "hello world",
            "foo",
            "file:///etc/passwd",
            "tauri://localhost",
            "ipc://localhost/cmd",
            "artifact://x",
            "javascript:alert(1)",
            "data:text/html,hi",
            "about:blank",
            "mailto:a@b.com",
            "chrome://settings",
            "/etc/passwd",
            "user@example.com",
            "1.2",
            "localhost:abc",
            "http://",
            "example.com:99999",
        ] {
            assert!(normalize_input(bad).is_err(), "{bad:?} should be rejected");
        }
    }

    #[test]
    fn navigation_policy() {
        for ok in [
            "http://localhost:5173/",
            "https://example.com",
            "about:blank",
            "about:srcdoc",
            "blob:https://example.com/uuid",
            "data:text/html,hi",
        ] {
            assert!(navigation_allowed(ok), "{ok}");
        }
        for bad in [
            "file:///etc/passwd",
            "tauri://localhost/",
            "ipc://localhost/x",
            "artifact://a/b",
            "asset://localhost/x",
            "vibework://open",
            "mailto:a@b.com",
            "javascript:alert(1)",
            "nonsense",
        ] {
            assert!(!navigation_allowed(bad), "{bad}");
        }
    }
}
