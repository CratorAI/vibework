import React from "react";
import { FileText } from "@/lib/icons";
import { SkillChip } from "./editor/SkillNode";

interface FileMentionTextProps {
  text: string;
  className?: string;
}

/**
 * Renders text with <vibe-work-file> tags as inline styled pills, and
 * <vibe-work-skill> tags as the skill chips they were in the message box
 */
export const FileMentionText: React.FC<FileMentionTextProps> = ({
  text,
  className = "",
}) => {
  // Parse text and split into segments (text and file mentions)
  const segments = parseFileMentions(text);

  if (segments.length === 0) {
    return null;
  }

  return (
    <span className={className}>
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return <span key={index}>{segment.content}</span>;
        } else if (segment.type === "skill") {
          return <SkillChip key={index} id={segment.content} />;
        } else {
          const filename = segment.content.split("/").pop() || segment.content;
          return (
            <span
              key={index}
              className="file-mention-pill"
              title={segment.content}
            >
              <FileText className="h-3 w-3 shrink-0" />
              <span className="truncate max-w-[200px]">{filename}</span>
            </span>
          );
        }
      })}
    </span>
  );
};

interface TextSegment {
  type: "text" | "file" | "skill";
  content: string;
}

/**
 * Parse text into segments of plain text and file mentions
 */
function parseFileMentions(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const regex = /<vibe-work-(file|skill)>(.*?)<\/vibe-work-\1>/g;

  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        content: text.slice(lastIndex, match.index),
      });
    }

    // Add the file mention
    segments.push({
      type: match[1] === "skill" ? "skill" : "file",
      content: match[2].trim(),
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last match
  if (lastIndex < text.length) {
    segments.push({
      type: "text",
      content: text.slice(lastIndex),
    });
  }

  return segments;
}

/**
 * Check if text contains any file mention tags
 */
export function hasFileMentions(text: string): boolean {
  return /<vibe-work-(file|skill)>.*?<\/vibe-work-\1>/.test(text);
}

/** Skill ids chosen with "/" in a sent message, in order, once each */
export function skillMentions(text: string): string[] {
  const ids: string[] = [];
  for (const m of text.matchAll(/<vibe-work-skill>(.*?)<\/vibe-work-skill>/g)) {
    const id = m[1].trim();
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** The message as it reads: skill chips as "/id", file mentions as their paths */
export function plainMessageText(text: string): string {
  return text.replace(/<vibe-work-skill>(.*?)<\/vibe-work-skill>/g, "/$1").replace(/<vibe-work-file>(.*?)<\/vibe-work-file>/g, "$1");
}
