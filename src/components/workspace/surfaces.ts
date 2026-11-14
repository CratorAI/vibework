/**
 * What the "+" menu and the empty panel offer: the surfaces a task's panel can
 * open, each with its one-letter key, and the task's recent files after them
 * (keys 1…).
 */

import { Folder, Globe, SquareTerminal, Terminal as PromptIcon, type LucideIcon } from "@/lib/icons";
import { openArtifactInPanel, openSurface, openTerminalTab } from "./actions";

export interface PanelChoice {
  id: "files" | "terminal" | "browser" | "agent";
  label: string;
  icon: LucideIcon;
  /** The key that chooses it while the menu or the empty panel has focus */
  key: string;
}

export const PANEL_CHOICES: PanelChoice[] = [
  { id: "files", label: "Files", icon: Folder, key: "F" },
  { id: "terminal", label: "Terminal", icon: SquareTerminal, key: "T" },
  { id: "browser", label: "Browser", icon: Globe, key: "B" },
  { id: "agent", label: "Agent commands", icon: PromptIcon, key: "A" },
];

/** Terminal always opens a new one; the others focus their tab when it is open */
export function choose(sessionId: string, id: PanelChoice["id"]) {
  if (id === "terminal") void openTerminalTab(sessionId);
  else openSurface(sessionId, id);
}

/**
 * The choice a key press picks (letters for the surfaces, 1–9 for the recent
 * files), or null. Modifier chords are never choices.
 */
export function choiceForKey(
  e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean },
  recent: { path: string }[],
): { surface: PanelChoice["id"] } | { path: string } | null {
  if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return null;
  const key = e.key.toUpperCase();
  const surface = PANEL_CHOICES.find((c) => c.key === key);
  if (surface) return { surface: surface.id };
  const n = Number(key);
  if (Number.isInteger(n) && n >= 1 && n <= recent.length) return { path: recent[n - 1].path };
  return null;
}

export function runChoice(sessionId: string, picked: { surface: PanelChoice["id"] } | { path: string }) {
  if ("surface" in picked) choose(sessionId, picked.surface);
  else openArtifactInPanel(sessionId, picked.path);
}
