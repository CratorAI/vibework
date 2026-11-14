# Design checks

Use an isolated debug app/data directory as described in `../README.md`. These
scripts dispatch DOM pointer, keyboard and clipboard events through that app's
bridge. They never focus a window or send native input. Captures use the explicit
`DESIGN_WINDOW_ID`; check its owner PID first. They assume a `design-check` task
with folder `/tmp/vibework-design/fixtures`, and write proof only below
`/tmp/vibework-design`. Do not use an owner's data or task folder.

1. `python3 scripts/e2e/design/make-fixtures.py /tmp/vibework-design/fixtures`
2. Start `bun scripts/e2e/design/fake-model.mjs` on port 1479, then the isolated app
   with `VIBEWORK_DEV_OPENROUTER_ORIGIN=http://127.0.0.1:1479` and a dummy key.
   The fake model calls `skill({id:"vibework-design"})`, writes the poster and
   three-frame social set, then presents both through `vibework_present_file`.
   Restart the server to reset its deterministic tool sequence.
3. Set `VIBEWORK_DEV_DATA_DIR=/tmp/vibework-design/data` and
   `DESIGN_WINDOW_ID=<isolated app window id>` for the following Node scripts:
   - `matrix.mjs`: four fixtures × light/dark, edits, disk reload, all frame export
     formats and selection SVG. Optional `DESIGN_THEME`/`DESIGN_FIXTURE` filters.
   - `security.mjs`: same-origin/scriptless sandbox and raw malicious markup.
   - `advanced.mjs`: nested rotated ungroup, history, clipboard, conflict, live drag.
   - `extras.mjs`: granted multi-file picker, original image bytes, pan/zoom, gallery.
   - `modifiers.mjs`: duplicate-drag, shift/alt resize, nudge, marquee and guides.
   - `performance.mjs`: paired idle/drag rAF timestamps for 300 elements.
   - `pdf-pages.mjs`: open and capture all social PDF pages plus full portrait pages.
   - `comparisons.mjs`: live WebKit and local PNG side-by-side for every fixture/theme.

Run scripts sequentially against the single app window. Inspect every capture;
a passing event assertion alone does not prove visual quality. Physical mouse,
trackpad and OS clipboard handoff still require a separate manual check. Stop the
fake server, dev CLI, app and its sidecar after the run.
