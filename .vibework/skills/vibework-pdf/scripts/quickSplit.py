"""Quick split a PDF into individual pages.

Usage:
    python quickSplit.py document.pdf output_directory/
    python quickSplit.py document.pdf output_directory/ --pages 1,3,5

Examples:
    # Split all pages
    python quickSplit.py document.pdf ./pages/
    # Creates: ./pages/page_1.pdf, ./pages/page_2.pdf, etc.

    # Split specific pages only
    python quickSplit.py document.pdf ./pages/ --pages 1,3,5
    # Creates: ./pages/page_1.pdf, ./pages/page_3.pdf, ./pages/page_5.pdf
"""

import argparse
import sys
from pathlib import Path
from typing import Optional

from pypdf import PdfReader, PdfWriter


def splitPdf(
    inputFile: str, outputDir: str, pageNumbers: Optional[list[int]] = None
) -> list[str]:
    """Split PDF into individual pages.

    Args:
        inputFile: Input PDF path
        outputDir: Directory for output files
        pageNumbers: Optional list of 1-based page numbers to extract

    Returns:
        List of output file paths
    """
    outPath = Path(outputDir)
    outPath.mkdir(parents=True, exist_ok=True)

    reader = PdfReader(inputFile)
    savedPaths = []

    for i, page in enumerate(reader.pages):
        pageNum = i + 1
        if pageNumbers is not None and pageNum not in pageNumbers:
            continue

        writer = PdfWriter()
        writer.add_page(page)

        outputFile = outPath / f"page_{pageNum}.pdf"
        with open(outputFile, "wb") as f:
            writer.write(f)

        savedPaths.append(str(outputFile))
        print(f"Created {outputFile}")

    return savedPaths


def main():
    parser = argparse.ArgumentParser(description="Split PDF into individual pages")
    parser.add_argument("input", help="Input PDF file")
    parser.add_argument("output", help="Output directory")
    parser.add_argument(
        "--pages",
        help="Page numbers to extract (comma-separated, e.g., 1,3,5)",
    )

    args = parser.parse_args()

    if not Path(args.input).exists():
        print(f"Error: File not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    pageNumbers = None
    if args.pages:
        try:
            pageNumbers = [int(p.strip()) for p in args.pages.split(",")]
        except ValueError:
            print("Error: Invalid page numbers. Use comma-separated integers.", file=sys.stderr)
            sys.exit(1)

    try:
        savedPaths = splitPdf(args.input, args.output, pageNumbers)

        if savedPaths:
            print(f"\nSplit into {len(savedPaths)} page(s) in {args.output}")
        else:
            print("No pages extracted")

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
