/**
 * Matching for the message box's "/" menu: what the user typed after "/"
 * against each skill's id (fuzzy), its name, and the words of its
 * description. Prepared once per catalogue read, so a keystroke over
 * hundreds of skills is a few string comparisons each.
 */

import type { SkillChoice, SkillSource } from "@/tauri/skills";
import { fold } from "@/lib/search";

export interface PreparedSkill {
  skill: SkillChoice;
  /** Folded id, name and description words */
  id: string;
  name: string;
  /** Where each word of the id starts ("vibework-slides" → 0, 9) */
  idWordStarts: number[];
  words: string[];
}

export interface SkillMatch {
  skill: SkillChoice;
  score: number;
  /** Indices of the id's characters that matched, for weight */
  hits: number[];
}

/** Sources in the order the menu lists them */
export const SOURCE_ORDER: SkillSource[] = ["bundled", "user", "claude", "agents"];

const sourceRank = (source: SkillSource) => {
  const i = SOURCE_ORDER.indexOf(source);
  return i === -1 ? SOURCE_ORDER.length : i;
};

function wordStarts(text: string): number[] {
  const starts: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (i === 0 || /[^\p{L}\p{N}]/u.test(text[i - 1])) {
      if (/[\p{L}\p{N}]/u.test(text[i])) starts.push(i);
    }
  }
  return starts;
}

export function prepareSkills(skills: SkillChoice[]): PreparedSkill[] {
  return skills.map((skill) => {
    const id = fold(skill.id);
    return {
      skill,
      id,
      name: fold(skill.name),
      idWordStarts: wordStarts(id),
      words: fold(skill.description).split(/[^\p{L}\p{N}]+/u).filter(Boolean),
    };
  });
}

const range = (start: number, length: number) => Array.from({ length }, (_, i) => start + i);

/**
 * Letters of `q` in order inside `text`, each at the start of a word or
 * right after the previous one ("vibsli" → vibework-slides, "vsh" →
 * vibework-sheet), so scattered letters ("sli" in "baseline-ui") don't
 * count. Null when there is no such placement.
 */
function subsequence(text: string, q: string, starts: number[]): number[] | null {
  const isStart = new Set(starts);
  const place = (qi: number, prev: number): number[] | null => {
    if (qi === q.length) return [];
    const ch = q[qi];
    // Right after the previous letter first, then each later word start
    const candidates = [prev + 1, ...starts.filter((s) => s > prev + 1)];
    for (const at of candidates) {
      if (at >= text.length || text[at] !== ch) continue;
      if (qi > 0 && at !== prev + 1 && !isStart.has(at)) continue;
      if (qi === 0 && !isStart.has(at)) continue;
      const rest = place(qi + 1, at);
      if (rest) return [at, ...rest];
    }
    return null;
  };
  return place(0, -1);
}

function scoreOne(p: PreparedSkill, q: string): SkillMatch | null {
  const { id } = p;
  if (id === q) return { skill: p.skill, score: 1000, hits: range(0, q.length) };
  if (id.startsWith(q)) return { skill: p.skill, score: 900 - id.length / 100, hits: range(0, q.length) };
  const wordAt = p.idWordStarts.find((s) => id.startsWith(q, s));
  if (wordAt !== undefined) return { skill: p.skill, score: 800 - wordAt / 100 - id.length / 1000, hits: range(wordAt, q.length) };
  const inside = id.indexOf(q);
  if (inside !== -1) return { skill: p.skill, score: 700 - inside / 100, hits: range(inside, q.length) };
  if (p.name !== id && (p.name.startsWith(q) || p.name.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(q)))) {
    return { skill: p.skill, score: 650, hits: [] };
  }
  const fuzzy = q.length >= 2 ? subsequence(id, q, p.idWordStarts) : null;
  if (fuzzy) {
    const span = fuzzy[fuzzy.length - 1] - fuzzy[0] + 1;
    return { skill: p.skill, score: 500 - (span - q.length) * 2 - fuzzy[0] / 10, hits: fuzzy };
  }
  if (q.length >= 2 && p.words.some((w) => w.startsWith(q))) return { skill: p.skill, score: 300, hits: [] };
  return null;
}

/**
 * The skills that match `query` (what follows "/"), best first; ties keep
 * source order (bundled, the app's folder, ~/.claude, ~/.agents) and then the
 * id. An empty query lists every skill in that order.
 */
export function matchSkills(prepared: PreparedSkill[], query: string): SkillMatch[] {
  const q = fold(query.trim());
  const byOrder = (a: SkillMatch, b: SkillMatch) =>
    sourceRank(a.skill.source) - sourceRank(b.skill.source) || a.skill.id.localeCompare(b.skill.id);
  if (!q) return prepared.map((p) => ({ skill: p.skill, score: 0, hits: [] })).sort(byOrder);
  const out: SkillMatch[] = [];
  for (const p of prepared) {
    const m = scoreOne(p, q);
    if (m) out.push(m);
  }
  return out.sort((a, b) => b.score - a.score || byOrder(a, b));
}

export interface SlashTrigger {
  /** Offset of the "/" in the text */
  slash: number;
  /** What follows it, up to the caret */
  query: string;
}

/**
 * Whether the text before the caret ends in a "/" command being typed: a "/"
 * at the start or after whitespace (or right after a chip), followed by
 * anything but whitespace or another "/". A "/" inside a word, a path or a
 * URL is not one. `afterBoundary` says whether what precedes `before` (the
 * caret's text) is a boundary: nothing, a chip or a line break.
 */
export function slashTrigger(before: string, afterBoundary = true): SlashTrigger | null {
  const slash = before.lastIndexOf("/");
  if (slash === -1) return null;
  const query = before.slice(slash + 1);
  if (/[\s/]/.test(query)) return null;
  const prev = slash === 0 ? null : before[slash - 1];
  if (prev === null ? !afterBoundary : !/\s/.test(prev)) return null;
  return { slash, query };
}
