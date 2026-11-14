/**
 * Usage API: what the OpenRouter key has spent and what is left.
 * Amounts are US dollars.
 */

import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface UsageInfo {
  /** The key's label on OpenRouter, when it has one */
  keyLabel: string | null;
  /** Spending limit on this key; null when the key has none */
  limit: number | null;
  /** What remains of the key's limit; null when it has none */
  limitRemaining: number | null;
  /** All-time spend on this key */
  usage: number;
  usageDaily: number;
  usageWeekly: number;
  usageMonthly: number;
  /** Account balance; null when it cannot be read */
  accountCredits: { total: number; used: number } | null;
  /** ISO time the figures were read */
  fetchedAt: string;
}

/**
 * Rejects with a readable string when OpenRouter cannot be reached.
 * @param forceRefresh - bypass the backend's cache (the Refresh action)
 */
export async function getUsage(forceRefresh?: boolean): Promise<UsageInfo> {
  const info = await invoke<UsageInfo>("usage_get", { forceRefresh });
  accountUsage = info;
  subscribers.forEach(fn => fn());
  return info;
}

/** True when the error means this build has no usage command yet (not a network failure). */
export function isUsageUnavailable(err: unknown): boolean {
  const text = typeof err === "string" ? err : err instanceof Error ? err.message : "";
  return /usage_get.*not found|command .*not found|unknown command/i.test(text);
}

export const usageApi = { getUsage };

let accountUsage: UsageInfo | null = null;
const subscribers = new Set<() => void>();
export function useAccountUsage(): UsageInfo | null {
  return useSyncExternalStore(fn => { subscribers.add(fn); return () => { subscribers.delete(fn); }; }, () => accountUsage);
}
