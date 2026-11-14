/**
 * GFM tables in messages: a rehype step that lays out columns.
 *
 * - A column whose body cells are all numbers (blank cells and dashes aside)
 *   reads like a ledger: header and cells right-aligned, kept on one line. An
 *   alignment written in the Markdown (`|---:|`) always wins.
 * - A column of short cells (names, dates, phone numbers) keeps each cell on
 *   one line at its natural width (`md-short`). Only a column holding long
 *   prose wraps (`md-prose`, its content in a box between a minimum and a
 *   cap), so a wide table scrolls sideways instead of squeezing short cells.
 */

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

/** 1,234 · -3.5 · (120) · $4.2M · 12% · 3x · +0.4 pp is not one. */
const NUMBER =
  /^\(?[-+−–]?\s?[$€£¥₹]?\s?\d[\d,   ]*(?:\.\d+)?\s?(?:%|[kKmMbBxX×]|bn|mn)?\)?$/;
/** Cells that say "no value" and do not decide a column's type. */
const EMPTY = /^(?:[-–—]|n\/?a|N\/?A|—|\?)?$/;

export function isNumericCell(text: string): boolean {
  return NUMBER.test(text.trim());
}

function textOf(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textOf).join("");
}

function elements(node: HastNode, tag: string): HastNode[] {
  return (node.children ?? []).filter((c) => c.type === "element" && c.tagName === tag);
}

function rowsOf(table: HastNode): { head: HastNode[][]; body: HastNode[][] } {
  const cells = (row: HastNode) =>
    (row.children ?? []).filter((c) => c.type === "element" && (c.tagName === "th" || c.tagName === "td"));
  const head = elements(table, "thead").flatMap((s) => elements(s, "tr")).map(cells);
  const body = elements(table, "tbody").flatMap((s) => elements(s, "tr")).map(cells);
  return { head, body };
}

/** Indexes of the columns whose body cells are all numeric. */
export function numericColumns(body: string[][]): Set<number> {
  const columns = Math.max(0, ...body.map((r) => r.length));
  const numeric = new Set<number>();
  for (let c = 0; c < columns; c++) {
    let numbers = 0;
    let other = 0;
    for (const row of body) {
      const text = (row[c] ?? "").trim();
      if (EMPTY.test(text)) continue;
      if (isNumericCell(text)) numbers++;
      else other++;
    }
    if (numbers > 0 && other === 0) numeric.add(c);
  }
  return numeric;
}

function addClass(node: HastNode, name: string) {
  const props = (node.properties ??= {});
  const current = props.className;
  props.className = Array.isArray(current) ? [...current, name] : current ? [String(current), name] : [name];
}

/** Longest cell text (characters) a column may have and still stay on one line. */
export const SHORT_CELL_CHARS = 40;

/** Indexes of the columns with a body cell too long to keep on one line. */
export function proseColumns(body: string[][]): Set<number> {
  const prose = new Set<number>();
  for (const row of body) {
    row.forEach((text, c) => {
      if (text.trim().length > SHORT_CELL_CHARS) prose.add(c);
    });
  }
  return prose;
}

function alignTable(table: HastNode) {
  const { head, body } = rowsOf(table);
  const texts = body.map((row) => row.map(textOf));
  const numeric = numericColumns(texts);
  const prose = proseColumns(texts);
  for (const row of [...head, ...body]) {
    row.forEach((cell, c) => {
      if (numeric.has(c)) {
        const props = (cell.properties ??= {});
        if (!props.align) props.align = "right";
        addClass(cell, "md-num");
      } else if (prose.has(c)) {
        addClass(cell, "md-prose");
        if (cell.tagName === "td") {
          // The cap and minimum live on a box inside the cell: table cells
          // ignore max-width, but their content's width is respected.
          cell.children = [{ type: "element", tagName: "div", properties: { className: ["md-cell"] }, children: cell.children ?? [] }];
        }
      } else {
        addClass(cell, "md-short");
      }
    });
  }
}

function walk(node: HastNode) {
  if (node.type === "element" && node.tagName === "table") {
    alignTable(node);
    return;
  }
  node.children?.forEach(walk);
}

/** Rehype plugin (unified attacher). */
export function rehypeNumericColumns() {
  return (tree: HastNode) => walk(tree);
}

const TABLE_DELIMITER_ROW = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
function cellCount(row: string): number {
  const inner = row.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "");
  return inner.split(/(?<!\\)\|/).length;
}

/**
 * A streaming segment's trailing table, trimmed to what can render without
 * flicker: nothing until the header and delimiter rows are both complete,
 * then whole rows only (the row still arriving waits until it is closed).
 * Returns null when the tail is not a table, so other rules apply.
 */
export function stabilizeStreamingTable(lines: string[]): string[] | null {
  let start = lines.length;
  while (start > 0 && lines[start - 1].trimStart().startsWith("|")) start--;
  if (start === lines.length) return null;
  const header = lines[start];
  const delimiter = lines[start + 1];
  const last = lines.length - 1;
  // Header still arriving, or its delimiter row not yet complete.
  if (last <= start + 1) {
    const ready = last === start + 1 && TABLE_DELIMITER_ROW.test(delimiter.trim())
      && cellCount(delimiter) >= cellCount(header) && delimiter.trim().endsWith("|");
    if (!ready) return lines.slice(0, start);
    return lines;
  }
  if (!TABLE_DELIMITER_ROW.test(delimiter.trim())) {
    // Pipes that never became a table: plain text, all but the arriving line.
    return lines.slice(0, last);
  }
  // A body row counts once it is closed with its last pipe.
  const row = lines[last].trim();
  const closed = row.length > 1 && row.endsWith("|") && !row.endsWith("\\|") && cellCount(row) >= cellCount(header);
  return closed ? lines : lines.slice(0, last);
}
