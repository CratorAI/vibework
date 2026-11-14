import { describe, expect, it } from "vitest";
import { boardThumb, dashboardThumb, metricSources } from "../gallery/boardThumb";

describe("whiteboard thumbnail", () => {
  it("draws shapes, arrows and text within the scene's bounds", () => {
    const board = boardThumb(JSON.stringify({
      type: "excalidraw",
      elements: [
        { type: "rectangle", x: 0, y: 0, width: 200, height: 80, strokeColor: "#1971c2", backgroundColor: "#e7f5ff" },
        { type: "diamond", x: 300, y: 0, width: 120, height: 120, strokeColor: "#1e1e1e", backgroundColor: "transparent" },
        { type: "arrow", x: 200, y: 40, points: [[0, 0], [100, 20]], endArrowhead: "arrow" },
        { type: "text", x: 10, y: 20, width: 180, height: 20, text: "Customer orders\nsecond line", fontSize: 16, textAlign: "center" },
        { type: "rectangle", x: 9000, y: 9000, width: 10, height: 10, isDeleted: true },
      ],
    }))!;
    expect(board.shapes.map((s) => s.kind)).toEqual(["rect", "diamond", "line", "text"]);
    expect(board.shapes[1]).toMatchObject({ fill: "none" });
    expect(board.shapes[3]).toMatchObject({ text: "Customer orders", anchor: "middle", x: 100 });
    const [x, y, w] = board.viewBox;
    expect(x).toBeLessThan(0);
    expect(y).toBeLessThan(0);
    expect(w).toBeLessThan(1000); // the deleted shape is not in the bounds
  });
  it("is null for anything that is not a board", () => {
    expect(boardThumb("not json")).toBeNull();
    expect(boardThumb(JSON.stringify({ elements: [] }))).toBeNull();
  });
});

describe("dashboard thumbnail", () => {
  it("takes the title, period and first metric tiles", () => {
    const d = dashboardThumb(
      "# Café trading\nperiod: October 2026\n\n## At a glance\n### metric: Revenue\nformat: USD\n| Label | Value | Change |\n|---|---:|---:|\n| Net sales | 28400 | 8.4 |\n\n### metric: Orders\nformat: integer\n| Label | Value |\n|---|---:|\n| Completed | 3550 |\n\n### metric: Margin\n| Label | Value |\n| Gross | budget.xlsx#Sheet1!B4:B4 |\n\n### line: Sales\n| Week | Revenue |\n| W1 | 1 |\n",
    );
    expect(d.title).toBe("Café trading");
    expect(d.period).toBe("October 2026");
    expect(d.metrics).toEqual([
      { label: "Revenue", value: "$28,400.00" },
      { label: "Orders", value: "3,550" },
      { label: "Margin", value: "—" },
    ]);
  });

  it("shows a tile's value read from its sheet", () => {
    const source = "# Q4\n### metric: Q4 totals\nformat: USD\ndata: budget.xlsx#Dashboard!A11:B14\n\n### metric: Margin\nformat: percent\ndata: budget.xlsx#Dashboard!A16:B17\n\n### metric: Gone\ndata: missing.csv\n";
    const sources = metricSources(source);
    expect([...sources.values()].map((s) => [s.path, s.sheet, s.r1, s.c2])).toEqual([["budget.xlsx", "Dashboard", 11, 2], ["budget.xlsx", "Dashboard", 16, 2], ["missing.csv", undefined, 1, 1]]);
    const lines = [...sources.keys()];
    const d = dashboardThumb(source, new Map([
      [lines[0], [["Metric", "Value"], ["Income", "93000"], ["Costs", "65877.5"]]],
      [lines[1], [["Metric", "Value"], ["Margin", "29.16%"]]],
    ]));
    expect(d.metrics).toEqual([
      { label: "Q4 totals", value: "$93,000.00" },
      { label: "Margin", value: "29.16%" },
      { label: "Gone", value: "—" },
    ]);
  });
});
