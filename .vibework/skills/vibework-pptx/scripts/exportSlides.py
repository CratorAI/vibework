#!/usr/bin/env python3
"""Export PowerPoint slides to images.

Uses local LibreOffice for PDF conversion and PyMuPDF for image generation.

Usage:
    python exportSlides.py presentation.pptx output_dir/
    python exportSlides.py presentation.pptx images/ --format png --dpi 150

CLI Examples:
    # Export to JPEG (default)
    python exportSlides.py deck.pptx ./slides/

    # Export to PNG at higher DPI
    python exportSlides.py deck.pptx ./slides/ --format png --dpi 200

    # Export specific slides
    python exportSlides.py deck.pptx ./slides/ --slides 1,3,5
"""

import argparse
import sys
from pathlib import Path
from typing import Optional

from converter import convertPptxToPdf, pdfToImages

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_DPI = 150
DEFAULT_FORMAT = "jpeg"
SUPPORTED_FORMATS = ["jpeg", "png"]


# ---------------------------------------------------------------------------
# Export Functions
# ---------------------------------------------------------------------------


def exportSlides(
    pptxPath: str,
    outputDir: str,
    dpi: int = DEFAULT_DPI,
    imageFormat: str = DEFAULT_FORMAT,
    slideNumbers: Optional[list[int]] = None,
    prefix: str = "slide",
) -> list[str]:
    """Export presentation slides to images.

    Args:
        pptxPath: Path to .pptx file
        outputDir: Output directory for images
        dpi: Image resolution (dots per inch)
        imageFormat: Output format (jpeg, png)
        slideNumbers: Optional list of slide numbers to export (1-indexed)
        prefix: Filename prefix for output images

    Returns:
        List of created image paths

    Raises:
        FileNotFoundError: If input file not found
        RuntimeError: If conversion fails
    """
    pptxPath = Path(pptxPath).resolve()
    outputDir = Path(outputDir).resolve()

    if not pptxPath.exists():
        raise FileNotFoundError(f"Input file not found: {pptxPath}")

    if imageFormat not in SUPPORTED_FORMATS:
        raise ValueError(
            f"Unsupported format: {imageFormat}. Use: {SUPPORTED_FORMATS}"
        )

    # Create output directory
    outputDir.mkdir(parents=True, exist_ok=True)

    # Convert PPTX to PDF via local LibreOffice
    print(f"Converting {pptxPath.name} to PDF...")
    try:
        pdfBytes = convertPptxToPdf(pptxPath)
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

    # Filter to specific slides if requested
    if slideNumbers:
        exportedPaths = []
        for slideNum in slideNumbers:
            if 1 <= slideNum <= len(allImages):
                outputPath = outputDir / f"{prefix}-{slideNum:02d}.{extension}"
                outputPath.write_bytes(allImages[slideNum - 1])
                exportedPaths.append(str(outputPath))
            else:
                print(
                    f"Warning: Slide {slideNum} out of range (1-{len(allImages)})",
                    file=sys.stderr,
                )
        return exportedPaths
    else:
        # Export all slides
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
        description="Export PowerPoint slides to images"
    )
    parser.add_argument("input", help="Input .pptx file")
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
        "--slides",
        "-s",
        help="Comma-separated slide numbers to export (e.g., 1,3,5)",
    )
    parser.add_argument(
        "--prefix",
        "-p",
        default="slide",
        help="Filename prefix (default: slide)",
    )

    args = parser.parse_args()

    # Parse slide numbers if provided
    slideNumbers = None
    if args.slides:
        try:
            slideNumbers = [int(s.strip()) for s in args.slides.split(",")]
        except ValueError:
            print("Error: Invalid slide numbers", file=sys.stderr)
            sys.exit(1)

    try:
        exportedPaths = exportSlides(
            args.input,
            args.output,
            dpi=args.dpi,
            imageFormat=args.format,
            slideNumbers=slideNumbers,
            prefix=args.prefix,
        )

        print(f"Exported {len(exportedPaths)} slide(s):")
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
