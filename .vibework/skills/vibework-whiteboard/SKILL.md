---
name: vibework-whiteboard
description: "Whiteboards (.excalidraw): flowcharts, process flows, system and architecture diagrams, org charts, timelines, brainstorm boards of sticky notes. Describe nodes, edges and groups in a small JSON file; a bundled script lays it out and writes or updates the board, keeping what the person arranged by hand."
---

# Whiteboard boards

A whiteboard is a `.excalidraw` file in the working folder. It opens in the workspace panel as an editable canvas: the person moves, restyles and adds things there, and their edits are saved to the same file.

Use a board when a picture explains better than prose: a flow with decisions, how services connect, who reports to whom, phases over time, ideas grouped by theme. For tables or long text use a document or sheet instead.

**Never write or edit the Excalidraw JSON by hand.** It is positional and fragile (every shape needs coordinates, labels and arrows are linked by ids). Write a short description instead and let the script decide the geometry.

## 1. Write a description

Save it as JSON in the task's scratch folder, for example `$VIBEWORK_SCRATCH/orders.json` (its full path is in your instructions; the working folder gets only the board). `describe` can always write it again from the board.

```json
{
  "title": "Order processing",
  "direction": "right",
  "groups": [
    { "id": "app", "label": "Our app" },
    { "id": "data", "label": "Data" }
  ],
  "nodes": [
    { "id": "customer", "label": "Customer", "kind": "ellipse", "color": "gray" },
    { "id": "api", "label": "Orders API", "group": "app", "color": "blue" },
    { "id": "stock", "label": "In stock?", "kind": "decision", "group": "app" },
    { "id": "worker", "label": "Fulfilment worker", "group": "app", "color": "blue" },
    { "id": "backorder", "label": "Back-order list", "group": "app", "color": "red" },
    { "id": "db", "label": "Orders DB", "group": "data", "color": "green" },
    { "id": "sla", "label": "Ships within 24h", "kind": "note" }
  ],
  "edges": [
    "customer -> api: places order",
    "api -> stock",
    "stock -> worker: yes",
    { "from": "stock", "to": "backorder", "label": "no" },
    "worker -> db",
    "backorder --> db",
    "worker -- sla"
  ]
}
```

- `direction`: `down` (default), `right`, `up` or `left`. Flows and org charts read well `down`; timelines and pipelines `right`.
- **nodes**: `id` (short, stable; you will refer to it later), `label` (use `\n` for a second line), optional `kind`, `color`, `group`, `link` (a URL or a file in the working folder).
  - `kind`: `box` (default), `rounded` (also `start`/`end`), `ellipse`, `decision` (diamond), `note` (sticky note), `text` (free text, no shape).
  - `color`: `gray`, `blue`, `green`, `yellow`, `orange`, `red`, `purple`, `pink`, `teal`, or `#rrggbb`. Notes are yellow by default.
- **edges**: `"a -> b"`, `"a -> b: label"`, `"a --> b"` (dashed), `"a <-> b"` (both ends), `"a -- b"` (plain line, no arrowhead); or objects with `from`, `to`, `label`, `style` (`solid`/`dashed`/`dotted`), `arrows` (`end`/`both`/`none`), optional `id`. An edge between a note (or free text) and a node attaches the note beside that node instead of adding a step to the flow; if that node is in a group, the note joins the group.
- **groups** become named frames around their nodes. A group's nodes are laid out together as one block, so group nodes that sit together (a layer, a team, a phase), not steps scattered through a flow. A node belongs to at most one group; groups cannot be nested.
- `title` (optional) is written above the board. `"style": "sketch"` gives a hand-drawn look; the default is clean.
- Nodes are placed automatically: there are no coordinates to give. Nodes with no edges are arranged in a grid (useful for brainstorm boards of notes inside groups).

## 2. Build the board

Run the bundled script with `vibework-js` (Vibework's JavaScript runtime, on the PATH; quote the path, it contains spaces):

```
vibework-js "<skill base directory>/scripts/board.ts" build "$VIBEWORK_SCRATCH/orders.json" orders.excalidraw
```

It prints what it created plus any warnings (unknown colours, edges to nodes that did not exist and were created, skipped self-loops). Fix the description and run again if a warning shows a mistake.

Then call **PresentFile** with the `.excalidraw` path so the board opens in the panel.

## 3. Change an existing board

The person may have moved, recoloured, relabelled or drawn things since you built it. Always start from the board as it is now:

```
vibework-js "<skill base directory>/scripts/board.ts" describe orders.excalidraw "$VIBEWORK_SCRATCH/orders.json"
```

This writes the current content in the same format, including shapes and arrows the person drew (marked `"drawnByPerson": true`). Edit that file (add, remove, rename, recolour, regroup, reconnect), then run the same `build` command as before. The script updates the board in place:

- **Kept**: the position and size of every existing node, and any colour, label or style the person changed, unless your description changes that same attribute. Everything else on the board (freehand drawing, images, their own text) is left alone.
- **Applied**: what you changed relative to your previous build: labels (a box grows around its centre if the new text does not fit), kinds, colours, groups, edge labels, styles and endpoints.
- **Added**: new nodes are placed next to the nodes they connect to (or in their group), clear of everything else; new edges are routed around other shapes.
- **Removed**: nodes, edges and groups that you created earlier and left out of the description, with their labels and arrows. Things the person drew are removed only if you list their ids in `"remove": ["id", ...]`.

Ids are what tie the description to the board, so never rename an id to rename a node: change its `label`. If the person deleted something and your description still lists it, it comes back; `describe` first avoids that.

`--fresh` (after the board path) discards the person's arrangement and lays everything out again. Only use it when the person asks for a full re-layout.

`vibework-js "<skill base directory>/scripts/board.ts" check board.excalidraw` validates a board file.

## Rules for good boards

- Short labels: 1 to 5 words, one concept per node. Put detail in a `note` attached to the node, not in the label.
- One direction per board; keep the main path on it and let branches and loops step aside.
- Use `decision` only for real yes/no or multi-way choices, and label every edge that leaves one.
- Group related nodes in frames (layers, teams, phases); 2 to 5 groups is plenty.
- Colour carries meaning (e.g. external systems gray, failures red, done green), at most 3 or 4 colours per board, and say what they mean if it is not obvious.
- Label edges only when the relationship is not obvious ("HTTPS", "yes", "on failure").
- Prefer several focused boards over one board with 60 nodes.
- After building, tell the person what the board shows and that they can rearrange it freely; your later updates will keep their arrangement.
