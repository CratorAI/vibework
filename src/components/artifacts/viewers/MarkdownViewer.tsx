/**
 * Markdown, rendered in the main window with the same renderer as chat
 * messages (react-markdown + GFM; raw HTML in the file is not rendered and
 * nothing in it executes). Relative images load from the working folder;
 * relative links open the file in the panel; web links open in the browser.
 */

import { useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@/tauri/files";
import type { ArtifactViewProps } from "../types";
import { folderUrl, useArtifactFile, useArtifactStat } from "./useArtifactFile";
import { NoPreviewCard, ViewerError, ViewerLoading } from "./ViewerStates";

const REMARK_PLUGINS = [remarkGfm];

function isExternal(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href);
}

export function markdownComponents(opts: {
  baseUrl: string | null;
  onOpenArtifact?: (path: string) => void;
}): Components {
  return {
    a: ({ href, children, node: _node, ...props }) => (
      <a
        {...props}
        href={href}
        onClick={(e) => {
          e.preventDefault();
          if (!href || href.startsWith("#")) return;
          if (isExternal(href)) {
            if (/^(https?|mailto):/i.test(href)) openUrl(href);
            return;
          }
          // Relative link to another file in the working folder
          opts.onOpenArtifact?.(decodeURIComponent(href.split(/[?#]/)[0]));
        }}
        className="cursor-pointer underline"
      >
        {children}
      </a>
    ),
    img: ({ src, alt, node: _node, ...props }) => {
      let resolved = typeof src === "string" ? src : undefined;
      if (resolved && opts.baseUrl && !isExternal(resolved) && !resolved.startsWith("data:")) {
        try {
          resolved = new URL(resolved, opts.baseUrl).href;
        } catch {
          /* leave as-is */
        }
      }
      return <img {...props} src={resolved} alt={alt ?? ""} className="max-w-full rounded-md" />;
    },
    table: ({ children, node: _node, ...props }) => (
      <div className="overflow-x-auto">
        <table {...props}>{children}</table>
      </div>
    ),
  };
}

export default function MarkdownViewer({ artifact, modifiedMs, onOpenArtifact }: ArtifactViewProps) {
  const file = useArtifactFile(artifact, modifiedMs);
  const stat = useArtifactStat(artifact, modifiedMs);
  const baseUrl = stat.data ? folderUrl(stat.data.url) : null;
  const components = useMemo(() => markdownComponents({ baseUrl, onOpenArtifact }), [baseUrl, onOpenArtifact]);

  if (file.error) return <ViewerError error={file.error} path={artifact.path} name={artifact.name} />;
  if (!file.data) return <ViewerLoading />;
  if (file.data.text === null) {
    return <NoPreviewCard path={file.data.path} name={file.data.name} reason="This file is not text." />;
  }
  return (
    <div className="h-full overflow-y-auto">
      <article className="prose prose-chat mx-auto w-full max-w-[720px] px-8 pt-6 pb-16 select-text">
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
          {file.data.text}
        </ReactMarkdown>
      </article>
    </div>
  );
}
