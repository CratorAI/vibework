# Snapshot + Refs Workflow

The core innovation of agent-browser: compact element references that reduce context usage dramatically for AI agents.

> **Usage:** Pass these commands to the `AgentBrowser` tool's `command` parameter.

## How It Works

### The Problem
Traditional browser automation sends full DOM to AI agents:
```
Full DOM/HTML sent → AI parses → Generates CSS selector → Executes action
~3000-5000 tokens per interaction
```

### The Solution
agent-browser uses compact snapshots with refs:
```
Compact snapshot → @refs assigned → Direct ref interaction
~200-400 tokens per interaction
```

## The Snapshot Command

```
# Basic snapshot (shows page structure)
snapshot

# Interactive snapshot (-i flag) - RECOMMENDED
snapshot -i
```

### Snapshot Output Format

```
Page: Example Site - Home
URL: https://example.com

@e1 [header]
  @e2 [nav]
    @e3 [a] "Home"
    @e4 [a] "Products"
    @e5 [a] "About"
  @e6 [button] "Sign In"

@e7 [main]
  @e8 [h1] "Welcome"
  @e9 [form]
    @e10 [input type="email"] placeholder="Email"
    @e11 [input type="password"] placeholder="Password"
    @e12 [button type="submit"] "Log In"

@e13 [footer]
  @e14 [a] "Privacy Policy"
```

## Using Refs

Once you have refs, interact directly:

```
# Click the "Sign In" button
click @e6

# Fill email input
fill @e10 "user@example.com"

# Fill password
fill @e11 "password123"

# Submit the form
click @e12
```

## Ref Lifecycle

**IMPORTANT**: Refs are invalidated when the page changes!

```
# Get initial snapshot
snapshot -i
# @e1 [button] "Next"

# Click triggers page change
click @e1

# MUST re-snapshot to get new refs!
snapshot -i
# @e1 [h1] "Page 2"  ← Different element now!
```

## Best Practices

### 1. Always Snapshot Before Interacting

```
# CORRECT
open https://example.com
snapshot -i          # Get refs first
click @e1            # Use ref

# WRONG
open https://example.com
click @e1            # Ref doesn't exist yet!
```

### 2. Re-Snapshot After Navigation

```
click @e5            # Navigates to new page
snapshot -i          # Get new refs
click @e1            # Use new refs
```

### 3. Re-Snapshot After Dynamic Changes

```
click @e1            # Opens dropdown
snapshot -i          # See dropdown items
click @e7            # Select item
```

### 4. Snapshot Specific Regions

For complex pages, snapshot specific areas:

```
# Snapshot just the form
snapshot @e9
```

## Ref Notation Details

```
@e1 [tag type="value"] "text content" placeholder="hint"
│    │   │             │               │
│    │   │             │               └─ Additional attributes
│    │   │             └─ Visible text
│    │   └─ Key attributes shown
│    └─ HTML tag name
└─ Unique ref ID
```

### Common Patterns

```
@e1 [button] "Submit"                    # Button with text
@e2 [input type="email"]                 # Email input
@e3 [input type="password"]              # Password input
@e4 [a href="/page"] "Link Text"         # Anchor link
@e5 [select]                             # Dropdown
@e6 [textarea] placeholder="Message"     # Text area
@e7 [div class="modal"]                  # Container (when relevant)
@e8 [img alt="Logo"]                     # Image
@e9 [checkbox] checked                   # Checked checkbox
@e10 [radio] selected                    # Selected radio
```

## Troubleshooting

### "Ref not found" Error

```
# Ref may have changed - re-snapshot
snapshot -i
```

### Element Not Visible in Snapshot

```
# Scroll to reveal element
scroll down 500
snapshot -i

# Or wait for dynamic content
wait 1000
snapshot -i
```

### Too Many Elements

```
# Snapshot specific container
snapshot @e5

# Or use get text for content-only extraction
get text @e5
```
