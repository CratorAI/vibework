/**
 * Doc artifact: Markdown files (.md, .markdown) edited as rich-text documents.
 * The editor (ProseMirror + the Markdown round-tripper) loads only when a doc is opened.
 */

import React from "react";
import { FileText } from "lucide-react";
import type { ArtifactType } from "../types";

const doc: ArtifactType = {
  id: "doc",
  label: "Doc",
  icon: FileText,
  // Decks (".slides.md") belong to the Slides type
  matches: (fileName) =>
    (fileName.endsWith(".md") || fileName.endsWith(".markdown")) && !fileName.endsWith(".slides.md") && !fileName.endsWith(".dashboard.md"),
  priority: 10,
  component: React.lazy(() => import("./DocEditor")),
  blank: { extension: ".md", contents: () => "" },
};

export default doc;
