import { useEffect, useState } from "react";
import { X } from "@/lib/icons";
import { Mark } from "@/components/brand/Mark";
import { overlayApi } from "../tauri/overlay";
import type { OverlayStatus } from "../types/overlay";

const TOAST_DURATION = 8000;

/** A quiet, clickable task notification. Hover/focus gives time to read it. */
export default function OverlayNotification({ status }: { status: OverlayStatus }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (paused || opening) return;
    const timer = window.setTimeout(() => void overlayApi.hide(), TOAST_DURATION);
    return () => window.clearTimeout(timer);
  }, [paused, opening]);

  const label = status.type === "done" ? "Finished" : status.type === "permission" ? "Needs your approval" : "Needs your answer";
  const name = status.session_name || "Your task";
  const openTask = async () => {
    setOpening(true);
    setError(false);
    try {
      const result = await overlayApi.focusMain(status.session_id);
      if (!result.success) throw new Error(result.error);
    } catch {
      setError(true);
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="h-full w-full p-2" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}>
      {/* One row: mark, what happened, Open, dismiss. Everything sits on the row's centre line. */}
      <div className="flex h-full items-center gap-1 overflow-hidden rounded-[18px] border border-border/60 bg-popover pr-2 text-popover-foreground shadow-sm">
        <button type="button" onClick={() => void openTask()} disabled={opening}
          aria-label={`Open task: ${name}`} title={name}
          className="flex h-full min-w-0 flex-1 items-center gap-3 rounded-l-[18px] py-2 pl-3 pr-2 text-left outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-60">
          {/* The app's mark says whose notification this is; it takes the accent when the task needs you */}
          <span aria-hidden className={`grid size-7 shrink-0 place-items-center rounded-lg ${status.type === "done" ? "bg-foreground/[0.06] text-foreground" : "bg-primary/15 text-primary"}`}>
            <Mark className="size-3.5" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="line-clamp-2 text-meta font-medium leading-4">{name}</span>
            <span className="truncate text-xs leading-4 text-muted-foreground">{error ? "Couldn’t open. Try again." : label}</span>
          </span>
        </button>
        <button type="button" onClick={() => void openTask()} disabled={opening} tabIndex={-1} aria-hidden
          className="pressable flex h-7 shrink-0 items-center rounded-lg bg-foreground px-3 text-xs font-medium text-background transition-[opacity,scale] hover:opacity-90 disabled:opacity-60">
          Open
        </button>
        <button type="button" onClick={() => void overlayApi.hide()} aria-label="Dismiss notification" title="Dismiss"
          className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          <X aria-hidden className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
