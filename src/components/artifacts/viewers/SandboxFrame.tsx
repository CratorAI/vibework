/**
 * The only way the panel renders model-written web content: an iframe on the
 * `artifact:` scheme with a fixed sandbox (scripts, forms, popups, modals;
 * never same-origin) and no referrer. Never `srcdoc` or `blob:`.
 *
 * `useInlinePage` turns a generated harness page (React preview, Mermaid)
 * into an `artifact://…/~inline/<id>` URL and releases it when it changes or
 * the view unmounts.
 */

import { useEffect, useState } from "react";
import { createInlineArtifact, releaseInlineArtifact } from "@/tauri/artifacts";
import { cn } from "@/lib/utils";

export const ARTIFACT_SANDBOX = "allow-scripts allow-forms allow-popups allow-modals";

export function SandboxFrame({
  src,
  title,
  className,
  canvas = "page",
  scripts = true,
}: {
  /** An artifact:// (or http://artifact.localhost) URL */
  src: string;
  title: string;
  className?: string;
  /** "page": white paper like a browser tab; "app": the app's background (diagrams) */
  canvas?: "page" | "app";
  /** false: a static page (office documents); the frame gets no script permission at all */
  scripts?: boolean;
}) {
  return (
    <iframe
      src={src}
      title={title}
      sandbox={scripts ? ARTIFACT_SANDBOX : ""}
      referrerPolicy="no-referrer"
      className={cn(
        "block size-full border-0",
        canvas === "page" ? "bg-artifact-canvas" : "bg-background",
        className,
      )}
    />
  );
}

export function useInlinePage(html: string | null): { url: string | null; error: unknown } {
  const [state, setState] = useState<{ url: string | null; error: unknown }>({ url: null, error: null });

  useEffect(() => {
    if (html === null) {
      setState({ url: null, error: null });
      return;
    }
    let cancelled = false;
    let createdId: string | null = null;
    createInlineArtifact(html).then(
      ({ id, url }) => {
        if (cancelled) {
          releaseInlineArtifact(id).catch(() => {});
          return;
        }
        createdId = id;
        setState({ url, error: null });
      },
      (error) => {
        if (!cancelled) setState({ url: null, error });
      },
    );
    return () => {
      cancelled = true;
      if (createdId) releaseInlineArtifact(createdId).catch(() => {});
    };
  }, [html]);

  return state;
}
