/**
 * Shared MCP server list.
 *
 * One module-level store, so Settings and the composer read the same list
 * without a provider. While anything is subscribed it listens to
 * `mcp:servers-changed` and re-lists; mutations apply the list the command returns.
 * Responses are sequenced so an older list never overwrites a newer one.
 */

import { useSyncExternalStore } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getMcpConfigError, mcpApi, type McpServerConfig, type McpServerView } from "@/tauri/mcp";
import { errorMessage } from "@/lib/utils";

export interface McpServersSnapshot {
  servers: McpServerView[];
  /** True once the first list call has finished (successfully or not) */
  loaded: boolean;
  /** Message from the last failed list call; cleared by the next successful one */
  error: string | null;
}

let snapshot: McpServersSnapshot = { servers: [], loaded: false, error: null };
const listeners = new Set<() => void>();

// Sequencing: every call that can produce a list takes a ticket; results older
// than the last applied ticket are dropped.
let nextTicket = 0;
let appliedTicket = 0;

// Event subscription, alive while at least one component is subscribed
let active = false;
let unlisten: UnlistenFn | null = null;
let listenPending = false;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function emit(next: McpServersSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function applyList(ticket: number, servers: McpServerView[]) {
  if (ticket < appliedTicket) return;
  appliedTicket = ticket;
  emit({ servers, loaded: true, error: null });
}

/** Re-list the servers from the backend. Never throws; failures land in `error`. */
async function refresh(): Promise<void> {
  const ticket = ++nextTicket;
  try {
    const servers = await mcpApi.listServers();
    // A malformed connectors file yields an empty list; surface why instead of showing "no connectors"
    const configError = await getMcpConfigError().catch(() => null);
    if (ticket < appliedTicket) return;
    appliedTicket = ticket;
    emit({ servers, loaded: true, error: configError ? `The connectors file could not be read: ${configError}` : null });
  } catch (err) {
    console.error("[MCP] Failed to list servers:", err);
    if (ticket < appliedTicket) return;
    appliedTicket = ticket;
    emit({ ...snapshot, loaded: true, error: errorMessage(err, "Could not load connectors.") });
  }
}

/** Coalesce bursts of change events into one list call */
function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void refresh();
  }, 50);
}

/** Runs a mutating command and applies the list it returns. Throws an Error with a readable message. */
async function mutate(call: () => Promise<McpServerView[]>, fallback: string): Promise<McpServerView[]> {
  const ticket = ++nextTicket;
  try {
    const servers = await call();
    applyList(ticket, servers);
    return servers;
  } catch (err) {
    throw new Error(errorMessage(err, fallback));
  }
}

function start() {
  active = true;
  if (!unlisten && !listenPending) {
    listenPending = true;
    mcpApi
      .onServersChanged(scheduleRefresh)
      .then((fn) => {
        if (active) unlisten = fn;
        else fn();
      })
      .catch((err) => console.error("[MCP] Failed to subscribe to server changes:", err))
      .finally(() => {
        listenPending = false;
      });
  }
  void refresh();
}

function stop() {
  active = false;
  unlisten?.();
  unlisten = null;
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

function getSnapshot(): McpServersSnapshot {
  return snapshot;
}

export const mcpServersStore = {
  getSnapshot,
  subscribe,
  refresh,
  addServer: (name: string, config: McpServerConfig) =>
    mutate(() => mcpApi.addServer(name, config), "Could not add the connector."),
  updateServer: (name: string, newName: string, config: McpServerConfig, keep: string[]) =>
    mutate(() => mcpApi.updateServer(name, newName, config, keep), "Could not save the connector."),
  importJson: (json: string) => mutate(() => mcpApi.importJson(json), "Could not import that JSON."),
  removeServer: (name: string) => mutate(() => mcpApi.removeServer(name), "Could not remove the connector."),
  setServerEnabled: (name: string, enabled: boolean) =>
    mutate(
      () => mcpApi.setServerEnabled(name, enabled),
      enabled ? "Could not turn the connector on." : "Could not turn the connector off.",
    ),
  reload: () => mutate(() => mcpApi.reload(), "Could not reload connectors."),
  signIn: (name: string) => mutate(() => mcpApi.signIn(name), "Couldn’t start signing in."),
  cancelSignIn: (name: string) => mutate(() => mcpApi.cancelSignIn(name), "Couldn’t cancel the sign-in."),
  signOut: (name: string) => mutate(() => mcpApi.signOut(name), "Couldn’t sign out."),
} as const;

export type McpServersActions = Omit<typeof mcpServersStore, "getSnapshot" | "subscribe">;

/** Current server list plus the actions that change it. */
export function useMcpServers(): McpServersSnapshot & McpServersActions {
  const current = useSyncExternalStore(subscribe, getSnapshot);
  return {
    ...current,
    refresh: mcpServersStore.refresh,
    addServer: mcpServersStore.addServer,
    updateServer: mcpServersStore.updateServer,
    importJson: mcpServersStore.importJson,
    removeServer: mcpServersStore.removeServer,
    setServerEnabled: mcpServersStore.setServerEnabled,
    reload: mcpServersStore.reload,
    signIn: mcpServersStore.signIn,
    cancelSignIn: mcpServersStore.cancelSignIn,
    signOut: mcpServersStore.signOut,
  };
}
