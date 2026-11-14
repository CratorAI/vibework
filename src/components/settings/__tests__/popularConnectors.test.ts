import { describe, expect, it } from "vitest";
import { POPULAR_CONNECTORS } from "../popularConnectors";

describe("popular connectors", () => {
  it("are valid, distinct connectors on HTTPS with a vendor source", () => {
    const names = new Set<string>();
    for (const c of POPULAR_CONNECTORS) {
      expect(c.name).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(names.has(c.name)).toBe(false);
      names.add(c.name);
      expect(new URL(c.url).protocol).toBe("https:");
      expect(c.source).toMatch(/^https:\/\//);
      if (c.auth.kind === "key") expect(c.auth.header).toMatch(/^[A-Za-z-]+$/);
    }
    expect(POPULAR_CONNECTORS.length).toBeGreaterThan(0);
    expect(POPULAR_CONNECTORS.length).toBeLessThanOrEqual(12);
  });
});

describe("connector names in prose", () => {
  it("use the Popular label, else the name as given", async () => {
    const { connectorLabel, popularConnector } = await import("../popularConnectors");
    expect(connectorLabel("granola")).toBe("Granola");
    expect(connectorLabel("GitHub")).toBe("GitHub");
    expect(connectorLabel(" fakenotes ")).toBe("fakenotes");
    expect(popularConnector("Notion")?.url).toBe("https://mcp.notion.com/mcp");
    expect(popularConnector("acme")).toBeUndefined();
  });
});
