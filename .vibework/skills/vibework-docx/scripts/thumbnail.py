"""Create thumbnail grids from Word document pages.

Creates a grid layout of page thumbnails for quick visual analysis.

Usage:
    python thumbnail.py input.docx [output_prefix] [--cols N]

Examples:
    python thumbnail.py document.docx
    # Creates: thumbnails.jpg

    python thumbnail.py document.docx grid --cols 3
    # Creates: grid.jpg (or grid-1.jpg, grid-2.jpg for large docs)
"""

import os
import argparse
import sys
from pathlib import Path

from converter import convertDocxToPdf, pdfToImages
from PIL import Image, ImageDraw, ImageFont

# Constants
THUMBNAIL_WIDTH = 400
CONVERSION_DPI = 100
MAX_COLS = 4
DEFAULT_COLS = 2
JPEG_QUALITY = 95
GRID_PADDING = 20
BORDER_WIDTH = 2
FONT_SIZE_RATIO = 0.08
LABEL_PADDING_RATIO = 0.4


def main():
    parser = argparse.ArgumentParser(
        description="Create thumbnail grids from Word document pages."
    )
    parser.add_argument("input", help="Input Word file (.docx)")
    parser.add_argument(
        "output_prefix",
        nargs="?",
        default=os.path.join(os.environ.get("VIBEWORK_SCRATCH", ""), "thumbnails"),
        help="Output prefix for image files (default: thumbnails)",
    )
    parser.add_argument(
        "--cols",
        type=int,
        default=DEFAULT_COLS,
        help=f"Number of columns (default: {DEFAULT_COLS}, max: {MAX_COLS})",
    )

    args = parser.parse_args()

    cols = min(args.cols, MAX_COLS)
    if args.cols > MAX_COLS:
        print(f"Warning: Columns limited to {MAX_COLS}")

    inputPath = Path(args.input)
    if not inputPath.exists() or inputPath.suffix.lower() != ".docx":
        print(f"Error: Invalid Word file: {args.input}", file=sys.stderr)
        sys.exit(1)

    # Handle output path - add .jpg only if no extension provided
    if Path(args.output_prefix).suffix.lower() in [".jpg", ".jpeg", ".png"]:
        outputPath = Path(args.output_prefix)
    else:
        outputPath = Path(f"{args.output_prefix}.jpg")

    try:
        pageImages = convertToImages(inputPath)

        if not pageImages:
            print("Error: No pages found", file=sys.stderr)
            sys.exit(1)

        # Build page list with labels
        pages = [(imgBytes, f"Page {i+1}") for i, imgBytes in enumerate(pageImages)]

        gridFiles = createGrids(pages, cols, THUMBNAIL_WIDTH, outputPath)

        print(f"Created {len(gridFiles)} grid(s):")
        for gridFile in gridFiles:
            print(f"  {gridFile}")

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def convertToImages(docxPath: Path) -> list[bytes]:
    """Convert Word document to images via local LibreOffice."""
    # Convert to PDF via local LibreOffice
    pdfBytes = convertDocxToPdf(docxPath)

    # Convert PDF to images using PyMuPDF
    return pdfToImages(pdfBytes, dpi=CONVERSION_DPI, imageFormat="jpeg")


def createGrids(
    pages: list[tuple[bytes, str]],
    cols: int,
    width: int,
    outputPath: Path,
) -> list[str]:
    """Create thumbnail grids, max cols×(cols+2) images per grid."""
    maxPerGrid = cols * (cols + 2)
    gridFiles = []

    for chunkIdx, startIdx in enumerate(range(0, len(pages), maxPerGrid)):
        endIdx = min(startIdx + maxPerGrid, len(pages))
        chunkPages = pages[startIdx:endIdx]

        grid = createGrid(chunkPages, cols, width)

        if len(pages) <= maxPerGrid:
            gridFilename = outputPath
        else:
            stem = outputPath.stem
            suffix = outputPath.suffix
            gridFilename = outputPath.parent / f"{stem}-{chunkIdx + 1}{suffix}"

        gridFilename.parent.mkdir(parents=True, exist_ok=True)
        grid.save(str(gridFilename), quality=JPEG_QUALITY)
        gridFiles.append(str(gridFilename))

    return gridFiles


def createGrid(
    pages: list[tuple[bytes, str]],
    cols: int,
    width: int,
) -> Image.Image:
    """Create a single thumbnail grid."""
    import io

    fontSize = int(width * FONT_SIZE_RATIO)
    labelPadding = int(fontSize * LABEL_PADDING_RATIO)

    # Get dimensions from first image
    with Image.open(io.BytesIO(pages[0][0])) as img:
        aspect = img.height / img.width
    height = int(width * aspect)

    # Calculate grid size
    rows = (len(pages) + cols - 1) // cols
    gridW = cols * width + (cols + 1) * GRID_PADDING
    gridH = rows * (height + fontSize + labelPadding * 2) + (rows + 1) * GRID_PADDING

    # Create grid
    grid = Image.new("RGB", (gridW, gridH), "white")
    draw = ImageDraw.Draw(grid)

    try:
        font = ImageFont.load_default(size=fontSize)
    except Exception:
        font = ImageFont.load_default()

    # Place thumbnails
    for i, (imgBytes, label) in enumerate(pages):
        row, col = i // cols, i % cols
        x = col * width + (col + 1) * GRID_PADDING
        yBase = (
            row * (height + fontSize + labelPadding * 2) + (row + 1) * GRID_PADDING
        )

        # Add page label
        bbox = draw.textbbox((0, 0), label, font=font)
        textW = bbox[2] - bbox[0]
        draw.text(
            (x + (width - textW) // 2, yBase + labelPadding),
            label,
            fill="black",
            font=font,
        )

        # Add thumbnail
        yThumbnail = yBase + labelPadding + fontSize + labelPadding

        with Image.open(io.BytesIO(imgBytes)) as img:
            img.thumbnail((width, height), Image.Resampling.LANCZOS)
            w, h = img.size
            tx = x + (width - w) // 2
            ty = yThumbnail + (height - h) // 2
            grid.paste(img, (tx, ty))

            # Add border
            if BORDER_WIDTH > 0:
                draw.rectangle(
                    [
                        (tx - BORDER_WIDTH, ty - BORDER_WIDTH),
                        (tx + w + BORDER_WIDTH - 1, ty + h + BORDER_WIDTH - 1),
                    ],
                    outline="gray",
                    width=BORDER_WIDTH,
                )

    return grid


if __name__ == "__main__":
    main()
