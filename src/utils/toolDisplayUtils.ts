/**
 * Tool Display Utilities
 *
 * Pure utility functions for generating display text for tools.
 */

import { humanizeToolName, parseMcpToolName, type McpToolName } from "./mcpToolName";
import { mcpServersStore } from "@/stores/mcpServers";
import { connectorLabel } from "@/components/settings/popularConnectors";

/** Tool input as a plain object (tool inputs are JSON objects; anything else reads as empty). */
export function toolInputRecord(input: unknown): Record<string, unknown> {
  return input !== null && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

function stringField(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  return typeof value === "string" ? value.trim() : "";
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** "https://www.example.com/a/b" -> "example.com"; falls back to the raw text. */
export function urlHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "") || url;
  } catch {
    return url;
  }
}

/**
 * Server and tool for an MCP tool call, or null for built-in tools.
 * Configured server names are used to disambiguate names that contain "__".
 */
export function getMcpToolInfo(name: string): McpToolName | null {
  const knownServers = mcpServersStore.getSnapshot().servers.map((s) => s.name);
  return parseMcpToolName(name, knownServers);
}

const BUILT_IN_TOOLS = new Set([
  "Bash",
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "WebSearch",
  "WebFetch",
  "Browser",
  "TodoWrite",
  "TaskCreate",
  "TaskUpdate",
  "TaskList",
  "AskUserQuestion",
  // The permission prompt for setting a connector up from a task
  "AddConnector",
  "RemoveConnector",
]);

/** MCP info for a tool name, never treating a built-in tool as MCP. */
function mcpInfoFor(name: string): McpToolName | null {
  return BUILT_IN_TOOLS.has(name) ? null : getMcpToolInfo(name);
}

/** "linear" -> "Linear", "google-drive" -> "Google drive" */
function serverLabel(server: string): string {
  const words = server.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "Create issue in Linear" */
export function getMcpToolLabel(info: McpToolName): string {
  return `${humanizeToolName(info.tool)} in ${serverLabel(info.server)}`;
}

/** A step that is running ("Reading x"), done ("Read x") or failed ("Couldn’t read x"). */
export type ToolTense = "running" | "done" | "failed";

/** Past and present forms of the verbs MCP tool names usually start with. */
const VERB_FORMS: Record<string, [done: string, running: string]> = {
  add: ["Added", "Adding"],
  append: ["Appended", "Appending"],
  archive: ["Archived", "Archiving"],
  check: ["Checked", "Checking"],
  close: ["Closed", "Closing"],
  comment: ["Commented", "Commenting"],
  create: ["Created", "Creating"],
  delete: ["Deleted", "Deleting"],
  download: ["Downloaded", "Downloading"],
  edit: ["Edited", "Editing"],
  fetch: ["Fetched", "Fetching"],
  find: ["Found", "Finding"],
  get: ["Got", "Getting"],
  list: ["Listed", "Listing"],
  move: ["Moved", "Moving"],
  open: ["Opened", "Opening"],
  post: ["Posted", "Posting"],
  query: ["Queried", "Querying"],
  read: ["Read", "Reading"],
  remove: ["Removed", "Removing"],
  run: ["Ran", "Running"],
  search: ["Searched", "Searching"],
  send: ["Sent", "Sending"],
  set: ["Set", "Setting"],
  update: ["Updated", "Updating"],
  upload: ["Uploaded", "Uploading"],
  write: ["Wrote", "Writing"],
};

/** "Create issue" -> "Created issue" / "Creating issue"; unknown verbs stay as they are. */
function inflect(sentence: string, tense: ToolTense): string {
  if (tense === "failed") return `Couldn’t ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`;
  const [first, ...rest] = sentence.split(" ");
  const forms = VERB_FORMS[first.toLowerCase()];
  if (!forms) return sentence;
  return [tense === "done" ? forms[0] : forms[1], ...rest].join(" ");
}

const fileName = (path: string) => path.split(/[\\/]/).pop() || path;

/**
 * A short sentence for a tool call, in plain language: "Read contract.pdf",
 * "Searching the web for “renewal terms”". Never the tool id or raw arguments.
 */
export function getToolSummary(name: string, input: unknown, tense: ToolTense = "done"): string {
  const data = toolInputRecord(input);
  // Each label in three forms: done, running, and the plain verb a failure is phrased with
  const v = (doneForm: string, runningForm: string, baseForm: string) =>
    tense === "done" ? doneForm : tense === "running" ? runningForm : `Couldn’t ${baseForm}`;

  switch (name) {
    case "Browser": {
      const action = stringField(data, "action");
      const target = stringField(data, "label") || stringField(data, "ref");
      if (action === "navigate") return `${v("Opened", "Opening", "open")} ${urlHost(stringField(data, "url"))}`;
      if (action === "screenshot") return v("Took a screenshot", "Taking a screenshot", "take a screenshot");
      if (action === "type") return target ? `${v("Typed in", "Typing in", "type in")} ${target}` : v("Typed on the page", "Typing on the page", "type on the page");
      if (action === "click") return target ? `${v("Clicked", "Clicking", "click")} ${target}` : v("Clicked on the page", "Clicking on the page", "click on the page");
      return v("Used the browser", "Using the browser", "use the browser");
    }
    case "Bash": {
      // Setting connectors up from a task: `opencode mcp add granola …`
      const connector = connectorCommand(stringField(data, "command"));
      if (connector) {
        if (connector.kind === "add") return `${v("Added the", "Adding the", "add the")} ${connectorLabel(connector.name)} connector`;
        if (connector.kind === "remove") return `${v("Removed the", "Removing the", "remove the")} ${connectorLabel(connector.name)} connector`;
        return v("Checked your connectors", "Checking your connectors", "check your connectors");
      }
      // "cd <folder> && python3 …" is about python3, not cd
      const segments = stringField(data, "command").split(/&&|\|\||;/).map((part) => part.trim()).filter(Boolean);
      const first = (segment: string) => segment.split(/\s+/)[0];
      const program = first(segments.find((segment) => first(segment) !== "cd") ?? segments[0] ?? "");
      return program ? `${v("Ran", "Running", "run")} ${program}` : v("Ran a command", "Running a command", "run a command");
    }
    case "Read": {
      const path = stringField(data, "file_path");
      return path ? `${v("Read", "Reading", "read")} ${fileName(path)}` : v("Read a file", "Reading a file", "read a file");
    }
    case "Write": {
      const path = stringField(data, "file_path");
      return path ? `${v("Wrote", "Writing", "write")} ${fileName(path)}` : v("Wrote a file", "Writing a file", "write a file");
    }
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit": {
      const path = stringField(data, "file_path") || stringField(data, "notebook_path");
      return path ? `${v("Edited", "Editing", "edit")} ${fileName(path)}` : v("Edited a file", "Editing a file", "edit a file");
    }
    case "Glob": {
      const pattern = stringField(data, "pattern");
      return pattern
        ? `${v("Looked for", "Looking for", "look for")} ${truncate(pattern, 60)}`
        : v("Looked for files", "Looking for files", "look for files");
    }
    case "Grep": {
      const pattern = stringField(data, "pattern");
      return pattern
        ? `${v("Searched files for", "Searching files for", "search files for")} “${truncate(pattern, 60)}”`
        : v("Searched files", "Searching files", "search files");
    }
    case "WebSearch": {
      const query = stringField(data, "query");
      return query
        ? `${v("Searched the web for", "Searching the web for", "search the web for")} “${truncate(query, 80)}”`
        : v("Searched the web", "Searching the web", "search the web");
    }
    case "WebFetch": {
      const url = stringField(data, "url");
      return url ? `${v("Opened", "Opening", "open")} ${urlHost(url)}` : v("Opened a web page", "Opening a web page", "open a web page");
    }
    case "TodoWrite":
    case "TaskCreate":
    case "TaskUpdate":
      return v("Updated the plan", "Updating the plan", "update the plan");
    case "TaskList":
      return v("Checked the plan", "Checking the plan", "check the plan");
    case "AskUserQuestion":
      return v("Asked you a question", "Asking you a question", "ask you a question");
    case "Skill": {
      const skill = stringField(data, "skill") || stringField(data, "name") || stringField(data, "id");
      return skill
        ? `${v("Loaded the", "Loading the", "load the")} ${truncate(skill, 60)} skill`
        : v("Loaded a skill", "Loading a skill", "load a skill");
    }
    default: {
      const mcp = mcpInfoFor(name);
      if (mcp) return inflect(getMcpToolLabel(mcp), tense);
      return `${v("Used", "Using", "use")} ${humanizeToolName(name).toLowerCase()}`;
    }
  }
}

/**
 * The label for a tool row: the call's own description when the model gave
 * one (a shell command's purpose), otherwise the generated sentence.
 */
export function getToolDescription(name: string, input: unknown, tense: ToolTense = "done"): string {
  // Web and MCP tools get a generated label: a "description" argument there is
  // tool data, not a description of the call.
  if (name === "WebSearch" || name === "WebFetch" || mcpInfoFor(name)) {
    return getToolSummary(name, input, tense);
  }

  const description = stringField(toolInputRecord(input), "description");
  if (description) return description;

  return getToolSummary(name, input, tense);
}

/** The connector a tool call belongs to ("linear"), for its logo; null for built-in tools. */
export function getToolServer(name: string): string | null {
  return mcpInfoFor(name)?.server ?? null;
}

type StepKind = "command" | "read" | "write" | "search" | "web" | "plan" | "other";

function stepKind(name: string): StepKind {
  switch (name) {
    case "Bash":
      return "command";
    case "Read":
      return "read";
    case "Write":
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return "write";
    case "Glob":
    case "Grep":
    case "WebSearch":
      return "search";
    case "WebFetch":
    case "Browser":
      return "web";
    case "TodoWrite":
    case "TaskCreate":
    case "TaskUpdate":
    case "TaskList":
      return "plan";
    default:
      return "other";
  }
}

const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

/**
 * One line for a finished run of steps: "Read 2 files, ran a command and
 * searched the web". Steps that changed nothing visible (plan updates) are
 * left out unless they are all there is.
 */
export function summarizeSteps(calls: { name: string; input: unknown; result?: { success: boolean } | null }[]): string {
  const kinds = new Map<StepKind, number>();
  const servers: string[] = [];
  // Connector setup says what it did: "added the Granola connector"
  const setup: string[] = [];
  for (const call of calls) {
    if (call.name === "Bash" && connectorCommand(stringField(toolInputRecord(call.input), "command"))) {
      const done = getToolSummary(call.name, call.input, call.result && !call.result.success ? "failed" : "done");
      const part = done.charAt(0).toLowerCase() + done.slice(1);
      if (!setup.includes(part)) setup.push(part);
      continue;
    }
    const server = getToolServer(call.name);
    if (server) {
      if (!servers.includes(server)) servers.push(server);
      continue;
    }
    const kind = stepKind(call.name);
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
  }
  const n = (k: StepKind) => kinds.get(k) ?? 0;
  const parts: string[] = [];
  if (n("read")) parts.push(`read ${count(n("read"), "a file", "files")}`);
  if (n("write")) parts.push(`edited ${count(n("write"), "a file", "files")}`);
  if (n("command")) parts.push(`ran ${count(n("command"), "a command", "commands")}`);
  if (n("search")) parts.push(n("search") === 1 ? "searched once" : `searched ${n("search")} times`);
  if (n("web")) parts.push(`opened ${count(n("web"), "a web page", "web pages")}`);
  parts.push(...setup);
  for (const server of servers) parts.push(`used ${serverLabel(server)}`);
  if (n("other")) parts.push(`used ${count(n("other"), "a tool", "tools")}`);
  if (parts.length === 0) return n("plan") ? "Updated the plan" : "Worked";

  const shown = parts.length > 3 ? [...parts.slice(0, 2), `${parts.length - 2} more`] : parts;
  const sentence =
    shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

export interface ToolArgument {
  key: string;
  /** Strings as-is; everything else pretty-printed JSON */
  value: string;
}

/** Top-level arguments of a tool call, formatted for reading. */
export function formatToolArguments(input: unknown): ToolArgument[] {
  return Object.entries(toolInputRecord(input)).map(([key, value]) => ({
    key,
    value: typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? String(value)),
  }));
}

export interface ConnectorCommand {
  kind: "add" | "remove" | "list";
  /** The connector's name (empty for "list") */
  name: string;
}

/**
 * A task's command that sets connectors up the native way (`opencode mcp add
 * <name> --url …`, `opencode mcp remove <name>`, `opencode mcp list`), when the
 * whole command is made of those. The one that changes something wins.
 */
export function connectorCommand(command: string): ConnectorCommand | null {
  const parts = command.split(/&&|;|\n/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  let found: ConnectorCommand | null = null;
  for (const part of parts) {
    const words = part.replace(/\s+2>&1$/, "").split(/\s+/);
    if (!/(^|\/)opencode$/.test(words[0] ?? "") || words[1] !== "mcp") return null;
    const sub = words[2];
    if (sub === "list" || sub === "ls") {
      found ??= { kind: "list", name: "" };
      continue;
    }
    const rest = words.slice(3);
    let name = "";
    for (let i = 0; i < rest.length; i++) {
      const w = rest[i];
      if (w === "--") break;
      if (["--url", "--header", "-H", "--env", "-e"].includes(w)) {
        i++;
        continue;
      }
      if (w.startsWith("-")) continue;
      name = w.replace(/^['"]|['"]$/g, "");
      break;
    }
    if (!name || (sub !== "add" && sub !== "remove" && sub !== "rm")) return null;
    if (found && found.kind !== "list") return null;
    found = { kind: sub === "add" ? "add" : "remove", name };
  }
  return found;
}
