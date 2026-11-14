import { describe, it, expect } from "vitest";
import { parse, reference, format, number, editLine, editNote } from "../core";
import { resolve } from "../sources";
import { page } from "../page";
const source =
  "# Café\r\nperiod: November 2026\r\n## Overview\r\n### note: Context\r\ntext: Placeholder figures\r\nSource: Example\r\n";
describe("dashboard", () => {
  it("parses headings and preserves unrelated bytes on edit", () => {
    const d = parse(source);
    expect(d.errors).toEqual([]);
    expect(d.blocks[0].section).toBe("Overview");
    expect(editNote(source, d.blocks[0], "Revised")).toBe(
      source.replace("Placeholder figures", "Revised"),
    );
    expect(editLine(source, 0, "# New")).toBe(
      source.replace("# Café", "# New"),
    );
  });
  it("rejects malformed blocks", () => {
    expect(parse("# X\n### wat: X\n").errors.length).toBeGreaterThan(0);
    expect(
      parse("# X\n### bar: X\n| a | b |\n| x |").errors.length,
    ).toBeGreaterThan(0);
  });
  it("bounds and validates references", () => {
    expect(reference("sales.xlsx#'Monthly sales'!A1:D13")).toMatchObject({
      sheet: "Monthly sales",
      c2: 4,
      r2: 13,
    });
    for (const s of [
      "../x.csv",
      "/x.csv",
      "x.xlsx",
      "x.xlsx#S!D2:A1",
      "x.xlsx#S!A0:B3",
      "x.xlsx#S!A1:XFD100",
    ])
      expect(() => reference(s)).toThrow();
  });
  it("formats explicit units without guessing percentage ratios", () => {
    expect(format(1234, "USD")).toBe("$1,234.00");
    expect(format(12.5, "percent")).toBe("12.5%");
    expect(format(1200000, "compact")).toBe("1.2M");
    expect(number("(1,200)")).toBe(-1200);
    expect(number("hello")).toBeNull();
  });
  it("resolves CSV and isolates missing sources", async () => {
    const d = parse(
      "# X\n### bar: Sales\ndata: sales.csv\n### table: Missing\ndata: absent.csv",
    );
    const r = await resolve(d, async (p) => {
      if (p === "absent.csv") throw Error("Missing source file");
      return { text: "Month,Revenue\nJan,200", base64: null };
    });
    expect(r.blocks[0].rows[1]).toEqual(["Jan", "200"]);
    expect(r.blocks[1].error).toBe("Missing source file");
  });
  it("escapes content and reports nonnumeric charts", () => {
    const html = page(
      parse(
        "# <script>alert(1)</script>\n### bar: Test\n| Month | Sales |\n| Jan | nope |",
      ),
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("numeric");
    expect(html).not.toContain("<script>alert");
  });
});
