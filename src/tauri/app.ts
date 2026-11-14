/**
 * App utilities API module
 * Handles window management and other app-level Tauri commands
 */

import { invoke } from '@tauri-apps/api/core';

/** Result type for app operations */
export interface AppResult {
  success: boolean;
  error?: string;
}

/**
 * Set the window size with optional centering
 * @param width - Window width in pixels
 * @param height - Window height in pixels
 * @param center - Whether to center the window on screen (default: false)
 * @returns Promise<AppResult>
 */
export async function setWindowSize(
  width: number,
  height: number,
  center?: boolean
): Promise<AppResult> {
  return await invoke<AppResult>('app_set_window_size', { width, height, center });
}

/**
 * Set the minimum window size
 * @param minWidth - Minimum window width in pixels
 * @param minHeight - Minimum window height in pixels
 * @returns Promise<AppResult>
 */
export async function setMinWindowSize(
  minWidth: number,
  minHeight: number
): Promise<AppResult> {
  return await invoke<AppResult>('app_set_min_window_size', { minWidth, minHeight });
}

/**
 * Minimize the window
 * @returns Promise<AppResult>
 */
export async function minimizeWindow(): Promise<AppResult> {
  return await invoke<AppResult>('app_minimize_window');
}

/**
 * Toggle maximize the window
 * @returns Promise<AppResult>
 */
export async function toggleMaximizeWindow(): Promise<AppResult> {
  // The main window has one fixed size for now (see src-tauri/src/lib.rs), so
  // double-clicking the title bar does nothing. Restore the invoke when resizing returns.
  return { success: true } as AppResult;
}

/**
 * Close the window
 * @returns Promise<AppResult>
 */
export async function closeWindow(): Promise<AppResult> {
  return await invoke<AppResult>('app_close_window');
}

/**
 * Start dragging the window
 * @returns Promise<AppResult>
 */
export async function startDrag(): Promise<AppResult> {
  return await invoke<AppResult>('app_start_drag');
}

// Export all app functions as a namespace
export const appApi = {
  setWindowSize,
  setMinWindowSize,
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
  startDrag,
} as const;
