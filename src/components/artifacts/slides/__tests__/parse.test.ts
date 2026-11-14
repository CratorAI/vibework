import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDeck, parseDirective, parseNumber, type Block } from "../core/parse";
import { parseInline, runsEqual, serializeRuns, type Run } from "../core/inline";
import { chartSpec, niceTicks } from "../core/charts";

const sample = readFileSync(path.join(__dirname, "../__fixtures__/northwind.slides.md"), "utf8");

describe("parseDeck", () => {
  const deck = parseDeck(sample);

  it("reads front matter", () => {
    expect(deck.meta.theme).toBe("ledger");
    expect(deck.meta.title).toBe("Northwind Logistics — FY2026 review");
    expect(deck.meta.footer).toContain("Board pack");
  });

  it("finds ten slides with the right layouts", () => {
    expect(deck.slides.map((s) => s.layout)).toEqual([
      "title",
      "section",
      "stats",
      "chart",
      "bullets",
      "split",
      "image",
      "table",
      "statement",
      "closing",
    ]);
  });

  it("extracts speaker notes on every slide", () => {
    for (const s of deck.slides) expect(s.notes.length).toBeGreaterThan(20);
    expect(deck.slides[0].notes.startsWith("Open with")).toBe(true);
    // notes do not leak into content
    expect(deck.slides[0].blocks.every((b) => b.type !== "paragraph" || !b.text.raw.startsWith("Notes"))).toBe(true);
  });

  it("records field ranges that point at the text in the source", () => {
    for (const s of deck.slides) {
      for (const f of s.fields) {
        expect(f.start).toBeGreaterThanOrEqual(s.range.start);
        expect(f.end).toBeLessThanOrEqual(s.range.end);
      }
    }
    const h = deck.slides[2].blocks[0] as Extract<Block, { type: "heading" }>;
    const f = deck.slides[2].fields[h.text.field];
    expect(sample.slice(f.start, f.end)).toBe("All three turnaround targets were met");
  });

  it("splits stats into value and label", () => {
    const list = deck.slides[2].blocks.find((b) => b.type === "list") as Extract<Block, { type: "list" }>;
    expect(list.items.map((i) => i.value?.raw)).toEqual(["£184m", "6.8%", "97.2%"]);
    expect(list.items[0].label?.raw).toBe("revenue, up 9% on FY2025");
  });

  it("parses the quote and its attribution", () => {
    const q = deck.slides[8].blocks.find((b) => b.type === "quote") as Extract<Block, { type: "quote" }>;
    expect(q.text.raw.startsWith("If Northwind")).toBe(true);
    expect(q.attribution?.raw).toBe("Head of Logistics, a top-three grocery customer");
  });

  it("parses tables with alignment and cell ranges", () => {
    const t = deck.slides[7].blocks.find((b) => b.type === "table") as Extract<Block, { type: "table" }>;
    expect(t.header.map((h) => h.raw)).toEqual(["Option", "Capex", "Annual saving", "Payback", "Ready"]);
    expect(t.align).toEqual([null, "right", "right", "right", null]);
    expect(t.rows).toHaveLength(4);
    expect(t.rows[0][0].runs).toEqual([{ text: "Build Leeds hub", b: true }]);
  });

  it("builds a chart spec from the table", () => {
    const s = deck.slides[3];
    const t = s.blocks.find((b) => b.type === "table") as Extract<Block, { type: "table" }>;
    const spec = chartSpec(t, s.directive);
    expect(spec.type).toBe("bar");
    expect(spec.categories).toEqual(["FY20", "FY21", "FY22", "FY23", "FY24", "FY25", "FY26"]);
    expect(spec.series[0].values).toEqual([6.1, 6.4, 3.2, 3.6, 3.9, 4.1, 6.8]);
    expect(spec.suffix).toBe("%");
    expect(spec.highlight).toBe("FY26");
    expect(spec.warnings).toEqual([]);
  });

  it("infers layouts when there is no directive", () => {
    const d = parseDeck("# Title\n\nSub\n\n---\n\n# Point\n\n- a\n- b\n\n---\n\n| A | B |\n|---|---|\n| x | 1 |\n\n---\n\n![x](a.png)\n\n---\n\n> quoted\n");
    expect(d.slides.map((s) => s.layout)).toEqual(["title", "bullets", "table", "image", "statement"]);
  });

  it("ignores empty chunks from stray separators", () => {
    const d = parseDeck("# One\n\n---\n\n---\n\n# Two\n\n---\n");
    expect(d.slides).toHaveLength(2);
  });

  it("warns about long headlines and too many bullets", () => {
    const d = parseDeck("# a\n\n---\n\n<!-- layout: bullets -->\n# " + "x".repeat(100) + "\n\n- 1\n- 2\n- 3\n- 4\n- 5\n- 6\n- 7\n");
    expect(d.slides[1].warnings.join(" ")).toMatch(/Headline/);
    expect(d.slides[1].warnings.join(" ")).toMatch(/7 bullets/);
  });
});

describe("directives and numbers", () => {
  it("parses quoted values", () => {
    expect(parseDirective(' layout: chart, unit: "£m, nominal", highlight: 2026 ')).toEqual({ layout: "chart", unit: "£m, nominal", highlight: "2026" });
  });
  it("parses numbers in cells", () => {
    expect(parseNumber("1,234.5")).toBe(1234.5);
    expect(parseNumber("£38.0m")).toBe(38);
    expect(parseNumber("(3.2)")).toBe(-3.2);
    expect(parseNumber("−4")).toBe(-4);
    expect(parseNumber("45%")).toBe(45);
    expect(parseNumber("—")).toBeNull();
    expect(parseNumber("Q3 2028")).toBeNull();
  });
  it("makes nice ticks", () => {
    expect(niceTicks(0, 6.8).ticks).toEqual([0, 2, 4, 6, 8]);
  });
});

describe("inline markdown", () => {
  it("parses styles", () => {
    expect(parseInline("a **b** *c* `d` ==e== [f](https://x.y)")).toEqual([
      { text: "a " },
      { text: "b", b: true },
      { text: " " },
      { text: "c", i: true },
      { text: " " },
      { text: "d", code: true },
      { text: " " },
      { text: "e", mark: true },
      { text: " " },
      { text: "f", href: "https://x.y" },
    ]);
  });
  it("keeps snake_case and lone asterisks literal", () => {
    expect(parseInline("file_name_v2 costs 5 * 3")).toEqual([{ text: "file_name_v2 costs 5 * 3" }]);
  });
  const cases: Run[][] = [
    [{ text: "Plain text" }],
    [{ text: "Bold", b: true }, { text: " then plain" }],
    [{ text: "Use " }, { text: "*stars*" }, { text: " and _under_ and `ticks` and a | pipe" }],
    [{ text: "- not a list" }],
    [{ text: "1. not a list" }],
    [{ text: "# not a heading" }],
    [{ text: "Notes: not notes" }],
    [{ text: "nested ", b: true }, { text: "italic", b: true, i: true }],
    [{ text: "==not mark==" }],
  ];
  for (const runs of cases) {
    it(`round-trips ${JSON.stringify(runs)}`, () => {
      for (const ctx of ["block", "cell", "item", "heading"] as const) {
        const md = serializeRuns(runs, ctx);
        const back = parseInline(md);
        expect(runsEqual(back, runs), `${ctx}: ${md}`).toBe(true);
      }
    });
  }
});
