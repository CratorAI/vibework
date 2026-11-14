# vibework-docx Skill

An opinionated wrapper around the existing `docx` skill with camelCase code style and simplified workflows.

## Design Principles

### 1. Opinionated Workflows
- Strong preferences encoded in decision trees
- "When a template is provided, ALWAYS use the template workflow"
- Guide users to the right approach instead of giving them choices

### 2. Higher-Level Abstractions
- Raw XML manipulation -> Classes that encapsulate complexity
- `Document` class with `paragraphs`, `replaceText()`, `findText()`, `pack()`
- `Paragraph` class with `text`, `style`, `replaceText()`

### 3. Session-Based Editing
- Manual "unpack -> edit -> pack" -> Managed sessions with state tracking
- `.vibework-session.json` tracks original file, start time, workspace
- Commands: `start`, `finish`, `abort`, `status`
- Clean exit handling

### 4. Quick Operations for Simple Tasks
- Not everything needs a full session
- `quickEdit.py` for one-liner find/replace
- `analyze.py` for quick structure inspection
- Graduated complexity: quick operation < session < full XML editing

### 5. camelCase Consistency
- Unified code style across all scripts
- Functions: `getText()`, `parseParagraph()`
- Variables: `paragraphCount`, `textContent`
- Files: `quickEdit.py`, `fromOutline.py`

### 6. Self-Contained
- Own copy of `office/` module (unpack, pack, validate, soffice)
- Own `templates/` directory
- No runtime dependencies on the original skill
- Can be moved/copied independently

### 7. Template-First Philosophy
- When user provides a .docx file -> use it as template
- Preserve existing styling, formatting, branding
- Only create from scratch when explicitly requested

### 8. Built-in QA
- `analyze.py` for structure verification
- `exportPages.py` / `thumbnail.py` for visual inspection
- markitdown for content extraction
- Verification loop: generate -> inspect -> fix -> re-verify

## Structure

```
vibework-docx/
├── SKILL.md                    # Entry point and documentation
├── README.md                   # Design principles (this file)
├── scripts/
│   ├── __init__.py
│   ├── core.py                 # Document/Paragraph classes
│   ├── session.py              # Session management
│   ├── analyze.py              # Document analysis
│   ├── quickEdit.py            # Quick find/replace
│   ├── comment.py              # Comment management
│   ├── acceptChanges.py        # Accept tracked changes
│   ├── fromOutline.py          # Markdown -> DOCX
│   ├── exportPages.py          # DOCX -> images
│   ├── thumbnail.py            # Thumbnail grid
│   ├── clean.py                # Clean unreferenced files
│   └── office/                 # Self-contained
│       ├── __init__.py
│       ├── unpack.py
│       ├── pack.py
│       ├── validate.py
│       ├── soffice.py
│       ├── helpers/
│       ├── validators/
│       └── schemas/
├── templates/                  # Comment XML templates
│   ├── comments.xml
│   ├── commentsExtended.xml
│   ├── commentsExtensible.xml
│   ├── commentsIds.xml
│   └── people.xml
└── references/
    ├── editing.md              # Template editing workflow
    ├── docxjs.md               # JavaScript API for creation
    └── tracked-changes.md      # Tracked changes XML reference
```

## Code Style

| Element | Convention | Example |
|---------|------------|---------|
| Functions | camelCase | `getText()`, `parseParagraph()` |
| Variables | camelCase | `paragraphCount`, `textContent` |
| Classes | PascalCase | `Document`, `Paragraph`, `Session` |
| Constants | SCREAMING_SNAKE | `DEFAULT_FONT`, `WORDPROCESSING_NAMESPACE` |
| Files | camelCase | `quickEdit.py`, `fromOutline.py` |

## Scripts

### core.py
Shared utilities and classes:
- `unpackDocument()`, `packDocument()`, `cleanWorkspace()` - Wrappers for office/*
- `Document` class - Represents unpacked document with `paragraphs`, `replaceText()`, `findText()`, `pack()`
- `Paragraph` class - Represents single paragraph with `text`, `style`, `replaceText()`
- XML helpers: `parseXml()`, `getTextElements()`, `serializeXml()`

### session.py
Session management for editing workflow:
- `startSession(docxPath, workspaceDir)` - Unpack and create session
- `finishSession(workspaceDir, outputPath)` - Validate, clean, and pack
- `abortSession(workspaceDir)` - Cancel without saving
- `getSession(workspaceDir)` - Get current session state
- Session state stored in `.vibework-session.json`

### analyze.py
Document analysis:
- `analyzeDocument(docxPath)` -> `DocumentAnalysis` dataclass
- Extracts paragraph info, text content, styles, word counts
- Tracked changes and comments detection
- Optional thumbnail page generation
- JSON and formatted text output

### quickEdit.py
Find/replace operations:
- `quickEdit(inputPath, outputPath, replacements)` -> statistics dict
- Single command text replacement without manual XML editing
- Supports JSON file with multiple replacements
- Dry-run mode for previewing changes

### comment.py
Comment management:
- `addComment(unpackedDir, commentId, text, author, initials, parentId)`
- Creates all required comment XML files
- Supports replies via parentId
- Outputs marker placement instructions

### acceptChanges.py
Tracked changes handling:
- `acceptChanges(inputFile, outputFile)`
- Uses LibreOffice macro to accept all tracked changes
- Produces clean document without change markup

### fromOutline.py
Markdown to DOCX generation:
- `parseOutline(content)` -> `Outline` dataclass
- `generateDocument(outline, outputPath)` -> output path
- Uses docx-js via vibework-js (Bun-compatible) for generation
- Supports headings, paragraphs, bullets

### exportPages.py / thumbnail.py
Image export:
- `exportPages(docxPath, outputDir, dpi, format)` -> list of image paths
- `thumbnail.py` creates grid layout of page thumbnails
- Uses LibreOffice (soffice) for PDF conversion
- Uses Poppler (pdftoppm) for image generation

## Dependencies

**Wraps from docx skill:**
- `docx/scripts/office/unpack.py`
- `docx/scripts/office/pack.py`
- `docx/scripts/templates/*.xml`

**Python (stdlib):** pathlib, json, re, subprocess, tempfile, dataclasses, zipfile

**Python (pip):** defusedxml, Pillow (optional for thumbnails)

**System (optional):** LibreOffice (soffice), Poppler (pdftoppm), Pandoc, vibework-js + docx

## Verification

```bash
# Test session workflow
python scripts/session.py start test.docx workspace/
# Edit workspace/word/document.xml
python scripts/session.py finish workspace/ output.docx

# Test Document class
python -c "from scripts.core import Document; d = Document.fromFile('test.docx', './ws'); print(d.paragraphCount)"

# Test quickEdit
python scripts/quickEdit.py test.docx "PLACEHOLDER" "Actual Text" out.docx

# Test analyze
python scripts/analyze.py test.docx

# Test export
python scripts/exportPages.py test.docx images/
```
