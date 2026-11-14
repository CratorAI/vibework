---
name: vibework-setup
description: "How to set Vibework itself up for the user: add, connect, sign in to or remove a connector (an integration or MCP server such as Granola, Notion, Linear, GitHub), check which connectors work, add a personal skill, and what Vibework offers for standing instructions. Use for any request to set up, connect, add or remove an integration, connector, MCP server or skill. It adds to the built-in opencode skill what is different inside Vibework."
---

# Setting up Vibework

Vibework runs on OpenCode. Connectors are OpenCode's own MCP servers, so the built-in `opencode` skill and the OpenCode docs apply, with the differences below. Never read or edit Vibework's own app data or config files; everything here is done with `opencode mcp` commands or by the user in Settings.

## Connectors

A connector lets a service (Granola, Notion, Linear, …) offer its tools to the user's tasks.

- **See what is set up:** `opencode mcp list`. It never asks. Use it first, and to check a sign-in.
- **Add one:** `opencode mcp add <name> --url <address>`. In Vibework it is always added for every task (you don't need `--global`), and the user approves the add once.
  - Popular ones: `granola` https://mcp.granola.ai/mcp, `notion` https://mcp.notion.com/mcp, `linear` https://mcp.linear.app/mcp, `sentry` https://mcp.sentry.dev/mcp, `atlassian`, `stripe`, `intercom` (each signs in through the browser), and `github` (needs a key).
  - Anything else: a short name (letters, digits, `-`, `_`) and the address of the service's remote MCP server, taken from the provider's own documentation (search the web if you need to). Don't guess an address.
  - A local one (a command that runs on this Mac): `opencode mcp add <name> -- <command and arguments>`.
- **Remove one:** `opencode mcp remove <name>`. The user approves once, and Vibework deletes its sign-in too.

### Signing in

Browser sign-in is the way in whenever the service offers it. Never ask for an API key, token or password when it does, and never ask for one in chat at all.

After an add, Vibework opens the service's sign-in page in the user's browser by itself. There is no `/mcps` screen in Vibework, and `opencode mcp auth` doesn't work here: don't run or suggest either. Tell the user, in plain words, something like: "Granola was added. A sign-in page has opened in your browser; it will show as connected once you approve." Then stop and wait for them; don't loop.

Until `opencode mcp list` says **connected**, report it as added and waiting for sign-in, never as working. Its tools reach the task from the user's next message; the timeline then shows "Connector added: granola".

If a sign-in didn't finish, `opencode mcp list` and the connector's row in Settings → Connectors say why. The user signs in again with **Sign in** on that row; signing out is in the row's … menu.

### Services that need a key

Some services (GitHub, or any server without browser sign-in) take a key in a header. Add it with a placeholder, never the key: `opencode mcp add github --url https://api.githubcopilot.com/mcp/ --header 'Authorization=Bearer {env:GITHUB_TOKEN}'`. Then tell the user to open Settings → Connectors, choose Edit in that connector's … menu, paste the key into the header, and save. If the user pastes a key in chat, don't use it: point them to Settings instead.

### By hand

The user can do all of this in Settings → Connectors: Add connector (the Popular buttons, a remote address with headers, or a local command), Paste JSON, and each row's switch and … menu (Edit, Sign in, Sign out, Remove).

## Skills

A skill is a folder with a `SKILL.md`. Vibework loads, besides its own bundled skills:

- the user's skills folder (Settings → Skills → Open skills folder),
- `~/.claude/skills` (Claude Code's skills),
- `~/.agents/skills`.

All three are on by default; Settings → Skills lists every skill and has a switch for each source. New and changed skills apply to new conversations.

To add one: the user drops the skill's folder into one of those folders. If they want you to write it, use the `skill-creator` skill and save it under `~/.agents/skills/<name>/SKILL.md` (outside the task folder, so the user approves the write). You can't write into the app's own skills folder.

## Standing instructions

Vibework has no setting for standing or custom instructions today, and it does not read `AGENTS.md` or `CLAUDE.md` files, in the task's folder or elsewhere. Say so plainly if asked. What the user can do instead: put the guidance in a personal skill (above), or say it at the start of a task.

## Models, approvals and helpers

The person changes the model and permission mode in the message box; you cannot change them yourself. You can start a `general` helper with `subagent` for independent research or a long side job. It uses the task’s model, folder and approvals, finishes within your turn, and returns its answer to you. It cannot start another helper or ask the person questions.

## Rules

- Setup changes go through `opencode mcp add | remove` or the user's Settings, nothing else.
- Never put a secret in chat, in a file, or in a command.
- Say what happened and what the user does next, in plain words: added, waiting for sign-in, connected, or what went wrong.
