import { invoke } from '@tauri-apps/api/core';
export interface Tokens { input: number; output: number; cached: number | null; cacheWrite: number | null }
export interface TurnUsage { engine: string; turnId: string; at: string; tokens: Tokens; mainOnly?: boolean }
export interface TaskUsage { id: string; name: string; turns: TurnUsage[] }
export interface AgentUsage {
  limits: { plan: string | null; fetchedAt: string; unavailable: boolean; windows: { id: string; label: string; used: number | null; resetsAt: string | null }[] } | null;
  tasks: TaskUsage[];
  error: string | null;
}
const cache = new Map<string, AgentUsage>();
const pending = new Map<string, Promise<AgentUsage>>();
export function cachedUsage(harness: string) { return cache.get(harness); }
export function getAgentUsage(harness: string, refresh = false): Promise<AgentUsage> {
  const key = `${harness}:${refresh}`;
  const existing = pending.get(key); if (existing) return existing;
  const work = invoke<AgentUsage>('agent_usage', { harness, refresh }).then(value => { cache.set(harness, value); return value; }).finally(() => pending.delete(key));
  pending.set(key, work); return work;
}
/** Local calendar days; cached tokens are separate figures, never added twice to input. */
export function usageTotals(tasks: TaskUsage[], days: number, now = new Date()): { totals: Tokens; tasks: (TaskUsage & { total: Tokens })[] } {
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - days + 1);
  const zero = (): Tokens => ({ input: 0, output: 0, cached: null, cacheWrite: null });
  const add = (a: Tokens, b: Tokens) => { a.input += b.input; a.output += b.output; if (b.cached != null) a.cached = (a.cached ?? 0) + b.cached; if (b.cacheWrite != null) a.cacheWrite = (a.cacheWrite ?? 0) + b.cacheWrite; };
  const totals = zero();
  const rows = tasks.flatMap(task => {
    const turns = task.turns.filter(t => Date.parse(t.at) >= +start && Date.parse(t.at) <= +now);
    if (!turns.length) return [];
    const total = zero(); turns.forEach(t => add(total, t.tokens)); add(totals, total); return [{ ...task, turns, total }];
  }).sort((a, b) => b.total.input + b.total.output - a.total.input - a.total.output);
  return { totals, tasks: rows };
}
