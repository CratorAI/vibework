"""Fill fillable form fields in a PDF.

Usage:
    python fillFields.py input.pdf field_values.json output.pdf

The field_values.json should be a list of objects with:
- field_id: The field ID from extractFormInfo.py
- page: The page number (1-based)
- value: The value to set

Example field_values.json:
[
  {"field_id": "last_name", "page": 1, "value": "Simpson"},
  {"field_id": "Checkbox12", "page": 1, "value": "/On"}
]
"""

import json
import sys
from typing import Optional

from pypdf import PdfReader, PdfWriter

# Support both running as module and as direct script
try:
    from .extractFormInfo import getFieldInfo
except ImportError:
    from extractFormInfo import getFieldInfo


def validationErrorForFieldValue(fieldInfo: dict, fieldValue) -> Optional[str]:
    """Check if a field value is valid.

    Args:
        fieldInfo: Field info dict from getFieldInfo
        fieldValue: Value to validate

    Returns:
        Error message if invalid, None if valid
    """
    fieldType = fieldInfo["type"]
    fieldId = fieldInfo["field_id"]

    if fieldType == "checkbox":
        checkedVal = fieldInfo["checked_value"]
        uncheckedVal = fieldInfo["unchecked_value"]
        if fieldValue != checkedVal and fieldValue != uncheckedVal:
            return (
                f'ERROR: Invalid value "{fieldValue}" for checkbox field "{fieldId}". '
                f'The checked value is "{checkedVal}" and the unchecked value is "{uncheckedVal}"'
            )
    elif fieldType == "radio_group":
        optionValues = [opt["value"] for opt in fieldInfo["radio_options"]]
        if fieldValue not in optionValues:
            return (
                f'ERROR: Invalid value "{fieldValue}" for radio group field "{fieldId}". '
                f"Valid values are: {optionValues}"
            )
    elif fieldType == "choice":
        choiceValues = [opt["value"] for opt in fieldInfo["choice_options"]]
        if fieldValue not in choiceValues:
            return (
                f'ERROR: Invalid value "{fieldValue}" for choice field "{fieldId}". '
                f"Valid values are: {choiceValues}"
            )

    return None


def monkeypatchPypdfMethod():
    """Patch pypdf to handle selection list fields correctly.

    pypdf has a bug where get_inherited returns a list of two-element lists
    for selection lists, causing join to fail.
    """
    from pypdf.generic import DictionaryObject
    from pypdf.constants import FieldDictionaryAttributes

    originalGetInherited = DictionaryObject.get_inherited

    def patchedGetInherited(self, key: str, default=None):
        result = originalGetInherited(self, key, default)
        if key == FieldDictionaryAttributes.Opt:
            if isinstance(result, list) and all(
                isinstance(v, list) and len(v) == 2 for v in result
            ):
                result = [r[0] for r in result]
        return result

    DictionaryObject.get_inherited = patchedGetInherited


def fillPdfFields(
    inputPdfPath: str, fieldsJsonPath: str, outputPdfPath: str
) -> None:
    """Fill form fields in a PDF.

    Args:
        inputPdfPath: Path to input PDF
        fieldsJsonPath: Path to field values JSON
        outputPdfPath: Path to output PDF
    """
    with open(fieldsJsonPath) as f:
        fields = json.load(f)

    # Group by page number
    fieldsByPage = {}
    for field in fields:
        if "value" in field:
            fieldId = field["field_id"]
            page = field["page"]
            if page not in fieldsByPage:
                fieldsByPage[page] = {}
            fieldsByPage[page][fieldId] = field["value"]

    reader = PdfReader(inputPdfPath)

    # Validate field IDs and values
    hasError = False
    fieldInfo = getFieldInfo(reader)
    fieldsById = {f["field_id"]: f for f in fieldInfo}

    for field in fields:
        existingField = fieldsById.get(field["field_id"])
        if not existingField:
            hasError = True
            print(f"ERROR: `{field['field_id']}` is not a valid field ID")
        elif field["page"] != existingField["page"]:
            hasError = True
            print(
                f"ERROR: Incorrect page number for `{field['field_id']}` "
                f"(got {field['page']}, expected {existingField['page']})"
            )
        else:
            if "value" in field:
                err = validationErrorForFieldValue(existingField, field["value"])
                if err:
                    print(err)
                    hasError = True

    if hasError:
        sys.exit(1)

    writer = PdfWriter(clone_from=reader)

    for page, fieldValues in fieldsByPage.items():
        writer.update_page_form_field_values(
            writer.pages[page - 1], fieldValues, auto_regenerate=False
        )

    # This ensures form values display correctly in most viewers
    writer.set_need_appearances_writer(True)

    with open(outputPdfPath, "wb") as f:
        writer.write(f)

    print(f"Successfully filled PDF form and saved to {outputPdfPath}")


def main():
    if len(sys.argv) != 4:
        print("Usage: python fillFields.py <input.pdf> <field_values.json> <output.pdf>")
        sys.exit(1)

    inputPdf = sys.argv[1]
    fieldsJson = sys.argv[2]
    outputPdf = sys.argv[3]

    try:
        monkeypatchPypdfMethod()
        fillPdfFields(inputPdf, fieldsJson, outputPdf)
    except FileNotFoundError as e:
        print(f"Error: File not found: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
