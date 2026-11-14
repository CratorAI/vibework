/**
 * ThinkingItem Component
 *
 * One reasoning entry on the activity timeline: shown in full while it streams, then clamped with a fade and
 * "Show more" once it settles. Height is tracked with a ResizeObserver rather
 * than a scrollHeight read per update, so streaming does not force a reflow
 * on every token.
 */

import { Duration } from "./Duration";
import React, { useEffect, useRef, useState } from "react";
import { Lightbulb } from "@/lib/icons";
import { ThinkingBlock } from "@/types/agent";
import { StreamingMarkdown } from "./StreamingMarkdown";

const MAX_THINKING_HEIGHT = 200;

interface ThinkingItemProps {
  block: ThinkingBlock;
  /** The turn is live and this is the reasoning currently being written. */
  isStreaming?: boolean;
}

export const ThinkingItem: React.FC<ThinkingItemProps> = ({
  block,
  isStreaming = false,
}) => {
  // null = the reader hasn't toggled; auto applies (expanded while streaming,
  // clamped once settled).
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  const isExpanded = manualExpanded ?? isStreaming;
  const needsExpansion = contentHeight > MAX_THINKING_HEIGHT;

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setContentHeight(el.scrollHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative pl-6">
      <div className="absolute left-0 top-0 flex h-5 w-4 items-center justify-center bg-background text-muted-foreground">
        <Lightbulb className="size-4" />
      </div>

      <div className="relative">
        {/* The duration floats beside the first line: a row of its own pushed the
            text a line below the icon. */}
        <Duration timings={[block.timing]} live={isStreaming} className="float-right ml-3 leading-5" />
        <div
          className="overflow-hidden transition-[max-height] duration-200 ease-[var(--ease-out-strong)] motion-reduce:transition-none"
          style={{
            maxHeight:
              !isExpanded && needsExpansion
                ? MAX_THINKING_HEIGHT
                : // Numeric so the clamp animates instead of snapping.
                  Math.max(contentHeight, MAX_THINKING_HEIGHT),
          }}
        >
          <div
            ref={contentRef}
            // Headings stay at body scale: full prose heading sizes dwarf the
            // trace and push the first line off the icon.
            className="prose prose-chat prose-chat-muted select-text [&_:where(h1,h2,h3,h4)]:mb-0 [&_:where(h1,h2,h3,h4)]:mt-3 [&_:where(h1,h2,h3,h4)]:text-[1em] [&_:where(h1,h2,h3,h4)]:text-foreground"
          >
            <StreamingMarkdown text={block.content} isStreaming={isStreaming} />
          </div>
        </div>

        {needsExpansion && !isExpanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background to-transparent" />
        )}
      </div>

      {needsExpansion && !isStreaming && (
        <button
          type="button"
          onClick={() => setManualExpanded((cur) => !(cur ?? isStreaming))}
          className="mt-1 text-meta text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:underline"
        >
          {isExpanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
};
