---
name: vibework-design
description: "Create portable visual designs as .design.html files: posters, social posts, app mockups, one-page briefs and illustration layouts, editable in the Design panel."
---
# Design

Write one self-contained `.design.html` file in the task folder. Read it fresh before every change: the person can edit it in the panel. Change only the requested content, preserving their additions. Call PresentFile with the absolute file_path and file_name when ready.

## Format conventions (version 1)

The file is ordinary, script-free HTML. Its body contains fixed-size artboards side by side. Use a relative-positioned section with a unique `data-design-frame` identifier, `data-name`, pixel width and height, overflow hidden and an explicit background. Body uses display:flex and gap:32px.

Objects are frame children, or nested inside groups with unique `data-design-id`, `data-design-kind` (text, rect, ellipse, line, image, svg, group), and `data-name`. `data-locked="true"` means locked; `data-hidden="true"` means hidden. Include `[data-hidden="true"]{display:none}` in the stylesheet for ordinary browsers.

Use inline `position:absolute;left:Npx;top:Npx;width:Npx;height:Npx`. Rotation is `transform:rotate(Ndeg)` around the centre. Text objects are divs with plain text (escape &, < and >), explicit font-family, font-size, font-weight, line-height and color. Rectangles use background and border; ellipses use border-radius:50%; lines are thin rectangles. Images use embedded data URLs; SVG is inline. A group is a positioned div whose children have local coordinates.

Unknown markup is retained in the file and shown read-only. Avoid external stylesheets, scripts, events, iframes and web resources. The panel does not load remote assets. Prefer inline geometry over class-dependent geometry. Keep identifiers stable across edits.

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>Studio open day</title>
<style>[data-hidden="true"]{display:none}</style></head>
<body style="margin:0;display:flex;gap:32px">
<section data-design-frame="poster" data-name="Open day" style="position:relative;width:1080px;height:1080px;overflow:hidden;background:#f4f0e8">
<div data-design-id="headline" data-design-kind="text" data-name="Headline" style="position:absolute;left:80px;top:120px;width:920px;height:240px;font-family:Arial;font-size:96px;line-height:1.05;font-weight:700;color:#243d32">Come see what we're making.</div>
<div data-design-id="details" data-design-kind="text" data-name="Details" style="position:absolute;left:80px;top:840px;width:920px;height:120px;font-family:Arial;font-size:32px;line-height:1.4;white-space:pre-wrap;color:#243d32">Saturday 21 November · 10 am–4 pm&#10;Studio 12, Riverside Works</div>
</section></body></html>
```

## Defaults

Choose 1080×1080 for a square post, 1080×1920 for a story, 1920×1080 for landscape, 794×1123 for A4, or 1440×900 for a desktop screen. Use 8px spacing increments, ample margins, two font families at most, a clear headline and readable body copy. Use real copy, never lorem ipsum. Use a restrained palette and enough text contrast. Preserve the requested brand.

## Check before presenting

Run `vibework-js "<this skill directory>/scripts/check.ts" "/absolute/path/name.design.html"`. Like the slides skill, this uses an available local headless Chromium, with a disposable profile, a scriptless sandbox and network blocked. It puts a PNG for every frame and report.json in a unique subfolder of `$VIBEWORK_SCRATCH` (or the system temporary directory), removes its browser profile, and closes the renderer. It never writes helpers or screenshots beside the person's design. Inspect every PNG, fix clipping, contrast and spacing, then rerun. If no local renderer is available, say the visual check was not performed.

## Editing and export

The person can select nested objects, move/resize/rotate, edit plain text, change appearance, reorder layers, group/ungroup and manage frames. Read the file again before each agent change. Use stable IDs and plain text with newline characters and `white-space:pre-wrap`, not rich HTML text.

Export uses locally measured text positions and local fonts. PNG (1×/2×), native SVG and a raster PDF are available for frames or selections. Use solid fills, uniform solid borders, rounded corners, embedded images and simple SVG. Gradients, masks, shadows, filters and unsupported HTML are explicitly blocked in the Export menu; do not promise fidelity for them. Avoid remote fonts. SVG uses local font names, so typography can change on a machine without those fonts. PDF pages contain raster artwork at frame resolution.

Prefer a strong editorial hierarchy, useful real copy and composed illustrations or embedded images. For app screens, include realistic navigation, labels, table rows and statuses. For social sets, make each frame distinct while retaining a consistent grid and type scale.
