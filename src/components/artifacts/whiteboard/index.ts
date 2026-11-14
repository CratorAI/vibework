/**
 * Whiteboard artifact: `.excalidraw` files, edited on an Excalidraw canvas.
 * The canvas library (and its fonts) load only when a board is opened.
 */

import React from "react";
import { Shapes } from "lucide-react";
import type { ArtifactType } from "../types";
import { blankBoard } from "./scene";

const whiteboard: ArtifactType = {
  id: "whiteboard",
  label: "Whiteboard",
  icon: Shapes,
  matches: (fileName) => fileName.endsWith(".excalidraw"),
  priority: 10,
  component: React.lazy(() => import("./WhiteboardEditor")),
  blank: { extension: ".excalidraw", contents: blankBoard },
};

export default whiteboard;
