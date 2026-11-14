"""Check bounding boxes in fields.json for errors.

Validates:
- Intersecting bounding boxes (which would cause overlapping text)
- Entry boxes that are too small for the specified font size

Usage:
    python checkBoundingBoxes.py fields.json
"""

import json
import sys
from dataclasses import dataclass


@dataclass
class RectAndField:
    """A rectangle and its associated field."""

    rect: list[float]
    rectType: str
    field: dict


def rectsIntersect(r1: list, r2: list) -> bool:
    """Check if two rectangles intersect."""
    disjointHorizontal = r1[0] >= r2[2] or r1[2] <= r2[0]
    disjointVertical = r1[1] >= r2[3] or r1[3] <= r2[1]
    return not (disjointHorizontal or disjointVertical)


def getBoundingBoxMessages(fieldsJsonStream) -> list[str]:
    """Check bounding boxes for errors.

    Args:
        fieldsJsonStream: File-like object with fields.json content

    Returns:
        List of messages (errors or success)
    """
    messages = []
    fields = json.load(fieldsJsonStream)
    messages.append(f"Read {len(fields['form_fields'])} fields")

    rectsAndFields = []
    for f in fields["form_fields"]:
        rectsAndFields.append(RectAndField(f["label_bounding_box"], "label", f))
        rectsAndFields.append(RectAndField(f["entry_bounding_box"], "entry", f))

    hasError = False

    for i, ri in enumerate(rectsAndFields):
        # Check for intersections (O(N^2) but fine for typical form sizes)
        for j in range(i + 1, len(rectsAndFields)):
            rj = rectsAndFields[j]
            if (
                ri.field["page_number"] == rj.field["page_number"]
                and rectsIntersect(ri.rect, rj.rect)
            ):
                hasError = True
                if ri.field is rj.field:
                    messages.append(
                        f"FAILURE: intersection between label and entry bounding boxes "
                        f"for `{ri.field['description']}` ({ri.rect}, {rj.rect})"
                    )
                else:
                    messages.append(
                        f"FAILURE: intersection between {ri.rectType} bounding box "
                        f"for `{ri.field['description']}` ({ri.rect}) and "
                        f"{rj.rectType} bounding box for `{rj.field['description']}` ({rj.rect})"
                    )
                if len(messages) >= 20:
                    messages.append(
                        "Aborting further checks; fix bounding boxes and try again"
                    )
                    return messages

        # Check entry box size vs font size
        if ri.rectType == "entry":
            if "entry_text" in ri.field:
                fontSize = ri.field["entry_text"].get("font_size", 14)
                entryHeight = ri.rect[3] - ri.rect[1]
                if entryHeight < fontSize:
                    hasError = True
                    messages.append(
                        f"FAILURE: entry bounding box height ({entryHeight}) "
                        f"for `{ri.field['description']}` is too short for the text "
                        f"content (font size: {fontSize}). Increase the box height "
                        f"or decrease the font size."
                    )
                    if len(messages) >= 20:
                        messages.append(
                            "Aborting further checks; fix bounding boxes and try again"
                        )
                        return messages

    if not hasError:
        messages.append("SUCCESS: All bounding boxes are valid")

    return messages


def main():
    if len(sys.argv) != 2:
        print("Usage: python checkBoundingBoxes.py <fields.json>")
        sys.exit(1)

    try:
        with open(sys.argv[1]) as f:
            messages = getBoundingBoxMessages(f)

        for msg in messages:
            print(msg)

        # Exit with error if any failures found
        if any("FAILURE" in msg for msg in messages):
            sys.exit(1)

    except FileNotFoundError:
        print(f"Error: File not found: {sys.argv[1]}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
