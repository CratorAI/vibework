import { invoke } from "@tauri-apps/api/core";
import type { ModelInfo } from "@/tauri/models";
export type Harness =
  "favourites" | "opencode" | "agent:claude-code" | "agent:codex";
export const harnessLabel = (h: string) =>
  h === "favourites"
    ? "Favourites"
    : h === "agent:claude-code"
      ? "Claude Code"
      : h === "agent:codex"
        ? "Codex"
        : "Open models";
export function modelSelection(key: string | null) {
  const [h, model, effort] = (key ?? "").split("|");
  const harness: Harness =
    h === "agent:claude-code" || h === "agent:codex" ? h : "opencode";
  const decode = (s?: string) => {
    try {
      return decodeURIComponent(s ?? "");
    } catch {
      return s ?? "";
    }
  };
  return {
    harness,
    model: harness === "opencode" ? (key ?? "") : decode(model),
    effort: decode(effort),
  };
}
export function modelKey(key: string) {
  const s = modelSelection(key);
  return s.harness === "opencode"
    ? key
    : s.model
      ? `${s.harness}|${encodeURIComponent(s.model)}|`
      : s.harness;
}
export function withEffort(key: string, effort: string) {
  const s = modelSelection(key);
  return s.harness === "opencode"
    ? key
    : `${s.harness}|${encodeURIComponent(s.model)}|${encodeURIComponent(effort)}`;
}
export const effortLabel = (v: string) =>
  v === "xhigh"
    ? "Extra high"
    : v
      ? v[0].toUpperCase() + v.slice(1)
      : "Default";
const cache = new Map<string, ModelInfo[]>();
const requests = new Map<string, Promise<ModelInfo[]>>();
const updated = new Map<string, number>();
export async function cachedAgentModels(harness: string) {
  const list =
    cache.get(harness) ??
    (await invoke<ModelInfo[]>("agent_models", { harness, refresh: false }));
  cache.set(harness, list);
  return list;
}
export async function refreshAgentModels(harness: string) {
  const current = requests.get(harness);
  if (current) return current;
  if (Date.now() - (updated.get(harness) ?? 0) < 300000)
    return cachedAgentModels(harness);
  const p = invoke<ModelInfo[]>("agent_models", { harness, refresh: true })
    .then((list) => {
      cache.set(harness, list);
      updated.set(harness, Date.now());
      return list;
    })
    .finally(() => requests.delete(harness));
  requests.set(harness, p);
  return p;
}
export function readPickerSetting<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function favoriteShortcut(key: string, meta: boolean, ctrl: boolean) {
  return (meta || ctrl) && /^[1-9]$/.test(key) ? Number(key) - 1 : null;
}
