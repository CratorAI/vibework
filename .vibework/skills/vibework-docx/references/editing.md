# Editing Documents

> **USE THIS WORKFLOW when the user provides a .docx file as a template.** Do NOT use docx-js to recreate from scratch -- the template contains styling, formatting, and branding that must be preserved.

## Template-Based Workflow

When using an existing document as a template:

1. **Analyze the template**:
   ```bash
   uv run python scripts/analyze.py template.docx --thumbnails "$VIBEWORK_SCRATCH/pages.jpg"
   uv run python -m markitdown template.docx
   ```
   Review `pages.jpg` to see layout, and markitdown output to see placeholder text.

2. **Plan your changes**: Identify what needs to be replaced or modified.

3. **Start editing session**:
   ```bash
   uv run python scripts/session.py start template.docx "$VIBEWORK_SCRATCH/workspace"
   ```

4. **Edit content**: Update text in `$VIBEWORK_SCRATCH/workspace/word/document.xml`

5. **Finish session**:
   ```bash
   uv run python scripts/session.py finish "$VIBEWORK_SCRATCH/workspace" output.docx
   ```

---

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `session.py` | **Start here** -- manage editing sessions (start/finish/abort) |
| `analyze.py` | Analyze structure, extract text, create thumbnails |
| `quickEdit.py` | Find/replace text without unpacking |
| `comment.py` | Add comments to document |
| `acceptChanges.py` | Accept all tracked changes |
| `exportPages.py` | Export pages as images |

### session.py

```bash
# Start session - unpacks to "$VIBEWORK_SCRATCH/workspace"
uv run python scripts/session.py start input.docx "$VIBEWORK_SCRATCH/workspace"

# Check session status
uv run python scripts/session.py status "$VIBEWORK_SCRATCH/workspace"

# Finish - validates, cleans, repacks
uv run python scripts/session.py finish "$VIBEWORK_SCRATCH/workspace" output.docx

# Abort - cancel without saving
uv run python scripts/session.py abort "$VIBEWORK_SCRATCH/workspace"
```

### quickEdit.py

```bash
# Single replacement
uv run python scripts/quickEdit.py doc.docx "OLD_TEXT" "New Text" output.docx

# Multiple replacements from JSON
uv run python scripts/quickEdit.py doc.docx --replacements changes.json output.docx

# Dry run to preview
uv run python scripts/quickEdit.py doc.docx "OLD" "NEW" output.docx --dry-run
```

### analyze.py

```bash
# Basic analysis
uv run python scripts/analyze.py document.docx

# With thumbnail pages
uv run python scripts/analyze.py document.docx --thumbnails "$VIBEWORK_SCRATCH/pages.jpg"

# JSON output for programmatic use
uv run python scripts/analyze.py document.docx --json
```

---

## Editing Content

For each change:
1. Read the document's XML in `$VIBEWORK_SCRATCH/workspace/word/document.xml`
2. Identify placeholder content
3. Replace with final content

**Use the Edit tool for XML changes.** It forces specificity about what to replace and where.

### Formatting Rules

- **Preserve existing `<w:rPr>` formatting**: Copy the original run's formatting when making changes
- **Never use unicode bullets**: Use proper list formatting with `<w:numPr>`
- **Preserve paragraph properties**: Copy `<w:pPr>` from original paragraphs

---

## Adding Comments

After starting a session, add comments:

```bash
python scripts/comment.py "$VIBEWORK_SCRATCH/workspace" 0 "Comment text"
python scripts/comment.py "$VIBEWORK_SCRATCH/workspace" 1 "Reply to comment" --parent 0
```

Then add markers to document.xml:

**CRITICAL: `<w:commentRangeStart>` and `<w:commentRangeEnd>` are siblings of `<w:r>`, never inside `<w:r>`.**

```xml
<!-- Comment markers are direct children of w:p, never inside w:r -->
<w:commentRangeStart w:id="0"/>
<w:r><w:t>commented text</w:t></w:r>
<w:commentRangeEnd w:id="0"/>
<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r>
```

---

## Smart Quotes

When adding new text with quotes, use XML entities:

```xml
<w:t>the &#x201C;Agreement&#x201D;</w:t>
```

| Character | Name | XML Entity |
|-----------|------|------------|
| " | Left double quote | `&#x201C;` |
| " | Right double quote | `&#x201D;` |
| ' | Left single quote | `&#x2018;` |
| ' | Right single quote | `&#x2019;` |

---

## Common Pitfalls

### Whitespace

Use `xml:space="preserve"` on `<w:t>` elements with leading/trailing spaces:
```xml
<w:t xml:space="preserve"> text with spaces </w:t>
```

### XML Parsing

Use `defusedxml.minidom`, not `xml.etree.ElementTree` (corrupts namespaces).

### Element Order

In `<w:pPr>`, maintain proper element order:
`<w:pStyle>`, `<w:numPr>`, `<w:spacing>`, `<w:ind>`, `<w:jc>`, `<w:rPr>` last
