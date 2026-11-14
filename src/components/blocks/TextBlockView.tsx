import React from "react";
import { StreamingMarkdown } from "./StreamingMarkdown";

interface TextBlockViewProps {
  text: string;
  /** Live text: paced reveal while true, full text as soon as it turns false. */
  isStreaming?: boolean;
  className?: string;
}

/**
 * Assistant text. No caret: the paced reveal is the only streaming cue, so
 * nothing appears or disappears when the block finishes.
 */
export const TextBlockView: React.FC<TextBlockViewProps> = React.memo(
  ({ text, isStreaming = false, className = "" }) => (
    <div className={`prose prose-chat select-text [overflow-wrap:anywhere] ${className}`}>
      <StreamingMarkdown text={text} isStreaming={isStreaming} />
    </div>
  ),
);

TextBlockView.displayName = "TextBlockView";
