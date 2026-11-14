/**
 * `.slides.md` parser. Keeps the character range of every slide, separator
 * and editable text so edits can be written back as minimal source changes.
 *
 * Format summary (the skill's SKILL.md is the full reference):
 *   optional front matter between `---` lines (title, theme, accent, footer)
 *   slides separated by a line containing only `---`
 *   `<!-- layout: chart, chart: line, unit: £m -->` directive per slide
 *   `# Headline`, paragraphs, `- lists`, `> quotes`, `| tables |`, `![alt](img.jpg)`
 *   a line `Notes:` starts the speaker notes (rest of the slide)
 */

import { parseInline, type EscapeContext, type Run } from "./inline";

export const LAYOUTS = [
  "title",
  "section",
  "statement",
  "bullets",
  "split",
  "image",
  "stats",
  "chart",
  "table",
  "closing",
] as const;
export type Layout = (typeof LAYOUTS)[number];

const LAYOUT_ALIASES: Record<string, Layout> = {
  quote: "statement",
  "two-column": "split",
  "image-left": "split",
  "image-right": "split",
  "text-image": "split",
  "full-image": "image",
  "full-bleed": "image",
  photo: "image",
  stat: "stats",
  numbers: "stats",
  "big-number": "stats",
  kpi: "stats",
  end: "closing",
  divider: "section",
  cover: "title",
  list: "bullets",
};

export interface Range {
  start: number;
  end: number;
}

/** An editable piece of text: its range in the source and its parsed runs. */
export interface Field extends Range {
  ctx: EscapeContext;
}

export interface TextRef {
  field: number;
  raw: string;
  runs: Run[];
}

export type Block =
  | { type: "heading"; level: number; text: TextRef }
  | { type: "paragraph"; text: TextRef; source: boolean }
  | { type: "list"; ordered: boolean; items: { text: TextRef; level: number; value?: TextRef; label?: TextRef }[] }
  | { type: "quote"; text: TextRef; attribution?: TextRef }
  | { type: "table"; header: TextRef[]; rows: TextRef[][]; align: ("left" | "right" | "center" | null)[] }
  | { type: "image"; alt: string; src: string; title?: string };

export interface Slide {
  index: number;
  /** The slide's chunk between separators (including surrounding blank lines) */
  range: Range;
  /** Separator line (with its newline) after this slide, if any */
  sepAfter?: Range;
  /** Separator line before this slide, if any */
  sepBefore?: Range;
  directive: Record<string, string>;
  layout: Layout;
  layoutExplicit: boolean;
  blocks: Block[];
  notes: string;
  /** From the `Notes:` line to the end of the notes text */
  notesRange?: Range;
  fields: Field[];
  warnings: string[];
}

export interface Deck {
  source: string;
  meta: Record<string, string>;
  /** Whole front matter block including both `---` lines and the newline after */
  frontMatter?: Range;
  /** Ranges of `key: value` lines in the front matter, by key */
  metaLines: Record<string, Range>;
  slides: Slide[];
  warnings: string[];
}

interface Line {
  text: string;
  start: number;
  /** End of the text, before the newline */
  end: number;
  /** After the newline */
  next: number;
}

function splitLines(src: string, from = 0, to = src.length): Line[] {
  const lines: Line[] = [];
  let pos = from;
  while (pos < to) {
    let nl = src.indexOf("\n", pos);
    if (nl === -1 || nl >= to) nl = to;
    let end = nl;
    if (end > pos && src[end - 1] === "\r") end--;
    lines.push({ text: src.slice(pos, end), start: pos, end, next: Math.min(nl + 1, to) });
    if (nl >= to) break;
    pos = nl + 1;
  }
  return lines;
}

const SEP = /^---\s*$/;
const DIRECTIVE = /^\s*<!--([\s\S]*?)-->\s*$/;
const NOTES = /^notes:\s*(.*)$/i;
const HEADING = /^(#{1,6})(\s+)(.*)$/;
const ITEM = /^(\s*)([-*+]|\d{1,3}[.)])(\s+)(.*)$/;
const IMAGE = /^\s*!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"([^"]*)")?\s*\)\s*$/;
const TABLE_DELIM = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
const ATTRIBUTION = /^(\s*(?:—|–|--|-)\s+)(.*)$/;

/** Parse `key: value` pairs separated by commas or semicolons; values may be quoted. */
export function parseDirective(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /\s*([A-Za-z][\w-]*)\s*:\s*("(?:[^"\\]|\\.)*"|'[^']*'|[^,;]*)\s*[,;]?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m[0] === "") {
      re.lastIndex++;
      continue;
    }
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1).replace(/\\(.)/g, "$1");
    }
    out[m[1].toLowerCase()] = v;
  }
  return out;
}

function unquote(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'")))) {
    try {
      return t[0] === '"' ? JSON.parse(t) : t.slice(1, -1);
    } catch {
      return t.slice(1, -1);
    }
  }
  return t;
}

export function normalizeLayout(v: string | undefined): Layout | null {
  if (!v) return null;
  const k = v.trim().toLowerCase();
  if ((LAYOUTS as readonly string[]).includes(k)) return k as Layout;
  return LAYOUT_ALIASES[k] ?? null;
}

/** Split a table row into trimmed cell ranges (absolute offsets). */
function tableCells(line: Line): Range[] {
  const t = line.text;
  const cells: Range[] = [];
  let k = 0;
  while (k < t.length && t[k] === " ") k++;
  if (t[k] === "|") k++;
  let cellStart = k;
  for (; k <= t.length; k++) {
    if (k === t.length || (t[k] === "|" && t[k - 1] !== "\\")) {
      let a = cellStart;
      let b = k;
      while (a < b && /\s/.test(t[a])) a++;
      while (b > a && /\s/.test(t[b - 1])) b--;
      const isTrailing = k === t.length && t.slice(cellStart).trim() === "";
      if (!isTrailing) cells.push({ start: line.start + a, end: line.start + b });
      cellStart = k + 1;
    }
  }
  return cells;
}

export function parseDeck(source: string): Deck {
  const deck: Deck = { source, meta: {}, metaLines: {}, slides: [], warnings: [] };
  const all = splitLines(source);
  let li = 0;

  // Front matter
  if (all.length && SEP.test(all[0].text)) {
    let close = -1;
    for (let k = 1; k < all.length; k++) {
      if (SEP.test(all[k].text)) {
        close = k;
        break;
      }
    }
    const looksLikeMeta =
      close > 0 && all.slice(1, close).every((l) => l.text.trim() === "" || /^\s*#/.test(l.text) || /^[A-Za-z][\w-]*\s*:/.test(l.text));
    if (looksLikeMeta) {
      for (const l of all.slice(1, close)) {
        const m = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(l.text);
        if (m) {
          const key = m[1].toLowerCase();
          deck.meta[key] = unquote(m[2]);
          deck.metaLines[key] = { start: l.start, end: l.end };
        }
      }
      deck.frontMatter = { start: 0, end: all[close].next };
      li = close + 1;
    }
  }

  // Slide chunks
  const bodyStart = deck.frontMatter ? deck.frontMatter.end : 0;
  const chunks: { range: Range; sepBefore?: Range; sepAfter?: Range }[] = [];
  let chunkStart = bodyStart;
  let prevSep: Range | undefined;
  for (; li < all.length; li++) {
    const l = all[li];
    if (SEP.test(l.text)) {
      const sep = { start: l.start, end: l.next };
      chunks.push({ range: { start: chunkStart, end: l.start }, sepBefore: prevSep, sepAfter: sep });
      prevSep = sep;
      chunkStart = l.next;
    }
  }
  chunks.push({ range: { start: chunkStart, end: source.length }, sepBefore: prevSep });

  for (const c of chunks) {
    if (source.slice(c.range.start, c.range.end).trim() === "") continue;
    const slide = parseSlide(source, c.range, deck.slides.length);
    slide.sepBefore = c.sepBefore;
    slide.sepAfter = c.sepAfter;
    deck.slides.push(slide);
  }

  // Layout inference needs position (first slide defaults to title)
  for (const s of deck.slides) {
    if (!s.layoutExplicit) s.layout = inferLayout(s, s.index === 0);
    validate(s);
  }
  if (deck.meta.theme === undefined) deck.warnings.push("No theme in front matter; using the default.");
  return deck;
}

function parseSlide(source: string, range: Range, index: number): Slide {
  const slide: Slide = {
    index,
    range,
    directive: {},
    layout: "bullets",
    layoutExplicit: false,
    blocks: [],
    notes: "",
    fields: [],
    warnings: [],
  };
  const lines = splitLines(source, range.start, range.end);
  const field = (start: number, end: number, ctx: EscapeContext): TextRef => {
    const raw = source.slice(start, end);
    slide.fields.push({ start, end, ctx });
    return { field: slide.fields.length - 1, raw, runs: parseInline(stripQuoteMarkers(raw)) };
  };

  let k = 0;
  const blank = (l: Line) => l.text.trim() === "";
  while (k < lines.length) {
    const l = lines[k];
    const t = l.text;
    if (blank(l)) {
      k++;
      continue;
    }

    const notes = NOTES.exec(t.trim());
    if (notes && /^\s*notes:/i.test(t)) {
      let last = lines.length - 1;
      while (last > k && blank(lines[last])) last--;
      slide.notesRange = { start: l.start, end: lines[last].end };
      const firstRest = notes[1];
      const rest = lines.slice(k + 1, last + 1).map((x) => x.text);
      slide.notes = [firstRest, ...rest].join("\n").replace(/^\n+/, "").trimEnd();
      break;
    }

    const dir = DIRECTIVE.exec(t);
    if (dir) {
      const d = parseDirective(dir[1]);
      for (const [key, v] of Object.entries(d)) if (!(key in slide.directive)) slide.directive[key] = v;
      k++;
      continue;
    }

    const h = HEADING.exec(t);
    if (h) {
      const start = l.start + h[1].length + h[2].length;
      const end = l.start + t.replace(/\s+#+\s*$/, "").trimEnd().length;
      slide.blocks.push({ type: "heading", level: h[1].length, text: field(start, Math.max(start, end), "heading") });
      k++;
      continue;
    }

    const img = IMAGE.exec(t);
    if (img) {
      slide.blocks.push({ type: "image", alt: img[1], src: img[2], title: img[3] });
      k++;
      continue;
    }

    if (t.trimStart().startsWith("|") && k + 1 < lines.length && TABLE_DELIM.test(lines[k + 1].text) && lines[k + 1].text.includes("-")) {
      const headerCells = tableCells(l);
      const delimCells = lines[k + 1].text.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
      const align = delimCells.map((c) => {
        const s = c.trim();
        if (s.startsWith(":") && s.endsWith(":")) return "center" as const;
        if (s.endsWith(":")) return "right" as const;
        if (s.startsWith(":")) return "left" as const;
        return null;
      });
      const header = headerCells.map((r) => field(r.start, r.end, "cell"));
      const rows: TextRef[][] = [];
      k += 2;
      while (k < lines.length && lines[k].text.trimStart().startsWith("|")) {
        rows.push(tableCells(lines[k]).map((r) => field(r.start, r.end, "cell")));
        k++;
      }
      slide.blocks.push({ type: "table", header, rows, align });
      continue;
    }

    if (/^\s*>/.test(t)) {
      let j = k;
      while (j < lines.length && /^\s*>/.test(lines[j].text)) j++;
      const qLines = lines.slice(k, j);
      // attribution inside the quote (`> — Name`) or on the line after it (`— Name`)
      let attribution: TextRef | undefined;
      let bodyLines = qLines;
      const lastQ = qLines[qLines.length - 1];
      const lastBody = lastQ.text.replace(/^\s*>\s?/, "");
      const inAttr = qLines.length > 1 ? ATTRIBUTION.exec(lastBody) : null;
      if (inAttr && !/^\s*-\s/.test(lastBody)) {
        const off = lastQ.text.length - lastBody.length + inAttr[1].length;
        attribution = field(lastQ.start + off, lastQ.start + lastQ.text.trimEnd().length, "block");
        bodyLines = qLines.slice(0, -1);
      } else if (j < lines.length) {
        const after = ATTRIBUTION.exec(lines[j].text);
        if (after && !/^\s*-\s/.test(lines[j].text)) {
          attribution = field(lines[j].start + after[1].length, lines[j].start + lines[j].text.trimEnd().length, "block");
          j++;
        }
      }
      while (bodyLines.length > 1 && bodyLines[bodyLines.length - 1].text.replace(/^\s*>/, "").trim() === "") bodyLines = bodyLines.slice(0, -1);
      const first = bodyLines[0];
      const firstOff = /^\s*>\s?/.exec(first.text)![0].length;
      const lastB = bodyLines[bodyLines.length - 1];
      const text = field(first.start + firstOff, lastB.start + lastB.text.trimEnd().length, "block");
      slide.blocks.push({ type: "quote", text, attribution });
      k = j;
      continue;
    }

    const item = ITEM.exec(t);
    if (item) {
      const ordered = /\d/.test(item[2]);
      const items: Extract<Block, { type: "list" }>["items"] = [];
      const baseIndent = item[1].length;
      while (k < lines.length) {
        const m = ITEM.exec(lines[k].text);
        if (!m) break;
        const start = lines[k].start + m[1].length + m[2].length + m[3].length;
        let endLine = lines[k];
        let j = k + 1;
        while (j < lines.length && !blank(lines[j]) && !ITEM.exec(lines[j].text) && /^\s{2,}\S/.test(lines[j].text) && !NOTES.test(lines[j].text.trim())) {
          endLine = lines[j];
          j++;
        }
        const end = endLine.start + endLine.text.trimEnd().length;
        const text = field(start, end, "item");
        const entry: (typeof items)[number] = { text, level: m[1].length > baseIndent ? 1 : 0 };
        // stats: `**value** label` (value may also be the first word)
        const raw = source.slice(start, end);
        const bold = /^(\*\*|__)(.+?)\1\s*/.exec(raw);
        if (bold) {
          entry.value = field(start + 2, start + 2 + bold[2].length, "item");
          if (raw.length > bold[0].length) entry.label = field(start + bold[0].length, end, "item");
        } else {
          const word = /^(\S+)\s*/.exec(raw);
          if (word) {
            entry.value = field(start, start + word[1].length, "item");
            if (raw.length > word[0].length) entry.label = field(start + word[0].length, end, "item");
          }
        }
        items.push(entry);
        k = j;
        // allow a single blank line between items of the same list
        if (k + 1 < lines.length && blank(lines[k]) && ITEM.exec(lines[k + 1].text)) k++;
      }
      slide.blocks.push({ type: "list", ordered, items });
      continue;
    }

    // paragraph: until blank line or another block starts
    let j = k + 1;
    while (j < lines.length) {
      const n = lines[j].text;
      if (blank(lines[j]) || HEADING.test(n) || ITEM.test(n) || /^\s*>/.test(n) || IMAGE.test(n) || DIRECTIVE.test(n) || /^\s*notes:/i.test(n) || n.trimStart().startsWith("|")) break;
      j++;
    }
    const lastP = lines[j - 1];
    const startP = l.start + (t.length - t.trimStart().length);
    const text = field(startP, lastP.start + lastP.text.trimEnd().length, "block");
    slide.blocks.push({ type: "paragraph", text, source: /^sources?\s*:/i.test(text.raw.trim()) });
    k = j;
  }

  const explicit = normalizeLayout(slide.directive.layout);
  if (slide.directive.layout && !explicit) slide.warnings.push(`Unknown layout "${slide.directive.layout}"; choosing one from the content.`);
  if (explicit) {
    slide.layout = explicit;
    slide.layoutExplicit = true;
  }
  return slide;
}

function stripQuoteMarkers(raw: string): string {
  return raw.includes("\n") ? raw.replace(/\n\s*>\s?/g, "\n") : raw;
}

function inferLayout(s: Slide, first: boolean): Layout {
  const has = (t: Block["type"]) => s.blocks.some((b) => b.type === t);
  const content = s.blocks.filter((b) => !(b.type === "paragraph" && b.source));
  if (first) return "title";
  if (has("table")) return s.directive.chart ? "chart" : "table";
  if (has("image")) {
    const text = content.filter((b) => b.type !== "image" && b.type !== "heading");
    return text.length ? "split" : "image";
  }
  if (has("quote")) return "statement";
  if (has("list")) return "bullets";
  const paras = content.filter((b) => b.type === "paragraph").length;
  if (has("heading") && paras <= 1) return "statement";
  return "bullets";
}

function validate(s: Slide) {
  const w = s.warnings;
  const heading = s.blocks.find((b) => b.type === "heading") as Extract<Block, { type: "heading" }> | undefined;
  const lists = s.blocks.filter((b) => b.type === "list") as Extract<Block, { type: "list" }>[];
  const items = lists.reduce((n, l) => n + l.items.length, 0);
  if (heading && heading.text.raw.length > 90) w.push(`Headline is ${heading.text.raw.length} characters; keep it under 90.`);
  if (s.layout === "bullets" && items > 6) w.push(`${items} bullets; keep to 5 or fewer and move detail to the notes.`);
  if (s.layout === "stats" && (items < 1 || items > 4)) w.push(`Stats slides take 1 to 4 items; this one has ${items}.`);
  if (s.layout === "chart" && !s.blocks.some((b) => b.type === "table")) w.push("Chart slide has no data table.");
  if ((s.layout === "split" || s.layout === "image") && !s.blocks.some((b) => b.type === "image")) w.push(`${s.layout} slide has no image.`);
  if (s.layout === "table") {
    const t = s.blocks.find((b) => b.type === "table") as Extract<Block, { type: "table" }> | undefined;
    if (t && t.rows.length > 8) w.push(`Table has ${t.rows.length} rows; keep to 8 or fewer.`);
  }
}

/** Parse a number from a table cell: 1,234.5 · £12m · 45% · (3.2) · −4 */
export function parseNumber(raw: string): number | null {
  let s = raw.replace(/\*\*|__|==|`/g, "").trim();
  if (!s || s === "-" || s === "—" || s === "–" || /^n\/?a$/i.test(s)) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[−–]/g, "-").replace(/(\d)[,_'\u2009\u202f ](?=\d{3}(?!\d))/g, "$1");
  const m = /^([^\d\s.-]{0,4})\s?(-?\d*\.?\d+(?:e[+-]?\d+)?)\s*([a-z%×]*)$/i.exec(s);
  if (!m) return null;
  const v = parseFloat(m[2]);
  if (!isFinite(v)) return null;
  // suffixes (%, m, bn, x, pp) are display-only: charts plot the number as written
  return neg ? -v : v;
}

/** Find the slide containing a source offset (for "go to the slide the agent just changed"). */
export function slideAt(deck: Deck, offset: number): number {
  for (const s of deck.slides) if (offset >= s.range.start && offset <= s.range.end) return s.index;
  return Math.max(0, deck.slides.length - 1);
}
