import { useEffect, useState } from 'react';
import { RefreshCw } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ProviderMark } from '@/components/ProviderMark';
import { cachedUsage, getAgentUsage, type AgentUsage } from '@/tauri/agentUsage';
import { settingsCardClass } from './settingsUi';
import { cn } from '@/lib/utils';

type Window = NonNullable<AgentUsage['limits']>['windows'][number];

/** Each tool's own colour, the one place this screen uses colour. */
const BRAND: Record<string, string> = {
  'agent:claude-code': '#D97757',
  'agent:codex': '#10A37F',
};

const clock = (at: string) => new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const day = (at: string) => new Date(at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** "in 24 min", "in 3 h", "in 2 days": how long until a limit resets. */
export function untilReset(at: string, now = Date.now()): string {
  const ms = Date.parse(at) - now;
  if (!Number.isFinite(ms) || ms <= 0) return 'now';
  const min = Math.round(ms / 60000);
  if (min < 60) return `in ${Math.max(1, min)} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `in ${hours} h`;
  const days = Math.round(hours / 24);
  return `in ${days} ${days === 1 ? 'day' : 'days'}`;
}

/** "Resets in 24 min, at 8:09 PM" today; "Resets in 3 days, Mon 16 Nov" later. */
function resetLine(at: string): string {
  const sameDay = new Date(at).toDateString() === new Date().toDateString();
  return `Resets ${untilReset(at)}, ${sameDay ? `at ${clock(at)}` : day(at)}`;
}

function Bar({ used, color, thick, label }: { used: number; color: string; thick?: boolean; label: string }) {
  const pct = Math.min(100, Math.max(0, used));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('overflow-hidden rounded-full bg-foreground/[0.07]', thick ? 'h-2' : 'h-1')}
    >
      {/* Nearly spent reads as a warning whatever the tool's colour */}
      <div className={cn('h-full rounded-full', pct >= 90 && 'bg-destructive')} style={{ width: `${pct}%`, backgroundColor: pct >= 90 ? undefined : color }} />
    </div>
  );
}

/**
 * One tool's subscription limits. The window that runs out soonest leads,
 * large; the longer windows sit under it as quiet rows.
 */
export function AgentUsageSection({ harness, name }: { harness: string; name: string }) {
  const [data, setData] = useState<AgentUsage | undefined>(() => cachedUsage(harness));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function refresh() {
    setRefreshing(true); setError(null);
    try { const result = await getAgentUsage(harness, true); setData(result); setError(result.error); }
    catch { setError('Couldn’t refresh limits. Try again.'); }
    finally { setRefreshing(false); }
  }
  useEffect(() => {
    let mounted = true;
    void getAgentUsage(harness).then(value => { if (mounted) setData(value); }).catch(() => {}).finally(() => { if (mounted) void refresh(); });
    return () => { mounted = false; };
  }, [harness]);

  const color = BRAND[harness] ?? 'var(--foreground)';
  const windows = data?.limits?.windows ?? [];
  const [lead, ...rest] = windows as [Window | undefined, ...Window[]];
  const plan = data?.limits?.plan?.replace(/_/g, ' ');
  const asOf = data?.limits?.fetchedAt ? `As of ${clock(data.limits.fetchedAt)}` : undefined;

  return (
    <section className="space-y-3" aria-label={`${name} usage`}>
      <div className="flex items-center gap-2.5">
        <ProviderMark modelId={harness} size={18} />
        <h3 className="text-sm font-medium text-foreground">{name}</h3>
        {plan && <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-xs capitalize text-muted-foreground">{plan}</span>}
        <span className="ml-auto text-xs text-muted-foreground">{asOf}</span>
        <Button variant="ghost" size="icon" className="size-7" aria-label={`Refresh ${name} limits`} title={`Refresh ${name} limits`} disabled={refreshing} onClick={() => void refresh()}>
          <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
        </Button>
      </div>

      {!data ? <Skeleton className="h-28 rounded-xl" /> : lead ? (
        <div className={settingsCardClass}>
          {/* The limit that matters now */}
          <div className="px-4 pt-4 pb-4">
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="text-meta text-muted-foreground">{lead.label}</p>
                <p className="mt-1 text-[28px] leading-none font-medium tracking-tight tabular-nums text-foreground">
                  {lead.used == null ? '—' : `${Math.round(lead.used)}%`}
                  <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">used</span>
                </p>
              </div>
              {lead.resetsAt && <p className="shrink-0 pb-0.5 text-right text-meta text-muted-foreground">{resetLine(lead.resetsAt)}</p>}
            </div>
            {lead.used != null && <div className="mt-3"><Bar used={lead.used} color={color} thick label={`${name} ${lead.label} used`} /></div>}
          </div>
          {/* Longer windows: one quiet line each */}
          {rest.map(w => (
            <div key={w.id} className="flex items-center gap-3 border-t border-border px-4 py-2.5 text-meta">
              <span className="w-[120px] shrink-0 truncate text-muted-foreground" title={w.label}>{w.label}</span>
              <div className="min-w-0 flex-1">{w.used != null && <Bar used={w.used} color={color} label={`${name} ${w.label} used`} />}</div>
              <span className="w-10 shrink-0 text-right tabular-nums text-foreground">{w.used == null ? '—' : `${Math.round(w.used)}%`}</span>
              <span className="w-[150px] shrink-0 truncate text-right text-xs text-muted-foreground">{w.resetsAt ? `Resets ${untilReset(w.resetsAt)}` : ''}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-meta text-muted-foreground">
          {data.limits?.unavailable ? `Subscription limits aren’t available for this login. Check ${name} for usage.` : refreshing ? `Reading ${name} limits…` : error ? `Limits aren’t available yet. Check ${name} or refresh to try again.` : 'Run a task to see current limits.'}
        </p>
      )}
      {error && lead && <p className="text-meta text-muted-foreground" role="status">{error}</p>}
    </section>
  );
}
