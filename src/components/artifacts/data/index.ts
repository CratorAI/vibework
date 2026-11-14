import React from "react";
import { BarChart } from "@/lib/icons";
import type { ArtifactType } from "../types";
const data: ArtifactType = {
  id: "data",
  label: "Data",
  icon: BarChart,
  priority: 20,
  matches: (n) => n.endsWith(".dashboard.md"),
  component: React.lazy(() => import("./DataViewer")),
  blank: {
    extension: ".dashboard.md",
    contents: () =>
      "# Dashboard\nperiod: Add a reporting period\n\n### note: Start here\ntext: Add your metrics and their sources.\n",
  },
};
export default data;
