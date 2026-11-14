/**
 * First page of a PDF as a small JPEG data URL, for the Artifacts page.
 *
 * pdf.js (the same build the PDF viewer uses) is loaded only when the first
 * PDF card scrolls into view, shares one worker across thumbnails, and
 * renders to a detached canvas. Callers queue one at a time.
 */
import { decodeBase64 } from "@/components/artifacts/viewers/useArtifactFile";
import { readArtifact } from "@/tauri/artifacts";

/** Bigger PDFs keep the type icon: the bytes cross IPC whole. */
export const MAX_PDF_THUMB_BYTES = 15 * 1024 * 1024;

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let lib: Promise<{ pdfjs: PdfJs; worker: InstanceType<PdfJs["PDFWorker"]> }> | null = null;

function load() {
  lib ??= Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return { pdfjs, worker: new pdfjs.PDFWorker() };
  });
  return lib;
}

/** `width` in CSS pixels; rendered at the screen's density. */
export async function pdfFirstPage(sessionId: string, path: string, width: number): Promise<string | null> {
  const file = await readArtifact(sessionId, path);
  if (!file.base64) return null;
  const { pdfjs, worker } = await load();
  const task = pdfjs.getDocument({ data: decodeBase64(file.base64), worker, useSystemFonts: true });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = (width * Math.min(window.devicePixelRatio || 1, 2)) / base.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    // Paper is white whatever the theme (pages without a fill are transparent).
    await page.render({ canvas, viewport, background: "white" }).promise;
    page.cleanup();
    const url = canvas.toDataURL("image/jpeg", 0.82);
    canvas.width = canvas.height = 0;
    return url;
  } finally {
    await task.destroy();
  }
}
