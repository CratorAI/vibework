/**
 * Read-only PowerPoint view, slide by slide: a toolbar (previous, "3 / 12",
 * next, then the read-only line and its action), the slide list, and the
 * current slide as a static page in the sandboxed iframe (no scripts, see
 * office/shared.tsx). ←/→ (and PageUp/PageDown) move between slides.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ArtifactViewProps } from "../types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { readDeck, slidePage, type Deck } from "../office/pptx";
import { officeTheme, ReadOnlyLine } from "../office/shared";
import { SandboxFrame, useInlinePage } from "../viewers/SandboxFrame";
import { decodeBase64, useArtifactFile } from "../viewers/useArtifactFile";
import { useIsDark } from "../viewers/useIsDark";
import { ViewerError, ViewerLoading, ViewerMessage } from "../viewers/ViewerStates";

export default function PptxViewer({ artifact, modifiedMs }: ArtifactViewProps) {
  const file = useArtifactFile(artifact, modifiedMs);
  const dark = useIsDark();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const base64 = file.data?.base64;
    if (!base64) return;
    try {
      const next = readDeck(decodeBase64(base64));
      setDeck(next);
      setFailed(false);
      setIndex((i) => Math.min(i, Math.max(0, next.slides.length - 1)));
    } catch (err) {
      console.warn("[pptx] could not read deck", err);
      setFailed(true);
    }
  }, [file.data]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const narrow = width > 0 && width < 560;

  const count = deck?.slides.length ?? 0;
  const go = useCallback((i: number) => setIndex(Math.max(0, Math.min(count - 1, i))), [count]);

  // Canvas behind the slide: the panel's own muted tone (`dark` re-themes it)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const canvas = useMemo(() => officeTheme().canvas, [dark]);
  const html = useMemo(() => {
    if (!deck || count === 0) return null;
    try {
      return slidePage(deck, index, canvas);
    } catch (err) {
      console.warn("[pptx] could not render slide", err);
      return null;
    }
  }, [deck, index, count, canvas]);
  const page = useInlinePage(html);

  // Keep the current slide's row in view
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-slide="${index}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [index]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (["ArrowRight", "ArrowDown", "PageDown"].includes(e.key)) {
      e.preventDefault();
      go(index + 1);
    } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
      e.preventDefault();
      go(index - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      go(0);
    } else if (e.key === "End") {
      e.preventDefault();
      go(count - 1);
    }
  };

  if (file.error) return <ViewerError error={file.error} path={artifact.path} name={artifact.name} />;
  if (failed) {
    return <ViewerMessage title="Couldn’t read this presentation" detail="It may be damaged, or not a PowerPoint file. Open it in its app instead." tone="error" />;
  }

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col bg-background outline-none" tabIndex={-1} onKeyDown={onKeyDown}>
      <div className="flex h-10 shrink-0 items-center gap-0.5 border-b px-1.5 text-meta" data-testid="office-readonly">
        <Button variant="ghost" size="icon-sm" aria-label="Previous slide" title="Previous slide" onClick={() => go(index - 1)} disabled={index <= 0}>
          <ChevronLeft />
        </Button>
        <span className="min-w-[3.25rem] text-center text-muted-foreground tabular-nums">{count ? `${index + 1} / ${count}` : "0 / 0"}</span>
        <Button variant="ghost" size="icon-sm" aria-label="Next slide" title="Next slide" onClick={() => go(index + 1)} disabled={index >= count - 1}>
          <ChevronRight />
        </Button>
        <ReadOnlyLine path={artifact.path} className="ml-2 min-w-0 flex-1 truncate text-muted-foreground" />
      </div>

      <div className={cn("flex min-h-0 flex-1", narrow ? "flex-col-reverse" : "flex-row")}>
        <div
          ref={listRef}
          role="listbox"
          aria-label="Slides"
          className={cn(
            "shrink-0 overflow-auto bg-background p-1.5",
            narrow ? "flex h-11 gap-1 border-t" : "w-[184px] border-r",
          )}
        >
          {deck?.slides.map((slide, i) => (
            <button
              key={slide.path}
              type="button"
              role="option"
              aria-selected={i === index}
              data-slide={i}
              title={slide.title || `Slide ${i + 1}`}
              onClick={() => go(i)}
              className={cn(
                "flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                narrow ? "max-w-[180px]" : "w-full",
                i === index ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <span className="w-5 shrink-0 text-right text-xs text-faint tabular-nums">{i + 1}</span>
              <span className="min-w-0 truncate">{slide.title || `Slide ${i + 1}`}</span>
            </button>
          ))}
        </div>
        <div className="relative min-h-0 min-w-0 flex-1">
          {count === 0 && deck ? (
            <ViewerMessage title="This presentation has no slides" />
          ) : page.error ? (
            <ViewerError error={page.error} path={artifact.path} name={artifact.name} />
          ) : page.url ? (
            <SandboxFrame src={page.url} title={`${artifact.name}, slide ${index + 1}`} scripts={false} canvas="app" />
          ) : (
            <ViewerLoading label="Opening presentation" />
          )}
        </div>
      </div>
    </div>
  );
}
