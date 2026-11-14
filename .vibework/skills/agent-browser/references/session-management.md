# Session Management

Run multiple isolated browser sessions concurrently with state persistence.

> **Usage:** Pass these commands to the `AgentBrowser` tool's `command` parameter.

## Named Sessions

Use `--session` flag to isolate browser contexts:

```
# Session 1: Authentication flow
--session auth open https://app.example.com/login

# Session 2: Public browsing (separate cookies, storage)
--session public open https://example.com

# Commands are isolated by session
--session auth fill @e1 "user@example.com"
--session public get text body
```

## Session Isolation Properties

Each session has independent:
- Cookies
- LocalStorage / SessionStorage
- IndexedDB
- Cache
- Browsing history
- Open tabs

## Session State Persistence

### Save Session State

```
# Save cookies, storage, and auth state
state save /path/to/auth-state.json
```

### Load Session State

```
# Restore saved state
state load /path/to/auth-state.json

# Continue with authenticated session
open https://app.example.com/dashboard
```

### State File Contents

```json
{
  "cookies": [...],
  "localStorage": {...},
  "sessionStorage": {...},
  "origins": [...]
}
```

## Common Patterns

### Authenticated Session Reuse

```
# Try to load existing state
state load "/tmp/auth-state.json"
open https://app.example.com/dashboard

# If redirected to login (state expired), perform login:
open https://app.example.com/login
snapshot -i
fill @e1 "username"
fill @e2 "password"
click @e3
wait --load networkidle

# Save for future use
state save "/tmp/auth-state.json"
```

### Concurrent Sessions

Use different sessions to work with multiple sites:

```
# Start sessions
--session site1 open https://site1.com
--session site2 open https://site2.com

# Extract from each
--session site1 get text body
--session site2 get text body

# Cleanup
--session site1 close
--session site2 close
```

### A/B Testing Sessions

```
# Test different user experiences
--session variant-a open "https://app.com?variant=a"
--session variant-b open "https://app.com?variant=b"

# Compare
--session variant-a screenshot /tmp/variant-a.png
--session variant-b screenshot /tmp/variant-b.png
```

## Default Session

When `--session` is omitted, commands use the default session:

```
# These use the same default session
open https://example.com
snapshot -i
close  # Closes default session
```

## Session Cleanup

```
# Close specific session
--session auth close

# List active sessions
session list
```

## Best Practices

### 1. Name Sessions Semantically

```
# GOOD: Clear purpose
--session github-auth open https://github.com
--session docs-scrape open https://docs.example.com

# AVOID: Generic names
--session s1 open https://github.com
```

### 2. Always Clean Up

```
# Close sessions when done
--session auth close
--session scrape close
```

### 3. Handle State Files Securely

Don't commit state files (they contain auth tokens). Delete after use.

### 4. Use Timeouts for Long Operations

Use the `timeout` parameter in the AgentBrowser tool for long-running commands.
