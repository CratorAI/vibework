/**
 * Bring-your-own-key API module
 * The user's OpenRouter key lives in the OS keychain (managed on the Rust side);
 * model requests go straight to OpenRouter.
 */

import { invoke } from '@tauri-apps/api/core';

/** Where users create OpenRouter API keys */
export const OPENROUTER_KEYS_URL = 'https://openrouter.ai/keys';

export interface ByokStatus {
  /** True when an OpenRouter key is stored and usable */
  active: boolean;
  /** Short, non-secret hint of the stored key (e.g. "sk-or-…a1b2"), or null */
  keyHint: string | null;
}

export async function getByokStatus(): Promise<ByokStatus> {
  return await invoke<ByokStatus>('byok_get_status');
}

/**
 * Validates the key with OpenRouter, then stores it in the OS keychain.
 * Rejects with a human-readable message when the key is invalid or OpenRouter is unreachable.
 */
export async function setOpenRouterKey(key: string): Promise<ByokStatus> {
  return await invoke<ByokStatus>('byok_set_openrouter_key', { key });
}

/** Removes the stored key from the keychain. */
export async function clearOpenRouterKey(): Promise<ByokStatus> {
  return await invoke<ByokStatus>('byok_clear_openrouter_key');
}

export const byokApi = {
  getStatus: getByokStatus,
  setOpenRouterKey,
  clearOpenRouterKey,
} as const;
