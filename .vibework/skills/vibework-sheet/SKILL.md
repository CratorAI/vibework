---
name: vibework-sheet
description: "Spreadsheets that open in Vibework's Sheet editor: budgets, trackers, financial models, tables of data with totals or other calculations. Create .xlsx files with openpyxl using real formulas, edit existing .xlsx/.csv/.tsv files cell by cell without overwriting the user's own edits, and present the file so it opens in the workspace panel."
---

# Vibework Sheet

The workspace panel opens `.xlsx`, `.csv` and `.tsv` files in a spreadsheet editor. The user can edit there (it autosaves about a second after they stop typing), and you edit the same file on disk. The panel reloads when you write.

Use this skill when the user asks for a spreadsheet, budget, tracker, schedule, price list, or any table of data with calculations, or asks you to change a sheet they have open.

## Which format

- **`.xlsx` (default).** Formulas, number formats, bold/fills/alignment, column widths, frozen header rows, several sheets.
- **`.csv`/`.tsv`** only when the user asks for one or wants a plain data export. These hold values only: no formulas, formatting or extra sheets.

## Create a workbook

Write a Python script in the task's scratch folder (for example `$VIBEWORK_SCRATCH/build_budget.py`; its full path is in your instructions), never in the working folder. Run it from the working folder with the **Python** tool and `packages: ["openpyxl"]` (without a Python tool, run `uv run --with openpyxl python "$VIBEWORK_SCRATCH/build_budget.py"` with your shell tool; quote the path, it has a space). The script saves the workbook into the working folder. Check scripts (`check.py`, `verify.py`) and anything else you make for yourself go in the scratch folder too: the working folder ends with only the workbook.

```python
import datetime as dt
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

wb = Workbook()
ws = wb.active
ws.title = "Expenses"
ws.append(["Item", "Monthly", "Growth", "Start"])
rows = [("Rent", 2400, 0.03, dt.date(2026, 1, 1)), ("Software", 730.25, 0.10, dt.date(2026, 3, 1))]
for r, (item, monthly, growth, start) in enumerate(rows, start=2):
    ws.cell(r, 1, item)
    ws.cell(r, 2, monthly).number_format = '"$"#,##0.00'
    ws.cell(r, 3, growth).number_format = "0.0%"
    ws.cell(r, 4, start).number_format = "yyyy-mm-dd"   # real dates, not text
total = len(rows) + 2
ws.cell(total, 1, "Total").font = Font(bold=True)
ws.cell(total, 2, f"=SUM(B2:B{total - 1})").number_format = '"$"#,##0.00'

for cell in ws[1]:
    cell.font = Font(bold=True)
    cell.fill = PatternFill("solid", start_color="FFDDEBF7")
    cell.alignment = Alignment(horizontal="center")
ws.freeze_panes = "A2"                     # keep the header row visible
ws.column_dimensions["A"].width = 24
ws.column_dimensions["B"].width = 14

summary = wb.create_sheet("Summary")
summary["A1"] = "Annual cost"
summary["B1"] = f"=Expenses!B{total}*12"   # cross-sheet reference; quote names with spaces: ='Q1 Data'!B2
summary["B1"].number_format = '"$"#,##0'

wb.save("budget.xlsx")
```

Rules:

- **Derived numbers are formulas** (`=SUM(...)`, `=B2*12`, `=Expenses!B4`, `=IF(...)`, `=VLOOKUP(...)`, `=ROUND(...)`). Only inputs are typed values. Never compute a total in Python and paste the number.
- Put assumptions (rates, prices) in their own cells and reference them.
- Give numbers a format: currency `'"$"#,##0.00'`, percent `"0.0%"`, dates `"yyyy-mm-dd"` with `datetime.date` values. Put units in headers ("Revenue ($k)").
- Bold header row, `freeze_panes = "A2"`, sensible column widths.
- The editor calculates formulas when it opens the file, so no recalculation step is needed. openpyxl does not calculate: if you need a result to mention in your reply, compute it in Python separately. Do not read results back with `load_workbook(..., data_only=True)` from a file openpyxl wrote; they are `None` until the file is saved by the editor or Excel.
- Stick to what the editor keeps: values, formulas, number formats, fonts, fills, borders, alignment and wrapping, column widths and row heights, merged cells, frozen panes, hidden rows/columns/sheets, hyperlinks, defined names, and basic conditional formatting (`CellIsRule`, `FormulaRule`, colour scales). Charts, images, comments, data validation (drop-down lists), Excel tables (`add_table`), filters, sheet protection and pivot tables make the panel open the workbook **read-only** (the user can still view it and edit a copy without those parts). Add them only when the user asks, and tell them it will open read-only here.

## Edit an existing sheet

The user may be editing the same file. Their edits are saved to disk about a second after they stop typing, so:

1. **Read the file fresh** at the start of the script that changes it, not from an earlier step.
2. **Change only the cells you need.** Load, set those cells, save to the same path, all in one script (kept in the scratch folder):

   ```python
   from openpyxl import load_workbook
   wb = load_workbook("budget.xlsx")          # not data_only=True: that would turn formulas into values
   ws = wb["Expenses"]
   ws["B3"] = 799                              # one input changes; formulas that use it update in the editor
   ws.insert_rows(4)                           # inserting is fine; then fix any SUM ranges that should include the new row
   wb.save("budget.xlsx")
   ```

3. Do not rebuild the workbook from scratch or write it with `pandas.DataFrame.to_excel`: that replaces the user's formatting and edits.
4. To see what is in a sheet first: `load_workbook(path)` gives formulas; `load_workbook(path, data_only=True)` gives the last calculated values (present once the editor or Excel has saved the file).
5. If the panel shows the workbook read-only (it has charts, pivot tables and so on), openpyxl would also drop those parts on save. Use the template workflow in the **vibework-xlsx** skill (`session.py start` → edit the XML → `session.py finish`) instead.

For `.csv`/`.tsv`: for a few cells, use the Edit tool on the text. For bigger changes use Python's `csv` module, and write back with the same delimiter and line endings the file already uses. Values only: a formula in a CSV is just text.

If the user has unsaved edits when you write, the panel asks them whether to keep their version or reload yours, so make one write per change rather than many small ones.

## Show it

When the file is ready, call **PresentFile** with its path so it opens in the panel.
