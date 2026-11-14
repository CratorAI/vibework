/**
 * Delimited text (CSV/TSV) parsing and writing that remembers the file's
 * dialect, so saving an edited file changes as little as possible on disk:
 * same delimiter, line ending, BOM, trailing newline, and the same quoting for
 * fields that were quoted before.
 */

export interface CsvDialect {
  delimiter: string;
  /** Line break between records (embedded line breaks inside quoted fields are kept as they were) */
  lineEnding: "\r\n" | "\n" | "\r";
  bom: boolean;
  /** Whether the last record was followed by a line break */
  trailingNewline: boolean;
}

export interface CsvTable {
  rows: string[][];
  /** quoted[r][c] is true when that field was written in quotes */
  quoted: boolean[][];
  dialect: CsvDialect;
}

const CANDIDATES = [",", ";", "\t", "|"];

/** Pick the delimiter whose per-line field count is most consistent over the first lines. */
export function detectDelimiter(text: string, fileName = ""): string {
  if (fileName.toLowerCase().endsWith(".tsv")) return "\t";
  const sample = text.slice(0, 64 * 1024);
  let best = ",";
  let bestScore = -1;
  for (const d of CANDIDATES) {
    const counts = countPerLine(sample, d, 20);
    if (counts.length === 0) continue;
    const first = counts[0];
    if (first === 0) continue;
    const consistent = counts.filter((n) => n === first).length / counts.length;
    const score = consistent * 1000 + first;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function countPerLine(text: string, delimiter: string, maxLines: number): number[] {
  const out: number[] = [];
  let inQuotes = false;
  let count = 0;
  for (let i = 0; i < text.length && out.length < maxLines; i++) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === delimiter) count++;
    else if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      out.push(count);
      count = 0;
    }
  }
  // a final line without a line break is only counted when it is complete (we are at the end of the text)
  if (out.length < maxLines && count > 0 && text.length < 64 * 1024) out.push(count);
  return out;
}

export function parseCsv(input: string, fileName = "", delimiterOverride?: string): CsvTable {
  const bom = input.charCodeAt(0) === 0xfeff;
  const text = bom ? input.slice(1) : input;
  const delimiter = delimiterOverride ?? detectDelimiter(text, fileName);

  const rows: string[][] = [];
  const quoted: boolean[][] = [];
  let row: string[] = [];
  let rowQuoted: boolean[] = [];
  let field = "";
  let fieldQuoted = false;
  let lineEnding: CsvDialect["lineEnding"] | null = null;
  let i = 0;
  const n = text.length;
  let atRecordStart = true;

  const endField = () => {
    row.push(field);
    rowQuoted.push(fieldQuoted);
    field = "";
    fieldQuoted = false;
  };
  const endRecord = () => {
    endField();
    rows.push(row);
    quoted.push(rowQuoted);
    row = [];
    rowQuoted = [];
    atRecordStart = true;
  };

  while (i < n) {
    const ch = text[i];
    if (ch === '"' && field === "" && !fieldQuoted) {
      // quoted field: read to the closing quote; "" is an escaped quote
      fieldQuoted = true;
      atRecordStart = false;
      i++;
      let start = i;
      let value = "";
      for (;;) {
        const q = text.indexOf('"', i);
        if (q === -1) {
          value += text.slice(start);
          i = n;
          break;
        }
        if (text[q + 1] === '"') {
          value += text.slice(start, q + 1);
          i = q + 2;
          start = i;
          continue;
        }
        value += text.slice(start, q);
        i = q + 1;
        break;
      }
      field = value;
      // anything between the closing quote and the next delimiter is kept verbatim (lenient)
      while (i < n && text[i] !== delimiter && text[i] !== "\n" && text[i] !== "\r") field += text[i++];
      continue;
    }
    if (ch === delimiter) {
      atRecordStart = false;
      endField();
      i++;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      const eol = ch === "\r" && text[i + 1] === "\n" ? "\r\n" : ch;
      if (lineEnding === null) lineEnding = eol as CsvDialect["lineEnding"];
      endRecord();
      i += eol.length;
      continue;
    }
    atRecordStart = false;
    field += ch;
    i++;
  }
  const trailingNewline = n > 0 && atRecordStart;
  if (!atRecordStart || field !== "" || fieldQuoted) endRecord();

  return {
    rows,
    quoted,
    dialect: { delimiter, lineEnding: lineEnding ?? "\n", bom, trailingNewline },
  };
}

export function needsQuotes(value: string, delimiter: string): boolean {
  if (value === "") return false;
  if (value.includes(delimiter) || value.includes('"') || value.includes("\n") || value.includes("\r")) return true;
  return false;
}

export function quoteField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Serialise rows. `wasQuoted(r, c)` lets unchanged fields keep their original
 * quoting; any field that needs quotes gets them regardless.
 */
export function writeCsv(
  rows: string[][],
  dialect: CsvDialect,
  wasQuoted: (r: number, c: number) => boolean = () => false,
): string {
  const lines = rows.map((row, r) =>
    row
      .map((v, c) => (needsQuotes(v, dialect.delimiter) || wasQuoted(r, c) ? quoteField(v) : v))
      .join(dialect.delimiter),
  );
  let out = lines.join(dialect.lineEnding);
  if (dialect.trailingNewline && rows.length > 0) out += dialect.lineEnding;
  return (dialect.bom ? "﻿" : "") + out;
}
