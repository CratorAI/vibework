import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { parseDeck } from "../core/parse";
import { renderDeck } from "../core/render";
import { buildPrintPage } from "../core/print";
import { buildPptx } from "../core/pptx";
import { getTheme, THEMES, validHex } from "../core/themes";

const sample = readFileSync(path.join(__dirname, "../__fixtures__/northwind.slides.md"), "utf8");

describe("renderDeck", () => {
  const deck = parseDeck(sample);
  const r = renderDeck(deck);

  it("renders every slide with its layout and surface", () => {
    expect(r.slides).toHaveLength(10);
    expect(r.themeId).toBe("ledger");
    expect(r.slides[1].html).toContain('class="slide l-section s-dark');
    expect(r.slides[2].html).toContain("l-stats");
    expect(r.slides[3].html).toContain("<svg");
  });

  it("marks editable text with field indexes that exist", () => {
    r.slides.forEach((s, i) => {
      const ids = [...s.html.matchAll(/data-f="(\d+)"/g)].map((m) => +m[1]);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) expect(deck.slides[i].fields[id]).toBeDefined();
    });
  });

  it("escapes deck text instead of passing markup through", () => {
    const d = parseDeck('# <script>alert(1)</script> & "quotes"\n\n![x" onerror="alert(1)](a.png)\n\n---\n\n<!-- layout: bullets -->\n# <img src=x onerror=alert(1)>\n\n- <b>bold?</b>\n');
    const html = renderDeck(d).slides.map((s) => s.html).join("");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("ignores accent values that are not hex colours", () => {
    expect(validHex("#1d5c4d")).toBe("#1D5C4D");
    expect(validHex("red; background:url(x)")).toBeNull();
    const d = parseDeck('---\naccent: "red;}body{display:none"\n---\n\n# A\n');
    expect(renderDeck(d).extraCss).toBe("");
  });

  it("renders in every theme and falls back to the default for unknown themes", () => {
    for (const t of THEMES) {
      const d = parseDeck(sample.replace("theme: ledger", `theme: ${t.id}`));
      expect(renderDeck(d).themeId).toBe(t.id);
    }
    expect(getTheme("nope").id).toBe("ledger");
  });

  it("builds a print page with one page per slide", () => {
    const html = buildPrintPage(deck, "file:///tmp/");
    expect(html.match(/<section class="slide /g)).toHaveLength(10);
    expect(html).toContain("@page{size:1920px 1080px");
  });
});

describe("buildPptx", () => {
  it("writes a deck with one slide per slide, notes, a native chart and a table", async () => {
    const bytes = (await buildPptx(parseDeck(sample), { loadImage: async () => null })) as Uint8Array;
    const zip = await JSZip.loadAsync(bytes);
    const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    expect(slides).toHaveLength(10);
    const notes = Object.keys(zip.files).filter((f) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(f));
    expect(notes).toHaveLength(10);
    expect(Object.keys(zip.files).some((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f))).toBe(true);
    const s3 = await zip.file("ppt/slides/slide3.xml")!.async("string");
    expect(s3).toContain("All three turnaround targets were met");
    expect(s3).toContain("£184m");
    const s8 = await zip.file("ppt/slides/slide8.xml")!.async("string");
    expect(s8).toContain("<a:tbl>");
    const s5 = await zip.file("ppt/slides/slide5.xml")!.async("string");
    expect(s5).toContain('<a:buClr><a:srgbClr val="1D5C4D"/></a:buClr>');
  });
});

describe("skill bundle", () => {
  const bundle = path.resolve(__dirname, "../../../../../.vibework/skills/vibework-slides/scripts/deckCore.js");
  it.skipIf(!existsSync(bundle))("is up to date with core (run build-skill-core.ts if this fails)", async () => {
    const core = await import(/* @vite-ignore */ bundle);
    const a = renderDeck(parseDeck(sample));
    const b = core.renderDeck(core.parseDeck(sample));
    expect(b).toEqual(a);
    expect(core.buildPrintPage(core.parseDeck(sample), null)).toBe(buildPrintPage(parseDeck(sample), null));
    const edited = core.moveSlide(core.parseDeck(sample), 2, 5);
    const { moveSlide } = await import("../core/edit");
    expect(edited).toBe(moveSlide(parseDeck(sample), 2, 5));
  });
});
