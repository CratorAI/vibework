/**
 * ProseMirror document -> Markdown file, minimising changes against the file
 * the document was loaded from (see parse.ts for the source map).
 *
 * 1. Top-level blocks that are unchanged (same node object, or structurally
 *    equal) are written from their original bytes.
 * 2. A changed block that replaces an original block of the same type is
 *    re-serialized and then line-patched: lines whose canonical form did not
 *    change keep their original bytes (so editing one item of a long list, or
 *    one row of a table, changes one line).
 * 3. Whitespace between blocks is kept where the neighbours are original;
 *    otherwise a blank line separates blocks.
 * 4. Every rewritten block is parsed again and compared with the editor's
 *    block (content only, see fingerprint.ts); if it does not read back, a
 *    plain re-serialization and then a fully escaped one are tried.
 * 5. The whole result is parsed again and compared with the document. If it
 *    does not read back, safer strategies are tried: no line patching and
 *    blank-line gaps, then a full rewrite.
 */

import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../editor/schema";
import { blockToMarkdown } from "./toMarkdown";
import { fingerprint } from "./fingerprint";
import { parseMarkdown, type DocStyle, type SourceBlock, type SourceMap } from "./parse";

export interface SerializeResult {
  text: string;
  /** Source map of `text` against the nodes of the serialized document */
  map: SourceMap;
  /** Which strategy produced the text (for tests and diagnostics) */
  strategy: "minimal" | "safe" | "full" | "unverified";
}

const freshCache = new WeakMap<DocStyle, WeakMap<PMNode, string>>();

function fresh(node: PMNode, style: DocStyle): string {
  let cache = freshCache.get(style);
  if (!cache) freshCache.set(style, (cache = new WeakMap()));
  let s = cache.get(node);
  if (s === undefined) {
    s = blockToMarkdown(node, style);
    cache.set(node, s);
  }
  return s;
}


function isEmptyParagraph(node: PMNode) {
  return node.type === schema.nodes.paragraph && node.content.size === 0;
}

function contentBlocks(doc: PMNode): PMNode[] {
  const out: PMNode[] = [];
  doc.forEach((n) => {
    if (!isEmptyParagraph(n)) out.push(n);
  });
  return out;
}

const hasBlankLine = (s: string) => /\n[ \t]*\r?\n/.test(s.replace(/\r(?!\n)/g, "\n"));

function toEol(s: string, eol: string) {
  return eol === "\n" ? s : s.replace(/\n/g, eol);
}

/** For each line of `b`, the index of the matching line in `a` (LCS), or -1 */
function matchLines(a: string[], b: string[]): number[] {
  const res = new Array<number>(b.length).fill(-1);
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) {
    res[pre] = pre;
    pre++;
  }
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) {
    res[b.length - 1 - suf] = a.length - 1 - suf;
    suf++;
  }
  const A = a.slice(pre, a.length - suf);
  const B = b.slice(pre, b.length - suf);
  if (!A.length || !B.length || A.length * B.length > 4_000_000) return res;
  const w = B.length + 1;
  const dp = new Uint32Array((A.length + 1) * w);
  for (let i = A.length - 1; i >= 0; i--)
    for (let j = B.length - 1; j >= 0; j--)
      dp[i * w + j] = A[i] === B[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) {
      res[pre + j] = pre + i;
      i++;
      j++;
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) i++;
    else j++;
  }
  return res;
}

function listMarker(node: PMNode, style: DocStyle): string | null {
  if (node.type === schema.nodes.bullet_list) return `b${node.attrs.bullet ?? style.bullet}`;
  if (node.type === schema.nodes.ordered_list) return `o${node.attrs.delimiter ?? style.bulletOrdered}`;
  return null;
}

/** Same list kind written with the other marker, so two adjacent lists do not merge */
function withOtherMarker(node: PMNode, style: DocStyle): PMNode {
  if (node.type === schema.nodes.bullet_list) {
    const b = node.attrs.bullet ?? style.bullet;
    return node.type.create({ ...node.attrs, bullet: b === "*" ? "-" : "*" }, node.content);
  }
  const d = node.attrs.delimiter ?? style.bulletOrdered;
  return node.type.create({ ...node.attrs, delimiter: d === "." ? ")" : "." }, node.content);
}

/** Whether `text` (one block) reads back as `node` */
function readsBackBlock(text: string, node: PMNode, map: SourceMap): boolean {
  const probe = parseMarkdown(map.definitions ? `${text}\n\n${map.definitions}\n` : text);
  const first = probe.map.blocks[0]?.node;
  if (!first) return false;
  const rest = probe.map.blocks.slice(1);
  if (rest.some((b) => b.node.type !== schema.nodes.raw_block || (b.node.attrs.kind !== "definition" && b.node.attrs.kind !== "footnote")))
    return false;
  return fingerprint(first) === fingerprint(node);
}

/** Changed block that replaces `old`: keep original bytes of lines whose canonical form did not change */
function patchBlock(old: SourceBlock, node: PMNode, map: SourceMap): string | null {
  const style = map.style;
  if (old.node.type !== node.type || old.node.type === schema.nodes.raw_block) return null;
  const next = fresh(node, style);
  const oldLines = old.text.split(/\r\n|\n|\r/);
  const oldFresh = fresh(old.node, style).split("\n");
  if (oldLines.length !== oldFresh.length) return null;
  const newLines = next.split("\n");
  const m = matchLines(oldFresh, newLines);
  if (!m.some((x) => x >= 0)) return null;
  return newLines.map((line, k) => (m[k] >= 0 ? oldLines[m[k]] : line)).join(map.eol);
}

/** Text for a block that is not written from its original bytes */
function writeChanged(node: PMNode, old: SourceBlock | null, map: SourceMap, patch: boolean): string {
  const plain = toEol(fresh(node, map.style), map.eol);
  if (patch && old) {
    const patched = patchBlock(old, node, map);
    if (patched !== null && patched !== plain && readsBackBlock(patched, node, map)) return patched;
  }
  if (node.type === schema.nodes.raw_block || readsBackBlock(plain, node, map)) return plain;
  const paranoid = toEol(blockToMarkdown(node, map.style, "paranoid"), map.eol);
  return readsBackBlock(paranoid, node, map) ? paranoid : plain;
}

interface AssembleOptions {
  patch: boolean;
  safeGaps: boolean;
  reuse: boolean;
}

function assemble(doc: PMNode, map: SourceMap, opts: AssembleOptions): { text: string; map: SourceMap } {
  const olds = map.blocks;
  const n = olds.length;
  const news = contentBlocks(doc);
  const m = news.length;
  const style = map.style;
  const eol = map.eol;

  if (m === 0) {
    const text = n === 0 ? map.gaps[0] : "";
    return { text, map: { ...map, blocks: [], gaps: [text] } };
  }

  // 1. Unchanged blocks, matched in order.
  const matched: (number | undefined)[] = new Array(m);
  if (opts.reuse) {
    const byNode = new Map<PMNode, number>();
    olds.forEach((b, i) => byNode.set(b.node, i));
    let last = -1;
    for (let j = 0; j < m; j++) {
      let i = byNode.get(news[j]);
      if (i === undefined || i <= last) {
        i = undefined;
        for (let k = last + 1; k < n; k++) {
          if (olds[k].node.eq(news[j])) {
            i = k;
            break;
          }
        }
      }
      if (i !== undefined) {
        matched[j] = i;
        last = i;
      }
    }
  }

  // 2. Pair changed blocks with the original block they replace (same type, same hole).
  const anchor: (number | undefined)[] = [...matched];
  if (opts.reuse) {
    let j = 0;
    let prevOld = -1;
    while (j < m) {
      if (matched[j] !== undefined) {
        prevOld = matched[j]!;
        j++;
        continue;
      }
      let k = j;
      while (k < m && matched[k] === undefined) k++;
      const nextOld = k < m ? matched[k]! : n;
      let o = prevOld + 1;
      for (let x = j; x < k && o < nextOld; x++) {
        for (let y = o; y < nextOld; y++) {
          if (olds[y].node.type === news[x].type) {
            anchor[x] = y;
            o = y + 1;
            break;
          }
        }
      }
      j = k;
    }
  }

  // 3. Emit.
  const texts: string[] = [];
  const gaps: string[] = [];
  let prevMarker: string | null = null;
  for (let j = 0; j < m; j++) {
    let node = news[j];
    const i = matched[j];
    let text: string;
    let marker = listMarker(node, style);
    if (i !== undefined) {
      text = olds[i].text;
    } else {
      let old = anchor[j] !== undefined ? olds[anchor[j]!] : null;
      if (marker && marker === prevMarker) {
        // Two adjacent lists with the same marker would merge into one.
        node = withOtherMarker(node, style);
        marker = listMarker(node, style);
        old = null;
      } else if (
        node.type === schema.nodes.code_block &&
        node.attrs.fence === "indent" &&
        j > 0 &&
        (listMarker(news[j - 1], style) || (news[j - 1].type === node.type && news[j - 1].attrs.fence === "indent"))
      ) {
        // Indented code after a list or another indented block would join it.
        node = node.type.create({ ...node.attrs, fence: null }, node.content);
        old = null;
      }
      text = writeChanged(node, old, map, opts.patch);
    }
    prevMarker = marker;

    if (j === 0) {
      gaps.push(n ? map.gaps[0] : "");
    } else {
      const a = anchor[j - 1];
      const b = anchor[j];
      const bothOriginal = matched[j - 1] !== undefined && matched[j] !== undefined;
      let gap: string | undefined;
      if (a !== undefined && b !== undefined && b === a + 1 && (bothOriginal || !opts.safeGaps)) gap = map.gaps[b];
      if (gap === undefined || (!bothOriginal && !hasBlankLine(gap) && opts.safeGaps)) {
        const candidate = b !== undefined ? map.gaps[b] : a !== undefined ? map.gaps[a + 1] : undefined;
        gap = candidate !== undefined && hasBlankLine(candidate) ? candidate : eol + eol;
      }
      gaps.push(gap);
    }
    texts.push(text);
  }
  gaps.push(n ? map.gaps[n] : eol);

  let text = "";
  for (let j = 0; j < m; j++) text += gaps[j] + texts[j];
  text += gaps[m];
  return {
    text: (map.bom ? "﻿" : "") + text,
    map: { ...map, blocks: news.map((node, j) => ({ node, text: texts[j] })), gaps },
  };
}

/** Content fingerprint of a document, ignoring how it is written */
export function contentKey(doc: PMNode): string {
  return contentBlocks(doc).map(fingerprint).join("\u0000");
}

function readsBack(text: string, doc: PMNode): boolean {
  return contentKey(parseMarkdown(text).doc) === contentKey(doc);
}

/** Serialize the document against the source map of the file it was loaded from */
export function serializeMarkdown(doc: PMNode, map: SourceMap): SerializeResult {
  const minimal = assemble(doc, map, { patch: true, safeGaps: false, reuse: true });
  if (readsBack(minimal.text, doc)) return { ...minimal, strategy: "minimal" };
  const safe = assemble(doc, map, { patch: false, safeGaps: true, reuse: true });
  if (readsBack(safe.text, doc)) return { ...safe, strategy: "safe" };
  const full = assemble(doc, map, { patch: false, safeGaps: true, reuse: false });
  if (readsBack(full.text, doc)) return { ...full, strategy: "full" };
  console.warn("[doc] Markdown output does not read back identically; writing best effort");
  return { ...safe, strategy: "unverified" };
}

/** Plain Markdown for the whole document (Copy as Markdown, new files) */
export function documentToMarkdown(doc: PMNode, style: DocStyle): string {
  const blocks = contentBlocks(doc);
  return blocks.map((b) => fresh(b, style)).join("\n\n") + (blocks.length ? "\n" : "");
}
