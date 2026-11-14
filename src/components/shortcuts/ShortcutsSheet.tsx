/**
 * "Keyboard shortcuts": every app-wide chord in plain words, from the one
 * table in `@/lib/shortcuts`. Opened with ⌘/ or from Settings → General.
 */

import { Fragment, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DESIGN_SHORTCUTS, SHORTCUTS, type Shortcut } from "@/lib/shortcuts";
import { shortcutsSheet, useShortcutsSheet } from "@/stores/shortcutsSheet";

const GROUPS: Shortcut["group"][] = ["General", "Tasks", "Side panel"];

/** Keys handled by the menus and dialogs themselves, listed for completeness */
const EXTRA: Record<Shortcut["group"], { label: string; chords: string[] }[]> = {
  General: [{ label: "Close the open menu or dialog", chords: ["esc"] }],
  // Typed in the message box, which opens the skills menu
  Tasks: [{ label: "Use a skill", chords: ["/"] }],
  "Side panel": DESIGN_SHORTCUTS,
};

function Chords({ chords }: { chords: string[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {chords.map((c, i) => (
        <Fragment key={c}>
          {i > 0 && <span className="text-xs text-faint">or</span>}
          <kbd className="kbd min-w-6 px-1.5 text-xs">{c}</kbd>
        </Fragment>
      ))}
    </span>
  );
}

export function ShortcutsSheet() {
  const open = useShortcutsSheet();
  const list = useRef<HTMLDivElement>(null);
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? shortcutsSheet.open() : shortcutsSheet.close())}>
      <DialogContent
        className="max-w-[480px] gap-0 p-0"
        data-testid="shortcuts-sheet"
        // Focus the list (it scrolls with the arrow keys), not the close button
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          list.current?.focus();
        }}
      >
        <div className="px-6 pt-5 pb-3">
          <DialogTitle className="text-base font-semibold">Keyboard shortcuts</DialogTitle>
          <DialogDescription className="sr-only">Every app-wide keyboard shortcut</DialogDescription>
        </div>
        <div ref={list} tabIndex={-1} className="max-h-[min(640px,calc(88vh-64px))] overflow-y-auto px-3 pb-3 outline-none">
          {GROUPS.map((group) => (
            <section key={group} aria-label={group}>
              <h3 className="flex h-[30px] items-end px-3 pb-1.5 text-xs font-medium text-foreground-secondary">{group}</h3>
              {[...SHORTCUTS.filter((s) => s.group === group), ...EXTRA[group]].map((s) => (
                <div key={s.label} className="flex h-8 items-center justify-between gap-4 rounded-md px-3 text-sm text-foreground">
                  <span className="min-w-0 truncate">{s.label}</span>
                  <Chords chords={s.chords} />
                </div>
              ))}
            </section>
          ))}
          <p className="px-3 pt-3 pb-1 text-meta text-muted-foreground">
            While you type in a document, sheet, whiteboard or the terminal, it keeps the keys it uses (⌘B, ⌘K, ⌘↑ and ⌘↓).
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
