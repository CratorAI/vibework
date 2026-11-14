"""Analyze Word document structure and content.

Extracts paragraph info, text content, styles, tracked changes, and comments.

Usage:
    python analyze.py document.docx
    python analyze.py document.docx --json
    python analyze.py document.docx --thumbnails thumbs.jpg

CLI Examples:
    # Basic analysis
    python analyze.py doc.docx

    # JSON output
    python analyze.py doc.docx --json > analysis.json

    # With thumbnail pages
    python analyze.py doc.docx --thumbnails pages.jpg
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
    from .core import parseXml, getTextElements, extractDocumentInfo
else:
    from core import parseXml, getTextElements, extractDocumentInfo

# Check for optional thumbnail support
try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


@dataclass
class ParagraphAnalysis:
    """Analysis results for a single paragraph."""

    index: int
    text: str
    textPreview: str
    wordCount: int
    style: Optional[str] = None
    isHeading: bool = False
    hasTrackedChange: bool = False


@dataclass
class DocumentAnalysis:
    """Analysis results for a document."""

    filename: str
    paragraphCount: int
    wordCount: int
    hasTrackedChanges: bool
    hasComments: bool
    styles: list[str]
    headingCount: int
    insertionCount: int
    deletionCount: int
    commentCount: int
    paragraphs: list[ParagraphAnalysis] = field(default_factory=list)
    thumbnailPath: Optional[str] = None

    def toDict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)


# ---------------------------------------------------------------------------
# Analysis Functions
# ---------------------------------------------------------------------------


def analyzeDocument(docxPath: str) -> DocumentAnalysis:
    """Analyze a Word document.

    Args:
        docxPath: Path to .docx file

    Returns:
        DocumentAnalysis with paragraph info and content
    """
    docxPath = Path(docxPath)
    if not docxPath.exists():
        raise FileNotFoundError(f"File not found: {docxPath}")

    # Get basic info
    basicInfo = extractDocumentInfo(str(docxPath))

    # Analyze document structure
    paragraphs = []
    styles = set()
    headingCount = 0
    totalWordCount = 0
    insertionCount = 0
    deletionCount = 0
    commentCount = 0

    with zipfile.ZipFile(docxPath, "r") as zf:
        # Parse document.xml
        if "word/document.xml" in zf.namelist():
            content = zf.read("word/document.xml").decode("utf-8")
            dom = parseXml(content)

            # Count tracked changes
            insertionCount = len(dom.getElementsByTagName("w:ins"))
            deletionCount = len(dom.getElementsByTagName("w:del"))

            # Analyze each paragraph
            for i, pElem in enumerate(dom.getElementsByTagName("w:p")):
                # Get paragraph text
                texts = []
                for tElem in pElem.getElementsByTagName("w:t"):
                    if tElem.firstChild and tElem.firstChild.nodeValue:
                        texts.append(tElem.firstChild.nodeValue)
                text = "".join(texts)

                # Get style
                style = None
                isHeading = False
                for pPr in pElem.getElementsByTagName("w:pPr"):
                    for pStyle in pPr.getElementsByTagName("w:pStyle"):
                        style = pStyle.getAttribute("w:val")
                        if style:
                            styles.add(style)
                            if style.lower().startswith("heading"):
                                isHeading = True
                                headingCount += 1
                        break
                    break

                # Check for tracked changes in this paragraph
                hasTrackedChange = (
                    len(pElem.getElementsByTagName("w:ins")) > 0 or
                    len(pElem.getElementsByTagName("w:del")) > 0
                )

                # Calculate word count
                wordCount = len(text.split()) if text else 0
                totalWordCount += wordCount

                # Create text preview
                textPreview = text[:100] + "..." if len(text) > 100 else text

                paragraphs.append(
                    ParagraphAnalysis(
                        index=i,
                        text=text,
                        textPreview=textPreview,
                        wordCount=wordCount,
                        style=style,
                        isHeading=isHeading,
                        hasTrackedChange=hasTrackedChange,
                    )
                )

        # Count comments
        if "word/comments.xml" in zf.namelist():
            commentsContent = zf.read("word/comments.xml").decode("utf-8")
            commentsDom = parseXml(commentsContent)
            commentCount = len(commentsDom.getElementsByTagName("w:comment"))

    return DocumentAnalysis(
        filename=docxPath.name,
        paragraphCount=len(paragraphs),
        wordCount=totalWordCount,
        hasTrackedChanges=basicInfo["hasTrackedChanges"],
        hasComments=basicInfo["hasComments"],
        styles=sorted(styles),
        headingCount=headingCount,
        insertionCount=insertionCount,
        deletionCount=deletionCount,
        commentCount=commentCount,
        paragraphs=paragraphs,
    )


# ---------------------------------------------------------------------------
# Thumbnail Generation
# ---------------------------------------------------------------------------


def generateThumbnails(
    docxPath: str, outputPath: str, cols: int = 2
) -> Optional[str]:
    """Generate thumbnail pages for a document.

    Requires LibreOffice and Poppler (pdftoppm).

    Args:
        docxPath: Path to .docx file
        outputPath: Output image path
        cols: Number of columns in grid

    Returns:
        Output path if successful, None otherwise
    """
    if not HAS_PIL:
        print("Warning: PIL not available, skipping thumbnails", file=sys.stderr)
        return None

    docxPath = Path(docxPath)
    outputPath = Path(outputPath)

    with tempfile.TemporaryDirectory() as tempDir:
        tempPath = Path(tempDir)
        pdfPath = tempPath / f"{docxPath.stem}.pdf"

        # Convert to PDF via LibreOffice
        try:
            # Try to import soffice helper for sandboxed environments
            try:
                from office.soffice import get_soffice_env
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
                    str(docxPath),
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
                    str(tempPath / "page"),
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
        pageImages = sorted(tempPath.glob("page-*.jpg"))
        if not pageImages:
            print("Warning: No page images generated", file=sys.stderr)
            return None

        # Create grid
        grid = _createThumbnailGrid(pageImages, cols)
        outputPath.parent.mkdir(parents=True, exist_ok=True)
        grid.save(str(outputPath), quality=95)

        return str(outputPath)


def _createThumbnailGrid(imagePaths: list[Path], cols: int = 2) -> Image.Image:
    """Create a thumbnail grid from page images."""
    thumbWidth = 400
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
        f"Paragraphs: {analysis.paragraphCount}",
        f"Words: {analysis.wordCount}",
        f"Headings: {analysis.headingCount}",
        "",
        f"Tracked Changes: {'Yes' if analysis.hasTrackedChanges else 'No'}",
    ]

    if analysis.hasTrackedChanges:
        lines.append(f"  Insertions: {analysis.insertionCount}")
        lines.append(f"  Deletions: {analysis.deletionCount}")

    lines.append(f"Comments: {analysis.commentCount}")
    lines.append(f"Styles: {', '.join(analysis.styles) if analysis.styles else 'None'}")
    lines.append("")
    lines.append("Paragraphs:")
    lines.append("-" * 60)

    for para in analysis.paragraphs:
        styleStr = f" [{para.style}]" if para.style else ""
        changeStr = " [CHANGED]" if para.hasTrackedChange else ""

        lines.append(f"  {para.index}. {styleStr}{changeStr}")
        lines.append(f"     Words: {para.wordCount}")

        if verbose:
            lines.append(f"     Text: {para.text}")
        else:
            lines.append(f"     Preview: {para.textPreview}")

        lines.append("")

    if analysis.thumbnailPath:
        lines.append(f"Thumbnails: {analysis.thumbnailPath}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Analyze Word document structure and content"
    )
    parser.add_argument("input", help="Input .docx file")
    parser.add_argument(
        "--json", "-j", action="store_true", help="Output as JSON"
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Show full text content"
    )
    parser.add_argument(
        "--thumbnails", "-t", metavar="PATH", help="Generate thumbnail pages"
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
