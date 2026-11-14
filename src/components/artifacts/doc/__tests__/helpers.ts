import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EditorState, TextSelection, type Transaction } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { parseMarkdown, type SourceMap } from "../markdown/parse";
import { serializeMarkdown } from "../markdown/serialize";

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = path.join(here, "fixtures");

export function fixtureNames(): string[] {
  return fs.readdirSync(FIXTURES).filter((f) => f.endsWith(".md")).sort();
}

export function fixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8");
}

/** Load Markdown, apply an edit to the editor state, save. */
export function edit(md: string, fn: (state: EditorState) => Transaction | null) {
  const { doc, map } = parseMarkdown(md);
  const state = EditorState.create({ doc });
  const tr = fn(state);
  const next = tr ? state.apply(tr) : state;
  return serializeMarkdown(next.doc, map);
}

/** Position range of the first occurrence of `text` inside a text node */
export function find(doc: PMNode, text: string, occurrence = 0): { from: number; to: number } {
  let found: { from: number; to: number } | null = null;
  let seen = 0;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.isText) {
      let idx = node.text!.indexOf(text);
      while (idx >= 0) {
        if (seen++ === occurrence) {
          found = { from: pos + idx, to: pos + idx + text.length };
          return false;
        }
        idx = node.text!.indexOf(text, idx + 1);
      }
    }
    return true;
  });
  if (!found) throw new Error(`text not found: ${text}`);
  return found;
}

export function replaceText(state: EditorState, text: string, by: string, occurrence = 0): Transaction {
  const { from, to } = find(state.doc, text, occurrence);
  return state.tr.insertText(by, from, to);
}

export function select(state: EditorState, text: string): EditorState {
  const { from, to } = find(state.doc, text);
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
}

/** Lines of `after` that are not in `before` and vice versa (LCS-based) */
export function lineDiff(before: string, after: string): { removed: string[]; added: string[] } {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const removed: string[] = [];
  const added: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      i++;
      j++;
    } else if (j >= b.length || (i < a.length && dp[i + 1][j] >= dp[i][j + 1])) removed.push(a[i++]);
    else added.push(b[j++]);
  }
  return { removed, added };
}

export type { SourceMap };
