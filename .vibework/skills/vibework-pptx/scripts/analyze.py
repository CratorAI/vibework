#!/usr/bin/env python3
"""Analyze PowerPoint presentation structure and content.

Extracts slide info, text content, layouts, and generates thumbnail grids.

Usage:
    python analyze.py presentation.pptx
    python analyze.py presentation.pptx --json
    python analyze.py presentation.pptx --thumbnails thumbs.jpg

CLI Examples:
    # Basic analysis
    python analyze.py deck.pptx

    # JSON output
    python analyze.py deck.pptx --json > analysis.json

    # With thumbnail grid
    python analyze.py deck.pptx --thumbnails grid.jpg
"""

import argparse
import json
import subprocess
import sys
import tempfile
import zipfile
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional

# Relative imports when loaded as part of the package; plain ones when run directly
if __package__:
    from .core import parseXml, getTextElements, extractSlideInfo
else:
    from core import parseXml, getTextElements, extractSlideInfo

# Check for optional thumbnail support
try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


@dataclass
class SlideAnalysis:
    """Analysis results for a single slide."""

    slideNumber: int
    filename: str
    hidden: bool
    textContent: list[str]
    textPreview: str
    wordCount: int
    layoutName: Optional[str] = None
    hasNotes: bool = False
    mediaCount: int = 0


@dataclass
class DeckAnalysis:
    """Analysis results for a presentation."""

    filename: str
    slideCount: int
    hiddenCount: int
    totalWordCount: int
    layouts: list[str]
    slides: list[SlideAnalysis] = field(default_factory=list)
    thumbnailPath: Optional[str] = None

    def toDict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)


# ---------------------------------------------------------------------------
# Analysis Functions
# ---------------------------------------------------------------------------


def analyzePresentation(pptxPath: str) -> DeckAnalysis:
    """Analyze a PowerPoint presentation.

    Args:
        pptxPath: Path to .pptx file

    Returns:
        DeckAnalysis with slide info and content
    """
    pptxPath = Path(pptxPath)
    if not pptxPath.exists():
        raise FileNotFoundError(f"File not found: {pptxPath}")

    # Get basic slide info
    slideInfo = extractSlideInfo(str(pptxPath))

    # Analyze each slide
    slides = []
    layouts = set()
    totalWordCount = 0
    hiddenCount = 0

    with zipfile.ZipFile(pptxPath, "r") as zf:
        # Get layout mappings
        layoutMap = _getLayoutMap(zf)

        for info in slideInfo:
            slidePath = f"ppt/slides/{info['name']}"
            if slidePath not in zf.namelist():
                continue

            # Parse slide content
            content = zf.read(slidePath).decode("utf-8")
            dom = parseXml(content)
            textContent = getTextElements(dom)

            # Calculate word count
            allText = " ".join(textContent)
            wordCount = len(allText.split()) if allText else 0
            totalWordCount += wordCount

            # Get layout name from relationship
            layoutName = _getSlideLayout(zf, info["name"], layoutMap)
            if layoutName:
                layouts.add(layoutName)

            # Check for notes
            notesPath = f"ppt/notesSlides/notesSlide{info['slideNumber']}.xml"
            hasNotes = notesPath in zf.namelist()

            # Check for media
            mediaCount = _countSlideMedia(zf, info["name"])

            if info["hidden"]:
                hiddenCount += 1

            # Create text preview (first 100 chars)
            textPreview = allText[:100] + "..." if len(allText) > 100 else allText

            slides.append(
                SlideAnalysis(
                    slideNumber=info["slideNumber"],
                    filename=info["name"],
                    hidden=info["hidden"],
                    textContent=textContent,
                    textPreview=textPreview,
                    wordCount=wordCount,
                    layoutName=layoutName,
                    hasNotes=hasNotes,
                    mediaCount=mediaCount,
                )
            )

    return DeckAnalysis(
        filename=pptxPath.name,
        slideCount=len(slides),
        hiddenCount=hiddenCount,
        totalWordCount=totalWordCount,
        layouts=sorted(layouts),
        slides=slides,
    )


def _getLayoutMap(zf: zipfile.ZipFile) -> dict[str, str]:
    """Build mapping from layout rId to layout name."""
    layoutMap = {}

    # Read layout files
    for name in zf.namelist():
        if name.startswith("ppt/slideLayouts/slideLayout") and name.endswith(".xml"):
            content = zf.read(name).decode("utf-8")
            dom = parseXml(content)

            # Get layout name from cSld element
            for cSld in dom.getElementsByTagName("p:cSld"):
                layoutName = cSld.getAttribute("name")
                if layoutName:
                    layoutMap[Path(name).stem] = layoutName
                    break

    return layoutMap


def _getSlideLayout(
    zf: zipfile.ZipFile, slideName: str, layoutMap: dict[str, str]
) -> Optional[str]:
    """Get the layout name for a slide."""
    relsPath = f"ppt/slides/_rels/{slideName}.rels"
    if relsPath not in zf.namelist():
        return None

    content = zf.read(relsPath).decode("utf-8")
    dom = parseXml(content)

    for rel in dom.getElementsByTagName("Relationship"):
        relType = rel.getAttribute("Type")
        target = rel.getAttribute("Target")
        if "slideLayout" in relType and target:
            # Extract layout filename from target (e.g., ../slideLayouts/slideLayout1.xml)
            layoutFile = Path(target).stem
            return layoutMap.get(layoutFile)

    return None


def _countSlideMedia(zf: zipfile.ZipFile, slideName: str) -> int:
    """Count media items referenced by a slide."""
    relsPath = f"ppt/slides/_rels/{slideName}.rels"
    if relsPath not in zf.namelist():
        return 0

    content = zf.read(relsPath).decode("utf-8")
    dom = parseXml(content)

    count = 0
    for rel in dom.getElementsByTagName("Relationship"):
        target = rel.getAttribute("Target")
        if target and "../media/" in target:
            count += 1

    return count


# ---------------------------------------------------------------------------
# Thumbnail Generation
# ---------------------------------------------------------------------------


def generateThumbnails(
    pptxPath: str, outputPath: str, cols: int = 3
) -> Optional[str]:
    """Generate thumbnail grid for a presentation.

    Requires LibreOffice and Poppler (pdftoppm).

    Args:
        pptxPath: Path to .pptx file
        outputPath: Output image path
        cols: Number of columns in grid

    Returns:
        Output path if successful, None otherwise
    """
    if not HAS_PIL:
        print("Warning: PIL not available, skipping thumbnails", file=sys.stderr)
        return None

    pptxPath = Path(pptxPath)
    outputPath = Path(outputPath)

    with tempfile.TemporaryDirectory() as tempDir:
        tempPath = Path(tempDir)
        pdfPath = tempPath / f"{pptxPath.stem}.pdf"

        # Convert to PDF via LibreOffice
        try:
            # Try to import soffice helper for sandboxed environments
            try:
                sys.path.insert(
                    0,
                    str(
                        Path(__file__).parent.parent.parent
                        / "pptx"
                        / "scripts"
                        / "office"
                    ),
                )
                from soffice import get_soffice_env

                env = get_soffice_env()
            except ImportError:
                import os

                env = os.environ.copy()
                env["SAL_USE_VCLPLUGIN"] = "svp"

            result = subprocess.run(
                [
                    "soffice",
                    "--headless",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    str(tempPath),
                    str(pptxPath),
                ],
                capture_output=True,
                text=True,
                env=env,
                timeout=60,
            )

            if result.returncode != 0 or not pdfPath.exists():
                print("Warning: PDF conversion failed", file=sys.stderr)
                return None

        except FileNotFoundError:
            print("Warning: LibreOffice not found, skipping thumbnails", file=sys.stderr)
            return None
        except subprocess.TimeoutExpired:
            print("Warning: PDF conversion timed out", file=sys.stderr)
            return None

        # Convert PDF to images
        try:
            result = subprocess.run(
                [
                    "pdftoppm",
                    "-jpeg",
                    "-r",
                    "100",
                    str(pdfPath),
                    str(tempPath / "slide"),
                ],
                capture_output=True,
                text=True,
                timeout=60,
            )

            if result.returncode != 0:
                print("Warning: Image conversion failed", file=sys.stderr)
                return None

        except FileNotFoundError:
            print("Warning: pdftoppm not found, skipping thumbnails", file=sys.stderr)
            return None
        except subprocess.TimeoutExpired:
            print("Warning: Image conversion timed out", file=sys.stderr)
            return None

        # Collect generated images
        slideImages = sorted(tempPath.glob("slide-*.jpg"))
        if not slideImages:
            print("Warning: No slide images generated", file=sys.stderr)
            return None

        # Create grid
        grid = _createThumbnailGrid(slideImages, cols)
        outputPath.parent.mkdir(parents=True, exist_ok=True)
        grid.save(str(outputPath), quality=95)

        return str(outputPath)


def _createThumbnailGrid(imagePaths: list[Path], cols: int = 3) -> Image.Image:
    """Create a thumbnail grid from slide images."""
    thumbWidth = 300
    padding = 20

    # Load first image to get aspect ratio
    with Image.open(imagePaths[0]) as img:
        aspect = img.height / img.width
    thumbHeight = int(thumbWidth * aspect)

    # Calculate grid dimensions
    rows = (len(imagePaths) + cols - 1) // cols
    gridWidth = cols * thumbWidth + (cols + 1) * padding
    gridHeight = rows * thumbHeight + (rows + 1) * padding

    # Create grid
    grid = Image.new("RGB", (gridWidth, gridHeight), "white")

    for i, imgPath in enumerate(imagePaths):
        row, col = i // cols, i % cols
        x = col * thumbWidth + (col + 1) * padding
        y = row * thumbHeight + (row + 1) * padding

        with Image.open(imgPath) as img:
            img.thumbnail((thumbWidth, thumbHeight), Image.Resampling.LANCZOS)
            # Center thumbnail in cell
            offsetX = (thumbWidth - img.width) // 2
            offsetY = (thumbHeight - img.height) // 2
            grid.paste(img, (x + offsetX, y + offsetY))

    return grid


# ---------------------------------------------------------------------------
# Output Formatting
# ---------------------------------------------------------------------------


def formatAnalysis(analysis: DeckAnalysis, verbose: bool = False) -> str:
    """Format analysis for display.

    Args:
        analysis: DeckAnalysis object
        verbose: If True, show full text content

    Returns:
        Formatted string
    """
    lines = [
        f"Presentation: {analysis.filename}",
        f"Slides: {analysis.slideCount} ({analysis.hiddenCount} hidden)",
        f"Total words: {analysis.totalWordCount}",
        f"Layouts: {', '.join(analysis.layouts) if analysis.layouts else 'N/A'}",
        "",
        "Slides:",
        "-" * 60,
    ]

    for slide in analysis.slides:
        hiddenStr = " [HIDDEN]" if slide.hidden else ""
        notesStr = " [notes]" if slide.hasNotes else ""
        mediaStr = f" [media: {slide.mediaCount}]" if slide.mediaCount else ""

        lines.append(
            f"  {slide.slideNumber}. {slide.filename}{hiddenStr}{notesStr}{mediaStr}"
        )
        lines.append(f"     Layout: {slide.layoutName or 'N/A'}")
        lines.append(f"     Words: {slide.wordCount}")

        if verbose:
            lines.append("     Text:")
            for text in slide.textContent:
                lines.append(f"       - {text}")
        else:
            lines.append(f"     Preview: {slide.textPreview}")

        lines.append("")

    if analysis.thumbnailPath:
        lines.append(f"Thumbnails: {analysis.thumbnailPath}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Analyze PowerPoint presentation structure and content"
    )
    parser.add_argument("input", help="Input .pptx file")
    parser.add_argument(
        "--json", "-j", action="store_true", help="Output as JSON"
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Show full text content"
    )
    parser.add_argument(
        "--thumbnails", "-t", metavar="PATH", help="Generate thumbnail grid"
    )
    parser.add_argument(
        "--cols", type=int, default=3, help="Thumbnail grid columns (default: 3)"
    )

    args = parser.parse_args()

    try:
        analysis = analyzePresentation(args.input)

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
