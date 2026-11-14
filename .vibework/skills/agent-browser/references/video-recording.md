# Video Recording

Capture browser automation sessions as video for debugging, documentation, or verification.

> **Usage:** Pass these commands to the `AgentBrowser` tool's `command` parameter.

## Basic Recording

```
# Start recording
record start ./demo.webm

# Perform actions
open https://example.com
snapshot -i
click @e1
fill @e2 "test input"

# Stop and save
record stop
```

## Recording Commands

```
# Start recording to file
record start ./output.webm

# Stop current recording
record stop

# Restart with new file (stops current + starts new)
record restart ./take2.webm
```

## Use Cases

### Debugging Failed Automation

```
# Start recording before your automation
record start ./debug-session.webm

# Run your automation
open https://app.example.com
snapshot -i
click @e1

# If something fails, stop recording to save evidence
record stop
```

### Documentation Generation

```
# Record workflow for documentation
record start ./docs/how-to-login.webm

open https://app.example.com/login
wait 1000  # Pause for visibility

snapshot -i
fill @e1 "demo@example.com"
wait 500

fill @e2 "password"
wait 500

click @e3
wait --load networkidle
wait 1000  # Show result

record stop
```

## Best Practices

### 1. Add Pauses for Clarity

```
# Slow down for human viewing
click @e1
wait 500  # Let viewer see result
```

### 2. Use Descriptive Filenames

```
# Include context in filename
record start ./recordings/login-flow-2024-01-15.webm
record start ./recordings/checkout-test-run-42.webm
```

### 3. Combine with Screenshots

```
# Record video AND capture key frames
record start ./flow.webm

open https://example.com
screenshot ./screenshots/step1-homepage.png

click @e1
screenshot ./screenshots/step2-after-click.png

record stop
```

## Output Format

- Default format: WebM (VP8/VP9 codec)
- Compatible with all modern browsers and video players
- Compressed but high quality

## Limitations

- Recording adds slight overhead to automation
- Large recordings can consume significant disk space
- Some headless environments may have codec limitations
