import { describe, expect, it } from "vitest";
import { matchSkills, prepareSkills, slashTrigger } from "../skillMatch";
import type { SkillChoice } from "@/tauri/skills";

const skill = (id: string, description = "", source: SkillChoice["source"] = "bundled", name = id): SkillChoice => ({ id, name, description, source });

const catalog = prepareSkills([
  skill("vibework-slides", "Make slide decks people present."),
  skill("vibework-sheet", "Spreadsheets with live formulas."),
  skill("humanizer", "Rewrite text so it sounds like a person.", "claude"),
  skill("slidev", "Developer slides in Markdown.", "agents"),
  skill("release", "Prepare a repository release.", "user", "Git Release"),
]);
const ids = (q: string) => matchSkills(catalog, q).map((m) => m.skill.id);

describe("matchSkills", () => {
  it("lists everything by source then id when nothing is typed", () => {
    expect(ids("")).toEqual(["vibework-sheet", "vibework-slides", "release", "humanizer", "slidev"]);
  });
  it("prefers an id prefix, then a word start, then fuzzy, then description words", () => {
    expect(ids("sli")).toEqual(["slidev", "vibework-slides"]);
    expect(ids("vsh")).toEqual(["vibework-sheet"]);
    expect(ids("vibsli")).toEqual(["vibework-slides"]);
    expect(ids("formulas")).toEqual(["vibework-sheet"]);
    expect(ids("person")).toEqual(["humanizer"]);
  });
  it("matches the display name when it differs from the id", () => {
    expect(ids("git")).toEqual(["release"]);
  });
  it("marks the id letters that matched", () => {
    const m = matchSkills(catalog, "slides").find((x) => x.skill.id === "vibework-slides")!;
    expect(m.hits).toEqual([9, 10, 11, 12, 13, 14]);
  });
  it("ignores letters scattered inside words", () => {
    const extra = prepareSkills([skill("baseline-ui"), skill("loops-cli")]);
    expect(matchSkills(extra, "sli")).toEqual([]);
  });
  it("is case- and accent-insensitive", () => {
    expect(ids("HUMÁN")).toEqual(["humanizer"]);
  });
  it("keeps up with hundreds of skills", () => {
    const many = prepareSkills(Array.from({ length: 500 }, (_, i) => skill(`skill-${i}-tool`, `Does task number ${i} with care.`)));
    const t = process.threadCpuUsage();
    for (const q of ["s", "sk", "ski", "skil", "skill", "skill-4", "task", "zz"]) matchSkills(many, q);
    const cpu = process.threadCpuUsage(t);
    // Scheduling delays from other test workers are not matcher work.
    expect((cpu.user + cpu.system) / 1000).toBeLessThan(80);
  });
});

describe("slashTrigger", () => {
  it("opens at the start or after whitespace", () => {
    expect(slashTrigger("/sli")).toEqual({ slash: 0, query: "sli" });
    expect(slashTrigger("make it /")).toEqual({ slash: 8, query: "" });
    expect(slashTrigger("line\n/hu")).toEqual({ slash: 5, query: "hu" });
  });
  it("stays shut inside a word, a path or a URL", () => {
    expect(slashTrigger("and/or")).toBeNull();
    expect(slashTrigger("see https://example.com/docs")).toBeNull();
    expect(slashTrigger("https:/")).toBeNull();
    expect(slashTrigger("~/dev")).toBeNull();
    expect(slashTrigger("/home/example")).toBeNull();
  });
  it("closes on a space after the slash", () => {
    expect(slashTrigger("/ ")).toBeNull();
    expect(slashTrigger("/slides now")).toBeNull();
  });
  it("needs a boundary before a slash at the start of a text run", () => {
    expect(slashTrigger("/x", false)).toBeNull();
    expect(slashTrigger("/x", true)).not.toBeNull();
  });
});
