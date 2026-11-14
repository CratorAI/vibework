---
name: vibework-data
description: "Create dashboards, KPI pages, scorecards and reports of numbers as .dashboard.md files in Vibework's Data panel. Use when the user wants to see spreadsheet data as metrics and charts."
---

# Data dashboards

Write a `.dashboard.md` in the working folder. Any helper script or scratch data you make to work out figures goes in the task's scratch folder (`$VIBEWORK_SCRATCH`, path in your instructions), never in the working folder. The app supplies the layout and charts; never write HTML, CSS or JavaScript. For a clear request, choose a sensible period and build without a clarification round. If figures were not supplied, explicitly mark them as placeholders in the subtitle and every Source line, and say so when presenting.

Lead with three or four numbers that matter. One chart answers one question; its title states the conclusion. Use few categories, short labels, explicit units, period and provenance. Avoid decorative charts. Prefer lines for trends, bars for comparisons, horizontal bars for long labels, stacked bars for composition over categories, pie/donut for a few shares of a whole, tables for detail, and status lists for delivery health. Never invent numbers presented as facts.

## Complete example

```markdown
# Café trading
subtitle: Placeholder figures — replace with actual sales
period: October 2026

## At a glance
### metric: Revenue
format: USD
comparison: vs September
good: up
| Label | Value | Change |
|---|---:|---:|
| Net sales | 28400 | 8.4 |
Source: Illustrative placeholders

### metric: Orders
format: integer
| Label | Value |
|---|---:|
| Completed orders | 3550 |
Source: Illustrative placeholders

## Trading
### line: Sales rose through the month
unit: USD
prefix: $
| Week | Revenue |
|---|---:|
| Week 1 | 6200 |
| Week 2 | 6800 |
| Week 3 | 7400 |
| Week 4 | 8000 |
Source: Illustrative placeholders

### note: Next decision
text: Check staffing against the stronger final week before extending opening hours.
Source: Interpretation of illustrative placeholders
```

## Grammar

Plain text, no YAML. One `# Title`, optional `subtitle:` and `period:` lines before any blocks. `## Section` groups blocks. Each block begins `### kind: Title`. Fields are single lines of `key: value`; names are case-insensitive. Table rows start and end with `|`; a Markdown separator row is optional. No embedded pipes or multiline cells. Text is literal, not Markdown or HTML. `Source:` is a human-readable provenance line on any block; always supply it. Block order is page order.

Kinds:
- `metric`: table columns Label, Value, optional Change. Change is signed percentage points as displayed (8.4 means 8.4%, not .084). `comparison:` names the baseline; `good: up` (default) or `down` determines semantic colour. Prefer one row per metric block. `format: number|integer|compact|percent|USD|EUR|GBP|INR` controls numbers; optional `unit:` follows the value. Percent values are already percentages, never fractions.
- `bar`, `hbar`, `stacked`, `line`, `area`, `pie`, `donut`, `sparkline`: first table column is categories, remaining columns numeric series. `unit:`, `prefix:`, `suffix:`, `decimals:` (0–2), `highlight:` (category or series name). All scales include zero, including line charts. At most 24 categories and five series; preferably six categories and one series. Shares need one nonnegative series; keep to five slices. Sparkline is a compact line chart.
- `table`: first row is headers. `formats: text, USD, percent` applies one comma-separated format per column. `emphasis: negative` marks negative numbers.
- `note`: `text:` holds one short plain-text paragraph, editable in place.
- `status`: table columns Item, State; state is exactly `on track`, `at risk`, or `off track`.

## Spreadsheet sources

Replace the inline table with `data: sales.xlsx#Monthly!A1:D13` (or `data: sales.csv`). Paths are relative to the conversation working folder, not the dashboard. Include the header row in the range. Sheet names with spaces may be quoted: `data: sales.xlsx#'Monthly sales'!A1:D13`. XLSX requires an explicit range; CSV reads the whole file. Never combine inline data and a reference. Keep each source under 10,000 cells. For totals and ratios, make formulas in the spreadsheet and point metric blocks to a summary range with Label and Value columns. Use the vibework-sheet skill to create that workbook.

The main app recalculates XLSX formulas with IronCalc and reads formatted cell values; unsupported formulas appear as block errors. Percent cells arrive in displayed percentage units. It watches up to eight unique source files while the dashboard is open; watch failures show a Refresh notice. References cannot escape the working folder. Source files are never fetched by the sandboxed page.

## Check, edit, present

Run `vibework-js <skill>/scripts/check.ts path.dashboard.md --check` with your shell tool from the working folder (`vibework-js` is Vibework's JavaScript runtime, on the PATH; from a developer terminal, `bun` works the same way). Fix all reported errors. The checker validates the grammar, references, source existence and range syntax; the panel additionally checks computed numeric values.

Re-read before every edit. Use Edit on the precise field or table row; preserve the person's other changes. Title and note edits in the panel write back to the same file; Source view handles other edits. Run the checker again, then call `PresentFile` with the absolute `file_path` and `file_name` of the dashboard.

The toolbar exports a single self-contained HTML snapshot next to the dashboard, with current data baked in. Re-export to refresh it; export replaces that dashboard's previous HTML snapshot. PNG export is not provided.
