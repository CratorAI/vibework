# README illustrations

The pictures in the main README. Everything here is generated; edit the
sources in `src/`, not the images.

| Files | What it is | Source |
| --- | --- | --- |
| `wordmark-light.svg`, `wordmark-dark.svg` | The header wordmark | The app's `src/components/brand/Lockup.tsx` |
| `hero-*.webp` | The animated hero, wide and phone (`hero-compact-*`) | `src/scenes/hero.tsx` |
| `models-*`, `artifacts-*`, `modes-*`, `connectors-*`, `agents-*` | Feature tiles (stills) | `src/scenes/tiles.tsx` |
| `steer-*.webp` | Feature tile (short loop) | `src/scenes/tiles.tsx` |
| `shots/*.webp` | Real screenshots of the app | Captured from a debug build, framed by `src/frame-shots.mjs` |

Every picture comes in a light and a dark version; the README picks one with
`<picture>` and `prefers-color-scheme`, and the hero also switches to its
phone design under 600px.

## Rebuild

Needs Node 20 or later, Google Chrome and libwebp (`brew install webp`).

```sh
cd docs/readme/src
npm install
npm run build            # every asset, about 15 minutes
npm run build -- hero    # only the assets whose name starts with "hero"
npm run dev              # preview a scene: http://localhost:1492/?scene=hero&theme=dark
```

The scenes are Stageshow compositions (Stageshow by Benji Taylor):
its React kit is copied into `src/kit` (MIT, see `src/kit/LICENSE`; the kit's
third-party brand artwork is left out). They use the app's own wordmark,
icons (`src/lib/icons.tsx`) and provider marks (`public/model-icons`,
`public/service-icons`), and colours copied from `src/index.css` into
`src/scenes/vw.css`. When the app's look changes, update `vw.css` and the
scenes, then rebuild.

`render.mjs` opens each scene in headless Chrome on Stageshow's virtual
clock, steps it one frame at a time at 30 fps and screenshots each frame at
2x, so every render of a loop is identical. A loop is cut at the exact
frame its script starts again, repeated frames are merged, and `img2webp`
writes an animated WebP. Nothing is loaded from the network while
rendering; the fonts come from the `@fontsource` packages.

## The screenshots

`shots/` holds real captures of a debug build, taken with an isolated data
folder, a background window, a dummy key and a scripted stand-in model on
loopback (see `scripts/e2e/README.md`), using a sample folder of synthetic
interview notes. Capture each window with `screencapture -o -l <window id>`
as `<name>-light.png` and `<name>-dark.png` in one folder (1400 by 872),
then frame and encode them:

```sh
cd docs/readme/src
node frame-shots.mjs /path/to/captures   # writes ../shots/<name>-<theme>.webp
```

Retake them when the interface changes.
