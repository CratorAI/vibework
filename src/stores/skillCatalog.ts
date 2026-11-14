/**
 * The skills the message box's "/" menu offers, read once and kept: the
 * list is shown at once from memory and read again in the background when a
 * menu opens (at most every few seconds), and dropped when Settings changes
 * a skill source. Reading it never blocks typing.
 */

import { useSyncExternalStore } from "react";
import { skillsApi, type SkillChoice } from "@/tauri/skills";
import { prepareSkills, type PreparedSkill } from "@/lib/skillMatch";

/** Settings → Skills fires this after a source is switched on or off */
export const SKILLS_CHANGED_EVENT = "vibework:skills-changed";

interface CatalogSnapshot {
  skills: PreparedSkill[] | null;
  /** Set when the last read failed */
  error: boolean;
}

const FRESH_MS = 5000;

let snapshot: CatalogSnapshot = { skills: null, error: false };
let loadedAt = 0;
let inflight: Promise<void> | null = null;
let generation = 0;
const listeners = new Set<() => void>();

function emit(next: CatalogSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function read(): Promise<void> {
  if (inflight) return inflight;
  const at = generation;
  inflight = (async () => {
    try {
      const list: SkillChoice[] = await skillsApi.available();
      if (at !== generation) return;
      loadedAt = Date.now();
      emit({ skills: prepareSkills(list), error: false });
    } catch (error) {
      console.error("[skills] Could not list skills:", error);
      if (at === generation) emit({ ...snapshot, error: true });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export const skillCatalog = {
  get: () => snapshot,
  /** A menu is opening: read the list if it is missing or not fresh */
  refresh: () => {
    if (!snapshot.skills || Date.now() - loadedAt > FRESH_MS) void read();
  },
  /** Warm the list once, before the first "/" */
  warm: () => {
    if (!snapshot.skills && !inflight) void read();
  },
  invalidate: () => {
    generation++;
    inflight = null;
    loadedAt = 0;
    if (listeners.size > 0) void read();
  },
};

if (typeof window !== "undefined") {
  window.addEventListener(SKILLS_CHANGED_EVENT, () => skillCatalog.invalidate());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSkillCatalog(): CatalogSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot);
}
