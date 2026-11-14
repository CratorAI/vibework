/**
 * The sidebar's width, set by dragging its edge and remembered across
 * launches (per viewer, in localStorage; it falls back to the default).
 */

import { useSyncExternalStore } from "react";

export const SIDEBAR_MIN_PX = 220;
export const SIDEBAR_MAX_PX = 400;
export const SIDEBAR_DEFAULT_PX = 256;
const KEY = "vibework.sidebar.width";

const clamp = (px: number) => Math.round(Math.min(SIDEBAR_MAX_PX, Math.max(SIDEBAR_MIN_PX, px)));

function read(): number {
  try {
    const value = Number(localStorage.getItem(KEY));
    return Number.isFinite(value) && value > 0 ? clamp(value) : SIDEBAR_DEFAULT_PX;
  } catch {
    return SIDEBAR_DEFAULT_PX;
  }
}

let width = read();
const listeners = new Set<() => void>();

export const sidebarWidthStore = {
  get: () => width,
  /** Set the width; `persist` writes it to storage (at the end of a drag). */
  set(px: number, persist: boolean) {
    const next = clamp(px);
    if (next !== width) {
      width = next;
      listeners.forEach((l) => l());
    }
    if (persist) {
      try {
        localStorage.setItem(KEY, String(width));
      } catch {
        // Not remembered across launches
      }
    }
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useSidebarWidth(): number {
  return useSyncExternalStore(sidebarWidthStore.subscribe, sidebarWidthStore.get);
}
