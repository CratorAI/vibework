/**
 * Terminal API module
 * Real shells (PTYs) owned by the backend, keyed by an id the frontend picks.
 * Terminals outlive the views that show them: re-opening a live id hands it
 * back, and `terminalSnapshot` returns recent output to repaint a new view.
 * Errors reject with a readable string.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Backend limit on live terminals */
export const MAX_TERMINALS = 8;

export interface TerminalInfo {
  id: string;
  shell: string;
  cwd: string;
}

export interface TerminalListEntry extends TerminalInfo {
  alive: boolean;
}

/** Ids are 1–64 letters, digits, `-` or `_`. */
export function isValidTerminalId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

/**
 * Start a shell (or hand back the live one with this id). An id whose shell
 * exited starts a fresh shell. `cwd` must be an absolute folder; omitted means home.
 */
export async function terminalOpen(args: {
  id: string;
  cwd?: string | null;
  cols: number;
  rows: number;
}): Promise<TerminalInfo> {
  return await invoke<TerminalInfo>("terminal_open", {
    id: args.id,
    cwd: args.cwd ?? undefined,
    cols: args.cols,
    rows: args.rows,
  });
}

/** Send keystrokes / pasted text to the shell */
export async function terminalWrite(id: string, data: string): Promise<void> {
  await invoke("terminal_write", { id, data });
}

export async function terminalResize(id: string, cols: number, rows: number): Promise<void> {
  await invoke("terminal_resize", { id, cols, rows });
}

export async function terminalClose(id: string): Promise<void> {
  await invoke("terminal_close", { id });
}

export async function terminalList(): Promise<TerminalListEntry[]> {
  return await invoke<TerminalListEntry[]>("terminal_list");
}

/** Base64 of the last 256 KB of output. Subscribe to data first; a few bytes may repeat. */
export async function terminalSnapshot(id: string): Promise<string> {
  const result = await invoke<{ data: string }>("terminal_snapshot", { id });
  return result.data;
}

export interface TerminalDataEvent {
  id: string;
  /** Base64 of raw output bytes */
  data: string;
}

export interface TerminalExitEvent {
  id: string;
  exitCode: number | null;
}

export async function onTerminalData(handler: (event: TerminalDataEvent) => void): Promise<UnlistenFn> {
  return await listen<TerminalDataEvent>("terminal:data", (e) => handler(e.payload));
}

export async function onTerminalExit(handler: (event: TerminalExitEvent) => void): Promise<UnlistenFn> {
  return await listen<TerminalExitEvent>("terminal:exit", (e) => handler(e.payload));
}

/** Decode the base64 payloads of `terminal:data` and snapshots */
export function decodeBase64Bytes(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const terminalApi = {
  open: terminalOpen,
  write: terminalWrite,
  resize: terminalResize,
  close: terminalClose,
  list: terminalList,
  snapshot: terminalSnapshot,
  onData: onTerminalData,
  onExit: onTerminalExit,
} as const;
