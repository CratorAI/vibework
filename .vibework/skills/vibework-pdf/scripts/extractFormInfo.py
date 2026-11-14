"""Extract fillable form field information from a PDF.

Usage:
    python extractFormInfo.py document.pdf field_info.json

Output:
    Creates a JSON file with field information.
"""

import json
import sys
from typing import Optional

from pypdf import PdfReader


def getFullAnnotationFieldId(annotation) -> Optional[str]:
    """Get the full field ID from an annotation.

    Builds the field ID by walking up the parent chain.
    """
    components = []
    while annotation:
        fieldName = annotation.get("/T")
        if fieldName:
            components.append(fieldName)
        annotation = annotation.get("/Parent")
    return ".".join(reversed(components)) if components else None


def makeFieldDict(field, fieldId: str) -> dict:
    """Create a field info dict from a field object."""
    fieldDict = {"field_id": fieldId}

    ft = field.get("/FT")
    if ft == "/Tx":
        fieldDict["type"] = "text"
    elif ft == "/Btn":
        fieldDict["type"] = "checkbox"
        states = field.get("/_States_", [])
        if len(states) == 2:
            if "/Off" in states:
                fieldDict["checked_value"] = (
                    states[0] if states[0] != "/Off" else states[1]
                )
                fieldDict["unchecked_value"] = "/Off"
            else:
                print(
                    f"Unexpected state values for checkbox `{fieldId}`. "
                    "Checked/unchecked values may not be correct."
                )
                fieldDict["checked_value"] = states[0]
                fieldDict["unchecked_value"] = states[1]
    elif ft == "/Ch":
        fieldDict["type"] = "choice"
        states = field.get("/_States_", [])
        fieldDict["choice_options"] = [
            {"value": state[0], "text": state[1]} for state in states
        ]
    else:
        fieldDict["type"] = f"unknown ({ft})"

    return fieldDict


def getFieldInfo(reader: PdfReader) -> list[dict]:
    """Get field information from a PDF.

    Returns:
        List of field info dicts with field_id, page, type, rect, etc.
    """
    fields = reader.get_fields()

    fieldInfoById = {}
    possibleRadioNames = set()

    for fieldId, field in fields.items():
        # Skip container fields with children (except radio button groups)
        if field.get("/Kids"):
            if field.get("/FT") == "/Btn":
                possibleRadioNames.add(fieldId)
            continue
        fieldInfoById[fieldId] = makeFieldDict(field, fieldId)

    # Get bounding rects from page annotations
    radioFieldsById = {}

    for pageIndex, page in enumerate(reader.pages):
        annotations = page.get("/Annots", [])
        for ann in annotations:
            fieldId = getFullAnnotationFieldId(ann)
            if fieldId in fieldInfoById:
                fieldInfoById[fieldId]["page"] = pageIndex + 1
                fieldInfoById[fieldId]["rect"] = ann.get("/Rect")
            elif fieldId in possibleRadioNames:
                try:
                    onValues = [v for v in ann["/AP"]["/N"] if v != "/Off"]
                except KeyError:
                    continue
                if len(onValues) == 1:
                    rect = ann.get("/Rect")
                    if fieldId not in radioFieldsById:
                        radioFieldsById[fieldId] = {
                            "field_id": fieldId,
                            "type": "radio_group",
                            "page": pageIndex + 1,
                            "radio_options": [],
                        }
                    radioFieldsById[fieldId]["radio_options"].append({
                        "value": onValues[0],
                        "rect": rect,
                    })

    # Filter out fields without location
    fieldsWithLocation = []
    for fieldInfo in fieldInfoById.values():
        if "page" in fieldInfo:
            fieldsWithLocation.append(fieldInfo)
        else:
            print(
                f"Unable to determine location for field id: "
                f"{fieldInfo.get('field_id')}, ignoring"
            )

    # Sort by page number, then Y position (flipped), then X
    def sortKey(f):
        if "radio_options" in f:
            rect = f["radio_options"][0]["rect"] or [0, 0, 0, 0]
        else:
            rect = f.get("rect") or [0, 0, 0, 0]
        adjustedPosition = [-rect[1], rect[0]]
        return [f.get("page"), adjustedPosition]

    sortedFields = fieldsWithLocation + list(radioFieldsById.values())
    sortedFields.sort(key=sortKey)

    return sortedFields


def writeFieldInfo(pdfPath: str, jsonOutputPath: str) -> None:
    """Write field info to a JSON file.

    Args:
        pdfPath: Path to PDF file
        jsonOutputPath: Path to output JSON file
    """
    reader = PdfReader(pdfPath)
    fieldInfo = getFieldInfo(reader)

    with open(jsonOutputPath, "w") as f:
        json.dump(fieldInfo, f, indent=2)

    print(f"Wrote {len(fieldInfo)} fields to {jsonOutputPath}")


def main():
    if len(sys.argv) != 3:
        print("Usage: python extractFormInfo.py <input.pdf> <output.json>")
        sys.exit(1)

    pdfPath = sys.argv[1]
    jsonPath = sys.argv[2]

    try:
        writeFieldInfo(pdfPath, jsonPath)
    except FileNotFoundError:
        print(f"Error: File not found: {pdfPath}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
