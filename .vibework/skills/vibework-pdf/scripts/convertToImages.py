"""Convert PDF pages to images.

Usage:
    python convertToImages.py document.pdf output_directory/
    python convertToImages.py document.pdf output_directory/ --dpi 150
    python convertToImages.py document.pdf output_directory/ --max-dim 800

Output:
    Creates page_1.png, page_2.png, etc. in the output directory.
"""

import argparse
import os
import sys
from pathlib import Path

from pdf2image import convert_from_path

# Constants
DEFAULT_DPI = 200
DEFAULT_MAX_DIM = 1000


def convertPdfToImages(
    pdfPath: str,
    outputDir: str,
    dpi: int = DEFAULT_DPI,
    maxDim: int = DEFAULT_MAX_DIM,
) -> list[str]:
    """Convert PDF pages to images.

    Args:
        pdfPath: Path to PDF file
        outputDir: Directory to save images
        dpi: Resolution for conversion
        maxDim: Maximum dimension (width or height)

    Returns:
        List of saved image paths
    """
    outPath = Path(outputDir)
    outPath.mkdir(parents=True, exist_ok=True)

    images = convert_from_path(pdfPath, dpi=dpi)
    savedPaths = []

    for i, image in enumerate(images):
        # Scale image if needed
        width, height = image.size
        if width > maxDim or height > maxDim:
            scaleFactor = min(maxDim / width, maxDim / height)
            newWidth = int(width * scaleFactor)
            newHeight = int(height * scaleFactor)
            image = image.resize((newWidth, newHeight))

        imagePath = outPath / f"page_{i + 1}.png"
        image.save(str(imagePath))
        savedPaths.append(str(imagePath))
        print(f"Saved page {i + 1} as {imagePath} (size: {image.size})")

    print(f"Converted {len(images)} pages to PNG images")
    return savedPaths


def main():
    parser = argparse.ArgumentParser(description="Convert PDF pages to images")
    parser.add_argument("input", help="Input PDF file")
    parser.add_argument("output", help="Output directory")
    parser.add_argument(
        "--dpi", type=int, default=DEFAULT_DPI, help=f"DPI (default: {DEFAULT_DPI})"
    )
    parser.add_argument(
        "--max-dim",
        type=int,
        default=DEFAULT_MAX_DIM,
        help=f"Max dimension (default: {DEFAULT_MAX_DIM})",
    )

    args = parser.parse_args()

    try:
        convertPdfToImages(args.input, args.output, args.dpi, args.max_dim)
    except FileNotFoundError:
        print(f"Error: File not found: {args.input}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
