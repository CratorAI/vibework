/**
 * In-app PowerPoint export: builds the .pptx in the editor (pptxgenjs, loaded
 * on demand) and writes it next to the deck through the artifact API.
 */

import { readArtifact, writeArtifact } from "@/tauri/artifacts";
import type { ArtifactRef } from "../types";
import type { Deck } from "./core/parse";

function dirOf(p: string): { dir: string; sep: string } {
  const k = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return { dir: p.slice(0, k + 1), sep: p.includes("\\") && !p.includes("/") ? "\\" : "/" };
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Returns the path of the written .pptx */
export async function exportPptx(artifact: ArtifactRef, deck: Deck): Promise<string> {
  const { buildPptx, imageSize } = await import("./core/pptx");
  const { dir, sep } = dirOf(artifact.path);
  const b64 = (await buildPptx(
    deck,
    {
      loadImage: async (src) => {
        if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return null;
        const rel = decodeURI(src).replace(/^\.\//, "").split("/").join(sep);
        const file = await readArtifact(artifact.sessionId, dir + rel);
        if (!file.base64) return null;
        const size = imageSize(base64ToBytes(file.base64.slice(0, 512 * 1024)));
        if (!size) return null;
        return { data: `data:${size.mime};base64,${file.base64}`, width: size.width, height: size.height };
      },
    },
    "base64",
  )) as string;
  const name = artifact.name.replace(/\.slides\.md$/i, "").replace(/\.md$/i, "") + ".pptx";
  const out = dir + name;
  await writeArtifact(artifact.sessionId, out, { base64: b64 });
  return out;
}
