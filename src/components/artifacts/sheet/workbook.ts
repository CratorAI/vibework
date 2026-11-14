/**
 * Opening and saving sheet files with the IronCalc engine, independent of React.
 *
 * - .xlsx: the engine imports and exports the package itself. Workbooks with
 *   content the engine would drop (charts, pivot tables ...) open read-only;
 *   see xlsxPackage.ts.
 * - .csv/.tsv: parsed here, shown as one sheet; saved back as delimited text
 *   in the original dialect, with untouched cells written byte-for-byte as
 *   they were read.
 *
 * The engine must be initialised before these are called (engine.ts in the
 * app, initSync in tests).
 */

import { Model, getAllTimezones } from "@ironcalc/wasm-xlsx";
import { strFromU8, unzipSync } from "fflate";
import { needsQuotes, parseCsv, quoteField, type CsvDialect, type CsvTable } from "./csv";
import { findUnsupportedContent, finishExport, repairForImport } from "./xlsxPackage";

export type SheetFormat = "xlsx" | "csv";

export interface CsvState {
  table: CsvTable;
  /** Cell content as the engine showed it right after loading, where that differs from the raw field. Key: cellKey(row, col). */
  loadedContent: Map<number, string>;
}

export interface SheetDocument {
  model: Model;
  format: SheetFormat;
  /** Non-empty when the workbook holds things the editor would lose on save: it is then shown read-only. */
  unsupported: string[];
  csv?: CsvState;
}

export interface FileContents {
  text?: string | null;
  base64?: string | null;
}

const LOCALE = "en";
const LANGUAGE = "en";
const COLS = 16385;
const cellKey = (row: number, col: number) => row * COLS + col;

export function formatForName(fileName: string): SheetFormat | null {
  const n = fileName.toLowerCase();
  if (n.endsWith(".xlsx")) return "xlsx";
  if (n.endsWith(".csv") || n.endsWith(".tsv")) return "csv";
  return null;
}

let timezone: string | null = null;
function engineTimezone(): string {
  if (timezone) return timezone;
  let tz = "UTC";
  try {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (local && getAllTimezones().includes(local)) tz = local;
  } catch {
    /* keep UTC */
  }
  timezone = tz;
  return tz;
}

function workbookName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "") || "Workbook";
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

/** A model with no undo history (loading must not be undoable). */
function withoutHistory(model: Model): Model {
  const fresh = Model.fromBytes(model.toBytes(), LANGUAGE);
  model.free();
  return fresh;
}

// ---------------------------------------------------------------------------
// xlsx

function importXlsx(bytes: Uint8Array, name: string): { model: Model; unsupported: string[] } {
  const unsupported = findUnsupportedContent(bytes);
  const attempt = (b: Uint8Array) => Model.fromXlsx(b, name, LOCALE, engineTimezone(), LANGUAGE);
  let model: Model;
  try {
    model = attempt(bytes);
  } catch (first) {
    try {
      model = attempt(repairForImport(bytes, 1));
    } catch {
      try {
        model = attempt(repairForImport(bytes, 2));
        if (unsupported.length === 0) unsupported.push("content this editor cannot read");
      } catch {
        throw first;
      }
    }
  }
  // formulas written without cached values (openpyxl, scripts) show 0 until evaluated
  model.evaluate();
  return { model, unsupported };
}

export function exportXlsx(model: Model): Uint8Array {
  return finishExport(model.toXlsx());
}

// ---------------------------------------------------------------------------
// csv

/**
 * How a raw field is typed into the engine. Most fields go in as typed so
 * numbers, dates and percentages behave as such; fields the engine would
 * change irreversibly are kept as text.
 */
function csvInput(raw: string): string {
  if (raw === "") return "";
  if (raw.startsWith("=") || raw.startsWith("'")) return `'${raw}`;
  if (raw !== raw.trim()) return `'${raw}`;
  if (/^[+-]?0\d+$/.test(raw)) return `'${raw}`; // ids and codes with leading zeros
  if (/^[+-]?\d{16,}$/.test(raw)) return `'${raw}`; // more digits than a double holds
  return raw;
}

function tsvField(v: string): string {
  return /[\t"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function importCsv(text: string, fileName: string): { model: Model; csv: CsvState } {
  const table = parseCsv(text, fileName);
  const draft = new Model(workbookName(fileName), LOCALE, engineTimezone(), LANGUAGE);
  const width = table.rows.reduce((w, r) => Math.max(w, r.length), 0);
  if (table.rows.length > 0 && width > 0) {
    // the engine's TSV reader needs every record to have the same number of fields
    const tsv = table.rows
      .map((row) => {
        const cells = row.map((v) => tsvField(csvInput(v)));
        while (cells.length < width) cells.push("");
        return cells.join("\t");
      })
      .join("\n");
    draft.pauseEvaluation();
    draft.pasteCsvText({ sheet: 0, row: 1, column: 1, width, height: table.rows.length }, tsv);
    draft.resumeEvaluation();
    draft.evaluate();
    // pasting does not grow rows for fields with line breaks; size them as typing would
    table.rows.forEach((row, r) => {
      const lines = row.reduce((n, v) => Math.max(n, v.split(/\r\n|\r|\n/).length), 1);
      if (lines < 2) return;
      const size = draft.getCellStyle(0, r + 1, 1).style.font.sz || 12;
      const height = (lines - 1) * size * 1.5 + 8 + size;
      if (height > draft.getRowHeight(0, r + 1)) draft.setRowsHeight(0, r + 1, r + 1, height);
    });
  }
  const model = withoutHistory(draft);
  model.setSelectedCell(1, 1);
  const loadedContent = new Map<number, string>();
  table.rows.forEach((row, r) => {
    row.forEach((raw, c) => {
      const content = model.getCellContent(0, r + 1, c + 1);
      if (content !== raw) loadedContent.set(cellKey(r + 1, c + 1), content);
    });
  });
  return { model, csv: { table, loadedContent } };
}

/** Rows and columns in use on a sheet, from the exported package's <dimension>. */
function usedRange(model: Model, sheet: number): { rows: number; cols: number } {
  // the engine does not expose a sheet's extent; its xlsx export writes it as <dimension>
  return readDimension(model.toXlsx(), sheet) ?? { rows: 0, cols: 0 };
}

function readDimension(xlsx: Uint8Array, sheet: number): { rows: number; cols: number } | null {
  const target = `xl/worksheets/sheet${sheet + 1}.xml`;
  const files = unzipSync(xlsx, { filter: (f) => f.name === target });
  const data = files[target];
  if (!data) return null;
  const head = strFromU8(data.subarray(0, Math.min(data.length, 4096)), true);
  const m = /<dimension ref="([A-Z]+)?(\d+)?(?::([A-Z]+)(\d+))?"/.exec(head);
  if (!m) return null;
  const colNum = (s: string) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const cols = m[3] ? colNum(m[3]) : m[1] ? colNum(m[1]) : 0;
  const rows = m[4] ? parseInt(m[4], 10) : m[2] ? parseInt(m[2], 10) : 0;
  return { rows, cols };
}

/** Text written to the file for a cell the person changed. */
function csvTextForChangedCell(model: Model, row: number, col: number, content: string): string {
  if (content.startsWith("=")) return model.getFormattedCellValue(0, row, col);
  if (content.startsWith("'")) return content.slice(1);
  if (content === "") return "";
  // numbers keep full precision unless the person gave them a format (dates, %, currency)
  const fmt = model.getCellStyle(0, row, col).style.num_fmt;
  if (fmt && fmt.toLowerCase() !== "general") return model.getFormattedCellValue(0, row, col);
  return content;
}

export function exportCsv(model: Model, csv: CsvState): string {
  const { table, loadedContent } = csv;
  const dialect: CsvDialect = table.dialect;
  const used = usedRange(model, 0);
  const rowCount = Math.max(table.rows.length, used.rows);
  const colCount = used.cols;
  const lines: string[] = [];
  let lastNonEmptyLine = -1;
  for (let r = 1; r <= rowCount; r++) {
    const orig = table.rows[r - 1];
    const quoted = table.quoted[r - 1];
    const fields: string[] = [];
    let lastNonEmpty = -1;
    const width = Math.max(orig?.length ?? 0, colCount);
    for (let c = 1; c <= width; c++) {
      const raw = orig?.[c - 1];
      const content = c <= colCount ? model.getCellContent(0, r, c) : "";
      const atLoad = loadedContent.get(cellKey(r, c)) ?? raw ?? "";
      let text: string;
      let keepQuotes = false;
      if (content === atLoad) {
        text = raw ?? "";
        keepQuotes = quoted?.[c - 1] ?? false;
      } else {
        text = csvTextForChangedCell(model, r, c, content);
      }
      if (text !== "") lastNonEmpty = c - 1;
      fields.push(keepQuotes || needsQuotes(text, dialect.delimiter) ? quoteField(text) : text);
    }
    // keep the record's original field count; drop empty fields the person added past it
    const keep = Math.max(orig?.length ?? 0, lastNonEmpty + 1);
    const line = fields.slice(0, keep).join(dialect.delimiter);
    if (orig || lastNonEmpty >= 0) lastNonEmptyLine = r - 1;
    lines.push(line);
  }
  const out = lines.slice(0, lastNonEmptyLine + 1).join(dialect.lineEnding);
  const tail = dialect.trailingNewline && lastNonEmptyLine >= 0 ? dialect.lineEnding : "";
  return (dialect.bom ? "﻿" : "") + out + tail;
}

// ---------------------------------------------------------------------------

export function openDocument(fileName: string, contents: FileContents): SheetDocument {
  const format = formatForName(fileName);
  if (!format) throw new Error(`Not a spreadsheet file: ${fileName}`);
  if (format === "csv") {
    const text = contents.text ?? (contents.base64 ? new TextDecoder().decode(base64ToBytes(contents.base64)) : "");
    const { model, csv } = importCsv(text, fileName);
    return { model, format, unsupported: [], csv };
  }
  const bytes = contents.base64 ? base64ToBytes(contents.base64) : new Uint8Array(0);
  if (bytes.length === 0) {
    // a new, empty artifact (the panel creates blank sheets as zero-byte files)
    const model = new Model(workbookName(fileName), LOCALE, engineTimezone(), LANGUAGE);
    return { model, format, unsupported: [] };
  }
  const { model, unsupported } = importXlsx(bytes, workbookName(fileName));
  return { model, format, unsupported };
}

/** File contents to write for the current state of the document. */
export function serializeDocument(doc: SheetDocument): { text: string } | { base64: string } {
  if (doc.format === "csv" && doc.csv) return { text: exportCsv(doc.model, doc.csv) };
  return { base64: bytesToBase64(exportXlsx(doc.model)) };
}

/** True when the person changed the workbook since the last call. Selection and scrolling do not count. */
export function takePendingChanges(model: Model): boolean {
  // the engine queues each user change for collaboration; an empty queue encodes to one byte
  return model.flushSendQueue().length > 1;
}

export interface ViewState {
  sheet: number;
  row: number;
  column: number;
  range: [number, number, number, number];
  topRow: number;
  leftColumn: number;
}

export function captureView(model: Model): ViewState {
  const v = model.getSelectedView();
  return { sheet: v.sheet, row: v.row, column: v.column, range: v.range, topRow: v.top_row, leftColumn: v.left_column };
}

export function restoreView(model: Model, view: ViewState): void {
  try {
    const sheets = model.getWorksheetsProperties().length;
    if (view.sheet >= sheets) return;
    model.setSelectedSheet(view.sheet);
    model.setSelectedCell(view.row, view.column);
    const [r1, c1, r2, c2] = view.range;
    model.setSelectedRange(r1, c1, r2, c2);
    model.setTopLeftVisibleCell(view.topRow, view.leftColumn);
  } catch {
    /* a view that no longer fits the reloaded file is not worth failing over */
  }
}
