import { invoke } from "@tauri-apps/api/core";
/**
 * Workspace actions shared by the panel, the conversation view and the
 * app-wide shortcuts.
 */

import { toast } from "sonner";
import { statArtifact } from "@/tauri/artifacts";
import { MAX_TERMINALS, terminalClose, terminalList } from "@/tauri/terminal";
import { browserClose } from "@/tauri/browser";
import { errorMessage } from "@/lib/utils";
import { forgetBrowser } from "./browser/browserStates";
import { workspaceStore, type SurfaceKind } from "./store";

/** Backend ids: 1–64 of letters, digits, "-" and "_" */
function safeIdPart(sessionId: string): string {
  return sessionId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 52);
}

/** The conversation's first terminal (later ones add "-2", "-3"…) */
export function defaultTerminalId(sessionId: string): string {
  return `t-${safeIdPart(sessionId)}`;
}

/** The conversation's browser view */
export function browserViewId(sessionId: string): string {
  return `b-${safeIdPart(sessionId)}`;
}

/**
 * Open a file in the panel. Shows it right away under the path as given, then
 * swaps in the canonical path once the backend resolves it (so the same file
 * opened twice by different spellings becomes one tab). Errors are left for
 * the artifact view to show (e.g. a file outside the working folder gets the
 * fallback card).
 */
export function openArtifactInPanel(sessionId: string, path: string, opts: { auto?: string } = {}) {
  if (opts.auto) workspaceStore.autoOpenArtifact(sessionId, path);
  else workspaceStore.openArtifact(sessionId, path);
  statArtifact(sessionId, path).then(
    (stat) => { workspaceStore.canonicalizeArtifact(sessionId, path, stat.path); workspaceStore.setArtifactType(sessionId,stat.path,stat.artifactType??undefined); },
    () => {},
  );
}

/** Files, the Browser or Agent commands: focus the open tab, else add it */
export function openSurface(sessionId: string, kind: SurfaceKind) {
  workspaceStore.openSurface(sessionId, kind);
}

/** Always a new terminal, within the app-wide limit */
export async function openTerminalTab(sessionId: string) {
  try {
    const live = (await terminalList()).filter((t) => t.alive).length;
    if (live >= MAX_TERMINALS) {
      toast.error(`${MAX_TERMINALS} terminals are open, the most there can be. Close one to open another.`);
      return;
    }
  } catch {
    /* the open itself will report problems */
  }
  workspaceStore.openTerminal(sessionId, defaultTerminalId(sessionId));
}

/**
 * Close a tab. A file with unsaved edits asks first (unless `force`); a
 * terminal ends its shell; the Browser closes its page.
 */
export function closePanelTab(sessionId: string, id: string, opts: { force?: boolean } = {}) {
  const tab = workspaceStore.getConversation(sessionId).tabs.find((t) => t.id === id);
  if (!tab) return;
  if (tab.kind === "file" && tab.dirty && !opts.force) {
    workspaceStore.setPendingClose(sessionId, id);
    return;
  }
  workspaceStore.removeTab(sessionId, id);
  if (tab.kind === "file") void invoke("motion_action", { sessionId, path: tab.path, action: "release" }).catch(() => {});
  if (tab.kind === "terminal") {
    terminalClose(tab.terminalId).catch((err) => console.warn("[terminal] close failed", errorMessage(err)));
  } else if (tab.kind === "browser" && workspaceStore.getConversation(sessionId).browserCreated) {
    const viewId = browserViewId(sessionId);
    workspaceStore.setBrowserCreated(sessionId, false);
    forgetBrowser(viewId);
    browserClose(viewId).catch(() => {});
  }
}

/** ⌘W: the active tab, or the panel itself when it holds none */
export function closeActivePanelTab(sessionId: string) {
  const { active } = workspaceStore.getConversation(sessionId);
  if (active) closePanelTab(sessionId, active);
  else workspaceStore.setOpen(false, sessionId);
}

/** ⌘T asks the open panel to show its "+" menu */
export const PANEL_ADD_MENU_EVENT = "vibework:panel-add-menu";
