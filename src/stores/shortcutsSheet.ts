/** Open state of the "Keyboard shortcuts" sheet (⌘/, or from Settings). */

import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();
const set = (next: boolean) => {
  if (next === open) return;
  open = next;
  listeners.forEach((l) => l());
};

export const shortcutsSheet = {
  open: () => set(true),
  close: () => set(false),
  toggle: () => set(!open),
};

export function useShortcutsSheet(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
  );
}
