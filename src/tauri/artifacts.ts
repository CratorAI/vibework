/**
 * Artifacts API module
 * Files inside a conversation's working folder, for the workspace panel.
 * Every call is limited to that folder by the backend; paths outside it are rejected.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface ArtifactStat {
  artifactType?: "motion" | null;
  /** Canonical absolute path */
  path: string;
  name: string;
  mime: string;
  size: number;
  modifiedMs: number;
  kind: "text" | "binary";
  /** `artifact://` URL that serves this file inside a sandbox */
  url: string;
}

export interface ArtifactFile extends ArtifactStat {
  /** File contents when `kind` is "text", otherwise null */
  text: string | null;
  /** Standard base64 when `kind` is "binary", otherwise null */
  base64: string | null;
}

export interface ArtifactEntry {
  artifactType?: "motion" | null;
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modifiedMs: number;
}

/** Backend errors reject with this shape */
export interface ArtifactError {
  code:
    | "invalid_path"
    | "invalid_session"
    | "outside_root"
    | "not_found"
    | "no_session"
    | "no_working_folder"
    | "too_large"
    | "is_directory"
    | "forbidden"
    | "not_ready"
    | "watch_limit"
    | "watch_failed"
    | "io";
  message: string;
}

export function isArtifactError(err: unknown): err is ArtifactError {
  return typeof err === "object" && err !== null && "code" in err && "message" in err;
}

/** `path` may be absolute or relative to the conversation's working folder. Text is capped at 2 MB, binary at 25 MB. */
export async function readArtifact(sessionId: string, path: string): Promise<ArtifactFile> {
  return await invoke<ArtifactFile>("artifact_read", { sessionId, path });
}

/** First rows (up to 6 × 5, as text) of an .xlsx's first sheet, for thumbnails. */
export async function sheetHead(sessionId: string, path: string): Promise<string[][]> {
  const cells = await invoke<import('@/components/gallery/sheetThumb').PreviewCell[][]>("artifact_sheet_head", { sessionId, path });
  const { sheetPreviewRows } = await import('@/components/gallery/sheetThumb');
  return sheetPreviewRows(cells);
}

/** Cells of `sheet!r1c1:r2c2` (1-based) of an .xlsx as text, as the file stores them (dashboard thumbnails). */
export async function sheetRange(sessionId: string, path: string, sheet: string, r1: number, c1: number, r2: number, c2: number): Promise<string[][]> {
  return await invoke<string[][]>("artifact_sheet_range", { sessionId, path, sheet, r1, c1, r2, c2 });
}

export async function statArtifact(sessionId: string, path: string): Promise<ArtifactStat> {
  return await invoke<ArtifactStat>("artifact_stat", { sessionId, path });
}

/**
 * Save a file atomically. Pass exactly one of `text` or `base64`.
 * Creates the file if needed; its parent folder must already exist.
 */
export async function writeArtifact(
  sessionId: string,
  path: string,
  content: { text: string } | { base64: string },
): Promise<ArtifactStat> {
  return await invoke<ArtifactStat>("artifact_write", { sessionId, path, ...content });
}

/** Non-recursive; hidden files and build folders are skipped; capped at 500 entries. */
export async function listArtifacts(sessionId: string, dir?: string): Promise<ArtifactEntry[]> {
  return await invoke<ArtifactEntry[]>("artifact_list", { sessionId, dir });
}

export interface TreeEntry {
  artifactType?: "motion" | null;
  name: string;
  /** Canonical absolute path */
  path: string;
  isDir: boolean;
  size: number;
  modifiedMs: number;
  /** Hidden (dot) entries and dependency/build folders: shown quietly, not expanded by default */
  quiet: boolean;
}

export interface TreeListing {
  /** The folder listed (canonical absolute path) */
  dir: string;
  /** Folders first, then by name; at most 500 */
  entries: TreeEntry[];
  /** Entries left out past the cap */
  more: number;
}

export interface TreeMatch {
  artifactType?: "motion" | null;
  name: string;
  path: string;
  isDir: boolean;
  /** Folder of the match relative to the working folder ("" at the top) */
  folder: string;
  modifiedMs: number;
}

/** Every entry of one folder (default: the working folder), hidden and dependency folders flagged `quiet`. */
export async function listTree(sessionId: string, dir?: string): Promise<TreeListing> {
  return await invoke<TreeListing>("artifact_tree_list", { sessionId, dir });
}

/** Names containing `query` anywhere in the working folder (hidden and dependency folders skipped; at most 200). */
export async function findInTree(sessionId: string, query: string): Promise<TreeMatch[]> {
  return await invoke<TreeMatch[]>("artifact_tree_find", { sessionId, query });
}

/** Watch the whole working folder: `artifact:changed` arrives with the folder as `path`. Stop with `unwatchArtifact`. */
export async function watchTree(sessionId: string): Promise<string> {
  return await invoke<string>("artifact_watch_tree", { sessionId });
}

export async function watchArtifact(sessionId: string, path: string): Promise<string> {
  return await invoke<string>("artifact_watch", { sessionId, path });
}

export async function unwatchArtifact(watchId: string): Promise<void> {
  await invoke("artifact_unwatch", { watchId });
}

export interface ArtifactChangedEvent {
  watchId: string;
  path: string;
  /** null when the file was deleted */
  modifiedMs: number | null;
}

export async function onArtifactChanged(handler: (event: ArtifactChangedEvent) => void): Promise<UnlistenFn> {
  return await listen<ArtifactChangedEvent>("artifact:changed", (e) => handler(e.payload));
}

/** Hold a generated HTML page in memory and get a sandboxed `artifact://` URL for it. Release it when done. */
export async function createInlineArtifact(html: string): Promise<{ id: string; url: string }> {
  return await invoke<{ id: string; url: string }>("artifact_inline_create", { html });
}

export async function releaseInlineArtifact(id: string): Promise<void> {
  await invoke("artifact_inline_release", { id });
}

export const artifactsApi = {
  read: readArtifact,
  stat: statArtifact,
  write: writeArtifact,
  list: listArtifacts,
  watch: watchArtifact,
  unwatch: unwatchArtifact,
  onChanged: onArtifactChanged,
  createInline: createInlineArtifact,
  releaseInline: releaseInlineArtifact,
} as const;
