---
name: vibework-doc
description: "Documents as Markdown files that open as an editable Doc in the side panel. Use when the user asks for a document, report, memo, plan, brief, notes, write-up, README or similar, and whenever you create or edit a .md file the user will read. For Word (.docx) or PDF output, write the Doc first, then export with the vibework-docx / vibework-pdf skills."
---

# Vibework Doc

A Doc is an ordinary Markdown file (`.md`, GitHub-flavoured) in the working folder. The app shows it in the side panel as a rich-text document the user can edit; their edits are saved back to the same file, and your edits to the file appear in the panel.

## When to make a Doc

- The user wants something to read, keep or edit: report, memo, plan, proposal, meeting notes, summary, write-up, checklist, README.
- Default to a Doc rather than a long chat reply when the content is longer than a few paragraphs or the user will come back to it.
- Make a .docx/.pdf only when the user asks for that format (see Export below).

## Creating a Doc

1. Pick a short, descriptive kebab-case name: `q3-supplier-review.md`, `onboarding-plan.md`. Put it in the working folder (or the subfolder the user names). Notes, drafts and helper scripts you make for yourself go in the task's scratch folder (`$VIBEWORK_SCRATCH`, path in your instructions), not the working folder. Do not overwrite an existing file unless asked; pick a new name.
2. Write it with the Write tool. Start with one `# Title`, then `##` sections.
3. Call **PresentFile** with the absolute `file_path` and a `file_name` so it opens in the panel.

## Markdown the editor supports (editable as rich text)

- Headings `#`–`######` (also `Title` + `===` / `---` underlines)
- Paragraphs; **bold**, *italic*, ~~strikethrough~~, `inline code`, `<u>underline</u>`
- Links `[text](https://…)`, links to other files in the folder `[notes](notes.md)`, bare URLs
- Bulleted, numbered (any start number) and nested lists; task lists `- [ ] todo` / `- [x] done`
- Block quotes (they may contain lists and paragraphs)
- Fenced code blocks with a language: ```` ```python ````
- Tables (GFM pipe tables, with `:---:` alignment; cells are single-line)
- Horizontal rules `---`
- Images `![alt](images/chart.png)`, with paths relative to the Doc. Save image files next to the Doc (or in a subfolder) and link them relatively; absolute paths do not display.
- A hard line break: end the line with `\`

## Kept exactly as written, but not rich-text editable

These are shown as a source box (the user can edit the source) and saved byte-for-byte:
YAML/TOML front matter, raw HTML blocks (`<div>`, `<details>`, comments), footnote definitions `[^1]: …`, link reference definitions `[ref]: url`, and `$$` math blocks. Inline HTML (other than `<u>`, `<b>`, `<i>`, `<em>`, `<strong>`, `<s>`, `<del>` pairs), footnote references `[^1]` and `$$…$$` inline math show as small source chips.
Use them when they help; prefer plain Markdown so the user can edit everything.

## Editing an existing Doc

The user may have edited the file in the panel since you last read it.

1. **Read the file first**, every time, even if you wrote it earlier in the conversation.
2. Make **targeted edits** with the Edit tool (replace the paragraph, row or list item you are changing). Do not rewrite the whole file to change part of it, and do not reformat untouched parts (keep the existing bullet characters, heading style, table layout and line wrapping).
3. Keep the user's wording and additions unless they asked you to change them.
4. Call **PresentFile** again when you are done so the panel shows the result.

If the user is editing at the same moment, the panel keeps their text and asks them whether to reload yours, so small, targeted edits are the safest.

## Export

The Doc stays the source; exports are new files next to it.

- **Word (.docx):** use the **vibework-docx** skill (read its SKILL.md first). For a simple Doc (headings, paragraphs, bullet lists) run its `scripts/fromOutline.py your-doc.md your-doc.docx`. For tables, numbered/task lists, links or images, create the document with docx-js as its `references/docxjs.md` describes, carrying over every section of the Doc. If `pandoc` is installed (`command -v pandoc`), `pandoc your-doc.md -o your-doc.docx` is also faithful.
- **PDF:** use the **vibework-pdf** skill's "Create new PDF" guidance (reportlab), rendering the Doc's headings, paragraphs, lists and tables; or make the .docx first and convert it with `convertDocxToPdf` in vibework-docx's `scripts/converter.py` (local LibreOffice conversion; no upload). If LibreOffice is missing, skip optional visual checks with a note. For a requested PDF via DOCX, explain how to install LibreOffice (`brew install --cask libreoffice` on macOS or https://www.libreoffice.org/download/download-libreoffice/), or use the local reportlab route above.
- Then call **PresentFile** with the exported file.

The panel also has **Copy as Markdown** in the Doc's "…" menu for pasting elsewhere.
