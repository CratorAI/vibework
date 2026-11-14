/**
 * Tiny reads of office files for the Artifacts page's cards: the opening of a
 * Word document (its first heading and a few lines) and the first slide's
 * title of a deck. Only the parts needed are inflated; no media, no mammoth.
 */

import { unzipSync } from "fflate";
import { readDeck } from "./pptx";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** First heading (or the first line) and up to 8 more lines of a .docx */
export function docxHead(bytes: Uint8Array): { title: string; lines: string[] } {
  const files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("Not a Word document");
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(xml), "application/xml");
  let title = "";
  const lines: string[] = [];
  for (const p of Array.from(doc.getElementsByTagNameNS(W, "p"))) {
    const text = Array.from(p.getElementsByTagNameNS(W, "t")).map((t) => t.textContent ?? "").join("").trim();
    if (!text) continue;
    const style = p.getElementsByTagNameNS(W, "pStyle")[0]?.getAttributeNS(W, "val") ?? "";
    if (!title && /^(title|heading\s?\d?)$/i.test(style)) title = text.slice(0, 200);
    else lines.push(text.slice(0, 200));
    if (title && lines.length >= 8) break;
    if (lines.length >= 40) break;
  }
  if (!title && lines.length) title = lines.shift()!;
  return { title, lines: lines.slice(0, 8) };
}

/** The first slide's title of a .pptx, and the number of slides */
export function pptxHead(bytes: Uint8Array): { title: string; slides: number } {
  const deck = readDeck(bytes, { media: false });
  return { title: deck.slides[0]?.title ?? "", slides: deck.slides.length };
}
