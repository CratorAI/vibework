"""Create thumbnail grids from PDF document pages.

Creates a grid layout of page thumbnails for quick visual QA.

Usage:
    python thumbnail.py document.pdf [output.jpg] [--cols N]

Examples:
    python thumbnail.py document.pdf
    # Creates: thumbnails.jpg

    python thumbnail.py document.pdf grid.jpg --cols 3
    # Creates: grid.jpg (or grid-1.jpg, grid-2.jpg for large docs)
"""

import os
import argparse
import io
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from pdf2image import convert_from_path

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


def convertPdfToImages(pdfPath: Path, dpi: int = CONVERSION_DPI) -> list[Image.Image]:
    """Convert PDF to PIL images."""
    return convert_from_path(str(pdfPath), dpi=dpi)


def createGrid(
    pages: list[tuple[Image.Image, str]], cols: int, width: int
) -> Image.Image:
    """Create a single thumbnail grid.

    Args:
        pages: List of (image, label) tuples
        cols: Number of columns
        width: Thumbnail width

    Returns:
        Grid image
    """
    fontSize = int(width * FONT_SIZE_RATIO)
    labelPadding = int(fontSize * LABEL_PADDING_RATIO)

    # Get dimensions from first image
    aspect = pages[0][0].height / pages[0][0].width
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
    for i, (img, label) in enumerate(pages):
        row, col = i // cols, i % cols
        x = col * width + (col + 1) * GRID_PADDING
        yBase = row * (height + fontSize + labelPadding * 2) + (row + 1) * GRID_PADDING

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


def createGrids(
    pages: list[tuple[Image.Image, str]], cols: int, width: int, outputPath: Path
) -> list[str]:
    """Create thumbnail grids, max cols×(cols+2) images per grid.

    Args:
        pages: List of (image, label) tuples
        cols: Number of columns
        width: Thumbnail width
        outputPath: Output file path

    Returns:
        List of created file paths
    """
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


def main():
    parser = argparse.ArgumentParser(
        description="Create thumbnail grids from PDF document pages."
    )
    parser.add_argument("input", help="Input PDF file")
    parser.add_argument(
        "output",
        nargs="?",
        default=os.path.join(os.environ.get("VIBEWORK_SCRATCH", ""), "thumbnails"),
        help="Output file (default: thumbnails.jpg)",
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
    if not inputPath.exists():
        print(f"Error: File not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    # Handle output path
    if Path(args.output).suffix.lower() in [".jpg", ".jpeg", ".png"]:
        outputPath = Path(args.output)
    else:
        outputPath = Path(f"{args.output}.jpg")

    try:
        # Convert PDF to images
        images = convertPdfToImages(inputPath)

        if not images:
            print("Error: No pages found", file=sys.stderr)
            sys.exit(1)

        # Build page list with labels
        pages = [(img, f"Page {i + 1}") for i, img in enumerate(images)]

        gridFiles = createGrids(pages, cols, THUMBNAIL_WIDTH, outputPath)

        print(f"Created {len(gridFiles)} grid(s):")
        for gridFile in gridFiles:
            print(f"  {gridFile}")

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
