/**
 * ProseMirror schema for the Doc editor. It mirrors the Markdown (GFM) document
 * model one to one, so every node maps to exactly one mdast construct and back.
 *
 * Style attributes (`marker`, `bullet`, `fence`, `setext`, ...) remember how the
 * construct was written in the file so a re-serialized block keeps its style.
 * `null` means "not from the file; use the document's prevailing style".
 *
 * Anything the editor does not model is a `raw_block` / `raw_inline` atom that
 * carries its Markdown source verbatim.
 */

import { Schema, type DOMOutputSpec, type NodeSpec, type MarkSpec } from "prosemirror-model";

const cellAttrs = {
  colspan: { default: 1 },
  rowspan: { default: 1 },
  colwidth: { default: null },
  /** "left" | "center" | "right" | null (GFM column alignment, kept per cell) */
  align: { default: null },
};

function cellDOM(tag: "td" | "th") {
  return (node: { attrs: Record<string, unknown> }): DOMOutputSpec => {
    const attrs: Record<string, string> = {};
    if (node.attrs.align) attrs["data-align"] = String(node.attrs.align);
    return [tag, attrs, 0];
  };
}

function cellParse(tag: "td" | "th") {
  return {
    tag,
    getAttrs: (dom: HTMLElement) => {
      const a = dom.getAttribute("data-align") || dom.style.textAlign || dom.getAttribute("align");
      return { align: a === "left" || a === "center" || a === "right" ? a : null };
    },
  };
}

const nodes: Record<string, NodeSpec> = {
  doc: { content: "block+" },

  paragraph: {
    group: "block",
    content: "inline*",
    parseDOM: [{ tag: "p" }],
    toDOM: () => ["p", 0],
  },

  heading: {
    group: "block",
    content: "inline*",
    defining: true,
    attrs: { level: { default: 1 }, setext: { default: null } },
    parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
    toDOM: (node) => [`h${node.attrs.level}`, 0],
  },

  blockquote: {
    group: "block",
    content: "block+",
    defining: true,
    parseDOM: [{ tag: "blockquote" }],
    toDOM: () => ["blockquote", 0],
  },

  code_block: {
    group: "block",
    content: "text*",
    marks: "",
    code: true,
    defining: true,
    /** lang/meta: the fence info string; fence: "`" | "~" | "indent" | null */
    attrs: { lang: { default: "" }, meta: { default: "" }, fence: { default: null } },
    parseDOM: [
      {
        tag: "pre",
        preserveWhitespace: "full",
        getAttrs: (dom: HTMLElement) => {
          const code = dom.querySelector("code");
          const cls = (code?.className || dom.className || "").match(/language-([\w+#.-]+)/);
          return { lang: dom.getAttribute("data-lang") || (cls ? cls[1] : "") };
        },
      },
    ],
    toDOM: (node) => ["pre", node.attrs.lang ? { "data-lang": node.attrs.lang } : {}, ["code", 0]],
  },

  horizontal_rule: {
    group: "block",
    /** marker: the rule as written, e.g. "---", "***", "* * *" */
    attrs: { marker: { default: null } },
    parseDOM: [{ tag: "hr" }],
    toDOM: () => ["hr"],
  },

  bullet_list: {
    group: "block",
    content: "list_item+",
    /** bullet: "-" | "*" | "+" | null; indent: "one" | "tab" | "mixed" | null */
    attrs: { bullet: { default: null }, spread: { default: false }, indent: { default: null } },
    parseDOM: [{ tag: "ul" }],
    toDOM: () => ["ul", 0],
  },

  ordered_list: {
    group: "block",
    content: "list_item+",
    /** delimiter: "." | ")" | null; increment: false when every item repeats the start number */
    attrs: {
      start: { default: 1 },
      delimiter: { default: null },
      increment: { default: true },
      spread: { default: false },
      indent: { default: null },
    },
    parseDOM: [
      {
        tag: "ol",
        getAttrs: (dom: HTMLElement) => ({
          start: dom.hasAttribute("start") ? Number(dom.getAttribute("start")) || 1 : 1,
        }),
      },
    ],
    toDOM: (node) => ["ol", node.attrs.start === 1 ? {} : { start: String(node.attrs.start) }, 0],
  },

  list_item: {
    content: "paragraph block*",
    defining: true,
    /** checked: null for a plain item, true/false for a GFM task item */
    attrs: { checked: { default: null }, spread: { default: false } },
    parseDOM: [
      {
        tag: "li",
        getAttrs: (dom: HTMLElement) => {
          const box = dom.querySelector(":scope > input[type=checkbox], :scope > p > input[type=checkbox]");
          const data = dom.getAttribute("data-checked");
          if (data === "true" || data === "false") return { checked: data === "true" };
          return { checked: box ? (box as HTMLInputElement).checked : null };
        },
      },
    ],
    toDOM: (node) => [
      "li",
      node.attrs.checked === null ? {} : { "data-checked": String(node.attrs.checked) },
      0,
    ],
  },

  table: {
    group: "block",
    content: "table_row+",
    tableRole: "table",
    isolating: true,
    /** style: how the table was written ({ pipeAlign, cellPadding }) or null */
    attrs: { style: { default: null } },
    parseDOM: [{ tag: "table" }],
    toDOM: () => ["table", ["tbody", 0]],
  },

  table_row: {
    content: "(table_cell | table_header)*",
    tableRole: "row",
    parseDOM: [{ tag: "tr" }],
    toDOM: () => ["tr", 0],
  },

  table_cell: {
    content: "(text | image | raw_inline)*",
    attrs: cellAttrs,
    tableRole: "cell",
    isolating: true,
    parseDOM: [cellParse("td")],
    toDOM: cellDOM("td"),
  },

  table_header: {
    content: "(text | image | raw_inline)*",
    attrs: cellAttrs,
    tableRole: "header_cell",
    isolating: true,
    parseDOM: [cellParse("th")],
    toDOM: cellDOM("th"),
  },

  raw_block: {
    group: "block",
    atom: true,
    selectable: true,
    /** kind: "html" | "frontmatter" | "footnote" | "definition" | "math" | "markdown" */
    attrs: { source: { default: "" }, kind: { default: "markdown" } },
    parseDOM: [
      {
        tag: "div[data-raw-block]",
        getAttrs: (dom: HTMLElement) => ({
          source: dom.getAttribute("data-source") ?? dom.textContent ?? "",
          kind: dom.getAttribute("data-raw-block") || "markdown",
        }),
      },
    ],
    toDOM: (node) => [
      "div",
      { "data-raw-block": node.attrs.kind, "data-source": node.attrs.source },
      ["pre", node.attrs.source],
    ],
  },

  text: { group: "inline" },

  image: {
    group: "inline",
    inline: true,
    draggable: true,
    /** ref/refType: set when written as a reference image (![alt][ref]) */
    attrs: {
      src: { default: "" },
      alt: { default: "" },
      title: { default: null },
      ref: { default: null },
      refType: { default: null },
    },
    parseDOM: [
      {
        tag: "img[src]",
        getAttrs: (dom: HTMLElement) => ({
          src: dom.getAttribute("data-src") || dom.getAttribute("src") || "",
          alt: dom.getAttribute("alt") || "",
          title: dom.getAttribute("title"),
        }),
      },
    ],
    toDOM: (node) => [
      "img",
      { src: node.attrs.src, alt: node.attrs.alt, ...(node.attrs.title ? { title: node.attrs.title } : {}) },
    ],
  },

  hard_break: {
    group: "inline",
    inline: true,
    selectable: false,
    /** marker: "\\" or the trailing spaces as written */
    attrs: { marker: { default: null } },
    parseDOM: [{ tag: "br" }],
    toDOM: () => ["br"],
  },

  raw_inline: {
    group: "inline",
    inline: true,
    atom: true,
    /** kind: "html" | "footnote" | "math" */
    attrs: { source: { default: "" }, kind: { default: "html" } },
    parseDOM: [
      {
        tag: "span[data-raw-inline]",
        getAttrs: (dom: HTMLElement) => ({
          source: dom.getAttribute("data-source") ?? dom.textContent ?? "",
          kind: dom.getAttribute("data-raw-inline") || "html",
        }),
      },
    ],
    toDOM: (node) => [
      "span",
      { "data-raw-inline": node.attrs.kind, "data-source": node.attrs.source, class: "vw-raw-inline" },
      node.attrs.source,
    ],
  },
};

const marks: Record<string, MarkSpec> = {
  /** kind: "inline" | "autolink" | "literal" | "reference"; ref/refType for references */
  link: {
    attrs: {
      href: { default: "" },
      title: { default: null },
      kind: { default: "inline" },
      ref: { default: null },
      refType: { default: null },
    },
    inclusive: false,
    parseDOM: [
      {
        tag: "a[href]",
        getAttrs: (dom: HTMLElement) => ({ href: dom.getAttribute("href"), title: dom.getAttribute("title") }),
      },
    ],
    toDOM: (mark) => ["a", { href: mark.attrs.href, ...(mark.attrs.title ? { title: mark.attrs.title } : {}) }, 0],
  },

  em: {
    attrs: { marker: { default: null } },
    parseDOM: [
      { tag: "i" },
      { tag: "em" },
      { style: "font-style=italic" },
      { style: "font-style=normal", clearMark: (m) => m.type.name === "em" },
    ],
    toDOM: () => ["em", 0],
  },

  strong: {
    attrs: { marker: { default: null } },
    parseDOM: [
      { tag: "strong" },
      // Google Docs wraps everything in <b style="font-weight:normal">
      { tag: "b", getAttrs: (node: HTMLElement) => node.style.fontWeight !== "normal" && null },
      { style: "font-weight=400", clearMark: (m) => m.type.name === "strong" },
      { style: "font-weight", getAttrs: (value: string) => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null },
    ],
    toDOM: () => ["strong", 0],
  },

  strike: {
    attrs: { marker: { default: null } },
    parseDOM: [{ tag: "s" }, { tag: "del" }, { tag: "strike" }, { style: "text-decoration=line-through" }],
    toDOM: () => ["s", 0],
  },

  /** Markdown has no underline; written as <u>...</u> */
  underline: {
    parseDOM: [{ tag: "u" }, { style: "text-decoration=underline" }],
    toDOM: () => ["u", 0],
  },

  code: {
    code: true,
    parseDOM: [{ tag: "code" }],
    toDOM: () => ["code", 0],
  },
};

export const schema = new Schema({ nodes, marks });

export type DocSchema = typeof schema;
