import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { initSync, type Model } from "@ironcalc/wasm-xlsx";
import { strFromU8, unzipSync } from "fflate";
import { parseCsv, writeCsv } from "../csv";
import { findUnsupportedContent } from "../xlsxPackage";
import {
  bytesToBase64,
  captureView,
  exportXlsx,
  openDocument,
  restoreView,
  serializeDocument,
  takePendingChanges,
  type SheetDocument,
} from "../workbook";

const require = createRequire(import.meta.url);
const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)));

beforeAll(() => {
  initSync({ module: readFileSync(require.resolve("@ironcalc/wasm-xlsx/wasm_bg.wasm")) });
});

function openXlsx(name: string): SheetDocument {
  return openDocument(name, { base64: bytesToBase64(fixture(name)) });
}

function reopen(doc: SheetDocument, name: string): SheetDocument {
  const saved = serializeDocument(doc);
  return openDocument(name, saved);
}

/** Everything the editor is expected to keep, for the first `rows` x `cols` cells of every sheet. */
function snapshot(model: Model, rows = 20, cols = 8) {
  const sheets = model.getWorksheetsProperties();
  return sheets.map((props, s) => {
    const cells: Record<string, unknown> = {};
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        const content = model.getCellContent(s, r, c);
        const { style } = model.getCellStyle(s, r, c);
        if (content === "" && style.num_fmt === "general" && !style.font.b && !style.fill.color) continue;
        cells[`${String.fromCharCode(64 + c)}${r}`] = {
          content,
          shown: model.getFormattedCellValue(s, r, c),
          fmt: style.num_fmt,
          bold: !!style.font.b,
          italic: !!style.font.i,
          underline: !!style.font.u,
          color: style.font.color ?? null,
          size: style.font.sz,
          fill: style.fill.color ?? null,
          align: style.alignment ?? null,
          border: style.border,
        };
      }
    }
    return {
      name: props.name,
      state: props.state,
      frozenRows: model.getFrozenRowsCount(s),
      frozenCols: model.getFrozenColumnsCount(s),
      merged: model.getMergedCells(s),
      widths: Array.from({ length: cols }, (_, i) => model.getColumnWidth(s, i + 1)),
      heights: Array.from({ length: rows }, (_, i) => model.getRowHeight(s, i + 1)),
      links: model.getLinks(s),
      conditional: model.getConditionalFormattingList(s),
      cells,
    };
  });
}

describe("xlsx round trip", () => {
  for (const name of ["budget.xlsx", "functions.xlsx", "shared.xlsx", "styled.xlsx"]) {
    it(`${name}: open, save without edits, reopen keeps cells, formulas, formats, widths and sheets`, () => {
      const doc = openXlsx(name);
      expect(doc.unsupported).toEqual([]);
      const before = snapshot(doc.model);
      const again = reopen(doc, name);
      expect(snapshot(again.model)).toEqual(before);
      // and a second generation is stable too
      expect(snapshot(reopen(again, name).model)).toEqual(before);
    });
  }

  it("budget.xlsx: calculates cross-sheet formulas, dates, percentages, merges and the frozen row", () => {
    const { model } = openXlsx("budget.xlsx");
    expect(model.getWorksheetsProperties().map((p) => p.name)).toEqual(["Inputs", "Q1 Summary"]);
    expect(model.getFrozenRowsCount(0)).toBe(1);
    expect(model.getMergedCells(1)).toEqual([{ row: 1, column: 1, width: 3, height: 1 }]);
    expect(model.getCellContent(1, 6, 2)).toBe("=SUM(B3:B5)");
    expect(model.getFormattedCellValue(1, 6, 2)).toBe("$259,569");
    expect(model.getFormattedCellValue(1, 7, 2)).toBe("11.10%");
    expect(model.getFormattedCellValue(1, 8, 2)).toBe("1 Jan 2026");
    expect(model.getFormattedCellValue(0, 2, 3)).toBe("3.0%");
    expect(model.getFormattedCellValue(0, 3, 4)).toBe("2026-02-15");
    expect(model.getCellStyle(0, 1, 1).style.font.b).toBe(true);
  });

  it("functions.xlsx: lookups, text, date and logical functions evaluate", () => {
    const { model } = openXlsx("functions.xlsx");
    const shown = (r: number) => model.getFormattedCellValue(1, r, 1);
    expect(shown(1)).toBe("4.75");
    expect(shown(2)).toBe("Bananas");
    expect(shown(3)).toBe("out of stock");
    expect(shown(4)).toBe("2.39");
    expect(shown(8)).toBe("APP-7");
    expect(shown(9)).toBe("2026-05-01");
    expect(shown(10)).toBe("244");
    expect(shown(13)).toBe("n/a");
    expect(shown(14)).toBe("1.7");
    expect(shown(16)).toBe("spaced");
  });

  it("an edit recalculates dependents and survives save and reopen", () => {
    const doc = openXlsx("budget.xlsx");
    takePendingChanges(doc.model);
    doc.model.setUserInput(0, 2, 2, "3000");
    expect(takePendingChanges(doc.model)).toBe(true);
    expect(takePendingChanges(doc.model)).toBe(false);
    expect(doc.model.getFormattedCellValue(1, 6, 2)).toBe("$266,769");
    const again = reopen(doc, "budget.xlsx");
    expect(again.model.getCellContent(0, 2, 2)).toBe("3000");
    expect(again.model.getCellContent(1, 6, 2)).toBe("=SUM(B3:B5)");
    expect(again.model.getFormattedCellValue(1, 6, 2)).toBe("$266,769");
  });

  it("saved files carry cached values, so readers that do not calculate see results", () => {
    const doc = openXlsx("budget.xlsx");
    const files = unzipSync(exportXlsx(doc.model));
    const sheet2 = strFromU8(files["xl/worksheets/sheet2.xml"]);
    expect(sheet2).toContain("<f>SUM(B3:B5)</f><v>259569</v>");
  });

  it("selection changes are not edits, and a view can be restored on a reloaded model", () => {
    const doc = openXlsx("budget.xlsx");
    takePendingChanges(doc.model);
    doc.model.setSelectedSheet(1);
    doc.model.setSelectedCell(6, 2);
    expect(takePendingChanges(doc.model)).toBe(false);
    const view = captureView(doc.model);
    const fresh = openXlsx("budget.xlsx");
    restoreView(fresh.model, view);
    expect(captureView(fresh.model)).toMatchObject({ sheet: 1, row: 6, column: 2 });
  });

  it("an empty .xlsx file opens as a new workbook and saves as a real one", () => {
    const doc = openDocument("New.xlsx", { base64: "" });
    expect(doc.unsupported).toEqual([]);
    doc.model.setUserInput(0, 1, 1, "=1+2");
    const again = reopen(doc, "New.xlsx");
    expect(again.model.getFormattedCellValue(0, 1, 1)).toBe("3");
  });

  it("formulas the engine cannot calculate keep their text and are not saved with a bogus cached value", () => {
    const doc = openDocument("New.xlsx", { base64: "" });
    doc.model.setUserInput(0, 1, 1, "=FORECAST.ETS(1,B1:B3,C1:C3)");
    const files = unzipSync(exportXlsx(doc.model));
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
    expect(sheet).not.toContain("#N/IMPL");
    expect(sheet).toContain("FORECAST.ETS(1,B1:B3,C1:C3)</f>");
    expect(strFromU8(files["xl/workbook.xml"])).toContain('fullCalcOnLoad="1"');
  });
});

describe("content the editor would lose", () => {
  it("clean workbooks are editable", () => {
    for (const name of ["budget.xlsx", "functions.xlsx", "shared.xlsx", "styled.xlsx"])
      expect(findUnsupportedContent(fixture(name)), name).toEqual([]);
  });

  it("a chart makes the workbook read-only", () => {
    expect(findUnsupportedContent(fixture("chart.xlsx"))).toEqual(["charts"]);
    const doc = openXlsx("chart.xlsx");
    expect(doc.unsupported).toEqual(["charts"]);
    expect(doc.model.getFormattedCellValue(0, 3, 2)).toBe("14");
  });

  it("data validation and comments make the workbook read-only, and it still opens", () => {
    const doc = openXlsx("extras.xlsx");
    expect(doc.unsupported.sort()).toEqual(["comments or notes", "data validation (drop-down lists)"]);
    expect(doc.model.getCellContent(0, 2, 1)).toBe("Write spec");
  });
});

describe("csv", () => {
  const open = (name: string, text: string) => openDocument(name, { text });
  const save = (doc: SheetDocument) => (serializeDocument(doc) as { text: string }).text;

  const cases: Array<[string, string]> = [
    ["quoted.csv", 'name,notes,amount\r\n"Smith, J","said ""hi""",1.50\r\nLee,"two\r\nlines",00123\r\n'],
    ["semicolon.csv", "a;b;c\n1,5;2;=not a formula\n;;\n"],
    ["tabs.tsv", "x\ty\n\"quoted\ttab\"\t3\n"],
    ["bom.csv", "﻿id,value\n1,2024-01-15\n2,50%"],
    ["ragged.csv", "a,b,c\n1\n1,2,3,4\n"],
    ["mac.csv", "a,b\r1,2\r"],
    ["urls.csv", "site,big\nhttps://example.com,12345678901234567890\n"],
  ];
  for (const [name, text] of cases) {
    it(`${name}: saving without edits writes the same bytes`, () => {
      expect(save(open(name, text))).toBe(text);
    });
  }

  it("detects the delimiter, line ending, BOM and trailing newline", () => {
    expect(parseCsv("a;b;c\n1;2;3\n").dialect).toEqual({ delimiter: ";", lineEnding: "\n", bom: false, trailingNewline: true });
    expect(parseCsv("﻿a,b\r\n1,2").dialect).toEqual({ delimiter: ",", lineEnding: "\r\n", bom: true, trailingNewline: false });
    expect(parseCsv("a\tb\n", "x.tsv").dialect.delimiter).toBe("\t");
    expect(parseCsv('"a,b",c\n"x\ny",z\n').rows).toEqual([["a,b", "c"], ["x\ny", "z"]]);
  });

  it("an edit changes only that field and keeps other quoting", () => {
    const text = 'name,notes,amount\r\n"Smith, J","said ""hi""",1.50\r\n"Lee",plain,2\r\n';
    const doc = open("quoted.csv", text);
    doc.model.setUserInput(0, 3, 3, "7.25");
    expect(save(doc)).toBe('name,notes,amount\r\n"Smith, J","said ""hi""",1.50\r\n"Lee",plain,7.25\r\n');
  });

  it("formulas are saved as their values; numbers keep the format they were given", () => {
    const doc = open("calc.csv", "a,b\n2,3\n");
    doc.model.setUserInput(0, 2, 3, "=A2*B2");
    doc.model.setUserInput(0, 1, 3, "total");
    doc.model.setUserInput(0, 3, 1, "12%");
    expect(save(doc)).toBe("a,b,total\n2,3,6\n12%\n");
  });

  it("values that would change meaning stay text", () => {
    const doc = open("ids.csv", "zip,card,formula\n02139,1234567890123456789,=1+1\n");
    expect(doc.model.getFormattedCellValue(0, 2, 1)).toBe("02139");
    expect(doc.model.getFormattedCellValue(0, 2, 2)).toBe("1234567890123456789");
    expect(doc.model.getFormattedCellValue(0, 2, 3)).toBe("=1+1");
    // and numbers are numbers
    const nums = open("n.csv", "a\n1.50\n2\n");
    nums.model.setUserInput(0, 4, 1, "=SUM(A2:A3)");
    expect(nums.model.getFormattedCellValue(0, 4, 1)).toBe("3.5");
  });

  it("writeCsv quotes what needs quoting", () => {
    const dialect = { delimiter: ";", lineEnding: "\n" as const, bom: false, trailingNewline: true };
    expect(writeCsv([["a;b", 'q"', "x\ny", "plain"]], dialect)).toBe('"a;b";"q""";"x\ny";plain\n');
  });

  it("an empty file opens and saves", () => {
    const doc = open("empty.csv", "");
    expect(save(doc)).toBe("");
    doc.model.setUserInput(0, 1, 1, "hello");
    expect(save(doc)).toBe("hello");
  });
});
