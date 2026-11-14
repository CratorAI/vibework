import { invoke } from "@tauri-apps/api/core";
import type { ModelInfo } from "@/tauri/models";
import { AgentUsageSection } from "./AgentUsageSection";
import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getUsage, isUsageUnavailable, type UsageInfo } from "@/tauri/usage";
import { cn, errorMessage } from "@/lib/utils";
import { useProviderKey } from "@/hooks/useProviderKey";
import {
  ExternalLinkButton,
  InlineError,
  SettingsPageHeader,
  SettingsSectionHeading,
  settingsCardClass,
  settingsRowClass,
} from "./settingsUi";

const ADD_CREDITS_URL = "https://openrouter.ai/settings/credits";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatUsd(value: number): string {
  if (value > 0 && value < 0.01) return "< $0.01";
  return usd.format(value);
}

function updatedLabel(fetchedAt: string, now: number): string {
  const at = Date.parse(fetchedAt);
  if (Number.isNaN(at)) return "";
  const minutes = Math.floor(Math.max(0, now - at) / 60000);
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `Updated ${hours} h ago`;
}

const Row: React.FC<{ label: string; value: React.ReactNode; title?: string }> = ({ label, value, title }) => (
  <div className={cn(settingsRowClass, "flex items-center justify-between gap-4")}>
    <span className="text-sm text-foreground" title={title}>
      {label}
    </span>
    <span className="text-sm text-foreground tabular-nums select-text">{value}</span>
  </div>
);

type State =
  | { kind: "loading" }
  | { kind: "ready"; usage: UsageInfo }
  | { kind: "unavailable" }
  | { kind: "no-key" }
  | { kind: "error"; message: string };

/** What the OpenRouter key has spent and what is left on the account. */
export const UsageSettings: React.FC = () => {
  const { isConnected } = useProviderKey();
  const [agents, setAgents] = useState<ModelInfo[]>([]);
  useEffect(() => { void invoke<ModelInfo[]>("agent_installed_agents").then(setAgents).catch(() => {}); }, []);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async (forceRefresh = false) => {
    if (!isConnected) {
      setState({ kind: "no-key" });
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    try {
      const usage = await getUsage(forceRefresh);
      setState({ kind: "ready", usage });
    } catch (err) {
      if (isUsageUnavailable(err)) setState({ kind: "unavailable" });
      else setState((prev) => (prev.kind === "ready" ? prev : { kind: "error", message: errorMessage(err, "Couldn’t reach OpenRouter.") }));
      if (!isUsageUnavailable(err)) console.error("[Usage] Failed to read usage:", err);
    } finally {
      setRefreshing(false);
      setNow(Date.now());
    }
  }, [isConnected]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep "Updated … ago" current
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const refreshButton = state.kind !== "unavailable" && state.kind !== "no-key" && (
    <Button variant="outline" size="sm" onClick={() => void load(true)} disabled={refreshing}>
      <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
      Refresh
    </Button>
  );

  return (
    <div className="space-y-8">
      <SettingsPageHeader
        title="Usage"
        actions={
          <>
            {state.kind === "ready" && (
              <span className="text-meta text-muted-foreground" aria-live="polite">
                {updatedLabel(state.usage.fetchedAt, now)}
              </span>
            )}
            {refreshButton}
          </>
        }
      />



      {state.kind === "no-key" && (
        <p className="text-sm text-muted-foreground">No OpenRouter key connected.</p>
      )}

      {state.kind === "loading" && (
        <section aria-busy="true" aria-label="Loading usage" className="space-y-8">
          <div className={settingsCardClass}>
            <div className="space-y-3 px-4 py-4">
              <Skeleton className="h-3 w-24 rounded-sm" />
              <Skeleton className="h-6 w-32 rounded-sm" />
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          </div>
          <div className={settingsCardClass}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3.5">
                <Skeleton className="h-3 w-24 rounded-sm" />
                <Skeleton className="h-3 w-14 rounded-sm" />
              </div>
            ))}
          </div>
        </section>
      )}

      {state.kind === "unavailable" && (
        <div className="rounded-xl border bg-card px-4 py-5 text-center">
          <p className="text-sm text-foreground">Usage isn’t available yet</p>
          <p className="mt-1 text-meta text-muted-foreground">What your key spends and the credit left will show here.</p>
          <div className="mt-3 flex justify-center">
            <ExternalLinkButton href={ADD_CREDITS_URL}>Add credits on OpenRouter</ExternalLinkButton>
          </div>
        </div>
      )}

      {state.kind === "error" && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-destructive/20 bg-destructive-muted/50 px-4 py-3">
          <InlineError className="flex-1">Couldn’t read OpenRouter usage. {state.message}</InlineError>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={refreshing}>
            Try again
          </Button>
        </div>
      )}

      {state.kind === "ready" && <UsageDetails usage={state.usage} />}
      {["agent:claude-code", "agent:codex"].map(id => { const agent = agents.find(a => a.id === id && !a.disabledReason); return agent ? <AgentUsageSection key={id} harness={id} name={agent.name} /> : null; })}
    </div>
  );
};

const UsageDetails: React.FC<{ usage: UsageInfo }> = ({ usage }) => {
  const credits = usage.accountCredits;
  const left = credits ? Math.max(0, credits.total - credits.used) : null;
  const usedFraction = credits && credits.total > 0 ? Math.min(1, Math.max(0, credits.used / credits.total)) : 0;

  return (
    <>
      <section>
        <SettingsSectionHeading title="OpenRouter account" />
        <div className={settingsCardClass}>
          <div className="px-4 py-4">
            <p className="text-meta text-muted-foreground">Credit left</p>
            {credits && left !== null ? (
              <>
                <p className="mt-0.5 text-xl leading-7 font-semibold text-foreground tabular-nums select-text">
                  {formatUsd(left)}
                </p>
                <div
                  className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
                  role="meter"
                  aria-label="Credit used"
                  aria-valuemin={0}
                  aria-valuemax={credits.total}
                  aria-valuenow={credits.used}
                >
                  <div className="h-full rounded-full bg-foreground/60" style={{ width: `${usedFraction * 100}%` }} />
                </div>
                <p className="mt-1.5 text-meta text-muted-foreground tabular-nums">
                  {formatUsd(credits.used)} used of {formatUsd(credits.total)}
                </p>
              </>
            ) : (
              <p className="mt-0.5 text-sm text-muted-foreground">Couldn’t read the account balance</p>
            )}
          </div>
          <div className={cn(settingsRowClass, "flex items-center")}>
            <ExternalLinkButton href={ADD_CREDITS_URL}>Add credits on OpenRouter</ExternalLinkButton>
          </div>
        </div>
      </section>

      <section>
        <SettingsSectionHeading title={usage.keyLabel ? `Spent on this key · ${usage.keyLabel}` : "Spent on this key"} />
        <div className={settingsCardClass}>
          <Row label="Today" value={formatUsd(usage.usageDaily)} />
          <Row label="This week" value={formatUsd(usage.usageWeekly)} />
          <Row label="This month" value={formatUsd(usage.usageMonthly)} />
          <Row label="All time" value={formatUsd(usage.usage)} />
        </div>
      </section>

      {usage.limit !== null && (
        <section>
          <SettingsSectionHeading title="Key limit" />
          <div className={settingsCardClass}>
            <Row label="Limit" value={formatUsd(usage.limit)} />
            <Row label="Left on this limit" value={usage.limitRemaining !== null ? formatUsd(usage.limitRemaining) : "–"} />
          </div>
        </section>
      )}
    </>
  );
};
