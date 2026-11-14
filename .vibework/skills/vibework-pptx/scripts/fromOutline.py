#!/usr/bin/env python3
"""Generate PowerPoint presentations from Markdown outlines.

Converts a structured Markdown document into a presentation using pptxgenjs.

Usage:
    python fromOutline.py outline.md output.pptx
    python fromOutline.py outline.md output.pptx --template corporate

CLI Examples:
    # Basic generation
    python fromOutline.py content.md presentation.pptx

    # With template
    python fromOutline.py content.md presentation.pptx --template dark

    # Preview structure without generating
    python fromOutline.py content.md --preview
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Data Classes
# ---------------------------------------------------------------------------


@dataclass
class SlideContent:
    """Content for a single slide."""

    title: str
    bullets: list[str] = field(default_factory=list)
    body: Optional[str] = None
    notes: Optional[str] = None
    layout: str = "title_and_content"  # title_only, title_and_content, blank


@dataclass
class Outline:
    """Parsed outline structure."""

    title: Optional[str] = None
    subtitle: Optional[str] = None
    slides: list[SlideContent] = field(default_factory=list)


@dataclass
class Template:
    """Presentation template configuration."""

    name: str
    titleFont: str = "Arial"
    bodyFont: str = "Calibri"
    titleSize: int = 36
    bodySize: int = 18
    titleColor: str = "000000"
    bodyColor: str = "333333"
    backgroundColor: str = "FFFFFF"
    accentColor: str = "0066CC"


# Built-in templates
TEMPLATES = {
    "minimal": Template(
        name="minimal",
        titleFont="Arial",
        bodyFont="Calibri",
        titleSize=36,
        bodySize=18,
        titleColor="000000",
        bodyColor="333333",
        backgroundColor="FFFFFF",
        accentColor="0066CC",
    ),
    "corporate": Template(
        name="corporate",
        titleFont="Arial",
        bodyFont="Arial",
        titleSize=32,
        bodySize=16,
        titleColor="1a365d",
        bodyColor="2d3748",
        backgroundColor="FFFFFF",
        accentColor="2b6cb0",
    ),
    "dark": Template(
        name="dark",
        titleFont="Arial",
        bodyFont="Calibri",
        titleSize=36,
        bodySize=18,
        titleColor="FFFFFF",
        bodyColor="E0E0E0",
        backgroundColor="1a1a2e",
        accentColor="4da6ff",
    ),
}


# ---------------------------------------------------------------------------
# Parsing Functions
# ---------------------------------------------------------------------------


def parseOutline(content: str) -> Outline:
    """Parse Markdown content into an Outline structure.

    Markdown Format:
        # Presentation Title

        Subtitle text (optional, first paragraph after title)

        ## Slide Title
        - Bullet point one
        - Bullet point two

        Paragraph content becomes body text.

        > Speaker notes go in blockquotes

    Args:
        content: Markdown string

    Returns:
        Outline object
    """
    outline = Outline()
    lines = content.strip().split("\n")
    currentSlide: Optional[SlideContent] = None
    inNotes = False
    bodyLines: list[str] = []

    for line in lines:
        stripped = line.strip()

        # Title (# Header)
        if stripped.startswith("# ") and not stripped.startswith("## "):
            outline.title = stripped[2:].strip()
            continue

        # Slide header (## Header)
        if stripped.startswith("## "):
            # Save previous slide
            if currentSlide is not None:
                if bodyLines:
                    currentSlide.body = "\n".join(bodyLines).strip()
                outline.slides.append(currentSlide)

            # Start new slide
            currentSlide = SlideContent(title=stripped[3:].strip())
            bodyLines = []
            inNotes = False
            continue

        # Notes (> blockquote)
        if stripped.startswith("> "):
            if currentSlide is not None:
                noteLine = stripped[2:].strip()
                if currentSlide.notes:
                    currentSlide.notes += "\n" + noteLine
                else:
                    currentSlide.notes = noteLine
            inNotes = True
            continue

        # Bullet point (- or *)
        if stripped.startswith("- ") or stripped.startswith("* "):
            if currentSlide is not None:
                bulletText = stripped[2:].strip()
                currentSlide.bullets.append(bulletText)
            inNotes = False
            continue

        # Subtitle (first paragraph after title, before any slide)
        if currentSlide is None and stripped and outline.title:
            if not outline.subtitle:
                outline.subtitle = stripped
            continue

        # Body text
        if currentSlide is not None and stripped and not inNotes:
            bodyLines.append(stripped)

    # Save last slide
    if currentSlide is not None:
        if bodyLines:
            currentSlide.body = "\n".join(bodyLines).strip()
        outline.slides.append(currentSlide)

    return outline


def loadTemplate(name: str) -> Template:
    """Load a template by name.

    Args:
        name: Template name or path to JSON file

    Returns:
        Template object
    """
    # Check built-in templates
    if name in TEMPLATES:
        return TEMPLATES[name]

    # Try loading from file
    templatePath = Path(name)
    if templatePath.exists():
        data = json.loads(templatePath.read_text())
        return Template(**data)

    # Check templates directory
    templatesDir = Path(__file__).parent.parent / "templates"
    jsonPath = templatesDir / f"{name}.json"
    if jsonPath.exists():
        data = json.loads(jsonPath.read_text())
        return Template(**data)

    raise ValueError(f"Unknown template: {name}")


# ---------------------------------------------------------------------------
# Generation Functions
# ---------------------------------------------------------------------------


def generatePresentation(
    outline: Outline,
    outputPath: str,
    template: Template = TEMPLATES["minimal"],
) -> str:
    """Generate a PowerPoint presentation from an outline.

    Uses pptxgenjs via Node.js for generation.

    Args:
        outline: Parsed outline structure
        outputPath: Output .pptx path
        template: Template configuration

    Returns:
        Path to generated file

    Raises:
        RuntimeError: If generation fails
    """
    outputPath = Path(outputPath).resolve()

    # Build pptxgenjs script
    script = _buildGeneratorScript(outline, str(outputPath), template)

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
                [str(bunPath), "x", "pptxgenjs", str(scriptPath)],
                capture_output=True,
                text=True,
                cwd=tempDir,
                timeout=60,
            )

            # pptxgenjs doesn't work via npx, run the script directly
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


def _buildGeneratorScript(outline: Outline, outputPath: str, template: Template) -> str:
    """Build JavaScript code for pptxgenjs generation."""
    # Escape strings for JavaScript
    def escape(s: str) -> str:
        if s is None:
            return ""
        return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")

    slides_js = []

    # Title slide
    if outline.title:
        title_slide = f'''
  // Title Slide
  let titleSlide = pptx.addSlide();
  titleSlide.addText("{escape(outline.title)}", {{
    x: 0.5,
    y: "40%",
    w: "90%",
    h: 1,
    fontSize: {template.titleSize + 8},
    fontFace: "{template.titleFont}",
    color: "{template.titleColor}",
    align: "center",
    bold: true
  }});'''

        if outline.subtitle:
            title_slide += f'''
  titleSlide.addText("{escape(outline.subtitle)}", {{
    x: 0.5,
    y: "55%",
    w: "90%",
    h: 0.5,
    fontSize: {template.bodySize + 2},
    fontFace: "{template.bodyFont}",
    color: "{template.bodyColor}",
    align: "center"
  }});'''

        slides_js.append(title_slide)

    # Content slides
    for i, slide in enumerate(outline.slides):
        slide_js = f'''
  // Slide {i + 2}: {escape(slide.title)}
  let slide{i + 2} = pptx.addSlide();
  slide{i + 2}.addText("{escape(slide.title)}", {{
    x: 0.5,
    y: 0.5,
    w: "90%",
    h: 0.8,
    fontSize: {template.titleSize},
    fontFace: "{template.titleFont}",
    color: "{template.titleColor}",
    bold: true
  }});'''

        # Add bullets
        if slide.bullets:
            bullets_data = ", ".join(
                f'{{ text: "{escape(b)}", options: {{ bullet: true }} }}'
                for b in slide.bullets
            )
            slide_js += f'''
  slide{i + 2}.addText([{bullets_data}], {{
    x: 0.5,
    y: 1.5,
    w: "90%",
    h: 4,
    fontSize: {template.bodySize},
    fontFace: "{template.bodyFont}",
    color: "{template.bodyColor}",
    valign: "top"
  }});'''

        # Add body text
        elif slide.body:
            slide_js += f'''
  slide{i + 2}.addText("{escape(slide.body)}", {{
    x: 0.5,
    y: 1.5,
    w: "90%",
    h: 4,
    fontSize: {template.bodySize},
    fontFace: "{template.bodyFont}",
    color: "{template.bodyColor}",
    valign: "top"
  }});'''

        # Add notes
        if slide.notes:
            slide_js += f'''
  slide{i + 2}.addNotes("{escape(slide.notes)}");'''

        slides_js.append(slide_js)

    slides_code = "\n".join(slides_js)

    return f'''const PptxGenJS = require("pptxgenjs");

async function generate() {{
  let pptx = new PptxGenJS();

  // Set presentation properties
  pptx.layout = "LAYOUT_16x9";
  pptx.title = "{escape(outline.title or 'Presentation')}";

  // Set background color for all slides
  pptx.defineSlideMaster({{
    title: "MAIN",
    background: {{ color: "{template.backgroundColor}" }}
  }});

{slides_code}

  // Save presentation
  await pptx.writeFile({{ fileName: "{escape(outputPath)}" }});
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
        if outline.subtitle:
            lines.append(f"Subtitle: {outline.subtitle}")
        lines.append("")

    lines.append(f"Slides: {len(outline.slides)}")
    lines.append("-" * 40)

    for i, slide in enumerate(outline.slides, 1):
        lines.append(f"\n{i}. {slide.title}")
        if slide.bullets:
            for bullet in slide.bullets:
                lines.append(f"   • {bullet}")
        if slide.body:
            preview = slide.body[:80] + "..." if len(slide.body) > 80 else slide.body
            lines.append(f"   [Body: {preview}]")
        if slide.notes:
            preview = slide.notes[:50] + "..." if len(slide.notes) > 50 else slide.notes
            lines.append(f"   [Notes: {preview}]")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Generate PowerPoint from Markdown outline"
    )
    parser.add_argument("input", help="Input Markdown file")
    parser.add_argument("output", nargs="?", help="Output .pptx file")
    parser.add_argument(
        "--template",
        "-t",
        default="minimal",
        help="Template name or JSON file (default: minimal)",
    )
    parser.add_argument(
        "--preview",
        "-p",
        action="store_true",
        help="Preview structure without generating",
    )
    parser.add_argument(
        "--list-templates",
        action="store_true",
        help="List available templates",
    )

    args = parser.parse_args()

    if args.list_templates:
        print("Available templates:")
        for name in TEMPLATES:
            t = TEMPLATES[name]
            print(f"  {name}: {t.titleFont}/{t.bodyFont}, bg={t.backgroundColor}")
        sys.exit(0)

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

    # Load template
    try:
        template = loadTemplate(args.template)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    # Generate presentation
    try:
        outputPath = generatePresentation(outline, args.output, template)
        print(f"Generated: {outputPath}")
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
