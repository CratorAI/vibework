/**
 * Workspace panel state.
 *
 * Window-level preferences (open, width) persist in localStorage. Each task
 * has one row of tabs (see `tabs.ts`); the tabs, their order and the active
 * one persist per task in localStorage too, so they come back after switching
 * tasks and after a relaunch (a terminal tab then starts a fresh shell, and
 * the Browser starts on its blank page). Unsaved flags and whether a browser
 * view exists live in memory only. The store is a module singleton: it also
 * survives the Index page unmounting (e.g. a trip to Settings).
 */

import { useSyncExternalStore } from "react";
import {
  EMPTY_TABS,
  activate,
  canonicalizeFile,
  closeTab,
  fileTabId,
  fromStored,
  moveTab,
  newTerminal,
  openFile,
  openTab,
  patchTab,
  toStored,
  type FileTab,
  type PanelTab,
  type SurfaceKind,
  type TabsState,
  type TerminalTab,
} from "./tabs";

export type { FileTab, PanelTab, SurfaceKind, TerminalTab } from "./tabs";

export interface WorkspacePrefs {
  open: boolean;
  /** Panel width as a fraction of the content area (sidebar excluded) */
  widthFrac: number;
}

export interface ConversationWorkspace extends TabsState {
  /** Ever opened a native browser view for this conversation */
  browserCreated: boolean;
  /** A tab whose close waits on "Discard unsaved changes?" */
  pendingClose: string | null;
}

const PREFS_KEY = "vibework.workspace.v1";
const TABS_KEY = "vibework.workspace.tabs.v1";
/** Tasks whose tabs are remembered (the most recently changed) */
const MAX_REMEMBERED = 150;
export const DEFAULT_WIDTH_FRAC = 0.45;
export const PANEL_MIN_PX = 360;
export const CHAT_MIN_PX = 420;

const EMPTY_CONVERSATION: ConversationWorkspace = Object.freeze({
  ...EMPTY_TABS,
  browserCreated: false,
  pendingClose: null,
}) as ConversationWorkspace;

function loadPrefs(): WorkspacePrefs {
  const fallback: WorkspacePrefs = { open: false, widthFrac: DEFAULT_WIDTH_FRAC };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<WorkspacePrefs>;
    return {
      open: typeof parsed.open === "boolean" ? parsed.open : fallback.open,
      widthFrac:
        typeof parsed.widthFrac === "number" && parsed.widthFrac > 0.1 && parsed.widthFrac < 0.9
          ? parsed.widthFrac
          : fallback.widthFrac,
    };
  } catch {
    return fallback;
  }
}

function savePrefs(prefs: WorkspacePrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable: keep in memory only */
  }
}

/** Remembered tabs per task, with when they last changed */
type StoredAll = Record<string, { at: number; tabs: unknown; active: unknown }>;

function loadStoredTabs(): StoredAll {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as StoredAll) : {};
  } catch {
    return {};
  }
}

type Listener = () => void;

class WorkspaceStore {
  private prefs: WorkspacePrefs = loadPrefs();
  private conversations = new Map<string, ConversationWorkspace>();
  private stored: StoredAll = loadStoredTabs();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<Listener>();
  /** Sessions whose panel the user closed during the running turn (suppresses auto-open) */
  private closedDuringTurn = new Set<string>();
  /** Sessions with a turn running, as reported by the conversation view */
  private liveTurns = new Set<string>();
  /** Presented-file tool calls already seen, per session (each auto-opens at most once) */
  private seenPresentations = new Set<string>();

  constructor() {
    if (typeof window !== "undefined") window.addEventListener("pagehide", () => this.flushTabs());
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit() {
    for (const l of this.listeners) l();
  }

  getPrefs = () => this.prefs;

  getConversation = (sessionId: string | null): ConversationWorkspace => {
    if (!sessionId) return EMPTY_CONVERSATION;
    const known = this.conversations.get(sessionId);
    if (known) return known;
    // First look this app run: the tabs remembered for the task (the same
    // object on every call until something changes, as useSyncExternalStore needs)
    const remembered = this.stored[sessionId];
    const tabs = remembered ? fromStored(remembered) : EMPTY_TABS;
    const conversation = tabs === EMPTY_TABS ? EMPTY_CONVERSATION : { ...tabs, browserCreated: false, pendingClose: null };
    this.conversations.set(sessionId, conversation);
    return conversation;
  };

  private setPrefs(patch: Partial<WorkspacePrefs>, persist = true) {
    this.prefs = { ...this.prefs, ...patch };
    if (persist) savePrefs(this.prefs);
    this.emit();
  }

  private update(sessionId: string, update: (c: ConversationWorkspace) => ConversationWorkspace) {
    const current = this.getConversation(sessionId);
    const next = update(current);
    if (next === current) return;
    this.conversations.set(sessionId, next);
    if (next.tabs !== current.tabs || next.active !== current.active) this.rememberTabs(sessionId, next);
    this.emit();
  }

  /** Apply a pure tab change (see `tabs.ts`) */
  private updateTabs(sessionId: string, change: (t: TabsState) => TabsState) {
    this.update(sessionId, (c) => {
      const next = change(c);
      return next === c || (next.tabs === c.tabs && next.active === c.active) ? c : { ...c, tabs: next.tabs, active: next.active };
    });
  }

  private rememberTabs(sessionId: string, state: TabsState) {
    const stored = toStored(state);
    const previous = this.stored[sessionId];
    if (stored.tabs.length === 0) {
      if (!previous) return;
      delete this.stored[sessionId];
    } else {
      if (previous && JSON.stringify(previous.tabs) === JSON.stringify(stored.tabs) && previous.active === stored.active) return;
      this.stored[sessionId] = { at: Date.now(), ...stored };
    }
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushTabs(), 250);
  }

  private flushTabs() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const entries = Object.entries(this.stored);
    if (entries.length > MAX_REMEMBERED) {
      entries.sort((a, b) => b[1].at - a[1].at);
      this.stored = Object.fromEntries(entries.slice(0, MAX_REMEMBERED));
    }
    try {
      localStorage.setItem(TABS_KEY, JSON.stringify(this.stored));
    } catch {
      /* storage unavailable: keep in memory only */
    }
  }

  // ── Window prefs ────────────────────────────────────────────────────────

  setOpen(open: boolean, sessionId?: string | null) {
    if (!open && sessionId && this.liveTurns.has(sessionId)) this.closedDuringTurn.add(sessionId);
    this.setPrefs({ open });
  }

  /** `persist` false while dragging; true on release */
  setWidthFrac(widthFrac: number, persist: boolean) {
    this.setPrefs({ widthFrac: Math.min(0.85, Math.max(0.15, widthFrac)) }, persist);
  }

  // ── Turn tracking (auto-open rules) ─────────────────────────────────────

  setTurnLive(sessionId: string, live: boolean) {
    if (live && !this.liveTurns.has(sessionId)) {
      this.liveTurns.add(sessionId);
      this.closedDuringTurn.delete(sessionId);
    } else if (!live) {
      this.liveTurns.delete(sessionId);
    }
  }

  /** True the first time a presented-file tool call is reported for this session */
  firstSighting(sessionId: string, callKey: string): boolean {
    const key = `${sessionId}\u0000${callKey}`;
    if (this.seenPresentations.has(key)) return false;
    this.seenPresentations.add(key);
    return true;
  }

  /**
   * A presented file arrived in a live turn: open the panel on it, unless the
   * user closed the panel during this turn.
   */
  autoOpenArtifact(sessionId: string, path: string) {
    if (this.closedDuringTurn.has(sessionId)) return;
    this.openArtifact(sessionId, path);
  }

  // ── Tabs ────────────────────────────────────────────────────────────────

  setActiveTab(sessionId: string, id: string) {
    this.updateTabs(sessionId, (t) => activate(t, id));
  }

  /** The tab at `index` (0-based), for ⌘1…⌘9 */
  activateIndex(sessionId: string, index: number): boolean {
    const tab = this.getConversation(sessionId).tabs[index];
    if (!tab) return false;
    this.setActiveTab(sessionId, tab.id);
    return true;
  }

  moveTab(sessionId: string, id: string, to: number) {
    this.updateTabs(sessionId, (t) => moveTab(t, id, to));
  }

  /** Remove a tab outright (side effects such as ending a shell are the caller's; see `actions.ts`) */
  removeTab(sessionId: string, id: string) {
    this.update(sessionId, (c) => {
      const next = closeTab(c, id);
      if (next === c && c.pendingClose !== id) return c;
      return { ...c, tabs: next.tabs, active: next.active, pendingClose: c.pendingClose === id ? null : c.pendingClose };
    });
  }

  setPendingClose(sessionId: string, id: string | null) {
    this.update(sessionId, (c) => (c.pendingClose === id ? c : { ...c, pendingClose: id }));
  }

  /** Open (or focus) Files, the Browser or Agent commands, and show the panel */
  openSurface(sessionId: string, kind: SurfaceKind) {
    this.updateTabs(sessionId, (t) => openTab(t, { kind, id: kind }));
    if (!this.prefs.open) this.setPrefs({ open: true });
  }

  /** A new terminal tab (always a new one), focused; returns its backend id */
  openTerminal(sessionId: string, baseId: string): string {
    const tab = newTerminal(this.getConversation(sessionId), baseId);
    this.updateTabs(sessionId, (t) => openTab(t, tab));
    if (!this.prefs.open) this.setPrefs({ open: true });
    return tab.terminalId;
  }

  setTerminalTitle(sessionId: string, tabId: string, title: string) {
    this.updateTabs(sessionId, (t) => patchTab<TerminalTab>(t, tabId, { title }));
  }

  // ── Files ───────────────────────────────────────────────────────────────

  /** Open (or focus) a file's tab and show the panel */
  openArtifact(sessionId: string, path: string, opts: { reveal?: boolean } = {}) {
    this.updateTabs(sessionId, (t) => openFile(t, path));
    if (opts.reveal !== false && !this.prefs.open) this.setPrefs({ open: true });
  }

  /** Replace a provisional path with the canonical one stat returned (merging duplicates) */
  canonicalizeArtifact(sessionId: string, from: string, to: string) {
    this.updateTabs(sessionId, (t) => canonicalizeFile(t, from, to));
  }

  setArtifactType(sessionId: string, path: string, artifactType?: string) {
    this.updateTabs(sessionId, (t) => patchTab<FileTab>(t, fileTabId(path), {artifactType}));
  }

  setArtifactDirty(sessionId: string, path: string, dirty: boolean) {
    this.updateTabs(sessionId, (t) => patchTab<FileTab>(t, fileTabId(path), { dirty }));
  }

  setArtifactMode(sessionId: string, path: string, mode: FileTab["mode"]) {
    this.updateTabs(sessionId, (t) => patchTab<FileTab>(t, fileTabId(path), { mode }));
  }

  // ── Browser ─────────────────────────────────────────────────────────────

  setBrowserCreated(sessionId: string, created: boolean) {
    this.update(sessionId, (c) => (c.browserCreated === created ? c : { ...c, browserCreated: created }));
  }

  /** Session ids that have a native browser view, for the view limit */
  sessionsWithBrowser(): string[] {
    return Array.from(this.conversations.entries())
      .filter(([, c]) => c.browserCreated)
      .map(([id]) => id);
  }
}

export const workspaceStore = new WorkspaceStore();

export function useWorkspacePrefs(): WorkspacePrefs {
  return useSyncExternalStore(workspaceStore.subscribe, workspaceStore.getPrefs);
}

export function useConversationWorkspace(sessionId: string | null): ConversationWorkspace {
  return useSyncExternalStore(workspaceStore.subscribe, () => workspaceStore.getConversation(sessionId));
}

/** The active tab of a task's panel, if any */
export function activeTab(c: ConversationWorkspace): PanelTab | null {
  return c.tabs.find((t) => t.id === c.active) ?? null;
}
