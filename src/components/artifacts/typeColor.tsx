/**
 * Colour identity per artifact type: the one place the app uses free colour
 * (see DESIGN.md, Colour). A file gets a hue from the type that opens it, or
 * from its extension when no viewer does; the hue shows only as a tinted chip
 * behind the type's icon.
 */

import type React from "react";
import { resolveArtifactType } from "./registry";

type Hue =
  | "spreadsheet" | "slides" | "document" | "whiteboard" | "data"
  | "motion" | "design" | "web" | "image" | "pdf" | "code" | "generic";

/* Literal class strings so Tailwind keeps them */
const CHIP: Record<Hue, string> = {
  motion: "bg-file-motion/14 text-file-motion",
  design: "bg-file-design/14 text-file-design",
  spreadsheet: "bg-file-spreadsheet/14 text-file-spreadsheet",
  slides: "bg-file-slides/14 text-file-slides",
  document: "bg-file-document/12 text-file-document",
  whiteboard: "bg-file-whiteboard/12 text-file-whiteboard",
  data: "bg-file-data/14 text-file-data",
  web: "bg-file-web/14 text-file-web",
  image: "bg-file-image/14 text-file-image",
  pdf: "bg-file-pdf/12 text-file-pdf",
  code: "bg-file-code/12 text-file-code",
  generic: "bg-muted text-muted-foreground",
};

const HUE_BY_TYPE: Record<string, Hue> = {
  motion: "motion", design: "design", sheet: "spreadsheet", csv: "spreadsheet",
  slides: "slides",
  doc: "document", markdown: "document",
  whiteboard: "whiteboard", mermaid: "whiteboard", svg: "whiteboard",
  data: "data",
  html: "web", react: "web",
  image: "image", video: "image", audio: "image",
  pdf: "generic",
  code: "code",
};

const HUE_BY_EXT: Record<string, Hue> = {
  xls: "spreadsheet", xlsm: "spreadsheet", ods: "spreadsheet", numbers: "spreadsheet",
  pptx: "slides", ppt: "slides", key: "slides", odp: "slides",
  docx: "document", doc: "document", odt: "document", rtf: "document", pages: "document",
};

export function artifactHue(fileName: string, typeId?: string): Hue {
  const type = resolveArtifactType(fileName);
  const byType = HUE_BY_TYPE[typeId ?? type?.id ?? ""];
  // An office file the panel only shows as text still reads as its kind
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return HUE_BY_EXT[ext] ?? byType ?? "generic";
}

/** The tinted background and icon colour of a file's hue, for larger tiles. */
export const artifactHueClass = (fileName: string, typeId?: string): string => CHIP[artifactHue(fileName,typeId)];

interface ArtifactTypeChipProps {
  fileName: string;
  typeId?: string;
  icon: React.ComponentType<{ className?: string }>;
  /** "md" (36px, file card), "tile" (28px, new-artifact buttons) or "sm" (20px, tabs and list rows) */
  size?: "md" | "tile" | "sm";
  className?: string;
}

export const ArtifactTypeChip: React.FC<ArtifactTypeChipProps> = ({ fileName, typeId, icon: Icon, size = "md", className = "" }) => (
  <span
    data-hue={artifactHue(fileName,typeId)}
    className={`grid shrink-0 place-items-center ${size === "md" ? "size-9 rounded-lg" : size === "tile" ? "size-7 rounded-md" : "size-5 rounded-[5px]"} ${CHIP[artifactHue(fileName,typeId)]} ${className}`}
  >
    <Icon className={size === "sm" ? "size-3.5" : "size-4"} />
  </span>
);
