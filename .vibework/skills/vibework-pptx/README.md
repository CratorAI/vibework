# vibework-pptx Skill

An opinionated wrapper around the existing `pptx` skill with camelCase code style and simplified workflows.

## Structure

```
vibework-pptx/
├── SKILL.md                    # Entry point and documentation
├── scripts/
│   ├── core.py                 # Shared utilities, wraps pptx/scripts/office/*
│   ├── analyze.py              # Analyze presentation structure
│   ├── quickEdit.py            # Simple find/replace text
│   ├── session.py              # start/finish editing workflow
│   ├── fromOutline.py          # Markdown → PPTX generation
│   └── exportSlides.py         # PPTX → images
├── templates/
│   ├── minimal.json            # Clean black on white
│   ├── corporate.json          # Professional blue tones
│   └── dark.json               # Light text on dark background
└── references/
    ├── editing.md              # Template-based editing workflow
    ├── outline-format.md       # Markdown outline specification
    └── pptxgenjs.md            # PptxGenJS API reference
```

## Code Style

| Element | Convention | Example |
|---------|------------|---------|
| Functions | camelCase | `getText()`, `parseSlide()` |
| Variables | camelCase | `slideCount`, `textContent` |
| Classes | PascalCase | `Deck`, `Slide`, `Session` |
| Constants | SCREAMING_SNAKE | `DEFAULT_FONT`, `SLIDE_NAMESPACE` |
| Files | camelCase | `quickEdit.py`, `fromOutline.py` |

## Design Decision

**Wrap existing scripts, don't reimplement.** The `pptx/scripts/office/` code handles complex XML validation, smart quotes, and schema checking. We import and wrap those functions rather than duplicating:

```python
# core.py approach
import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "pptx" / "scripts"))
from office.unpack import unpack as _unpack
from office.pack import pack as _pack
from clean import clean_unused_files as _clean
```

## Scripts

### core.py
Shared utilities and classes:
- `unpackPresentation()`, `packPresentation()`, `cleanWorkspace()` - Wrappers for pptx/scripts/office/*
- `Deck` class - Represents unpacked presentation with `slides`, `replaceText()`, `findText()`, `pack()`
- `Slide` class - Represents single slide with `getText()`, `replaceText()`, `save()`
- XML helpers: `parseXml()`, `getTextElements()`, `serializeXml()`

### session.py
Session management for editing workflow:
- `startSession(pptxPath, workspaceDir)` - Unpack and create session
- `finishSession(workspaceDir, outputPath)` - Validate, clean, and pack
- `abortSession(workspaceDir)` - Cancel without saving
- `getSession(workspaceDir)` - Get current session state
- Session state stored in `.vibework-session.json`

### analyze.py
Presentation analysis:
- `analyzePresentation(pptxPath)` → `DeckAnalysis` dataclass
- Extracts slide info, text content, layouts, word counts
- Optional thumbnail grid generation
- JSON and formatted text output

### exportSlides.py
Image export:
- `exportSlides(pptxPath, outputDir, dpi, format)` → list of image paths
- Uses LibreOffice (soffice) for PDF conversion
- Uses Poppler (pdftoppm) for image generation
- Supports JPEG, PNG, TIFF formats

### quickEdit.py
Find/replace operations:
- `quickEdit(inputPath, outputPath, replacements)` → statistics dict
- Single command text replacement without manual XML editing
- Supports JSON file with multiple replacements
- Dry-run mode for previewing changes

### fromOutline.py
Markdown to PPTX generation:
- `parseOutline(content)` → `Outline` dataclass
- `generatePresentation(outline, outputPath, template)` → output path
- Uses pptxgenjs via vibework-js (Bun-compatible) for generation
- Supports title slides, bullets, body text, speaker notes

## Dependencies

**Wraps from pptx skill:**
- `pptx/scripts/office/unpack.py`
- `pptx/scripts/office/pack.py`
- `pptx/scripts/clean.py`

**Python (stdlib):** pathlib, json, re, subprocess, tempfile, dataclasses, zipfile

**Python (pip):** defusedxml, Pillow (optional for thumbnails)

**System (optional):** LibreOffice (soffice), Poppler (pdftoppm), vibework-js + pptxgenjs

## Verification

```bash
# Test session workflow
python scripts/session.py start test.pptx workspace/
# Edit workspace/ppt/slides/slide1.xml
python scripts/session.py finish workspace/ output.pptx

# Test quickEdit
python scripts/quickEdit.py test.pptx "PLACEHOLDER" "Actual Text" out.pptx

# Test analyze
python scripts/analyze.py test.pptx

# Test export
python scripts/exportSlides.py test.pptx images/

# Test fromOutline
echo "# Test\n## Slide One\n- Point 1" > test.md
python scripts/fromOutline.py test.md out.pptx
```

## Registration

Added to `src-tauri/src/agent/tools/skills_tool.rs`:

```rust
SkillDefinition::new(
    "vibework-pptx",
    "Streamlined PowerPoint workflow with camelCase API. Use for quick text replacements (quickEdit), generating presentations from Markdown outlines (fromOutline), session-based editing workflow, and slide export to images. Simpler than the pptx skill for common tasks."
),
```
