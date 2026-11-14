---
name: agent-browser
description: Automates browser interactions for web testing, form filling, screenshots, and data extraction. Use when the user needs to navigate websites, interact with web pages, fill forms, take screenshots, test web applications, or extract information from web pages.
allowed-tools: AgentBrowser
---

# Browser Automation with agent-browser

> **How to use:** Pass commands to the `AgentBrowser` tool. The commands below are passed as the `command` parameter.

## Quick start

```
open <url>        # Navigate to page
snapshot -i       # Get interactive elements with refs
click @e1         # Click element by ref
fill @e2 "text"   # Fill input by ref
close             # Close browser
```

## Core workflow

1. Navigate: `open <url>`
2. Snapshot: `snapshot -i` (returns elements with refs like `@e1`, `@e2`)
3. Interact using refs from the snapshot
4. Re-snapshot after navigation or significant DOM changes

## Commands

### Navigation

```
open <url>      # Navigate to URL (aliases: goto, navigate)
                # Supports: https://, http://, file://, about:, data://
                # Auto-prepends https:// if no protocol given
back            # Go back
forward         # Go forward
reload          # Reload page
close           # Close browser (aliases: quit, exit)
connect 9222    # Connect to browser via CDP port
```

### Snapshot (page analysis)

```
snapshot            # Full accessibility tree
snapshot -i         # Interactive elements only (recommended)
snapshot -c         # Compact output
snapshot -d 3       # Limit depth to 3
snapshot -s "#main" # Scope to CSS selector
```

### Interactions (use @refs from snapshot)

```
click @e1           # Click
dblclick @e1        # Double-click
focus @e1           # Focus element
fill @e2 "text"     # Clear and type
type @e2 "text"     # Type without clearing
press Enter         # Press key (alias: key)
press Control+a     # Key combination
keydown Shift       # Hold key down
keyup Shift         # Release key
hover @e1           # Hover
check @e1           # Check checkbox
uncheck @e1         # Uncheck checkbox
select @e1 "value"  # Select dropdown option
select @e1 "a" "b"  # Select multiple options
scroll down 500     # Scroll page (default: down 300px)
scrollintoview @e1  # Scroll element into view (alias: scrollinto)
drag @e1 @e2        # Drag and drop
upload @e1 file.pdf # Upload files
```

### Get information

```
get text @e1        # Get element text
get html @e1        # Get innerHTML
get value @e1       # Get input value
get attr @e1 href   # Get attribute
get title           # Get page title
get url             # Get current URL
get count ".item"   # Count matching elements
get box @e1         # Get bounding box
get styles @e1      # Get computed styles (font, color, bg, etc.)
```

### Check state

```
is visible @e1      # Check if visible
is enabled @e1      # Check if enabled
is checked @e1      # Check if checked
```

### Screenshots & PDF

```
screenshot          # Save to a temporary directory
screenshot path.png # Save to a specific path
screenshot --full   # Full page
pdf output.pdf      # Save as PDF
```

### Video recording

```
record start ./demo.webm    # Start recording (uses current URL + state)
click @e1                   # Perform actions
record stop                 # Stop and save video
record restart ./take2.webm # Stop current + start new recording
```

Recording creates a fresh context but preserves cookies/storage from your session. If no URL is provided, it
automatically returns to your current page. For smooth demos, explore first, then start recording.

### Wait

```
wait @e1                     # Wait for element
wait 2000                    # Wait milliseconds
wait --text "Success"        # Wait for text (or -t)
wait --url "**/dashboard"    # Wait for URL pattern (or -u)
wait --load networkidle      # Wait for network idle (or -l)
wait --fn "window.ready"     # Wait for JS condition (or -f)
```

### Mouse control

```
mouse move 100 200      # Move mouse
mouse down left         # Press button
mouse up left           # Release button
mouse wheel 100         # Scroll wheel
```

### Semantic locators (alternative to refs)

```
find role button click --name "Submit"
find text "Sign In" click
find text "Sign In" click --exact      # Exact match only
find label "Email" fill "user@example.test"
find placeholder "Search" type "query"
find alt "Logo" click
find title "Close" click
find testid "submit-btn" click
find first ".item" click
find last ".item" click
find nth 2 "a" hover
```

### Browser settings

```
set viewport 1920 1080          # Set viewport size
set device "iPhone 14"          # Emulate device
set geo 37.7749 -122.4194       # Set geolocation (alias: geolocation)
set offline on                  # Toggle offline mode
set headers '{"X-Key":"v"}'     # Extra HTTP headers
set credentials user pass       # HTTP basic auth (alias: auth)
set media dark                  # Emulate color scheme
set media light reduced-motion  # Light mode + reduced motion
```

### Cookies & Storage

```
cookies                     # Get all cookies
cookies set name value      # Set cookie
cookies clear               # Clear cookies
storage local               # Get all localStorage
storage local key           # Get specific key
storage local set k v       # Set value
storage local clear         # Clear all
```

### Network

```
network route <url>              # Intercept requests
network route <url> --abort      # Block requests
network route <url> --body '{}'  # Mock response
network unroute [url]            # Remove routes
network requests                 # View tracked requests
network requests --filter api    # Filter requests
```

### Tabs & Windows

```
tab                 # List tabs
tab new [url]       # New tab
tab 2               # Switch to tab by index
tab close           # Close current tab
tab close 2         # Close tab by index
window new          # New window
```

### Frames

```
frame "#iframe"     # Switch to iframe
frame main          # Back to main frame
```

### Dialogs

```
dialog accept [text]  # Accept dialog
dialog dismiss        # Dismiss dialog
```

### JavaScript

```
eval "document.title"   # Run JavaScript
```

## Global options

```
--session <name> ...    # Isolated browser session
--json ...              # JSON output for parsing
--headed ...            # Show browser window (not headless)
--full ...              # Full page screenshot (-f)
--cdp <port> ...        # Connect via Chrome DevTools Protocol
-p <provider> ...       # Cloud browser provider (--provider)
--proxy <url> ...       # Use proxy server
--headers <json> ...    # HTTP headers scoped to URL's origin
--executable-path <p>   # Custom browser executable
--extension <path> ...  # Load browser extension (repeatable)
--help                  # Show help (-h)
--version               # Show version (-V)
<command> --help        # Show detailed help for a command
```

### Proxy support

```
--proxy http://proxy.com:8080 open example.com
--proxy http://user:pass@proxy.example:8080 open example.com
--proxy socks5://proxy.com:1080 open example.com
```

## Environment variables

```bash
AGENT_BROWSER_SESSION="mysession"            # Default session name
AGENT_BROWSER_EXECUTABLE_PATH="/path/chrome" # Custom browser path
AGENT_BROWSER_EXTENSIONS="/ext1,/ext2"       # Comma-separated extension paths
AGENT_BROWSER_PROVIDER="your-cloud-browser-provider"  # Cloud browser provider (select browseruse or browserbase)
AGENT_BROWSER_STREAM_PORT="9223"             # WebSocket streaming port
AGENT_BROWSER_HOME="/path/to/agent-browser"  # Custom install location (for daemon.js)
```

## Example: Form submission

```
open https://example.com/form
snapshot -i
# Output shows: textbox "Email" [ref=e1], textbox "Password" [ref=e2], button "Submit" [ref=e3]

fill @e1 "user@example.com"
fill @e2 "password123"
click @e3
wait --load networkidle
snapshot -i  # Check result
```

## Example: Authentication with saved state

```
# Login once
open https://app.example.com/login
snapshot -i
fill @e1 "username"
fill @e2 "password"
click @e3
wait --url "**/dashboard"
state save auth.json

# Later sessions: load saved state
state load auth.json
open https://app.example.com/dashboard
```

## Sessions (parallel browsers)

```
--session test1 open site-a.com
--session test2 open site-b.com
session list
```

## JSON output (for parsing)

Add `--json` for machine-readable output:

```
snapshot -i --json
get text @e1 --json
```

## Debugging

```
--headed open example.com   # Show browser window
--cdp 9222 snapshot         # Connect via CDP port
connect 9222                # Alternative: connect command
console                     # View console messages
console --clear             # Clear console
errors                      # View page errors
errors --clear              # Clear errors
highlight @e1               # Highlight element
trace start                 # Start recording trace
trace stop trace.zip        # Stop and save trace
record start ./debug.webm   # Record video from current page
record stop                 # Save recording
```

## Deep-dive documentation

For detailed patterns and best practices, see:

| Reference | Description |
|-----------|-------------|
| [references/snapshot-refs.md](references/snapshot-refs.md) | Ref lifecycle, invalidation rules, troubleshooting |
| [references/session-management.md](references/session-management.md) | Parallel sessions, state persistence, concurrent scraping |
| [references/authentication.md](references/authentication.md) | Login flows, OAuth, 2FA handling, state reuse |
| [references/video-recording.md](references/video-recording.md) | Recording workflows for debugging and documentation |
| [references/proxy-support.md](references/proxy-support.md) | Proxy configuration, geo-testing, rotating proxies |

## Workflow templates

Step-by-step guides for common patterns:

| Template | Description |
|----------|-------------|
| [templates/form-automation.md](templates/form-automation.md) | Form filling with validation |
| [templates/authenticated-session.md](templates/authenticated-session.md) | Login once, reuse state |
| [templates/capture-workflow.md](templates/capture-workflow.md) | Content extraction with screenshots |

## HTTPS Certificate Errors

For sites with self-signed or invalid certificates:
```
open https://localhost:8443 --ignore-https-errors
```

## Learning from Success

**IMPORTANT:** When you successfully complete a browser automation task, save the working pattern to `.vibework/skills/agent-browser/memory.md` for future reference.

### What to save:
- **Site-specific selectors** - Working selectors for sites that required trial and error
- **Authentication flows** - Login sequences that worked (without credentials)
- **Timing patterns** - Wait strategies that resolved flaky interactions
- **Workarounds** - Solutions for unusual site behaviors or anti-bot measures

### Format:
```markdown
## [Site/Domain or Task Type]

**Date:** YYYY-MM-DD
**Task:** Brief description

**What worked:**
- Step-by-step commands that succeeded
- Key selectors or refs used
- Any wait strategies needed

**Notes:** Any quirks or gotchas for this site
```

### Example entry:
```markdown
## GitHub - Creating a new repository

**Date:** 2024-01-15
**Task:** Create new repo via web UI

**What worked:**
- Navigate: `open https://github.com/new --headed --profile "..."`
- Wait for form: `wait @e1` (repo name input)
- Fill name: `fill @e1 "my-repo"`
- Select private: `click @e5` (private radio)
- Submit: `click @e12` (Create repository button)
- Wait for redirect: `wait --url "**/my-repo"`

**Notes:** GitHub uses dynamic refs; always re-snapshot after any interaction
```

Reading `memory.md` before starting a task helps avoid repeating failed approaches.
