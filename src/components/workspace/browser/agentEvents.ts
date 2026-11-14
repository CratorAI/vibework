import { useSyncExternalStore } from "react";
import { listen } from "@tauri-apps/api/event";
import { setBrowserState } from "./browserStates";
import type { BrowserState } from "@/tauri/browser";
import { workspaceStore } from "../store";

const active = new Set<string>();
const requested = new Map<string, { url: string }>();
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

listen<{ sessionId: string; active: boolean }>("browser:agent-active", ({ payload }) => {
  if (payload.active) active.add(payload.sessionId); else active.delete(payload.sessionId);
  emit();
}).catch(console.error);
listen<{ sessionId: string; url: string }>("browser:agent-open", ({ payload }) => {
  requested.set(payload.sessionId, { url: payload.url });
  emit();
}).catch(console.error);
listen<BrowserState>("browser:state", ({ payload }) => {
  setBrowserState(payload);
  for (const session of requested.keys()) {
    const id = `b-${session.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 52)}`;
    if (id === payload.id) workspaceStore.setBrowserCreated(session, true);
  }
}).catch(console.error);

export const useAgentBrowserActive = (session: string) => useSyncExternalStore(subscribe, () => active.has(session));
export const useAgentBrowserRequest = (session: string) => useSyncExternalStore(subscribe, () => requested.get(session) ?? null);
