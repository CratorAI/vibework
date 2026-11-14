import React, { useState } from "react";
import { Copy, Check, Plug, BookOpen } from "@/lib/icons";
import { AttachmentList } from "../AttachmentChip";
import { parseAttachments } from "../../utils/attachments";
import { FileMentionText, hasFileMentions, plainMessageText, skillMentions } from "../FileMentionText";
import { ChatMessage, MessageBlock } from "@/types/agent";
import { cn } from "@/lib/utils";

interface UserMessageViewProps {
  message: ChatMessage;
  className?: string;
}

export const UserMessageView: React.FC<UserMessageViewProps> = ({
  message,
  className = "",
}) => {
  const [copied, setCopied] = useState(false);
  // After the first copy, the icons morph both ways; before it, nothing moves
  const [everCopied, setEverCopied] = useState(false);

  // Get the text content from the message blocks
  const textBlock = message.blocks.find(
    (block: MessageBlock) => block.type === "text",
  );
  const rawText = textBlock?.type === "text" ? textBlock.content : "";

  // Parse attachments from the text
  const { attachments, cleanedText } = parseAttachments(rawText);
  const skills = skillMentions(cleanedText);

  const handleCopy = async () => {
    if (!cleanedText) return;
    await navigator.clipboard.writeText(plainMessageText(cleanedText));
    setCopied(true);
    setEverCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group/user flex flex-col items-end">
      {/* What changed in the task's tools since its last message: quiet status rows, left-aligned like the timeline */}
      {message.notes && message.notes.length > 0 && (
        <div className="mb-3 flex flex-col gap-1 self-stretch" data-testid="connector-notes">
          {message.notes.map((note, i) => (
            <div key={i} className="flex h-5 items-center gap-1.5 text-meta text-muted-foreground">
              <Plug className="size-3.5 shrink-0" />
              <span className="truncate">{note}</span>
            </div>
          ))}
        </div>
      )}
      {attachments.length > 0 && (
        <AttachmentList attachments={attachments} className="mb-2 max-w-[75%] justify-end" />
      )}
      <div
        className={`max-w-[75%] rounded-2xl bg-chat-user-message px-4 py-2.5 text-prose text-foreground ${className}`}
      >
        {/* Render cleaned text content with file mentions as pills */}
        {cleanedText && (
          <span className="whitespace-pre-wrap break-words select-text">
            {hasFileMentions(cleanedText) ? (
              <FileMentionText text={cleanedText} />
            ) : (
              cleanedText
            )}
          </span>
        )}
      </div>
      {/* Copy button */}
      {cleanedText && (
        <div className="mt-1 flex justify-end opacity-0 transition-opacity group-hover/user:opacity-100 focus-within:opacity-100">
          <button
            onClick={handleCopy}
            className="pressable grid size-7 place-items-center rounded-md text-muted-foreground transition-[color,background-color,scale] hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
            title={copied ? "Copied" : "Copy message"}
            aria-label={copied ? "Copied" : "Copy message"}
          >
            {copied ? (
              <Check key="check" className="motion-icon-swap size-4 text-success" />
            ) : (
              <Copy key="copy" className={cn("size-4", everCopied && "motion-icon-swap")} />
            )}
          </button>
        </div>
      )}
      {/* Skills chosen with "/" were loaded with the message: the turn's first steps */}
      {skills.length > 0 && (
        <div className="mt-1 flex flex-col gap-3 self-stretch" data-testid="skill-loads">
          {skills.map((id) => (
            <div key={id} className="relative pl-6">
              <div className="absolute top-0 left-0 flex h-5 w-4 items-center justify-center text-muted-foreground">
                <BookOpen className="size-4 shrink-0" />
              </div>
              <div className="flex min-h-5 items-center text-sm leading-5 text-muted-foreground">
                <span className="line-clamp-1">Loaded the {id} skill</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
