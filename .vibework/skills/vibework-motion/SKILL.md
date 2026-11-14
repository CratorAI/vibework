---
name: vibework-motion
description: Create and present a Motion artifact in Vibework using an official HyperFrames project and its own skills.
---

Motion in Vibework means a HyperFrames project folder. Use the person's installed `hyperframes` skill router and its official skills unchanged for the authoring contract and CLI. If missing, tell the person to install the official skills; do not invent a replacement framework guide.

Create one named subfolder inside the task folder, with the framework's `hyperframes.json` and `index.html`. Keep assets local. Vibework uses upstream HyperFrames 0.9.41; the panel records its version in `.vibework-hyperframes.json`. Prefer CSS / Web Animations for new work; defer to the person's own HyperFrames skills if they call for GSAP. The downloaded Studio itself includes GSAP under its own licence.

Use the official lint, check and snapshot commands to inspect frames before presenting. Put snapshots in the task's scratch folder (or the project's hidden `.hyperframes/artifacts`), look at them, and fix visible problems. Use the existing `present_file` tool with the absolute **project folder** path and project name. Do not present its individual source files as separate artifacts.

The panel provides Studio preview and local MP4 rendering, with outputs in the project's `output` folder. Do not start a long-lived preview server yourself unless asked. Never use login, usage, cloud rendering or publishing commands. The `hyperframes` command is already set up by Vibework: use it directly for init, lint, check, snapshot and render. Its first run downloads HyperFrames once (about 420 MB), so it can take a few minutes; tell the person in one line that this is happening and carry on. Do not ask how to install it, and do not install it with npm, npx or bunx. Set `HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_SKIP_SKILLS=1` on CLI commands.

Narration and music: follow the official `media-use` skill, and decide instead of asking. When the request calls for a voiceover (an explainer, a narrated walkthrough, "with narration"), use the offline Kokoro voice: it needs no account or key. Set it up in the task's scratch folder with the `uv` command (a virtual environment with `kokoro-onnx` and `soundfile`), say in one line that a voice model is downloading the first time, and name the voice you chose. Use ElevenLabs or another paid voice only when the person asks for it and gives a key. When the request doesn't call for sound, build it silent. Never use the HeyGen sign-in.
