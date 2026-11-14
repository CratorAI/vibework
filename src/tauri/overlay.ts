/**
 * Overlay API module
 * Handles overlay window Tauri commands
 */

import { invoke } from '@tauri-apps/api/core';
import type { OverlayStatus } from '../types/overlay';

/** Result type for overlay operations */
export interface OverlayResult {
  success: boolean;
  error?: string;
}

/**
 * Show the overlay window with a status notification
 * @param status - The overlay status to display
 * @returns Promise<OverlayResult>
 */
export async function show(status: OverlayStatus): Promise<OverlayResult> {
  return await invoke<OverlayResult>('overlay_show', { status });
}

/**
 * Hide the overlay window
 * @returns Promise<OverlayResult>
 */
export async function hide(): Promise<OverlayResult> {
  return await invoke<OverlayResult>('overlay_hide');
}

/**
 * Focus the main window (called when overlay is clicked)
 * @returns Promise<OverlayResult>
 */
export async function focusMain(sessionId?: string): Promise<OverlayResult> {
  return await invoke<OverlayResult>('overlay_focus_main', { sessionId });
}

// Export all overlay functions as a namespace
export const overlayApi = {
  show,
  hide,
  focusMain,
} as const;
