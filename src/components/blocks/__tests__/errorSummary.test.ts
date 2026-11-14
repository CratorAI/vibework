import { describe, expect, it, vi } from "vitest";

vi.mock("@/stores/mcpServers", () => ({
  mcpServersStore: {
    subscribe: () => () => {},
    getSnapshot: () => ({ loaded: true, error: null, servers: [{ name: "fakenotes", status: "needs-sign-in" }, { name: "linear", status: "connected" }] }),
  },
}));

import { errorSummary } from "../ToolItem";

describe("errorSummary", () => {
  it("shows a connector's own message without the engine's wrapper", () => {
    expect(
      errorSummary('MCP tool "whoami" on server "fakenotes" failed: fakenotes needs you to sign in again in Settings → Connectors.'),
    ).toBe("fakenotes needs you to sign in again in Settings → Connectors.");
    expect(errorSummary("Error: Error: boom\nmore")).toBe("boom");
    expect(errorSummary("x".repeat(200))).toHaveLength(140);
  });
  it("says a connector needs a new sign-in when that is why its step failed", () => {
    const closed = 'MCP tool "whoami" on server "fakenotes" failed: Connection closed';
    expect(errorSummary(closed, "mcp__fakenotes__whoami")).toBe("fakenotes needs you to sign in again in Settings → Connectors.");
    expect(errorSummary('No tool named "fakenotes_whoami" is currently available.', "mcp__fakenotes__whoami")).toBe(
      "fakenotes needs you to sign in again in Settings → Connectors.",
    );
    // Signed in: the engine's own words
    expect(errorSummary('MCP tool "x" on server "linear" failed: Connection closed', "mcp__linear__x")).toBe("Connection closed");
  });
});
