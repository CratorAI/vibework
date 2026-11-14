import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownSegment, splitMarkdownSegments, stabilizeStreamingTail } from "../StreamingMarkdown";
import { isNumericCell, numericColumns, proseColumns } from "../markdownTables";

const TABLE = [
  "Here is the budget:",
  "| Item | Owner | Cost | Share |",
  "|------|-------|-----:|:-----:|",
  "| Venue | Ana | $1,200 | 40% |",
  "| Food | Ben | 950.50 | 32% |",
  "| Misc | — | (120) | n/a |",
].join("\n");

/** What a streaming frame shows: the growing tail stabilised, rendered. */
function frame(text: string): string {
  const parts = splitMarkdownSegments(text);
  const last = stabilizeStreamingTail(parts[parts.length - 1] ?? "");
  parts[parts.length - 1] = last;
  return parts.map((p) => renderToStaticMarkup(<MarkdownSegment text={p} />)).join("");
}

const rowCount = (html: string) => (html.match(/<tr>/g) ?? []).length;
const visibleText = (html: string) => html.replace(/<[^>]+>/g, "");

describe("tables while streaming", () => {
  it("never shows raw pipes and only ever adds whole rows", () => {
    let rows = 0;
    let shownTable = false;
    for (let i = 1; i <= TABLE.length; i++) {
      const html = frame(TABLE.slice(0, i));
      expect(visibleText(html)).not.toContain("|");
      const now = rowCount(html);
      expect(now).toBeGreaterThanOrEqual(rows);
      if (shownTable) expect(html).toContain("<table>");
      if (html.includes("<table>")) {
        shownTable = true;
        // Every rendered body row is complete: four cells, none cut short.
        const bodyRows = html.split("<tbody>")[1]?.split("<tr>").slice(1) ?? [];
        for (const row of bodyRows) expect((row.match(/<td/g) ?? []).length).toBe(4);
      }
      rows = now;
    }
    // The last row is shown once it is closed.
    expect(rowCount(frame(TABLE + " |"))).toBe(4);
  });

  it("renders the settled table in full with alignment", () => {
    const html = renderToStaticMarkup(<MarkdownSegment text={TABLE + "\n| Total | | 3,000 | 100% |"} />);
    expect(rowCount(html)).toBe(5);
    expect(html).toContain('class="md-table"');
    // Cost: numeric, and the Markdown also says right. Share: written centred, kept.
    expect(html).toMatch(/<th class="md-num" style="text-align:right">Cost<\/th>/);
    expect(html).toMatch(/<th class="md-num" style="text-align:center">Share<\/th>/);
    // Owner is text: no alignment added.
    expect(html).toContain('<th class="md-short">Owner</th>');
  });
});

describe("short and prose columns", () => {
  it("keeps short cells on one line and wraps only long prose", () => {
    expect([...proseColumns([["Ana", "+44 20 7946 0958", "Prefers a call in the morning before the shop opens, never after 4pm."]])]).toEqual([2]);
    const html = renderToStaticMarkup(
      <MarkdownSegment text={"| Name | Since | Notes |\n|---|---|---|\n| Ana | 12 November 2026 | Prefers a call in the morning before the shop opens, never after 4pm. |\n"} />,
    );
    expect(html).toContain('<td class="md-short">12 November 2026</td>');
    expect(html).toMatch(/<td class="md-prose"><div class="md-cell">Prefers a call/);
  });
});

describe("numeric columns", () => {
  it("recognises common number shapes", () => {
    for (const n of ["1", "1,234", "-3.5", "(120)", "$4.2M", "12%", "3x", "€ 1 200", "−7"]) expect(isNumericCell(n), n).toBe(true);
    for (const t of ["Q3", "v1.2.3", "2 apples", "Ana", "1-2 days"]) expect(isNumericCell(t), t).toBe(false);
  });
  it("needs every filled body cell to be a number", () => {
    expect([...numericColumns([["a", "1", "x"], ["b", "—", "2"], ["c", "3", "y"]])]).toEqual([1]);
  });
  it("leaves a text column that has a number in it alone", () => {
    const html = renderToStaticMarkup(<MarkdownSegment text={"| A | B |\n|---|---|\n| x | 1 |\n| 2 | 3 |"} />);
    expect(html).toContain('<th class="md-short">A</th>');
    expect(html).toContain('<th class="md-num" style="text-align:right">B</th>');
  });
});

describe("other GFM", () => {
  it("renders task lists, strikethrough and autolinks", () => {
    const html = renderToStaticMarkup(<MarkdownSegment text={"- [x] done\n- [ ] todo\n\n~~gone~~ see www.example.com or https://x.org"} />);
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("<del>gone</del>");
    expect(html).toContain('href="http://www.example.com"');
    expect(html).toContain('href="https://x.org"');
  });
});
