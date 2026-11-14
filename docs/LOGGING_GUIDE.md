# Logging

Rust tracing is configured in src-tauri/src/logs_syncer. Use `bun run tauri:dev`,
`bun run tauri:dev:debug` or `bun run tauri:dev:trace`. Logs can contain task paths
and tool output. Inspect and redact them locally before sharing a report. Never
include provider keys or connector credentials in logs. Debug bridge configuration
is documented in scripts/e2e/README.md and is unavailable in ordinary releases.
