import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { findUnsupportedContent, repairForImport } from "../xlsxPackage";
import { contrastRatio, ironCalcThemeFromTokens, parseColor, readableInDark } from "../theme";

const fixture = (name: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))));

function patch(bytes: Uint8Array, edit: (files: Record<string, Uint8Array>) => void): Uint8Array {
  const files = unzipSync(bytes);
  edit(files);
  return zipSync(files);
}
const editXml = (files: Record<string, Uint8Array>, name: string, fn: (xml: string) => string) => {
  files[name] = strToU8(fn(strFromU8(files[name])));
};

describe("findUnsupportedContent", () => {
  it("flags the 1904 date system, filters, protection and page breaks", () => {
    const bytes = patch(fixture("budget.xlsx"), (f) => {
      editXml(f, "xl/workbook.xml", (x) => x.replace("<workbookPr", '<workbookPr date1904="1"'));
      editXml(f, "xl/worksheets/sheet1.xml", (x) =>
        x.replace("</sheetData>", '</sheetData><sheetProtection sheet="1"/><autoFilter ref="A1:D4"/>').replace(
          "</worksheet>",
          '<rowBreaks count="1"><brk id="3" max="16383" man="1"/></rowBreaks></worksheet>',
        ),
      );
    });
    expect(findUnsupportedContent(bytes).sort()).toEqual(["filters", "page breaks", "sheet protection", "the 1904 date system"]);
  });

  it("flags iterative calculation (circular references would stop working)", () => {
    const bytes = patch(fixture("budget.xlsx"), (f) =>
      editXml(f, "xl/workbook.xml", (x) => x.replace("</workbook>", '<calcPr calcId="191029" iterate="1"/></workbook>')),
    );
    expect(findUnsupportedContent(bytes)).toEqual(["iterative or manual calculation settings"]);
  });

  it("flags mixed formatting inside a cell but not uniformly formatted runs", () => {
    const withRuns = (si: string) =>
      patch(fixture("budget.xlsx"), (f) => {
        f["xl/sharedStrings.xml"] = strToU8(
          `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="1">${si}</sst>`,
        );
      });
    expect(findUnsupportedContent(withRuns("<si><r><rPr><b/></rPr><t>bold</t></r><r><t> plain</t></r></si>"))).toEqual([
      "text with mixed formatting inside a cell",
    ]);
    expect(findUnsupportedContent(withRuns("<si><r><rPr><b/></rPr><t>a</t></r><r><rPr><b/></rPr><t>b</t></r></si>"))).toEqual([]);
  });

  it("flags unknown worksheet content conservatively", () => {
    const bytes = patch(fixture("budget.xlsx"), (f) =>
      editXml(f, "xl/worksheets/sheet1.xml", (x) => x.replace("</worksheet>", "<somethingNew/></worksheet>")),
    );
    expect(findUnsupportedContent(bytes)).toEqual(["unsupported content (somethingNew)"]);
  });

  it("repairForImport makes absolute relationship targets relative", () => {
    const repaired = unzipSync(repairForImport(fixture("extras.xlsx"), 1));
    const rels = strFromU8(repaired["xl/worksheets/_rels/sheet1.xml.rels"]);
    expect(rels).toContain('Target="../comments/comment1.xml"');
    expect(rels).not.toContain('Target="/');
  });
});

describe("theme", () => {
  it("parses the token syntaxes in index.css", () => {
    expect(parseColor("#fcfcfb")).toEqual({ r: 252, g: 252, b: 251, a: 1 });
    const white = parseColor("oklch(1 0 0)")!;
    expect([white.r, white.g, white.b].map(Math.round)).toEqual([255, 255, 255]);
    const border = parseColor("oklch(1 0 0 / 10%)")!;
    expect(border.a).toBeCloseTo(0.1);
    const orange = parseColor("#f9693c")!;
    expect(orange.a).toBe(1);
    expect(parseColor("var(--x)")).toBeNull();
  });

  it("produces concrete colours for every IronCalc variable, light and dark", () => {
    const light: Record<string, string> = { "--background": "#fcfcfb", "--foreground": "oklch(0.145 0 0)", "--border": "oklch(0.922 0 0)" };
    const dark: Record<string, string> = { "--background": "oklch(0.145 0 0)", "--foreground": "oklch(0.985 0 0)", "--border": "oklch(1 0 0 / 10%)" };
    for (const tokens of [light, dark]) {
      const vars = ironCalcThemeFromTokens((t) => tokens[t] ?? "");
      for (const [k, v] of Object.entries(vars)) {
        if (k.includes("font") || k.includes("shadow") || k === "scrollbar-color" || k === "--typography-font-size") continue;
        expect(v, k).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);
      }
    }
    const d = ironCalcThemeFromTokens((t) => dark[t] ?? "");
    // translucent dark border composited over the background: a visible but quiet grid line
    expect(contrastRatio(parseColor(d["--palette-sheet-grid-color"])!, parseColor(d["--palette-common-white"])!)).toBeGreaterThan(1.1);
  });

  it("readableInDark swaps unreadable text and border colours on unfilled cells only", () => {
    const bg = parseColor("#121212")!;
    const resolve = (c: unknown) => (Array.isArray(c) ? "#000000" : String(c));
    const plain = { fill: {}, font: { color: [1, 0] as unknown }, border: { left: { color: "#000000" }, top: { color: "#FF0000" } } };
    const replaced = readableInDark(plain, resolve, bg, "#fafafa");
    expect(plain.font.color).toBe("#fafafa");
    expect(plain.border.left.color).toBe("#fafafa");
    expect(plain.border.top.color).toBe("#FF0000");
    expect(replaced).toEqual({ font: [1, 0], borders: { left: "#000000" } });
    const filled = { fill: { color: "#FFFF00" }, font: { color: "#000000" as unknown }, border: {} };
    expect(readableInDark(filled, resolve, bg, "#fafafa")).toBeNull();
    expect(filled.font.color).toBe("#000000");
  });
});
