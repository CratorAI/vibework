# XLSX Template Editing Workflow

This document details the XML editing workflow for modifying existing Excel files.

## When to Use This Workflow

Use the template workflow when:
- User provides a .xlsx file to modify
- You need to preserve existing styles, formatting, and formulas
- Making targeted changes to specific cells or ranges

## XLSX File Structure

An XLSX file is a ZIP archive containing:

```
spreadsheet.xlsx (ZIP)
├── [Content_Types].xml       # Content type definitions
├── _rels/
│   └── .rels                 # Root relationships
├── docProps/
│   ├── app.xml              # Application properties
│   └── core.xml             # Core properties (title, author)
└── xl/
    ├── workbook.xml         # Workbook structure (sheet list)
    ├── sharedStrings.xml    # Shared string table
    ├── styles.xml           # Cell styles and formats
    ├── theme/
    │   └── theme1.xml       # Theme colors and fonts
    ├── worksheets/
    │   ├── sheet1.xml       # First worksheet
    │   ├── sheet2.xml       # Second worksheet
    │   └── ...
    └── _rels/
        └── workbook.xml.rels # Workbook relationships
```

## Session Workflow

### 1. Start Session

```bash
python scripts/session.py start input.xlsx "$VIBEWORK_SCRATCH/workspace"
```

This:
- Unpacks the XLSX to `$VIBEWORK_SCRATCH/workspace/`
- Creates `.vibework-session.json` to track the session
- Prints the path to worksheets directory

### 2. Analyze Structure

```bash
python scripts/analyze.py input.xlsx
```

Understand:
- Number of sheets and their names
- Cell counts and used ranges
- Formula locations
- Content preview

### 3. Edit XML Files

Files to edit are in `$VIBEWORK_SCRATCH/workspace/xl/worksheets/`:

```
"$VIBEWORK_SCRATCH/workspace/"
└── xl/
    ├── worksheets/
    │   ├── sheet1.xml    # Edit cells here
    │   └── sheet2.xml
    └── sharedStrings.xml # Edit shared text here
```

### 4. Finish Session

```bash
python scripts/session.py finish "$VIBEWORK_SCRATCH/workspace" output.xlsx
```

This:
- Cleans unreferenced files
- Validates the structure
- Repacks into output.xlsx
- Removes session file

### 5. Recalculate Formulas

**CRITICAL: Always run after editing files with formulas:**

```bash
python scripts/recalc.py output.xlsx
```

## XML Editing Guide

### Worksheet Structure (sheetN.xml)

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="s">     <!-- t="s" means shared string -->
        <v>0</v>           <!-- Index into sharedStrings.xml -->
      </c>
      <c r="B1">           <!-- No type = number -->
        <v>42</v>
      </c>
      <c r="C1">           <!-- Formula cell -->
        <f>A1+B1</f>
        <v>42</v>          <!-- Cached value -->
      </c>
    </row>
  </sheetData>
</worksheet>
```

### Cell Types

| Type Attribute | Meaning | Value Element Contains |
|----------------|---------|------------------------|
| `t="s"` | Shared string | Index into sharedStrings.xml |
| `t="str"` | Inline string | Literal text |
| `t="b"` | Boolean | 0 or 1 |
| `t="e"` | Error | Error code (#REF!, etc.) |
| (none) | Number | Numeric value |

### Shared Strings (sharedStrings.xml)

Text values are stored in a shared string table for deduplication:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
     count="10" uniqueCount="5">
  <si><t>Hello</t></si>      <!-- Index 0 -->
  <si><t>World</t></si>      <!-- Index 1 -->
  <si><t>Value</t></si>      <!-- Index 2 -->
</sst>
```

To reference "Hello" in a cell:
```xml
<c r="A1" t="s"><v>0</v></c>
```

### Editing Cells

#### Change a Number Value
```xml
<!-- Before -->
<c r="B5"><v>100</v></c>

<!-- After -->
<c r="B5"><v>200</v></c>
```

#### Change Text (Shared String)
1. Find the text in `sharedStrings.xml`
2. Change the `<t>` element content
3. All cells referencing that string will update

```xml
<!-- sharedStrings.xml -->
<!-- Before -->
<si><t>PLACEHOLDER</t></si>

<!-- After -->
<si><t>Actual Value</t></si>
```

#### Add a Formula
```xml
<!-- Before: static value -->
<c r="C5"><v>300</v></c>

<!-- After: formula -->
<c r="C5">
  <f>A5+B5</f>
  <v>300</v>
</c>
```

**Note:** After adding formulas, run `recalc.py` to update cached values.

### Common Operations

#### Replace Text Across Workbook

Edit `xl/sharedStrings.xml` to change all occurrences:

```bash
# Find the string index
grep -n "PLACEHOLDER" "$VIBEWORK_SCRATCH/workspace/xl/sharedStrings.xml"

# Edit the file
# Change: <si><t>PLACEHOLDER</t></si>
# To:     <si><t>Actual Value</t></si>
```

Or use the quickEdit script:
```bash
python scripts/quickEdit.py input.xlsx "PLACEHOLDER" "Actual Value" output.xlsx
```

#### Add New Rows

1. Open the sheet XML file
2. Add new `<row>` elements in `<sheetData>`
3. Ensure row numbers (`r` attribute) are sequential
4. Update any affected formulas/ranges

```xml
<sheetData>
  <row r="1">...</row>
  <row r="2">...</row>
  <!-- Add new row -->
  <row r="3">
    <c r="A3"><v>100</v></c>
    <c r="B3"><v>200</v></c>
  </row>
</sheetData>
```

#### Update Formulas

Formula text is in `<f>` elements:

```xml
<!-- Before -->
<c r="D5"><f>SUM(A5:C5)</f><v>600</v></c>

<!-- After (extended range) -->
<c r="D5"><f>SUM(A5:D5)</f><v>600</v></c>
```

Run `recalc.py` to update the cached `<v>` value.

## Best Practices

1. **Always analyze first** - Understand the structure before editing
2. **Back up originals** - Keep the input file safe
3. **Edit shared strings carefully** - Changes affect all referencing cells
4. **Run recalc.py** - Always recalculate after editing formulas
5. **Verify output** - Check the result in Excel or with analyze.py
6. **Preserve formatting** - Don't remove style attributes unless necessary

## Troubleshooting

### Formula Errors After Editing

Run recalc.py and check the output:
```bash
python scripts/recalc.py output.xlsx
```

Common errors:
- `#REF!` - Invalid cell reference (row/column deleted?)
- `#NAME?` - Unknown function name
- `#VALUE!` - Wrong data type
- `#DIV/0!` - Division by zero

### Text Not Updating

Check if the text is:
1. In sharedStrings.xml (most common)
2. An inline string (t="str")
3. A formula result (need to change the formula)

### Corrupt Output File

If Excel can't open the file:
1. Check XML syntax (missing closing tags?)
2. Verify Content_Types.xml is intact
3. Check relationships in _rels folders
4. Try opening with a ZIP utility to inspect
