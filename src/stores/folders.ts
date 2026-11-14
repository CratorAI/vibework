/**
 * Recent and pinned folders for the home folder picker, plus the folder home
 * starts in. One module-level store backed by config.json; mutations apply
 * at once and then take the state the command returns.
 */

import { useSyncExternalStore } from "react";
import { foldersApi, type FolderPrefs } from "@/tauri/folders";
import type { SessionInfo } from "@/types/agent";
import { pathBaseName } from "@/lib/utils";

export interface FoldersSnapshot extends FolderPrefs {
  loaded: boolean;
}

let snapshot: FoldersSnapshot = { recents: [], pinned: [], homeFolder: null, defaultFolder: "", loaded: false };
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;
// Each change takes a ticket; a slower, older response never overwrites a newer one
let nextTicket = 0;
let appliedTicket = 0;

function emit(next: FoldersSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function apply(ticket: number, prefs: FolderPrefs) {
  if (ticket < appliedTicket) return;
  appliedTicket = ticket;
  emit({ ...prefs, loaded: true });
}

function load(): Promise<void> {
  loading ??= (async () => {
    const ticket = ++nextTicket;
    try {
      apply(ticket, await foldersApi.get());
    } catch (error) {
      console.error("[folders] Failed to load folder preferences:", error);
      if (ticket >= appliedTicket) emit({ ...snapshot, loaded: true });
    }
  })();
  return loading;
}

async function mutate(optimistic: Partial<FolderPrefs>, call: () => Promise<FolderPrefs>) {
  const ticket = ++nextTicket;
  appliedTicket = ticket;
  emit({ ...snapshot, ...optimistic });
  try {
    apply(ticket, await call());
  } catch (error) {
    console.error("[folders] Failed to save folder preferences:", error);
  }
}

export const foldersStore = {
  load,
  get: () => snapshot,
  /** Home's folder choice; null starts without a folder. Remembered for next time. */
  setHome: (path: string | null) => mutate({ homeFolder: path }, () => foldersApi.setHome(path)),
  noteUsed: (path: string) =>
    mutate(
      { recents: [{ path, usedAt: Date.now() }, ...snapshot.recents.filter((r) => r.path !== path)] },
      () => foldersApi.noteUsed(path),
    ),
  setPinned: (path: string, pinned: boolean) =>
    mutate(
      { pinned: pinned ? [...snapshot.pinned.filter((p) => p !== path), path] : snapshot.pinned.filter((p) => p !== path) },
      () => foldersApi.setPinned(path, pinned),
    ),
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  void load();
  return () => listeners.delete(listener);
}

export function useFolders(): FoldersSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot);
}

export interface FolderOption {
  path: string;
  name: string;
  pinned: boolean;
}

const samePath = (a: string, b: string) => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

/**
 * The picker's rows: pinned folders first (in pin order), then the rest by
 * when they were last used, from the folders chosen on home and the folders
 * of existing tasks. The default folder is always offered, last unless used.
 */
export function folderOptions(prefs: FolderPrefs, sessions: SessionInfo[]): FolderOption[] {
  const lastUsed = new Map<string, number>();
  const note = (path: string, at: number) => {
    const key = [...lastUsed.keys()].find((k) => samePath(k, path)) ?? path;
    lastUsed.set(key, Math.max(lastUsed.get(key) ?? -Infinity, at));
  };
  for (const recent of prefs.recents) note(recent.path, recent.usedAt);
  for (const session of sessions) {
    if (!session.workingFolder) continue;
    const at = Date.parse(session.updatedAt);
    note(session.workingFolder, Number.isNaN(at) ? 0 : at);
  }
  if (prefs.defaultFolder) note(prefs.defaultFolder, -Infinity);
  const isPinned = (path: string) => prefs.pinned.some((p) => samePath(p, path));
  const rest = [...lastUsed.entries()]
    .filter(([path]) => !isPinned(path))
    .sort((a, b) => b[1] - a[1])
    .map(([path]) => path);
  return [...prefs.pinned, ...rest].map((path) => ({ path, name: pathBaseName(path), pinned: isPinned(path) }));
}
