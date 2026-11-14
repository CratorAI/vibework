"""Core utilities for vibework-pdf.

Self-contained API for PDF manipulation including text extraction,
table extraction, form field detection, and image conversion.

Usage:
    from core import PDF, mergePdfs, splitPdf, extractPdfInfo

CLI:
    python core.py extract-text document.pdf
    python core.py extract-tables document.pdf
    python core.py info document.pdf
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Optional

# PDF libraries
from pypdf import PdfReader, PdfWriter
import pdfplumber

# Optional: for image conversion
try:
    from pdf2image import convert_from_path
    HAS_PDF2IMAGE = True
except ImportError:
    HAS_PDF2IMAGE = False

# Constants
DEFAULT_DPI = 200
DEFAULT_MAX_DIM = 1000


# ---------------------------------------------------------------------------
# PDF Class
# ---------------------------------------------------------------------------


class PDF:
    """Represents a PDF document."""

    def __init__(self, path: str):
        """Initialize a PDF from a file path.

        Args:
            path: Path to PDF file
        """
        self.path = Path(path)
        if not self.path.exists():
            raise FileNotFoundError(f"PDF not found: {path}")

        self._reader: Optional[PdfReader] = None
        self._plumber = None

    @classmethod
    def fromFile(cls, path: str) -> "PDF":
        """Create a PDF from a file path.

        Args:
            path: Path to PDF file

        Returns:
            PDF instance
        """
        return cls(path)

    @property
    def reader(self) -> PdfReader:
        """Get pypdf reader (lazy loaded)."""
        if self._reader is None:
            self._reader = PdfReader(str(self.path))
        return self._reader

    @property
    def plumber(self):
        """Get pdfplumber document (lazy loaded)."""
        if self._plumber is None:
            self._plumber = pdfplumber.open(str(self.path))
        return self._plumber

    @property
    def pageCount(self) -> int:
        """Get number of pages."""
        return len(self.reader.pages)

    def extractText(self, pageNumbers: Optional[list[int]] = None) -> str:
        """Extract text from PDF.

        Args:
            pageNumbers: Optional list of 1-based page numbers.
                        If None, extracts from all pages.

        Returns:
            Extracted text as string
        """
        texts = []

        for i, page in enumerate(self.plumber.pages):
            pageNum = i + 1
            if pageNumbers is not None and pageNum not in pageNumbers:
                continue

            text = page.extract_text()
            if text:
                texts.append(f"--- Page {pageNum} ---\n{text}")

        return "\n\n".join(texts)

    def extractTables(
        self, pageNumbers: Optional[list[int]] = None
    ) -> dict[int, list[list[list[str]]]]:
        """Extract tables from PDF.

        Args:
            pageNumbers: Optional list of 1-based page numbers.
                        If None, extracts from all pages.

        Returns:
            Dict mapping page numbers to list of tables.
            Each table is a list of rows, each row is a list of cells.
        """
        result = {}

        for i, page in enumerate(self.plumber.pages):
            pageNum = i + 1
            if pageNumbers is not None and pageNum not in pageNumbers:
                continue

            tables = page.extract_tables()
            if tables:
                result[pageNum] = tables

        return result

    def hasFillableFields(self) -> bool:
        """Check if PDF has fillable form fields.

        Returns:
            True if the PDF has form fields
        """
        fields = self.reader.get_fields()
        return bool(fields)

    def getInfo(self) -> dict:
        """Get PDF metadata.

        Returns:
            Dict with title, author, subject, creator, etc.
        """
        meta = self.reader.metadata
        if meta is None:
            return {}

        return {
            "title": meta.title,
            "author": meta.author,
            "subject": meta.subject,
            "creator": meta.creator,
            "producer": meta.producer,
            "creationDate": str(meta.creation_date) if meta.creation_date else None,
            "modificationDate": (
                str(meta.modification_date) if meta.modification_date else None
            ),
        }

    def getPageDimensions(self, pageNumber: int = 1) -> tuple[float, float]:
        """Get dimensions of a page.

        Args:
            pageNumber: 1-based page number

        Returns:
            (width, height) in points
        """
        page = self.reader.pages[pageNumber - 1]
        mediabox = page.mediabox
        return float(mediabox.width), float(mediabox.height)

    def toImages(
        self,
        outputDir: str,
        dpi: int = DEFAULT_DPI,
        maxDim: int = DEFAULT_MAX_DIM,
        pageNumbers: Optional[list[int]] = None,
    ) -> list[str]:
        """Convert PDF pages to images.

        Args:
            outputDir: Directory to save images
            dpi: Resolution for conversion
            maxDim: Maximum dimension (width or height)
            pageNumbers: Optional list of 1-based page numbers

        Returns:
            List of saved image paths
        """
        if not HAS_PDF2IMAGE:
            raise ImportError(
                "pdf2image is required for image conversion. "
                "Install with: pip install pdf2image"
            )

        outPath = Path(outputDir)
        outPath.mkdir(parents=True, exist_ok=True)

        images = convert_from_path(str(self.path), dpi=dpi)
        savedPaths = []

        for i, image in enumerate(images):
            pageNum = i + 1
            if pageNumbers is not None and pageNum not in pageNumbers:
                continue

            # Scale if needed
            width, height = image.size
            if width > maxDim or height > maxDim:
                scaleFactor = min(maxDim / width, maxDim / height)
                newWidth = int(width * scaleFactor)
                newHeight = int(height * scaleFactor)
                image = image.resize((newWidth, newHeight))

            imagePath = outPath / f"page_{pageNum}.png"
            image.save(str(imagePath))
            savedPaths.append(str(imagePath))

        return savedPaths

    def close(self) -> None:
        """Close open resources."""
        if self._plumber is not None:
            self._plumber.close()
            self._plumber = None

    def __enter__(self) -> "PDF":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()

    def __repr__(self) -> str:
        return f"<PDF: {self.path.name} ({self.pageCount} pages)>"


# ---------------------------------------------------------------------------
# Utility Functions
# ---------------------------------------------------------------------------


def extractPdfInfo(path: str) -> dict:
    """Extract PDF info without full load.

    Args:
        path: Path to PDF file

    Returns:
        Dict with pageCount, hasFillableFields, title, etc.
    """
    reader = PdfReader(path)

    info = {
        "pageCount": len(reader.pages),
        "hasFillableFields": bool(reader.get_fields()),
    }

    meta = reader.metadata
    if meta:
        info["title"] = meta.title
        info["author"] = meta.author

    return info


def mergePdfs(inputFiles: list[str], outputFile: str) -> None:
    """Merge multiple PDFs into one.

    Args:
        inputFiles: List of input PDF paths
        outputFile: Output PDF path
    """
    writer = PdfWriter()

    for pdfPath in inputFiles:
        reader = PdfReader(pdfPath)
        for page in reader.pages:
            writer.add_page(page)

    with open(outputFile, "wb") as f:
        writer.write(f)


def splitPdf(
    inputFile: str,
    outputDir: str,
    pageNumbers: Optional[list[int]] = None,
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

    return savedPaths


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description="PDF manipulation utilities")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # extract-text command
    textParser = subparsers.add_parser("extract-text", help="Extract text from PDF")
    textParser.add_argument("input", help="Input PDF file")
    textParser.add_argument("--output", "-o", help="Output text file")
    textParser.add_argument(
        "--pages", help="Page numbers (comma-separated, e.g., 1,3,5)"
    )

    # extract-tables command
    tablesParser = subparsers.add_parser(
        "extract-tables", help="Extract tables from PDF"
    )
    tablesParser.add_argument("input", help="Input PDF file")
    tablesParser.add_argument("--output", "-o", help="Output JSON file")
    tablesParser.add_argument(
        "--pages", help="Page numbers (comma-separated, e.g., 1,3,5)"
    )

    # info command
    infoParser = subparsers.add_parser("info", help="Get PDF info")
    infoParser.add_argument("input", help="Input PDF file")
    infoParser.add_argument("--json", "-j", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    if args.command is None:
        parser.print_help()
        sys.exit(1)

    try:
        if args.command == "extract-text":
            pageNumbers = None
            if args.pages:
                pageNumbers = [int(p.strip()) for p in args.pages.split(",")]

            with PDF(args.input) as pdf:
                text = pdf.extractText(pageNumbers)

            if args.output:
                Path(args.output).write_text(text, encoding="utf-8")
                print(f"Text saved to {args.output}")
            else:
                print(text)

        elif args.command == "extract-tables":
            pageNumbers = None
            if args.pages:
                pageNumbers = [int(p.strip()) for p in args.pages.split(",")]

            with PDF(args.input) as pdf:
                tables = pdf.extractTables(pageNumbers)

            output = json.dumps(tables, indent=2, default=str)

            if args.output:
                Path(args.output).write_text(output, encoding="utf-8")
                print(f"Tables saved to {args.output}")
            else:
                print(output)

        elif args.command == "info":
            info = extractPdfInfo(args.input)

            if args.json:
                print(json.dumps(info, indent=2, default=str))
            else:
                print(f"File: {args.input}")
                print(f"Pages: {info['pageCount']}")
                print(f"Has fillable fields: {info['hasFillableFields']}")
                if info.get("title"):
                    print(f"Title: {info['title']}")
                if info.get("author"):
                    print(f"Author: {info['author']}")

    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
