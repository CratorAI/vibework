"""Check if a PDF has fillable form fields.

Usage:
    python checkFields.py document.pdf

Output:
    Prints whether the PDF has fillable form fields.
"""

import sys
from pypdf import PdfReader


def checkFillableFields(pdfPath: str) -> bool:
    """Check if a PDF has fillable form fields.

    Args:
        pdfPath: Path to PDF file

    Returns:
        True if the PDF has fillable form fields
    """
    reader = PdfReader(pdfPath)
    fields = reader.get_fields()
    return bool(fields)


def main():
    if len(sys.argv) != 2:
        print("Usage: python checkFields.py <file.pdf>")
        sys.exit(1)

    pdfPath = sys.argv[1]

    try:
        hasFillable = checkFillableFields(pdfPath)

        if hasFillable:
            print("This PDF has fillable form fields")
        else:
            print(
                "This PDF does not have fillable form fields; "
                "you will need to use annotations to add text"
            )

    except FileNotFoundError:
        print(f"Error: File not found: {pdfPath}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
