/**
 * The generic viewers, as ArtifactTypes with priority 0. Dedicated editors
 * (priority 10+) win over these whenever both match a file.
 *
 * Every component is lazy, so a viewer's code (pdf.js, the highlighter…) loads
 * only when a file of that kind is opened.
 */

import { lazy } from "react";
import {
  Atom,
  FileCode,
  FileText,
  Film,
  Globe,
  Image as ImageIcon,
  Music,
  Table,
  Workflow,
  PenTool,
} from "lucide-react";
import type { ArtifactType } from "../types";
import {
  AUDIO_EXTS,
  CSV_EXTS,
  HTML_EXTS,
  IMAGE_EXTS,
  MARKDOWN_EXTS,
  MERMAID_EXTS,
  REACT_EXTS,
  VIDEO_EXTS,
  extOf,
  isTextLike,
} from "./fileKinds";

const HtmlViewer = lazy(() => import("./HtmlViewer"));
const ReactViewer = lazy(() => import("./HarnessViewer").then((m) => ({ default: m.ReactViewer })));
const MermaidViewer = lazy(() => import("./HarnessViewer").then((m) => ({ default: m.MermaidViewer })));
const MarkdownViewer = lazy(() => import("./MarkdownViewer"));
const ImageViewer = lazy(() => import("./ImageViewer"));
const MediaViewer = lazy(() => import("./MediaViewer"));
const PdfViewer = lazy(() => import("./PdfViewer"));
const CsvViewer = lazy(() => import("./CsvViewer"));

/** Read-only source with line numbers; also the "Code" side of the Preview/Code toggle */
export const SourceViewer = lazy(() => import("./SourceViewer"));

const byExt = (exts: Set<string>) => (fileName: string) => exts.has(extOf(fileName));

export const GENERIC_TYPES: ArtifactType[] = [
  { id: "html", label: "Web page", icon: Globe, priority: 0, matches: byExt(HTML_EXTS), component: HtmlViewer },
  { id: "react", label: "React", icon: Atom, priority: 0, matches: byExt(REACT_EXTS), component: ReactViewer },
  { id: "markdown", label: "Markdown", icon: FileText, priority: 0, matches: byExt(MARKDOWN_EXTS), component: MarkdownViewer },
  { id: "svg", label: "SVG", icon: PenTool, priority: 0, matches: (n) => extOf(n) === "svg", component: ImageViewer },
  { id: "mermaid", label: "Diagram", icon: Workflow, priority: 0, matches: byExt(MERMAID_EXTS), component: MermaidViewer },
  { id: "image", label: "Image", icon: ImageIcon, priority: 0, matches: byExt(IMAGE_EXTS), component: ImageViewer },
  { id: "video", label: "Video", icon: Film, priority: 0, matches: byExt(VIDEO_EXTS), component: MediaViewer },
  { id: "audio", label: "Audio", icon: Music, priority: 0, matches: byExt(AUDIO_EXTS), component: MediaViewer },
  { id: "pdf", label: "PDF", icon: FileText, priority: 0, matches: (n) => extOf(n) === "pdf", component: PdfViewer },
  { id: "csv", label: "Table", icon: Table, priority: 0, matches: byExt(CSV_EXTS), component: CsvViewer },
  // Last: any other text or source file, shown as code
  { id: "code", label: "Code", icon: FileCode, priority: 0, matches: isTextLike, component: SourceViewer },
];

/**
 * Generic types whose file is also readable source: the panel offers a
 * Preview/Code toggle for these.
 */
export const SOURCE_VIEW_TYPES = new Set(["html", "react", "markdown", "svg", "mermaid", "csv"]);

/** Generic types the panel can save as one self-contained .html file (see exportHtml.ts) */
export const EXPORT_HTML_TYPES = new Set(["html", "react", "markdown", "svg", "mermaid"]);
