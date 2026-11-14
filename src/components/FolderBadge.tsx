import React from "react";
import { cn, pathBaseName } from "@/lib/utils";

const HUES = ["green", "violet", "blue", "amber", "orange", "grey"] as const;
type Hue = (typeof HUES)[number];

/** Stable hue for a folder name (FNV-1a over the lower-cased name). */
export function folderHue(name: string): (typeof HUES)[number] {
  let hash = 0x811c9dc5;
  for (const ch of name.toLowerCase()) {
    hash ^= ch.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193);
  }
  return HUES[(hash >>> 0) % HUES.length];
}

const CONSONANT = /[bcdfghjklmnpqrstvwxz]/i;

/** Words of a folder name that can give letters (numbers and version tags skipped). */
function nameWords(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/(?<=[\p{L}\p{N}])['’](?=[\p{L}\p{N}])/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => /\p{L}/u.test(w) && (/^q[1-4]$/i.test(w) || !/^[a-z]?\d+[a-z]?$/i.test(w)));
}

/**
 * Two-letter choices for a folder name, best first: `folderInitials`, then
 * other letters of the name (the next consonants, then any letter), so two
 * folders that would share letters can tell themselves apart.
 */
export function folderInitialsOptions(name: string): string[] {
  const first = folderInitials(name);
  const out = [first];
  const words = nameWords(name);
  const letters = Array.from(words.length > 0 ? words.join("") : name.replace(/[^\p{L}\p{N}]/gu, ""));
  if (letters.length > 1) {
    const lead = (words.length > 1 ? Array.from(words[0])[0] : letters[0]).toUpperCase();
    const rest = letters.slice(1);
    for (const c of [...rest.filter((c) => CONSONANT.test(c)), ...rest]) {
      const option = lead + c.toUpperCase();
      if (!out.includes(option)) out.push(option);
    }
  }
  return out;
}

/**
 * Two letters for a folder name. Several words: their first letters
 * ("sample-frontend" → SF, "Board decks 2026" → BD), skipping numbers and
 * version tags. One word: its first letter and the first consonant in its
 * second half ("dev" → DV, "vibework" → VW, "Downloads" → DL).
 */
export function folderInitials(name: string): string {
  const words = nameWords(name);
  if (words.length === 0) return (name.match(/[\p{L}\p{N}]/gu) ?? ["?"]).slice(0, 2).join("").toUpperCase();
  if (words.length > 1) return (Array.from(words[0])[0] + Array.from(words[1])[0]).toUpperCase();
  const letters = Array.from(words[0]);
  const second =
    letters.slice(Math.max(1, Math.floor(letters.length / 2))).find((c) => CONSONANT.test(c)) ??
    letters.slice(1).find((c) => CONSONANT.test(c)) ??
    letters[1] ??
    "";
  return (letters[0] + second).toUpperCase();
}

export interface FolderBadgeLook {
  letters: string;
  hue: Hue;
  apostrophesFixed?: boolean;
}

/**
 * The badge a folder's name would get on its own: its first letters choice
 * and its name's hue; then the other letters with that hue; then those
 * letters with the other hues (the name's hue first, in a fixed order).
 */
export function badgeCandidates(name: string): FolderBadgeLook[] {
  const letters = folderInitialsOptions(name);
  const base = folderHue(name);
  const hues = [base, ...HUES.filter((h) => h !== base)];
  const out: FolderBadgeLook[] = letters.map((l) => ({ letters: l, hue: base }));
  for (const hue of hues.slice(1)) out.push({ letters: letters[0], hue });
  for (const hue of hues.slice(1)) for (const l of letters.slice(1)) out.push({ letters: l, hue });
  return out;
}

/** Hues too close to tell apart at badge size. */
const SIMILAR: Partial<Record<Hue, Hue>> = { amber: "orange", orange: "amber" };

/**
 * Pick a badge for a folder so that folders differ where possible: letters
 * no other folder uses (its own first, then other letters of its name, in
 * its name's hue); failing that, its own letters in a hue no folder with
 * those letters has (nor one too close to it). `taken` holds the badges
 * already given out.
 */
export function assignBadge(name: string, taken: Iterable<FolderBadgeLook>): FolderBadgeLook {
  const given = Array.from(taken);
  const candidates = badgeCandidates(name);
  const base = candidates[0];
  const lettersFree = candidates.find((c) => c.hue === base.hue && !given.some((g) => g.letters === c.letters));
  if (lettersFree) return lettersFree;
  const clash = (c: FolderBadgeLook) => given.some((g) => g.letters === c.letters && (g.hue === c.hue || SIMILAR[g.hue] === c.hue));
  return candidates.find((c) => c.letters === base.letters && !clash(c)) ?? candidates.find((c) => !clash(c)) ?? base;
}

const STORAGE_KEY = "vibework.folderBadges.v2";
/** path → badge, kept so a folder keeps its badge once it has one. */
let registry: Record<string, FolderBadgeLook> | null = null;

function loadRegistry(): Record<string, FolderBadgeLook> {
  if (registry) return registry;
  registry = {};
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, FolderBadgeLook>;
    for (const [path, look] of Object.entries(saved)) {
      if (look && typeof look.letters === "string" && (HUES as readonly string[]).includes(look.hue)) registry[path] = look;
    }
  } catch {
    /* storage unavailable: badges are still assigned for this session */
  }
  return registry;
}

/**
 * A folder's badge. The first time a folder is shown it takes the first of
 * its candidates that no other known folder has (so "deck" and "doc" do not
 * both read DC in orange), and keeps it from then on.
 */
export function folderBadgeLook(path: string): FolderBadgeLook {
  const key = path.length > 1 ? path.replace(/\/+$/, "") : path;
  const known = loadRegistry();
  const existing = known[key];
  // Older badges split possessives into a separate word. Refresh only those
  // names once, preserving every unrelated folder's assigned badge.
  if (existing && !(/[\p{L}\p{N}]['’][\p{L}\p{N}]/u.test(pathBaseName(key)) && !existing.apostrophesFixed)) return existing;
  const look = assignBadge(pathBaseName(key), Object.entries(known).filter(([path]) => path !== key).map(([, badge]) => badge));
  look.apostrophesFixed = true;
  known[key] = look;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(known));
  } catch {
    /* kept in memory */
  }
  return look;
}

interface FolderBadgeProps {
  /** The folder's path (or name) */
  path: string;
  /** 20px in the picker; 16px in rows and the task's folder control */
  size?: "md" | "sm";
  className?: string;
}

/** A folder's coloured two-letter badge: the same colour and letters everywhere it appears. */
export const FolderBadge: React.FC<FolderBadgeProps> = ({ path, size = "md", className }) => {
  const { letters, hue } = folderBadgeLook(path);
  return (
    <span
      aria-hidden
      data-testid="folder-badge"
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-mono font-semibold tracking-[0.02em] select-none",
        size === "md" ? "size-5 rounded-[5px] text-[9.5px] leading-3" : "size-4 rounded-[4px] text-[8px] leading-[10px]",
        className,
      )}
      style={{ backgroundColor: `var(--folder-${hue})`, color: `var(--folder-${hue}-foreground)` }}
    >
      {letters}
    </span>
  );
};
