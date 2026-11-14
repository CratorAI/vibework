"""Analyze Excel workbook structure and content.

Extracts sheet info, cell counts, formulas, and content preview.

Usage:
    python analyze.py spreadsheet.xlsx
    python analyze.py spreadsheet.xlsx --json
    python analyze.py spreadsheet.xlsx --check-formulas

CLI Examples:
    # Basic analysis
    python analyze.py workbook.xlsx

    # JSON output
    python analyze.py workbook.xlsx --json > analysis.json

    # Check for formula errors (runs recalc.py)
    python analyze.py workbook.xlsx --check-formulas
"""

import argparse
import json
import subprocess
import sys
import zipfile
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Optional

# Relative imports when loaded as part of the package; plain ones when run directly
if __package__:
    from .core import extractWorkbookInfo, parseXml
else:
    from core import extractWorkbookInfo, parseXml


@dataclass
class SheetAnalysis:
    """Analysis results for a single sheet."""

    name: str
    index: int
    rowCount: int
    columnCount: int
    cellCount: int
    formulaCount: int
    usedRange: str
    textPreview: list[str] = field(default_factory=list)


@dataclass
class WorkbookAnalysis:
    """Analysis results for a workbook."""

    filename: str
    sheetCount: int
    sheetNames: list[str]
    totalCells: int
    totalFormulas: int
    hasFormulas: bool
    hasErrors: bool
    errorSummary: Optional[dict] = None
    sheets: list[SheetAnalysis] = field(default_factory=list)

    def toDict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)


# ---------------------------------------------------------------------------
# Analysis Functions
# ---------------------------------------------------------------------------


def analyzeWorkbook(xlsxPath: str, checkFormulas: bool = False) -> WorkbookAnalysis:
    """Analyze an Excel workbook.

    Args:
        xlsxPath: Path to .xlsx file
        checkFormulas: Whether to run recalc.py to check for errors

    Returns:
        WorkbookAnalysis with sheet info and content
    """
    xlsxPath = Path(xlsxPath)
    if not xlsxPath.exists():
        raise FileNotFoundError(f"File not found: {xlsxPath}")

    # Get basic info
    basicInfo = extractWorkbookInfo(str(xlsxPath))

    sheets = []
    totalCells = 0
    totalFormulas = 0
    hasErrors = False
    errorSummary = None

    with zipfile.ZipFile(xlsxPath, "r") as zf:
        # Load shared strings for text preview
        sharedStrings = []
        if "xl/sharedStrings.xml" in zf.namelist():
            content = zf.read("xl/sharedStrings.xml").decode("utf-8")
            dom = parseXml(content)
            for siElem in dom.getElementsByTagName("si"):
                texts = []
                for tElem in siElem.getElementsByTagName("t"):
                    if tElem.firstChild and tElem.firstChild.nodeValue:
                        texts.append(tElem.firstChild.nodeValue)
                sharedStrings.append("".join(texts))

        # Analyze each worksheet
        for idx, sheetName in enumerate(basicInfo["sheetNames"]):
            sheetFile = f"xl/worksheets/sheet{idx + 1}.xml"
            if sheetFile not in zf.namelist():
                continue

            content = zf.read(sheetFile).decode("utf-8")
            dom = parseXml(content)

            # Count rows
            rows = dom.getElementsByTagName("row")
            rowCount = len(rows)

            # Analyze cells
            cells = dom.getElementsByTagName("c")
            cellCount = len(cells)
            totalCells += cellCount

            # Count formulas
            formulas = dom.getElementsByTagName("f")
            formulaCount = len(formulas)
            totalFormulas += formulaCount

            # Calculate column count and used range
            maxCol = 0
            minRow, maxRow = float("inf"), 0
            minCol = float("inf")

            for cellElem in cells:
                ref = cellElem.getAttribute("r")
                if ref:
                    import re

                    match = re.match(r"^([A-Z]+)(\d+)$", ref)
                    if match:
                        col = match.group(1)
                        row = int(match.group(2))
                        # Convert column to index
                        colIdx = 0
                        for char in col:
                            colIdx = colIdx * 26 + (ord(char) - ord("A") + 1)
                        maxCol = max(maxCol, colIdx)
                        minCol = min(minCol, colIdx)
                        maxRow = max(maxRow, row)
                        minRow = min(minRow, row)

            columnCount = maxCol

            # Calculate used range
            if cells:

                def idxToCol(idx):
                    result = ""
                    while idx > 0:
                        idx, remainder = divmod(idx - 1, 26)
                        result = chr(ord("A") + remainder) + result
                    return result

                usedRange = f"{idxToCol(int(minCol))}{int(minRow)}:{idxToCol(maxCol)}{int(maxRow)}"
            else:
                usedRange = "A1:A1"

            # Get text preview (first 10 non-empty values)
            textPreview = []
            for cellElem in cells[:50]:  # Check first 50 cells
                if len(textPreview) >= 10:
                    break

                cellType = (
                    cellElem.getAttribute("t") if cellElem.hasAttribute("t") else None
                )

                for vElem in cellElem.getElementsByTagName("v"):
                    if vElem.firstChild and vElem.firstChild.nodeValue:
                        rawValue = vElem.firstChild.nodeValue
                        if cellType == "s":
                            try:
                                strIdx = int(rawValue)
                                if 0 <= strIdx < len(sharedStrings):
                                    value = sharedStrings[strIdx]
                                    if value.strip():
                                        textPreview.append(value[:50])
                            except (ValueError, IndexError):
                                pass
                        elif rawValue.strip():
                            textPreview.append(rawValue[:50])

            sheets.append(
                SheetAnalysis(
                    name=sheetName,
                    index=idx,
                    rowCount=rowCount,
                    columnCount=columnCount,
                    cellCount=cellCount,
                    formulaCount=formulaCount,
                    usedRange=usedRange,
                    textPreview=textPreview,
                )
            )

    # Check for formula errors if requested
    if checkFormulas and totalFormulas > 0:
        errorSummary = _checkFormulaErrors(str(xlsxPath))
        if errorSummary and errorSummary.get("total_errors", 0) > 0:
            hasErrors = True

    return WorkbookAnalysis(
        filename=xlsxPath.name,
        sheetCount=len(sheets),
        sheetNames=basicInfo["sheetNames"],
        totalCells=totalCells,
        totalFormulas=totalFormulas,
        hasFormulas=totalFormulas > 0,
        hasErrors=hasErrors,
        errorSummary=errorSummary,
        sheets=sheets,
    )


def _checkFormulaErrors(xlsxPath: str) -> Optional[dict]:
    """Run recalc.py to check for formula errors.

    Args:
        xlsxPath: Path to .xlsx file

    Returns:
        Error summary dict or None if recalc failed
    """
    try:
        # Find recalc.py relative to this script
        scriptDir = Path(__file__).parent
        recalcScript = scriptDir / "recalc.py"

        if not recalcScript.exists():
            return None

        result = subprocess.run(
            [sys.executable, str(recalcScript), xlsxPath],
            capture_output=True,
            text=True,
            timeout=60,
        )

        if result.returncode == 0:
            try:
                return json.loads(result.stdout)
            except json.JSONDecodeError:
                return None
        return None

    except (subprocess.TimeoutExpired, FileNotFoundError):
        return None


# ---------------------------------------------------------------------------
# Output Formatting
# ---------------------------------------------------------------------------


def formatAnalysis(analysis: WorkbookAnalysis, verbose: bool = False) -> str:
    """Format analysis for display.

    Args:
        analysis: WorkbookAnalysis object
        verbose: If True, show full content preview

    Returns:
        Formatted string
    """
    lines = [
        f"Workbook: {analysis.filename}",
        f"Sheets: {analysis.sheetCount}",
        f"Total Cells: {analysis.totalCells}",
        f"Total Formulas: {analysis.totalFormulas}",
        "",
    ]

    if analysis.hasErrors and analysis.errorSummary:
        lines.append("Formula Errors: YES")
        summary = analysis.errorSummary.get("error_summary", {})
        for errType, info in summary.items():
            count = info.get("count", 0)
            locations = info.get("locations", [])[:5]
            lines.append(f"  {errType}: {count}")
            for loc in locations:
                lines.append(f"    - {loc}")
        lines.append("")
    elif analysis.hasFormulas:
        lines.append("Formula Errors: None detected")
        lines.append("")

    lines.append("Sheets:")
    lines.append("-" * 60)

    for sheet in analysis.sheets:
        lines.append(f"  {sheet.index + 1}. {sheet.name}")
        lines.append(f"     Rows: {sheet.rowCount}, Columns: {sheet.columnCount}")
        lines.append(f"     Cells: {sheet.cellCount}, Formulas: {sheet.formulaCount}")
        lines.append(f"     Used Range: {sheet.usedRange}")

        if sheet.textPreview:
            lines.append("     Preview:")
            for text in sheet.textPreview[: 5 if not verbose else 10]:
                preview = text[:60] + "..." if len(text) > 60 else text
                lines.append(f"       - {preview}")

        lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Analyze Excel workbook structure and content"
    )
    parser.add_argument("input", help="Input .xlsx file")
    parser.add_argument("--json", "-j", action="store_true", help="Output as JSON")
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Show more content preview"
    )
    parser.add_argument(
        "--check-formulas",
        "-c",
        action="store_true",
        help="Run recalc.py to check for formula errors",
    )

    args = parser.parse_args()

    try:
        analysis = analyzeWorkbook(args.input, checkFormulas=args.check_formulas)

        if args.json:
            print(json.dumps(analysis.toDict(), indent=2))
        else:
            print(formatAnalysis(analysis, verbose=args.verbose))

    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
