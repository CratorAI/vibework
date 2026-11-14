import React, { useEffect, useRef, useState } from "react";
import { Check, Copy } from "@/lib/icons";
import { toast } from "sonner";
import type { ChatMessage } from "@/types/agent";
import { cn } from "@/lib/utils";

/** The prose of one reply (its text blocks), not tool calls or reasoning. */
export function replyText(message: ChatMessage): string {
  return message.blocks
    .flatMap((b) => (b.type === "text" && b.content.trim() ? [b.content.trim()] : []))
    .join("\n\n");
}

/**
 * Actions under an assistant reply, on one row with the turn's time. Always
 * visible; quieter on older replies until hover or keyboard focus.
 */
export const ReplyActions: React.FC<{ message: ChatMessage; isLatest: boolean }> = ({ message, isLatest }) => {
  const [copied, setCopied] = useState(false);
  // After the first copy, the icons morph both ways; before it, nothing moves
  const [everCopied, setEverCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(replyText(message));
      setCopied(true);
      setEverCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn’t copy the reply. Try again.");
    }
  };

  return (
    <div
      className={cn(
        "flex h-7 items-center transition-opacity",
        !isLatest && "opacity-60 group-hover/reply:opacity-100 focus-within:opacity-100",
      )}
      data-testid="reply-actions"
    >
      <button
        type="button"
        onClick={copy}
        className="pressable -ml-1.5 grid size-7 place-items-center rounded-md text-muted-foreground transition-[color,background-color,scale] outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        title={copied ? "Copied" : "Copy reply"}
        aria-label={copied ? "Copied" : "Copy reply"}
      >
        {copied ? (
          <Check key="check" className="motion-icon-swap size-4 text-success" />
        ) : (
          <Copy key="copy" className={cn("size-4", everCopied && "motion-icon-swap")} />
        )}
      </button>
    </div>
  );
};
