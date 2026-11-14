/**
 * Visual rules: colours, shapes and sizes for each kind of node.
 * Colours come from Excalidraw's own palette so the person's colour picker recognises them.
 */

import type { BoardSpec, NodeKind, NodeSpec } from "./spec.ts";
import { BOUND_TEXT_PADDING, FONT, textBlockWidth, textHeight, wrapText } from "./excalidraw.ts";

/** open-color shades 0, 2, 4, 6, 8 (Excalidraw's palette) */
const SHADES: Record<string, [string, string, string, string, string]> = {
  gray: ["#f8f9fa", "#e9ecef", "#ced4da", "#868e96", "#343a40"],
  blue: ["#e7f5ff", "#a5d8ff", "#4dabf7", "#228be6", "#1971c2"],
  green: ["#ebfbee", "#b2f2bb", "#69db7c", "#40c057", "#2f9e44"],
  yellow: ["#fff9db", "#ffec99", "#ffd43b", "#fab005", "#f08c00"],
  orange: ["#fff4e6", "#ffd8a8", "#ffa94d", "#fd7e14", "#e8590c"],
  red: ["#fff5f5", "#ffc9c9", "#ff8787", "#fa5252", "#e03131"],
  purple: ["#f3f0ff", "#d0bfff", "#9775fa", "#7950f2", "#6741d9"],
  pink: ["#fff0f6", "#fcc2d7", "#f783ac", "#e64980", "#c2255c"],
  teal: ["#e6fcf5", "#96f2d7", "#38d9a9", "#12b886", "#099268"],
};

export const INK = "#1e1e1e";
export const EDGE_INK = "#495057";
export const WHITE = "#ffffff";

export interface Paint {
  strokeColor: string;
  backgroundColor: string;
}

/** Stroke and fill for a node of `kind` in `color` (palette name or #hex). */
export function paintFor(kind: NodeKind, color: string): Paint {
  if (kind === "text") {
    if (color.startsWith("#")) return { strokeColor: color, backgroundColor: "transparent" };
    const s = SHADES[color];
    return { strokeColor: s ? s[4] : INK, backgroundColor: "transparent" };
  }
  if (kind === "note") {
    if (color.startsWith("#")) return { strokeColor: "transparent", backgroundColor: color };
    const s = SHADES[color === "default" ? "yellow" : color] ?? SHADES.yellow;
    return { strokeColor: "transparent", backgroundColor: s[1] };
  }
  if (color.startsWith("#")) return { strokeColor: INK, backgroundColor: color };
  const s = SHADES[color];
  if (!s) return { strokeColor: INK, backgroundColor: WHITE };
  return { strokeColor: s[4], backgroundColor: s[0] };
}

/** Best palette name for an element's current colours, or the fill as #hex, or "default". */
export function colorNameFor(kind: NodeKind, paint: Paint): string {
  const names = ["default", ...Object.keys(SHADES)];
  for (const name of names) {
    const p = paintFor(kind, name);
    if (p.strokeColor === paint.strokeColor && p.backgroundColor === paint.backgroundColor) return name;
  }
  // Any shade of a palette colour (the person's colour picker offers several): that colour.
  for (const name of Object.keys(SHADES)) {
    if (SHADES[name].includes(paint.backgroundColor)) return name;
  }
  if (paint.backgroundColor === "transparent" || paint.backgroundColor === WHITE) {
    for (const name of Object.keys(SHADES)) if (SHADES[name].includes(paint.strokeColor)) return name;
  }
  if (kind === "text") {
    for (const name of Object.keys(SHADES)) if (SHADES[name][4] === paint.strokeColor) return name;
    return paint.strokeColor === INK ? "default" : paint.strokeColor;
  }
  if (paint.backgroundColor === "transparent" || paint.backgroundColor === WHITE) return "default";
  return paint.backgroundColor;
}

export function fontFor(spec: Pick<BoardSpec, "style">): number {
  return spec.style === "sketch" ? FONT.Excalifont : FONT.Nunito;
}

export function roughnessFor(spec: Pick<BoardSpec, "style">): number {
  return spec.style === "sketch" ? 1 : 0;
}

export const SIZES = {
  fontSize: 20,
  edgeFontSize: 16,
  titleFontSize: 28,
  boxPadX: 24,
  boxPadY: 18,
  boxMinW: 150,
  boxMaxTextW: 210,
  boxMinH: 64,
  edgeLabelMaxW: 150,
};

export type ShapeType = "rectangle" | "ellipse" | "diamond" | "text";

export interface NodeGeometry {
  type: ShapeType;
  width: number;
  height: number;
  roundness: { type: number; value?: number } | null;
}

export function shapeTypeFor(kind: NodeKind): ShapeType {
  if (kind === "decision") return "diamond";
  if (kind === "ellipse") return "ellipse";
  if (kind === "text") return "text";
  return "rectangle";
}

export function roundnessFor(kind: NodeKind): { type: number; value?: number } | null {
  if (kind === "box") return { type: 3, value: 8 };
  if (kind === "rounded") return { type: 3 };
  if (kind === "note") return { type: 3, value: 4 };
  return null;
}

/** Widest text a node of this kind wraps to */
export function maxTextWidth(kind: NodeKind): number {
  switch (kind) {
    case "decision":
      return 130;
    case "ellipse":
      return 150;
    case "note":
      return 200;
    case "text":
      return 420;
    default:
      return SIZES.boxMaxTextW;
  }
}

/** Natural size of a node for its label */
export function measureNode(node: Pick<NodeSpec, "kind" | "label">, fontFamily: number): NodeGeometry {
  const fs = SIZES.fontSize;
  const lines = wrapText(node.label || " ", maxTextWidth(node.kind), fs, fontFamily);
  const tw = Math.ceil(textBlockWidth(lines, fs, fontFamily));
  const th = textHeight(lines.length, fs);
  const pad = BOUND_TEXT_PADDING * 2;
  const type = shapeTypeFor(node.kind);
  const roundness = roundnessFor(node.kind);
  switch (node.kind) {
    case "decision": {
      // Excalidraw fits text in the inner half of a diamond.
      const width = Math.max(170, 2 * (tw + pad) + 36);
      const height = Math.max(96, 2 * (th + pad) + 20);
      return { type, width: even(width), height: even(height), roundness };
    }
    case "ellipse": {
      const width = Math.max(130, Math.round((tw + pad) * Math.SQRT2) + 28);
      const height = Math.max(70, Math.round((th + pad) * Math.SQRT2) + 12);
      return { type, width: even(width), height: even(height), roundness };
    }
    case "note": {
      const width = Math.max(170, tw + 40);
      const height = Math.max(110, th + 44);
      return { type, width: even(width), height: even(height), roundness };
    }
    case "text":
      return { type, width: Math.max(tw, 10), height: th, roundness: null };
    default: {
      const width = Math.max(SIZES.boxMinW, tw + 2 * SIZES.boxPadX);
      const height = Math.max(SIZES.boxMinH, th + 2 * SIZES.boxPadY);
      return { type, width: even(width), height: even(height), roundness };
    }
  }
}

function even(v: number): number {
  return Math.ceil(v / 2) * 2;
}

/** Text area of a container, as Excalidraw computes it (getBoundTextMaxWidth/Height) */
export function textArea(type: ShapeType, width: number, height: number): { w: number; h: number } {
  const p = BOUND_TEXT_PADDING * 2;
  if (type === "ellipse") return { w: Math.round((width / 2) * Math.SQRT2) - p, h: Math.round((height / 2) * Math.SQRT2) - p };
  if (type === "diamond") return { w: Math.round(width / 2) - p, h: Math.round(height / 2) - p };
  return { w: width - p, h: height - p };
}

/** Whether `label` fits a container of the given size and kind without growing it */
export function labelFits(type: ShapeType, label: string, width: number, height: number, fontSize: number, fontFamily: number): boolean {
  if (type === "text") return true;
  const area = textArea(type, width, height);
  const lines = wrapText(label || " ", area.w, fontSize, fontFamily);
  return textBlockWidth(lines, fontSize, fontFamily) <= area.w + 0.5 && textHeight(lines.length, fontSize) <= area.h + 0.5;
}
