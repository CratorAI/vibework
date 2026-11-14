/**
 * Models API module
 * Lists OpenRouter models and reads/writes the default model for new conversations.
 */

import { invoke } from '@tauri-apps/api/core';

export interface ModelInfo {
  /** OpenRouter model id, e.g. "deepseek/deepseek-v4.1-flash" */
  id: string;
  agent?: boolean;
  harness?: string;
  nativeModel?: string;
  isDefault?: boolean;
  efforts?: string[];
  defaultEffort?: string | null;
  disabledReason?: string | null;
  limitReason?: string | null;
  /** Display name as reported by OpenRouter */
  name: string;
  contextLength: number | null;
  /** USD per million prompt tokens */
  promptPrice: number | null;
  /** USD per million completion tokens */
  completionPrice: number | null;
  supportsReasoning: boolean;
  supportsImages: boolean;
}

/**
 * List the tool-capable OpenRouter models.
 * @param forceRefresh - bypass the Rust-side cache and refetch from OpenRouter
 */
export async function listModels(forceRefresh?: boolean): Promise<ModelInfo[]> {
  return await invoke<ModelInfo[]>('models_list', { forceRefresh });
}

/** Model id used for new conversations when none is chosen explicitly. */
export async function getDefaultModel(): Promise<string> {
  return await invoke<string>('get_default_model');
}

export async function setDefaultModel(modelId: string): Promise<void> {
  await invoke('set_default_model', { modelId });
}

export const modelsApi = {
  listModels,
  getDefaultModel,
  setDefaultModel,
} as const;
