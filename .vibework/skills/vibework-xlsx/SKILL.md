---
name: vibework-xlsx
description: "Excel workbook creation and editing. When a template .xlsx is provided, ALWAYS use the template workflow (session.py). Use openpyxl for creating new spreadsheets with formulas, pandas for data analysis."
---

# VibeworkXLSX

**Working files go in the task's scratch folder**, not the working folder: `$VIBEWORK_SCRATCH` (its full path is also in your instructions). That means the unpacked `workspace/`, thumbnail grids, page and slide images, extracted text and helper scripts. Quote it in commands (`"$VIBEWORK_SCRATCH/workspace"`): the path has a space. Only the finished file the user asked for goes in the working folder.

Opinionated Excel workbook workflow using unpack -> edit -> pack. **When a template is provided, use it** -- don't recreate from scratch.

## Quick Reference

| Task | Guide |
|------|-------|
| **Use template (.xlsx provided)** | `session.py start` -> edit -> `session.py finish` ([editing.md](references/editing.md)) |
| Read/analyze content | `python scripts/analyze.py spreadsheet.xlsx` |
| Quick text replacement | `python scripts/quickEdit.py in.xlsx "old" "new" out.xlsx` |
| Create from scratch | Use **openpyxl** (see below) |
| Data analysis | Use **pandas** (see below) |
| Recalculate formulas | `python scripts/recalc.py output.xlsx` |

**References:** [editing.md](references/editing.md) (template workflow)

---

## CRITICAL: Which Workflow to Use

**STOP and read this before doing anything else.**

| User says... | Use this workflow |
|--------------|-------------------|
| "Use X.xlsx as template" | **Template Workflow** (session.py) |
| "Based on this spreadsheet..." | **Template Workflow** (session.py) |
| "Edit/modify this xlsx" | **Template Workflow** (session.py) |
| "Analyze this data" | **pandas** (read_excel) |
| "Create from scratch" / no file given | **openpyxl** (new Workbook) |

### Template Workflow (When a .xlsx file is provided)

**DO NOT recreate the spreadsheet when the user provides a template file.** The template has styling, formatting, formulas, and structure that must be preserved.

```bash
# 1. Start session with the template
uv run python scripts/session.py start template.xlsx "$VIBEWORK_SCRATCH/workspace"

# 2. Analyze the template structure
uv run python scripts/analyze.py template.xlsx

# 3. Edit XML files in "$VIBEWORK_SCRATCH/workspace/xl/worksheets/"
# 4. Finish session
uv run python scripts/session.py finish "$VIBEWORK_SCRATCH/workspace" output.xlsx

# 5. Recalculate formulas (REQUIRED if formulas exist)
uv run python scripts/recalc.py output.xlsx
```

**Read [editing.md](references/editing.md) for complete template workflow details.**

### Create from Scratch (ONLY when no template exists)

Use openpyxl **only** when:
- User explicitly says "create from scratch"
- No template or reference file is provided
- User wants a completely new spreadsheet

---

## Dependencies

**BEFORE running any scripts, set up the environment. Do this once per workspace.**

**Tools**: run `uv` as a plain command; Vibework puts it on the PATH.

**Python environment** (uv):
```bash
# Create venv and install packages
uv venv
uv pip install openpyxl pandas defusedxml lxml Pillow
```

Then run scripts with:
```bash
uv run python scripts/session.py start spreadsheet.xlsx "$VIBEWORK_SCRATCH/workspace"
```

**System tools** (required):
- LibreOffice - for formula recalculation (`scripts/recalc.py`)

**Verify before starting:**
```bash
# Check Python packages
uv run python -c "import openpyxl, pandas, defusedxml, lxml, PIL; print('OK')"
```

---

## Workflows

### 1. Analyze First

Always start by understanding the workbook structure:

```bash
python scripts/analyze.py spreadsheet.xlsx
```

Output includes:
- Sheet count and names
- Cell count per sheet
- Formula count
- Used range
- Content preview

For JSON output:
```bash
python scripts/analyze.py spreadsheet.xlsx --json
```

With formula error checking:
```bash
python scripts/analyze.py spreadsheet.xlsx --check-formulas
```

### 2. Quick Edits

For simple find/replace operations in cell values:

```bash
python scripts/quickEdit.py spreadsheet.xlsx "PLACEHOLDER" "Actual Value" output.xlsx
```

Multiple replacements from JSON:
```bash
# Create replacements.json: {"old1": "new1", "old2": "new2"}
python scripts/quickEdit.py spreadsheet.xlsx --replacements changes.json output.xlsx
```

Specific sheets only:
```bash
python scripts/quickEdit.py spreadsheet.xlsx "OLD" "NEW" output.xlsx --sheets "Sheet1,Sheet2"
```

Dry run to preview changes:
```bash
python scripts/quickEdit.py spreadsheet.xlsx "OLD" "NEW" output.xlsx --dry-run
```

### 3. Full Editing Session

For complex edits requiring direct XML manipulation:

```bash
# Start session (unpacks to "$VIBEWORK_SCRATCH/workspace")
python scripts/session.py start spreadsheet.xlsx "$VIBEWORK_SCRATCH/workspace"

# Edit XML files directly
# Files are in: "$VIBEWORK_SCRATCH/workspace/xl/worksheets/"

# Finish session (validates, cleans, repacks)
python scripts/session.py finish "$VIBEWORK_SCRATCH/workspace" output.xlsx

# IMPORTANT: Recalculate formulas
python scripts/recalc.py output.xlsx
```

Session commands:
- `start <input.xlsx> <workspace/>` - Unpack and create session
- `finish <workspace/> <output.xlsx>` - Pack with validation
- `abort <workspace/>` - Cancel without saving
- `status <workspace/>` - Show session info

---

## Python API

For programmatic use, import from `core.py`:

```python
from core import Workbook, unpackWorkbook, packWorkbook

# Quick text replacement
wb = Workbook.fromFile("input.xlsx", "workspace/")
count = wb.replaceText("old", "new")
wb.saveAll()
wb.pack("output.xlsx", originalFile="input.xlsx")

# Analyze sheets
for sheet in wb.sheets:
    print(f"Sheet {sheet.name}: {sheet.rowCount} rows")
    print(f"  Cells: {len(sheet.cells)}")

# Get cell values
sheet = wb.getSheet("Sheet1")
value = sheet.getCellValue("A1")
formula = sheet.getCellFormula("B2")

# Find text across all sheets
matches = wb.findText(r"\d{4}-\d{2}-\d{2}")
for sheet, cellRef, value in matches:
    print(f"Found '{value}' in {sheet.name}!{cellRef}")
```

### Key Classes

**`Workbook`** - Represents an unpacked workbook
- `Workbook.fromFile(xlsxPath, workspaceDir)` - Create from file
- `wb.sheets` - List of Sheet objects
- `wb.sheetNames` - List of sheet names
- `wb.getSheet(name)` - Get sheet by name
- `wb.replaceText(old, new)` - Replace across all sheets
- `wb.findText(pattern)` - Search with regex
- `wb.saveAll()` - Save modifications
- `wb.pack(outputPath)` - Create output file

**`Sheet`** - Represents a single worksheet
- `sheet.name` - Sheet name
- `sheet.cells` - Dict of cellRef -> value
- `sheet.getCellValue(ref)` - Get cell value (resolves shared strings)
- `sheet.getCellFormula(ref)` - Get cell formula
- `sheet.findText(pattern)` - Search in this sheet
- `sheet.replaceText(old, new)` - Replace in this sheet

### Utility Functions

```python
from core import extractWorkbookInfo, extractAllText

# Get workbook info without unpacking
info = extractWorkbookInfo("spreadsheet.xlsx")
# {'sheetCount': 3, 'sheetNames': [...], 'totalCells': 1500, 'hasFormulas': True}

# Extract all text without unpacking
text = extractAllText("spreadsheet.xlsx")
# {'Sheet1': ['value1', 'value2', ...], 'Sheet2': [...]}
```

---

## Requirements for Outputs

## All Excel files

### Professional Font
- Use a consistent, professional font (e.g., Arial, Times New Roman) for all deliverables unless otherwise instructed by the user

### Zero Formula Errors
- Every Excel model MUST be delivered with ZERO formula errors (#REF!, #DIV/0!, #VALUE!, #N/A, #NAME?)

### Preserve Existing Templates (when updating templates)
- Study and EXACTLY match existing format, style, and conventions when modifying files
- Never impose standardized formatting on files with established patterns
- Existing template conventions ALWAYS override these guidelines

## Financial models

### Color Coding Standards
Unless otherwise stated by the user or existing template

#### Industry-Standard Color Conventions
- **Blue text (RGB: 0,0,255)**: Hardcoded inputs, and numbers users will change for scenarios
- **Black text (RGB: 0,0,0)**: ALL formulas and calculations
- **Green text (RGB: 0,128,0)**: Links pulling from other worksheets within same workbook
- **Red text (RGB: 255,0,0)**: External links to other files
- **Yellow background (RGB: 255,255,0)**: Key assumptions needing attention or cells that need to be updated

### Number Formatting Standards

#### Required Format Rules
- **Years**: Format as text strings (e.g., "2024" not "2,024")
- **Currency**: Use $#,##0 format; ALWAYS specify units in headers ("Revenue ($mm)")
- **Zeros**: Use number formatting to make all zeros "-", including percentages (e.g., "$#,##0;($#,##0);-")
- **Percentages**: Default to 0.0% format (one decimal)
- **Multiples**: Format as 0.0x for valuation multiples (EV/EBITDA, P/E)
- **Negative numbers**: Use parentheses (123) not minus -123

### Formula Construction Rules

#### Assumptions Placement
- Place ALL assumptions (growth rates, margins, multiples, etc.) in separate assumption cells
- Use cell references instead of hardcoded values in formulas
- Example: Use =B5*(1+$B$6) instead of =B5*1.05

#### Formula Error Prevention
- Verify all cell references are correct
- Check for off-by-one errors in ranges
- Ensure consistent formulas across all projection periods
- Test with edge cases (zero values, negative numbers)
- Verify no unintended circular references

#### Documentation Requirements for Hardcodes
- Comment or in cells beside (if end of table). Format: "Source: [System/Document], [Date], [Specific Reference], [URL if applicable]"

---

## XLSX Creation with openpyxl

## CRITICAL: Use Formulas, Not Hardcoded Values

**Always use Excel formulas instead of calculating values in Python and hardcoding them.** This ensures the spreadsheet remains dynamic and updateable.

### WRONG - Hardcoding Calculated Values
```python
# Bad: Calculating in Python and hardcoding result
total = df['Sales'].sum()
sheet['B10'] = total  # Hardcodes 5000

# Bad: Computing growth rate in Python
growth = (df.iloc[-1]['Revenue'] - df.iloc[0]['Revenue']) / df.iloc[0]['Revenue']
sheet['C5'] = growth  # Hardcodes 0.15
```

### CORRECT - Using Excel Formulas
```python
# Good: Let Excel calculate the sum
sheet['B10'] = '=SUM(B2:B9)'

# Good: Growth rate as Excel formula
sheet['C5'] = '=(C4-C2)/C2'

# Good: Average using Excel function
sheet['D20'] = '=AVERAGE(D2:D19)'
```

### Creating new Excel files

```python
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

wb = Workbook()
sheet = wb.active

# Add data
sheet['A1'] = 'Hello'
sheet['B1'] = 'World'
sheet.append(['Row', 'of', 'data'])

# Add formula
sheet['B2'] = '=SUM(A1:A10)'

# Formatting
sheet['A1'].font = Font(bold=True, color='FF0000')
sheet['A1'].fill = PatternFill('solid', start_color='FFFF00')
sheet['A1'].alignment = Alignment(horizontal='center')

# Column width
sheet.column_dimensions['A'].width = 20

wb.save('output.xlsx')
```

### Editing existing Excel files

```python
from openpyxl import load_workbook

# Load existing file
wb = load_workbook('existing.xlsx')
sheet = wb.active  # or wb['SheetName'] for specific sheet

# Working with multiple sheets
for sheet_name in wb.sheetnames:
    sheet = wb[sheet_name]
    print(f"Sheet: {sheet_name}")

# Modify cells
sheet['A1'] = 'New Value'
sheet.insert_rows(2)  # Insert row at position 2
sheet.delete_cols(3)  # Delete column 3

# Add new sheet
new_sheet = wb.create_sheet('NewSheet')
new_sheet['A1'] = 'Data'

wb.save('modified.xlsx')
```

---

## Data Analysis with pandas

For data analysis, visualization, and basic operations:

```python
import pandas as pd

# Read Excel
df = pd.read_excel('file.xlsx')  # Default: first sheet
all_sheets = pd.read_excel('file.xlsx', sheet_name=None)  # All sheets as dict

# Analyze
df.head()      # Preview data
df.info()      # Column info
df.describe()  # Statistics

# Write Excel
df.to_excel('output.xlsx', index=False)
```

---

## Recalculating Formulas

Excel files created or modified by openpyxl contain formulas as strings but not calculated values. **ALWAYS run recalc.py after creating or editing files with formulas:**

```bash
python scripts/recalc.py <excel_file> [timeout_seconds]
```

Example:
```bash
python scripts/recalc.py output.xlsx 30
```

The script:
- Automatically sets up LibreOffice macro on first run
- Recalculates all formulas in all sheets
- Scans ALL cells for Excel errors (#REF!, #DIV/0!, etc.)
- Returns JSON with detailed error locations and counts

### Interpreting recalc.py Output

```json
{
  "status": "success",           // or "errors_found"
  "total_errors": 0,              // Total error count
  "total_formulas": 42,           // Number of formulas in file
  "error_summary": {              // Only present if errors found
    "#REF!": {
      "count": 2,
      "locations": ["Sheet1!B5", "Sheet1!C10"]
    }
  }
}
```

---

## QA (Required)

**Assume there are problems. Your job is to find them.**

### Formula Verification

```bash
# Check for formula errors
python scripts/recalc.py output.xlsx
```

Fix any errors found before delivery.

### Content QA

```bash
# Analyze structure
python scripts/analyze.py output.xlsx --check-formulas
```

**When using templates, check for leftover placeholder text:**
```bash
python scripts/analyze.py output.xlsx --json | grep -iE "xxxx|placeholder|sample"
```

### Formula Verification Checklist

- [ ] **Test 2-3 sample references**: Verify they pull correct values before building full model
- [ ] **Column mapping**: Confirm Excel columns match (e.g., column 64 = BL, not BK)
- [ ] **Row offset**: Remember Excel rows are 1-indexed (DataFrame row 5 = Excel row 6)
- [ ] **NaN handling**: Check for null values with `pd.notna()`
- [ ] **Division by zero**: Check denominators before using `/` in formulas (#DIV/0!)
- [ ] **Wrong references**: Verify all cell references point to intended cells (#REF!)
- [ ] **Cross-sheet references**: Use correct format (Sheet1!A1) for linking sheets

---

## Code Style

This skill uses camelCase conventions:

| Element | Convention | Example |
|---------|------------|---------|
| Functions | camelCase | `getCell()`, `replaceText()` |
| Variables | camelCase | `sheetCount`, `cellValue` |
| Classes | PascalCase | `Workbook`, `Sheet`, `Session` |
| Constants | SCREAMING_SNAKE | `SPREADSHEET_NAMESPACE` |
| Files | camelCase | `quickEdit.py`, `analyze.py` |

---

## Comparison with xlsx Skill

| Feature | vibework-xlsx | xlsx |
|---------|--------------|------|
| API style | camelCase | snake_case |
| Session management | Built-in | Manual |
| Quick edit | Single command | Manual editing |
| Analysis | Built-in | pandas only |
| Validation | Automatic | Optional |

Use **vibework-xlsx** when:
- You want a simpler, higher-level API
- Quick text replacements are the primary task
- Need structured session workflow

Use **xlsx** when:
- You need fine-grained XML control
- Working with complex formulas
- Integrating with existing xlsx scripts
