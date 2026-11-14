import { writeArtifact } from "@/tauri/artifacts";
import { rasterPdf } from "./pdf";
import { snapshotSvg, exportWarnings } from "./snapshot";
export { exportWarnings };
export async function svgCanvas(
  svg: string,
  width: number,
  height: number,
  scale = 1,
) {
  if (!width || !height || width * height * scale * scale > 32_000_000)
    throw Error("Choose a frame under 32 million pixels at this export size.");
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const c = document.createElement("canvas");
    c.width = width * scale;
    c.height = height * scale;
    c.getContext("2d")!.drawImage(image, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function exportLive({
  documents,
  elements,
  format,
  scale,
  path,
  sessionId,
}: {
  documents: Map<string, Document>;
  elements: HTMLElement[];
  format: "png" | "svg" | "pdf";
  scale: 1 | 2;
  path: string;
  sessionId: string;
}) {
  if (format === "pdf") {
    const frames =
      elements.length === 1 && elements[0].hasAttribute("data-design-frame")
        ? [...documents.values()]
            .map((d) => d.querySelector<HTMLElement>("[data-design-frame]")!)
            .filter(Boolean)
        : null;
    const sets = frames ? frames.map((f) => [f]) : [elements],
      pages = [];
    for (const set of sets) {
      const s = snapshotSvg(set),
        c = await svgCanvas(s.svg, s.width, s.height);
      const ctx = c.getContext("2d")!;
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      const raw = atob(c.toDataURL("image/jpeg", 0.98).split(",")[1]);
      pages.push({
        width: c.width,
        height: c.height,
        jpeg: Uint8Array.from(raw, (x) => x.charCodeAt(0)),
      });
    }
    const pdf = rasterPdf(pages);
    let binary = "";
    for (let i = 0; i < pdf.length; i += 8192)
      binary += String.fromCharCode(...pdf.subarray(i, i + 8192));
    await writeArtifact(sessionId, path, { base64: btoa(binary) });
    return;
  }
  const s = snapshotSvg(elements);
  if (format === "svg") {
    await writeArtifact(sessionId, path, { text: s.svg });
    return;
  }
  const canvas = await svgCanvas(s.svg, s.width, s.height, scale);
  await writeArtifact(sessionId, path, {
    base64: canvas.toDataURL("image/png").split(",")[1],
  });
}
