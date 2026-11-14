import { describe, it, expect } from "vitest";
import {
  parseDesign,
  editable,
  attribute,
  patchStyle,
  blankDesign,
  box,
} from "../model";
import { History, resize, snap } from "../geometry";
describe("source preservation", () => {
  it("preserves an untouched document byte for byte", () => {
    const s =
      "<!DOCTYPE HTML>\r\n<!-- odd > -->" +
      blankDesign() +
      "\n<script>const x = '<div>';</script>";
    expect(parseDesign(s).source).toBe(s);
  });
  it("changes only the target opening tag", () => {
    const s =
      '<section data-design-frame="f" style="width:100px;height:100px"><weird a=\'quoted > value\'>\n &amp; <b>untouched</b></weird><!--keep--></section>';
    const result = patchStyle(s, "f", { width: "200px" });
    expect(result.slice(result.indexOf("><weird") + 1)).toBe(
      s.slice(s.indexOf("><weird") + 1),
    );
    expect(box(parseDesign(result).frames[0]).w).toBe(200);
  });
  it("does not parse comments or raw text as elements", () => {
    const d = parseDesign(
      '<style>p:before{content:"<section data-design-frame=x>"}</style><!--<div>--><section data-design-frame="a"></section>',
    );
    expect(d.frames).toHaveLength(1);
  });
  it("escapes attribute edits without replacement-string interpolation", () => {
    const s = '<div data-name="old">Keep me</div>',
      n = parseDesign(s).nodes[0];
    expect(attribute(s, n, "data-name", '"<$&')).toBe(
      '<div data-name="&quot;&lt;$&amp;">Keep me</div>',
    );
  });
  it("recognizes uppercase markup", () =>
    expect(
      parseDesign('<SECTION DATA-DESIGN-FRAME="a"></SECTION>').frames,
    ).toHaveLength(1));
});
describe("geometry", () => {
  it("snaps only within threshold", () => {
    expect(snap(98, [100])).toBe(100);
    expect(snap(80, [100])).toBe(80);
  });
  it("resizes in rotated local coordinates", () => {
    const b = resize({ x: 0, y: 0, w: 100, h: 50, rotation: 90 }, 0, 20);
    expect(b.w).toBeCloseTo(120);
    expect(b.h).toBeCloseTo(50);
    expect(b.x).toBeCloseTo(-10);
    expect(b.y).toBeCloseTo(10);
  });
  it("preserves ratio", () => {
    const b = resize({ x: 0, y: 0, w: 100, h: 50, rotation: 0 }, 30, 40, true);
    expect(b.w / b.h).toBe(2);
  });
});
describe("history", () => {
  it("retains at least 100 reversible changes", () => {
    const h = new History(0);
    for (let i = 1; i <= 150; i++) h.push(i);
    for (let i = 149; i >= 0; i--) expect(h.undo()).toBe(i);
    for (let i = 1; i <= 150; i++) expect(h.redo()).toBe(i);
  });
  it("discards redo after a new branch", () => {
    const h = new History("a");
    h.push("b");
    h.undo();
    h.push("c");
    expect(h.redo()).toBe("c");
  });
});
import { rasterPdf } from "../pdf";
describe("PDF export", () => {
  it("writes one page per frame with correct binary offsets", () => {
    const result = rasterPdf([
      { width: 1080, height: 1920, jpeg: new Uint8Array([255, 216, 255, 217]) },
      { width: 794, height: 1123, jpeg: new Uint8Array([255, 216, 255, 217]) },
    ]);
    const text = new TextDecoder("latin1").decode(result);
    expect(text).toContain("/Count 2");
    expect(text).toContain("/MediaBox [0 0 810 1440]");
    const start = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(new TextDecoder().decode(result.slice(start, start + 4))).toBe(
      "xref",
    );
  });
  it("rejects empty documents and invalid dimensions", () => {
    expect(() => rasterPdf([])).toThrow();
    expect(() =>
      rasterPdf([{ width: NaN, height: 100, jpeg: new Uint8Array() }]),
    ).toThrow();
  });
});

it("keeps nested unknown text markup read-only", () => {
  const n = parseDesign(
    `<div data-design-id="x" data-design-kind="text" style="width:100px;height:100px"><custom>Keep</custom></div>`,
  ).nodes[0];
  expect(editable(n)).toBe(false);
});

import { resizeHandle } from "../geometry";
describe("eight-handle transforms", () => {
  it("keeps the opposite corner fixed", () => {
    const b = resizeHandle(
      { x: 20, y: 30, w: 100, h: 80, rotation: 0 },
      -20,
      -10,
      "nw",
    );
    expect(b).toEqual({ x: 0, y: 20, w: 120, h: 90, rotation: 0 });
  });
  it("resizes around the centre with alt", () => {
    const b = resizeHandle(
      { x: 20, y: 30, w: 100, h: 80, rotation: 0 },
      20,
      10,
      "se",
      false,
      true,
    );
    expect(b.x + b.w / 2).toBe(70);
    expect(b.y + b.h / 2).toBe(70);
  });
  it("maintains ratio from a side handle", () => {
    const b = resizeHandle(
      { x: 0, y: 0, w: 100, h: 50, rotation: 30 },
      20,
      10,
      "e",
      true,
    );
    expect(b.w / b.h).toBeCloseTo(2);
  });
});

import { roundedRectPath } from "../svgGeometry";
describe("faithful SVG corners", () => {
  it("preserves asymmetric CSS corners", () => {
    const p = roundedRectPath(150, 228, ["20px", "20px", "70px", "70px"]);
    expect(p).toContain("A70 70");
    expect(p).toContain("A20 20");
  });
  it("reduces overlapping radii and resolves percentages", () => {
    expect(roundedRectPath(100, 60, ["50%", "50%", "50%", "50%"])).toContain(
      "A50 30",
    );
    expect(
      roundedRectPath(100, 60, ["100px", "100px", "100px", "100px"]),
    ).toContain("A30 30");
  });
});

import { decode } from "../model";
it("preserves invalid named entities and tolerates invalid Unicode references", () => {
  expect(decode("&AMP; &#99999999; &#X41;")).toBe("& � A");
});
it("reads uppercase attributes without creating spurious tag attributes", () => {
  const n = parseDesign('<DIV DATA-DESIGN-ID="a" STYLE="width:25px"></DIV>')
    .nodes[0];
  expect(n.attrs).toEqual({ "data-design-id": "a", style: "width:25px" });
});
