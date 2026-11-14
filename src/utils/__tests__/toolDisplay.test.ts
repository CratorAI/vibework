import { describe, expect, it } from "vitest";
import { connectorCommand, getToolSummary, summarizeSteps } from "../toolDisplayUtils";

describe("shell step labels", () => {
  it("names the program, not a leading cd", () => {
    expect(getToolSummary("Bash", { command: "cd /private/tmp/work && python3 -c 'print(1)'" })).toBe("Ran python3");
    expect(getToolSummary("Bash", { command: "cd sub; ls -la" }, "running")).toBe("Running ls");
  });
  it("keeps cd when it is the whole command", () => {
    expect(getToolSummary("Bash", { command: "cd sub" })).toBe("Ran cd");
  });
  it("names a plain command by its first word", () => {
    expect(getToolSummary("Bash", { command: "wc -l huge.csv" })).toBe("Ran wc");
  });
});

describe("setting connectors up from a task", () => {
  it("reads the native opencode commands", () => {
    expect(connectorCommand("opencode mcp add granola --url https://mcp.granola.ai/mcp")).toEqual({ kind: "add", name: "granola" });
    expect(connectorCommand("opencode mcp add --global fakenotes --url http://127.0.0.1:5/mcp && opencode mcp list")).toEqual({ kind: "add", name: "fakenotes" });
    expect(connectorCommand("opencode mcp remove fakenotes")).toEqual({ kind: "remove", name: "fakenotes" });
    expect(connectorCommand("opencode mcp list")).toEqual({ kind: "list", name: "" });
    expect(connectorCommand("opencode mcp add tide -- python3 tide.py")).toEqual({ kind: "add", name: "tide" });
    expect(connectorCommand("echo hi && opencode mcp list")).toBeNull();
    expect(connectorCommand("opencode serve")).toBeNull();
    expect(connectorCommand("ls")).toBeNull();
  });
  it("labels the steps in plain words", () => {
    expect(getToolSummary("Bash", { command: "opencode mcp add granola --url https://mcp.granola.ai/mcp" })).toBe("Added the Granola connector");
    expect(getToolSummary("Bash", { command: "opencode mcp add granola --url https://mcp.granola.ai/mcp" }, "running")).toBe("Adding the Granola connector");
    expect(getToolSummary("Bash", { command: "opencode mcp add fakenotes --url http://127.0.0.1:5/mcp" }, "failed")).toBe("Couldn’t add the fakenotes connector");
    expect(getToolSummary("Bash", { command: "opencode mcp remove fakenotes" })).toBe("Removed the fakenotes connector");
    expect(getToolSummary("Bash", { command: "opencode mcp list" })).toBe("Checked your connectors");
  });
  it("says what a finished group set up", () => {
    expect(
      summarizeSteps([
        { name: "Bash", input: { command: "opencode mcp list" } },
        { name: "Bash", input: { command: "opencode mcp add granola --url https://mcp.granola.ai/mcp" }, result: { success: true } },
      ]),
    ).toBe("Checked your connectors and added the Granola connector");
    expect(summarizeSteps([{ name: "Bash", input: { command: "opencode mcp add x --url https://x/mcp" }, result: { success: false } }])).toBe("Couldn’t add the x connector");
  });
});
