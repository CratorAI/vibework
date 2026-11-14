/**
 * Web API module
 * Which service answers the agent's WebSearch calls, and the keys for the
 * services that need one. Keys live in the OS keychain; only presence is reported.
 * WebFetch always runs locally and has no settings.
 */

import { invoke } from "@tauri-apps/api/core";

export type WebSearchProvider = "openrouter" | "exa" | "brave";
/** Providers that need their own API key */
export type WebKeyProvider = Exclude<WebSearchProvider, "openrouter">;

export interface WebSettings {
  provider: WebSearchProvider;
  hasExaKey: boolean;
  hasBraveKey: boolean;
}

/** Where users create keys for each keyed provider */
export const WEB_KEY_URLS: Record<WebKeyProvider, string> = {
  exa: "https://dashboard.exa.ai/api-keys",
  brave: "https://api-dashboard.search.brave.com/app/keys",
};

export async function getWebSettings(): Promise<WebSettings> {
  return await invoke<WebSettings>("web_get_settings");
}

/** Rejects with a readable message (e.g. no key saved for that provider). */
export async function setWebProvider(provider: WebSearchProvider): Promise<void> {
  await invoke("web_set_provider", { provider });
}

/**
 * Stores a key for Exa or Brave; an empty key removes it.
 * Rejects with a readable message, e.g. when the service refuses the key.
 */
export async function setWebKey(provider: WebKeyProvider, key: string): Promise<void> {
  await invoke("web_set_key", { provider, key });
}

export const webApi = {
  getSettings: getWebSettings,
  setProvider: setWebProvider,
  setKey: setWebKey,
} as const;
