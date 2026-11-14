# Installed-agent SDK bridge

`claude.mjs` uses the official Claude Agent SDK **0.3.321**, matching T3 Code's
SDK family. It launches only the installed Claude executable passed by Rust.
No CLI binary, credentials, user configuration or additional runtime is bundled.
The committed runtime bundle is generated JavaScript; SDK notices live beside it.
The app runs it with its existing OpenCode binary's Bun runtime (`BUN_BE_BUN=1`).

Rebuild in a temporary directory, without changing shared node_modules:

1. Copy `claude.mjs` and `claude-events.mjs` into the temporary directory.
2. Install `@anthropic-ai/claude-agent-sdk@0.3.321` there with
   `npm install --ignore-scripts --omit=optional` (the installed CLI is used).
3. Run `BUN_BE_BUN=1 <opencode-binary> build <temp>/claude.mjs --target=bun
   --packages=bundle --outfile=src-tauri/resources/agents/claude.mjs`.
4. Retain the package LICENSE and README in `src-tauri/resources/agents`.
5. Run `bunx vitest run scripts/external/claude-events.test.js` and the Rust tests.

The child speaks the same narrow JSONL envelope as the Codex transport, allowing
the Rust lifecycle and history reducer to remain shared. Normal user/project/local
settings, hooks, plugins and MCP servers are loaded by Claude itself. The SDK
services initialization and its control protocol; Vibework only answers native
permissions/questions. No user setting is saved. Unrecognized host requests fail
closed. Costs returned by the SDK are deliberately not forwarded to the UI.

The fixture is a filtered real six-byte file-write transcript, with normal
message/tool fields only; no initialization/account/configuration messages.
