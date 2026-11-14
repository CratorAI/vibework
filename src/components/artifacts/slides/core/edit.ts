/**
 * Write-back: every edit is a splice of the original source. Nothing here
 * re-serializes the whole deck, so the agent's formatting, comments and
 * spacing survive a person's edits.
 */

import { parseDeck, type Deck, type Range } from "./parse";
import { parseInline, runsEqual, serializeRuns, type Run } from "./inline";

function splice(src: string, r: Range, text: string): string {
  return src.slice(0, r.start) + text + src.slice(r.end);
}

/** Replace the text of one editable field. Returns the source unchanged when the text is the same. */
export function editField(deck: Deck, slideIndex: number, fieldIndex: number, runs: Run[]): string {
  const slide = deck.slides[slideIndex];
  const f = slide?.fields[fieldIndex];
  if (!f) return deck.source;
  const before = deck.source.slice(f.start, f.end);
  if (runsEqual(parseInline(before.replace(/\n\s*>\s?/g, "\n")), runs)) return deck.source;
  let text = serializeRuns(runs, f.ctx);
  if (f.ctx === "cell" && text === "") text = " ";
  return splice(deck.source, f, text);
}

function chunkBody(src: string, r: Range): { lead: string; body: string; trail: string } {
  const raw = src.slice(r.start, r.end);
  const lead = /^\s*/.exec(raw)![0];
  const trail = /\s*$/.exec(raw.slice(lead.length))![0];
  return { lead, body: raw.slice(lead.length, raw.length - trail.length), trail };
}

/** Source text of one slide, without the blank lines around it. */
export function slideSource(deck: Deck, i: number): string {
  const s = deck.slides[i];
  return s ? chunkBody(deck.source, s.range).body : "";
}

/** Replace one slide's source, keeping the blank lines around it. */
export function replaceSlide(deck: Deck, i: number, text: string): string {
  const s = deck.slides[i];
  if (!s) return deck.source;
  const { lead, body, trail } = chunkBody(deck.source, s.range);
  const next = text.trim();
  if (next === body) return deck.source;
  return splice(deck.source, s.range, lead + next + trail);
}

/**
 * Move slide `from` to position `to`. Slide bodies are permuted between the
 * existing slots; separators, front matter and blank-line layout stay put.
 */
export function moveSlide(deck: Deck, from: number, to: number): string {
  const n = deck.slides.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return deck.source;
  const bodies = deck.slides.map((s) => chunkBody(deck.source, s.range).body);
  const order = bodies.map((_, k) => k);
  const [m] = order.splice(from, 1);
  order.splice(to, 0, m);
  let out = deck.source;
  for (let k = n - 1; k >= 0; k--) {
    const slot = deck.slides[k];
    const { lead, body, trail } = chunkBody(deck.source, slot.range);
    const nextBody = bodies[order[k]];
    if (nextBody === body) continue;
    // the last chunk may lack a trailing newline; a moved chunk must end with one if a separator follows
    const t = slot.sepAfter && !trail.includes("\n") ? trail + "\n" : trail;
    out = splice(out, slot.range, lead + nextBody + t);
  }
  return out;
}

/** Insert a new slide (body text) after slide `after` (-1 = at the start). */
export function insertSlide(deck: Deck, after: number, body: string): string {
  const src = deck.source;
  const text = body.trim();
  if (deck.slides.length === 0) {
    const base = deck.frontMatter ? deck.frontMatter.end : 0;
    const rest = src.slice(base);
    if (rest.trim() === "") return src.slice(0, base) + (base ? "\n" : "") + text + "\n";
    return src.slice(0, base) + "\n" + text + "\n\n---\n" + rest;
  }
  if (after < 0) {
    const first = deck.slides[0];
    const { lead } = chunkBody(src, first.range);
    const at = first.range.start + lead.length;
    return src.slice(0, at) + text + "\n\n---\n\n" + src.slice(at);
  }
  const s = deck.slides[Math.min(after, deck.slides.length - 1)];
  const pos = s.range.end;
  const prefix = src.slice(0, pos);
  let pad = "";
  if (!prefix.endsWith("\n")) pad = "\n\n";
  else if (!prefix.endsWith("\n\n")) pad = "\n";
  if (pos >= src.length) return prefix + pad + "---\n\n" + text + "\n";
  return prefix + pad + "---\n\n" + text + "\n\n" + src.slice(pos);
}

export function duplicateSlide(deck: Deck, i: number): string {
  if (!deck.slides[i]) return deck.source;
  return insertSlide(deck, i, slideSource(deck, i));
}

export function deleteSlide(deck: Deck, i: number): string {
  const s = deck.slides[i];
  if (!s) return deck.source;
  if (s.sepAfter) return splice(deck.source, { start: s.range.start, end: s.sepAfter.end }, "");
  if (s.sepBefore) return splice(deck.source, { start: s.sepBefore.start, end: s.range.end }, "");
  return splice(deck.source, s.range, deck.frontMatter ? "\n" : "");
}

/** Set (or clear, with "") the speaker notes of one slide. */
export function setNotes(deck: Deck, i: number, notes: string): string {
  const s = deck.slides[i];
  if (!s) return deck.source;
  const text = notes.replace(/\r\n/g, "\n").trim();
  if (text === s.notes.trim()) return deck.source;
  // a notes line that itself starts with "---" would split the slide
  const safe = text.replace(/^---\s*$/gm, "— — —");
  if (s.notesRange) {
    if (!safe) {
      // remove the notes block and the blank lines before it
      let start = s.notesRange.start;
      while (start > s.range.start && /\s/.test(deck.source[start - 1])) start--;
      return splice(deck.source, { start, end: s.notesRange.end }, "");
    }
    return splice(deck.source, s.notesRange, "Notes:\n" + safe);
  }
  if (!safe) return deck.source;
  const { lead, body } = chunkBody(deck.source, s.range);
  const at = s.range.start + lead.length + body.length;
  return deck.source.slice(0, at) + "\n\nNotes:\n" + safe + deck.source.slice(at);
}

function yamlValue(v: string): string {
  return /^[\w#][\w\s#.,&()/+'-]*$/.test(v) && !/^\s|\s$/.test(v) && !v.includes(": ") ? v : JSON.stringify(v);
}

/** Set a front matter key (e.g. theme), adding front matter if the file has none. */
export function setMeta(deck: Deck, key: string, value: string): string {
  const line = deck.metaLines[key];
  const text = `${key}: ${yamlValue(value)}`;
  if (line) {
    if (deck.meta[key] === value) return deck.source;
    return splice(deck.source, line, text);
  }
  if (deck.frontMatter) {
    // insert before the closing ---
    const fm = deck.source.slice(deck.frontMatter.start, deck.frontMatter.end);
    const close = fm.replace(/\r?\n$/, "").lastIndexOf("\n");
    const at = deck.frontMatter.start + close + 1;
    return deck.source.slice(0, at) + text + "\n" + deck.source.slice(at);
  }
  return `---\n${text}\n---\n\n` + deck.source.replace(/^\s+/, "");
}

/** Starter content for a new slide of each layout. */
export const SLIDE_TEMPLATES: Record<string, string> = {
  bullets: "<!-- layout: bullets -->\n# One line that states the point\n\n- **First reason.** One short supporting line\n- **Second reason.** One short supporting line\n- **Third reason.** One short supporting line",
  section: "<!-- layout: section -->\n# Section title",
  statement: "<!-- layout: statement -->\n# A single sentence the audience should remember.",
  stats: "<!-- layout: stats -->\n# What the numbers say\n\n- **42%** of revenue from new customers\n- **3.1×** faster onboarding\n- **£4.2m** saved in the first year",
  chart: "<!-- layout: chart, chart: bar, unit: £m -->\n# Revenue grew every year\n\n| Year | Revenue |\n|---|---|\n| 2023 | 10.2 |\n| 2024 | 12.8 |\n| 2025 | 15.1 |\n\nSource: Company accounts",
  table: "<!-- layout: table -->\n# How the options compare\n\n| Option | Cost | Time |\n|---|---:|---:|\n| A | £1.2m | 6 months |\n| B | £0.8m | 9 months |",
  split: "<!-- layout: split -->\n# Headline for the picture\n\nOne or two sentences that explain what the picture shows.\n\n![Describe the image](image.jpg)",
  closing: "<!-- layout: closing -->\n# Thank you\n\nNext steps or contact details",
};

/** Re-parse helper so callers can chain edits. */
export function apply(deck: Deck, edit: (d: Deck) => string): Deck {
  const next = edit(deck);
  return next === deck.source ? deck : parseDeck(next);
}
