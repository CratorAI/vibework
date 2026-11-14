"""Export Word document pages to images.

Uses local LibreOffice for PDF conversion and PyMuPDF for image generation.

Usage:
    python exportPages.py document.docx output_dir/
    python exportPages.py document.docx images/ --format png --dpi 150

CLI Examples:
    # Export to JPEG (default)
    python exportPages.py doc.docx ./pages/

    # Export to PNG at higher DPI
    python exportPages.py doc.docx ./pages/ --format png --dpi 200

    # Export specific pages
    python exportPages.py doc.docx ./pages/ --pages 1,3,5
"""

import argparse
import sys
from pathlib import Path
from typing import Optional

from converter import convertDocxToPdf, pdfToImages

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_DPI = 150
DEFAULT_FORMAT = "jpeg"
SUPPORTED_FORMATS = ["jpeg", "png"]


# ---------------------------------------------------------------------------
# Export Functions
# ---------------------------------------------------------------------------


def exportPages(
    docxPath: str,
    outputDir: str,
    dpi: int = DEFAULT_DPI,
    imageFormat: str = DEFAULT_FORMAT,
    pageNumbers: Optional[list[int]] = None,
    prefix: str = "page",
) -> list[str]:
    """Export document pages to images.

    Args:
        docxPath: Path to .docx file
        outputDir: Output directory for images
        dpi: Image resolution (dots per inch)
        imageFormat: Output format (jpeg, png)
        pageNumbers: Optional list of page numbers to export (1-indexed)
        prefix: Filename prefix for output images

    Returns:
        List of created image paths

    Raises:
        FileNotFoundError: If input file not found
        RuntimeError: If conversion fails
    """
    docxPath = Path(docxPath).resolve()
    outputDir = Path(outputDir).resolve()

    if not docxPath.exists():
        raise FileNotFoundError(f"Input file not found: {docxPath}")

    if imageFormat not in SUPPORTED_FORMATS:
        raise ValueError(
            f"Unsupported format: {imageFormat}. Use: {SUPPORTED_FORMATS}"
        )

    # Create output directory
    outputDir.mkdir(parents=True, exist_ok=True)

    # Convert DOCX to PDF via local LibreOffice
    print(f"Converting {docxPath.name} to PDF...")
    try:
        pdfBytes = convertDocxToPdf(docxPath)
    except Exception as e:
        raise RuntimeError(f"PDF conversion failed: {e}")

    # Convert PDF to images using PyMuPDF
    print(f"Generating {imageFormat.upper()} images at {dpi} DPI...")
    try:
        allImages = pdfToImages(pdfBytes, dpi=dpi, imageFormat=imageFormat)
    except Exception as e:
        raise RuntimeError(f"Image conversion failed: {e}")

    # Get file extension
    extension = _getExtension(imageFormat)

    # Filter to specific pages if requested
    if pageNumbers:
        exportedPaths = []
        for pageNum in pageNumbers:
            if 1 <= pageNum <= len(allImages):
                outputPath = outputDir / f"{prefix}-{pageNum:02d}.{extension}"
                outputPath.write_bytes(allImages[pageNum - 1])
                exportedPaths.append(str(outputPath))
            else:
                print(
                    f"Warning: Page {pageNum} out of range (1-{len(allImages)})",
                    file=sys.stderr,
                )
        return exportedPaths
    else:
        # Export all pages
        exportedPaths = []
        for i, imageBytes in enumerate(allImages, start=1):
            outputPath = outputDir / f"{prefix}-{i:02d}.{extension}"
            outputPath.write_bytes(imageBytes)
            exportedPaths.append(str(outputPath))
        return exportedPaths


def _getExtension(imageFormat: str) -> str:
    """Get file extension for image format."""
    return {"jpeg": "jpg", "png": "png"}.get(imageFormat, "jpg")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Export Word document pages to images"
    )
    parser.add_argument("input", help="Input .docx file")
    parser.add_argument("output", help="Output directory")
    parser.add_argument(
        "--format",
        "-f",
        choices=SUPPORTED_FORMATS,
        default=DEFAULT_FORMAT,
        help=f"Image format (default: {DEFAULT_FORMAT})",
    )
    parser.add_argument(
        "--dpi",
        "-d",
        type=int,
        default=DEFAULT_DPI,
        help=f"Image DPI (default: {DEFAULT_DPI})",
    )
    parser.add_argument(
        "--pages",
        "-p",
        help="Comma-separated page numbers to export (e.g., 1,3,5)",
    )
    parser.add_argument(
        "--prefix",
        default="page",
        help="Filename prefix (default: page)",
    )

    args = parser.parse_args()

    # Parse page numbers if provided
    pageNumbers = None
    if args.pages:
        try:
            pageNumbers = [int(p.strip()) for p in args.pages.split(",")]
        except ValueError:
            print("Error: Invalid page numbers", file=sys.stderr)
            sys.exit(1)

    try:
        exportedPaths = exportPages(
            args.input,
            args.output,
            dpi=args.dpi,
            imageFormat=args.format,
            pageNumbers=pageNumbers,
            prefix=args.prefix,
        )

        print(f"Exported {len(exportedPaths)} page(s):")
        for path in exportedPaths:
            print(f"  {path}")

    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
