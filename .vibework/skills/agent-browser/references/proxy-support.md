# Proxy Support

Configure proxy servers for browser automation, useful for geo-testing, rate limiting avoidance, and corporate environments.

> **Usage:** Pass commands to the `AgentBrowser` tool. Proxy settings use the `--proxy` flag or environment variables.

## Basic Proxy Configuration

Use the `--proxy` flag with your commands:

```
# HTTP proxy
--proxy http://proxy.example.com:8080 open https://example.com

# HTTPS proxy
--proxy https://proxy.example.com:8080 open https://example.com
```

Or set environment variables before the session (these affect all subsequent commands).

## Authenticated Proxy

For proxies requiring authentication:

```
# Include credentials in URL
--proxy http://username:password@proxy.example.com:8080 open https://example.com
```

## SOCKS Proxy

```
# SOCKS5 proxy
--proxy socks5://proxy.example.com:1080 open https://example.com

# SOCKS5 with auth
--proxy socks5://user:pass@proxy.example.com:1080 open https://example.com
```

## Proxy Bypass

For bypassing proxy on specific domains, set the `NO_PROXY` environment variable before starting your session.

## Common Use Cases

### Geo-Location Testing

Use different proxies with sessions to test from different regions:

```
# US region
--proxy http://us-proxy.example.com:8080 --session us open https://example.com
--session us screenshot ./screenshots/us.png
--session us close

# EU region
--proxy http://eu-proxy.example.com:8080 --session eu open https://example.com
--session eu screenshot ./screenshots/eu.png
--session eu close
```

### Corporate Network Access

```
# External sites through proxy
--proxy http://corpproxy.company.com:8080 open https://external-vendor.com

# Internal sites (no proxy needed if NO_PROXY is set)
open https://intranet.company.com
```

## Verifying Proxy Connection

```
# Check your apparent IP
open https://httpbin.org/ip
get text body
# Should show proxy's IP, not your real IP
```

## Troubleshooting

### SSL/TLS Errors Through Proxy

Some proxies perform SSL inspection. If you encounter certificate errors:

```
# For testing only - not recommended for production
open https://example.com --ignore-https-errors
```

## Best Practices

1. **Use environment variables** - Don't hardcode proxy credentials
2. **Set NO_PROXY appropriately** - Avoid routing local traffic through proxy
3. **Test proxy before automation** - Verify connectivity with simple requests
4. **Handle proxy failures gracefully** - Implement retry logic for unstable proxies
5. **Rotate proxies for large scraping jobs** - Distribute load and avoid bans
