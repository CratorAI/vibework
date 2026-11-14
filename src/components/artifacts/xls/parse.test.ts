import { describe, expect, it } from "vitest";
import { utils, write } from "xlsx";
import { MAX_XLS_BYTES, parseLegacyWorkbook } from "./parse";

function fixture(sheets: Record<string, unknown[][]>): Uint8Array {
  const book = utils.book_new();
  for (const [name, data] of Object.entries(sheets)) utils.book_append_sheet(book, utils.aoa_to_sheet(data), name);
  return new Uint8Array(write(book, { type: "array", bookType: "biff8" }));
}

describe("legacy Excel preview", () => {
  it("reads binary XLS sheets with Unicode, blank cells and formatted dates", () => {
    const bytes = fixture({ Revenue: [["नमस्ते", "日本語", "<script>alert(1)</script>"], [12, null, true]], Dates: [[new Date(2026, 0, 15)]] });
    const result = parseLegacyWorkbook(bytes);
    expect(result.sheets[0].rows).toEqual([["नमस्ते", "日本語", "<script>alert(1)</script>"], ["12", "", "TRUE"]]);
    expect(result.sheets[1].rows[0][0]).toBe("1/15/26");
    expect(result.sheets.map((s) => s.name)).toEqual(["Revenue", "Dates"]);
  });
  it("bounds rendered rows and columns while reporting full dimensions", () => {
    const rows = Array.from({ length: 1005 }, (_, r) => Array.from({ length: 105 }, (_, c) => r + c));
    const sheet = parseLegacyWorkbook(fixture({ Large: rows })).sheets[0];
    expect(sheet.rowCount).toBe(1005);
    expect(sheet.columnCount).toBe(105);
    expect(sheet.rows).toHaveLength(1000);
    expect(sheet.rows[0]).toHaveLength(100);
  }, 30000);
  it("reports hidden sheets and uses cached formula values", () => {
    const book = utils.book_new();
    utils.book_append_sheet(book, { A1: { t: "n", f: "2+3", v: 5 }, "!ref": "A1" }, "Visible");
    utils.book_append_sheet(book, utils.aoa_to_sheet([["secret"]]), "Hidden");
    book.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 1 }] };
    const result = parseLegacyWorkbook(new Uint8Array(write(book, { type: "array", bookType: "biff8" })));
    expect(result.sheets[0].rows).toEqual([["5"]]);
    expect(result.sheets[1].hidden).toBe(true);
  });
  it("preserves the anchor of merged cells without duplicating values", () => {
    const book = utils.book_new();
    const sheet = utils.aoa_to_sheet([["Merged heading", null], [1, 2]]);
    sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
    utils.book_append_sheet(book, sheet, "Merged");
    expect(parseLegacyWorkbook(new Uint8Array(write(book, { type: "array", bookType: "biff8" }))).sheets[0].rows).toEqual([["Merged heading", ""], ["1", "2"]]);
  });
  it("rejects renamed text, corrupt binary and oversized workbooks", () => {
    expect(() => parseLegacyWorkbook(new TextEncoder().encode("hello,world"))).toThrow("not a supported");
    expect(() => parseLegacyWorkbook(Uint8Array.of(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1))).toThrow();
    expect(() => parseLegacyWorkbook(new Uint8Array(MAX_XLS_BYTES + 1))).toThrow("too large");
  });
});
