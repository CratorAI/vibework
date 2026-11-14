/**
 * File-level helpers for .excalidraw boards that do not need the canvas library:
 * the blank board, parsing, and paths for exports.
 */

/** Written as `source` in files we create or save. */
export const SOURCE = "vibework";

/** Excalidraw's default canvas colour; shown as our own surface colour in the editor. */
export const DEFAULT_BACKGROUND = "#ffffff";

export interface BoardData {
  type: "excalidraw";
  version: number;
  source?: string;
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
  /** Board settings written by the vibework-whiteboard skill (layout direction, style); kept on save */
  vibework?: Record<string, unknown>;
}

export function blankBoard(): string {
  const data: BoardData = {
    type: "excalidraw",
    version: 2,
    source: SOURCE,
    elements: [],
    appState: { gridSize: 20, gridStep: 5, gridModeEnabled: false, viewBackgroundColor: DEFAULT_BACKGROUND },
    files: {},
  };
  return JSON.stringify(data, null, 2);
}

export class BoardParseError extends Error {}

/** Parse file text; an empty file is an empty board. */
export function parseBoard(text: string): BoardData {
  if (!text.trim()) return JSON.parse(blankBoard()) as BoardData;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new BoardParseError(`This board is not valid JSON (${(e as Error).message}).`);
  }
  if (!data || typeof data !== "object" || (data as BoardData).type !== "excalidraw" || !Array.isArray((data as BoardData).elements)) {
    throw new BoardParseError("This file is not an Excalidraw board.");
  }
  return data as BoardData;
}

/** `/dir/name.excalidraw` → `/dir/name.png` */
export function siblingPath(path: string, extension: string): string {
  const stem = path.replace(/\.excalidraw$/i, "");
  return `${stem}.${extension}`;
}

/** File name part of a path (either separator). */
export function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

/** Whether a link on a shape points at a web page or mail address rather than a file. */
export function isExternalLink(link: string): boolean {
  return /^(https?:|mailto:)/i.test(link.trim());
}

/** Resolve a shape link that names a file, relative to the board's folder. */
export function resolveFileLink(boardPath: string, link: string): string {
  const clean = link.trim().replace(/^file:\/\//i, "");
  if (clean.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(clean)) return clean;
  const sep = boardPath.includes("\\") && !boardPath.includes("/") ? "\\" : "/";
  const dir = boardPath.slice(0, Math.max(boardPath.lastIndexOf("/"), boardPath.lastIndexOf("\\")));
  const parts = `${dir}${sep}${clean}`.split(/[\\/]/);
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p !== ".") out.push(p);
  }
  return out.join(sep);
}
