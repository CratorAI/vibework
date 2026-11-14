/**
 * ToolGroupView Component
 *
 * Groups consecutive tools and thinking into one collapsible row with a
 * vertical timeline inside.
 *
 * - Closed unless the reader opens it; a live turn does not spring it open.
 * - While the turn is live the header names the current step, in the present
 *   tense, and shimmers (no spinner). Settled, it sums up what was done
 *   ("Read 2 files and ran a command"), plus how many steps failed. It is
 *   computed the same way for streamed and reloaded blocks, so it does not
 *   change when history replaces the stream at the end of the turn.
 * - Entries that arrive while the timeline is open and the turn is live fade
 *   in once. Entries already there when it opens (or when the conversation is
 *   switched back to) do not replay the entrance.
 */

import { Duration } from "./Duration";
import React, { useRef, useState } from "react";
import { ChevronRight, Check } from "@/lib/icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ToolBlock, ThinkingBlock } from "@/types/agent";
import { ToolItem } from "./ToolItem";
import { ThinkingItem } from "./ThinkingItem";
import { getToolDescription, summarizeSteps } from "@/utils/toolDisplayUtils";
import { cn } from "@/lib/utils";

type GroupItem = ToolBlock | ThinkingBlock;

interface GroupViewProps {
  items: GroupItem[];
  /** Turn-level live signal: true only for the last group of a running turn. */
  isLive?: boolean;
  /** The turn is paused on the user (the prompt is docked in the message box) */
  waiting?: "approval" | "answer" | null;
  className?: string;
}

/**
 * The open timeline. Mounted only while the group is open (Radix unmounts
 * closed content), so "arrived after mount" means "arrived while visible".
 */
function GroupTimeline({
  items,
  isLive,
  isComplete,
}: {
  items: GroupItem[];
  isLive: boolean;
  isComplete: boolean;
}) {
  const mountedCount = useRef(items.length);
  // Positions that arrived while live and visible. Recorded once and kept, so
  // the class never toggles (a re-added animation class would replay).
  const animated = useRef(new Set<number>());
  if (isLive) {
    for (let i = mountedCount.current; i < items.length; i++) {
      animated.current.add(i);
    }
  }

  return (
    <div className="mt-2 mb-1 ml-0.5">
      <div className="relative">
        <div className="absolute left-[7px] top-0 bottom-0 w-px bg-border" />
        <div className="space-y-3">
          {items.map((item, i) => (
            <div
              // Positional: streamed tool ids are tool names (not unique) and
              // differ from the reloaded history's ids, and the end-of-turn
              // handover must update entries in place, not remount them.
              key={i}
              className={
                animated.current.has(i)
                  ? "animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none"
                  : undefined
              }
            >
              {item.type === "thinking" ? (
                <ThinkingItem
                  block={item}
                  isStreaming={isLive && !item.isComplete}
                />
              ) : (
                <ToolItem block={item} isLive={isLive} />
              )}
            </div>
          ))}

          {/* Only once the turn settles: mid-turn it would appear and
              vanish between tool calls. */}
          {isComplete && !isLive && (
            <div className="relative pl-6">
              <div className="absolute left-0 top-0 flex h-5 w-4 items-center justify-center bg-background">
                <Check className="size-3.5 text-muted-foreground" />
              </div>
              <span className="text-sm leading-5 text-muted-foreground">Done</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GroupViewImpl({ items, isLive = false, waiting = null, className = "" }: GroupViewProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toolBlocks = items.filter(
    (item): item is ToolBlock => item.type === "tool",
  );
  const isComplete =
    toolBlocks.length > 0 &&
    toolBlocks.every((block) => !block.call.isExecuting && block.call.result);

  const last = items[items.length - 1];
  const isThinkingNow = isLive && last?.type === "thinking" && !last.isComplete;

  const headerSummary = (() => {
    // Not run yet: the step waits on the prompt in the message box
    if (waiting) return waiting === "approval" ? "Waiting for your approval" : "Waiting for your answer";
    if (isThinkingNow) return "Thinking";
    if (toolBlocks.length === 0) return isLive ? "Thinking" : "Thought it through";
    if (isLive) {
      const latest = toolBlocks[toolBlocks.length - 1];
      return getToolDescription(
        latest.call.name,
        latest.call.input,
        latest.call.isExecuting ? "running" : "done",
      );
    }
    return summarizeSteps(toolBlocks.map((b) => b.call));
  })();

  const failed = isLive
    ? 0
    : toolBlocks.filter((b) => b.call.result && !b.call.result.success).length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <CollapsibleTrigger className="group/tg flex h-7 w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-sm text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:text-foreground focus-visible:underline">
        {waiting && <span className="motion-fade-in size-1.5 shrink-0 rounded-full bg-warning" aria-hidden data-testid="waiting-mark" />}
        <span className={cn("truncate", isLive && "text-shimmer")} title={headerSummary}>
          {headerSummary}
        </span>
        {failed > 0 && (
          <span className="shrink-0">
            ·{" "}<span className="text-destructive">{failed} failed</span>
          </span>
        )}
        {!waiting && <Duration timings={items.map(item => item.timing)} live={isLive} prefix="· " />}
        <ChevronRight
          className={cn("size-3.5 shrink-0 transition-transform", isOpen && "rotate-90")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <GroupTimeline items={items} isLive={isLive} isComplete={isComplete} />
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Items are compared entry by entry: the grouping is recomputed on every
 * stream flush, but blocks the flush did not touch keep their identity, so
 * finished groups in the live message skip rendering.
 */
function sameGroupProps(a: GroupViewProps, b: GroupViewProps): boolean {
  return (
    a.isLive === b.isLive &&
    a.waiting === b.waiting &&
    a.className === b.className &&
    a.items.length === b.items.length &&
    a.items.every((item, i) => item === b.items[i])
  );
}

export const GroupView = React.memo(GroupViewImpl, sameGroupProps);

GroupView.displayName = "GroupView";
