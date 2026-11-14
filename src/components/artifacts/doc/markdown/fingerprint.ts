/**
 * Content fingerprint of a block: what a reader sees, ignoring how the
 * Markdown is written (markers, fences, escapes, mark nesting order, line
 * wrapping whitespace). Used to check that saved Markdown reads back as the
 * document in the editor.
 */

import type { Mark, Node as PMNode } from "prosemirror-model";
import { schema } from "../editor/schema";

const cache = new WeakMap<PMNode, string>();

const ATTENTION = new Set(["em", "strong", "strike", "underline"]);

function markName(m: Mark): string {
  return m.type === schema.marks.link ? `link(${m.attrs.href}|${m.attrs.title ?? ""})` : m.type.name;
}

/**
 * Inline content as [text, marks] runs, normalised like Markdown reads it:
 * whitespace at the edges of a bold/italic/strike/underline span is outside
 * the span, mark nesting order and remembered markers do not matter, line
 * wrapping whitespace and the block's leading/trailing whitespace are dropped.
 */
function inlineKey(node: PMNode): unknown[] {
  // One entry per character (atoms count as one non-space character).
  const chars: string[] = [];
  const marks: Set<string>[] = [];
  const BR = "\u0001BR";
  node.forEach((child) => {
    let names = child.marks.map(markName);
    if (!child.isText) names = names.filter((n) => n !== "code");
    if (child.isText) {
      const code = names.includes("code");
      for (const ch of child.text!) {
        // Line endings in code spans read back as spaces.
        chars.push(code && ch === "\n" ? " " : ch);
        marks.push(new Set(names));
      }
      return;
    }
    // Marks on a hard break are invisible.
    if (child.type === schema.nodes.hard_break) names = [];
    let piece: string;
    if (child.type === schema.nodes.hard_break) piece = BR;
    else if (child.type === schema.nodes.image)
      piece = `\u0001IMG(${child.attrs.src}|${child.attrs.alt}|${child.attrs.title ?? ""})`;
    else if (child.type === schema.nodes.raw_inline) piece = `\u0001RAW(${child.attrs.source})`;
    else piece = child.textContent;
    chars.push(piece);
    marks.push(new Set(names));
  });
  const ws = (c: string) => /^\s$/.test(c);
  for (const name of ATTENTION) {
    let i = 0;
    while (i < chars.length) {
      if (!marks[i].has(name)) {
        i++;
        continue;
      }
      let j = i;
      while (j < chars.length && marks[j].has(name)) j++;
      for (let k = i; k < j && ws(chars[k]); k++) marks[k].delete(name);
      for (let k = j - 1; k >= i && ws(chars[k]); k--) marks[k].delete(name);
      i = j;
    }
  }
  // Leading/trailing whitespace and breaks of a paragraph, heading or cell are not kept by Markdown,
  // and spaces next to a hard break are part of its syntax.
  const edge = (c: string) => ws(c) || c === BR;
  let a = 0;
  let b = chars.length;
  while (a < b && edge(chars[a])) a++;
  while (b > a && edge(chars[b - 1])) b--;
  const keep = new Array<boolean>(chars.length).fill(true);
  for (let k = a; k < b; k++) {
    if (chars[k] !== BR) continue;
    for (let x = k - 1; x >= a && (chars[x] === " " || chars[x] === "\t"); x--) keep[x] = false;
    for (let x = k + 1; x < b && (chars[x] === " " || chars[x] === "\t"); x++) keep[x] = false;
  }
  const runs: [string, string][] = [];
  for (let k = a; k < b; k++) {
    if (!keep[k]) continue;
    const key = [...marks[k]].sort().join(",");
    const last = runs[runs.length - 1];
    if (last && last[1] === key) last[0] += chars[k];
    else runs.push([chars[k], key]);
  }
  for (const r of runs) r[0] = r[0].replace(/[ \t]*\n[ \t]*/g, "\n");
  return runs;
}

function isEmptyParagraph(node: PMNode) {
  return node.type === schema.nodes.paragraph && node.content.size === 0;
}

function isEmptyItem(item: PMNode | null | undefined): boolean {
  if (!item) return false;
  let empty = true;
  item.forEach((c) => {
    if (!isEmptyParagraph(c)) empty = false;
  });
  return empty;
}

/**
 * Whether a list item can only be written loose (with blank lines between its
 * children): two paragraphs in a row, or a paragraph followed by a list that
 * would otherwise be read as part of it (an empty first item, or an ordered
 * list not starting at 1).
 */
export function itemNeedsSpread(item: PMNode): boolean {
  let prevParagraph = false;
  let needs = false;
  item.forEach((child) => {
    if (isEmptyParagraph(child)) return;
    const isP = child.type === schema.nodes.paragraph;
    if (prevParagraph) {
      if (isP) needs = true;
      if (child.type === schema.nodes.ordered_list && child.attrs.start !== 1) needs = true;
      if ((child.type === schema.nodes.ordered_list || child.type === schema.nodes.bullet_list) && isEmptyItem(child.firstChild))
        needs = true;
    }
    prevParagraph = isP;
  });
  return needs;
}

function key(node: PMNode): unknown {
  const t = node.type;
  const kids = () => {
    const out: unknown[] = [];
    node.forEach((c) => {
      if (!isEmptyParagraph(c)) out.push(key(c));
    });
    return out;
  };
  switch (t.name) {
    case "paragraph":
      return ["p", inlineKey(node)];
    case "heading":
      return ["h", node.attrs.level, inlineKey(node)];
    case "blockquote":
      return ["q", kids()];
    case "code_block":
      return ["code", node.attrs.lang || "", node.attrs.lang ? node.attrs.meta || "" : "", node.textContent.replace(/\n+$/, "")];
    case "horizontal_rule":
      return ["hr"];
    case "bullet_list":
    case "ordered_list":
      return [
        t.name === "bullet_list" ? "ul" : `ol${node.attrs.start}`,
        // A list is loose if it says so or if any item must be loose
        node.attrs.spread,
        kids(),
      ];
    case "list_item":
      // An empty item cannot be a task item in Markdown.
      return [
        "li",
        isEmptyItem(node) ? null : node.attrs.checked,
        Boolean(node.attrs.spread) || itemNeedsSpread(node),
        kids(),
      ];
    case "table": {
      let width = 0;
      node.forEach((row) => (width = Math.max(width, row.childCount)));
      const rows: unknown[] = [];
      const align: unknown[] = [];
      node.forEach((row, _, r) => {
        const cells: unknown[] = [];
        for (let c = 0; c < width; c++) {
          const cell = c < row.childCount ? row.child(c) : null;
          if (r === 0) align.push(cell?.attrs.align ?? null);
          cells.push(cell ? inlineKey(cell) : []);
        }
        rows.push(cells);
      });
      return ["table", align, rows];
    }
    case "raw_block":
      return ["raw", String(node.attrs.source).replace(/\s+$/, "")];
    default:
      return [t.name, node.textContent];
  }
}

export function fingerprint(node: PMNode): string {
  let s = cache.get(node);
  if (s === undefined) {
    s = JSON.stringify(key(node));
    cache.set(node, s);
  }
  return s;
}
