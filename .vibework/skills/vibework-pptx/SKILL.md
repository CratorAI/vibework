---
name: vibework-pptx
description: "PowerPoint creation and editing. When a template .pptx is provided, ALWAYS use the template workflow (session.py). Only use pptxgenjs when creating from scratch with no template."
---

# VibeworkPPTX

**Working files go in the task's scratch folder**, not the working folder: `$VIBEWORK_SCRATCH` (its full path is also in your instructions). That means the unpacked `workspace/`, thumbnail grids, page and slide images, extracted text and helper scripts. Quote it in commands (`"$VIBEWORK_SCRATCH/workspace"`): the path has a space. Only the finished file the user asked for goes in the working folder.

Opinionated PowerPoint workflow using unpack → edit → pack. **When a template is provided, use it** — don't recreate from scratch.

## Quick Reference

| Task | Guide |
|------|-------|
| **Use template (.pptx provided)** | `session.py start` → edit → `session.py finish` ([editing.md](references/editing.md)) |
| Read/analyze content | `python scripts/analyze.py presentation.pptx` |
| Quick text replacement | `python scripts/quickEdit.py in.pptx "old" "new" out.pptx` |
| Duplicate slide (in session) | `python scripts/addSlide.py ./workspace slide1.xml` |
| Create from scratch (no template) | Read [pptxgenjs.md](references/pptxgenjs.md) |
| Create from Markdown outline | `python scripts/fromOutline.py outline.md output.pptx` |
| Export to images | `python scripts/exportSlides.py presentation.pptx "$VIBEWORK_SCRATCH/slides/"` (writes `slide-01.jpg`, `slide-02.jpg`, … by slide number; prints each path) |
| Create thumbnail grid | `python scripts/thumbnail.py presentation.pptx "$VIBEWORK_SCRATCH/grid.jpg"` (writes `grid.jpg`, or `grid-1.jpg`, `grid-2.jpg`, … for a long deck; prints each path) |

**References:** [editing.md](references/editing.md) (template workflow), [pptxgenjs.md](references/pptxgenjs.md) (JavaScript API), [outline-format.md](references/outline-format.md) (Markdown spec)

---

## ⚠️ CRITICAL: Which Workflow to Use

**STOP and read this before doing anything else.**

| User says... | Use this workflow |
|--------------|-------------------|
| "Use X.pptx as template" | **Template Workflow** (session.py) |
| "Based on this presentation..." | **Template Workflow** (session.py) |
| "Edit/modify this deck" | **Template Workflow** (session.py) |
| "Create from scratch" / no file given | **pptxgenjs** (JavaScript) |

### Template Workflow (When a .pptx file is provided)

**DO NOT use pptxgenjs when the user provides a template file.** The template has styling, layouts, and branding that must be preserved.

```bash
# 1. Start session with the template
uv run python scripts/session.py start template.pptx "$VIBEWORK_SCRATCH/workspace"

# 2. Analyze the template structure
uv run python scripts/analyze.py template.pptx

# 3. Duplicate slides as needed
uv run python scripts/addSlide.py "$VIBEWORK_SCRATCH/workspace" slide1.xml

# 4. Edit XML files in "$VIBEWORK_SCRATCH/workspace/ppt/slides/"
# 5. Finish session
uv run python scripts/session.py finish "$VIBEWORK_SCRATCH/workspace" output.pptx
```

**Read [editing.md](references/editing.md) for complete template workflow details.**

### Create from Scratch (ONLY when no template exists)

Use pptxgenjs **only** when:
- User explicitly says "create from scratch"
- No template or reference file is provided
- User wants a completely new design

**Read [pptxgenjs.md](references/pptxgenjs.md) for JavaScript API.**

---

## Dependencies

**BEFORE running any scripts, set up the environment. Do this once per workspace.**

**Python environment** (uv):
```bash
# Create venv and install packages
uv venv
uv pip install defusedxml Pillow lxml "markitdown[pptx]" pymupdf
```

Then run scripts with:
```bash
uv run script.py
```

**JavaScript packages** (vibework-js, Bun-compatible, on the PATH):
```bash
vibework-js add pptxgenjs
```

**PDF conversion:** local LibreOffice is required for Office-to-PDF export (see Local PDF conversion below).

**Verify before starting:**
```bash
# Check Python packages
uv run python -c "import defusedxml, PIL, lxml, markitdown, pymupdf; print('OK')"

# Check JavaScript packages
vibework-js -e "require('pptxgenjs'); console.log('OK')"
```

---

## Creating from Scratch (No Template)

> ⚠️ **ONLY use this approach when NO template file is provided.** If the user gave you a .pptx file to use as a template, use the **Template Workflow** instead (see [Which Workflow to Use](#️-critical-which-workflow-to-use) above).

**Read [pptxgenjs.md](references/pptxgenjs.md) for full details.**

Write JavaScript using pptxgenjs:

```javascript
const pptxgen = require("pptxgenjs");

let presentation = new pptxgen();
presentation.layout = "LAYOUT_16x9";

let titleSlide = presentation.addSlide();
titleSlide.addText("Presentation Title", {
  x: 0.5, y: 2, w: 9, h: 1.5,
  fontSize: 44, fontFace: "Arial",
  color: "1E293B", bold: true,
  align: "center", valign: "middle"
});

presentation.writeFile({ fileName: "output.pptx" });
```

Run with vibework-js:
```bash
vibework-js run create-presentation.js
```

---

## Slide Design

**Don't create boring slides.** Plain bullets on a white background won't impress anyone. Consider ideas from this list for each slide.

### Before Starting

- **Choose a topic-specific color palette**: The palette should feel designed for THIS presentation. If swapping your colors into a completely different deck would still "work," you haven't made specific enough choices.
- **Establish visual hierarchy**: One color should dominate (60-70% visual weight), with 1-2 supporting tones and one sharp accent. Never give all colors equal weight.
- **Plan your contrast strategy**: Dark backgrounds for title + conclusion slides, light for content ("sandwich" structure). Or commit to dark throughout for a premium feel.
- **Pick a visual motif**: Choose ONE distinctive element and repeat it — rounded image frames, icons in colored circles, thick single-side borders. Carry it across every slide.

### Color Palettes

Choose colors that match your topic — don't default to generic blue. Consider these palettes:

| Theme | Primary | Secondary | Accent |
|-------|---------|-----------|--------|
| **Slate & Sky** | `334155` (slate) | `F1F5F9` (light gray) | `0EA5E9` (sky blue) |
| **Indigo Night** | `312E81` (indigo) | `E0E7FF` (lavender) | `818CF8` (violet) |
| **Emerald Garden** | `065F46` (emerald) | `ECFDF5` (mint cream) | `34D399` (seafoam) |
| **Amber Glow** | `92400E` (amber) | `FFFBEB` (cream) | `FBBF24` (gold) |
| **Rose Quartz** | `9F1239` (rose) | `FFF1F2` (blush) | `FB7185` (coral) |
| **Cyan Tech** | `155E75` (cyan) | `ECFEFF` (ice) | `22D3EE` (electric) |
| **Stone Minimal** | `44403C` (stone) | `FAFAF9` (warm white) | `A8A29E` (taupe) |
| **Violet Dream** | `5B21B6` (violet) | `F5F3FF` (ghost) | `C4B5FD` (wisteria) |
| **Teal Ocean** | `0F766E` (teal) | `F0FDFA` (aqua mist) | `2DD4BF` (turquoise) |
| **Zinc Modern** | `27272A` (zinc) | `FAFAFA` (snow) | `71717A` (gray) |

### Layout Options

**Every slide needs a visual element** — image, chart, icon, or shape. Text-only slides are forgettable.

Consider these layout patterns:

- **Two-column split** (text left, illustration right) — Works well for explaining concepts with supporting visuals. Keep text to 3-5 bullet points max.
- **Icon + text rows** (icon in colored circle, bold header, description below) — Effective for features, benefits, or process steps. Use 3-4 items per slide.
- **Grid layouts** (2x2 or 2x3) — Good for comparing options, showing team members, or displaying related concepts. Keep each cell balanced.
- **Half-bleed image** (full left or right side) with content overlay — Creates visual impact. Use for section dividers or key messages.
- **Large stat callouts** (big numbers 60-72pt with small labels below) — Perfect for metrics, KPIs, or impressive figures. Limit to 1-3 stats per slide.
- **Comparison columns** (before/after, pros/cons, side-by-side options) — Clear way to show differences. Use consistent formatting across columns.
- **Timeline or process flow** (numbered steps, connecting arrows) — Shows progression or workflow. Keep to 4-6 steps maximum.

### Visual Polish

- Icons in small colored circles next to section headers add professionalism
- Italic accent text works well for key stats or taglines
- Subtle drop shadows on cards create depth without distraction
- Consistent corner radius (0 for sharp, 0.1" for slightly rounded) across all shapes

### Typography

**Choose a font pairing with intention** — don't default to Arial everywhere. Pick a header font with personality and pair it with a clean body font.

| Header Font | Body Font | Character |
|-------------|-----------|-----------|
| Georgia | Calibri | Traditional, trustworthy |
| Arial Black | Arial | Bold, modern |
| Calibri Light | Calibri | Clean, contemporary |
| Cambria | Calibri | Elegant, readable |
| Trebuchet MS | Calibri | Friendly, approachable |
| Impact | Arial | Powerful, attention-grabbing |
| Palatino | Garamond | Sophisticated, classic |
| Consolas | Calibri | Technical, precise |

**Size guidelines:**

| Element | Size | Notes |
|---------|------|-------|
| Slide title | 36-44pt bold | Must stand out clearly |
| Section header | 20-24pt bold | For content groupings |
| Body text | 14-16pt | Easy to read from distance |
| Captions | 10-12pt muted | Sources, footnotes |

### Spacing

- 0.5" minimum margins from slide edges
- 0.3-0.5" between content blocks
- Leave breathing room — don't fill every inch
- Consistent gaps throughout (pick 0.3" or 0.5" and stick with it)

### Common Mistakes to Avoid

- **Don't repeat the same layout** — vary columns, cards, and callouts across slides
- **Don't center body text** — left-align paragraphs and lists; center only titles
- **Don't skimp on size contrast** — titles need 36pt+ to stand out from 14-16pt body
- **Don't default to blue** — pick colors that reflect the specific topic
- **Don't style one slide and leave the rest plain** — commit fully or keep it simple throughout
- **Don't create text-only slides** — add images, icons, charts, or visual elements
- **Don't forget text box padding** — when aligning lines or shapes with text edges, set `margin: 0` on the text box or offset the shape to account for padding
- **Don't use low-contrast elements** — icons AND text need strong contrast against the background
- **NEVER use horizontal lines to separate title and body** — use whitespace or background color instead

---

## QA (Required)

**Assume there are problems. Your job is to find them.**

Your first render is almost never correct. Approach QA as a bug hunt, not a confirmation step. If you found zero issues on first inspection, you weren't looking hard enough.

### Content QA

```bash
python -m markitdown output.pptx
```

Check for missing content, typos, wrong order.

**When using templates, check for leftover placeholder text:**

```bash
python -m markitdown output.pptx | grep -iE "xxxx|lorem|ipsum|placeholder|sample"
```

If grep returns results, fix them before declaring success.

### Visual QA

**⚠️ USE THUMBNAIL GRID** — Do NOT read individual slide images, as this fills up context. Always use `thumbnail.py` to create a single grid image containing all slides:

```bash
python scripts/thumbnail.py output.pptx "$VIBEWORK_SCRATCH/grid.jpg"
```

Then read the single grid image for visual inspection.

When inspecting, look for:

- Overlapping elements (text through shapes, lines through words, stacked elements)
- Text overflow or cut off at edges/box boundaries
- Decorative lines positioned for single-line text but title wrapped to two lines
- Source citations or footers colliding with content above
- Elements too close (< 0.3" gaps) or cards/sections nearly touching
- Uneven gaps (large empty area in one place, cramped in another)
- Insufficient margin from slide edges (< 0.5")
- Columns or similar elements not aligned consistently
- Low-contrast text (e.g., light gray text on cream-colored background)
- Low-contrast icons (e.g., dark icons on dark backgrounds without a contrasting circle)
- Text boxes too narrow causing excessive wrapping
- Leftover placeholder content

### Verification Loop

1. Generate slides → Convert to images → Inspect
2. **List issues found** (if none found, look again more critically)
3. Fix issues
4. **Re-verify affected slides** — one fix often creates another problem
5. Repeat until a full pass reveals no new issues

**Do not declare success until you've completed at least one fix-and-verify cycle.**

---

## Converting to Images

**For QA**, use the thumbnail grid (single image, saves context):

```bash
python scripts/thumbnail.py output.pptx "$VIBEWORK_SCRATCH/grid.jpg"
```

**For individual slide images** (when needed for other purposes):

```bash
python scripts/exportSlides.py output.pptx "$VIBEWORK_SCRATCH/slides/"
```

This creates `slide-01.jpg`, `slide-02.jpg`, etc.

To export specific slides:

```bash
python scripts/exportSlides.py output.pptx "$VIBEWORK_SCRATCH/slides/" --slides 1,3,5
```

---

## Workflows

### 1. Analyze First

Always start by understanding the presentation structure:

```bash
python scripts/analyze.py presentation.pptx
```

Output includes:
- Slide count and structure
- Text content summary
- Layout types used
- Hidden slides

For JSON output:
```bash
python scripts/analyze.py presentation.pptx --json
```

With thumbnail grid:
```bash
python scripts/analyze.py presentation.pptx --thumbnails "$VIBEWORK_SCRATCH/grid.jpg"
```

### 2. Quick Edits

For simple find/replace operations:

```bash
python scripts/quickEdit.py deck.pptx "PLACEHOLDER" "Actual Value" output.pptx
```

Multiple replacements from JSON:
```bash
# Create replacements.json: {"old1": "new1", "old2": "new2"}
python scripts/quickEdit.py deck.pptx --replacements replacements.json output.pptx
```

Dry run to preview changes:
```bash
python scripts/quickEdit.py deck.pptx "OLD" "NEW" output.pptx --dry-run
```

### 3. Full Editing Session

For complex edits requiring direct XML manipulation:

```bash
# Start session (unpacks to "$VIBEWORK_SCRATCH/workspace")
python scripts/session.py start deck.pptx "$VIBEWORK_SCRATCH/workspace"

# Edit XML files directly
# Files are in: "$VIBEWORK_SCRATCH/workspace/ppt/slides/slide1.xml", slide2.xml, etc.

# Finish session (validates, cleans, repacks)
python scripts/session.py finish "$VIBEWORK_SCRATCH/workspace" output.pptx
```

Session commands:
- `start <input.pptx> <workspace/>` - Unpack and create session
- `finish <workspace/> <output.pptx>` - Pack with validation
- `abort <workspace/>` - Cancel without saving
- `status <workspace/>` - Show session info

### 4. Create from Markdown

Generate presentations from structured Markdown:

```bash
python scripts/fromOutline.py outline.md output.pptx
```

Markdown format:
```markdown
# Presentation Title

Subtitle text

## Slide Title
- Bullet point one
- Bullet point two

## Another Slide
Paragraph content here.

> Speaker notes in blockquotes
```

With template:
```bash
python scripts/fromOutline.py outline.md output.pptx --template dark
```

Available templates: `minimal` (default), `corporate`, `dark`

Preview structure:
```bash
python scripts/fromOutline.py outline.md --preview
```

### 5. Export Slides

Export slides as images:

```bash
python scripts/exportSlides.py presentation.pptx "$VIBEWORK_SCRATCH/slides/"
```

Options:
- `--format png|jpeg` - Image format (default: jpeg)
- `--dpi 150` - Resolution (default: 150)
- `--slides 1,3,5` - Export specific slides

## Python API

For programmatic use, import from `core.py`:

```python
from core import Deck, unpackPresentation, packPresentation

# Quick text replacement
deck = Deck.fromFile("input.pptx", "workspace/")
count = deck.replaceText("old", "new")
deck.saveAll()
deck.pack("output.pptx", originalFile="input.pptx")

# Analyze slides
for slide in deck.slides:
    print(f"Slide {slide.slideNumber}: {slide.getTextContent()[:50]}")

# Find text
matches = deck.findText(r"Q[1-4] \d{4}")
for slide, text, idx in matches:
    print(f"Found '{text}' in {slide.name}")
```

### Key Classes

**`Deck`** - Represents an unpacked presentation
- `Deck.fromFile(pptxPath, workspaceDir)` - Create from file
- `deck.slides` - List of Slide objects
- `deck.replaceText(old, new)` - Replace across all slides
- `deck.findText(pattern)` - Search with regex
- `deck.saveAll()` - Save all modifications
- `deck.pack(outputPath)` - Create output file

**`Slide`** - Represents a single slide
- `slide.getText()` - Get all text as list
- `slide.getTextContent()` - Get all text as string
- `slide.replaceText(old, new)` - Replace in this slide
- `slide.save()` - Save modifications

### Utility Functions

```python
from core import extractSlideInfo, extractAllText

# Get slide info without unpacking
info = extractSlideInfo("presentation.pptx")
# [{'name': 'slide1.xml', 'hidden': False, 'slideNumber': 1}, ...]

# Extract all text without unpacking
text = extractAllText("presentation.pptx")
# {'slide1.xml': ['Title', 'Bullet 1', ...], ...}
```

## Code Style

This skill uses camelCase conventions:

| Element | Convention | Example |
|---------|------------|---------|
| Functions | camelCase | `getText()`, `parseSlide()` |
| Variables | camelCase | `slideCount`, `textContent` |
| Classes | PascalCase | `Deck`, `Slide`, `Session` |
| Constants | SCREAMING_SNAKE | `DEFAULT_FONT`, `SLIDE_NAMESPACE` |
| Files | camelCase | `quickEdit.py`, `fromOutline.py` |

## Comparison with pptx Skill

| Feature | vibework-pptx | pptx |
|---------|--------------|------|
| API style | camelCase | snake_case |
| Session management | Built-in | Manual |
| Quick edit | Single command | Unpack → edit → pack |
| From Markdown | Yes | No |
| Validation | Automatic | Optional |

Use **vibework-pptx** when:
- You want a simpler, higher-level API
- Quick text replacements are the primary task
- Generating presentations from outlines

Use **pptx** when:
- You need fine-grained XML control
- Working with complex layouts or animations
- Integrating with existing pptx scripts

## Local PDF conversion

The Python `scripts/converter.py` uses local LibreOffice for DOCX/PPTX PDF export and the thumbnail/page export scripts. No document is uploaded and there is no network fallback. It finds `soffice` on PATH or in common installation locations and uses a temporary profile so an open LibreOffice window does not interfere.

If LibreOffice is missing, skip conversion steps used only for your own visual QA or thumbnails, note that visual verification was skipped, and continue delivering the editable document. Do not claim that visual QA passed. For an explicit PDF request, explain that LibreOffice must be installed (`brew install --cask libreoffice` on macOS, or https://www.libreoffice.org/download/download-libreoffice/) and rerun conversion afterward. Do not silently substitute a different deliverable.

For newer Slides-format decks, use the **vibework-slides** skill's `scripts/export.ts`: it renders PDF locally in a headless browser and does not require LibreOffice. The LibreOffice path is for Office files (.docx/.pptx).
