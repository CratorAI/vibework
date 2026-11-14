"""Generate Word documents from Markdown outlines.

Converts a structured Markdown document into a DOCX using docx-js (JavaScript).

Usage:
    python fromOutline.py outline.md output.docx
    python fromOutline.py outline.md --preview

CLI Examples:
    # Basic generation
    python fromOutline.py content.md document.docx

    # Preview structure without generating
    python fromOutline.py content.md --preview
"""

import argparse
import json
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


# ---------------------------------------------------------------------------
# Data Classes
# ---------------------------------------------------------------------------


@dataclass
class Section:
    """Content for a section (heading + paragraphs)."""

    heading: str
    level: int  # 1 = H1, 2 = H2, etc.
    paragraphs: list[str] = field(default_factory=list)
    bullets: list[str] = field(default_factory=list)


@dataclass
class Outline:
    """Parsed outline structure."""

    title: Optional[str] = None
    sections: list[Section] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Parsing Functions
# ---------------------------------------------------------------------------


def parseOutline(content: str) -> Outline:
    """Parse Markdown content into an Outline structure.

    Markdown Format:
        # Document Title

        ## Section Heading
        Paragraph content.

        - Bullet point one
        - Bullet point two

        ### Subsection
        More content.

    Args:
        content: Markdown string

    Returns:
        Outline object
    """
    outline = Outline()
    lines = content.strip().split("\n")
    currentSection: Optional[Section] = None
    paragraphLines: list[str] = []

    def flushParagraph():
        nonlocal paragraphLines
        if paragraphLines and currentSection is not None:
            text = " ".join(paragraphLines).strip()
            if text:
                currentSection.paragraphs.append(text)
            paragraphLines = []

    for line in lines:
        stripped = line.strip()

        # Title (# Header) - only first one
        if stripped.startswith("# ") and not stripped.startswith("## "):
            if outline.title is None:
                outline.title = stripped[2:].strip()
            continue

        # Heading (## or ### or ####)
        if stripped.startswith("#"):
            flushParagraph()

            # Count heading level
            level = 0
            for char in stripped:
                if char == "#":
                    level += 1
                else:
                    break

            headingText = stripped[level:].strip()

            # Save previous section
            if currentSection is not None:
                outline.sections.append(currentSection)

            # Start new section
            currentSection = Section(heading=headingText, level=level)
            continue

        # Bullet point (- or *)
        if stripped.startswith("- ") or stripped.startswith("* "):
            flushParagraph()
            if currentSection is not None:
                bulletText = stripped[2:].strip()
                currentSection.bullets.append(bulletText)
            continue

        # Empty line - flush paragraph
        if not stripped:
            flushParagraph()
            continue

        # Regular text - accumulate for paragraph
        paragraphLines.append(stripped)

    # Flush final paragraph and section
    flushParagraph()
    if currentSection is not None:
        outline.sections.append(currentSection)

    return outline


# ---------------------------------------------------------------------------
# Generation Functions
# ---------------------------------------------------------------------------


def generateDocument(outline: Outline, outputPath: str) -> str:
    """Generate a Word document from an outline.

    Uses docx-js via bun for generation.

    Args:
        outline: Parsed outline structure
        outputPath: Output .docx path

    Returns:
        Path to generated file

    Raises:
        RuntimeError: If generation fails
    """
    outputPath = Path(outputPath).resolve()

    # Build docx-js script
    script = _buildGeneratorScript(outline, str(outputPath))

    with tempfile.TemporaryDirectory() as tempDir:
        scriptPath = Path(tempDir) / "generate.js"
        scriptPath.write_text(script)

        # Get bun path from environment or use bundled
        scriptsDir = Path(__file__).parent.parent.parent.parent / "scripts"
        bunPath = scriptsDir / "bun"
        if not bunPath.exists():
            bunPath = "bun"  # Fall back to system bun

        # Run generator
        try:
            result = subprocess.run(
                [str(bunPath), str(scriptPath)],
                capture_output=True,
                text=True,
                cwd=tempDir,
                timeout=60,
            )

            if result.returncode != 0:
                raise RuntimeError(
                    f"Generation failed: {result.stderr or result.stdout}"
                )

        except FileNotFoundError:
            raise RuntimeError(
                "bun not found. Install with: curl -fsSL https://bun.sh/install | bash"
            )
        except subprocess.TimeoutExpired:
            raise RuntimeError("Generation timed out")

    if not outputPath.exists():
        raise RuntimeError("Generation failed: output file not created")

    return str(outputPath)


def _buildGeneratorScript(outline: Outline, outputPath: str) -> str:
    """Build JavaScript code for docx-js generation."""
    # Escape strings for JavaScript
    def escape(s: str) -> str:
        if s is None:
            return ""
        return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")

    children_js = []

    # Title
    if outline.title:
        children_js.append(f'''
    new Paragraph({{
      heading: HeadingLevel.TITLE,
      children: [new TextRun({{ text: "{escape(outline.title)}", bold: true }})]
    }})''')

    # Sections
    for section in outline.sections:
        # Heading
        headingLevel = min(section.level, 6)  # Max heading level 6
        headingEnum = f"HEADING_{headingLevel}"

        children_js.append(f'''
    new Paragraph({{
      heading: HeadingLevel.{headingEnum},
      children: [new TextRun({{ text: "{escape(section.heading)}", bold: true }})]
    }})''')

        # Paragraphs
        for para in section.paragraphs:
            children_js.append(f'''
    new Paragraph({{
      children: [new TextRun("{escape(para)}")]
    }})''')

        # Bullets
        for bullet in section.bullets:
            children_js.append(f'''
    new Paragraph({{
      numbering: {{ reference: "bullets", level: 0 }},
      children: [new TextRun("{escape(bullet)}")]
    }})''')

    children_code = ",".join(children_js)

    return f'''const {{ Document, Packer, Paragraph, TextRun, HeadingLevel, LevelFormat, AlignmentType }} = require("docx");
const fs = require("fs");

async function generate() {{
  const doc = new Document({{
    numbering: {{
      config: [{{
        reference: "bullets",
        levels: [{{
          level: 0,
          format: LevelFormat.BULLET,
          text: "•",
          alignment: AlignmentType.LEFT,
          style: {{ paragraph: {{ indent: {{ left: 720, hanging: 360 }} }} }}
        }}]
      }}]
    }},
    sections: [{{
      properties: {{
        page: {{
          size: {{ width: 12240, height: 15840 }},
          margin: {{ top: 1440, right: 1440, bottom: 1440, left: 1440 }}
        }}
      }},
      children: [{children_code}
      ]
    }}]
  }});

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync("{escape(outputPath)}", buffer);
  console.log("Generated: {escape(outputPath)}");
}}

generate().catch(err => {{
  console.error(err);
  process.exit(1);
}});
'''


# ---------------------------------------------------------------------------
# Preview Functions
# ---------------------------------------------------------------------------


def previewOutline(outline: Outline) -> str:
    """Format outline structure for preview."""
    lines = []

    if outline.title:
        lines.append(f"Title: {outline.title}")
        lines.append("")

    lines.append(f"Sections: {len(outline.sections)}")
    lines.append("-" * 40)

    for i, section in enumerate(outline.sections, 1):
        indent = "  " * (section.level - 1)
        lines.append(f"\n{indent}{'#' * section.level} {section.heading}")

        for para in section.paragraphs:
            preview = para[:80] + "..." if len(para) > 80 else para
            lines.append(f"{indent}  [Paragraph: {preview}]")

        for bullet in section.bullets:
            lines.append(f"{indent}  - {bullet}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Generate Word document from Markdown outline"
    )
    parser.add_argument("input", help="Input Markdown file")
    parser.add_argument("output", nargs="?", help="Output .docx file")
    parser.add_argument(
        "--preview",
        "-p",
        action="store_true",
        help="Preview structure without generating",
    )

    args = parser.parse_args()

    # Read and parse input
    try:
        content = Path(args.input).read_text()
    except FileNotFoundError:
        print(f"Error: File not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    outline = parseOutline(content)

    if args.preview:
        print(previewOutline(outline))
        sys.exit(0)

    if not args.output:
        print("Error: Output file required (or use --preview)", file=sys.stderr)
        sys.exit(1)

    # Generate document
    try:
        outputPath = generateDocument(outline, args.output)
        print(f"Generated: {outputPath}")
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
