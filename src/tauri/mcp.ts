/**
 * MCP (connectors) API module
 * The user's connectors: the agent engine's own MCP servers (OpenCode), kept in
 * the engine's global opencode.json, which `opencode mcp add` in a task edits too.
 * Commands return immediately (new or reloaded servers start out "connecting");
 * status and tool changes arrive later through the `mcp:servers-changed` event.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type McpTransport = "stdio" | "http";
export type McpServerStatus = "connected" | "connecting" | "failed" | "disabled" | "needs-sign-in";

export interface McpToolInfo {
  name: string;
  description: string;
}

/** A configured server as the UI sees it. Env and header values are never returned. */
export interface McpServerView {
  name: string;
  transport: McpTransport;
  /** Local servers only */
  command: string | null;
  args: string[];
  /** Remote servers only */
  url: string | null;
  /** Names of the variables (local) or headers (remote) that are set. Values are write-only. */
  envKeys: string[];
  headerKeys: string[];
  enabled: boolean;
  status: McpServerStatus;
  error: string | null;
  tools: McpToolInfo[];
  /** Always false: the older HTTP+SSE transport is not supported by the engine */
  sse: boolean;
  /** Signs in through the browser (the server asked to, or a sign-in is saved) */
  oauth: boolean;
  /** Signed in (the engine keeps the tokens in its own database, never here) */
  signedIn: boolean;
  /** Waiting for the browser to come back from the sign-in page */
  signingIn: boolean;
  /** Why the last sign-in did not finish */
  signInError: string | null;
}

/** A local server, started as a child process */
export interface McpStdioConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/** A remote server reached over Streamable HTTP */
export interface McpHttpConfig {
  type?: "http";
  url: string;
  headers?: Record<string, string>;
}

export type McpServerConfig = McpStdioConfig | McpHttpConfig;

/** Event fired whenever a server's status or tools change (no payload) */
export const MCP_SERVERS_CHANGED_EVENT = "mcp:servers-changed";

export async function listMcpServers(): Promise<McpServerView[]> {
  return await invoke<McpServerView[]>("mcp_list_servers");
}

/** Rejects with a readable message (bad name, duplicate name). */
export async function addMcpServer(name: string, config: McpServerConfig): Promise<McpServerView[]> {
  return await invoke<McpServerView[]>("mcp_add_server", { name, config });
}

/**
 * Saves an edit (and a rename to `newName`). `keep` names variables or headers
 * whose saved values stay as they are (the UI never has the values).
 */
export async function updateMcpServer(name: string, newName: string, config: McpServerConfig, keep: string[]): Promise<McpServerView[]> {
  return await invoke<McpServerView[]>("mcp_update_server", { name, newName, config, keep });
}

export async function removeMcpServer(name: string): Promise<McpServerView[]> {
  return await invoke<McpServerView[]>("mcp_remove_server", { name });
}

export async function setMcpServerEnabled(name: string, enabled: boolean): Promise<McpServerView[]> {
  return await invoke<McpServerView[]>("mcp_set_server_enabled", { name, enabled });
}

/** Re-reads the connectors file (the engine also picks up changes on its own). */
export async function reloadMcpServers(): Promise<McpServerView[]> {
  return await invoke<McpServerView[]>("mcp_reload");
}

/**
 * Adds the servers from a Claude Desktop style config (`{"mcpServers": {...}}`).
 * Rejects with a readable message on invalid input.
 */
export async function importMcpJson(json: string): Promise<McpServerView[]> {
  return await invoke<McpServerView[]>("mcp_import_json", { json });
}

/** Opens the system browser at the connector's sign-in page; the result arrives as a change event. */
export async function signInMcpServer(name: string): Promise<McpServerView[]> {
  return await invoke<McpServerView[]>("mcp_sign_in", { name });
}

export async function cancelMcpSignIn(name: string): Promise<McpServerView[]> {
  return await invoke<McpServerView[]>("mcp_cancel_sign_in", { name });
}

/** Deletes the connector's sign-in (its tokens in the engine's store). */
export async function signOutMcpServer(name: string): Promise<McpServerView[]> {
  return await invoke<McpServerView[]>("mcp_sign_out", { name });
}

/** The parse error for the connectors file when it is malformed, otherwise null. */
export async function getMcpConfigError(): Promise<string | null> {
  return await invoke<string | null>("mcp_config_error");
}

export async function getMcpConfigPath(): Promise<string> {
  return await invoke<string>("mcp_config_path");
}

export async function onMcpServersChanged(handler: () => void): Promise<UnlistenFn> {
  return await listen(MCP_SERVERS_CHANGED_EVENT, () => handler());
}

export const mcpApi = {
  listServers: listMcpServers,
  addServer: addMcpServer,
  updateServer: updateMcpServer,
  removeServer: removeMcpServer,
  setServerEnabled: setMcpServerEnabled,
  reload: reloadMcpServers,
  importJson: importMcpJson,
  signIn: signInMcpServer,
  cancelSignIn: cancelMcpSignIn,
  signOut: signOutMcpServer,
  getConfigPath: getMcpConfigPath,
  onServersChanged: onMcpServersChanged,
} as const;
