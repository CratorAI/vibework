"""Analyze PDF document structure and content.

Extracts page info, text preview, form fields, and tables.

Usage:
    python analyze.py document.pdf
    python analyze.py document.pdf --json
    python analyze.py document.pdf --thumbnails grid.jpg

CLI Examples:
    # Basic analysis
    python analyze.py doc.pdf

    # JSON output
    python analyze.py doc.pdf --json > analysis.json

    # With thumbnail pages
    python analyze.py doc.pdf --thumbnails pages.jpg
"""

import argparse
import json
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional

# Support both running as module and as direct script
try:
    from .core import PDF, extractPdfInfo
except ImportError:
    from core import PDF, extractPdfInfo


@dataclass
class PageAnalysis:
    """Analysis results for a single page."""

    pageNumber: int
    width: float
    height: float
    textPreview: str
    wordCount: int
    tableCount: int


@dataclass
class DocumentAnalysis:
    """Analysis results for a PDF document."""

    filename: str
    pageCount: int
    hasFillableFields: bool
    fillableFieldCount: int
    totalWordCount: int
    totalTableCount: int
    title: Optional[str]
    author: Optional[str]
    pages: list[PageAnalysis] = field(default_factory=list)
    thumbnailPath: Optional[str] = None

    def toDict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)


# ---------------------------------------------------------------------------
# Analysis Functions
# ---------------------------------------------------------------------------


def analyzeDocument(pdfPath: str) -> DocumentAnalysis:
    """Analyze a PDF document.

    Args:
        pdfPath: Path to PDF file

    Returns:
        DocumentAnalysis with page info and content
    """
    pdfPath = Path(pdfPath)
    if not pdfPath.exists():
        raise FileNotFoundError(f"File not found: {pdfPath}")

    # Get basic info
    basicInfo = extractPdfInfo(str(pdfPath))

    pages = []
    totalWordCount = 0
    totalTableCount = 0
    fillableFieldCount = 0

    with PDF(str(pdfPath)) as pdf:
        # Count fillable fields
        fields = pdf.reader.get_fields()
        if fields:
            fillableFieldCount = len(fields)

        # Get metadata
        info = pdf.getInfo()

        # Analyze each page
        for i, page in enumerate(pdf.plumber.pages):
            pageNum = i + 1

            # Page dimensions
            width = float(page.width)
            height = float(page.height)

            # Extract text
            text = page.extract_text() or ""
            wordCount = len(text.split()) if text else 0
            totalWordCount += wordCount

            # Create text preview
            textPreview = text[:200] + "..." if len(text) > 200 else text
            textPreview = textPreview.replace("\n", " ").strip()

            # Count tables
            tables = page.extract_tables()
            tableCount = len(tables) if tables else 0
            totalTableCount += tableCount

            pages.append(
                PageAnalysis(
                    pageNumber=pageNum,
                    width=width,
                    height=height,
                    textPreview=textPreview,
                    wordCount=wordCount,
                    tableCount=tableCount,
                )
            )

    return DocumentAnalysis(
        filename=pdfPath.name,
        pageCount=basicInfo["pageCount"],
        hasFillableFields=basicInfo["hasFillableFields"],
        fillableFieldCount=fillableFieldCount,
        totalWordCount=totalWordCount,
        totalTableCount=totalTableCount,
        title=info.get("title"),
        author=info.get("author"),
        pages=pages,
    )


# ---------------------------------------------------------------------------
# Thumbnail Generation
# ---------------------------------------------------------------------------


def generateThumbnails(
    pdfPath: str, outputPath: str, cols: int = 2
) -> Optional[str]:
    """Generate thumbnail pages for a document.

    Args:
        pdfPath: Path to PDF file
        outputPath: Output image path
        cols: Number of columns in grid

    Returns:
        Output path if successful, None otherwise
    """
    try:
        from PIL import Image
        from pdf2image import convert_from_path
    except ImportError:
        print("Warning: PIL/pdf2image not available, skipping thumbnails", file=sys.stderr)
        return None

    pdfPath = Path(pdfPath)
    outputPath = Path(outputPath)

    try:
        # Convert PDF to images
        images = convert_from_path(str(pdfPath), dpi=100)

        if not images:
            print("Warning: No pages found", file=sys.stderr)
            return None

        # Create grid
        grid = _createThumbnailGrid(images, cols)
        outputPath.parent.mkdir(parents=True, exist_ok=True)
        grid.save(str(outputPath), quality=95)

        return str(outputPath)

    except Exception as e:
        print(f"Warning: Thumbnail generation failed: {e}", file=sys.stderr)
        return None


def _createThumbnailGrid(images: list, cols: int = 2):
    """Create a thumbnail grid from page images."""
    from PIL import Image

    thumbWidth = 400
    padding = 20

    # Get aspect ratio from first image
    aspect = images[0].height / images[0].width
    thumbHeight = int(thumbWidth * aspect)

    # Calculate grid dimensions
    rows = (len(images) + cols - 1) // cols
    gridWidth = cols * thumbWidth + (cols + 1) * padding
    gridHeight = rows * thumbHeight + (rows + 1) * padding

    # Create grid
    grid = Image.new("RGB", (gridWidth, gridHeight), "white")

    for i, img in enumerate(images):
        row, col = i // cols, i % cols
        x = col * thumbWidth + (col + 1) * padding
        y = row * thumbHeight + (row + 1) * padding

        img.thumbnail((thumbWidth, thumbHeight), Image.Resampling.LANCZOS)
        # Center thumbnail in cell
        offsetX = (thumbWidth - img.width) // 2
        offsetY = (thumbHeight - img.height) // 2
        grid.paste(img, (x + offsetX, y + offsetY))

    return grid


# ---------------------------------------------------------------------------
# Output Formatting
# ---------------------------------------------------------------------------


def formatAnalysis(analysis: DocumentAnalysis, verbose: bool = False) -> str:
    """Format analysis for display.

    Args:
        analysis: DocumentAnalysis object
        verbose: If True, show full text content

    Returns:
        Formatted string
    """
    lines = [
        f"Document: {analysis.filename}",
        f"Pages: {analysis.pageCount}",
        f"Total Words: {analysis.totalWordCount}",
        f"Total Tables: {analysis.totalTableCount}",
        "",
        f"Fillable Fields: {'Yes' if analysis.hasFillableFields else 'No'}",
    ]

    if analysis.hasFillableFields:
        lines.append(f"  Field Count: {analysis.fillableFieldCount}")

    if analysis.title:
        lines.append(f"Title: {analysis.title}")
    if analysis.author:
        lines.append(f"Author: {analysis.author}")

    lines.append("")
    lines.append("Pages:")
    lines.append("-" * 60)

    for page in analysis.pages:
        lines.append(f"  Page {page.pageNumber}:")
        lines.append(f"    Dimensions: {page.width:.0f} x {page.height:.0f} pts")
        lines.append(f"    Words: {page.wordCount}")
        lines.append(f"    Tables: {page.tableCount}")

        if verbose and page.textPreview:
            lines.append(f"    Preview: {page.textPreview}")

        lines.append("")

    if analysis.thumbnailPath:
        lines.append(f"Thumbnails: {analysis.thumbnailPath}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Analyze PDF document structure and content"
    )
    parser.add_argument("input", help="Input PDF file")
    parser.add_argument(
        "--json", "-j", action="store_true", help="Output as JSON"
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Show text previews"
    )
    parser.add_argument(
        "--thumbnails", "-t", metavar="PATH", help="Generate thumbnail grid"
    )
    parser.add_argument(
        "--cols", type=int, default=2, help="Thumbnail grid columns (default: 2)"
    )

    args = parser.parse_args()

    try:
        analysis = analyzeDocument(args.input)

        # Generate thumbnails if requested
        if args.thumbnails:
            thumbPath = generateThumbnails(args.input, args.thumbnails, args.cols)
            analysis.thumbnailPath = thumbPath

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
