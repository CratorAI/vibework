import { describe, expect, it } from "vitest";
import { EditorState, type Transaction } from "prosemirror-state";
import { schema } from "../editor/schema";
import { parseMarkdown } from "../markdown/parse";
import { contentKey, serializeMarkdown } from "../markdown/serialize";
import { fixture, fixtureNames, lineDiff } from "./helpers";

/** Deterministic PRNG so failures reproduce */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function textPositions(state: EditorState): number[] {
  const out: number[] = [];
  state.doc.descendants((node, pos) => {
    if (node.isText) for (let i = 0; i <= node.text!.length; i++) out.push(pos + i);
    return true;
  });
  return out;
}

const INSERTS = ["x", " ", "*", "_", "#", "- ", "1. ", "`", "|", "[", "]", "\\", "<", "&", "~", "!", "  "];

function randomEdit(state: EditorState, r: () => number): Transaction | null {
  const positions = textPositions(state);
  if (!positions.length) return null;
  const pos = positions[Math.floor(r() * positions.length)];
  const kind = r();
  const $pos = state.doc.resolve(pos);
  if (!$pos.parent.isTextblock) return null;
  if (kind < 0.5) return state.tr.insertText(INSERTS[Math.floor(r() * INSERTS.length)], pos);
  if (kind < 0.7) {
    const end = Math.min(pos + 1 + Math.floor(r() * 6), $pos.end());
    return end > pos ? state.tr.delete(pos, end) : null;
  }
  if (kind < 0.9) {
    const end = Math.min(pos + 1 + Math.floor(r() * 10), $pos.end());
    if (end <= pos) return null;
    const marks = [schema.marks.strong, schema.marks.em, schema.marks.code, schema.marks.strike, schema.marks.underline];
    const mark = marks[Math.floor(r() * marks.length)].create();
    return state.tr.addMark(pos, end, mark);
  }
  // Split the block (Enter)
  return state.tr.split(pos);
}

describe("random edits always save something that reads back as the editor shows it", () => {
  for (const name of fixtureNames()) {
    it(name, () => {
      const md = fixture(name);
      const r = rng(name.length * 7919 + 17 + Number(process.env.FUZZ_SEED ?? 0));
      const counts: Record<string, number> = {};
      for (let trial = 0; trial < Number(process.env.FUZZ_TRIALS ?? 60); trial++) {
        const { doc, map } = parseMarkdown(md);
        let state = EditorState.create({ doc });
        const edits = 1 + Math.floor(r() * Number(process.env.FUZZ_EDITS ?? 3));
        for (let k = 0; k < edits; k++) {
          try {
            const tr = randomEdit(state, r);
            if (tr) state = state.apply(tr);
          } catch {
            // invalid split positions etc. are skipped
          }
        }
        const out = serializeMarkdown(state.doc, map);
        counts[out.strategy] = (counts[out.strategy] ?? 0) + 1;
        expect(out.strategy, `trial ${trial}\n${out.text}`).not.toBe("unverified");
        expect(contentKey(parseMarkdown(out.text).doc)).toBe(contentKey(state.doc));
        if (state.doc.eq(doc)) expect(out.text).toBe(md);
        // Saving again from the new map without further edits writes the same text
        expect(serializeMarkdown(state.doc, out.map).text).toBe(out.text);
        // Edits stay local: few lines change for a handful of character edits
        const d = lineDiff(md, out.text);
        if (out.strategy === "minimal") expect(d.removed.length).toBeLessThanOrEqual(6 * edits);
      }
      console.log(name, JSON.stringify(counts));
    // All 60 round-trip trials still run; CPU contention is not a failure.
    }, 30000);
  }
});
