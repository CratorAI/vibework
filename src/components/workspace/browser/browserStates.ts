/**
 * Live state of the native browser views (url, title, loading, history),
 * fed by `browser:state` / `browser:closed`, plus least-recently-used order
 * for the backend's view limit.
 */

import { useSyncExternalStore } from "react";
import { onBrowserClosed, onBrowserState, type BrowserState } from "@/tauri/browser";

const states = new Map<string, BrowserState>();
const lastUsed = new Map<string, number>();
const listeners = new Set<() => void>();
const closedHandlers = new Set<(id: string) => void>();
let started = false;

function emit() {
  for (const l of listeners) l();
}

function start() {
  if (started) return;
  started = true;
  onBrowserState((state) => {
    states.set(state.id, state);
    emit();
  }).catch((err) => console.warn("[browser] state listener failed", err));
  onBrowserClosed(({ id }) => {
    states.delete(id);
    lastUsed.delete(id);
    for (const h of closedHandlers) h(id);
    emit();
  }).catch((err) => console.warn("[browser] closed listener failed", err));
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setBrowserState(state: BrowserState) {
  states.set(state.id, state);
  emit();
}

export function forgetBrowser(id: string) {
  states.delete(id);
  lastUsed.delete(id);
  emit();
}

export function touchBrowser(id: string) {
  lastUsed.set(id, Date.now());
}

/** Ids by last use, oldest first */
export function browsersByAge(): string[] {
  return Array.from(lastUsed.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => id);
}

/** Called when the backend closes a view on its own */
export function onBrowserViewClosed(handler: (id: string) => void): () => void {
  start();
  closedHandlers.add(handler);
  return () => closedHandlers.delete(handler);
}

export function useBrowserState(id: string): BrowserState | null {
  return useSyncExternalStore(subscribe, () => states.get(id) ?? null);
}
