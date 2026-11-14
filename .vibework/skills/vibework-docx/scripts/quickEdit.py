"""Quick find/replace text operations for Word documents.

Performs text replacement without manual XML editing.

Usage:
    python quickEdit.py document.docx "old text" "new text" output.docx
    python quickEdit.py document.docx --replacements replacements.json output.docx

CLI Examples:
    # Simple replacement
    python quickEdit.py input.docx "PLACEHOLDER" "Actual Value" output.docx

    # Multiple replacements from JSON file
    python quickEdit.py input.docx --replacements changes.json output.docx

    # Dry run (preview without saving)
    python quickEdit.py input.docx "OLD" "NEW" output.docx --dry-run
"""

import argparse
import json
import sys
import tempfile
from pathlib import Path
from typing import Optional

# Relative imports when loaded as part of the package; plain ones when run directly
if __package__:
    from .core import Document, unpackDocument, packDocument, cleanWorkspace
else:
    from core import Document, unpackDocument, packDocument, cleanWorkspace


# ---------------------------------------------------------------------------
# Edit Functions
# ---------------------------------------------------------------------------


def quickEdit(
    inputPath: str,
    outputPath: str,
    replacements: dict[str, str],
    dryRun: bool = False,
) -> dict:
    """Perform text replacements in a Word document.

    Args:
        inputPath: Path to input .docx file
        outputPath: Path for output .docx file
        replacements: Dict mapping old text -> new text
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
        "paragraphsModified": 0,
    }

    with tempfile.TemporaryDirectory() as tempDir:
        workspaceDir = Path(tempDir) / "workspace"

        # Unpack document
        success, message = unpackDocument(str(inputPath), str(workspaceDir))
        if not success:
            raise RuntimeError(f"Failed to unpack: {message}")

        # Create Document instance
        doc = Document(str(workspaceDir))

        # Perform replacements
        modifiedParagraphs = set()
        for oldText, newText in replacements.items():
            replacementInfo = {
                "oldText": oldText,
                "newText": newText,
                "occurrences": [],
            }

            for para in doc.paragraphs:
                # Check if text exists in paragraph
                if oldText in para.text:
                    # Count occurrences
                    count = para.text.count(oldText)

                    if not dryRun:
                        # Perform replacement
                        actualCount = para.replaceText(oldText, newText)
                        count = actualCount

                    replacementInfo["occurrences"].append(
                        {
                            "paragraph": para.index,
                            "style": para.style,
                            "count": count,
                        }
                    )
                    modifiedParagraphs.add(para.index)
                    results["totalReplacements"] += count

            if replacementInfo["occurrences"]:
                results["replacements"].append(replacementInfo)

        results["paragraphsModified"] = len(modifiedParagraphs)

        # Save changes if not dry run
        if not dryRun and results["totalReplacements"] > 0:
            # Save document
            doc.saveAll()

            # Clean and pack
            cleanWorkspace(str(workspaceDir))

            success, message = packDocument(
                str(workspaceDir),
                str(outputPath),
                originalFile=str(inputPath),
                validate=True,
            )

            if not success:
                raise RuntimeError(f"Failed to pack: {message}")

            results["outputFile"] = str(outputPath)

        elif not dryRun and results["totalReplacements"] == 0:
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
        f"in {results['paragraphsModified']} paragraph(s)"
    )

    if verbose and results["replacements"]:
        lines.append("")
        lines.append("Details:")
        lines.append("-" * 50)

        for rep in results["replacements"]:
            lines.append(f'  "{rep["oldText"]}" -> "{rep["newText"]}"')
            for occ in rep["occurrences"]:
                styleStr = f" ({occ['style']})" if occ.get("style") else ""
                lines.append(
                    f"    Paragraph {occ['paragraph']}{styleStr}: {occ['count']} occurrence(s)"
                )

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Quick find/replace text in Word documents"
    )
    parser.add_argument("input", help="Input .docx file")
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
    parser.add_argument("output", help="Output .docx file")
    parser.add_argument(
        "--replacements",
        "-r",
        metavar="FILE",
        help="JSON file with replacements {old: new, ...}",
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

    try:
        results = quickEdit(
            args.input,
            args.output,
            replacements,
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
