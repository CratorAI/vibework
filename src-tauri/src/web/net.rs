//! Network guard for WebFetch.
//!
//! The model chooses the URL, so requests must not reach the user's own
//! machine, their local network, or cloud metadata services. Every check
//! happens on the final addresses: hostnames are resolved by our own DNS
//! resolver (which refuses private answers), IP-literal hosts are checked
//! before the request and on every redirect, and proxies are disabled so
//! resolution cannot happen somewhere we do not see.

use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use reqwest::Url;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::sync::Arc;

/// Error used when a request targets a blocked address.
#[derive(Debug, Clone)]
pub struct BlockedAddress(pub String);

impl std::fmt::Display for BlockedAddress {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}: requests to local, private-network, link-local or cloud-metadata addresses are not allowed",
            self.0
        )
    }
}

impl std::error::Error for BlockedAddress {}

/// Hostnames refused before any DNS lookup.
fn is_blocked_hostname(host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    host == "localhost"
        || host.ends_with(".localhost")
        || host == "metadata"
        || host == "metadata.google.internal"
        || host.ends_with(".internal")
        || host.ends_with(".local")
        || host == "instance-data"
        || host.ends_with(".home.arpa")
}

fn is_blocked_ipv4(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    ip.is_unspecified()                                   // 0.0.0.0
        || o[0] == 0                                      // 0.0.0.0/8 "this network"
        || ip.is_loopback()                               // 127.0.0.0/8
        || ip.is_private()                                // 10/8, 172.16/12, 192.168/16
        || ip.is_link_local()                             // 169.254/16 (incl. 169.254.169.254 metadata)
        || (o[0] == 100 && (o[1] & 0xC0) == 64)           // 100.64/10 CGNAT (incl. 100.100.100.200 metadata)
        || (o[0] == 192 && o[1] == 0 && o[2] == 0)        // 192.0.0.0/24 IETF protocol assignments
        || (o[0] == 192 && o[1] == 0 && o[2] == 2)        // 192.0.2.0/24 TEST-NET-1
        || (o[0] == 198 && o[1] == 51 && o[2] == 100)     // TEST-NET-2
        || (o[0] == 203 && o[1] == 0 && o[2] == 113)      // TEST-NET-3
        || (o[0] == 198 && (o[1] & 0xFE) == 18)           // 198.18/15 benchmarking
        || (o[0] == 192 && o[1] == 88 && o[2] == 99)      // 6to4 relay anycast
        || ip.is_multicast()                              // 224/4
        || o[0] >= 240                                    // 240/4 reserved + broadcast
}

fn is_blocked_ipv6(ip: Ipv6Addr) -> bool {
    if ip.is_unspecified() || ip.is_loopback() || ip.is_multicast() {
        return true;
    }
    let seg = ip.segments();
    // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d): check the embedded v4.
    if seg[0..5].iter().all(|&s| s == 0) && (seg[5] == 0xffff || seg[5] == 0) {
        let v4 = Ipv4Addr::new((seg[6] >> 8) as u8, seg[6] as u8, (seg[7] >> 8) as u8, seg[7] as u8);
        return is_blocked_ipv4(v4);
    }
    // NAT64 well-known prefix 64:ff9b::/96 and local-use 64:ff9b:1::/48.
    if seg[0] == 0x0064 && seg[1] == 0xff9b {
        let v4 = Ipv4Addr::new((seg[6] >> 8) as u8, seg[6] as u8, (seg[7] >> 8) as u8, seg[7] as u8);
        return seg[2] == 1 || is_blocked_ipv4(v4);
    }
    // 6to4 2002::/16 embeds a v4 address in segments 1-2.
    if seg[0] == 0x2002 {
        let v4 = Ipv4Addr::new((seg[1] >> 8) as u8, seg[1] as u8, (seg[2] >> 8) as u8, seg[2] as u8);
        return is_blocked_ipv4(v4);
    }
    (seg[0] & 0xfe00) == 0xfc00          // fc00::/7 unique local (incl. fd00:ec2::254 AWS metadata)
        || (seg[0] & 0xffc0) == 0xfe80   // fe80::/10 link-local
        || (seg[0] & 0xffc0) == 0xfec0   // fec0::/10 site-local (deprecated)
        || (seg[0] == 0x2001 && seg[1] == 0x0db8) // documentation
        || (seg[0] == 0x2001 && seg[1] == 0x0000) // Teredo
        || seg[0] == 0x0100 && seg[1..4].iter().all(|&s| s == 0) // 100::/64 discard
}

/// Whether an IP address is off-limits for WebFetch.
pub fn is_blocked_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_blocked_ipv4(v4),
        IpAddr::V6(v6) => is_blocked_ipv6(v6),
    }
}

/// Check a URL before requesting it (and on every redirect): scheme must be
/// http(s); IP-literal hosts and well-known local hostnames are refused.
/// Domain names are additionally checked after DNS resolution by
/// [`GuardedResolver`].
pub fn check_url(url: &Url) -> Result<(), String> {
    match url.scheme() {
        "http" | "https" => {}
        other => {
            return Err(format!(
                "Only http and https URLs can be fetched (got '{}:').",
                other
            ))
        }
    }
    match url.host() {
        None => Err("The URL has no host.".to_string()),
        Some(url::Host::Ipv4(ip)) => {
            if is_blocked_ip(IpAddr::V4(ip)) {
                Err(BlockedAddress(ip.to_string()).to_string())
            } else {
                Ok(())
            }
        }
        Some(url::Host::Ipv6(ip)) => {
            if is_blocked_ip(IpAddr::V6(ip)) {
                Err(BlockedAddress(ip.to_string()).to_string())
            } else {
                Ok(())
            }
        }
        Some(url::Host::Domain(host)) => {
            if is_blocked_hostname(host) {
                Err(BlockedAddress(host.to_string()).to_string())
            } else {
                Ok(())
            }
        }
    }
}

/// DNS resolver that refuses names resolving to any blocked address. If any
/// answer is blocked the whole lookup fails, so a name mixing public and
/// private answers (or rebinding between them) cannot slip through.
#[derive(Debug, Default)]
pub struct GuardedResolver;

impl Resolve for GuardedResolver {
    fn resolve(&self, name: Name) -> Resolving {
        let host = name.as_str().to_string();
        Box::pin(async move {
            if is_blocked_hostname(&host) {
                return Err(Box::new(BlockedAddress(host)) as Box<dyn std::error::Error + Send + Sync>);
            }
            let addrs: Vec<SocketAddr> = tokio::net::lookup_host((host.as_str(), 0))
                .await
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?
                .collect();
            if addrs.is_empty() {
                return Err(format!("{} did not resolve to any address", host).into());
            }
            if let Some(bad) = addrs.iter().find(|a| is_blocked_ip(a.ip())) {
                return Err(Box::new(BlockedAddress(format!("{} resolves to {}", host, bad.ip())))
                    as Box<dyn std::error::Error + Send + Sync>);
            }
            let addrs: Addrs = Box::new(addrs.into_iter());
            Ok(addrs)
        })
    }
}

/// Find a [`BlockedAddress`] anywhere in an error's source chain.
pub fn find_blocked(err: &(dyn std::error::Error + 'static)) -> Option<String> {
    let mut current: Option<&(dyn std::error::Error + 'static)> = Some(err);
    while let Some(e) = current {
        if let Some(blocked) = e.downcast_ref::<BlockedAddress>() {
            return Some(blocked.to_string());
        }
        current = e.source();
    }
    None
}

/// The resolver as the Arc reqwest expects.
pub fn guarded_resolver() -> Arc<GuardedResolver> {
    Arc::new(GuardedResolver)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn blocked(url: &str) -> bool {
        check_url(&Url::parse(url).unwrap()).is_err()
    }

    #[test]
    fn schemes() {
        assert!(!blocked("https://example.com/"));
        assert!(!blocked("http://example.com/"));
        assert!(blocked("file:///etc/passwd"));
        assert!(blocked("ftp://example.com/"));
        assert!(blocked("gopher://example.com/"));
        assert!(blocked("data:text/plain,hi"));
        assert!(blocked("javascript:alert(1)"));
    }

    #[test]
    fn loopback_private_and_metadata_literals() {
        for url in [
            "http://127.0.0.1/",
            "http://127.1.2.3:8080/",
            "http://0.0.0.0/",
            "http://10.0.0.1/",
            "http://172.16.5.4/",
            "http://172.31.255.255/",
            "http://192.168.1.1/",
            "http://169.254.169.254/latest/meta-data/",
            "http://100.100.100.200/",
            "http://100.64.0.1/",
            "http://[::1]/",
            "http://[::]/",
            "http://[fe80::1]/",
            "http://[fd00:ec2::254]/",
            "http://[fc00::1]/",
            "http://[::ffff:127.0.0.1]/",
            "http://[::ffff:169.254.169.254]/",
            "http://[64:ff9b::a9fe:a9fe]/",
            "http://[2002:7f00:1::]/",
            "http://224.0.0.1/",
            "http://255.255.255.255/",
            // Alternative IPv4 spellings are normalised by the URL parser.
            "http://2130706433/",
            "http://0x7f.1/",
            "http://0177.0.0.1/",
            "http://127.1/",
        ] {
            assert!(blocked(url), "{} should be blocked", url);
        }
    }

    #[test]
    fn local_hostnames() {
        for url in [
            "http://localhost/",
            "http://LOCALHOST:3000/",
            "http://foo.localhost/",
            "http://localhost./",
            "http://metadata.google.internal/computeMetadata/v1/",
            "http://printer.local/",
            "http://router.home.arpa/",
        ] {
            assert!(blocked(url), "{} should be blocked", url);
        }
    }

    #[test]
    fn public_addresses_pass() {
        for url in [
            "http://1.1.1.1/",
            "http://8.8.8.8/",
            "http://93.184.215.14/",
            "http://172.32.0.1/",
            "http://100.128.0.1/",
            "http://[2606:4700:4700::1111]/",
            "https://example.com:8443/path?q=1",
        ] {
            assert!(!blocked(url), "{} should be allowed", url);
        }
    }

    #[test]
    fn resolver_refuses_local_names() {
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        rt.block_on(async {
            let resolver = GuardedResolver;
            let err = resolver.resolve("localhost".parse().unwrap()).await.err().unwrap();
            assert!(find_blocked(err.as_ref()).is_some());
        });
    }

    #[test]
    fn blocked_message_is_clear() {
        let msg = check_url(&Url::parse("http://127.0.0.1/").unwrap()).unwrap_err();
        assert!(msg.contains("local"), "{}", msg);
        assert!(msg.contains("not allowed"), "{}", msg);
    }
}
