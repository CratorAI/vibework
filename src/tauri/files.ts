/**
 * File utilities API module
 * Handles file picker and file information Tauri commands
 */

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { openUrl as tauriOpenUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { folderPathApi } from "./folders";

/** File information returned from the backend */
export interface FileInfo {
  name: string;
  size: number;
  path: string;
}

/** File search result from autocomplete */
export interface FileSearchResult {
  path: string;
  isDirectory: boolean;
  size?: number;
}

/**
 * Open a file picker dialog
 * @param multiple - Whether to allow selecting multiple files (default: true)
 * @returns Promise<string[] | null> - Array of file paths or null if cancelled
 */
export async function openFilePicker(
  multiple: boolean = true,
): Promise<string[] | null> {
  if (import.meta.env.DEV) {
    const w = window as unknown as { __e2eFileDialog?: string[] | null };
    if (w.__e2eFileDialog !== undefined) {
      const paths = w.__e2eFileDialog;
      delete w.__e2eFileDialog;
      // The bridge's drop op must grant these paths first; normal safe reads still apply.
      return paths;
    }
  }
  try {
    // Attachments are picked through the backend, which then lets the
    // composer preview the images the user chose (and nothing else).
    if (multiple) return await invoke<string[] | null>("attachment_pick");
    const result = await open({
      multiple,
      directory: false,
    });

    if (result === null) {
      return null;
    }

    // Normalize to array
    if (Array.isArray(result)) {
      return result;
    }
    return [result];
  } catch (error) {
    console.error("Failed to open file picker:", error);
    // Return null instead of crashing - same as if user cancelled
    return null;
  }
}

/**
 * Open a folder picker dialog. A folder the app can't use as a task folder
 * (its own data folder, or one inside it) is refused with the same message
 * the typed-path browser shows, as if the dialog was cancelled.
 * @returns Promise<string | null> - Folder path or null if cancelled
 */
export async function openFolderPicker(): Promise<string | null> {
  const chosen = await pickFolder();
  if (chosen === null) return null;
  try {
    return await folderPathApi.check(chosen);
  } catch (error) {
    toast.error(typeof error === "string" ? error : "Couldn’t use that folder.");
    return null;
  }
}

async function pickFolder(): Promise<string | null> {
  // Dev builds only: the dev bridge can answer the next folder dialog
  // (`window.__e2eFolderDialog = "/path"`), since native panels aren't in the DOM
  if (import.meta.env.DEV) {
    const w = window as unknown as { __e2eFolderDialog?: string | null };
    if (w.__e2eFolderDialog !== undefined) {
      const answer = w.__e2eFolderDialog;
      delete w.__e2eFolderDialog;
      return answer;
    }
  }
  try {
    const result = await open({
      multiple: false,
      directory: true,
    });

    if (result === null) {
      return null;
    }

    // Result is a single string for directory selection
    if (Array.isArray(result)) {
      return result[0] || null;
    }
    return result;
  } catch (error) {
    console.error("Failed to open folder picker:", error);
    // Return null instead of crashing - same as if user cancelled
    return null;
  }
}

/**
 * Get file information for a given path
 * @param path - The file path
 * @returns Promise<FileInfo>
 */
export async function getFileInfo(path: string): Promise<FileInfo> {
  return await invoke<FileInfo>("app_get_file_info", { path });
}

/** Raster images the backend can preview */
export function isPreviewableImage(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
}

const previews = new Map<string, Promise<string>>();

/**
 * A downscaled data URL of an attached image, at most `maxPx` on its longer
 * side. Cached for the app session; a failure is not cached.
 */
export function attachmentPreview(path: string, maxPx: number): Promise<string> {
  const key = `${maxPx}|${path}`;
  let pending = previews.get(key);
  if (!pending) {
    pending = invoke<string>("attachment_preview", { path, maxPx });
    pending.catch(() => previews.delete(key));
    previews.set(key, pending);
  }
  return pending;
}

/**
 * Format file size to human-readable string
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "12.3 KB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}

/** Drag-drop event types */
export interface DragDropEvent {
  type: "enter" | "over" | "drop" | "leave";
  paths?: string[];
  position?: { x: number; y: number };
}

/** Handler type for drag-drop events */
export type DragDropEventHandler = (event: DragDropEvent) => void;

/**
 * Listen for drag-drop events on the current webview
 * @param handler - Callback function for drag-drop events
 * @returns Promise<() => void> - Unlisten function to clean up
 */
export async function onDragDropEvent(
  handler: DragDropEventHandler,
): Promise<() => void> {
  const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
    const payload = event.payload as {
      type: "enter" | "over" | "drop" | "leave";
      paths?: string[];
      position?: { x: number; y: number };
    };
    handler({
      type: payload.type,
      paths: payload.paths,
      position: payload.position,
    });
  });
  return unlisten;
}

/**
 * Search for files in working directory matching a partial path
 * @param workingDir - The working directory to search in
 * @param partialPath - The partial path to search for (e.g., "src/com")
 * @returns Promise<FileSearchResult[]> - Array of matching files/directories
 */
export async function searchFiles(
  workingDir: string,
  partialPath: string,
): Promise<FileSearchResult[]> {
  return await invoke<FileSearchResult[]>("search_files", {
    workingDir,
    partialPath,
  });
}

/**
 * Reveal a file or folder in Finder (macOS) / Explorer (Windows)
 * @param path - The file or folder path to reveal
 */
export async function revealInFinder(path: string): Promise<void> {
  const result = await invoke<{ success: boolean; error?: string }>(
    "app_reveal_in_finder",
    { path }
  );
  if (!result.success) {
    throw new Error(result.error || "Failed to reveal in Finder");
  }
}

/**
 * Open a file with its default application
 * @param path - The file path to open
 */
export async function openFile(path: string): Promise<void> {
  const result = await invoke<{ success: boolean; error?: string }>(
    "app_open_file",
    { path }
  );
  if (!result.success) {
    throw new Error(result.error || "Failed to open file");
  }
}

/**
 * Open a URL in the system default browser
 * @param url - The URL to open
 */
export async function openUrl(url: string): Promise<void> {
  await tauriOpenUrl(url);
}

// Export all file functions as a namespace
export const filesApi = {
  openFilePicker,
  openFolderPicker,
  getFileInfo,
  formatFileSize,
  onDragDropEvent,
  searchFiles,
  revealInFinder,
  openFile,
  openUrl,
} as const;
