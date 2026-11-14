/**
 * MCP tool names reach the UI namespaced by server. This module is the single
 * place that knows the format, so a change on the Rust side is a one-line fix here.
 *
 * Accepted: "mcp__<server>__<tool>" and "<server>__<tool>".
 */

const PREFIX = "mcp__";
const SEPARATOR = "__";

export interface McpToolName {
  server: string;
  tool: string;
}

function splitServerTool(rest: string, knownServers?: readonly string[]): McpToolName | null {
  // Prefer the longest configured server name, so names containing "__" still split correctly
  if (knownServers && knownServers.length > 0) {
    let best: string | null = null;
    for (const server of knownServers) {
      if (
        rest.length > server.length + SEPARATOR.length &&
        rest.startsWith(server + SEPARATOR) &&
        (best === null || server.length > best.length)
      ) {
        best = server;
      }
    }
    if (best !== null) return { server: best, tool: rest.slice(best.length + SEPARATOR.length) };
  }
  const index = rest.indexOf(SEPARATOR);
  if (index <= 0 || index + SEPARATOR.length >= rest.length) return null;
  return { server: rest.slice(0, index), tool: rest.slice(index + SEPARATOR.length) };
}

/**
 * Split a namespaced MCP tool name into server and tool, or return null when the
 * name is not namespaced (callers then show the raw name).
 * @param knownServers configured server names, used to disambiguate names that contain "__"
 */
export function parseMcpToolName(name: string, knownServers?: readonly string[]): McpToolName | null {
  if (name.startsWith(PREFIX)) {
    const parsed = splitServerTool(name.slice(PREFIX.length), knownServers);
    if (parsed) return parsed;
  }
  return splitServerTool(name, knownServers);
}

/**
 * "search_issues" -> "Search issues", "getFileContents" -> "Get file contents".
 * All-caps words (e.g. "PRs", "URL") are left alone.
 */
export function humanizeToolName(tool: string): string {
  const words = tool
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .filter(Boolean)
    .map((word) => (/^[A-Z][a-z0-9]*$/.test(word) ? word.toLowerCase() : word));
  if (words.length === 0) return tool;
  const sentence = words.join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
