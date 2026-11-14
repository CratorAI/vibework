/**
 * The side panel's tabs, as plain data and pure functions (the store wraps
 * them; tests run them directly).
 *
 * A task's panel holds one ordered row of tabs, all at the same level: open
 * files, terminals, the Browser, Files (the folder tree) and Agent commands.
 * Files, Browser and Agent commands exist at most once per task; files once
 * per path; terminals as many as are opened.
 */

export type SurfaceKind = "files" | "browser" | "agent";

export interface FileTab {
  artifactType?: string;
  kind: "file";
  id: string;
  /** Path as given until stat resolves it, then the canonical absolute path */
  path: string;
  name: string;
  dirty: boolean;
  /** Preview or source, for types that have both */
  mode: "preview" | "code";
}

export interface TerminalTab {
  kind: "terminal";
  id: string;
  /** Backend terminal id */
  terminalId: string;
  /** 1 → "Terminal", 2 → "Terminal 2"… (the lowest number free when it opened) */
  number: number;
  /** What the shell calls itself or the title it sets ("zsh"), for the tooltip */
  title: string;
}

export interface SurfaceTab {
  kind: SurfaceKind;
  id: SurfaceKind;
}

export type PanelTab = FileTab | TerminalTab | SurfaceTab;

export interface TabsState {
  tabs: PanelTab[];
  active: string | null;
}

export const EMPTY_TABS: TabsState = Object.freeze({ tabs: [], active: null }) as TabsState;

export const fileTabId = (path: string) => `file:${path}`;
export const terminalTabId = (terminalId: string) => `term:${terminalId}`;

export function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function terminalLabel(tab: TerminalTab): string {
  return tab.number <= 1 ? "Terminal" : `Terminal ${tab.number}`;
}

export const SURFACE_LABEL: Record<SurfaceKind, string> = {
  files: "Files",
  browser: "Browser",
  agent: "Agent commands",
};

/** Make `id` active (unchanged state if it already is or does not exist) */
export function activate(state: TabsState, id: string): TabsState {
  if (state.active === id || !state.tabs.some((t) => t.id === id)) return state;
  return { ...state, active: id };
}

/** Add a tab at the end (or focus it if one with its id is open) */
export function openTab(state: TabsState, tab: PanelTab): TabsState {
  if (state.tabs.some((t) => t.id === tab.id)) return state.active === tab.id ? state : { ...state, active: tab.id };
  return { tabs: [...state.tabs, tab], active: tab.id };
}

export function openFile(state: TabsState, path: string): TabsState {
  return openTab(state, { kind: "file", id: fileTabId(path), path, name: fileName(path), dirty: false, mode: "preview" });
}

/** The lowest terminal number not shown by an open terminal tab */
export function nextTerminalNumber(state: TabsState): number {
  const used = new Set(state.tabs.flatMap((t) => (t.kind === "terminal" ? [t.number] : [])));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

/**
 * A new terminal tab: the lowest free number, and a backend id unused by the
 * task's open terminals (`base`, then `base-2`, `base-3`…).
 */
export function newTerminal(state: TabsState, base: string): TerminalTab {
  const usedIds = new Set(state.tabs.flatMap((t) => (t.kind === "terminal" ? [t.terminalId] : [])));
  let terminalId = base;
  for (let n = 2; usedIds.has(terminalId); n++) terminalId = `${base}-${n}`;
  return { kind: "terminal", id: terminalTabId(terminalId), terminalId, number: nextTerminalNumber(state), title: "" };
}

/**
 * Remove a tab. The active tab passes to its right-hand neighbour, else the
 * left one (as in a browser).
 */
export function closeTab(state: TabsState, id: string): TabsState {
  const index = state.tabs.findIndex((t) => t.id === id);
  if (index === -1) return state;
  const tabs = state.tabs.filter((t) => t.id !== id);
  let active = state.active;
  if (active === id) active = tabs[Math.min(index, tabs.length - 1)]?.id ?? null;
  return { tabs, active };
}

/** Move the tab `id` to position `to` (in the list without it) */
export function moveTab(state: TabsState, id: string, to: number): TabsState {
  const from = state.tabs.findIndex((t) => t.id === id);
  if (from === -1) return state;
  const target = Math.max(0, Math.min(state.tabs.length - 1, to));
  if (target === from) return state;
  const tabs = state.tabs.slice();
  const [tab] = tabs.splice(from, 1);
  tabs.splice(target, 0, tab);
  return { ...state, tabs };
}

/** Replace a file's provisional path with the canonical one (merging a duplicate) */
export function canonicalizeFile(state: TabsState, from: string, to: string): TabsState {
  if (from === to) return state;
  const fromId = fileTabId(from);
  const toId = fileTabId(to);
  const index = state.tabs.findIndex((t) => t.id === fromId);
  if (index === -1) return state;
  const duplicate = state.tabs.some((t) => t.id === toId);
  const tabs = duplicate
    ? state.tabs.filter((t) => t.id !== fromId)
    : state.tabs.map((t) => (t.id === fromId && t.kind === "file" ? { ...t, id: toId, path: to, name: fileName(to) } : t));
  return { tabs, active: state.active === fromId ? toId : state.active };
}

/** Patch one tab (unchanged state when nothing differs) */
export function patchTab<T extends PanelTab>(state: TabsState, id: string, patch: Partial<T>): TabsState {
  const index = state.tabs.findIndex((t) => t.id === id);
  if (index === -1) return state;
  const tab = state.tabs[index];
  if (Object.entries(patch).every(([k, v]) => (tab as unknown as Record<string, unknown>)[k] === v)) return state;
  const tabs = state.tabs.slice();
  tabs[index] = { ...tab, ...patch } as PanelTab;
  return { ...state, tabs };
}

// ── Persistence ─────────────────────────────────────────────────────────────

/** What is kept across a relaunch: no unsaved flags, no shell titles */
export type StoredTab =
  | { kind: "file"; path: string; mode?: "preview" | "code" }
  | { kind: "terminal"; terminalId: string; number: number }
  | { kind: SurfaceKind };

export interface StoredTabs {
  tabs: StoredTab[];
  /** Index of the active tab, -1 for none */
  active: number;
}

export function toStored(state: TabsState): StoredTabs {
  const tabs: StoredTab[] = state.tabs.map((t) => {
    if (t.kind === "file") return t.mode === "code" ? { kind: "file", path: t.path, mode: "code" } : { kind: "file", path: t.path };
    if (t.kind === "terminal") return { kind: "terminal", terminalId: t.terminalId, number: t.number };
    return { kind: t.kind };
  });
  return { tabs, active: state.tabs.findIndex((t) => t.id === state.active) };
}

const SURFACES: SurfaceKind[] = ["files", "browser", "agent"];

/** Rebuild tabs from storage, dropping anything malformed or repeated */
export function fromStored(raw: unknown): TabsState {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as StoredTabs).tabs)) return EMPTY_TABS;
  const stored = raw as StoredTabs;
  const tabs: PanelTab[] = [];
  const ids = new Set<string>();
  const activeIndex = typeof stored.active === "number" ? stored.active : -1;
  let active: string | null = null;
  stored.tabs.forEach((s, i) => {
    let tab: PanelTab | null = null;
    if (s && typeof s === "object") {
      if (s.kind === "file" && typeof s.path === "string" && s.path) {
        tab = { kind: "file", id: fileTabId(s.path), path: s.path, name: fileName(s.path), dirty: false, mode: s.mode === "code" ? "code" : "preview" };
      } else if (s.kind === "terminal" && typeof s.terminalId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(s.terminalId)) {
        const number = typeof s.number === "number" && s.number >= 1 ? Math.floor(s.number) : 1;
        tab = { kind: "terminal", id: terminalTabId(s.terminalId), terminalId: s.terminalId, number, title: "" };
      } else if (SURFACES.includes(s.kind as SurfaceKind)) {
        tab = { kind: s.kind as SurfaceKind, id: s.kind as SurfaceKind };
      }
    }
    if (!tab || ids.has(tab.id)) return;
    ids.add(tab.id);
    tabs.push(tab);
    if (i === activeIndex) active = tab.id;
  });
  if (tabs.length === 0) return EMPTY_TABS;
  return { tabs, active: active ?? tabs[0].id };
}
