---
name: vibework-docx
description: "Word document creation and editing. When a template .docx is provided, ALWAYS use the template workflow (session.py). Only use docx-js when creating from scratch with no template."
---

# VibeworkDOCX

**Working files go in the task's scratch folder**, not the working folder: `$VIBEWORK_SCRATCH` (its full path is also in your instructions). That means the unpacked `workspace/`, thumbnail grids, page and slide images, extracted text and helper scripts. Quote it in commands (`"$VIBEWORK_SCRATCH/workspace"`): the path has a space. Only the finished file the user asked for goes in the working folder.

Opinionated Word document workflow using unpack -> edit -> pack. **When a template is provided, use it** -- don't recreate from scratch.

## Quick Reference

| Task | Guide |
|------|-------|
| **Use template (.docx provided)** | `session.py start` -> edit -> `session.py finish` ([editing.md](references/editing.md)) |
| Read/analyze content | `python scripts/analyze.py document.docx` |
| Quick text replacement | `python scripts/quickEdit.py in.docx "old" "new" out.docx` |
| Create from scratch (no template) | Read [docxjs.md](references/docxjs.md) |
| Create from Markdown outline | `python scripts/fromOutline.py outline.md output.docx` |
| Export to images | `python scripts/exportPages.py document.docx "$VIBEWORK_SCRATCH/pages/"` (writes `page-01.jpg`, `page-02.jpg`, … by page number; prints each path) |
| Create thumbnail grid | `python scripts/thumbnail.py document.docx "$VIBEWORK_SCRATCH/grid.jpg"` (writes `grid.jpg`, or `grid-1.jpg`, `grid-2.jpg`, … for a long document; prints each path) |
| Add comments | `python scripts/comment.py ./workspace 0 "Comment text"` |

**References:** [editing.md](references/editing.md) (template workflow), [docxjs.md](references/docxjs.md) (JavaScript API), [tracked-changes.md](references/tracked-changes.md) (redlining)

---

## CRITICAL: Which Workflow to Use

**STOP and read this before doing anything else.**

| User says... | Use this workflow |
|--------------|-------------------|
| "Use X.docx as template" | **Template Workflow** (session.py) |
| "Based on this document..." | **Template Workflow** (session.py) |
| "Edit/modify this doc" | **Template Workflow** (session.py) |
| "Create from scratch" / no file given | **docx-js** (JavaScript) |

### Template Workflow (When a .docx file is provided)

**DO NOT use docx-js when the user provides a template file.** The template has styling, formatting, and branding that must be preserved.

```bash
# 1. Start session with the template
uv run python scripts/session.py start template.docx "$VIBEWORK_SCRATCH/workspace"

# 2. Analyze the template structure
uv run python scripts/analyze.py template.docx

# 3. Edit XML files in "$VIBEWORK_SCRATCH/workspace/word/"
# 4. Finish session
uv run python scripts/session.py finish "$VIBEWORK_SCRATCH/workspace" output.docx
```

**Read [editing.md](references/editing.md) for complete template workflow details.**

### Create from Scratch (ONLY when no template exists)

Use docx-js **only** when:
- User explicitly says "create from scratch"
- No template or reference file is provided
- User wants a completely new design

**Read [docxjs.md](references/docxjs.md) for JavaScript API.**

---

## Dependencies

**BEFORE running any scripts, set up the environment. Do this once per workspace.**

**Tools**: run `uv` (Python) and `vibework-js` (JavaScript, Bun-compatible) as plain commands; Vibework puts both on the PATH.

**Python environment** (uv):
```bash
# Create venv and install packages
uv venv
uv pip install defusedxml Pillow lxml "markitdown[docx]" pymupdf
```

Then run scripts with:
```bash
uv run python scripts/session.py start doc.docx "$VIBEWORK_SCRATCH/workspace"
```

**JavaScript packages** (vibework-js):
```bash
vibework-js add docx
```

**System tools** (optional):
- Pandoc - text extraction with tracked changes

**PDF conversion:** local LibreOffice is required for Office-to-PDF export (see Local PDF conversion below).

**Verify before starting:**
```bash
# Check Python packages
uv run python -c "import defusedxml, PIL, lxml, markitdown, pymupdf; print('OK')"

# Check JavaScript packages
vibework-js -e "require('docx'); console.log('OK')"
```

---

## Workflows

### 1. Analyze First

Always start by understanding the document structure:

```bash
python scripts/analyze.py document.docx
```

Output includes:
- Paragraph count and structure
- Word count
- Styles used
- Tracked changes status
- Comment count

For JSON output:
```bash
python scripts/analyze.py document.docx --json
```

With thumbnail pages:
```bash
python scripts/analyze.py document.docx --thumbnails "$VIBEWORK_SCRATCH/pages.jpg"
```

### 2. Quick Edits

For simple find/replace operations:

```bash
python scripts/quickEdit.py doc.docx "PLACEHOLDER" "Actual Value" output.docx
```

Multiple replacements from JSON:
```bash
# Create replacements.json: {"old1": "new1", "old2": "new2"}
python scripts/quickEdit.py doc.docx --replacements changes.json output.docx
```

Dry run to preview changes:
```bash
python scripts/quickEdit.py doc.docx "OLD" "NEW" output.docx --dry-run
```

### 3. Full Editing Session

For complex edits requiring direct XML manipulation:

```bash
# Start session (unpacks to "$VIBEWORK_SCRATCH/workspace")
python scripts/session.py start doc.docx "$VIBEWORK_SCRATCH/workspace"

# Edit XML files directly
# Files are in: "$VIBEWORK_SCRATCH/workspace/word/document.xml"

# Finish session (validates, cleans, repacks)
python scripts/session.py finish "$VIBEWORK_SCRATCH/workspace" output.docx
```

Session commands:
- `start <input.docx> <workspace/>` - Unpack and create session
- `finish <workspace/> <output.docx>` - Pack with validation
- `abort <workspace/>` - Cancel without saving
- `status <workspace/>` - Show session info

### 4. Create from Markdown

Generate documents from structured Markdown:

```bash
python scripts/fromOutline.py outline.md output.docx
```

Markdown format:
```markdown
# Document Title

## Section Heading
Paragraph content here.

- Bullet point one
- Bullet point two

### Subsection
More content.
```

Preview structure:
```bash
python scripts/fromOutline.py outline.md --preview
```

### 5. Export Pages

Export pages as images:

```bash
python scripts/exportPages.py document.docx "$VIBEWORK_SCRATCH/pages/"
```

Options:
- `--format png|jpeg` - Image format (default: jpeg)
- `--dpi 150` - Resolution (default: 150)
- `--pages 1,3,5` - Export specific pages

### 6. Working with Tracked Changes

Extract text with tracked changes visible:
```bash
pandoc --track-changes=all document.docx -o output.md
```

### 7. Adding Comments

During an editing session, add comments programmatically:
```bash
python scripts/comment.py "$VIBEWORK_SCRATCH/workspace" 0 "Comment text"
python scripts/comment.py "$VIBEWORK_SCRATCH/workspace" 1 "Reply text" --parent 0
```

Then add markers to document.xml (see [editing.md](references/editing.md)).

---

## Python API

For programmatic use, import from `core.py`:

```python
from core import Document, unpackDocument, packDocument

# Quick text replacement
doc = Document.fromFile("input.docx", "workspace/")
count = doc.replaceText("old", "new")
doc.saveAll()
doc.pack("output.docx", originalFile="input.docx")

# Analyze paragraphs
for para in doc.paragraphs:
    print(f"Para {para.index}: {para.text[:50]}")

# Find text
matches = doc.findText(r"\d{4}-\d{2}-\d{2}")
for para, text in matches:
    print(f"Found '{text}' in paragraph {para.index}")

# Check for tracked changes/comments
if doc.hasTrackedChanges():
    print("Document has tracked changes")
if doc.hasComments():
    print("Document has comments")
```

### Key Classes

**`Document`** - Represents an unpacked document
- `Document.fromFile(docxPath, workspaceDir)` - Create from file
- `doc.paragraphs` - List of Paragraph objects
- `doc.replaceText(old, new)` - Replace across all paragraphs
- `doc.findText(pattern)` - Search with regex
- `doc.saveAll()` - Save modifications
- `doc.pack(outputPath)` - Create output file
- `doc.hasTrackedChanges()` - Check for tracked changes
- `doc.hasComments()` - Check for comments

**`Paragraph`** - Represents a single paragraph
- `para.text` - Get paragraph text
- `para.style` - Get paragraph style
- `para.replaceText(old, new)` - Replace in this paragraph

### Utility Functions

```python
from core import extractDocumentInfo, extractAllText

# Get document info without unpacking
info = extractDocumentInfo("document.docx")
# {'paragraphCount': 25, 'wordCount': 1500, 'hasTrackedChanges': True, 'hasComments': False}

# Extract all text without unpacking
text = extractAllText("document.docx")
```

---

## QA (Required)

**Assume there are problems. Your job is to find them.**

### Content QA

```bash
python -m markitdown output.docx
```

Check for missing content, typos, wrong order.

**When using templates, check for leftover placeholder text:**

```bash
python -m markitdown output.docx | grep -iE "xxxx|lorem|ipsum|placeholder|sample"
```

### Visual QA

**⚠️ USE THUMBNAIL GRID** — Do NOT read individual page images, as this fills up context. Always use `thumbnail.py` to create a single grid image containing all pages:

```bash
python scripts/thumbnail.py output.docx "$VIBEWORK_SCRATCH/grid.jpg"
```

Then read the single grid image for visual inspection.

Check for:
- Formatting issues
- Missing content
- Broken layouts
- Tracked change artifacts
- Overlapping elements
- Text overflow or cut off

---

## Code Style

This skill uses camelCase conventions:

| Element | Convention | Example |
|---------|------------|---------|
| Functions | camelCase | `getText()`, `parseParagraph()` |
| Variables | camelCase | `paragraphCount`, `textContent` |
| Classes | PascalCase | `Document`, `Paragraph`, `Session` |
| Constants | SCREAMING_SNAKE | `DEFAULT_FONT`, `WORDPROCESSING_NAMESPACE` |
| Files | camelCase | `quickEdit.py`, `fromOutline.py` |

---

## Comparison with docx Skill

| Feature | vibework-docx | docx |
|---------|--------------|------|
| API style | camelCase | snake_case |
| Session management | Built-in | Manual |
| Quick edit | Single command | Unpack -> edit -> pack |
| From Markdown | Yes | No |
| Validation | Automatic | Optional |

Use **vibework-docx** when:
- You want a simpler, higher-level API
- Quick text replacements are the primary task
- Generating documents from outlines

Use **docx** when:
- You need fine-grained XML control
- Working with complex tracked changes
- Integrating with existing docx scripts

## Local PDF conversion

The Python `scripts/converter.py` uses local LibreOffice for DOCX/PPTX PDF export and the thumbnail/page export scripts. No document is uploaded and there is no network fallback. It finds `soffice` on PATH or in common installation locations and uses a temporary profile so an open LibreOffice window does not interfere.

If LibreOffice is missing, skip conversion steps used only for your own visual QA or thumbnails, note that visual verification was skipped, and continue delivering the editable document. Do not claim that visual QA passed. For an explicit PDF request, explain that LibreOffice must be installed (`brew install --cask libreoffice` on macOS, or https://www.libreoffice.org/download/download-libreoffice/) and rerun conversion afterward. Do not silently substitute a different deliverable.

For newer Slides-format decks, use the **vibework-slides** skill's `scripts/export.ts`: it renders PDF locally in a headless browser and does not require LibreOffice. The LibreOffice path is for Office files (.docx/.pptx).
