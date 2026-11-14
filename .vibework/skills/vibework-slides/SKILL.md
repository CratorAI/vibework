---
name: vibework-slides
description: "Presentation decks as .slides.md files that open in Vibework's Slides panel (page through, present, edit in place) and export to PowerPoint and PDF. Use for any new deck, presentation or slides unless the user gives a .pptx template to fill (then use vibework-pptx)."
---

# Slides (`.slides.md`)

A deck is one Markdown file ending in `.slides.md`. The app renders it with a designed theme, the person can page through it, present it, fix text in place and reorder slides; their edits are written back into the same file. You write and edit the file; you never write HTML or CSS for a deck.

Use this skill for new decks. Use **vibework-pptx** only when the user supplies a .pptx template or asks to edit an existing .pptx. If the user wants a .pptx as the end product, still build the `.slides.md` first and export it (below).

## Workflow

1. **Plan the storyline, then build.** For a clear request, choose a suitable audience and theme (ledger by default) and write the deck without asking for approval or aesthetic preferences. Briefly state assumptions with the finished deck. Ask only when missing information materially changes the deliverable, or the user explicitly requests a planning/approval stage. Each headline states the point, not the topic ("Margin recovered to 6.8%", not "Margins"). Honor the requested slide count.
2. **Write the file** in the working folder, e.g. `q3-review.slides.md`. Put images next to it (e.g. `images/`).
3. **Check it**: `vibework-js <skill>/scripts/export.ts q3-review.slides.md --check` prints parse warnings and finds text that overflows. Fix every issue it reports. For a visual check, `--png "$VIBEWORK_SCRATCH/shots"` writes one PNG per slide into the task's scratch folder (never into the working folder), named `slide-01.png`, `slide-02.png`, … by slide number (two digits), and prints the path of each file it wrote: `"$VIBEWORK_SCRATCH/shots/slide-01.png"` is slide 1. Read two or three of them, not all.
4. **Show it**: call `PresentFile` with `file_path` = absolute path of the `.slides.md` and `file_name` = its name. It opens in the Slides panel.
5. **Export only when asked** (PowerPoint or PDF, below).

## The format

```markdown
---
title: Northwind Logistics — FY2026 review
theme: ledger
footer: Northwind Logistics · Board pack · Confidential
---

<!-- layout: title -->
# Northwind in FY2026

Margin recovery is on track. The Leeds hub decides the next two years.

Board meeting · 12 November 2026

Notes:
Open with the answer: margins are back; today's decision is the Leeds hub.

---

<!-- layout: stats -->
# All three turnaround targets were met

- **£184m** revenue, up 9% on FY2025
- **6.8%** operating margin, up from 4.1%
- **97.2%** on-time delivery, the best in five years

Source: Northwind management accounts, FY2026 (unaudited)

Notes:
Revenue growth is mostly volume (+7%) with a small price effect (+2%).

---

<!-- layout: chart, chart: bar, unit: % of revenue, suffix: %, highlight: FY26 -->
# Operating margin is back above its pre-2022 level

| Year | Operating margin |
|---|---:|
| FY24 | 3.9 |
| FY25 | 4.1 |
| FY26 | 6.8 |

Source: Annual reports FY24–FY25; management accounts FY26

---

<!-- layout: closing -->
# What we ask of the board

- Approve £38m for the Leeds hub, phased over FY27–FY28
- Review progress at the May 2027 meeting

strategy@northwind.example
```

Rules of the format:

- **Front matter** (optional) between `---` lines at the very top: `title`, `theme` (`ledger`, `slate`, `graphite`), `footer` (small text on every slide), `accent` (brand colour as `#RRGGBB`), `mode` (`light` or `dark` content slides).
- **Slides are separated by a line containing only `---`.** Do not use `---` for anything else (no horizontal rules).
- **First line of each slide: `<!-- layout: name, key: value, ... -->`.** Always set the layout explicitly. Values containing commas go in quotes: `unit: "£m, nominal"`.
- **Content**: `# Headline` (one per slide), paragraphs, `- ` or `1. ` lists (two-space indent for a sub-item), `> quote` with `— Name, role` on the next line, Markdown tables (each row starts with `|`), images as `![description](images/file.jpg)` on their own line.
- **Inline**: `**bold**`, `*italic*`, `` `code` ``, `==accent colour==` for one or two key words.
- **A paragraph starting with `Source:`** is set as a small source line at the bottom.
- **`Notes:` on its own line starts the speaker notes**; everything after it to the end of the slide is notes.
- Images must be files in the working folder, with paths relative to the deck. Web URLs do not load.

## Layouts

| Layout | Content | Use for |
|---|---|---|
| `title` | `#` title, 1st paragraph = subtitle, further paragraphs = small top line (date, author); optional image | Opening slide |
| `section` | `#` title, optional paragraph; numbered automatically (01, 02…) | Dividing a deck of 10+ slides into parts. Content slides after it show the section name above their headline |
| `statement` | `#` one sentence, or a `>` quote with `— attribution` (`quote` is an alias) | One idea the room must remember; customer or expert quotes |
| `bullets` | `#` headline, optional paragraph, 3–5 list items, ideally `**Lead.** one line` | Reasons, decisions, steps. Numbered list (`1.`) when order matters |
| `split` | `#` headline, paragraph and/or short list, one image. Image goes on the side where it appears in the source (or `image: left/right`) | Text explained by a photo, screenshot or diagram |
| `image` | One image full-bleed, optional `#` caption headline, paragraph, source. `fit: contain` for screenshots/diagrams that must not be cropped | Photos that carry the slide |
| `stats` | `#` headline, 1–4 items `- **value** label` | Big numbers. Values short (`£184m`, `6.8%`, `3.1×`) |
| `chart` | `#` headline, optional paragraph (shown under the headline), a table of data, optional further paragraphs or list (shown as a side note), source | Any trend, comparison or share. Data-driven, editable in PowerPoint |
| `table` | `#` headline, a table of up to 8 rows and 6 columns, source | Comparing options on several measures. Numbers right-align automatically |
| `closing` | `#` headline, optional paragraph, list of next steps, contact line after the list | The ask, decisions needed, next steps |

### Charts

The table is the data: first column = categories (x-axis or slices), every other column = one series. Cells hold plain numbers (`12.4`, `1,250`, `(3.2)` for negatives; `£`, `%`, `m` in a cell are ignored, so put units in the options).

Options in the layout comment:

- `chart:` `bar` (default, vertical), `hbar` (horizontal; rankings, long labels), `stacked`, `line`, `area`, `pie`, `donut`
- `unit:` axis caption, e.g. `£m`, `% of revenue`, `thousand tonnes`
- `prefix:` / `suffix:` on value labels, e.g. `prefix: £`, `suffix: %` (a `unit: %` adds the suffix itself)
- `highlight:` the one thing the slide is about. Single-series bar/hbar/pie: name a category; that bar or slice takes the accent and the rest turn grey. Line/area: name a category; that point is marked with its values. Multi-series bars: name a series to emphasise it
- Bars and areas always start at zero; line charts zoom to the data range (`zero: true` forces zero). Use `line`, not `area`, for small changes on a high base (e.g. 96% → 97%)

Chart rules: one message per chart, stated in the headline. Use `highlight` instead of extra labels. At most 4 series on a line chart, 5 slices on a pie (group the rest as "Other"). Always give the unit and a `Source:` line. Never invent numbers; if the user has none, say so and use clearly labelled placeholders.

### Themes

| Theme | Look | Good for |
|---|---|---|
| `ledger` (default) | Serif headlines on warm paper, deep green accent, dark section slides | Board packs, strategy, research, finance |
| `slate` | Tight sans headlines, white and near-black, cobalt accent, dark title/section/closing | Product, technology, operations |
| `graphite` | Dark throughout, grotesk type, amber accent, light quote slides | Keynotes, launches, investor updates |

`accent: "#C8102E"` swaps in a brand colour. Per slide, `surface: dark` or `surface: light` overrides the background; `kicker: text` replaces the small label above the headline (`kicker: none` hides it); `footer: none` hides the footer.

## Rules that make decks good

- **One idea per slide; the headline states it** as a short sentence (under ~70 characters, never more than two lines). Someone reading only the headlines should get the whole argument.
- **Few words on the slide, detail in the notes.** 3–5 bullets, each one line. Put the explanation, caveats and numbers you will say aloud in `Notes:`.
- **Real numbers with units and sources.** Every chart, table and stat has a unit and a `Source:` line.
- **Vary the layouts** to fit the content: a number → `stats`, a trend → `chart`, a comparison → `table`, a quote → `statement`. Avoid runs of `bullets`.
- **Sections only for longer decks** (10+ slides). A typical deck: title, 6–12 content slides, closing.
- Keep the same theme throughout; do not restyle individual slides.

## Editing an existing deck

- **Re-read the file before every edit.** The person may have changed text, notes or slide order in the panel since you last looked.
- **Make targeted edits with the Edit tool**: replace the exact lines of one slide (a headline, a list item, a table row, a layout comment). Do not rewrite the whole file to change one slide; the person's edits elsewhere must survive.
- **Slide order is the order of the `---`-separated blocks.** To move a slide, cut its block (from its layout comment to the end of its notes) and paste it between two other `---` lines. To delete, remove the block and one adjacent `---` line. To add, insert `---` and a new block.
- Change the theme for the whole deck by editing `theme:` in the front matter.
- After editing, run `--check` again and call `PresentFile` if the user should look.

## Export

Run from the working folder with `vibework-js` (Vibework's JavaScript runtime, on the PATH; `<skill>` is this skill's folder):

```bash
vibework-js <skill>/scripts/export.ts deck.slides.md                  # deck.pptx next to the deck
vibework-js <skill>/scripts/export.ts deck.slides.md --pptx out.pptx
vibework-js <skill>/scripts/export.ts deck.slides.md --pdf            # deck.pdf, one 16:9 page per slide
vibework-js <skill>/scripts/export.ts deck.slides.md --png "$VIBEWORK_SCRATCH/shots"   # one PNG per slide, to check the look: shots/slide-01.png, slide-02.png, ... (paths printed)
vibework-js <skill>/scripts/export.ts deck.slides.md --check          # warnings + overflow check
vibework-js <skill>/scripts/export.ts deck.slides.md --png "$VIBEWORK_SCRATCH/shots" --theme slate --slides 1-3   # preview a theme on a few slides
```

Script: [scripts/export.ts](scripts/export.ts). It needs no package install. Check images and anything else you make for yourself go in the task's scratch folder, `$VIBEWORK_SCRATCH` (quote it: the path has a space); `--png` with no folder writes there too, into `$VIBEWORK_SCRATCH/<deck name>-png/` (for `q3-review.slides.md`: `q3-review-png/slide-01.png`, …). PNGs the user asked for go in the working folder.

- **PowerPoint**: native text boxes (editable), native charts (the data opens in PowerPoint's chart editor), native tables, speaker notes, images. Fonts are mapped to ones every machine has (Georgia/Arial), so the .pptx looks close to, not identical with, the panel. The person can also export a .pptx from the panel's Export menu.
- **PDF and PNG** are rendered by a headless Chromium from the same HTML as the panel, so they match it exactly. They need Chromium: the one installed for the browser tool is found automatically; otherwise set `VIBEWORK_CHROME` to a Chrome/Chromium/Edge executable. Fonts come from Google Fonts; offline, system fonts are used.
- After exporting, call `PresentFile` on the exported file.
