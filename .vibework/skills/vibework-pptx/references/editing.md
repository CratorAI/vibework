# Editing Presentations

> **USE THIS WORKFLOW when the user provides a .pptx file as a template.** Do NOT use pptxgenjs to recreate from scratch — the template contains styling, layouts, and branding that must be preserved.

## Template-Based Workflow

When using an existing presentation as a template:

1. **Analyze the template**:
   ```bash
   uv run python scripts/analyze.py template.pptx --thumbnails "$VIBEWORK_SCRATCH/grid.jpg"
   uv run python -m markitdown template.pptx
   ```
   Review `$VIBEWORK_SCRATCH/grid.jpg` to see layouts, and markitdown output to see placeholder text.

2. **Plan slide mapping**: For each content section, choose a template slide.

   **USE VARIED LAYOUTS** — monotonous presentations are a common failure mode. Don't default to basic title + bullet slides. Actively seek out:
   - Multi-column layouts (2-column, 3-column)
   - Image + text combinations
   - Full-bleed images with text overlay
   - Quote or callout slides
   - Section dividers
   - Stat/number callouts
   - Icon grids or icon + text rows

   **Avoid:** Repeating the same text-heavy layout for every slide. If you find yourself using the same layout 3+ times in a row, stop and find alternatives.

   Match content type to layout style:
   | Content Type | Suggested Layout |
   |--------------|------------------|
   | Key points | Bullet slide or icon grid |
   | Team/people | Multi-column with images |
   | Testimonials | Quote slide with large text |
   | Statistics | Stat callout (big numbers) |
   | Process steps | Timeline or numbered flow |
   | Comparisons | Side-by-side columns |

3. **Start editing session**:
   ```bash
   uv run python scripts/session.py start template.pptx "$VIBEWORK_SCRATCH/workspace"
   ```

4. **Build presentation structure**:
   - Delete unwanted slides (remove from `<p:sldIdLst>` in presentation.xml)
   - Duplicate slides you want to reuse
   - Reorder slides in `<p:sldIdLst>`
   - **Complete all structural changes before editing content**

5. **Edit content**: Update text in each `$VIBEWORK_SCRATCH/workspace/ppt/slides/slide{N}.xml`

6. **Finish session**:
   ```bash
   uv run python scripts/session.py finish "$VIBEWORK_SCRATCH/workspace" output.pptx
   ```

---

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `session.py` | **Start here** — manage editing sessions (start/finish/abort) |
| `addSlide.py` | Duplicate slides within a session |
| `analyze.py` | Analyze structure, extract text, create thumbnails |
| `quickEdit.py` | Find/replace text without unpacking |
| `exportSlides.py` | Export slides as images |
| `fromOutline.py` | Generate from Markdown outline |

### session.py

```bash
# Start session - unpacks to "$VIBEWORK_SCRATCH/workspace"
uv run python scripts/session.py start input.pptx "$VIBEWORK_SCRATCH/workspace"

# Check session status
uv run python scripts/session.py status "$VIBEWORK_SCRATCH/workspace"

# Finish - validates, cleans, repacks
uv run python scripts/session.py finish "$VIBEWORK_SCRATCH/workspace" output.pptx

# Abort - cancel without saving
uv run python scripts/session.py abort "$VIBEWORK_SCRATCH/workspace"
```

### quickEdit.py

```bash
# Single replacement
uv run python scripts/quickEdit.py deck.pptx "OLD_TEXT" "New Text" output.pptx

# Multiple replacements from JSON
uv run python scripts/quickEdit.py deck.pptx --replacements changes.json output.pptx

# Dry run to preview
uv run python scripts/quickEdit.py deck.pptx "OLD" "NEW" output.pptx --dry-run
```

### analyze.py

```bash
# Basic analysis
uv run python scripts/analyze.py presentation.pptx

# With thumbnail grid
uv run python scripts/analyze.py presentation.pptx --thumbnails "$VIBEWORK_SCRATCH/grid.jpg"

# JSON output for programmatic use
uv run python scripts/analyze.py presentation.pptx --json
```

---

## Slide Operations

Slide order is in `$VIBEWORK_SCRATCH/workspace/ppt/presentation.xml` → `<p:sldIdLst>`.

**Reorder**: Rearrange `<p:sldId>` elements in the list.

**Delete**: Remove `<p:sldId>` from the list. The session finish step will clean orphaned files.

**Duplicate**: Use the `addSlide.py` script:
```bash
uv run python scripts/addSlide.py "$VIBEWORK_SCRATCH/workspace" slide{N}.xml
```
This copies the slide, its relationships, and updates `[Content_Types].xml` and `presentation.xml.rels`. You still need to add the `<p:sldId>` element to `presentation.xml` - the script prints the exact XML to add.

To create a new slide from a layout:
```bash
uv run python scripts/addSlide.py "$VIBEWORK_SCRATCH/workspace" slideLayout2.xml
```

---

## Editing Content

For each slide:
1. Read the slide's XML in `$VIBEWORK_SCRATCH/workspace/ppt/slides/slide{N}.xml`
2. Identify ALL placeholder content—text, images, charts, icons, captions
3. Replace each placeholder with final content

**Use the Edit tool for XML changes.** It forces specificity about what to replace and where.

### Formatting Rules

- **Bold all headers and inline labels**: Use `b="1"` on `<a:rPr>`. This includes:
  - Slide titles
  - Section headers within a slide
  - Inline labels like "Status:", "Description:" at the start of a line
- **Never use unicode bullets (•)**: Use proper list formatting with `<a:buChar>` or `<a:buAutoNum>`
- **Preserve line spacing**: Copy `<a:pPr>` from original paragraph when adding new ones

---

## Common Pitfalls

### Template Adaptation

When source content has fewer items than the template:
- **Remove excess elements entirely** (images, shapes, text boxes), don't just clear text
- Check for orphaned visuals after clearing text content
- Run visual QA to catch mismatched counts

When replacing text with different length content:
- **Shorter replacements**: Usually safe
- **Longer replacements**: May overflow or wrap unexpectedly
- Test with visual QA after text changes

**Template slots ≠ Source items**: If template has 4 team members but source has 3, delete the 4th member's entire group (image + text boxes), not just the text.

### Multi-Item Content

If source has multiple items (numbered lists, multiple sections), create separate `<a:p>` elements for each — **never concatenate into one string**.

**Wrong** — all items in one paragraph:
```xml
<a:p>
  <a:r><a:t>Step 1: First thing. Step 2: Second thing.</a:t></a:r>
</a:p>
```

**Correct** — separate paragraphs:
```xml
<a:p>
  <a:r><a:rPr b="1"/><a:t>Step 1</a:t></a:r>
</a:p>
<a:p>
  <a:r><a:t>Do the first thing.</a:t></a:r>
</a:p>
<a:p>
  <a:r><a:rPr b="1"/><a:t>Step 2</a:t></a:r>
</a:p>
```

### Smart Quotes

When adding new text with quotes, use XML entities:

```xml
<a:t>the &#x201C;Agreement&#x201D;</a:t>
```

| Character | Name | XML Entity |
|-----------|------|------------|
| " | Left double quote | `&#x201C;` |
| " | Right double quote | `&#x201D;` |
| ' | Left single quote | `&#x2018;` |
| ' | Right single quote | `&#x2019;` |

### Other

- **Whitespace**: Use `xml:space="preserve"` on `<a:t>` with leading/trailing spaces
- **XML parsing**: Use `defusedxml.minidom`, not `xml.etree.ElementTree` (corrupts namespaces)
