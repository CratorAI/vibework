import type { UsageInfo } from "../tauri/usage";

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 1) return "<1s";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m${seconds % 60 ? ` ${seconds % 60}s` : ""}`;
  return `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
}
export function formatCost(cost: number | null | undefined): string {
  if (cost == null || !Number.isFinite(cost) || cost < 0) return "";
  return cost > 0 && cost < 0.01 ? "<$0.01" : `$${cost.toFixed(2)}`;
}
export function lowCredit(info: UsageInfo | null): number | null {
  if (!info?.accountCredits) return null;
  const { total, used } = info.accountCredits;
  if (!Number.isFinite(total) || !Number.isFinite(used)) return null;
  const remaining = Math.max(0, total - used);
  return remaining < 5 || (total > 0 && remaining / total < 0.1) ? remaining : null;
}
export function isOutOfCredit(error: string): boolean {
  return /\b402\b|insufficient credits|out of credits|credit balance.*(?:low|insufficient)|requires more credits/i.test(error);
}
