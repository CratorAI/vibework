import { useEffect, useState } from "react";
import type { StepTiming } from "@/types/agent";
import { formatDuration } from "@/utils/telemetry";

/** The only ticking state: no conversation-wide clock. */
export function Duration({ timings, live = false, prefix = "", className = "" }: {
  timings: (StepTiming | undefined)[]; live?: boolean; prefix?: string; className?: string;
}) {
  const [, tick] = useState(0);
  const running = live && timings.some(t => t && t.durationMs == null);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);
  const known = timings.filter((t): t is StepTiming => !!t && (t.durationMs != null || live));
  if (!known.length) return null;
  const ms = known.reduce((sum, t) => sum + (t.durationMs ?? Math.max(0, Date.now() - Date.parse(t.startedAt))), 0);
  const label = formatDuration(ms);
  // The wait for the user's approval is not in the step's time; say it in the tooltip.
  const waited = known.reduce((sum, t) => sum + (t.waitMs ?? 0), 0);
  const waitLabel = waited >= 1000 ? formatDuration(waited) : "";
  // A whole turn ("Worked for …") gives the total with the waits in its tooltip.
  const turn = known.every(t => t.kind === "turn");
  const title = !waitLabel ? undefined
    : turn ? `${formatDuration(ms + waited)} in all, including ${waitLabel} waiting for you`
    : `Not counting ${waitLabel} waiting for your approval`;
  return label ? <span title={title} className={`shrink-0 text-meta text-muted-foreground tabular-nums ${className}`}>{prefix}{label}</span> : null;
}
