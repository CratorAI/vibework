import { lazy } from "react";
import { Table } from "@/lib/icons";
import type { ArtifactType } from "../types";

const xls: ArtifactType = {
  id: "xls",
  label: "Excel workbook (legacy)",
  icon: Table,
  matches: (name) => name.endsWith(".xls"),
  priority: 10,
  component: lazy(() => import("./XlsViewer")),
};

export default xls;
