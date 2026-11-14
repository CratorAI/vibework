import { describe, it, expect } from "vitest";
import {
  modelSelection,
  modelKey,
  withEffort,
  favoriteShortcut,
  effortLabel,
} from "./agentModels";
describe("model picker selections", () => {
  it("separates model and effort without confusing OpenRouter ids", () => {
    expect(modelSelection("vendor/model")).toEqual({
      harness: "opencode",
      model: "vendor/model",
      effort: "",
    });
    expect(modelSelection("agent:codex|model%2Fname|medium")).toEqual({
      harness: "agent:codex",
      model: "model/name",
      effort: "medium",
    });
  });
  it("uses one favourite identity across efforts and URI encoding styles", () => {
    expect(modelKey("agent:codex|gpt%2Dtest|high")).toBe(
      modelKey("agent:codex|gpt-test|low"),
    );
    expect(withEffort("agent:claude-code|fable|high", "medium")).toBe(
      "agent:claude-code|fable|medium",
    );
    expect(withEffort("vendor/model", "high")).toBe("vendor/model");
  });
  it("limits favourite shortcuts to modified digits one through nine", () => {
    expect(favoriteShortcut("1", true, false)).toBe(0);
    expect(favoriteShortcut("9", false, true)).toBe(8);
    expect(favoriteShortcut("0", true, false)).toBeNull();
    expect(favoriteShortcut("2", false, false)).toBeNull();
  });
  it("labels advertised effort without inventing a list", () => {
    expect(effortLabel("xhigh")).toBe("Extra high");
    expect(effortLabel("")).toBe("Default");
    expect(effortLabel("future")).toBe("Future");
  });
});
