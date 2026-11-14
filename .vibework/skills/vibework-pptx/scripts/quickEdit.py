#!/usr/bin/env python3
"""Quick find/replace text operations for PowerPoint files.

Performs text replacement without manual XML editing.

Usage:
    python quickEdit.py presentation.pptx "old text" "new text" output.pptx
    python quickEdit.py presentation.pptx --replacements replacements.json output.pptx

CLI Examples:
    # Simple replacement
    python quickEdit.py input.pptx "PLACEHOLDER" "Actual Value" output.pptx

    # Multiple replacements from JSON file
    python quickEdit.py input.pptx --replacements changes.json output.pptx

    # Replace in specific slides only
    python quickEdit.py input.pptx "OLD" "NEW" output.pptx --slides 1,2,3

    # Dry run (preview without saving)
    python quickEdit.py input.pptx "OLD" "NEW" output.pptx --dry-run
"""

import argparse
import json
import sys
import tempfile
from pathlib import Path
from typing import Optional

# Relative imports when loaded as part of the package; plain ones when run directly
if __package__:
    from .core import Deck, unpackPresentation, packPresentation, cleanWorkspace
else:
    from core import Deck, unpackPresentation, packPresentation, cleanWorkspace


# ---------------------------------------------------------------------------
# Edit Functions
# ---------------------------------------------------------------------------


def quickEdit(
    inputPath: str,
    outputPath: str,
    replacements: dict[str, str],
    slideNumbers: Optional[list[int]] = None,
    dryRun: bool = False,
) -> dict:
    """Perform text replacements in a PowerPoint file.

    Args:
        inputPath: Path to input .pptx file
        outputPath: Path for output .pptx file
        replacements: Dict mapping old text -> new text
        slideNumbers: Optional list of slide numbers to process (1-indexed)
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
        "slidesModified": 0,
    }

    with tempfile.TemporaryDirectory() as tempDir:
        workspaceDir = Path(tempDir) / "workspace"

        # Unpack presentation
        success, message = unpackPresentation(str(inputPath), str(workspaceDir))
        if not success:
            raise RuntimeError(f"Failed to unpack: {message}")

        # Create Deck instance
        deck = Deck(str(workspaceDir))

        # Determine which slides to process
        if slideNumbers:
            slidesToProcess = [
                s for s in deck.slides if s.slideNumber in slideNumbers
            ]
        else:
            slidesToProcess = deck.slides

        # Perform replacements
        modifiedSlides = set()
        for oldText, newText in replacements.items():
            replacementInfo = {
                "oldText": oldText,
                "newText": newText,
                "occurrences": [],
            }

            for slide in slidesToProcess:
                # Check if text exists in slide
                slideText = slide.getTextContent()
                if oldText in slideText:
                    # Count occurrences
                    count = slideText.count(oldText)

                    if not dryRun:
                        # Perform replacement
                        actualCount = slide.replaceText(oldText, newText)
                        count = actualCount

                    replacementInfo["occurrences"].append(
                        {
                            "slide": slide.slideNumber,
                            "filename": slide.name,
                            "count": count,
                        }
                    )
                    modifiedSlides.add(slide.slideNumber)
                    results["totalReplacements"] += count

            if replacementInfo["occurrences"]:
                results["replacements"].append(replacementInfo)

        results["slidesModified"] = len(modifiedSlides)

        # Save changes if not dry run
        if not dryRun and results["totalReplacements"] > 0:
            # Save modified slides
            for slide in slidesToProcess:
                slide.save()

            # Clean and pack
            cleanWorkspace(str(workspaceDir))

            success, message = packPresentation(
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


def replaceInSlide(
    deck: Deck,
    slideNumber: int,
    oldText: str,
    newText: str,
) -> int:
    """Replace text in a specific slide.

    Args:
        deck: Deck instance
        slideNumber: 1-based slide number
        oldText: Text to find
        newText: Replacement text

    Returns:
        Number of replacements made
    """
    slide = deck.getSlide(slideNumber)
    if slide is None:
        return 0
    return slide.replaceText(oldText, newText)


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
        f"in {results['slidesModified']} slide(s)"
    )

    if verbose and results["replacements"]:
        lines.append("")
        lines.append("Details:")
        lines.append("-" * 50)

        for rep in results["replacements"]:
            lines.append(f'  "{rep["oldText"]}" → "{rep["newText"]}"')
            for occ in rep["occurrences"]:
                lines.append(
                    f"    Slide {occ['slide']} ({occ['filename']}): {occ['count']} occurrence(s)"
                )

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Quick find/replace text in PowerPoint files"
    )
    parser.add_argument("input", help="Input .pptx file")
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
    parser.add_argument("output", help="Output .pptx file")
    parser.add_argument(
        "--replacements",
        "-r",
        metavar="FILE",
        help="JSON file with replacements {old: new, ...}",
    )
    parser.add_argument(
        "--slides",
        "-s",
        help="Comma-separated slide numbers to process (e.g., 1,2,3)",
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

    # Parse slide numbers
    slideNumbers = None
    if args.slides:
        try:
            slideNumbers = [int(s.strip()) for s in args.slides.split(",")]
        except ValueError:
            print("Error: Invalid slide numbers", file=sys.stderr)
            sys.exit(1)

    try:
        results = quickEdit(
            args.input,
            args.output,
            replacements,
            slideNumbers=slideNumbers,
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
