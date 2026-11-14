import { describe, expect, it } from 'vitest';
import { usageTotals, type TaskUsage } from './agentUsage';
const task = (at: string, input = 10): TaskUsage => ({ id: at, name: 'Task', turns: [{ engine: 'codex', turnId: at, at, tokens: { input, output: 3, cached: 4, cacheWrite: null } }] });
describe('native task usage totals', () => {
  const now = new Date(2026, 10, 13, 14);
  it('uses local midnight and includes only recorded turns', () => {
    const rows = [task(new Date(2026, 10, 13, 0).toISOString()), task(new Date(2026, 10, 12, 23, 59).toISOString()), task(new Date(2026, 10, 14).toISOString())];
    expect(usageTotals(rows, 1, now).totals).toEqual({ input: 10, output: 3, cached: 4, cacheWrite: null });
  });
  it('includes seven calendar days, excludes older turns and sorts task totals', () => {
    const rows = [task(new Date(2026, 10, 7).toISOString(), 20), task(new Date(2026, 10, 6, 23, 59).toISOString(), 99), task(new Date(2026, 10, 13).toISOString(), 50)];
    const total = usageTotals(rows, 7, now); expect(total.totals.input).toBe(70); expect(total.tasks[0].total.input).toBe(50); expect(total.totals.cached).toBe(8);
  });
  it('does not invent numbers for pre-migration tasks', () => { expect(usageTotals([{ id: 'old', name: 'Old', turns: [] }], 7, now).tasks).toEqual([]); });
});
