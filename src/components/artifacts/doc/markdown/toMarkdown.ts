/**
 * ProseMirror node -> Markdown for one block ("fresh" serialization), through
 * mdast and mdast-util-to-markdown. Style attributes on the nodes (bullet,
 * emphasis marker, fence, setext, ...) are honoured; `null` falls back to the
 * document's prevailing style.
 *
 * Mode "paranoid" is the last resort for a block whose normal serialization
 * does not read back identically: every Markdown-significant character in text
 * is escaped and emphasis is written as HTML tags (<em>, <strong>, <s>), which
 * have no flanking rules. The parser reads those tags back as marks.
 */

import { toMarkdown, defaultHandlers, type Options, type State, type Info } from "mdast-util-to-markdown";
import { gfmStrikethroughToMarkdown } from "mdast-util-gfm-strikethrough";
import { gfmTableToMarkdown } from "mdast-util-gfm-table";
import { gfmTaskListItemToMarkdown } from "mdast-util-gfm-task-list-item";
import type { Mark, Node as PMNode } from "prosemirror-model";
import type * as M from "mdast";
import { schema } from "../editor/schema";
import { itemNeedsSpread } from "./fingerprint";
import type { DocStyle } from "./parse";

// Custom node types are passed through to our own handlers.
/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyNode = any;

const ATTENTION = new Set(["emphasis", "strong", "delete", "underline"]);

function markRank(m: Mark): number {
  switch (m.type.name) {
    case "link":
      return 0;
    case "strike":
      return 1;
    case "strong":
      return 2;
    case "em":
      return 3;
    case "underline":
      return 4;
    default:
      return 5;
  }
}

function normalizeLabel(label: string): string {
  return label.replace(/[\t\n\r ]+/g, " ").trim().toLowerCase().toUpperCase();
}

const HTML_FORM: Record<string, string> = { em: "<em>", strong: "<strong>", strike: "<s>" };

function markNode(m: Mark, mode: Mode): AnyNode {
  const blind = mode === "blind";
  const marker = blind ? null : mode === "paranoid" ? HTML_FORM[m.type.name] : m.attrs.marker;
  switch (m.type.name) {
    case "link":
      if (!blind && m.attrs.kind === "reference" && m.attrs.ref) {
        return {
          type: "linkReference",
          identifier: normalizeLabel(m.attrs.ref),
          label: m.attrs.ref,
          referenceType: m.attrs.refType ?? "full",
          children: [],
        };
      }
      return {
        type: "link",
        url: m.attrs.href ?? "",
        title: m.attrs.title ?? null,
        children: [],
        data: blind || mode === "paranoid" ? {} : { kind: m.attrs.kind },
      };
    case "em":
      return { type: "emphasis", children: [], data: { marker } };
    case "strong":
      return { type: "strong", children: [], data: { marker } };
    case "strike":
      return { type: "delete", children: [], data: { marker } };
    case "underline":
      return { type: "underline", children: [] };
    default:
      return { type: "text", value: "" };
  }
}

function leafNode(node: PMNode, blind: boolean): AnyNode {
  switch (node.type.name) {
    case "text":
      return node.marks.some((m) => m.type === schema.marks.code)
        ? { type: "inlineCode", value: node.text }
        : { type: "text", value: node.text };
    case "image":
      if (!blind && node.attrs.ref) {
        return {
          type: "imageReference",
          identifier: normalizeLabel(node.attrs.ref),
          label: node.attrs.ref,
          referenceType: node.attrs.refType ?? "full",
          alt: node.attrs.alt,
        };
      }
      return { type: "image", url: node.attrs.src, title: node.attrs.title ?? null, alt: node.attrs.alt };
    case "hard_break":
      return { type: "break", data: blind ? {} : { marker: node.attrs.marker } };
    case "raw_inline":
      return { type: "html", value: node.attrs.source };
    default:
      return { type: "text", value: node.textContent };
  }
}

export type Mode = "style" | "blind" | "paranoid";

/** Move whitespace at the edges of emphasis-like nodes outside them (`** a**` is not bold) */
function expel(children: AnyNode[]): AnyNode[] {
  const out: AnyNode[] = [];
  for (const child of children) {
    if (!child.children) {
      out.push(child);
      continue;
    }
    child.children = expel(child.children);
    if (!ATTENTION.has(child.type)) {
      out.push(child);
      continue;
    }
    let lead = "";
    let trail = "";
    const kids = child.children;
    // Hard breaks at the edges move out too: a closing marker cannot start a line.
    const before: AnyNode[] = [];
    const after: AnyNode[] = [];
    const edgeBreaks = () => {
      while (kids.length && kids[0].type === "break") before.push(kids.shift());
      while (kids.length && kids[kids.length - 1].type === "break") after.unshift(kids.pop());
    };
    edgeBreaks();
    while (kids.length && kids[0].type === "text") {
      const m = kids[0].value.match(/^\s+/);
      if (!m) break;
      lead += m[0];
      kids[0].value = kids[0].value.slice(m[0].length);
      if (kids[0].value) break;
      kids.shift();
    }
    while (kids.length && kids[kids.length - 1].type === "text") {
      const last = kids[kids.length - 1];
      const m = last.value.match(/\s+$/);
      if (!m) break;
      trail = m[0] + trail;
      last.value = last.value.slice(0, last.value.length - m[0].length);
      if (last.value) break;
      kids.pop();
    }
    if (lead || trail) edgeBreaks();
    out.push(...before);
    if (lead) out.push({ type: "text", value: lead });
    if (kids.length) out.push(child);
    if (trail) out.push({ type: "text", value: trail });
    out.push(...after);
  }
  return out;
}

/** Marks of one kind are one span for writing, even if their remembered markers differ */
function sameMark(a: Mark, b: Mark): boolean {
  return a.type === b.type && (a.type !== schema.marks.link || a.eq(b));
}

function hasMark(m: Mark, set: readonly Mark[]): boolean {
  return set.some((x) => sameMark(m, x));
}

function inlineChildren(parent: PMNode, mode: Mode, trim = false): AnyNode[] {
  const items: PMNode[] = [];
  parent.forEach((c) => items.push(c));
  const root: AnyNode = { children: [] };
  const stack: { mark: Mark; node: AnyNode }[] = [];
  const top = () => (stack.length ? stack[stack.length - 1].node : root);
  const runLength = (m: Mark, from: number) => {
    let k = from;
    while (k < items.length && hasMark(m, items[k].marks)) k++;
    return k - from;
  };
  items.forEach((item, idx) => {
    const marks = item.marks.filter((m) => m.type !== schema.marks.code);
    let keep = 0;
    while (keep < stack.length && hasMark(stack[keep].mark, marks)) keep++;
    stack.length = keep;
    const open = marks.filter((m) => !stack.some((s) => sameMark(s.mark, m)));
    open.sort((a, b) => runLength(b, idx) - runLength(a, idx) || markRank(a) - markRank(b));
    for (const m of open) {
      const node = markNode(m, mode);
      top().children.push(node);
      stack.push({ mark: m, node });
    }
    top().children.push(leafNode(item, mode === "blind"));
  });
  // HTML tags (paranoid mode) keep edge whitespace inside; Markdown markers cannot.
  const out: AnyNode[] = mode === "paranoid" ? root.children : expel(root.children);
  // A hard break at the start or end of a block is not Markdown (a trailing "\\" reads as a backslash).
  while (out.length && out[0].type === "break") out.shift();
  while (out.length && out[out.length - 1].type === "break") out.pop();
  if (trim) trimEdges(out);
  return out;
}

/** Table cells: Markdown trims cell content, so do it before writing */
function trimEdges(nodes: AnyNode[]) {
  let first = nodes[0];
  while (first?.children?.length) first = first.children[0];
  if (first?.type === "text") first.value = first.value.replace(/^\s+/, "");
  let last = nodes[nodes.length - 1];
  while (last?.children?.length) last = last.children[last.children.length - 1];
  if (last?.type === "text") last.value = last.value.replace(/\s+$/, "");
}

function isEmptyParagraph(node: PMNode) {
  return node.type === schema.nodes.paragraph && node.content.size === 0;
}

function blockNode(node: PMNode, mode: Mode): AnyNode {
  const blind = mode === "blind";
  const kids = (keepEmpty = false) => {
    const out: AnyNode[] = [];
    node.forEach((c, _, i) => {
      if (isEmptyParagraph(c) && !(keepEmpty && i === 0 && node.childCount === 1)) return;
      out.push(blockNode(c, mode));
    });
    return out;
  };
  const a = node.attrs;
  switch (node.type.name) {
    case "paragraph":
      return { type: "paragraph", children: inlineChildren(node, mode) };
    case "heading":
      return { type: "heading", depth: a.level, children: inlineChildren(node, mode), data: blind ? {} : { setext: a.setext } };
    case "blockquote":
      return { type: "blockquote", children: kids() };
    case "code_block":
      return {
        type: "code",
        lang: a.lang || null,
        meta: a.lang && a.meta ? a.meta : null,
        value: node.textContent,
        data: blind ? {} : { fence: a.fence },
      };
    case "horizontal_rule":
      return { type: "thematicBreak", data: blind ? {} : { marker: a.marker } };
    case "bullet_list":
      return {
        type: "list",
        ordered: false,
        spread: a.spread,
        children: kids(),
        data: blind ? {} : { bullet: a.bullet, indent: a.indent },
      };
    case "ordered_list":
      return {
        type: "list",
        ordered: true,
        start: a.start,
        spread: a.spread,
        children: kids(),
        data: blind ? {} : { delimiter: a.delimiter, increment: a.increment, indent: a.indent },
      };
    case "list_item": {
      // An item with only an empty paragraph is an empty item ("-"), which the writer
      // knows to keep apart from a paragraph above it.
      const children = kids(true);
      const empty = children.length === 1 && children[0].type === "paragraph" && !children[0].children.length;
      return {
        type: "listItem",
        spread: Boolean(a.spread) || itemNeedsSpread(node),
        checked: a.checked,
        children: empty ? [] : children,
      };
    }
    case "table": {
      // Rows are padded to the widest row so the table stays rectangular.
      let width = 0;
      node.forEach((row) => (width = Math.max(width, row.childCount)));
      const rows: AnyNode[] = [];
      const align: (string | null)[] = [];
      node.forEach((row, _, r) => {
        const cells: AnyNode[] = [];
        for (let c = 0; c < width; c++) {
          const cell = c < row.childCount ? row.child(c) : null;
          if (r === 0) align.push(cell?.attrs.align ?? null);
          cells.push({ type: "tableCell", children: cell ? inlineChildren(cell, mode, true) : [] });
        }
        rows.push({ type: "tableRow", children: cells });
      });
      return { type: "table", align, children: rows };
    }
    case "raw_block":
      return { type: "html", value: a.source };
    default:
      return { type: "paragraph", children: [{ type: "text", value: node.textContent }] };
  }
}

/** Temporarily override serializer options while one node is written */
function withOptions<T>(state: State, patch: Partial<Options>, fn: () => T): T {
  const opts = state.options as Record<string, unknown>;
  const prev: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) prev[k] = opts[k];
  Object.assign(opts, patch);
  try {
    return fn();
  } finally {
    Object.assign(opts, prev);
  }
}

const otherBullet = (b: string) => (b === "*" ? "-" : "*");

/** Escape every character that could start Markdown syntax (paranoid mode) */
function escapeAll(value: string, before: string): string {
  let out = value.replace(/[\\`*_[\]<>~#|!&@]/g, "\\$&");
  out = out.replace(/\b(https?|ftp|mailto):/gi, "$1\\:").replace(/\bwww\./gi, "www\\.");
  const atStart = before === "" || /\n$/.test(before);
  out = out.replace(/(^|\n)([ \t]*)([-+=]|\d+(?=[.)]))/g, (m, nl: string, ws: string, tok: string, offset: number) => {
    if (offset === 0 && !nl && !atStart) return m;
    if (/^\d/.test(tok)) return `${nl}${ws}${tok}\\`;
    return `${nl}${ws}\\${tok}`;
  });
  return out;
}

/** Write a node's children wrapped in an HTML tag pair, e.g. <u>...</u> */
function htmlTag(tag: string, node: AnyNode, state: State, info: Info): string {
  const tracker = state.createTracker(info);
  let value = tracker.move(`<${tag}>`);
  value += tracker.move(state.containerPhrasing(node, { ...tracker.current(), before: value, after: "<" }));
  value += tracker.move(`</${tag}>`);
  return value;
}

const gfmDelete = gfmStrikethroughToMarkdown().handlers!.delete as unknown as (...args: any[]) => string;

const tagOf = (marker: unknown) => (typeof marker === "string" ? marker.match(/^<([a-z]+)>$/i)?.[1] : undefined);

function handlers(style: DocStyle, mode: Mode): Options["handlers"] {
  const h = defaultHandlers as unknown as Record<string, (...args: any[]) => string>;
  const emphasis = (node: AnyNode, parent: AnyNode, state: State, info: Info) => {
    const tag = tagOf(node.data?.marker);
    if (tag) return htmlTag(tag, node, state, info);
    const marker = node.data?.marker === "_" ? "_" : node.data?.marker === "*" ? "*" : style.emphasis;
    return withOptions(state, { emphasis: marker }, () => h.emphasis(node, parent, state, info));
  };
  (emphasis as AnyNode).peek = (h.emphasis as AnyNode).peek;
  const strong = (node: AnyNode, parent: AnyNode, state: State, info: Info) => {
    const tag = tagOf(node.data?.marker);
    if (tag) return htmlTag(tag, node, state, info);
    const marker = node.data?.marker === "_" ? "_" : node.data?.marker === "*" ? "*" : style.strong;
    return withOptions(state, { strong: marker }, () => h.strong(node, parent, state, info));
  };
  (strong as AnyNode).peek = (h.strong as AnyNode).peek;
  const strike = (node: AnyNode, parent: AnyNode, state: State, info: Info) => {
    const tag = tagOf(node.data?.marker);
    if (tag) return htmlTag(tag, node, state, info);
    return gfmDelete(node, parent, state, info);
  };
  (strike as AnyNode).peek = () => "~";
  const link = (node: AnyNode, parent: AnyNode, state: State, info: Info) => {
    if (node.data?.kind === "literal" && node.children.length === 1 && node.children[0].type === "text") {
      // A bare URL (GFM autolink literal) stays bare if it will be read back as the same link.
      const t = node.children[0].value as string;
      const index = state.indexStack[state.indexStack.length - 1];
      const prev = parent?.children?.[index - 1];
      const next = parent?.children?.[index + 1];
      const prevOk = !prev || (prev.type === "text" && /(^|[\s(*_~])$/.test(prev.value));
      const nextOk = !next || (next.type === "text" && /^(\s|[.,:;!?)]*(\s|$))/.test(next.value));
      if (prevOk && nextOk && !node.title && (node.url === t || node.url === `http://${t}` || node.url === `mailto:${t}`))
        return t;
    }
    return h.link(node, parent, state, info);
  };
  (link as AnyNode).peek = (h.link as AnyNode).peek;
  return {
    emphasis,
    strong,
    delete: strike,
    link,
    heading: (node: AnyNode, parent: AnyNode, state: State, info: Info) =>
      withOptions(state, { setext: Boolean(node.data?.setext) }, () => h.heading(node, parent, state, info)),
    code: (node: AnyNode, parent: AnyNode, state: State, info: Info) => {
      const fence = node.data?.fence;
      return withOptions(
        state,
        { fence: fence === "~" ? "~" : fence === "`" ? "`" : style.fence, fences: fence !== "indent" },
        () => h.code(node, parent, state, info),
      );
    },
    thematicBreak: (node: AnyNode, parent: AnyNode, state: State, info: Info) => {
      const marker = node.data?.marker as string | null | undefined;
      if (marker && /^([-*_])(?:[ \t]*\1){2,}$/.test(marker)) return marker;
      return h.thematicBreak(node, parent, state, info);
    },
    break: (node: AnyNode, parent: AnyNode, state: State, info: Info) => {
      const value = h.break(node, parent, state, info);
      const marker = node.data?.marker as string | null | undefined;
      if (value === "\\\n" && marker && /^ {2,}$/.test(marker)) return `${marker}\n`;
      return value;
    },
    list: (node: AnyNode, parent: AnyNode, state: State, info: Info) => {
      const d = node.data ?? {};
      const bullet = d.bullet ?? style.bullet;
      return withOptions(
        state,
        {
          bullet,
          bulletOther: otherBullet(bullet),
          bulletOrdered: d.delimiter ?? style.bulletOrdered,
          incrementListMarker: d.increment !== false,
          listItemIndent: d.indent === "tab" ? "tab" : "one",
        },
        () => h.list(node, parent, state, info),
      );
    },
    ...(mode === "paranoid"
      ? {
          text: (node: AnyNode, _parent: AnyNode, state: State, info: Info) =>
            // Autolinks (<https://...>) take their text literally.
            state.stack.includes("autolink") ? node.value : escapeAll(node.value, info.before),
        }
      : {}),
    underline: (node: AnyNode, _parent: AnyNode, state: State, info: Info) => htmlTag("u", node, state, info),
  } as Options["handlers"];
}

function firstTableStyle(node: PMNode, style: DocStyle) {
  let found: { pipeAlign: boolean; cellPadding: boolean } | null = null;
  if (node.type === schema.nodes.table) found = node.attrs.style;
  else
    node.descendants((d) => {
      if (found) return false;
      if (d.type === schema.nodes.table) found = d.attrs.style;
      return !found;
    });
  const s = found as { pipeAlign: boolean; cellPadding: boolean } | null;
  return {
    tablePipeAlign: s ? s.pipeAlign : style.tablePipeAlign,
    tableCellPadding: s ? s.cellPadding : style.tableCellPadding,
  };
}

/**
 * Serialize one top-level block to Markdown with "\n" line endings and no
 * trailing newline. Empty paragraphs serialize to "".
 */
export function blockToMarkdown(node: PMNode, style: DocStyle, mode: Mode = "style"): string {
  if (isEmptyParagraph(node)) return "";
  if (node.type === schema.nodes.raw_block && mode !== "blind") return node.attrs.source;
  const table = mode === "blind" ? { tablePipeAlign: false, tableCellPadding: true } : firstTableStyle(node, style);
  const tree: AnyNode = { type: "root", children: [blockNode(node, mode)] };
  const out = toMarkdown(tree as M.Root, {
    bullet: style.bullet,
    bulletOther: otherBullet(style.bullet),
    bulletOrdered: style.bulletOrdered,
    emphasis: style.emphasis,
    strong: style.strong,
    fence: style.fence,
    fences: true,
    rule: style.rule,
    ruleRepetition: 3,
    ruleSpaces: false,
    setext: false,
    closeAtx: false,
    listItemIndent: "one",
    incrementListMarker: true,
    resourceLink: false,
    // Casts: sibling packages may resolve their own copy of the mdast-util types.
    extensions: [gfmStrikethroughToMarkdown(), gfmTableToMarkdown(table), gfmTaskListItemToMarkdown()] as unknown as Options[],
    handlers: handlers(style, mode),
  });
  return out.replace(/\n$/, "");
}
