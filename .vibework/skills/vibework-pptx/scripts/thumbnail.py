#!/usr/bin/env python3
"""Create thumbnail grids from PowerPoint presentation slides.

Creates a grid layout of slide thumbnails for quick visual analysis.
Labels each thumbnail with its XML filename (e.g., slide1.xml).
Hidden slides are shown with a placeholder pattern.

Usage:
    python thumbnail.py input.pptx [output_prefix] [--cols N]

Examples:
    python thumbnail.py presentation.pptx
    # Creates: thumbnails.jpg

    python thumbnail.py template.pptx grid --cols 4
    # Creates: grid.jpg (or grid-1.jpg, grid-2.jpg for large decks)
"""

import os
import argparse
import io
import sys
import zipfile
from pathlib import Path

import defusedxml.minidom
from converter import convertPptxToPdf, pdfToImages
from PIL import Image, ImageDraw, ImageFont

# Constants
THUMBNAIL_WIDTH = 300
CONVERSION_DPI = 100
MAX_COLS = 6
DEFAULT_COLS = 3
JPEG_QUALITY = 95
GRID_PADDING = 20
BORDER_WIDTH = 2
FONT_SIZE_RATIO = 0.10
LABEL_PADDING_RATIO = 0.4


def main():
    parser = argparse.ArgumentParser(
        description="Create thumbnail grids from PowerPoint slides."
    )
    parser.add_argument("input", help="Input PowerPoint file (.pptx)")
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

    input_path = Path(args.input)
    if not input_path.exists() or input_path.suffix.lower() != ".pptx":
        print(f"Error: Invalid PowerPoint file: {args.input}", file=sys.stderr)
        sys.exit(1)

    # Handle output path - add .jpg only if no extension provided
    if Path(args.output_prefix).suffix.lower() in [".jpg", ".jpeg", ".png"]:
        output_path = Path(args.output_prefix)
    else:
        output_path = Path(f"{args.output_prefix}.jpg")

    try:
        # Get slide info (filenames and hidden status) in presentation order
        slide_info = get_slide_info(input_path)

        visible_images = convert_to_images(input_path)

        if not visible_images and not any(s["hidden"] for s in slide_info):
            print("Error: No slides found", file=sys.stderr)
            sys.exit(1)

        # Build slide list with images (visible) or placeholders (hidden)
        slides = build_slide_list(slide_info, visible_images)

        grid_files = create_grids(slides, cols, THUMBNAIL_WIDTH, output_path)

        print(f"Created {len(grid_files)} grid(s):")
        for grid_file in grid_files:
            print(f"  {grid_file}")

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def get_slide_info(pptx_path: Path) -> list[dict]:
    """Get slide filenames and hidden status in presentation order.

    Returns list of dicts with 'name' and 'hidden' keys.
    """
    with zipfile.ZipFile(pptx_path, "r") as zf:
        # Read presentation.xml.rels to get rId -> slide filename mapping
        rels_content = zf.read("ppt/_rels/presentation.xml.rels").decode("utf-8")
        rels_dom = defusedxml.minidom.parseString(rels_content)

        rid_to_slide = {}
        for rel in rels_dom.getElementsByTagName("Relationship"):
            rid = rel.getAttribute("Id")
            target = rel.getAttribute("Target")
            rel_type = rel.getAttribute("Type")
            if "slide" in rel_type and target.startswith("slides/"):
                rid_to_slide[rid] = target.replace("slides/", "")

        # Read presentation.xml to get slide order and hidden status
        pres_content = zf.read("ppt/presentation.xml").decode("utf-8")
        pres_dom = defusedxml.minidom.parseString(pres_content)

        slides = []
        for sld_id in pres_dom.getElementsByTagName("p:sldId"):
            rid = sld_id.getAttribute("r:id")
            if rid in rid_to_slide:
                # Check if slide is hidden (show="0")
                hidden = sld_id.getAttribute("show") == "0"
                slides.append({"name": rid_to_slide[rid], "hidden": hidden})

        return slides


def build_slide_list(
    slide_info: list[dict],
    visible_images: list[bytes],
) -> list[tuple[bytes, str]]:
    """Build list of (image_bytes, slide_name) tuples.

    Hidden slides get placeholder images.
    """
    # Get placeholder size from first visible image
    if visible_images:
        with Image.open(io.BytesIO(visible_images[0])) as img:
            placeholder_size = img.size
    else:
        placeholder_size = (1920, 1080)

    slides = []
    visible_idx = 0

    for info in slide_info:
        if info["hidden"]:
            # Create placeholder for hidden slide
            placeholder_img = create_hidden_placeholder(placeholder_size)
            buf = io.BytesIO()
            placeholder_img.save(buf, format="JPEG")
            slides.append((buf.getvalue(), f"{info['name']} (hidden)"))
        else:
            # Use visible image
            if visible_idx < len(visible_images):
                slides.append((visible_images[visible_idx], info["name"]))
                visible_idx += 1

    return slides


def create_hidden_placeholder(size: tuple[int, int]) -> Image.Image:
    """Create placeholder image for hidden slides (gray with X pattern)."""
    img = Image.new("RGB", size, color="#F0F0F0")
    draw = ImageDraw.Draw(img)
    line_width = max(5, min(size) // 100)
    draw.line([(0, 0), size], fill="#CCCCCC", width=line_width)
    draw.line([(size[0], 0), (0, size[1])], fill="#CCCCCC", width=line_width)
    return img


def convert_to_images(pptx_path: Path) -> list[bytes]:
    """Convert PowerPoint to images via local LibreOffice."""
    # Convert to PDF via local LibreOffice
    pdf_bytes = convertPptxToPdf(pptx_path)

    # Convert PDF to images using PyMuPDF
    return pdfToImages(pdf_bytes, dpi=CONVERSION_DPI, imageFormat="jpeg")


def create_grids(
    slides: list[tuple[bytes, str]],
    cols: int,
    width: int,
    output_path: Path,
) -> list[str]:
    """Create thumbnail grids, max cols×(cols+1) images per grid."""
    max_per_grid = cols * (cols + 1)
    grid_files = []

    for chunk_idx, start_idx in enumerate(range(0, len(slides), max_per_grid)):
        end_idx = min(start_idx + max_per_grid, len(slides))
        chunk_slides = slides[start_idx:end_idx]

        grid = create_grid(chunk_slides, cols, width)

        if len(slides) <= max_per_grid:
            grid_filename = output_path
        else:
            stem = output_path.stem
            suffix = output_path.suffix
            grid_filename = output_path.parent / f"{stem}-{chunk_idx + 1}{suffix}"

        grid_filename.parent.mkdir(parents=True, exist_ok=True)
        grid.save(str(grid_filename), quality=JPEG_QUALITY)
        grid_files.append(str(grid_filename))

    return grid_files


def create_grid(
    slides: list[tuple[bytes, str]],
    cols: int,
    width: int,
) -> Image.Image:
    """Create a single thumbnail grid."""
    font_size = int(width * FONT_SIZE_RATIO)
    label_padding = int(font_size * LABEL_PADDING_RATIO)

    # Get dimensions from first image
    with Image.open(io.BytesIO(slides[0][0])) as img:
        aspect = img.height / img.width
    height = int(width * aspect)

    # Calculate grid size
    rows = (len(slides) + cols - 1) // cols
    grid_w = cols * width + (cols + 1) * GRID_PADDING
    grid_h = rows * (height + font_size + label_padding * 2) + (rows + 1) * GRID_PADDING

    # Create grid
    grid = Image.new("RGB", (grid_w, grid_h), "white")
    draw = ImageDraw.Draw(grid)

    try:
        font = ImageFont.load_default(size=font_size)
    except Exception:
        font = ImageFont.load_default()

    # Place thumbnails
    for i, (img_bytes, slide_name) in enumerate(slides):
        row, col = i // cols, i % cols
        x = col * width + (col + 1) * GRID_PADDING
        y_base = (
            row * (height + font_size + label_padding * 2) + (row + 1) * GRID_PADDING
        )

        # Add slide filename label
        label = slide_name
        bbox = draw.textbbox((0, 0), label, font=font)
        text_w = bbox[2] - bbox[0]
        draw.text(
            (x + (width - text_w) // 2, y_base + label_padding),
            label,
            fill="black",
            font=font,
        )

        # Add thumbnail
        y_thumbnail = y_base + label_padding + font_size + label_padding

        with Image.open(io.BytesIO(img_bytes)) as img:
            img.thumbnail((width, height), Image.Resampling.LANCZOS)
            w, h = img.size
            tx = x + (width - w) // 2
            ty = y_thumbnail + (height - h) // 2
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
