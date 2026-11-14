/**
 * Read-only source view: line numbers plus syntax highlighting. Highlighting
 * loads after the plain text is on screen, and is skipped for very large
 * files (they still show, unhighlighted).
 */

import React, { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { ThemedToken } from "./codeHighlighter";

/** Above this many characters the file is shown without highlighting */
const MAX_HIGHLIGHT_CHARS = 300_000;
/** Above this many lines only the first ones are rendered */
const MAX_LINES = 20_000;

const FONT_STYLE_ITALIC = 1;
const FONT_STYLE_BOLD = 2;
const FONT_STYLE_UNDERLINE = 4;

function tokenStyle(token: ThemedToken): React.CSSProperties | undefined {
  const style: React.CSSProperties = {};
  if (token.color) style.color = token.color;
  const fs = token.fontStyle ?? 0;
  if (fs > 0) {
    if (fs & FONT_STYLE_ITALIC) style.fontStyle = "italic";
    if (fs & FONT_STYLE_BOLD) style.fontWeight = 600;
    if (fs & FONT_STYLE_UNDERLINE) style.textDecoration = "underline";
  }
  return style;
}

export function CodeView({
  text,
  language,
  className,
}: {
  text: string;
  /** Highlighter language id from fileKinds.languageFor; "text" for none */
  language: string;
  className?: string;
}) {
  const allLines = useMemo(() => text.replace(/\r\n?/g, "\n").split("\n"), [text]);
  // A trailing newline does not make an extra numbered line
  const lineCount = allLines.length > 1 && allLines[allLines.length - 1] === "" ? allLines.length - 1 : allLines.length;
  const truncated = lineCount > MAX_LINES;
  const lines = useMemo(() => allLines.slice(0, Math.min(lineCount, MAX_LINES)), [allLines, lineCount]);

  const [tokens, setTokens] = useState<{ source: string; lines: ThemedToken[][] } | null>(null);

  useEffect(() => {
    if (language === "text" || text.length > MAX_HIGHLIGHT_CHARS) return;
    let cancelled = false;
    const source = lines.join("\n");
    import("./codeHighlighter")
      .then(({ tokenize }) => tokenize(source, language))
      .then((result) => {
        if (!cancelled && result) setTokens({ source, lines: result });
      })
      .catch((err) => console.warn("[CodeView] highlighting failed:", err));
    return () => {
      cancelled = true;
    };
  }, [lines, language, text.length]);

  const highlighted = tokens && tokens.source === lines.join("\n") ? tokens.lines : null;
  const gutter = useMemo(() => lines.map((_, i) => i + 1).join("\n"), [lines]);

  return (
    <div className={cn("code-view h-full overflow-auto bg-background", className)}>
      <div className="flex min-w-max py-3 font-mono text-meta leading-5">
        <div
          aria-hidden
          className="sticky left-0 z-[1] shrink-0 whitespace-pre bg-background pr-4 pl-4 text-right text-muted-foreground/60 tabular-nums select-none"
        >
          {gutter}
        </div>
        <pre className="m-0 flex-1 pr-6 whitespace-pre text-foreground select-text">
          <code>
            {highlighted
              ? highlighted.map((line, i) => (
                  <React.Fragment key={i}>
                    {line.map((token, j) => (
                      <span key={j} style={tokenStyle(token)}>
                        {token.content}
                      </span>
                    ))}
                    {i < highlighted.length - 1 ? "\n" : null}
                  </React.Fragment>
                ))
              : lines.join("\n")}
          </code>
        </pre>
      </div>
      {truncated && (
        <div className="px-4 pb-4 text-meta text-muted-foreground">
          Showing the first {MAX_LINES.toLocaleString()} of {lineCount.toLocaleString()} lines.
        </div>
      )}
    </div>
  );
}
