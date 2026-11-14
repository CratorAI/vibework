import { describe, it, expect } from "vitest";
import { applyStreamChunk } from "../agentEventHandler";
import { toPermissionRequest } from "@/types/agent";

describe("native helper events", () => {
  it("keeps parallel child steps and answers inside their own parent calls", () => {
    let state = applyStreamChunk([], { ToolStart: { id: "a", name: "Helper", input: { description: "First" } } });
    state = applyStreamChunk(state, { ToolStart: { id: "b", name: "Helper", input: {} } });
    state = applyStreamChunk(state, { Helper: { toolId: "a", kind: "step", id: "s", name: "Bash", input: { command: "ls" } } });
    state = applyStreamChunk(state, { Helper: { toolId: "a", kind: "step-end", id: "s", result: { content: { Text: "file.txt" }, is_error: false }, durationMs: 42 } });
    state = applyStreamChunk(state, { Helper: { toolId: "b", kind: "text", delta: "Second answer" } });
    const [a,b] = state[0].blocks;
    expect(a.type === "tool" && a.call.helper?.steps[0].call.result?.output).toBe("file.txt");
    expect(b.type === "tool" && b.call.helper?.text).toBe("Second answer");
    expect(state[0].blocks).toHaveLength(2);
    state = applyStreamChunk(state, { ToolEnd: { id: "a", result: { content: { Text: "First answer" }, is_error: false } } });
    const finished = state[0].blocks[0];
    expect(finished.type === "tool" && finished.call.helper?.steps).toHaveLength(1);
    expect(finished.type === "tool" && finished.call.isExecuting).toBe(false);
  });
  it("preserves helper attribution in permission prompts", () => {
    expect(toPermissionRequest({request_id:"p", tool_name:"Bash", action:"shell", input:"{}", details:null, helper:"Check files"}).helper).toBe("Check files");
  });
});
