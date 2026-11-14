"""Fill a PDF by adding text annotations.

Use this for PDFs without fillable form fields.

Usage:
    python fillAnnotations.py input.pdf fields.json output.pdf

The fields.json should have this structure:
{
  "pages": [
    {"page_number": 1, "pdf_width": 612, "pdf_height": 792}
    // or for image coordinates:
    {"page_number": 1, "image_width": 1700, "image_height": 2200}
  ],
  "form_fields": [
    {
      "page_number": 1,
      "description": "Last name entry field",
      "field_label": "Last Name",
      "label_bounding_box": [x0, y0, x1, y1],
      "entry_bounding_box": [x0, y0, x1, y1],
      "entry_text": {"text": "Smith", "font_size": 10}
    }
  ]
}
"""

import json
import sys

from pypdf import PdfReader, PdfWriter
from pypdf.annotations import FreeText


def transformFromImageCoords(
    bbox: list, imageWidth: float, imageHeight: float, pdfWidth: float, pdfHeight: float
) -> tuple:
    """Transform bounding box from image coordinates to PDF coordinates.

    Image coordinates: origin at top-left, y increases downward
    PDF coordinates: origin at bottom-left, y increases upward
    """
    xScale = pdfWidth / imageWidth
    yScale = pdfHeight / imageHeight

    left = bbox[0] * xScale
    right = bbox[2] * xScale

    # Flip Y coordinates for PDF
    top = pdfHeight - (bbox[1] * yScale)
    bottom = pdfHeight - (bbox[3] * yScale)

    return left, bottom, right, top


def transformFromPdfCoords(bbox: list, pdfHeight: float) -> tuple:
    """Transform bounding box from pdfplumber coordinates to pypdf coordinates.

    pdfplumber uses y=0 at top, y increases downward (like images).
    pypdf FreeText expects y=0 at bottom, y increases upward.
    Both use the same scale (PDF points), so only Y needs flipping.
    """
    left = bbox[0]
    right = bbox[2]

    # bbox is [left, top, right, bottom] where top < bottom (y=0 at top)
    # pypdf wants [left, bottom, right, top] where bottom < top (y=0 at bottom)
    pypdfTop = pdfHeight - bbox[1]
    pypdfBottom = pdfHeight - bbox[3]

    return left, pypdfBottom, right, pypdfTop


def fillPdfForm(inputPdfPath: str, fieldsJsonPath: str, outputPdfPath: str) -> None:
    """Fill PDF form with text annotations.

    Args:
        inputPdfPath: Path to input PDF
        fieldsJsonPath: Path to fields JSON file
        outputPdfPath: Path to output PDF
    """
    with open(fieldsJsonPath, "r") as f:
        fieldsData = json.load(f)

    reader = PdfReader(inputPdfPath)
    writer = PdfWriter()

    # Copy all pages to writer
    writer.append(reader)

    # Get PDF dimensions for each page
    pdfDimensions = {}
    for i, page in enumerate(reader.pages):
        mediabox = page.mediabox
        pdfDimensions[i + 1] = [mediabox.width, mediabox.height]

    # Process each form field
    annotations = []
    for field in fieldsData["form_fields"]:
        pageNum = field["page_number"]

        # Get page dimensions and transform coordinates
        pageInfo = next(
            p for p in fieldsData["pages"] if p["page_number"] == pageNum
        )
        pdfWidth, pdfHeight = pdfDimensions[pageNum]

        # Detect coordinate system
        if "pdf_width" in pageInfo:
            # PDF coordinates (pdfplumber style) - only Y flip
            transformedEntryBox = transformFromPdfCoords(
                field["entry_bounding_box"], float(pdfHeight)
            )
        else:
            # Image coordinates - scaling and Y flip
            imageWidth = pageInfo["image_width"]
            imageHeight = pageInfo["image_height"]
            transformedEntryBox = transformFromImageCoords(
                field["entry_bounding_box"],
                imageWidth,
                imageHeight,
                float(pdfWidth),
                float(pdfHeight),
            )

        # Skip empty fields
        if "entry_text" not in field or "text" not in field["entry_text"]:
            continue

        entryText = field["entry_text"]
        text = entryText["text"]
        if not text:
            continue

        fontName = entryText.get("font", "Arial")
        fontSize = str(entryText.get("font_size", 14)) + "pt"
        fontColor = entryText.get("font_color", "000000")

        annotation = FreeText(
            text=text,
            rect=transformedEntryBox,
            font=fontName,
            font_size=fontSize,
            font_color=fontColor,
            border_color=None,
            background_color=None,
        )
        annotations.append(annotation)
        # page_number is 0-based for pypdf
        writer.add_annotation(page_number=pageNum - 1, annotation=annotation)

    # Save the filled PDF
    with open(outputPdfPath, "wb") as output:
        writer.write(output)

    print(f"Successfully filled PDF form and saved to {outputPdfPath}")
    print(f"Added {len(annotations)} text annotations")


def main():
    if len(sys.argv) != 4:
        print("Usage: python fillAnnotations.py <input.pdf> <fields.json> <output.pdf>")
        sys.exit(1)

    inputPdf = sys.argv[1]
    fieldsJson = sys.argv[2]
    outputPdf = sys.argv[3]

    try:
        fillPdfForm(inputPdf, fieldsJson, outputPdf)
    except FileNotFoundError as e:
        print(f"Error: File not found: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
