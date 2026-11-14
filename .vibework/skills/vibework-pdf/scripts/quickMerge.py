"""Quick merge multiple PDFs into one.

Usage:
    python quickMerge.py file1.pdf file2.pdf file3.pdf -o merged.pdf
    python quickMerge.py file1.pdf file2.pdf  # Output: merged.pdf

Examples:
    # Merge three files
    python quickMerge.py doc1.pdf doc2.pdf doc3.pdf -o combined.pdf

    # Merge with default output name
    python quickMerge.py part1.pdf part2.pdf
    # Creates: merged.pdf
"""

import argparse
import sys
from pathlib import Path

from pypdf import PdfReader, PdfWriter


def mergePdfs(inputFiles: list[str], outputFile: str) -> int:
    """Merge multiple PDFs into one.

    Args:
        inputFiles: List of input PDF paths
        outputFile: Output PDF path

    Returns:
        Total number of pages in merged PDF
    """
    writer = PdfWriter()
    totalPages = 0

    for pdfPath in inputFiles:
        reader = PdfReader(pdfPath)
        for page in reader.pages:
            writer.add_page(page)
        totalPages += len(reader.pages)
        print(f"Added {len(reader.pages)} pages from {pdfPath}")

    with open(outputFile, "wb") as f:
        writer.write(f)

    return totalPages


def main():
    parser = argparse.ArgumentParser(description="Merge multiple PDFs into one")
    parser.add_argument("inputs", nargs="+", help="Input PDF files to merge")
    parser.add_argument(
        "-o", "--output", default="merged.pdf", help="Output PDF file (default: merged.pdf)"
    )

    args = parser.parse_args()

    # Validate input files
    for inputFile in args.inputs:
        if not Path(inputFile).exists():
            print(f"Error: File not found: {inputFile}", file=sys.stderr)
            sys.exit(1)

    try:
        totalPages = mergePdfs(args.inputs, args.output)
        print(f"\nMerged {len(args.inputs)} files ({totalPages} total pages) into {args.output}")

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
