/**
 * Settings API module
 * Handles settings-related Tauri commands
 */

import { invoke } from '@tauri-apps/api/core';

/**
 * Get whether notifications are enabled
 * @returns Promise<boolean>
 */
export async function getNotificationsEnabled(): Promise<boolean> {
  return await invoke<boolean>('get_notifications_enabled');
}

/**
 * Set whether notifications are enabled
 * @param enabled - Whether notifications should be enabled
 * @returns Promise<void>
 */
export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  await invoke('set_notifications_enabled', { enabled });
}

/**
 * Get the default working directory
 */
export async function getDefaultWorkingDirectory(): Promise<string> {
  return await invoke<string>('get_default_working_directory');
}

/**
 * Set the default working directory
 */
export async function setDefaultWorkingDirectory(directory: string): Promise<void> {
  await invoke('set_default_working_directory', { directory });
}

/**
 * Get whether onboarding has been completed
 * @returns Promise<boolean>
 */
export async function getOnboardingCompleted(): Promise<boolean> {
  return await invoke<boolean>('get_onboarding_completed');
}

/**
 * Set whether onboarding has been completed
 * @param completed - Whether onboarding is completed
 * @returns Promise<void>
 */
export async function setOnboardingCompleted(completed: boolean): Promise<void> {
  await invoke('set_onboarding_completed', { completed });
}

// Export all settings functions as a namespace
export const settingsApi = {
  getNotificationsEnabled,
  setNotificationsEnabled,
  getDefaultWorkingDirectory,
  setDefaultWorkingDirectory,
  getOnboardingCompleted,
  setOnboardingCompleted,
} as const;
