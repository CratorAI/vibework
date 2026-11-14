import { lazy } from "react";
import { Presentation } from "lucide-react";
import type { ArtifactType } from "../types";

/** Blank deck for "new slides" (kept here so the registry does not load the editor chunk) */
const BLANK = `---
title: Untitled deck
theme: ledger
---

<!-- layout: title -->
# Untitled deck

One line on what this deck argues

---

<!-- layout: bullets -->
# One line that states the point

- **First reason.** One short supporting line
- **Second reason.** One short supporting line
- **Third reason.** One short supporting line
`;

const slides: ArtifactType = {
  id: "slides",
  label: "Slides",
  icon: Presentation,
  matches: (name) => name.endsWith(".slides.md"),
  priority: 10,
  component: lazy(() => import("./SlidesEditor")),
  blank: { extension: ".slides.md", contents: () => BLANK },
};

export default slides;
