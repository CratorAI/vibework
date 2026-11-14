import { describe, expect, it } from "vitest";
import { latestPresentedFile } from "../presentedFiles";
import type { ChatMessage, MessageBlock } from "../../types/agent";

const present = (id: string, path: string, extra: Partial<{ isExecuting: boolean; success: boolean }> = {}): MessageBlock => ({
  type: "tool",
  id,
  call: { id, name: "PresentFile", input: { file_path: path }, isExecuting: extra.isExecuting ?? false, result: { success: extra.success ?? true, output: "" } },
} as MessageBlock);
const msg = (role: "user" | "assistant", blocks: MessageBlock[]): ChatMessage => ({ id: Math.random().toString(), role, blocks, timestamp: new Date(), isStreaming: false });

describe("latestPresentedFile", () => {
  it("takes the last finished file of the latest turn", () => {
    const messages = [
      msg("user", []),
      msg("assistant", [present("a", "/w/old.md")]),
      msg("user", []),
      msg("assistant", [present("b", "/w/deck.slides.md"), present("c", "/w/deck.pptx"), present("d", "/w/x.md", { success: false })]),
    ];
    expect(latestPresentedFile(messages)).toBe("/w/deck.pptx");
  });
  it("does not reach back past the last user message", () => {
    expect(latestPresentedFile([msg("assistant", [present("a", "/w/old.md")]), msg("user", []), msg("assistant", [])])).toBeNull();
    expect(latestPresentedFile([])).toBeNull();
  });
});
