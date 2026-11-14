"""Generate the .xlsx fixtures used by the sheet round-trip tests.

Run from the repo root with the bundled uv:
    .vibework/scripts/uv run --no-project --with openpyxl python \
        src/components/artifacts/sheet/__tests__/fixtures/make_fixtures.py

The files are committed, so this only needs re-running when the corpus changes.
"""

import datetime as dt
import os
import re
import shutil
import tempfile
import zipfile

from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.comments import Comment
from openpyxl.formatting.rule import CellIsRule
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

HERE = os.path.dirname(os.path.abspath(__file__))


def budget():
    """Two sheets, cross-sheet formulas, formats, widths, merge, frozen row."""
    wb = Workbook()
    inputs = wb.active
    inputs.title = "Inputs"
    inputs["A1"] = "Item"
    inputs["B1"] = "Monthly"
    inputs["C1"] = "Growth"
    inputs["D1"] = "Start"
    rows = [
        ("Rent", 2400, 0.03, dt.date(2026, 1, 1)),
        ("Salaries", 18500.5, 0.05, dt.date(2026, 2, 15)),
        ("Software", 730.25, 0.1, dt.date(2026, 3, 31)),
    ]
    for i, (name, monthly, growth, start) in enumerate(rows, start=2):
        inputs.cell(i, 1, name)
        inputs.cell(i, 2, monthly).number_format = '"$"#,##0.00'
        inputs.cell(i, 3, growth).number_format = "0.0%"
        inputs.cell(i, 4, start).number_format = "yyyy-mm-dd"
    for c in "ABCD":
        inputs[f"{c}1"].font = Font(bold=True)
        inputs[f"{c}1"].fill = PatternFill("solid", start_color="FFDDEBF7")
        inputs[f"{c}1"].alignment = Alignment(horizontal="center")
    inputs.column_dimensions["A"].width = 22
    inputs.column_dimensions["B"].width = 14
    inputs.column_dimensions["D"].width = 13
    inputs.freeze_panes = "A2"

    summary = wb.create_sheet("Q1 Summary")
    summary["A1"] = "Annual budget"
    summary.merge_cells("A1:C1")
    summary["A1"].font = Font(bold=True, size=14)
    summary["A1"].alignment = Alignment(horizontal="center")
    summary["A2"] = "Item"
    summary["B2"] = "Annual"
    summary["C2"] = "Next year"
    for i in range(3):
        r = i + 3
        summary.cell(r, 1, f"=Inputs!A{i + 2}")
        summary.cell(r, 2, f"=Inputs!B{i + 2}*12").number_format = '"$"#,##0'
        summary.cell(r, 3, f"=ROUND(B{r}*(1+Inputs!C{i + 2}),0)").number_format = '"$"#,##0'
    summary["A6"] = "Total"
    summary["A6"].font = Font(bold=True)
    summary["B6"] = "=SUM(B3:B5)"
    summary["B6"].number_format = '"$"#,##0'
    summary["C6"] = "=SUM(C3:C5)"
    summary["C6"].number_format = '"$"#,##0'
    summary["A7"] = "Share of rent"
    summary["B7"] = "=B3/B6"
    summary["B7"].number_format = "0.00%"
    summary["A8"] = "Earliest start"
    summary["B8"] = "=MIN(Inputs!D2:D4)"
    summary["B8"].number_format = "d mmm yyyy"
    summary.column_dimensions["A"].width = 18
    summary.column_dimensions["B"].width = 12.5
    summary.column_dimensions["C"].width = 12.5
    wb.save(os.path.join(HERE, "budget.xlsx"))


def functions():
    """Lookups, text, date, logical and aggregate functions."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Data"
    ws.append(["Code", "Name", "Price", "Qty", "Date"])
    data = [
        ("A-1", "Apples", 1.2, 10, dt.date(2026, 5, 1)),
        ("B-2", "Bananas", 0.5, 25, dt.date(2026, 5, 2)),
        ("C-3", "Cherries", 4.75, 3, dt.date(2026, 5, 3)),
        ("D-4", "Dates", 3.1, 0, dt.date(2026, 5, 4)),
    ]
    for row in data:
        ws.append(list(row))
    for r in range(2, 6):
        ws.cell(r, 5).number_format = "yyyy-mm-dd"
    calc = wb.create_sheet("Calc")
    formulas = {
        "A1": "=VLOOKUP(\"C-3\",Data!A2:C5,3,FALSE)",
        "A2": "=INDEX(Data!B2:B5,MATCH(\"B-2\",Data!A2:A5,0))",
        "A3": "=IF(Data!D5=0,\"out of stock\",\"ok\")",
        "A4": "=ROUND(AVERAGE(Data!C2:C5),2)",
        "A5": "=MAX(Data!D2:D5)-MIN(Data!D2:D5)",
        "A6": "=COUNT(Data!C2:C5)",
        "A7": "=SUMPRODUCT(Data!C2:C5,Data!D2:D5)",
        "A8": "=UPPER(LEFT(Data!B2,3))&\"-\"&LEN(Data!B3)",
        "A9": "=TEXT(Data!E2,\"yyyy-mm-dd\")",
        "A10": "=DATE(2026,12,31)-Data!E2",
        "A11": "=YEAR(Data!E3)",
        "A12": "=CONCATENATE(Data!B2,\" & \",Data!B3)",
        "A13": "=IFERROR(1/Data!D5,\"n/a\")",
        "A14": "=SUMIF(Data!D2:D5,\">5\",Data!C2:C5)",
        "A15": "=COUNTIF(Data!B2:B5,\"*an*\")",
        "A16": "=TRIM(\"  spaced  \")",
    }
    for ref, f in formulas.items():
        calc[ref] = f
    calc["A10"].number_format = "0"
    wb.save(os.path.join(HERE, "functions.xlsx"))


def chart():
    """A workbook with a chart: the editor must open it read-only."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Sales"
    ws.append(["Month", "Sales"])
    for m, v in [("Jan", 10), ("Feb", 14), ("Mar", 9)]:
        ws.append([m, v])
    ch = BarChart()
    ch.add_data(Reference(ws, min_col=2, min_row=1, max_row=4), titles_from_data=True)
    ch.set_categories(Reference(ws, min_col=1, min_row=2, max_row=4))
    ws.add_chart(ch, "D2")
    wb.save(os.path.join(HERE, "chart.xlsx"))


def extras():
    """Data validation, a comment and conditional formatting."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Tracker"
    ws.append(["Task", "Status", "Score"])
    ws.append(["Write spec", "Done", 80])
    ws.append(["Build", "Doing", 45])
    dv = DataValidation(type="list", formula1='"Todo,Doing,Done"', allow_blank=True)
    ws.add_data_validation(dv)
    dv.add("B2:B10")
    ws["A2"].comment = Comment("Owner: Sam", "Sam")
    ws.conditional_formatting.add(
        "C2:C10", CellIsRule(operator="lessThan", formula=["50"], fill=PatternFill("solid", start_color="FFFFC7CE"))
    )
    wb.save(os.path.join(HERE, "extras.xlsx"))


def styled():
    """Things the editor models and must keep: CF, links, names, hidden sheet, borders, fonts."""
    from openpyxl.styles import Border, Side
    from openpyxl.workbook.defined_name import DefinedName

    wb = Workbook()
    ws = wb.active
    ws.title = "Styled"
    ws["A1"] = "Italic red"
    ws["A1"].font = Font(italic=True, color="FFC00000", underline="single", name="Arial", size=12)
    ws["B1"] = "Boxed"
    thin = Side(style="thin", color="FF000000")
    ws["B1"].border = Border(left=thin, right=thin, top=thin, bottom=thin)
    ws["C1"] = "Wrapped text that is long"
    ws["C1"].alignment = Alignment(wrap_text=True, vertical="top", horizontal="right")
    ws["A2"] = "Docs"
    ws["A2"].hyperlink = "https://example.com/docs"
    for i in range(3, 8):
        ws.cell(i, 1, i * 7)
    ws.conditional_formatting.add(
        "A3:A7", CellIsRule(operator="greaterThan", formula=["30"], fill=PatternFill("solid", start_color="FFC6EFCE"))
    )
    ws.row_dimensions[1].height = 30
    ws.column_dimensions["D"].hidden = True
    ws["D1"] = "hidden column"
    ws.sheet_properties.tabColor = "FF00B050"
    wb.defined_names["Rate"] = DefinedName("Rate", attr_text="Styled!$A$3")
    ws["B3"] = "=Rate*2"
    hidden = wb.create_sheet("Lists")
    hidden["A1"] = "secret"
    hidden.sheet_state = "hidden"
    wb.save(os.path.join(HERE, "styled.xlsx"))


def shared_formulas():
    """Rewrite a simple sheet so that column C uses Excel-style shared formulas."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Shared"
    ws.append(["a", "b", "sum"])
    for i in range(2, 7):
        ws.cell(i, 1, i)
        ws.cell(i, 2, i * 10)
        ws.cell(i, 3, f"=A{i}+B{i}")
    tmp = tempfile.mkdtemp()
    plain = os.path.join(tmp, "plain.xlsx")
    wb.save(plain)
    out = os.path.join(HERE, "shared.xlsx")
    with zipfile.ZipFile(plain) as zin, zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == "xl/worksheets/sheet1.xml":
                xml = data.decode("utf-8")

                def repl(m):
                    row = int(m.group(1))
                    if row == 2:
                        return f'<c r="C2"><f t="shared" ref="C2:C6" si="0">A2+B2</f><v>{2 + 20}</v></c>'
                    return f'<c r="C{row}"><f t="shared" si="0"/><v>{row + row * 10}</v></c>'

                xml = re.sub(r'<c r="C(\d+)"><f>[^<]*</f><v>[^<]*</v></c>', repl, xml)
                xml = re.sub(r'<c r="C(\d+)"><f>[^<]*</f><v\s*/></c>', repl, xml)
                xml = re.sub(r'<c r="C(\d+)"><f>[^<]*</f></c>', repl, xml)
                data = xml.encode("utf-8")
            zout.writestr(item, data)
    shutil.rmtree(tmp)


if __name__ == "__main__":
    budget()
    functions()
    chart()
    extras()
    styled()
    shared_formulas()
    print("fixtures written to", HERE)
