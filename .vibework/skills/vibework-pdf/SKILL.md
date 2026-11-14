---
name: vibework-pdf
description: "PDF manipulation toolkit for filling forms, extracting text/tables, merging/splitting documents, and converting to images. Unlike DOCX/XLSX, PDFs are binary files - use task-based workflows instead of session-based editing."
---

# VibeworkPDF

**Working files go in the task's scratch folder**, not the working folder: `$VIBEWORK_SCRATCH` (its full path is also in your instructions). That means the unpacked `workspace/`, thumbnail grids, page and slide images, extracted text and helper scripts. Quote it in commands (`"$VIBEWORK_SCRATCH/workspace"`): the path has a space. Only the finished file the user asked for goes in the working folder.

Opinionated PDF workflow using task-based scripts. **PDFs are binary files** - there is no unpack -> edit -> pack workflow like DOCX/XLSX.

## Quick Reference

| Task | Guide |
|------|-------|
| **Fill PDF form (fillable fields)** | `checkFields.py` -> `extractFormInfo.py` -> `fillFields.py` ([forms.md](references/forms.md)) |
| **Fill PDF form (no fields)** | `extractStructure.py` -> `checkBoundingBoxes.py` -> `fillAnnotations.py` ([forms.md](references/forms.md)) |
| Read/analyze content | `python scripts/analyze.py document.pdf` |
| Extract text | `python scripts/core.py extract-text document.pdf` |
| Extract tables | `python scripts/core.py extract-tables document.pdf` |
| Convert to images | `python scripts/convertToImages.py document.pdf "$VIBEWORK_SCRATCH/images/"` (writes `page_1.png`, `page_2.png`, …; prints each path) |
| Create thumbnail grid | `python scripts/thumbnail.py document.pdf "$VIBEWORK_SCRATCH/grid.jpg"` (writes `grid.jpg`, or `grid-1.jpg`, `grid-2.jpg`, … for a long PDF; prints each path) |
| Merge PDFs | `python scripts/quickMerge.py file1.pdf file2.pdf output.pdf` |
| Split PDF | `python scripts/quickSplit.py document.pdf ./pages/` |
| Validate bounding boxes | `python scripts/checkBoundingBoxes.py fields.json` |

**References:** [forms.md](references/forms.md) (form filling workflow)

---

## IMPORTANT: Use Bundled Scripts

**CRITICAL: Do NOT write custom Python code for operations that have bundled scripts.**

For these tasks, ALWAYS invoke the scripts in `scripts/`:
- **Analyze PDFs** → `python scripts/analyze.py document.pdf`
- **Extract text** → `python scripts/core.py extract-text document.pdf`
- **Extract tables** → `python scripts/core.py extract-tables document.pdf`
- **Convert to images** → `python scripts/convertToImages.py document.pdf "$VIBEWORK_SCRATCH/images/"` (`page_1.png`, `page_2.png`, …)
- **Create thumbnail** → `python scripts/thumbnail.py document.pdf "$VIBEWORK_SCRATCH/grid.jpg"`
- **Merge PDFs** → `python scripts/quickMerge.py file1.pdf file2.pdf output.pdf`
- **Split PDFs** → `python scripts/quickSplit.py document.pdf ./pages/`
- **Form filling** → Follow the workflows in [forms.md](references/forms.md)

**Write code ONLY for:**
- **Creating new PDFs** - Use reportlab (Python) or pdf-lib (JavaScript) patterns from the Python API section
- **Custom operations** not covered by the bundled scripts above

---

## CRITICAL: Which Workflow to Use

**STOP and read this before doing anything else.**

```
User needs to work with PDF?
|
+-- Fill out a PDF form?
|   |
|   +-- Has fillable fields? --> fillFields.py workflow
|   |   Run: python scripts/checkFields.py form.pdf
|   |   If "has fillable form fields" --> See "Fillable Form Workflow"
|   |
|   +-- No fillable fields? --> fillAnnotations.py workflow
|       See "Non-Fillable Form Workflow"
|
+-- Extract text/tables?
|   |
|   +-- Native PDF --> pdfplumber
|   |   python scripts/core.py extract-text document.pdf
|   |   python scripts/core.py extract-tables document.pdf
|   |
|   +-- Scanned/image PDF --> OCR workflow
|       python scripts/convertToImages.py document.pdf "$VIBEWORK_SCRATCH/images/"
|       Then use OCR on images
|
+-- Create new PDF?
|   |
|   +-- Simple text/tables --> reportlab (Python)
|   |
|   +-- Complex layouts --> pdf-lib (JavaScript)
|
+-- Merge/split PDFs?
|   |
|   +-- Merge --> python scripts/quickMerge.py
|   |
|   +-- Split --> python scripts/quickSplit.py
|
+-- Convert to images?
    |
    +-- All pages --> python scripts/convertToImages.py
    |
    +-- Thumbnail grid --> python scripts/thumbnail.py
```

---

## Dependencies

**BEFORE running any scripts, set up the environment. Do this once per workspace.**

**Tools**: run `uv` as a plain command; Vibework puts it on the PATH.

**Python environment** (uv):
```bash
# Create venv and install packages
uv venv
uv pip install pypdf pdfplumber pdf2image reportlab Pillow pymupdf
```

Then run scripts with:
```bash
uv run python scripts/analyze.py document.pdf
```

**System tools** (optional):
- Poppler (for pdf2image conversion)
- Tesseract (for OCR of scanned PDFs)

**Verify before starting:**
```bash
# Check Python packages
uv run python -c "import pypdf, pdfplumber, PIL, fitz; print('OK')"
```

---

## Workflows

### 1. Analyze First

Always start by understanding the PDF structure:

```bash
python scripts/analyze.py document.pdf
```

Output includes:
- Page count and dimensions
- Text extraction preview
- Form field detection
- Table detection

For JSON output:
```bash
python scripts/analyze.py document.pdf --json
```

With thumbnail grid:
```bash
python scripts/analyze.py document.pdf --thumbnails "$VIBEWORK_SCRATCH/grid.jpg"
```

### 2. Fillable Form Workflow

For PDFs with native form fields:

```bash
# 1. Check if form has fillable fields
python scripts/checkFields.py form.pdf

# 2. Extract field info
python scripts/extractFormInfo.py form.pdf fields.json

# 3. Convert to images for visual analysis
python scripts/convertToImages.py form.pdf "$VIBEWORK_SCRATCH/images/"

# 4. Create field_values.json with your data
# 5. Fill the form
python scripts/fillFields.py form.pdf field_values.json output.pdf
```

**Read [forms.md](references/forms.md) for complete fillable form workflow.**

### 3. Non-Fillable Form Workflow

For PDFs without native form fields (use text annotations):

```bash
# 1. Extract form structure
python scripts/extractStructure.py form.pdf structure.json

# 2. Convert to images for visual analysis
python scripts/convertToImages.py form.pdf "$VIBEWORK_SCRATCH/images/"

# 3. Create fields.json with bounding boxes and text
# 4. Validate bounding boxes
python scripts/checkBoundingBoxes.py fields.json

# 5. Fill with annotations
python scripts/fillAnnotations.py form.pdf fields.json output.pdf
```

**Read [forms.md](references/forms.md) for complete non-fillable form workflow.**

### 4. Text/Table Extraction

Extract text from PDF:
```bash
python scripts/core.py extract-text document.pdf
python scripts/core.py extract-text document.pdf --output "$VIBEWORK_SCRATCH/text.txt"
```

Extract tables as JSON:
```bash
python scripts/core.py extract-tables document.pdf
python scripts/core.py extract-tables document.pdf --output "$VIBEWORK_SCRATCH/tables.json"
```

### 5. Merge PDFs

Combine multiple PDFs:
```bash
python scripts/quickMerge.py file1.pdf file2.pdf file3.pdf -o merged.pdf
```

### 6. Split PDF

Split into individual pages:
```bash
python scripts/quickSplit.py document.pdf "$VIBEWORK_SCRATCH/pages/"
```

Split specific pages:
```bash
python scripts/quickSplit.py document.pdf "$VIBEWORK_SCRATCH/pages/" --pages 1,3,5
```

### 7. Convert to Images

Convert all pages:
```bash
python scripts/convertToImages.py document.pdf "$VIBEWORK_SCRATCH/images/"
```

---

## Python API

For programmatic use, import from `core.py`:

```python
from core import PDF, mergePdfs, splitPdf, extractPdfInfo

# Load a PDF
pdf = PDF.fromFile("document.pdf")

# Get basic info
print(f"Pages: {pdf.pageCount}")
print(f"Has forms: {pdf.hasFillableFields()}")

# Extract text
text = pdf.extractText()
print(text)

# Extract tables
tables = pdf.extractTables()
for page_num, page_tables in tables.items():
    for table in page_tables:
        print(table)

# Convert to images
pdf.toImages("./images/")

# Get metadata
info = pdf.getInfo()
print(f"Title: {info.get('title')}")
print(f"Author: {info.get('author')}")
```

### Key Classes

**`PDF`** - Represents a PDF document
- `PDF.fromFile(path)` - Load from file
- `pdf.pageCount` - Number of pages
- `pdf.extractText()` - Extract all text
- `pdf.extractTables()` - Extract tables as dict
- `pdf.hasFillableFields()` - Check for form fields
- `pdf.getInfo()` - Get metadata
- `pdf.toImages(outputDir)` - Convert to images

### Utility Functions

```python
from core import mergePdfs, splitPdf, extractPdfInfo

# Merge PDFs
mergePdfs(["file1.pdf", "file2.pdf"], "merged.pdf")

# Split PDF
splitPdf("document.pdf", "./pages/")

# Quick info without full load
info = extractPdfInfo("document.pdf")
# {'pageCount': 10, 'hasFillableFields': True, 'title': '...'}
```

---

## QA (Required)

**Assume there are problems. Your job is to find them.**

### Visual QA

**USE THUMBNAIL GRID** - Do NOT read individual page images, as this fills up context. Always use `thumbnail.py` to create a single grid image:

```bash
python scripts/thumbnail.py output.pdf "$VIBEWORK_SCRATCH/grid.jpg"
```

Then read the single grid image for visual inspection.

Check for:
- Correct text placement (for form fills)
- Missing content
- Overlapping text
- Cut off elements
- Wrong pages

### Content QA

For form fills, convert output to images and verify:
```bash
python scripts/convertToImages.py output.pdf "$VIBEWORK_SCRATCH/verify/"
```

Compare against source data to ensure all fields filled correctly.

---

## Code Style

This skill uses camelCase conventions:

| Element | Convention | Example |
|---------|------------|---------|
| Functions | camelCase | `extractText()`, `hasFillableFields()` |
| Variables | camelCase | `pageCount`, `fieldInfo` |
| Classes | PascalCase | `PDF` |
| Constants | SCREAMING_SNAKE | `DEFAULT_DPI` |
| Files | camelCase | `checkFields.py`, `quickMerge.py` |

