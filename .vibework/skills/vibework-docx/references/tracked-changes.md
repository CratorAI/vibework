# Tracked Changes XML Reference

This document covers the XML structure for tracked changes (redlining) in DOCX files.

## Basic Structure

### Insertion

```xml
<w:ins w:id="1" w:author="Claude" w:date="2025-01-01T00:00:00Z">
  <w:r><w:t>inserted text</w:t></w:r>
</w:ins>
```

### Deletion

```xml
<w:del w:id="2" w:author="Claude" w:date="2025-01-01T00:00:00Z">
  <w:r><w:delText>deleted text</w:delText></w:r>
</w:del>
```

**Inside `<w:del>`**: Use `<w:delText>` instead of `<w:t>`, and `<w:delInstrText>` instead of `<w:instrText>`.

## Minimal Edits

Only mark what changes:

```xml
<!-- Change "30 days" to "60 days" -->
<w:r><w:t>The term is </w:t></w:r>
<w:del w:id="1" w:author="Claude" w:date="...">
  <w:r><w:delText>30</w:delText></w:r>
</w:del>
<w:ins w:id="2" w:author="Claude" w:date="...">
  <w:r><w:t>60</w:t></w:r>
</w:ins>
<w:r><w:t> days.</w:t></w:r>
```

## Deleting Entire Paragraphs

When removing ALL content from a paragraph, also mark the paragraph mark as deleted. Add `<w:del/>` inside `<w:pPr><w:rPr>`:

```xml
<w:p>
  <w:pPr>
    <w:numPr>...</w:numPr>  <!-- list numbering if present -->
    <w:rPr>
      <w:del w:id="1" w:author="Claude" w:date="2025-01-01T00:00:00Z"/>
    </w:rPr>
  </w:pPr>
  <w:del w:id="2" w:author="Claude" w:date="2025-01-01T00:00:00Z">
    <w:r><w:delText>Entire paragraph content being deleted...</w:delText></w:r>
  </w:del>
</w:p>
```

Without the `<w:del/>` in `<w:pPr><w:rPr>`, accepting changes leaves an empty paragraph/list item.

## Rejecting Another Author's Insertion

Nest deletion inside their insertion:

```xml
<w:ins w:author="Jane" w:id="5">
  <w:del w:author="Claude" w:id="10">
    <w:r><w:delText>their inserted text</w:delText></w:r>
  </w:del>
</w:ins>
```

## Restoring Another Author's Deletion

Add insertion after (don't modify their deletion):

```xml
<w:del w:author="Jane" w:id="5">
  <w:r><w:delText>deleted text</w:delText></w:r>
</w:del>
<w:ins w:author="Claude" w:id="10">
  <w:r><w:t>deleted text</w:t></w:r>
</w:ins>
```

## Preserving Formatting

When adding tracked changes, preserve the original run's `<w:rPr>` formatting:

```xml
<w:ins w:id="1" w:author="Claude" w:date="...">
  <w:r>
    <w:rPr>
      <w:b/>  <!-- bold from original -->
      <w:sz w:val="24"/>  <!-- font size from original -->
    </w:rPr>
    <w:t>inserted text</w:t>
  </w:r>
</w:ins>
```

## Schema Compliance

- **RSIDs**: Must be 8-digit hex (e.g., `00AB1234`)
- **IDs**: Each `w:id` must be unique within the document
- **Dates**: Use ISO 8601 format with timezone (e.g., `2025-01-01T00:00:00Z`)

## Accepting Changes

To accept all tracked changes programmatically:

```bash
python scripts/acceptChanges.py input.docx output.docx
```

This uses LibreOffice to accept all changes and produce a clean document.

## Extracting Text with Changes

Use pandoc to extract text showing tracked changes:

```bash
pandoc --track-changes=all document.docx -o output.md
```

Options:
- `--track-changes=accept` - Show text with all changes accepted
- `--track-changes=reject` - Show text with all changes rejected
- `--track-changes=all` - Show both insertions and deletions marked
