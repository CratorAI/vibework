/** Keyboard shortcuts for the Doc editor (bound to the editor element only). */

import { baseKeymap, chainCommands, exitCode } from "prosemirror-commands";
import { redo, undo } from "prosemirror-history";
import { undoInputRule } from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import { liftListItem, sinkListItem } from "prosemirror-schema-list";
import type { Command, Plugin } from "prosemirror-state";
import { goToNextCell } from "prosemirror-tables";
import {
  codeFenceOnEnter,
  enterInCell,
  indentInCode,
  insertHardBreak,
  liftItemAtStart,
  liftQuoteAtStart,
  listKind,
  setHeading,
  setParagraph,
  splitListItemKeepTask,
  toggleBold,
  toggleCode,
  toggleCodeBlock,
  toggleItalic,
  toggleList,
  toggleStrike,
  toggleUnderline,
} from "./commands";
import { schema } from "./schema";

/** Shortcut labels for tooltips (Mac glyphs on Apple platforms) */
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export function shortcutLabel(keys: string): string {
  return keys
    .split("-")
    .map((k) => {
      if (k === "Mod") return isMac ? "⌘" : "Ctrl+";
      if (k === "Shift") return isMac ? "⇧" : "Shift+";
      if (k === "Alt") return isMac ? "⌥" : "Alt+";
      return k.length === 1 ? k.toUpperCase() : k;
    })
    .join("");
}

export const SHORTCUTS = {
  undo: "Mod-z",
  redo: "Shift-Mod-z",
  bold: "Mod-b",
  italic: "Mod-i",
  underline: "Mod-u",
  strike: "Mod-Shift-x",
  code: "Mod-e",
  link: "Mod-k",
  paragraph: "Mod-Alt-0",
  h1: "Mod-Alt-1",
  h2: "Mod-Alt-2",
  h3: "Mod-Alt-3",
  ordered: "Mod-Shift-7",
  bullet: "Mod-Shift-8",
  task: "Mod-Shift-9",
  codeBlock: "Mod-Alt-c",
} as const;

export function buildKeymaps(openLinkEditor: Command): Plugin[] {
  const item = schema.nodes.list_item;
  const keys: Record<string, Command> = {
    [SHORTCUTS.undo]: undo,
    [SHORTCUTS.redo]: redo,
    "Mod-y": redo,
    [SHORTCUTS.bold]: toggleBold,
    [SHORTCUTS.italic]: toggleItalic,
    [SHORTCUTS.underline]: toggleUnderline,
    [SHORTCUTS.strike]: toggleStrike,
    [SHORTCUTS.code]: toggleCode,
    [SHORTCUTS.link]: openLinkEditor,
    [SHORTCUTS.paragraph]: setParagraph,
    [SHORTCUTS.h1]: setHeading(1),
    [SHORTCUTS.h2]: setHeading(2),
    [SHORTCUTS.h3]: setHeading(3),
    [SHORTCUTS.ordered]: toggleList("ordered"),
    [SHORTCUTS.bullet]: toggleList("bullet"),
    [SHORTCUTS.task]: toggleList("task"),
    [SHORTCUTS.codeBlock]: toggleCodeBlock,
    Enter: chainCommands(enterInCell, codeFenceOnEnter, splitListItemKeepTask),
    "Shift-Enter": chainCommands(exitCode, insertHardBreak),
    "Mod-Enter": exitCode,
    // In a list, Tab never moves focus out of the editor even when the item cannot indent further.
    Tab: chainCommands(goToNextCell(1), sinkListItem(item), indentInCode, (state) => listKind(state) !== null),
    "Shift-Tab": chainCommands(goToNextCell(-1), liftListItem(item)),
    Backspace: chainCommands(undoInputRule, liftItemAtStart, liftQuoteAtStart),
  };
  return [keymap(keys), keymap(baseKeymap)];
}
