import { lazy } from "react";
import { FileText } from "lucide-react";
import type { ArtifactType } from "../types";

/** Word documents, shown read-only (mammoth loads with the viewer) */
const docx: ArtifactType = {
  id: "docx",
  label: "Word document",
  icon: FileText,
  matches: (name) => name.endsWith(".docx"),
  priority: 10,
  component: lazy(() => import("./DocxViewer")),
};

export default docx;
