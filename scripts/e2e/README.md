# Real macOS webview automation (debug only)

From the repository root:

```sh
mkdir -p /tmp/vibework-e2e
VIBEWORK_DEV_OPENROUTER_KEY=dummy-not-a-key VIBEWORK_DEV_BRIDGE=1 DEVELOPER_DIR=/Library/Developer/CommandLineTools RUST_LOG=info bun run tauri dev
bun scripts/e2e/bridge-smoke.mjs
bun scripts/e2e/client.mjs state
bun scripts/e2e/client.mjs 'return document.body.innerText;'
```

A dummy key keeps the Keychain out of it entirely (no model turn can succeed;
use the fake-model harness for those). For real model runs the key can come
from `security find-generic-password -s vibe-work-openrouter -a api-key -w`,
but on a Mac whose Keychain asks, that puts a prompt on the screen.

### A separate data folder

To run a dev copy beside an installed Vibework without sharing its tasks, settings, engine or search index, give it a data folder of its own (debug builds only; absolute path):

```sh
mkdir -p /tmp/vibework-dev-data
VIBEWORK_DEV_DATA_DIR=/tmp/vibework-dev-data VIBEWORK_DEV_OPENROUTER_KEY="…" VIBEWORK_DEV_BRIDGE=1 DEVELOPER_DIR=/Library/Developer/CommandLineTools RUST_LOG=info bun run tauri dev
VIBEWORK_DEV_DATA_DIR=/tmp/vibework-dev-data bun scripts/e2e/client.mjs state
```

Everything the app keeps under `~/Library/Application Support/com.vibeworkapp.vibework/` (config.json, `opencode/` (connectors and their sign-ins included), `skills/`, `.vibework/`, `scratch/`, `search/`, `logs/`, `dev-bridge.json`) then lives in that folder, and the copy skips the single-instance hand-off, so it starts even while the installed app runs (without the override a second copy would focus the installed app's window and quit, and the two would share the engine's pid file). Not separated: the Keychain item (use `VIBEWORK_DEV_OPENROUTER_KEY`), the personal skill folders (`~/.claude/skills`, `~/.agents/skills`, read only), and the default folder for tasks without one (`~/Desktop/vibework` unless set in that copy's Settings). `client.mjs` reads the bridge file from `VIBEWORK_DEV_DATA_DIR` when it is set. Release builds ignore the variable.

The bridge is entirely excluded from release builds. Without the environment opt-in it opens no listener. Each launch binds a random loopback TCP port and writes a fresh token into `~/Library/Application Support/com.vibeworkapp.vibework/dev-bridge.json` (0600 on Unix). Override the client path with `VIBEWORK_BRIDGE_FILE`. Treat that file as a local credential; do not commit or share it. A stale file after exit cannot authenticate to the next launch.

Protocol: one newline-delimited JSON request per TCP connection, with `token`, `op` (`state`, `eval`, `drop` or `quit`), and `code` for eval. `drop` takes `paths` and behaves like dropping those files on the main window from Finder (they become attachments and their images can be previewed): `dropFiles([...])` in `client.mjs`. `quit` exits the app through Tauri's normal exit path, so exit cleanup (MCP servers, the OpenCode engine) runs: `bun scripts/e2e/client.mjs quit`. Code is an async function body, so use `return` to retrieve a value. Results are awaited, JSON serialized and returned through a main-webview-only debug Tauri command. Errors include message and stack. Evaluation times out after 30 seconds (it does not cancel already started JS). Requests are capped at 1 MiB. This is a trusted local developer tool, with full main-webview authority, never a remotely exposed server.

Import `evaluate`, `waitFor`, `waitText`, `click`, `clickText`, `type`, `text`, `collectErrors`, `errors`, `capture` from `client.mjs`. `type` inserts contenteditable text using the webview's native editing command, which fires input events for Lexical; normal inputs use the same native editing command after selecting their existing contents. No React state is patched. Start `collectErrors` after each navigation/reload. Screenshots focus the main window before using the task's supplied local helper (change its path if that scratch directory is removed).

Native dialogs/browser content aren't DOM children: in dev builds, set `window.__e2eFolderDialog = "/some/folder"` (or `null` for Cancel) before an action that opens the folder dialog, and `openFolderPicker` returns it instead of showing the panel (the rest of the path, consent included, runs as usual). Otherwise check backend state and actual window captures. A passing bridge smoke test is not evidence of feature coverage. The debug key variable bypasses Keychain completely, including set/clear (in-memory only). Never echo it or save it in a file. Release builds ignore it. Without it, normal Keychain access runs off the startup path: the window opens independently and explains the wait. Invalid-key testing in override mode does not exercise real Keychain writes.

### A free fake model (`VIBEWORK_DEV_OPENROUTER_ORIGIN`)

For checks that need a model turn (a file presented, a tool row), point a
debug build's model proxy at a local stand-in:
`VIBEWORK_DEV_OPENROUTER_ORIGIN=http://127.0.0.1:<port>` (loopback only;
release builds ignore it). Requests keep their path (`/api/v1/chat/completions`)
and get the dummy key, so any OpenAI-compatible fake that streams
`chat.completion.chunk`s works; to present a file it answers with a
`vibework_present_file` tool call (`file_path`, `file_name`). Nothing reaches
OpenRouter and nothing is charged. To check setting a connector up from a
task, it answers with a `shell` call running `opencode mcp add <name> --url
<address of the fake OAuth server below>`: the task's PATH starts with the
app's own `opencode` (`<data folder>/runtimes/engine-bin/opencode`), so it
writes the dev copy's connectors file, never `~/.config/opencode`. After
the approved add the app starts the sign-in itself; with
`VIBEWORK_DEV_SIGNIN_URL_FILE` set it writes the address to that file
instead of opening a browser.

### Connector sign-in without a browser

Connectors are the engine's own MCP servers: they live in
`<data folder>/opencode/config/opencode/opencode.json`, their sign-ins in
the engine's database (`<data folder>/opencode/data/opencode/opencode.db`),
so a dev copy with its own data folder never touches the login Keychain or
the person's own OpenCode. `VIBEWORK_DEV_SIGNIN_URL_FILE=/abs/file` (debug
builds only) makes Sign in (and the sign-in the app starts after a task's
add) write the authorization page's address to that file instead of
opening the system browser, so a test can "be the browser" headlessly. The
engine itself takes the callback on a loopback port and shows its own
"Authorization successful" page.

A fake remote MCP server that signs in with OAuth (metadata, dynamic
registration, PKCE, rotating refresh tokens, a `whoami` tool) runs from the
Rust tests' fixture:

```sh
(cd src-tauri && cargo build --example fake_oauth_mcp)
src-tauri/target/debug/examples/fake_oauth_mcp --access-ttl 3600 > /tmp/fake.json   # prints its addresses
# add a remote connector with the printed "mcp" address, choose Sign in, then:
curl -sL -H "X-Test-Approve: tester" "$(cat /abs/file)"   # approves and lands on the engine's callback
curl -X POST <rs>/_admin/expire    # access tokens expire now (the next call refreshes)
curl -X POST <rs>/_admin/revoke    # refresh tokens revoked (the next call fails: Needs sign-in)
curl <rs>/_admin/log               # every request it received, headers included
```

`--no-registration` serves an authorization server without dynamic
registration; `--separate-as` puts it on another origin. (The fixture also
speaks the older SSE transport, which the engine does not support.)

To check the carry-over from an earlier version, put an `mcp.json` (Claude
Desktop shape) in the data folder before the first launch: it is copied
into the connectors file once (`opencode/connectors-carried-over` marks
it), headers with keys included, an SSE one switched off with a line
saying why, and left in place. A task's `opencode mcp list` prints the
status the app last saw, from `<data folder>/opencode/connectors-status.txt`.

### Staying out of the way (`VIBEWORK_DEV_BACKGROUND=1`)

When someone is using the Mac while a dev copy runs, add
`VIBEWORK_DEV_BACKGROUND=1` (debug builds only; release builds ignore it). The
copy then has no Dock icon and no entry in the app switcher, is never
activated, and its windows stay behind every other window (the bottom window
layer, unfocused). It never shows its floating "Task complete" /
"Needs your approval" overlay either. WebKit's occlusion detection is switched off for its main
window, so the page keeps drawing while covered: bridge calls, animations and
window captures behave as if it were in front. Capture it by window id (the
helper's window lookup must not filter on layer 0: this window sits on
layer −1). Quit it through the bridge (`client.mjs quit`).

### Runtimes in a dev copy (vibework-js, uv)

At startup the app writes launchers into `<data folder>/runtimes/bin`, the
last entry on the PATH of task commands and connectors: `vibework-js` (Bun
from the engine binary, `BUN_BE_BUN=1`), its aliases `bun`, `bunx`, `npx`,
and `uv`/`uvx`. uv is downloaded the first time the launcher runs, into
`<data folder>/runtimes/uv-<version>` (`.verified` holds the checked digest).
Nothing downloads at startup. Unless `UV_PYTHON_PREFERENCE` is already set,
the `uv` launcher sets it: `system` when Apple's developer tools are
installed with a python3 that runs, else `only-managed`, so uv never probes
the `/usr/bin/python3` stub that opens the "install developer tools" dialog
on a Mac without them (try it with `DEVELOPER_DIR=/nonexistent`). To run a
skill script the way a task command does on a clean Mac:

```sh
BIN=/tmp/vibework-dev-data/runtimes/bin
env -i HOME="$HOME" LANG=en_US.UTF-8 PATH="/usr/bin:/bin:/usr/sbin:/sbin:$BIN" VIBEWORK_SCRATCH=/tmp/vibework-dev-data/scratch/test \
  vibework-js "<repo>/.vibework/skills/vibework-slides/scripts/export.ts" deck.slides.md --check
env -i HOME="$HOME" PATH="/usr/bin:/bin:$BIN" uv run --with openpyxl python build.py
```

The first-use paths: delete `runtimes/uv-*` and run `uv --version` (one
download, also when several commands start at once); with
`HTTPS_PROXY=http://127.0.0.1:9` it fails with the offline message; a copy of
the launcher with a wrong `archive_sha` refuses the file and leaves nothing
behind. In a real task the engine's shell sources the user's login shell, so
a uv or bun the user installed comes first on the PATH.

## Packaged (release) builds

`bun run tauri build --bundles app` makes `src-tauri/target/release/bundle/macos/Vibework.app` (ad-hoc signed). That build has no bridge and ignores `VIBEWORK_DEV_OPENROUTER_KEY`; on its first launch macOS asks for Keychain access to the saved key.

To drive a packaged app without the Keychain, build the dev-only variant and start it with the launcher, which gives it launchd's minimal environment (like an app opened from Finder) plus the bridge and the key in its environment:

```sh
DEVELOPER_DIR=/Library/Developer/CommandLineTools bun run tauri build --bundles app --features dev-release-probe
python3 scripts/e2e/launch-release.py src-tauri/target/release/bundle/macos/Vibework.app/Contents/MacOS/Vibework /tmp/vibework-e2e/release.log --probe
bun scripts/e2e/client.mjs state      # same bridge as in dev
kill -TERM <pid>                       # quits through the normal exit path
```

With `VIBEWORK_DEV_OPENROUTER_KEY=dummy-not-a-key` and `VIBEWORK_DEV_DATA_DIR=/abs/folder` in its environment, the launcher passes both on, so the probe never touches the Keychain and runs on its own data folder without the single-instance hand-off, beside an installed Vibework. If an installed copy runs from `src-tauri/target/release/bundle`, build into another folder so its bundle is not replaced: `CARGO_TARGET_DIR=/tmp/vibework-build/target bun run tauri build --bundles app` (the bundle lands in `/tmp/vibework-build/target/release/bundle/macos`; a full release target is several GB). Start it by its `/private/tmp/...` path: Tauri refuses to resolve the app's resources when the executable's path runs through a symlink, and `/tmp` is one ("Could not access resource directory in production mode: unknown path").

Never ship a `dev-release-probe` build; rebuild without the feature afterwards. In release the frontend has no dev-server paths (no `/@fs/` imports, no `window.__e2eFolderDialog`), so listen for events with `window.__TAURI_INTERNALS__` or poll `agent_load_session`. After a page reload, a task with a pending permission request or question is listed as waiting again and its prompt docks when the task is opened (`agent_waiting_sessions`, `agent_pending_permission`).

### First-run and credential migration checks

An explicitly empty `VIBEWORK_DEV_OPENROUTER_KEY` now starts disconnected and
keeps set/clear in memory. With that variable **unset**, setting
`VIBEWORK_DEV_DATA_DIR` redirects all SecureStorage operations to private
files under that directory's `test-credentials/`; use fake credentials only.
Release builds without the probe feature exclude both overrides.
The loopback `VIBEWORK_DEV_OPENROUTER_ORIGIN` also routes key validation
(`GET /api/v1/key`), so 200, 401/403, timeout and network errors can be
tested without contacting OpenRouter. Empty overrides never fall through
to Keychain access.

The production ACL and migration are tested with a fake backend. These
tests do not establish real macOS prompt behavior or exercise the Keychain.
Do not use the release launcher without an explicit dummy override for a
probe build: its historical fallback reads the real Keychain.
