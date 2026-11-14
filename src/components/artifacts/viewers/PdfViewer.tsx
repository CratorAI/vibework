/**
 * PDF via pdf.js in the main window (the native PDF viewer does not run in a
 * sandboxed iframe). The file is read as base64 through readArtifact; pages
 * render to canvas as they scroll into view. Fit-width by default, with zoom
 * and page navigation.
 *
 * The legacy build is used for WebKit compatibility; its worker is bundled as
 * a same-origin asset (worker-src 'self').
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, MoveHorizontal, Plus } from "lucide-react";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { ArtifactViewProps } from "../types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { decodeBase64, useArtifactFile } from "./useArtifactFile";
import { NoPreviewCard, ViewerError, ViewerLoading, ViewerMessage } from "./ViewerStates";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
const PAGE_GAP = 12;
const SIDE_PADDING = 16;

interface PageSize {
  width: number;
  height: number;
}

function PdfPage({
  doc,
  index,
  size,
  scale,
  registerRef,
}: {
  doc: PDFDocumentProxy;
  index: number;
  size: PageSize;
  scale: number;
  registerRef: (index: number, el: HTMLDivElement | null) => void;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let task: RenderTask | null = null;
    let cancelled = false;
    let page: PDFPageProxy | null = null;
    doc.getPage(index + 1).then((p) => {
      if (cancelled || !canvas.current) return;
      page = p;
      const dpr = window.devicePixelRatio || 1;
      const viewport = p.getViewport({ scale: scale * dpr });
      const c = canvas.current;
      c.width = Math.floor(viewport.width);
      c.height = Math.floor(viewport.height);
      task = p.render({ canvas: c, viewport });
      task.promise.catch((err: unknown) => {
        if ((err as { name?: string })?.name !== "RenderingCancelledException") console.warn("[PdfViewer] render failed:", err);
      });
    });
    return () => {
      cancelled = true;
      task?.cancel();
      page?.cleanup();
    };
  }, [doc, index, scale, visible]);

  return (
    <div
      ref={(el) => {
        holder.current = el;
        registerRef(index, el);
      }}
      data-page={index + 1}
      className="relative mx-auto shrink-0 bg-artifact-canvas shadow-sm ring-1 ring-border"
      style={{ width: size.width * scale, height: size.height * scale }}
    >
      <canvas ref={canvas} className="block size-full" />
    </div>
  );
}

export default function PdfViewer({ artifact, modifiedMs }: ArtifactViewProps) {
  const { data: file, error: readError } = useArtifactFile(artifact, modifiedMs);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [fit, setFit] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const pageEls = useRef(new Map<number, HTMLDivElement>());

  // Load the document whenever the file's bytes change
  useEffect(() => {
    if (!file?.base64) return;
    let cancelled = false;
    const task = pdfjs.getDocument({ data: decodeBase64(file.base64), useSystemFonts: true });
    task.promise.then(
      async (pdf) => {
        const all: PageSize[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const vp = page.getViewport({ scale: 1 });
          all.push({ width: vp.width, height: vp.height });
        }
        if (cancelled) return;
        setLoadError(null);
        setSizes(all);
        setDoc(pdf);
      },
      (err) => {
        if (!cancelled) setLoadError(err);
      },
    );
    return () => {
      cancelled = true;
      task.destroy().catch(() => {});
    };
  }, [file?.base64]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [doc]);

  const maxPageWidth = useMemo(() => sizes.reduce((w, s) => Math.max(w, s.width), 0), [sizes]);
  const fitScale = maxPageWidth > 0 && containerWidth > 0 ? Math.max(0.25, (containerWidth - SIDE_PADDING * 2) / maxPageWidth) : 1;
  const scale = fit ? fitScale : zoom;

  const registerRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) pageEls.current.set(index, el);
    else pageEls.current.delete(index);
  }, []);

  // Track the page at the top of the view
  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const top = el.scrollTop + 40;
    let page = 1;
    for (const [index, pageEl] of pageEls.current) {
      if (pageEl.offsetTop <= top) page = Math.max(page, index + 1);
    }
    setCurrentPage(page);
  }, []);

  const goTo = (page: number) => {
    const target = Math.min(Math.max(1, page), sizes.length);
    const el = pageEls.current.get(target - 1);
    if (el && scroller.current) scroller.current.scrollTop = el.offsetTop - PAGE_GAP;
  };

  const stepZoom = (dir: 1 | -1) => {
    const base = scale;
    const next =
      dir > 0
        ? ZOOM_STEPS.find((z) => z > base + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]
        : [...ZOOM_STEPS].reverse().find((z) => z < base - 0.001) ?? ZOOM_STEPS[0];
    setFit(false);
    setZoom(next);
  };

  if (readError) return <ViewerError error={readError} path={artifact.path} name={artifact.name} />;
  if (file && file.base64 === null) return <NoPreviewCard path={file.path} name={file.name} reason="This file could not be read as a PDF." />;
  if (loadError) {
    const message = (loadError as { message?: string })?.message;
    return <ViewerMessage title="Could not open this PDF" detail={message} tone="error" />;
  }
  if (!doc) return <ViewerLoading label="Opening PDF…" />;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b px-2 text-meta text-muted-foreground">
        <Button variant="ghost" size="icon-sm" title="Previous page" onClick={() => goTo(currentPage - 1)} disabled={currentPage <= 1}>
          <ChevronLeft />
        </Button>
        <span className="min-w-14 text-center tabular-nums">
          {currentPage} / {sizes.length}
        </span>
        <Button variant="ghost" size="icon-sm" title="Next page" onClick={() => goTo(currentPage + 1)} disabled={currentPage >= sizes.length}>
          <ChevronRight />
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" title="Zoom out" onClick={() => stepZoom(-1)}>
            <Minus />
          </Button>
          <span className="min-w-11 text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="icon-sm" title="Zoom in" onClick={() => stepZoom(1)}>
            <Plus />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Fit width"
            aria-pressed={fit}
            onClick={() => setFit(true)}
            className={cn(fit && "bg-muted text-foreground")}
          >
            <MoveHorizontal />
          </Button>
        </div>
      </div>
      <div ref={scroller} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-auto bg-muted/40">
        <div className="flex min-w-max flex-col py-3" style={{ gap: PAGE_GAP, paddingLeft: SIDE_PADDING, paddingRight: SIDE_PADDING }}>
          {sizes.map((size, i) => (
            <PdfPage key={i} doc={doc} index={i} size={size} scale={scale} registerRef={registerRef} />
          ))}
        </div>
      </div>
    </div>
  );
}
