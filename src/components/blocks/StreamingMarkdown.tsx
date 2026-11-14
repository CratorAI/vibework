/**
 * StreamingMarkdown
 *
 * Markdown that renders smoothly while it streams:
 *
 * - Text is paced (useSmoothedText) so bursts of deltas read as steady typing.
 * - The text is split into segments on blank lines and each segment is a
 *   memoized ReactMarkdown, so while streaming only the last (growing)
 *   segment re-parses. Per-update cost is O(current paragraph), not O(answer).
 * - GFM (tables, strikethrough, task lists, autolinks) via remark-gfm.
 *
 * Wrap in your own `prose` container.
 */

import { memo, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@/tauri/files";
import { useSmoothedText } from "@/hooks/useSmoothedText";
import { rehypeNumericColumns, stabilizeStreamingTable } from "./markdownTables";

// Module-level so every segment receives the same references (memo-friendly).
const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeNumericColumns];

const COMPONENTS: Components = {
  // Links open in the system browser, never inside the webview.
  a: ({ href, children, node: _node, ...props }) => (
    <a
      {...props}
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (href) openUrl(href);
      }}
      className="cursor-pointer underline"
    >
      {children}
    </a>
  ),
  // Wide tables scroll inside the message instead of widening the column.
  table: ({ children, node: _node, ...props }) => (
    <div className="md-table">
      <table {...props}>{children}</table>
    </div>
  ),
};

/**
 * One markdown segment. Memoized so completed segments keep their identical
 * string prop and skip rendering entirely.
 */
export const MarkdownSegment = memo(function MarkdownSegment({
  text,
}: {
  text: string;
}) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={COMPONENTS}>
      {text}
    </ReactMarkdown>
  );
});

const FENCE_OPEN = /^(`{3,}|~{3,})/;

/**
 * Split markdown into independently parseable segments on blank lines.
 *
 * Never splits inside a fenced code block (a fence can contain blank lines),
 * and never splits before an indented line (list-item continuation or an
 * indented code block belongs to what precedes it; a segment starting with
 * an indented line would render as a stray code block).
 *
 * Segments are append-only while streaming: once a segment is closed (the
 * first character of the next unindented line has arrived) it never changes,
 * so it stays referentially stable for MarkdownSegment's memo.
 */
export function splitMarkdownSegments(text: string): string[] {
  const lines = text.split("\n");
  const segments: string[] = [];
  let current: string[] = [];
  let blanks = 0;
  let fence: string | null = null;

  for (const line of lines) {
    if (fence !== null) {
      // Inside a fence everything (blank lines included) belongs to it.
      current.push(line);
      const trimmed = line.trim();
      if (
        trimmed.length >= fence.length &&
        trimmed[0] === fence[0] &&
        /^(`+|~+)$/.test(trimmed)
      ) {
        fence = null;
      }
      continue;
    }

    if (line.trim() === "") {
      if (current.length > 0) blanks++;
      continue;
    }

    if (blanks > 0) {
      if (/^\s/.test(line)) {
        for (let i = 0; i < blanks; i++) current.push("");
      } else {
        segments.push(current.join("\n"));
        current = [];
      }
      blanks = 0;
    }

    current.push(line);
    const open = FENCE_OPEN.exec(line.trimStart());
    if (open) fence = open[1];
  }

  if (current.length > 0) segments.push(current.join("\n"));
  return segments;
}

/** A line that is only block markup so far ("#", "-", "**", "1.", ">"). */
const MARKER_ONLY_LINE = /^\s*([#>*+\-=_~`]+|\d+[.)]?)\s*$/;

/**
 * While streaming, the last line of the answer is usually half-written.
 * Parsed as-is it flickers: "#" renders as an empty heading before it becomes
 * "## Title", "*" as an empty bullet before "**Bold**", a table header as a
 * row of raw pipes until its delimiter row arrives, and an unclosed "**" or
 * "`" as literal characters until the closing one lands. This trims or closes
 * those so each partial frame renders as what the line is becoming.
 *
 * Only ever applied to the growing tail while it is partial; settled text is
 * rendered verbatim, so the end of the turn changes nothing.
 */
export function stabilizeStreamingTail(segment: string): string {
  const lines = segment.split("\n");
  // Inside an unclosed code fence everything renders as code already.
  const fenceLines = lines.filter((l) => FENCE_OPEN.test(l.trimStart())).length;
  if (fenceLines % 2 === 1) return segment;

  // A table appears once its header and delimiter rows are complete, then
  // grows a whole row at a time.
  const table = stabilizeStreamingTable(lines);
  if (table) return table.join("\n");

  let last = lines[lines.length - 1];
  if (MARKER_ONLY_LINE.test(last)) {
    return lines.slice(0, -1).join("\n");
  }

  // Close an unfinished bold or inline-code span on the last line. Closing
  // markers go before trailing spaces ("**new **" would not parse as bold),
  // and a half-typed closing "*" is replaced, not doubled.
  if ((last.match(/`/g)?.length ?? 0) % 2 === 1) {
    last = last.endsWith("`") ? last.slice(0, -1) : `${last}\``;
  } else {
    const boldMarks = (t: string) =>
      t.replace(/`[^`]*`/g, "").match(/\*\*/g)?.length ?? 0;
    const stripped = last.replace(/\*+$/, "");
    if (boldMarks(last) % 2 === 1 || boldMarks(stripped) % 2 === 1) {
      last =
        boldMarks(stripped) % 2 === 1
          ? stripped.replace(/(\s*)$/, "**$1")
          : stripped;
    }
  }
  lines[lines.length - 1] = last;
  return lines.join("\n");
}

/**
 * Streamed markdown, smoothed. `isStreaming` turns pacing on; when it turns
 * off, any unrevealed tail finishes quickly (useSmoothedText).
 */
export function StreamingMarkdown({
  text,
  isStreaming,
}: {
  text: string;
  isStreaming?: boolean;
}) {
  const paced = useSmoothedText(text, Boolean(isStreaming));
  // The tail is half-written while the stream runs, and also while the
  // reveal is still catching up after it ended.
  const partial = Boolean(isStreaming) || paced.length < text.length;
  const segments = useMemo(() => {
    const parts = splitMarkdownSegments(paced);
    if (partial && parts.length > 0) {
      const last = stabilizeStreamingTail(parts[parts.length - 1]);
      if (last.trim()) parts[parts.length - 1] = last;
      else parts.pop();
    }
    return parts;
  }, [paced, partial]);

  return (
    <>
      {segments.map((segment, i) => (
        <MarkdownSegment key={i} text={segment} />
      ))}
    </>
  );
}
