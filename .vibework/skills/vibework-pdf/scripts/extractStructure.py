"""Extract form structure from a non-fillable PDF.

Analyzes the PDF to find:
- Text labels with their exact coordinates
- Horizontal lines (row boundaries)
- Checkboxes (small rectangles)

Usage:
    python extractStructure.py document.pdf structure.json

Output:
    Creates a JSON file with form structure for generating field coordinates.
"""

import json
import sys
from pathlib import Path

import pdfplumber


def extractFormStructure(pdfPath: str) -> dict:
    """Extract structural elements from a PDF form.

    Args:
        pdfPath: Path to PDF file

    Returns:
        Dict with pages, labels, lines, checkboxes, and row_boundaries
    """
    structure = {
        "pages": [],
        "labels": [],
        "lines": [],
        "checkboxes": [],
        "row_boundaries": [],
    }

    with pdfplumber.open(pdfPath) as pdf:
        for pageNum, page in enumerate(pdf.pages, 1):
            # Page info
            structure["pages"].append({
                "page_number": pageNum,
                "width": float(page.width),
                "height": float(page.height),
            })

            # Extract text labels with positions
            words = page.extract_words()
            for word in words:
                structure["labels"].append({
                    "page": pageNum,
                    "text": word["text"],
                    "x0": round(float(word["x0"]), 1),
                    "top": round(float(word["top"]), 1),
                    "x1": round(float(word["x1"]), 1),
                    "bottom": round(float(word["bottom"]), 1),
                })

            # Extract horizontal lines (row separators)
            for line in page.lines:
                # Only include lines that span most of page width
                if abs(float(line["x1"]) - float(line["x0"])) > page.width * 0.5:
                    structure["lines"].append({
                        "page": pageNum,
                        "y": round(float(line["top"]), 1),
                        "x0": round(float(line["x0"]), 1),
                        "x1": round(float(line["x1"]), 1),
                    })

            # Extract checkboxes (small square rectangles)
            for rect in page.rects:
                width = float(rect["x1"]) - float(rect["x0"])
                height = float(rect["bottom"]) - float(rect["top"])
                # Checkboxes are typically 5-15 points square
                if 5 <= width <= 15 and 5 <= height <= 15 and abs(width - height) < 2:
                    structure["checkboxes"].append({
                        "page": pageNum,
                        "x0": round(float(rect["x0"]), 1),
                        "top": round(float(rect["top"]), 1),
                        "x1": round(float(rect["x1"]), 1),
                        "bottom": round(float(rect["bottom"]), 1),
                        "center_x": round(
                            (float(rect["x0"]) + float(rect["x1"])) / 2, 1
                        ),
                        "center_y": round(
                            (float(rect["top"]) + float(rect["bottom"])) / 2, 1
                        ),
                    })

    # Calculate row boundaries from horizontal lines
    linesByPage = {}
    for line in structure["lines"]:
        page = line["page"]
        if page not in linesByPage:
            linesByPage[page] = []
        linesByPage[page].append(line["y"])

    for page, yCoords in linesByPage.items():
        yCoords = sorted(set(yCoords))
        for i in range(len(yCoords) - 1):
            structure["row_boundaries"].append({
                "page": page,
                "row_top": yCoords[i],
                "row_bottom": yCoords[i + 1],
                "row_height": round(yCoords[i + 1] - yCoords[i], 1),
            })

    return structure


def main():
    if len(sys.argv) != 3:
        print("Usage: python extractStructure.py <input.pdf> <output.json>")
        sys.exit(1)

    pdfPath = sys.argv[1]
    outputPath = sys.argv[2]

    try:
        print(f"Extracting structure from {pdfPath}...")
        structure = extractFormStructure(pdfPath)

        with open(outputPath, "w") as f:
            json.dump(structure, f, indent=2)

        print(f"Found:")
        print(f"  - {len(structure['pages'])} pages")
        print(f"  - {len(structure['labels'])} text labels")
        print(f"  - {len(structure['lines'])} horizontal lines")
        print(f"  - {len(structure['checkboxes'])} checkboxes")
        print(f"  - {len(structure['row_boundaries'])} row boundaries")
        print(f"Saved to {outputPath}")

    except FileNotFoundError:
        print(f"Error: File not found: {pdfPath}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
