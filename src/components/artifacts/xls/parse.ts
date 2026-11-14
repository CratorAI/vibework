import { read, utils, set_cptable } from "xlsx";
import * as cptable from "xlsx/dist/cpexcel.full.mjs";

set_cptable(cptable);

export const MAX_XLS_BYTES = 20 * 1024 * 1024;
export const MAX_ROWS = 1000;
export const MAX_COLUMNS = 100;
export const MAX_SHEETS = 50;

export interface LegacySheet {
  name: string;
  hidden: boolean;
  rows: string[][];
  rowCount: number;
  columnCount: number;
}
export interface LegacyWorkbook {
  sheets: LegacySheet[];
  omittedSheets: number;
}

/** Bounded static values only. Never evaluate formulas, links, or macros. */
export function parseLegacyWorkbook(bytes: Uint8Array): LegacyWorkbook {
  if (bytes.byteLength > MAX_XLS_BYTES) throw new Error("This workbook is too large to preview (20 MB maximum). Open it in Excel.");
  // SheetJS also accepts arbitrary text. Reject that here rather than silently
  // displaying a renamed CSV or an HTML error page as a valid Excel workbook.
  const ole = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((v, i) => bytes[i] === v);
  const biff = bytes.length >= 8 && bytes[0] === 9 && [0, 2, 4, 8].includes(bytes[1]);
  if (!ole && !biff) throw new Error("This file is not a supported binary Excel workbook.");
  const workbook = read(bytes, {
    type: "array", sheetRows: MAX_ROWS, cellHTML: false,
    cellFormula: false, bookVBA: false, cellNF: false,
  });
  if (!workbook.SheetNames.length) throw new Error("This workbook contains no worksheets.");
  const sheets = workbook.SheetNames.slice(0, MAX_SHEETS).map((name, index) => {
    const sheet = workbook.Sheets[name];
    const ref = sheet["!fullref"] ?? sheet["!ref"];
    const range = ref ? utils.decode_range(ref) : null;
    const rowCount = range ? range.e.r + 1 : 0;
    const columnCount = range ? range.e.c + 1 : 0;
    const rows: string[][] = [];
    for (let r = 0; r < Math.min(rowCount, MAX_ROWS); r++) {
      const row: string[] = [];
      for (let c = 0; c < Math.min(columnCount, MAX_COLUMNS); c++) {
        const cell = sheet[utils.encode_cell({ r, c })];
        row.push(cell ? utils.format_cell(cell).slice(0, 32767) : "");
      }
      rows.push(row);
    }
    return { name, rows, rowCount, columnCount, hidden: !!workbook.Workbook?.Sheets?.[index]?.Hidden };
  });
  return { sheets, omittedSheets: Math.max(0, workbook.SheetNames.length - MAX_SHEETS) };
}
