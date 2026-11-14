import { lazy } from "react";
import { Presentation } from "lucide-react";
import type { ArtifactType } from "../types";

/** PowerPoint decks, shown read-only slide by slide */
const pptx: ArtifactType = {
  id: "pptx",
  label: "PowerPoint deck",
  icon: Presentation,
  matches: (name) => name.endsWith(".pptx"),
  priority: 10,
  component: lazy(() => import("./PptxViewer")),
};

export default pptx;
