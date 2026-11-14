"""Quick find/replace text operations for Excel workbooks.

Performs text replacement in cell values without manual XML editing.

Usage:
    python quickEdit.py spreadsheet.xlsx "old text" "new text" output.xlsx
    python quickEdit.py spreadsheet.xlsx --replacements replacements.json output.xlsx

CLI Examples:
    # Simple replacement
    python quickEdit.py input.xlsx "PLACEHOLDER" "Actual Value" output.xlsx

    # Multiple replacements from JSON file
    python quickEdit.py input.xlsx --replacements changes.json output.xlsx

    # Specific sheets only
    python quickEdit.py input.xlsx "OLD" "NEW" output.xlsx --sheets "Sheet1,Sheet2"

    # Dry run (preview without saving)
    python quickEdit.py input.xlsx "OLD" "NEW" output.xlsx --dry-run
"""

import argparse
import json
import sys
import tempfile
from pathlib import Path
from typing import Optional

# Relative imports when loaded as part of the package; plain ones when run directly
if __package__:
    from .core import Workbook, cleanWorkspace, packWorkbook, unpackWorkbook
else:
    from core import Workbook, cleanWorkspace, packWorkbook, unpackWorkbook


# ---------------------------------------------------------------------------
# Edit Functions
# ---------------------------------------------------------------------------


def quickEdit(
    inputPath: str,
    outputPath: str,
    replacements: dict[str, str],
    sheetNames: Optional[list[str]] = None,
    dryRun: bool = False,
) -> dict:
    """Perform text replacements in an Excel workbook.

    Args:
        inputPath: Path to input .xlsx file
        outputPath: Path for output .xlsx file
        replacements: Dict mapping old text -> new text
        sheetNames: List of sheet names to edit (None = all sheets)
        dryRun: If True, preview changes without saving

    Returns:
        Dict with replacement statistics

    Raises:
        FileNotFoundError: If input file not found
        RuntimeError: If packing fails
    """
    inputPath = Path(inputPath).resolve()
    outputPath = Path(outputPath).resolve()

    if not inputPath.exists():
        raise FileNotFoundError(f"Input file not found: {inputPath}")

    results = {
        "inputFile": str(inputPath),
        "outputFile": str(outputPath) if not dryRun else None,
        "dryRun": dryRun,
        "replacements": [],
        "totalReplacements": 0,
        "sheetsModified": 0,
    }

    with tempfile.TemporaryDirectory() as tempDir:
        workspaceDir = Path(tempDir) / "workspace"

        # Unpack workbook
        success, message = unpackWorkbook(str(inputPath), str(workspaceDir))
        if not success:
            raise RuntimeError(f"Failed to unpack: {message}")

        # Create Workbook instance
        wb = Workbook(str(workspaceDir))

        # Filter sheets if specified
        sheetsToEdit = wb.sheets
        if sheetNames:
            sheetsToEdit = [s for s in wb.sheets if s.name in sheetNames]

        # Perform replacements
        modifiedSheets = set()

        for oldText, newText in replacements.items():
            replacementInfo = {
                "oldText": oldText,
                "newText": newText,
                "occurrences": [],
            }

            # Check shared strings first
            sharedStringMatches = 0
            for ss in wb.sharedStrings:
                if oldText in ss:
                    sharedStringMatches += ss.count(oldText)

            if sharedStringMatches > 0:
                replacementInfo["occurrences"].append(
                    {
                        "location": "sharedStrings",
                        "count": sharedStringMatches,
                    }
                )
                results["totalReplacements"] += sharedStringMatches

            # Check each sheet for inline strings
            for sheet in sheetsToEdit:
                matches = sheet.findText(oldText)
                if matches:
                    count = sum(1 for _, val in matches if oldText in str(val))
                    if count > 0:
                        replacementInfo["occurrences"].append(
                            {
                                "sheet": sheet.name,
                                "cells": [ref for ref, _ in matches[:10]],
                                "count": count,
                            }
                        )
                        modifiedSheets.add(sheet.name)

            if replacementInfo["occurrences"]:
                results["replacements"].append(replacementInfo)

        # Actually perform replacements if not dry run
        if not dryRun and results["totalReplacements"] > 0:
            for oldText, newText in replacements.items():
                wb.replaceText(oldText, newText)

            # Save changes
            wb.saveAll()

        results["sheetsModified"] = len(modifiedSheets)

        # Save output if not dry run
        if not dryRun:
            if results["totalReplacements"] > 0:
                # Clean and pack
                cleanWorkspace(str(workspaceDir))

                success, message = packWorkbook(
                    str(workspaceDir),
                    str(outputPath),
                    originalFile=str(inputPath),
                    validate=True,
                )

                if not success:
                    raise RuntimeError(f"Failed to pack: {message}")

                results["outputFile"] = str(outputPath)
            else:
                # No changes - copy input to output
                import shutil

                shutil.copy2(inputPath, outputPath)
                results["outputFile"] = str(outputPath)

    return results


# ---------------------------------------------------------------------------
# Output Formatting
# ---------------------------------------------------------------------------


def formatResults(results: dict, verbose: bool = False) -> str:
    """Format replacement results for display."""
    lines = []

    if results["dryRun"]:
        lines.append("DRY RUN - No changes saved")
        lines.append("")

    lines.append(f"Input: {results['inputFile']}")
    if results["outputFile"]:
        lines.append(f"Output: {results['outputFile']}")

    lines.append("")
    lines.append(
        f"Total replacements: {results['totalReplacements']} "
        f"in {results['sheetsModified']} sheet(s)"
    )

    if verbose and results["replacements"]:
        lines.append("")
        lines.append("Details:")
        lines.append("-" * 50)

        for rep in results["replacements"]:
            lines.append(f'  "{rep["oldText"]}" -> "{rep["newText"]}"')
            for occ in rep["occurrences"]:
                if occ.get("location") == "sharedStrings":
                    lines.append(f"    Shared strings: {occ['count']} occurrence(s)")
                else:
                    cells = occ.get("cells", [])
                    cellStr = ", ".join(cells[:5])
                    if len(cells) > 5:
                        cellStr += f", ... (+{len(cells) - 5} more)"
                    lines.append(
                        f"    Sheet '{occ['sheet']}': {occ['count']} occurrence(s)"
                    )
                    if cells:
                        lines.append(f"      Cells: {cellStr}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Quick find/replace text in Excel workbooks"
    )
    parser.add_argument("input", help="Input .xlsx file")
    parser.add_argument(
        "old_text",
        nargs="?",
        help="Text to find (not needed if using --replacements)",
    )
    parser.add_argument(
        "new_text",
        nargs="?",
        help="Replacement text (not needed if using --replacements)",
    )
    parser.add_argument("output", help="Output .xlsx file")
    parser.add_argument(
        "--replacements",
        "-r",
        metavar="FILE",
        help="JSON file with replacements {old: new, ...}",
    )
    parser.add_argument(
        "--sheets",
        "-s",
        metavar="NAMES",
        help="Comma-separated list of sheet names to edit",
    )
    parser.add_argument(
        "--dry-run",
        "-n",
        action="store_true",
        help="Preview changes without saving",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Show detailed output",
    )
    parser.add_argument(
        "--json",
        "-j",
        action="store_true",
        help="Output results as JSON",
    )

    args = parser.parse_args()

    # Build replacements dict
    replacements = {}

    if args.replacements:
        # Load from JSON file
        try:
            with open(args.replacements) as f:
                replacements = json.load(f)
        except (json.JSONDecodeError, FileNotFoundError) as e:
            print(f"Error loading replacements: {e}", file=sys.stderr)
            sys.exit(1)
    elif args.old_text and args.new_text:
        # Single replacement from command line
        replacements[args.old_text] = args.new_text
    else:
        print(
            "Error: Provide old_text and new_text, or use --replacements",
            file=sys.stderr,
        )
        sys.exit(1)

    # Parse sheet names
    sheetNames = None
    if args.sheets:
        sheetNames = [s.strip() for s in args.sheets.split(",")]

    try:
        results = quickEdit(
            args.input,
            args.output,
            replacements,
            sheetNames=sheetNames,
            dryRun=args.dry_run,
        )

        if args.json:
            print(json.dumps(results, indent=2))
        else:
            print(formatResults(results, verbose=args.verbose))

    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
