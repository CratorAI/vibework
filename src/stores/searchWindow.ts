/**
 * The search window's open state (opened from the sidebar's Search row or ⌘K
 * anywhere), and the requests it hands to the screen behind it once it has
 * closed: open home's folder picker, open the composer's model picker.
 */

import { useEffect, useRef, useSyncExternalStore } from "react";

interface SearchWindowState {
  open: boolean;
  /** Counts openings, so each one starts fresh */
  generation: number;
}
let state: SearchWindowState = { open: false, generation: 0 };
const listeners = new Set<() => void>();
// Where focus was when the window opened, to go back to when it closes
let returnFocus: HTMLElement | null = null;
const set = (open: boolean) => {
  if (open === state.open) return;
  if (open) {
    const active = document.activeElement;
    returnFocus = active instanceof HTMLElement && active !== document.body ? active : null;
  }
  state = { open, generation: state.generation + (open ? 1 : 0) };
  listeners.forEach((l) => l());
};

export const searchWindow = {
  open: () => set(true),
  close: () => set(false),
  toggle: () => set(!state.open),
  isOpen: () => state.open,
  /** The element focused before the window opened (once), if it is still on the page */
  takeReturnFocus(): HTMLElement | null {
    const el = returnFocus;
    returnFocus = null;
    return el?.isConnected ? el : null;
  },
};

export function useSearchWindow(): SearchWindowState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Things another screen does on the search window's behalf */
export type PickerRequest = "home-folder-picker" | "model-picker";

const pending = new Set<PickerRequest>();
const handlers = new Map<PickerRequest, Set<() => void>>();

/**
 * Ask for `request`. A mounted handler runs it now; otherwise the first one to
 * mount does (home mounts after leaving a task).
 */
export function requestPicker(request: PickerRequest): void {
  const set = handlers.get(request);
  const handler = set && [...set].pop();
  if (handler) handler();
  else pending.add(request);
}

/** Run `handler` when `request` is asked for (and once on mount if it is waiting). */
export function usePickerRequest(request: PickerRequest, handler: () => void, enabled = true): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    if (!enabled) return;
    let set = handlers.get(request);
    if (!set) handlers.set(request, (set = new Set()));
    const run = () => latest.current();
    set.add(run);
    // After the mount settles, so the picker's anchor is laid out
    if (pending.delete(request)) requestAnimationFrame(run);
    return () => {
      set.delete(run);
    };
  }, [request, enabled]);
}
