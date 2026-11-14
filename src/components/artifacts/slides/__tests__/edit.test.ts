import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDeck, type Block, type Deck } from "../core/parse";
import { deleteSlide, duplicateSlide, editField, insertSlide, moveSlide, replaceSlide, setMeta, setNotes, slideSource, SLIDE_TEMPLATES } from "../core/edit";

const sample = readFileSync(path.join(__dirname, "../__fixtures__/northwind.slides.md"), "utf8");

/** The source split into front matter, slide chunks and separators, for comparisons. */
function pieces(d: Deck) {
  return {
    fm: d.frontMatter ? d.source.slice(d.frontMatter.start, d.frontMatter.end) : "",
    bodies: d.slides.map((_, i) => slideSource(d, i)),
  };
}

/** Index range [a, b) of the first and last differing characters. */
function diffSpan(a: string, b: string): { start: number; endA: number; endB: number } | null {
  if (a === b) return null;
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length;
  let eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) {
    ea--;
    eb--;
  }
  return { start: s, endA: ea, endB: eb };
}

describe("editing one slide's text", () => {
  const deck = parseDeck(sample);

  it("changes only that slide's source", () => {
    const s = deck.slides[4];
    const h = s.blocks.find((b) => b.type === "heading") as Extract<Block, { type: "heading" }>;
    const next = editField(deck, 4, h.text.field, [{ text: "Three board decisions drove the recovery" }]);
    const span = diffSpan(sample, next)!;
    expect(span.start).toBeGreaterThanOrEqual(s.range.start);
    expect(span.endA).toBeLessThanOrEqual(s.range.end);
    const before = pieces(deck);
    const after = pieces(parseDeck(next));
    expect(after.fm).toBe(before.fm);
    after.bodies.forEach((b, i) => {
      if (i !== 4) expect(b).toBe(before.bodies[i]);
    });
    expect(after.bodies[4]).toContain("# Three board decisions drove the recovery\n");
  });

  it("keeps inline formatting it did not touch", () => {
    const s = deck.slides[4];
    const list = s.blocks.find((b) => b.type === "list") as Extract<Block, { type: "list" }>;
    const runs = [{ text: "Route consolidation.", b: true }, { text: " Fourteen depots merged into eight; empty miles down 22%." }];
    const next = editField(deck, 4, list.items[0].text.field, runs);
    expect(next).toContain("1. **Route consolidation.** Fourteen depots merged into eight; empty miles down 22%.\n2. **Fuel hedging.**");
    expect(diffSpan(sample, next)!.endA - diffSpan(sample, next)!.start).toBeLessThan(10);
  });

  it("is a no-op when the text is unchanged", () => {
    const s = deck.slides[2];
    const list = s.blocks.find((b) => b.type === "list") as Extract<Block, { type: "list" }>;
    expect(editField(deck, 2, list.items[0].text.field, list.items[0].text.runs)).toBe(sample);
  });

  it("edits a stat value without touching its label", () => {
    const list = deck.slides[2].blocks.find((b) => b.type === "list") as Extract<Block, { type: "list" }>;
    const next = editField(deck, 2, list.items[0].value!.field, [{ text: "£185m" }]);
    expect(next).toContain("- **£185m** revenue, up 9% on FY2025\n");
  });

  it("escapes characters that would change the structure", () => {
    const t = deck.slides[7].blocks.find((b) => b.type === "table") as Extract<Block, { type: "table" }>;
    const next = editField(deck, 7, t.rows[1][4].field, [{ text: "Q1 | Q2 2027" }]);
    expect(next).toContain("| Q1 \\| Q2 2027 |");
    const d2 = parseDeck(next);
    const t2 = d2.slides[7].blocks.find((b) => b.type === "table") as Extract<Block, { type: "table" }>;
    expect(t2.rows[1]).toHaveLength(5);
    const h = deck.slides[1].blocks.find((b) => b.type === "paragraph") as Extract<Block, { type: "paragraph" }>;
    const n2 = editField(deck, 1, h.text.field, [{ text: "- a list? no" }]);
    expect(parseDeck(n2).slides[1].blocks.some((b) => b.type === "list")).toBe(false);
  });

  it("turns a multi-line quote into one line", () => {
    const q = deck.slides[8].blocks.find((b) => b.type === "quote") as Extract<Block, { type: "quote" }>;
    const next = editField(deck, 8, q.text.field, [{ text: "Deliver before 6am and the region is yours." }]);
    const q2 = parseDeck(next).slides[8].blocks.find((b) => b.type === "quote") as Extract<Block, { type: "quote" }>;
    expect(q2.text.raw).toBe("Deliver before 6am and the region is yours.");
    expect(q2.attribution?.raw).toBe("Head of Logistics, a top-three grocery customer");
  });
});

describe("reordering", () => {
  const deck = parseDeck(sample);

  it("moves a slide and changes nothing else", () => {
    const next = moveSlide(deck, 3, 5);
    const before = pieces(deck);
    const after = pieces(parseDeck(next));
    expect(after.fm).toBe(before.fm);
    const expected = [...before.bodies];
    const [m] = expected.splice(3, 1);
    expected.splice(5, 0, m);
    expect(after.bodies).toEqual(expected);
    expect(parseDeck(next).slides.map((s) => s.layout)).toEqual(["title", "section", "stats", "bullets", "split", "chart", "image", "table", "statement", "closing"]);
    // same characters, only rearranged
    expect([...next].sort().join("")).toBe([...sample].sort().join(""));
    // moving back restores the file exactly
    expect(moveSlide(parseDeck(next), 5, 3)).toBe(sample);
  });

  it("moves the last slide (no trailing newline) into the middle", () => {
    const src = "# A\n\n---\n\n# B\n\n---\n\n# C";
    const next = moveSlide(parseDeck(src), 2, 0);
    expect(pieces(parseDeck(next)).bodies).toEqual(["# C", "# A", "# B"]);
    expect(parseDeck(next).slides).toHaveLength(3);
  });

  it("returns the source unchanged for a no-op move", () => {
    expect(moveSlide(deck, 2, 2)).toBe(sample);
  });
});

describe("structure edits", () => {
  const deck = parseDeck(sample);

  it("duplicates a slide right after itself", () => {
    const d2 = parseDeck(duplicateSlide(deck, 2));
    expect(d2.slides).toHaveLength(11);
    expect(slideSource(d2, 3)).toBe(slideSource(deck, 2));
    expect(slideSource(d2, 4)).toBe(slideSource(deck, 3));
  });

  it("duplicates the last slide", () => {
    const d2 = parseDeck(duplicateSlide(deck, 9));
    expect(d2.slides).toHaveLength(11);
    expect(slideSource(d2, 10)).toBe(slideSource(deck, 9));
  });

  it("deletes a slide and its separator", () => {
    const next = deleteSlide(deck, 4);
    const d2 = parseDeck(next);
    expect(d2.slides).toHaveLength(9);
    expect(pieces(d2).bodies).toEqual(pieces(deck).bodies.filter((_, i) => i !== 4));
    expect(next.match(/^---\s*$/gm)!.length).toBe(sample.match(/^---\s*$/gm)!.length - 1);
  });

  it("deletes the last and the first slide", () => {
    expect(parseDeck(deleteSlide(deck, 9)).slides).toHaveLength(9);
    const d0 = parseDeck(deleteSlide(deck, 0));
    expect(d0.slides).toHaveLength(9);
    expect(d0.meta.theme).toBe("ledger");
    expect(d0.slides[0].layout).toBe("section");
  });

  it("inserts a slide after the current one", () => {
    const d2 = parseDeck(insertSlide(deck, 3, SLIDE_TEMPLATES.stats));
    expect(d2.slides).toHaveLength(11);
    expect(d2.slides[4].layout).toBe("stats");
    expect(slideSource(d2, 5)).toBe(slideSource(deck, 4));
  });

  it("inserts into an empty deck", () => {
    const d = parseDeck("---\ntheme: slate\n---\n");
    const d2 = parseDeck(insertSlide(d, 0, "# Hello"));
    expect(d2.slides).toHaveLength(1);
    expect(d2.meta.theme).toBe("slate");
  });

  it("replaces one slide's source", () => {
    const next = replaceSlide(deck, 1, "<!-- layout: section -->\n# Where we are");
    expect(pieces(parseDeck(next)).bodies[1]).toBe("<!-- layout: section -->\n# Where we are");
    expect(diffSpan(sample, next)!.start).toBeGreaterThanOrEqual(deck.slides[1].range.start);
  });
});

describe("notes and front matter", () => {
  const deck = parseDeck(sample);

  it("rewrites existing notes in place", () => {
    const next = setNotes(deck, 2, "New notes.\nSecond line.");
    const d2 = parseDeck(next);
    expect(d2.slides[2].notes).toBe("New notes.\nSecond line.");
    expect(pieces(d2).bodies.filter((_, i) => i !== 2)).toEqual(pieces(deck).bodies.filter((_, i) => i !== 2));
  });

  it("adds and removes notes", () => {
    const src = "# A\n\n---\n\n# B\n";
    const d1 = parseDeck(setNotes(parseDeck(src), 0, "Hello"));
    expect(d1.slides[0].notes).toBe("Hello");
    expect(d1.source).toBe("# A\n\nNotes:\nHello\n\n---\n\n# B\n");
    expect(setNotes(d1, 0, "")).toBe(src);
  });

  it("sets the theme in the front matter", () => {
    const next = setMeta(deck, "theme", "slate");
    expect(next).toBe(sample.replace("theme: ledger", "theme: slate"));
    const bare = setMeta(parseDeck("# A\n"), "theme", "graphite");
    expect(bare).toBe("---\ntheme: graphite\n---\n\n# A\n");
    expect(parseDeck(setMeta(parseDeck("---\ntitle: X\n---\n\n# A\n"), "theme", "slate")).meta).toEqual({ title: "X", theme: "slate" });
  });
});
