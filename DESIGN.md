# DESIGN.md

How Vibework's interface is designed. Read it before building or reviewing any
user-facing surface in `src/`. The identity (tokens, Mona Sans + Geist Mono,
Iconoir icons, light by default) uses a shared design system. Tokens live in `src/index.css`; use them, never hex.

## Who we design for

A non-technical knowledge worker handing real work to an agent: documents,
sheets, decks, research, their own files. The conversation is the home
surface; the workspace panel, settings and prompts support it. Make the common
path obvious and keep the rare one discoverable but quiet.

## Principles

- **Report state, don't explain the interface.** "Connected, 3 tools", "Saved
  in ~/.vibework/mcp.json", "1 of 3 Extracting renewal dates". If a sentence
  describes how to use the screen, delete it. Empty states are the exception:
  they say what the feature does for the person, with one action.
- **Title or description, not both.** Pages, rows and cards get one. Detail
  goes in a tooltip (`title`), a disclosure, or nowhere.
- **One focal element per screen.** Home: the composer. Conversation: the
  latest reply, or the prompt docked in the message box while one is pending. Everything else is
  demoted by tone and weight.
- **Progressive disclosure.** Tool rows show a sentence; raw input and output
  sit behind a quiet code icon (visible on hover/focus, always on failure).
- **Undo over confirm.** Confirm only what is destructive or external (remove
  a key, discard unsaved edits, grant folder access).
  Everything else happens at once and offers Undo in a toast.
- **Consent names action, data and risk**, no "please": the action as the
  title ("Delete old installers"), one line of consequence ("Runs on this
  computer and can change or delete files"), and the exact command.
- **Flat, not boxed.** No card in a card, no bordered tile inside a bordered
  card. Options inside a card are rows with a hover fill.
- **Reuse primitives.** Menus, popovers, dialogs, tooltips are the Radix
  primitives in `src/components/ui`; never hand-roll a modal or a floating
  panel. They close on escape and outside press and return focus.
- **Settings is a dialog**, not a page: a large centred dialog over the app
  (its own nav, scrolling content, close button, Escape), deep-linked at
  `#/settings?tab=…` and opened from the sidebar footer or ⌘,. Fields that
  use Escape themselves mark `data-dialog-escape="local"`.

## Type

Mona Sans Variable for everything, Geist Mono for paths, commands, keys and
ids. Hierarchy comes from weight (600 / 500 / 400) and tone (`text-foreground`
/ `text-muted-foreground`) before size.

| Size | Utility | Used for |
|---|---|---|
| 26px | `text-[26px] leading-8 font-medium tracking-[-0.015em]` | The home heading only (26/32, weight 500) |
| 20px | `text-xl` | Page titles (Settings tabs, key screen) |
| 16px | `text-base` | Dialog titles |
| 15px | `text-prose` | Message text: assistant prose and the user bubble |
| 14px | `text-sm` / `text-ui` | The interface default: rows, buttons, inputs, menus, tool rows |
| 13px | `text-meta` | Secondary text: descriptions, status lines, tab strips, small buttons |
| 12px | `text-xs` | Keyboard chords, counts, mono hints (key tail, command lines) |

Sentence case everywhere (the background overlay included). Curly quotes (“ ”), the ellipsis character (…),
`tabular-nums` where numbers line up (it is on by default in `body`).

## Spacing, rows and sizes

- 4px grid. Desktop density: 12–16px padding inside rows and cards.
- Sidebar rows, menu items, recent-file rows, workspace tabs: 32px (`h-8`);
  strip chips and small buttons 28px (`h-7`). A sidebar row that needs the
  user is two lines (48px), the only taller row.
- Settings rows: `px-4 py-3`, label left, state or one action right.
- Composer, home: 720px wide, min 128px tall, controls inside it, toolbar
  controls 32px, send button 32px. It is the home screen's focal element.
  Text is 15/24 (`text-prose leading-6`) with a faint placeholder
  (`text-faint`), 18px in and 16px down (12px under attachments); the
  controls row is `px-3 pt-3 pb-3`: attach on the left; model, permission
  mode and send on the right. The folder is not in this row (see Home).
- Composer, conversation: a one-line field (48px) with send/stop inside it,
  growing with the draft to 200px of text and then scrolling; attach, model and permission mode sit on a quiet 32px row beneath it. The draft can
  be written while a turn runs (Enter waits for the turn; Stop stays in the
  send button's place).
- Skills by "/": in the message box (home and a task), "/" at the start or
  after a space or line break opens the skills menu (never inside a word, a
  path or a URL; "/" then a space closes it). A 400px popover hanging 6px
  from the "/" (below it on home, above it in a task), the folder picker's
  surface: 32px rows (6px radius, `bg-foreground/[0.043]` when selected),
  8 visible, then scrolling (the list is windowed, so 400+ skills stay
  instant). A row is the skill's id (14px, the matched letters 600) and its
  description on the same line (13px `muted-foreground`, one line,
  truncated; the whole of it in the tooltip). No icons. With nothing typed,
  rows are grouped by source under 12px 500 `foreground-secondary` headers
  ("Built in", "Your skills", "~/.claude/skills", "~/.agents/skills");
  typing filters (fuzzy on the id, also its name and description words),
  best match first, and hides the menu when nothing matches. ↑↓ move, ⏎ or
  Tab choose, esc closes and keeps the text, a click works. It lists the
  bundled skills and the sources switched on in Settings → Skills; a source
  that is off is not listed, and the app refuses its skills when sending.
  The list is read once and kept, read again in the background when the
  menu opens and when a source is switched.
- Choosing a skill puts a chip in the text, "/vibework-slides" (Geist Mono
  500 at 0.86em on a 7% `foreground` tint, 5px radius, no border), one unit
  for Backspace, with the caret after it; a message can be only a chip. The
  sent message shows the same chip in the bubble, and under it, as the
  turn's first step, a tool-row line "Loaded the vibework-slides skill"
  (16px book icon in the leading slot, 14px `muted-foreground`). The engine
  adds each chosen skill's instructions to that message itself.
- Attachments sit in a row above the text (`px-4`, 8px between items, 12px
  to the text), wrapping and then scrolling. In the conversation's box they
  start 16px down and scroll past 136px: images are 56px square previews
  (`object-cover`, hairline border, 10px radius; click for a larger look in a
  dialog; file name in the tooltip); other files are a 56px-tall, 224px-wide
  chip: the type's tinted chip, the name (13px, 500) and the type line
  ("Text · TXT", 12px); remove is a 20px round control over the top-right
  corner, shown on hover or focus. In the home composer they start 12px down
  and are 64px (`size="lg"`): 64px tiles, 64px-tall chips up to 240px wide,
  and remove is an 18px dark disc inside the corner (4px in). A sent message
  shows the 56px tiles and chips, right-aligned above the bubble.
- A permission prompt or a question takes the message box's place while it
  waits: same position, width and card; the draft and attachments stay
  underneath (hidden, not unmounted) and come back when it is answered. The
  controls row beneath stays.
- Conversation column: 768px of content (`max-w-[816px] px-6`).
- In a task, the folder sits on the row beneath the message box: the
  folder's badge and name (the parent folder too when there is room); a task
  without one shows "Work in a folder" and can be given one.

## Home

One heading, the composer, nothing below it. No starter suggestions.

- The heading names the folder: "What should we get done in **dev**?" (the
  folder name is a button, underlined 1.5px at 5px offset in `faint`,
  `foreground` on hover and while the picker is open), with a quiet second
  line 8px under it (14/20, `foreground-secondary`), "or start without a
  folder", which clears the folder. With none: "What would you like to get
  done?" and "or pick a folder", which opens the picker. 28px to the
  composer. Home starts in the folder last chosen there (`homeFolder` in
  config.json).
- The folder picker hangs 8px below the folder word (or the "pick a folder"
  line), its left edge 12px before it: a 288px popover; a 40px search row
  over a hairline; 32px rows (6px radius) with the folder's badge, its name
  and a pin (shown on the active row, always on pinned ones); then
  "Choose another folder…" under a hairline, which opens the native folder
  dialog and asks for consent. Rows are pinned folders first, then by last
  use: folders chosen on home, folders of existing tasks, and the default
  folder. Recents and pins live in config.json. Typing filters by name and
  by full path ("dev/sam", "Desktop"); a recent row shows its parent
  folder as quiet trailing text (13px `muted-foreground`, "~/dev",
  "…/clients/acme" or just "…/work" when long) while a path is typed, or
  when two rows share a name. A query
  that is a path (starts with `~`, `/` or `./`, or contains `/`) also lists
  the folders on disk in the directory it names, filtered by its last
  segment like a shell's Tab completion (folders only; hidden ones only
  when the segment starts with a dot; `~` is the home folder, `./` the
  folder chosen now), under the recents that match, each with a plain 16px
  folder icon instead of a badge. The app's own data folder is never
  listed; typing it, or choosing it in the native "Choose another folder…"
  dialog, says "Vibework keeps its own data here, so it can’t be a task
  folder." (a toast; the dialog then counts as cancelled). Keys: ↑↓, Tab (or → at the end of the field) goes into
  the highlighted folder and keeps browsing, one folder at a time (a recent
  deeper down completes only its next folder: "~/de" → "~/dev/"), ⏎ chooses (a folder found on
  disk goes through the same consent as the native dialog), Backspace walks
  back up, esc closes; focus returns to the folder control. The list keeps
  its height while typing: what it opened with (up to 8 rows), and 8 rows
  once a path is typed, with "No folders match “…”" (or "No folder at …")
  as its first line when empty.
- `FolderBadge` is a folder everywhere it appears (picker, sidebar rows, the
  task's folder control): two letters in Geist Mono 600 on a 12–18% tint of
  one of six hues, both picked from the folder's name. Folders that would
  look alike ("deck" and "doc" both DC) are told apart: the first time a
  folder is shown it takes letters no other known folder uses (its own,
  then other letters of its name, in its name's hue); only when none are
  left does a hue tell them apart (never amber beside orange, too close).
  It keeps that look, so a folder always looks the same. 20px (radius 5, 9.5px letters) in the picker; 16px in rows
  and controls.
- The background, on home only: a faint field of characters that swells and
  thins slowly (`HomeField`, a canvas of 9×16px cells in Geist Mono, drawn in
  the text colour at 5–18% strength, one frame every 70ms). It fades out
  within 140px of the edges and clears an ellipse around the heading and the
  composer, so those stay the only things the eye lands on. It pauses when
  the window is not in front. It is the one ambient motion in the app; no
  images, blobs, grain or vignettes. With "reduce motion" on, the still ruled
  sheet below stands in for it.
- The still ruled sheet (reduce motion only). One
  absolutely positioned element under the titlebar band (`.home-ruling`):
  1px lines every 32px in `--home-ruling`, masked by a linear fade that keeps
  the heading clear (transparent until 33px above the composer's top, full
  21px below it) intersected with a 540×320 radial ellipse (black → 55% at
  45% → transparent). The composer's top is snapped onto a rule. Static: no
  parallax, no motion. No images, blobs, grain or vignettes.
- Tool rows: 20px line, 12px between rows, 16px icon in a fixed leading slot.

## Sidebar

Top to bottom: "New task" (a filled 32px row), "Search" (opens the search
window; its ⌘K chord sits at the row's right in `kbd` style, `faint`, and the
row stays pressed while the window is open), "Artifacts", the "Recents" header
and the active tasks (scrolling),
"Settled" pinned at the bottom of the list (label, count, chevron; opens its
list beneath it, 25 at a time), and a footer of two icon buttons: Settings
and Usage. The provider key lives in Settings, not the sidebar.

- Each task row leads with its folder's 16px badge (an empty slot when the
  task has no folder, so titles line up with each other and with the nav
  labels); the folder's name and path are in the row's tooltip. A needs-you
  row keeps the badge on its title line and indents its second line under
  the title.
- Titles take the rest of the row at rest; hover/focus actions (settle, "…")
  appear over a fade of the title's end instead of moving it. Right-click
  opens the same menu as "…".
- Live state per row: working is a quiet spinner at the right; finished and
  unseen is a blue dot and the title at full strength (opening it shows the
  result: the turn's latest presented file opens in the panel, once, as it
  would have live); needs you (a
  permission prompt or a question) is a second line, "Needs your approval" /
  "Needs your answer" with an amber mark, on an amber-tinted row, sorted to
  the top of Recents (lifted out of Settled while it waits).
- The width is the user's: drag the edge (220–400px, remembered, double-click
  resets to 256px). The scrollbar shows only while scrolling.
- Collapsed rail (56px): New task, Search, an amber count of tasks that need
  the user (opens the first), and the two footer icons.

## Search window

One place to find things: a centred dialog opened from the sidebar's Search
row or ⌘K anywhere (⌘K again or Escape closes it, and focus goes back to where
it was; an editor or terminal that uses ⌘K itself keeps it). It replaces any
in-place filter: the sidebar has no search field.

- The window: a Radix `Dialog`, 680px wide, centred on the whole window, its
  top edge fixed at 104px so it grows downward and never jumps while typing.
  The Settings surface: `bg-popover`, 18px radius, `shadow-dialog`, the
  `bg-overlay` scrim. A 56px field (16px search icon, 15/24 input, faint
  placeholder, `esc` chip), the tab strip (28px tabs, 13px, the selected one
  `bg-secondary` and 500, its fill sliding between tabs), a hairline, the
  results (up to 468px, then they scroll with an overlay scrollbar), and a
  40px footer of chords on `bg-background` (↑↓ to move, ↵ to open, esc to
  close; ⌘K to search from anywhere).
- Tabs: All / Tasks / Artifacts. While a query is typed, Tasks and Artifacts
  show their counts in `faint`. The placeholder follows the tab.
- Rows: 36px, radius 10 (inside the list's 8px padding), a 20px leading slot
  (the folder's 20px badge, the artifact's `ArtifactTypeChip size="sm"`, or a
  16px icon), the title (14px) with its meta on the baseline (13px,
  `foreground-secondary`), and a 72px trailing slot: the relative time ("12m",
  "3h", "Yesterday", "Mon", "Nov 3"), a chord, or ↵ on the selected row.
  Selection is the neutral `bg-secondary` fill; no brand accent anywhere in
  the window. Section headers 12px, 500, `foreground-secondary`, 30px.
- A task waiting on the user is a 52px two-line row on `bg-warning-muted`
  (`bg-warning-selected` when selected): the title line, then a 6px amber dot
  and "Needs your approval · <the action>" / "Needs your answer · <the
  question>" in 13px. They head every list they appear in, under "Needs you".
- Empty field, All: Needs you, Recent (the five latest active tasks), Actions
  (New task ⌘N, Open Artifacts ⌘⇧A, Settings ⌘,, Usage, Keyboard shortcuts
  ⌘/, Change folder, Change model). An action that changes something shows its current value as meta
  ("Change model · DeepSeek V4.1 Flash") and does the real thing on the screen
  behind: Change folder opens home's folder picker (leaving a task for home);
  Change model opens the model picker of the composer on screen, or says the
  task must stop working first. Tasks and Artifacts tabs group by Today /
  This week / Earlier, drawing 150 rows a section at a time.
- With a query, All shows Needs you, Tasks, Artifacts (five each, then "Show
  all N …", which switches tab) and Actions; matched letters are weight 600.
  Settled tasks are found too and say "Settled" in their meta; opening one
  does not bring it back to Recents. An artifact's meta is "Type · folder", or
  "Type · from “<task>”" when the match is in the task's name.
- Nothing found: "No tasks or artifacts match “…”", a state line of what was
  searched ("Searched 54 tasks, settled ones included, and 128 artifacts."),
  then "New task: “…”" (selected; puts the query in the home composer, unsent)
  and "Clear search".
- Matching is in memory (the task list, and the artifacts index read once per
  opening): case- and accent-insensitive, every word must appear, whole words
  and word starts (camelCase and separators count) before the middle of a
  word, titles and file names over the task an artifact came from, then the
  most recent. Message text is matched too: tasks whose messages (the
  user's and the agent's visible text; never reasoning, tool output,
  attachments or file contents) have every word, as word starts, come under
  Tasks after the title matches, as a 52px two-line row whose second line is
  a quoted snippet ("“…three **invoices** from Northwind…”", 13px
  `foreground-secondary`, the matched words 600 in `foreground`). The
  local index answers off the main thread, 120ms after typing pauses; while
  a longer query is on its way the previous rows stay if their snippet
  still fits, so rows don't flicker. Opening one scrolls the conversation to
  that message and tints it briefly (`bg-secondary`, 1.6s, colour only).
- Keys: typing always goes to the field. ↑↓ move through every row across
  sections, ↵ opens (a task; an artifact opens its task with the file in the
  panel; an action runs), Tab / Shift-Tab switch tabs, and so do ←→ at the
  field's ends. The keys stay in the window: a docked question or prompt
  behind it never sees them.
- Motion: the dialog's standard open and close; rows don't animate in, and
  the selection moves instantly.

## Task telemetry

- Activity groups append their recorded duration; expanded steps put duration
  at the trailing edge. A step's duration is its own run time: time it
  waited for the user's approval is left out (its tooltip says "Not counting
  5m 16s waiting for your approval"). Running clocks tick once per second. A finished turn
  gets one muted line, “Worked for 1m 19s”, beneath its reply: the agent's own
  time, without the time it waited for an approval or an answer (the tooltip
  gives the total: “6m 35s in all, including 5m 16s waiting for you”). Older
  tasks with no timing records show no duration.
- The plan bar ("2 of 3 · Extracting renewal dates", above the message box)
  shows only while the turn runs; when the turn ends it leaves with it.
- Task cost belongs in the sidebar row tooltip, never in an always-visible
  composer status line or titlebar. Unknown cost stays absent.
- Low account credit (under $5 or under 10% of purchased credit) marks Usage
  with an attention dot and shows one dismissible line above the composer per
  app session, with “Add credits”. An out-of-credit failure keeps that action
  available even after dismissal.
- The main window's Dock badge uses the sidebar's count of tasks needing an
  approval or answer; zero clears it.

## Helpers

A helper is one collapsible row in its parent conversation, titled by its job, with a quiet Working / Done / Failed / Stopped state and duration. Open it to see live tool steps and the final answer, using the existing tool rows and prose styles. A failure is a plain line below the title. Helpers never become sidebar, search or trash tasks. Their approval prompts dock in the parent message box and begin with “Helper · <job>”. Stop ends the parent and its helpers. Finished rows and their steps survive history reload and relaunch.

## Conversation chrome

- The titlebar band (60px across the top of the main area) is window-drag
  space in the page's own background. It has no rule under it: in a task,
  scrolled content fades out beneath it over 20px.
- The task's title sits in the titlebar band above the conversation; click
  to rename in place. Only the title takes the pointer; the rest of the band
  drags the window.
- A turn that did not finish says so inline after its reply, above
  "Worked for": a reply cut by Stop ends with a quiet "Stopped" row (13px
  `muted-foreground`, a 12px filled stop square, 20px tall); a turn the engine could
  not finish (it died or restarted) keeps the text that had streamed and
  shows the reason under it (13px `foreground`, a 14px triangle in
  `destructive`), not as a toast.
- One copy action under each finished reply copies that reply's prose (not
  tool calls). Always shown on the latest reply; on older ones on hover/focus.
- Replies and the reasoning trace render GFM. Tables: 14px (13px in the
  trace), header weight 500 over a `border-strong` hairline, `border`
  hairlines between rows, no stripes, no outer frame, 12px between columns
  and flush with the text at both ends. A column whose cells are all numbers
  is right-aligned and kept on one line; an alignment written in the
  Markdown wins. A column of short cells (none over 40 characters: names,
  dates, phone numbers) keeps each cell on one line at its natural width;
  only a column holding long prose wraps, between 12rem and a 28rem cap. A
  wide table scrolls sideways inside the message. While a
  reply streams, a table appears once its header and delimiter rows are in,
  then a whole row at a time (never raw pipes). Task lists show a checkbox
  in the bullet's place; struck text is muted.
- File card position: while a turn runs, a presented file's card appears
  where it was presented. Once the turn settles (and in history) a reply's
  file cards sit after everything else in it, under the final text and above
  "Worked for". The move at the end of a turn is one FLIP: transform only,
  the drawer curve, 280ms, so card and text trade places instead of
  snapping; positions are read only then, never per stream flush.
- File card: the whole card opens the preview (or the file in its default
  app when the panel can't show it); a type line ("Spreadsheet · XLSX")
  replaces the description, which moves to the tooltip. Open in default app
  and Show in Finder are quiet icons beside it.
- Terminal tabs: each is one shell in the task's folder ("Terminal",
  "Terminal 2", …; the shell's own title in the tooltip). It keeps running
  while other tabs or tasks are shown; closing the tab ends it; after a
  relaunch a remembered terminal tab starts a fresh shell. The Agent commands
  tab is read-only: the commands the agent ran in the task with what they
  printed, from its history (mono 13px, the command in `foreground`, output
  `muted-foreground`, "Failed" in `destructive`). The user's shells never
  get the app's or the engine's credentials.
- Connector notes: when a task's connectors changed since its last message
  (added, removed, turned on or off, edited in Settings), its next message
  carries one quiet status row per change above the user's bubble:
  "Connector added: linear", "Connector removed: …", "Connector updated: …"
  (13px `muted-foreground`, a 14px plug icon, 20px tall, left-aligned in
  the column, 12px above the bubble). The change takes effect on that
  message, not mid-turn; nothing else announces it. A connector waiting
  for its first sign-in is not offered to tasks yet, so signing in reads
  as "Connector added"; one whose sign-in lapsed or was signed out reads
  "Connector needs sign-in: linear", and removing one "Connector removed".
- Files tab: the task's folder as a tree of 32px rows
  (16px indent per level, a 16px chevron slot, the folder icon or the
  type's 20px `ArtifactTypeChip`, the name). Folders first; each opens on
  demand. Hidden entries and dependency or build folders (node_modules,
  .git, target, …) are listed in `faint` and never opened by default. A file
  the panel can show opens in its own tab, like a file card; any other
  file opens a menu with Open in default app and Show in Finder. The filter
  row (28px, 13px) searches names in the whole folder and lists matches with
  their folder in `muted-foreground`. Files the agent made or changed in the
  task carry a 6px neutral dot at the row's end (a closed folder holding
  one does too). Keys: ↑↓ move, → opens or steps in, ← closes or steps out,
  ⏎ opens. A task without a folder shows one line and "Choose a folder",
  which runs the message box's folder flow.
- Word and PowerPoint files (.docx, .pptx) open read-only in the panel,
  rendered to a static page in the sandboxed frame with scripts off (the
  HTML is rebuilt from an allowlist, the page's CSP forbids scripts, the
  frame's sandbox has no `allow-scripts`). One quiet 13px line says so,
  "Read-only view. Open in Microsoft Word to edit.", where the app's name
  is the action (underlined, opens the file in its default app). Word
  documents read as a page (headings, lists, tables, images, basic
  character formatting). Decks have the Slides view's shape: previous,
  "2 / 9", next and the read-only line in the 40px toolbar; the slide list
  (number and title, 32px rows) on the left, or along the bottom when the
  panel is under 560px; the slide fitted to the stage; ←/→ move. Charts and
  SmartArt are not drawn: their frame holds a neutral placeholder (a faint
  grey fill, a dashed grey hairline, a small chart glyph) with the chart's
  title and type when the file has them ("Chart: Revenue by quarter" over
  "Column chart"; with no title, the type over its series names), so a
  slide never looks broken. The app's
  own formats stay editable (.md documents, .slides.md decks, .xlsx sheets).
- Side panel: one row of tabs in the titlebar band, every open thing at the
  same level: files (the type's 20px chip and the name, the only colour in
  the row), terminals, the Browser (the page's title, else "Browser"; one per
  task), Files and Agent commands. Tabs are 32px, 13px labels, 8px radius,
  max 200px with the name truncated; the active tab is `bg-muted` and
  `foreground`, the others `muted-foreground` with a `bg-muted/60` hover; no
  borders, shadows or accent lines. The × shows on the active tab and on
  hover; a file with unsaved edits shows a dot in its place (and asks before
  it closes). A middle click or ⌘W closes the active tab. Drag a tab sideways
  to reorder. A full row scrolls sideways (wheel or trackpad), its edges fade
  over 24px where more tabs lie past them, and the active tab is kept in
  view. "+" follows the last tab; its menu lists Files, Terminal, Browser
  and Agent commands, each with its key at the right (F, T, B, A), then
  "Recent files" (type chips, keys 1–5); the key chooses while the menu is
  open. Terminal always opens a new one; the others focus their tab when it
  is open. The active file's actions sit at the right end of the same band:
  the preview/code switch, then Reload, Copy contents, Download as HTML, Open
  in default app and Show in Finder as icons, folded into one "…" menu when
  the panel is under 720px; other tabs have none there. Their own toolbars
  (the Browser's address bar, editors' toolbars) sit below the band. With no
  tabs the panel lists the same choices centred under a quiet "Open
  something", with `kbd` chips for the keys, and the task's recent files
  under them (keys 1–9 while the panel has focus). Tabs, their order and the
  active tab are kept per task across task switches and relaunches; width
  and open/closed are window-wide.

## Connectors

Settings → Connectors lists each connector as a settings row: its 32px
mark tile (`ServiceMark`, else a globe or terminal), the name, the address
or command (Geist Mono 12px, `muted-foreground`), and one status line
(13px):

- "Connected, 3 tools" (green dot; opens the tool list), or just
  "Connected" until a task's turn has been offered its tools (the engine
  has no other way to count them); "Connecting…" (spinner); "Couldn’t
  connect" (red, with one plain sentence in the error block and Retry,
  which asks the engine to connect again in every open folder); "Off"
  (grey dot, with a quiet line under the row when it is off for a reason:
  "Uses the older SSE connection, which Vibework no longer supports…").
- "Needs sign-in": an amber dot, text in `foreground`. The row offers
  "Sign in" (outline, small) before its switch. A remote connector needs
  sign-in when its server answers with an OAuth challenge, after Sign out,
  and when its sign-in lapsed (the token expired and could not be renewed).
- "Signing in through your browser…" (spinner) while the browser is out;
  "Cancel" (ghost) takes Sign in's place. A sign-in that did not finish
  says why under the row in `destructive` text ("Couldn’t sign in: this
  server doesn’t let new apps register…"); Sign in stays the way forward.

The row's actions are its switch and one "…" menu: Edit, Sign out (only
for a signed-in browser connector), then Remove (destructive, confirmed in
the row). Sign out happens at once and says "Signed out of linear" in a
toast. Sign in opens the system browser at the provider's own page; the
agent engine listens on 127.0.0.1 only until the browser comes back, which
lands on the engine's own page ("Authorization successful").

Adding: the form starts with "Popular" (13px 500 `muted-foreground`
label), a four-column grid of 32px buttons (the mark and the name, hover
fill, no border): a service that signs in through the browser is added at
once; one that takes a key fills the form with its address and the header
to paste it into, focused, with the expected shape as the placeholder
("Bearer <personal access token>"). One already added is disabled. After a
remote connector is added, the form becomes that connector's card (its row
is not listed twice until the card closes): "Connecting…", then, when it
signs in, an amber dot and "linear signs in through your browser" with
Later and Sign in (primary); while waiting, a spinner and Cancel. The card
closes itself once connected (or failed: the row then shows why).

A task can set connectors up itself ("I want to set up Granola"), the way
plain OpenCode does: the agent runs `opencode mcp add granola --url …`
(Vibework's own `opencode`, connectors only), `opencode mcp list` and
`opencode mcp remove`. Adding or removing asks once, in Ask and Auto, with
the same docked prompt as any approval, never as "Run a command": the
title names the outcome ("Add the Granola connector", "Remove the Granola
connector"), the preview is the address, and the line says what it means
("Granola will be able to offer its tools to your tasks. You sign in on
Granola's own page."). Yolo does not ask; listing never asks. After an add
that signs in through the browser, the app opens the provider's page
itself and the row reads "Signing in through your browser…" as if Sign in
had been chosen. The steps read "Added the Granola connector", "Checked
your connectors", "Removed the Granola connector", and "Couldn’t add the
Granola connector" when denied. A key is never asked for or typed in a
task: a key connector is added with a `{env:…}` placeholder header and the
person pastes the key with Edit.

A task that calls a connector whose sign-in lapsed gets one sentence,
"linear needs you to sign in again in Settings → Connectors.", as the
failed step's line, never the engine's "Connection closed" or a raw 401.
Sign-ins are secrets like the rest: the engine keeps the tokens in its own
database and they are never shown or logged by the app.

## Radii (concentric: inner = outer − padding)

| Radius | Utility | Used for |
|---|---|---|
| 6px | `rounded-sm` | Items inside menus and popovers (10px − 4px padding) |
| 8px | `rounded-md` | Controls: buttons, inputs, chips, tabs, composer controls |
| 10px | `rounded-lg` | Menus, popovers, toasts, icon tiles, attachment tiles and chips |
| 14px | `rounded-xl` | Inline cards: file card, answered question, settings cards |
| 16px | `rounded-[16px]` | The composer |
| 18px | `rounded-2xl` | Dialogs, the user bubble |
| full | `rounded-full` | "Jump to latest", the attachment remove control |

## Depth

One strategy per surface, never a border plus a shadow:

- **Flat** surfaces (cards, rows, the sidebar edge): one 1px hairline, `border`.
- **Lifted** surfaces use a layered shadow token that carries its own hairline
  ring: `shadow-lifted` (composer), `shadow-popover` (menus, popovers, model
  picker, toasts, "Jump to latest"), `shadow-dialog` (dialogs).
- Dialog scrim is `bg-overlay`. Dialogs and popovers sit on `bg-popover`.
- Dialogs, menus, popovers and tooltips layer at `z-[70]`, above the titlebar
  controls (`z-[60]`), so a scrim covers the whole window.

## Colour

Neutral is normal. The brand accent marks the one primary action on a surface.
Red (`destructive`) is for failures and destructive actions only; amber
(`warning`) for "waiting for you"; blue (`info`) for "finished, not yet seen";
green (`success`) for a confirmed good state. Blocked or off is neutral grey.
Amber marks with an icon, a dot or a tint (`bg-warning-muted`); text stays
`text-foreground`, since amber text is unreadable on light backgrounds. A
risky setting that is on (skipping permissions) is neutral text with a small
amber icon and its explanation in the tooltip, never red.

The one place colour is free: what the agent made. Each artifact type has its
own hue, the same family Claude uses (`--file-*`: doc blue, slides orange,
sheet green, data red, whiteboard pink, web sky, media teal, code violet), shown as a tinted icon chip via
`ArtifactTypeChip` (`src/components/artifacts/typeColor.tsx`) on the file card
in chat, attachment chips, panel tabs and the gallery. The hue belongs to the chip only: never
to text, borders or whole rows. Tool rows and the rest of the chrome stay
neutral, so the coloured thing on screen is always the output. The one
other place hue appears is the folder badge (`--folder-*`: green, violet,
blue, amber, orange, grey), a small tint that tells folders apart at a
glance; it never colours a row, text or a border either.

The send button is grey (`secondary`, muted arrow, disabled) until there is
text or an attachment, then the brand accent, on home and in a task.

## Icons

- Iconoir glyphs from `src/lib/icons.tsx` (24 grid, 2.25 stroke, which draws
  1.5px at 16px). Add a glyph there rather than importing `lucide-react`.
- 16px in chrome and rows; 14px beside 13px text (chevrons, strip tabs).
- A company or service is shown with its mark: `ProviderMark` for model makers
  and OpenRouter, `ServiceMark` (simple-icons, CC0) for connectors. No
  sparkles, wands or robots for "AI".
- Disclosure chevrons point right and rotate 90° when open.

## Motion

Calm, fast, physical. Motion explains where something came from or went, or
confirms the user was heard; it never performs. Animate the few moments that
earn it and leave the rest still.

**Curves** (tokens in `index.css`, constants in `src/lib/motion.ts`):

| Token | Curve | Used for |
|---|---|---|
| `--ease-out` | `cubic-bezier(.23,1,.32,1)` | Anything entering, leaving or changing in place |
| `--ease-drawer` | `cubic-bezier(.32,.72,0,1)` | Surfaces that travel: panel, sidebar, composer hand-off, rows changing places, tab fills |
| Tailwind default | `cubic-bezier(.2,.8,.2,1)`, 150ms | Colour and hover changes |

Never `ease-in` (it starts late, the moment the eye is on it). No bounce.

**Durations.** Press 120–150ms. Small things arriving (a mark, an icon swap,
a chip, a tooltip) 120–180ms. Cards and messages arriving 240ms. Menus and
popovers 150ms in, 100ms out. Dialogs 200ms in, 120ms out. Disclosures 220ms
open, 160ms closed. Sidebar 220ms. Workspace panel 280ms open, 200ms closed.
The composer's hand-off from home 380ms, the one motion allowed past 300ms,
because it happens once per task. Exits are always quicker than entrances.

**What moves, and how**

- Home → conversation: while the first message sends, the heading and
  its folder line step back (fade, 4px up); the conversation's composer then
  travels from where the home composer sat to its docked place (FLIP,
  `transform` only, WAAPI); the sent message rises 6px into place and
  "Working…" fades in just after it.
- Arrivals: a message the user sent, a prompt docking in the message box
  (and the next queued one replacing it), a file card made this turn rise 6px
  and fade in (`.motion-arrive`). The message box coming back is still. Only things that
  arrive while the user watches: never content loaded from history, never on
  opening a task (even mid-turn), never at the end-of-turn handover (the
  history copy has another id, so the class drops without replaying). Use
  `useArrival` / `useArrivedKey` for this, scoped to the open conversation.
- Popovers and menus scale from 96% and fade, from their trigger
  (`--radix-*-transform-origin`); dialogs scale from 96% from the centre.
  Tooltips: the first fades and scales from 97%; moving to a neighbour within
  300ms shows it at once.
- Workspace panel: its width opens on the drawer curve and the chat column
  yields with it; width changes that are not an open or close (the content
  area measured on mount, the sidebar moving) do not animate. The native
  browser view stays hidden until the dock has settled (dock's
  `TRANSITION_MS` + 40ms) and then shows at its final bounds.
- Tabs (Settings sections): the selected fill slides between tabs
  (framer-motion `layoutId`). Settings content fades in on a change of
  section. The side panel's tabs do not slide a fill (they are closed,
  reordered and scrolled): a tab opened while the panel shows scales in from
  94% and a file's viewer fades in; a dragged tab follows the pointer and the
  others take their new places at once.
- Sidebar rows: a new or returning row opens its slot and fades in; a
  settled or deleted row fades and closes its slot; a row that starts needing
  the user slides to the top while the others make way. Positions are
  measured only when the order or a row's height changes (never per stream
  flush). The Settled shelf opens by height. New status marks arrive once:
  the unseen dot pops from 50%, the spinner and "Needs your…" fade in.
- Disclosures (activity groups) open by height with a `0fr → 1fr` grid
  track, so content that sizes itself while opening never snaps at the end.
- Feedback: buttons, pills and icon buttons give to 97% while pressed
  (`.pressable` plus `scale` in the transition list). Copy → check and send
  → stop morph with a short scale and 2px blur. "Jump to latest" fades and
  rises in, and leaves faster.

**What stays still.** Typing, and the composer growing with the draft;
keyboard-driven changes; streamed text (the pacing is its motion); tool rows
loaded from history; hover fills (colour only); toasts (Sonner's own motion);
the model picker's selection (the popover closing is the feedback); anything
on every stream flush.

**Rules**

- Only `transform`, `opacity` (and `filter` under 2px) for things that move;
  height only for disclosures, sidebar rows and the shelf, the panel's width
  only for its open and close. Nothing animates a layout property on every
  stream flush.
- Never `transition-all`; name the properties. On primitives use
  `animation-duration-*` (tw-animate), not `duration-*`, which would set a
  transition on every property.
- Interruptible: CSS transitions and WAAPI for state changes; keyframes only
  for one-shot arrivals. No animation blocks input.
- Reduced motion: the global rule in `index.css` makes CSS motion instant
  (press scale off); framer-motion runs under `MotionConfig
  reducedMotion="user"` (opacity only, no movement or layout); sidebar rows
  and the shelf fade instead of opening; WAAPI motion checks
  `prefersReducedMotion()` and skips.
- The shimmer marks only what is running now: the live step's label, the live
  group header, "Working…", "Agent browsing". Nothing decorative.

## Focus and keyboard

- Controls: `focus-visible:ring-3 focus-visible:ring-ring/50`; dense strips
  and the sidebar use `ring-2`. Never `outline-none` without a ring.
- Hover reveals (row actions, the details icon) also appear on focus.
- Show chords where there is a keyboard path (`kbd` class: ↑↓, ⏎, esc).
- App-wide chords live in one table, `src/lib/shortcuts.ts`, with one handler
  (`AppShortcuts`): ⌘K search, ⌘N new task, ⌘⇧A Artifacts, ⌘, Settings, ⌘B
  sidebar, ⌘\ side panel, while it is open in a task ⌘1–⌘9 its first to
  ninth tab, ⌘W close its active tab (or the panel when it holds none;
  otherwise ⌘W stays the window's Close) and ⌘T its "+" menu, ⌘. stop the
  working task, ⌃Tab / ⌃⇧Tab (and ⌘↓ / ⌘↑ outside text fields) next and
  previous task in the sidebar's order, ⌘/ the "Keyboard shortcuts" sheet
  (also in Settings → General and the search window's actions). Never bind
  one anywhere else.
- Keys a surface handles itself are listed in the sheet too: esc (close
  the open menu or dialog) and "/" in the message box ("Use a skill").
- A chord is shown in the tooltip of the control that has it ("Hide sidebar
  ⌘B", "Stop ⌘.", a panel tab's "notes.md ⌘2"), and in the sheet as a `kbd`
  chip at the row's end (alternatives joined by a faint "or").
- What has focus keeps the chords it uses: the document, sheet, whiteboard
  and slide editors and the terminal keep ⌘B, ⌘K and ⌘↑/⌘↓ (bold, link,
  clear, jump); text fields keep ⌘↑/⌘↓; the terminal keeps ⌘. too. A key an
  editor already handled is never taken. While a dialog is open only ⌘K, ⌘N,
  ⌘, and ⌘/ work.
- Escape closes the topmost layer only: a menu or popover, else a dialog
  (Radix marks the key handled). Page-level Escape (leaving Artifacts,
  clearing a filter) checks `escapeTaken` first, so one press closes one
  thing.

## Copy

- Buttons are verb-first and name the outcome: "Allow once",
  "Allow access", "Show in Finder", "Remove key". Never "OK", "Submit".
- An action keeps its name: "Settle" → toast "Settled “…”" with Undo.
- Name what people control, not the system: connectors, not MCP config;
  "Create issue in Linear", never `linear__create_issue`.
- Tool rows: past tense when done ("Read contract.pdf"), present while
  running ("Searching the web for “…”"), "Couldn’t …" on failure with the
  error's first line under it. Finished groups sum up: "Read 2 files and ran a
  command · 1 failed".
- Errors say what happened and what to do next ("Couldn’t open the file. It
  may have been moved or deleted."). No "Oops", no blame.
- Python tools (uv) download once, the first time a command needs them, so
  the command's own output carries the words people and the model see:
  "Vibework is downloading Python tools (uv 0.9.11, about 20 MB). This
  happens once." then "Python tools are ready."; offline: "Python tools need
  a one-time download (uv 0.9.11, about 20 MB) and you appear to be
  offline. Connect to the internet, then try again."; a file that fails its
  checksum: "… but the file that arrived is not the one Vibework expects, so
  it was not used. Try again; if this keeps happening, something on this
  network is changing downloads." Never a bare "command not found".

## States

A task that needs the user (a permission prompt or a question) says so
everywhere it can be seen: its sidebar row (above), the collapsed rail's
count, and the prompt itself, docked in the message box's place (one thing:
no card in the chat stream, no strip above the box, no placeholder). The
activity timeline's pending step reads "Waiting for your approval" / "Waiting
for your answer" with an amber dot until it runs. When it is not the task on
screen, one toast per task names it with "Open task"; it clears when
answered. The background overlay uses the same words ("Needs your approval",
"Needs your answer").

The permission prompt: an amber mark and a one-line title of the action
("Run a command"), the command or path in a mono block (wrapping, scrolling
past six lines), the policy's reason for asking (else one line of
consequence) beside Deny and Allow once, whose menu holds Always allow and
Always deny. Several waiting requests show "1 of 3" quietly and the next one
swaps in. The prompt takes focus when it appears (unless the user is typing
elsewhere); Enter allows once and Escape denies while it has focus, and
Enter only counts once the prompt has been up for 400ms, so a keystroke meant
for the message box approves nothing. A quiet Stop sits in its header (and in
a docked question's), since the send button is hidden. Denying is an answer,
not a failure: no error toast. A docked question keeps its own keys (↑↓, ⏎,
1–4, esc to skip).

Every data-bearing surface designs loading, empty, error and success:

- Loading is a skeleton in the destination's shape (task list, model list,
  settings cards, viewers), never "Loading…" text.
- Empty states invite: a line of value and one action (Connectors, Skills,
  the empty side panel with its recent files, the Browser tab with shortcuts).
  A task without a folder of its own lists only the files it made or was
  given as its recent files, never the rest of the default folder.
- Errors stay inline with a way forward (Retry, Try again, Clear search).
- Secrets are write-only: a connector's environment variables and headers
  (and the provider key) show as set by name, never rendered back; editing
  keeps a saved value unless a new one is typed. A connector's sign-in
  shows only as its state ("Connected", "Needs sign-in").
- The user's object stays put while work continues; no interstitials.

## Before merging UI work

- [ ] Captures at 1400×900 and 900×600, light and dark for home and a
      conversation, including the non-happy states you touched.
- [ ] New controls reuse a `src/components/ui` primitive.
- [ ] No title-plus-description pairs, no explanatory sentences.
- [ ] Sizes, radii, depth and motion come from the tables above.
- [ ] Tokens only; no hex, `bg-black` or `bg-white`.
- [ ] Focus ring visible on every control; reduced motion respected.
- [ ] New motion recorded in the real app (computed values per frame, and a
      frame-time log for anything that runs during a streaming reply); nothing
      animates when a task is opened or at the end-of-turn handover.

### Conversation project context

The chosen project appears as a read-only badge and folder name in the 60px
titlebar, before the task title, separated by a muted slash. Its full
path is available on hover. It has no picker arrow: the project is fixed for
that task. The composer contains no project control or disclaimer footer.
Header content uses 24px side insets and stays clear of both window toggles.

### Desktop task notifications

A 380×88 transparent window contains a compact light card inspired by Granola's
horizontal notification: a quiet status marker, up to two lines of task name,
secondary status and app name, and a small inset Open action. The whole card
opens that task; a visible 24px dismiss button sits at the upper right. No large
icon tile or countdown bar. The notification stays light independently of the
main app to preserve notification contrast.
Dismiss after eight seconds, giving a fresh reading interval after hover/focus.
New events reset the timer. Position within the main display’s work area so
the menu bar and secondary-display offsets are respected.

Conversation text establishes an inline formatting boundary so native WebKit
selection highlights remain in the text column rather than the scroll gutters.
