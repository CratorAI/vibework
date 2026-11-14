/**
 * Markdown -> ProseMirror, keeping a source map for lossless saving.
 *
 * The file is parsed with micromark/mdast (GFM + front matter + `$$` math).
 * Every top-level mdast block becomes exactly one top-level ProseMirror node,
 * and the exact original bytes of that block, and of the whitespace between
 * blocks, are remembered in a `SourceMap`. The serializer writes unchanged
 * blocks back from those bytes, so a file that is opened and saved without
 * edits is byte-identical, and an edit only rewrites the blocks it touched.
 *
 * A top-level block the editor cannot model (anything that fails to convert,
 * or produces an invalid node) becomes a `raw_block` holding its source.
 */

import { fromMarkdown } from "mdast-util-from-markdown";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { frontmatter } from "micromark-extension-frontmatter";
import { frontmatterFromMarkdown } from "mdast-util-frontmatter";
import { math } from "micromark-extension-math";
import { mathFromMarkdown } from "mdast-util-math";
import type { Mark, Node as PMNode } from "prosemirror-model";
import type * as M from "mdast";
import { schema } from "../editor/schema";

/** The prevailing style of the file, used for content that did not come from it */
export interface DocStyle {
  bullet: "-" | "*" | "+";
  bulletOrdered: "." | ")";
  emphasis: "*" | "_";
  strong: "*" | "_";
  fence: "`" | "~";
  rule: "-" | "*" | "_";
  tablePipeAlign: boolean;
  tableCellPadding: boolean;
}

export interface SourceBlock {
  /** The top-level node as it is (or was) in the editor */
  node: PMNode;
  /** Exact bytes of the block in the file (original line endings) */
  text: string;
}

export interface SourceMap {
  blocks: SourceBlock[];
  /** gaps[i] precedes blocks[i]; gaps[blocks.length] trails the last block. Length is blocks.length + 1. */
  gaps: string[];
  /** Line ending used for newly written text */
  eol: string;
  /** File started with a UTF-8 byte order mark */
  bom: boolean;
  style: DocStyle;
  /** Source of link and footnote definitions, appended when re-parsing a single block */
  definitions: string;
}

export interface ParsedDoc {
  doc: PMNode;
  map: SourceMap;
}

class Unsupported extends Error {}

const FRONTMATTER = ["yaml", "toml"] as const;

type FromMarkdownExtension = NonNullable<NonNullable<Parameters<typeof fromMarkdown>[1]>["mdastExtensions"]>[number];

export function parseMdast(text: string): M.Root {
  return fromMarkdown(text, {
    extensions: [gfm(), frontmatter([...FRONTMATTER]), math({ singleDollarTextMath: false })],
    // Casts: sibling packages may resolve their own copy of the mdast-util types.
    mdastExtensions: [
      gfmFromMarkdown() as unknown as FromMarkdownExtension,
      frontmatterFromMarkdown([...FRONTMATTER]) as unknown as FromMarkdownExtension,
      mathFromMarkdown() as unknown as FromMarkdownExtension,
    ],
  });
}

/** Line endings: parse on LF-normalised text, but slice preserved bytes from the original */
function normalizeEol(text: string) {
  const crlf: number[] = []; // normalised offsets of the "\n" of each collapsed "\r\n"
  let lf = 0;
  let cr = 0;
  let removed = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 13) {
      if (text.charCodeAt(i + 1) === 10) {
        crlf.push(i + 1 - ++removed);
        i++;
      } else cr++;
    } else if (c === 10) lf++;
  }
  const norm = crlf.length || cr ? text.replace(/\r\n?/g, "\n") : text;
  const eol = crlf.length > lf && crlf.length >= cr ? "\r\n" : cr > lf ? "\r" : "\n";
  /** Original offset for a normalised offset */
  const toOrig = (k: number) => {
    let lo = 0;
    let hi = crlf.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (crlf[mid] < k) lo = mid + 1;
      else hi = mid;
    }
    return k + lo;
  };
  return { norm, eol, toOrig };
}

function start(node: M.Node): number {
  return node.position?.start.offset ?? 0;
}
function end(node: M.Node): number {
  return node.position?.end.offset ?? 0;
}

type Defs = Map<string, { url: string; title: string | null }>;

class Converter {
  constructor(
    private src: string,
    private defs: Defs,
  ) {}

  private slice(node: M.Node) {
    return this.src.slice(start(node), end(node));
  }

  block(node: M.RootContent, top: boolean): PMNode {
    const n = schema.nodes;
    switch (node.type) {
      case "paragraph":
        return n.paragraph.createChecked(null, this.inline(node.children, []));
      case "heading":
        return n.heading.createChecked(
          { level: node.depth, setext: this.src[start(node)] !== "#" },
          this.inline(node.children, []),
        );
      case "thematicBreak":
        return n.horizontal_rule.create({ marker: this.slice(node).trim() });
      case "blockquote":
        return n.blockquote.createChecked(
          null,
          node.children.length ? node.children.map((c) => this.block(c, false)) : [n.paragraph.create()],
        );
      case "list":
        return this.list(node);
      case "code": {
        const c = this.src[start(node)];
        return n.code_block.createChecked(
          { lang: node.lang ?? "", meta: node.meta ?? "", fence: c === "`" ? "`" : c === "~" ? "~" : "indent" },
          node.value ? schema.text(node.value) : null,
        );
      }
      case "table":
        return this.table(node);
      case "html":
        return n.raw_block.create({ kind: "html", source: top ? this.slice(node) : node.value });
      default:
        if (!top) throw new Unsupported(node.type);
        return n.raw_block.create({ kind: rawKind(node.type), source: this.slice(node) });
    }
  }

  private list(node: M.List): PMNode {
    const n = schema.nodes;
    const items = node.children.map((item) => {
      // An item must start with a paragraph in the editor; an empty one is not written.
      const content = item.children.map((c) => this.block(c, false));
      if (!content.length || content[0].type !== n.paragraph) content.unshift(n.paragraph.create());
      return n.list_item.createChecked({ checked: item.checked ?? null, spread: Boolean(item.spread) }, content);
    });
    const first = node.children[0];
    const head = first ? this.src.slice(start(first), start(first) + 12) : "";
    const indent = first ? this.indentStyle(first) : null;
    if (node.ordered) {
      const m = head.match(/^(\d+)([.)])/);
      let increment = true;
      if (node.children.length > 1) {
        const second = this.src.slice(start(node.children[1]), start(node.children[1]) + 12).match(/^(\d+)/);
        if (second && Number(second[1]) === (node.start ?? 1)) increment = false;
      }
      return n.ordered_list.createChecked(
        {
          start: node.start ?? 1,
          delimiter: m ? m[2] : ".",
          increment,
          spread: Boolean(node.spread),
          indent,
        },
        items,
      );
    }
    const b = head[0];
    return n.bullet_list.createChecked(
      { bullet: b === "*" || b === "+" || b === "-" ? b : "-", spread: Boolean(node.spread), indent },
      items,
    );
  }

  /** "one" when content follows the marker after one space, "tab" when it is padded to a tab stop */
  private indentStyle(item: M.ListItem): "one" | "tab" {
    const line = this.src.slice(start(item), this.src.indexOf("\n", start(item)) >>> 0);
    const m = line.match(/^(\d+[.)]|[-*+])( +)\S/);
    if (!m) return "one";
    const width = m[1].length + m[2].length;
    return m[2].length > 1 && width % 4 === 0 ? "tab" : "one";
  }

  private table(node: M.Table): PMNode {
    const n = schema.nodes;
    const width = node.children[0]?.children.length ?? 0;
    const align = node.align ?? [];
    const rows = node.children.map((row, r) => {
      const cells: PMNode[] = [];
      for (let c = 0; c < width; c++) {
        const cell = row.children[c];
        const type = r === 0 ? n.table_header : n.table_cell;
        cells.push(type.createChecked({ align: align[c] ?? null }, cell ? this.inline(cell.children, []) : []));
      }
      return n.table_row.createChecked(null, cells);
    });
    const lines = this.slice(node).split("\n");
    const pipeAlign = lines.length > 1 && lines.every((l) => l.trimEnd().length === lines[0].trimEnd().length);
    const cellPadding = /\|\s|\s\|/.test(lines[0] ?? "");
    return n.table.createChecked({ style: { pipeAlign, cellPadding } }, rows);
  }

  inline(children: M.PhrasingContent[] | M.RootContent[], marks: readonly Mark[]): PMNode[] {
    const out: PMNode[] = [];
    const n = schema.nodes;
    const mk = schema.marks;
    for (let i = 0; i < children.length; i++) {
      const node = children[i] as M.PhrasingContent;
      switch (node.type) {
        case "text":
          if (node.value) out.push(schema.text(node.value, marks));
          break;
        case "emphasis":
          out.push(...this.inline(node.children, mk.em.create({ marker: this.src[start(node)] }).addToSet(marks)));
          break;
        case "strong":
          out.push(
            ...this.inline(node.children, mk.strong.create({ marker: this.src[start(node)] }).addToSet(marks)),
          );
          break;
        case "delete": {
          const marker = this.src.slice(start(node), start(node) + 2) === "~~" ? "~~" : "~";
          out.push(...this.inline(node.children, mk.strike.create({ marker }).addToSet(marks)));
          break;
        }
        case "inlineCode":
          if (node.value) out.push(schema.text(node.value, mk.code.create().addToSet(marks)));
          else out.push(n.raw_inline.create({ kind: "html", source: this.slice(node) }, null, marks));
          break;
        case "link": {
          const c = this.src[start(node)];
          const kind = c === "<" ? "autolink" : c === "[" ? "inline" : "literal";
          const link = mk.link.create({ href: node.url, title: node.title ?? null, kind });
          out.push(...this.inline(node.children, link.addToSet(marks)));
          break;
        }
        case "linkReference": {
          const def = this.defs.get(node.identifier);
          const link = mk.link.create({
            href: def?.url ?? "",
            title: def?.title ?? null,
            kind: "reference",
            ref: node.label ?? node.identifier,
            refType: node.referenceType,
          });
          out.push(...this.inline(node.children, link.addToSet(marks)));
          break;
        }
        case "image":
          out.push(n.image.create({ src: node.url, alt: node.alt ?? "", title: node.title ?? null }, null, marks));
          break;
        case "imageReference": {
          const def = this.defs.get(node.identifier);
          out.push(
            n.image.create(
              {
                src: def?.url ?? "",
                alt: node.alt ?? "",
                title: def?.title ?? null,
                ref: node.label ?? node.identifier,
                refType: node.referenceType,
              },
              null,
              marks,
            ),
          );
          break;
        }
        case "break": {
          const marker = this.slice(node).replace(/[\r\n]+$/, "");
          out.push(n.hard_break.create({ marker: marker === "\\" ? "\\" : /^ +$/.test(marker) ? marker : null }));
          break;
        }
        case "html": {
          // <u>, <em>/<i>, <strong>/<b>, <s>/<del> pairs become marks (the tag is kept as the marker)
          const tag = node.value.match(/^<([a-z]+)>$/i)?.[1].toLowerCase();
          const markFor = tag ? TAG_MARKS[tag] : undefined;
          if (tag && markFor) {
            const close = findClose(children as M.PhrasingContent[], i, tag);
            if (close > i) {
              const type = mk[markFor];
              const mark = markFor === "underline" ? type.create() : type.create({ marker: `<${tag}>` });
              out.push(...this.inline((children as M.PhrasingContent[]).slice(i + 1, close), mark.addToSet(marks)));
              i = close;
              break;
            }
          }
          out.push(n.raw_inline.create({ kind: "html", source: node.value }, null, marks));
          break;
        }
        case "footnoteReference":
          out.push(
            n.raw_inline.create({ kind: "footnote", source: `[^${node.label ?? node.identifier}]` }, null, marks),
          );
          break;
        case "inlineMath":
          out.push(n.raw_inline.create({ kind: "math", source: this.slice(node) }, null, marks));
          break;
        default:
          throw new Unsupported((node as M.Node).type);
      }
    }
    return out;
  }
}

const TAG_MARKS: Record<string, "underline" | "em" | "strong" | "strike"> = {
  u: "underline",
  em: "em",
  i: "em",
  strong: "strong",
  b: "strong",
  s: "strike",
  del: "strike",
};

function findClose(children: M.PhrasingContent[], open: number, tag: string): number {
  let depth = 0;
  const openRe = new RegExp(`^<${tag}>$`, "i");
  const closeRe = new RegExp(`^</${tag}>$`, "i");
  for (let j = open + 1; j < children.length; j++) {
    const c = children[j];
    if (c.type !== "html") continue;
    if (openRe.test(c.value)) depth++;
    else if (closeRe.test(c.value)) {
      if (depth === 0) return j;
      depth--;
    }
  }
  return -1;
}

function rawKind(type: string): string {
  switch (type) {
    case "yaml":
    case "toml":
      return "frontmatter";
    case "definition":
      return "definition";
    case "footnoteDefinition":
      return "footnote";
    case "math":
      return "math";
    case "html":
      return "html";
    default:
      return "markdown";
  }
}

function collectDefs(root: M.Root): Defs {
  const defs: Defs = new Map();
  const visit = (node: M.Node) => {
    if (node.type === "definition") {
      const d = node as M.Definition;
      if (!defs.has(d.identifier)) defs.set(d.identifier, { url: d.url, title: d.title ?? null });
    }
    const kids = (node as M.Parent).children;
    if (kids) for (const k of kids) visit(k);
  };
  visit(root);
  return defs;
}

function majority<T extends string>(counts: Map<string, number>, allowed: readonly T[], fallback: T): T {
  let best = fallback;
  let bestN = 0;
  for (const a of allowed) {
    const c = counts.get(a) ?? 0;
    if (c > bestN) {
      best = a;
      bestN = c;
    }
  }
  return best;
}

function detectStyle(root: M.Root, src: string): DocStyle {
  const count = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const bullet = new Map<string, number>();
  const ordered = new Map<string, number>();
  const em = new Map<string, number>();
  const strong = new Map<string, number>();
  const fence = new Map<string, number>();
  const rule = new Map<string, number>();
  const tables = new Map<string, number>();
  const visit = (node: M.Node) => {
    const s = node.position ? src[start(node)] : "";
    switch (node.type) {
      case "list": {
        const first = (node as M.List).children[0];
        if (!first) break;
        const head = src.slice(start(first), start(first) + 12);
        if ((node as M.List).ordered) count(ordered, head.match(/^\d+([.)])/)?.[1] ?? ".");
        else count(bullet, head[0]);
        break;
      }
      case "emphasis":
        count(em, s);
        break;
      case "strong":
        count(strong, s);
        break;
      case "code":
        count(fence, s);
        break;
      case "thematicBreak":
        count(rule, s);
        break;
      case "table": {
        const lines = src.slice(start(node), end(node)).split("\n");
        count(
          tables,
          `${lines.every((l) => l.trimEnd().length === lines[0].trimEnd().length)}:${/\|\s|\s\|/.test(lines[0])}`,
        );
        break;
      }
    }
    const kids = (node as M.Parent).children;
    if (kids) for (const k of kids) visit(k);
  };
  visit(root);
  const table = majority(tables, ["true:true", "false:true", "false:false", "true:false"], "true:true");
  return {
    bullet: majority(bullet, ["-", "*", "+"], "-"),
    bulletOrdered: majority(ordered, [".", ")"], "."),
    emphasis: majority(em, ["*", "_"], "*"),
    strong: majority(strong, ["*", "_"], "*"),
    fence: majority(fence, ["`", "~"], "`"),
    rule: majority(rule, ["-", "*", "_"], "-"),
    tablePipeAlign: table.startsWith("true"),
    tableCellPadding: table.endsWith("true"),
  };
}

export const DEFAULT_STYLE: DocStyle = {
  bullet: "-",
  bulletOrdered: ".",
  emphasis: "*",
  strong: "*",
  fence: "`",
  rule: "-",
  tablePipeAlign: true,
  tableCellPadding: true,
};

/** Parse a Markdown file into an editor document plus the source map used to save it */
export function parseMarkdown(text: string): ParsedDoc {
  const bom = text.charCodeAt(0) === 0xfeff;
  const body = bom ? text.slice(1) : text;
  const { norm, eol, toOrig } = normalizeEol(body);
  const root = parseMdast(norm);
  const defs = collectDefs(root);
  const conv = new Converter(norm, defs);

  const blocks: SourceBlock[] = [];
  const gaps: string[] = [];
  let prevEnd = 0;
  const definitions: string[] = [];
  for (const child of root.children) {
    const s = start(child);
    const e = end(child);
    let node: PMNode;
    try {
      node = conv.block(child, true);
    } catch {
      node = schema.nodes.raw_block.create({ kind: rawKind(child.type), source: norm.slice(s, e) });
    }
    // Definitions are needed to re-parse a single block that uses them.
    if (child.type === "definition" || child.type === "footnoteDefinition") definitions.push(norm.slice(s, e));
    gaps.push(body.slice(toOrig(prevEnd), toOrig(s)));
    blocks.push({ node, text: body.slice(toOrig(s), toOrig(e)) });
    prevEnd = e;
  }
  gaps.push(body.slice(toOrig(prevEnd)));

  const content = blocks.length ? blocks.map((b) => b.node) : [schema.nodes.paragraph.create()];
  const doc = schema.nodes.doc.create(null, content);
  return {
    doc,
    map: { blocks, gaps, eol, bom, style: detectStyle(root, norm), definitions: definitions.join("\n\n") },
  };
}

/** Parse Markdown into a slice-ready fragment of top-level nodes (for pasting Markdown text) */
export function parseMarkdownFragment(text: string): PMNode[] {
  const { doc, map } = parseMarkdown(text);
  return map.blocks.length ? map.blocks.map((b) => b.node) : [doc.firstChild!];
}
