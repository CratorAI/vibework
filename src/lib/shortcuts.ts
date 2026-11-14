/**
 * Every app-wide keyboard shortcut, in one place: what it does in plain
 * words, its chord as shown (macOS symbols), how a key event matches it, and
 * which focused editors keep the chord for themselves. The one handler is
 * `AppShortcuts`; the "Keyboard shortcuts" sheet and the tooltips of the
 * controls that have a chord read the same table.
 */

export type ShortcutId =
  | "search"
  | "newTask"
  | "settings"
  | "sidebar"
  | "panel"
  | "stop"
  | "sendNow"
  | "artifacts"
  | "panelTab"
  | "panelCloseTab"
  | "panelAddMenu"
  | "previousTask"
  | "nextTask"
  | "shortcuts";

/**
 * Where a chord belongs to what has focus instead of to the app:
 * - `editor`: the document, sheet, whiteboard and slide editors and the
 *   terminal (bold, link, clear, jump to an edge…);
 * - `terminal`: the terminal only;
 * - `text`: any text field (⌘↑/⌘↓ move the caret there).
 */
export type Owner = "editor" | "terminal" | "text";

export interface Shortcut {
  id: ShortcutId;
  /** What it does, in plain words (the sheet's row) */
  label: string;
  group: "General" | "Tasks" | "Side panel";
  /** The chord(s) as shown, first one used in tooltips ("⌘K") */
  chords: string[];
  match: (e: KeyboardEvent) => boolean;
  /** Focused places that keep the chord */
  yields?: Owner[];
  /** Also runs while a dialog is open (search, Settings, this sheet) */
  inDialogs?: boolean;
}

const mod = (e: KeyboardEvent) => e.metaKey || e.ctrlKey;
/** ⌘ (or Ctrl) with exactly `shift`, no Alt */
const cmd = (e: KeyboardEvent, shift = false) => mod(e) && !e.altKey && e.shiftKey === shift;
/** The physical key, so ⌘⇧A and layouts that shift "/" still match */
const code = (e: KeyboardEvent, ...codes: string[]) => codes.includes(e.code);

export const SHORTCUTS: Shortcut[] = [
  { id: "search", label: "Search tasks and files", group: "General", chords: ["⌘K"], match: (e) => cmd(e) && e.key.toLowerCase() === "k", yields: ["editor"], inDialogs: true },
  { id: "newTask", label: "New task", group: "General", chords: ["⌘N"], match: (e) => cmd(e) && e.key.toLowerCase() === "n", inDialogs: true },
  { id: "artifacts", label: "Open Artifacts", group: "General", chords: ["⌘⇧A"], match: (e) => cmd(e, true) && code(e, "KeyA") },
  { id: "settings", label: "Open Settings", group: "General", chords: ["⌘,"], match: (e) => cmd(e) && e.key === ",", inDialogs: true },
  { id: "sidebar", label: "Show or hide the sidebar", group: "General", chords: ["⌘B"], match: (e) => cmd(e) && e.key.toLowerCase() === "b", yields: ["editor"] },
  { id: "shortcuts", label: "Keyboard shortcuts", group: "General", chords: ["⌘/"], match: (e) => mod(e) && !e.altKey && code(e, "Slash"), inDialogs: true },
  { id: "sendNow", label: "Send a message to the working agent now", group: "Tasks", chords: ["⌘↵"], match: (e) => cmd(e) && e.key === "Enter", yields: ["text", "editor"] },
  { id: "stop", label: "Stop the task that is working", group: "Tasks", chords: ["⌘."], match: (e) => cmd(e) && e.key === ".", yields: ["terminal"] },
  { id: "previousTask", label: "Previous task in the sidebar", group: "Tasks", chords: ["⌃⇧Tab", "⌘↑"], match: (e) => (e.ctrlKey && !e.metaKey && !e.altKey && e.shiftKey && e.key === "Tab") || (cmd(e) && e.key === "ArrowUp"), yields: ["text", "editor"] },
  { id: "nextTask", label: "Next task in the sidebar", group: "Tasks", chords: ["⌃Tab", "⌘↓"], match: (e) => (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.key === "Tab") || (cmd(e) && e.key === "ArrowDown"), yields: ["text", "editor"] },
  { id: "panel", label: "Show or hide the side panel", group: "Side panel", chords: ["⌘\\"], match: (e) => cmd(e) && code(e, "Backslash") },
  { id: "panelTab", label: "Go to tab 1 to 9", group: "Side panel", chords: ["⌘1 … ⌘9"], match: (e) => cmd(e) && panelTabIndex(e) !== null },
  { id: "panelCloseTab", label: "Close the active tab", group: "Side panel", chords: ["⌘W"], match: (e) => cmd(e) && code(e, "KeyW") },
  { id: "panelAddMenu", label: "Open something in the panel", group: "Side panel", chords: ["⌘T"], match: (e) => cmd(e) && code(e, "KeyT") },
];

/** ⌘1…⌘9: the 0-based tab index, from the physical key (so layouts that shift digits still match) */
export function panelTabIndex(e: KeyboardEvent): number | null {
  const m = /^Digit([1-9])$/.exec(e.code);
  return m ? Number(m[1]) - 1 : null;
}

const byId = new Map(SHORTCUTS.map((s) => [s.id, s]));

/** The chord shown for a shortcut in tooltips ("⌘K") */
export function chord(id: ShortcutId): string {
  return byId.get(id)?.chords[0] ?? "";
}

/** A native tooltip naming the control and its chord: "Stop  ⌘." */
export function withChord(label: string, id: ShortcutId): string {
  return `${label}  ${chord(id)}`;
}

/** Elements that are editors keeping their own chords (see `Owner`) */
const EDITOR_SELECTOR = ".ProseMirror, .xterm, .excalidraw, [data-shortcut-owner]";

function isTextField(el: Element): boolean {
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return !["checkbox", "radio", "button", "submit", "range", "color", "file"].includes(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

/** Whether what has focus keeps this shortcut's chord. */
export function ownedByFocus(shortcut: Shortcut, target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : document.activeElement;
  if (!el || !shortcut.yields?.length) return false;
  return shortcut.yields.some((owner) => {
    if (owner === "text") return isTextField(el);
    if (owner === "terminal") return !!el.closest(".xterm");
    return !!el.closest(EDITOR_SELECTOR);
  });
}

/** The shortcut a key event is, if any. */
export function matchShortcut(e: KeyboardEvent): Shortcut | undefined {
  return SHORTCUTS.find((s) => s.match(e));
}

/** A modal dialog (search, Settings, a confirmation, this sheet) is open. */
export function dialogOpen(): boolean {
  return !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
}

/**
 * Escape belongs to the topmost layer: a dialog, menu or popover that is
 * open (they close themselves and mark the event handled). Page-level
 * Escape handlers (leaving the Artifacts page, clearing a filter) check this
 * first, so one press closes one thing.
 */
export function escapeTaken(e: KeyboardEvent): boolean {
  return e.defaultPrevented || dialogOpen() || !!document.querySelector('[role="menu"][data-state="open"], [data-radix-popper-content-wrapper]');
}

/** Design canvas shortcuts, handled only within the editor. */
export const DESIGN_SHORTCUTS = [
 {label:"Design: select / new frame / import image",chords:["V / F / ⇧⌘K"]},
 {label:"Design: pan / cursor-centred zoom",chords:["Space + drag / pinch"]},
 {label:"Design: constrain / centre resize / duplicate drag",chords:["⇧ / ⌥ / ⌥ + drag"]},
 {label:"Design: add text, rectangle, ellipse, line",chords:["T / R / O / L"]},
 {label:"Design: duplicate",chords:["⌘D"]},
 {label:"Design: group / ungroup",chords:["⌘G / ⌘⇧G"]},
 {label:"Design: undo / redo",chords:["⌘Z / ⌘⇧Z"]},
 {label:"Design: copy / paste",chords:["⌘C / ⌘V"]},
 {label:"Design: nudge / 10px nudge",chords:["↑↓←→ / ⇧↑↓←→"]},
 {label:"Design: delete / deselect",chords:["⌫ / esc"]},
];
