/**
 * Matching and ranking for the search window (tasks, artifacts, actions).
 *
 * Case- and accent-insensitive and token-based: every word of the query must
 * appear in one of an item's fields. Each word scores by where it lands: a
 * whole word beats the start of a word, which beats the middle of one; a
 * field marked primary (a title, a file name) counts double a secondary one
 * (the task an artifact came from). Ties go to the more recent item.
 */

export type MatchRange = [start: number, end: number];

export interface FieldMatch {
  /** Ranges of the original text to emphasise, sorted and merged */
  ranges: MatchRange[];
}

export interface Match {
  score: number;
  /** Per field (same order as given), the ranges matched there */
  fields: FieldMatch[];
}

export interface SearchField {
  text: string;
  /** Primary fields (a title, a file name) weigh twice a secondary one */
  primary?: boolean;
}

/** Lower-cased, accents stripped, one output character per input UTF-16 unit, so ranges map back. */
export function fold(text: string): string {
  let out = "";
  for (const ch of text) {
    const folded = ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    // Keep the length of the original so indices line up
    out += folded.length === ch.length ? folded : ch.toLowerCase().length === ch.length ? ch.toLowerCase() : ch;
  }
  return out;
}

/** The query's words, folded; empty when there is nothing to search for. */
export function tokenize(query: string): string[] {
  return fold(query)
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

/** Whether a word starts at `i` of `orig`: after a separator, or a capital after a small letter (camelCase). */
function wordStartsAt(orig: string, i: number): boolean {
  if (i === 0 || !isWordChar(orig[i - 1])) return true;
  const c = orig[i];
  const p = orig[i - 1];
  return c !== c.toLowerCase() && p === p.toLowerCase() && p !== p.toUpperCase();
}

/** Whether a word ends just before `i` of `orig`. */
function wordEndsAt(orig: string, i: number): boolean {
  return i >= orig.length || !isWordChar(orig[i]) || wordStartsAt(orig, i);
}

/** The best place for one token in one field: whole word 3, word start 2, inside a word 1. */
function bestHit(orig: string, hay: string, token: string): { score: number; start: number } | null {
  let best: { score: number; start: number } | null = null;
  let from = 0;
  for (;;) {
    const at = hay.indexOf(token, from);
    if (at < 0) break;
    const score = wordStartsAt(orig, at) ? (wordEndsAt(orig, at + token.length) ? 3 : 2) : 1;
    if (!best || score > best.score) best = { score, start: at };
    if (score === 3) break;
    from = at + 1;
  }
  return best;
}

function merge(ranges: MatchRange[]): MatchRange[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: MatchRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

/**
 * Match `tokens` against an item's fields. Null when a token appears in none
 * of them. Pass folded fields (`foldedFields`) when matching the same items
 * on every keystroke, to fold them once.
 */
export function matchFields(fields: SearchField[], tokens: string[], foldedFields?: string[]): Match | null {
  const folded = foldedFields ?? fields.map((f) => fold(f.text));
  const ranges: MatchRange[][] = fields.map(() => []);
  let score = 0;
  for (const token of tokens) {
    let best: { score: number; field: number; start: number } | null = null;
    folded.forEach((hay, i) => {
      const hit = bestHit(fields[i].text, hay, token);
      if (!hit) return;
      const weighted = hit.score * (fields[i].primary ? 2 : 1);
      if (!best || weighted > best.score) best = { score: weighted, field: i, start: hit.start };
    });
    if (!best) return null;
    const { field, start, score: s } = best as { score: number; field: number; start: number };
    score += s;
    ranges[field].push([start, start + token.length]);
  }
  // The whole query at the very start of the first primary field: what the user is typing out
  const primary = fields.findIndex((f) => f.primary);
  if (primary >= 0 && tokens.length > 0 && folded[primary].startsWith(tokens.join(" "))) score += 2;
  return { score, fields: ranges.map((r) => ({ ranges: merge(r) })) };
}

/** Sort matched items: score first, then most recent first. */
export function rank<T>(items: { item: T; match: Match; at: number }[]): { item: T; match: Match; at: number }[] {
  return items.sort((a, b) => b.match.score - a.match.score || b.at - a.at);
}

/** Split `text` into plain and matched runs, for emphasis. */
export function highlightRuns(text: string, ranges: MatchRange[]): { text: string; hit: boolean }[] {
  if (ranges.length === 0) return [{ text, hit: false }];
  const runs: { text: string; hit: boolean }[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) runs.push({ text: text.slice(at, start), hit: false });
    runs.push({ text: text.slice(start, end), hit: true });
    at = end;
  }
  if (at < text.length) runs.push({ text: text.slice(at), hit: false });
  return runs;
}
