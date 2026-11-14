/**
 * Sheet artifact: .xlsx workbooks and .csv/.tsv tables in a spreadsheet editor
 * (IronCalc engine + grid). The editor and its ~3 MB engine load only when a
 * sheet is opened.
 */

import { lazy } from "react";
import { Sheet } from "lucide-react";
import type { ArtifactType } from "../types";

const sheet: ArtifactType = {
  id: "sheet",
  label: "Sheet",
  icon: Sheet,
  matches: (name) => name.endsWith(".xlsx") || name.endsWith(".csv") || name.endsWith(".tsv"),
  priority: 10,
  component: lazy(() => import("./SheetEditor")),
  // A zero-byte .xlsx opens as an empty workbook and is written as a real one straight away.
  blank: { extension: ".xlsx", contents: () => "" },
};

export default sheet;
