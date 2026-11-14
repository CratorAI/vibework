# Isolated performance probes

Use only an isolated worktree and `/tmp` data. No real keys, native-agent turns,
installed-app automation, desktop clicks or browser are required.

```
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
export CARGO_TARGET_DIR=/tmp/vibework-perf/target
bun scripts/perf/fixtures.mjs
bun scripts/perf/app.mjs start dev
bun scripts/perf/make-tasks.mjs
LABEL=debug bun scripts/perf/measure.mjs sidebar search picker conversation
bun scripts/perf/app.mjs stop
```

Fixture generation runs scripted OpenCode turns against `fake_model.py`, including
tools and one helper. Never change its model to Claude Code or Codex. It creates
500 short tasks, 160 long-task turns and large files; it can take several minutes.
Preserve the resulting data directory as a template before mutating scenarios.

For optimized Rust and frontend:

```
bun run tauri build --bundles app --features dev-release-probe
bun scripts/perf/app.mjs start release /private/tmp/vibework-perf/target/release/bundle/macos/Vibework.app
LABEL=release bun scripts/perf/measure.mjs sidebar search picker conversation switch
LABEL=release bun scripts/perf/measure.mjs stream multi artifacts viewers design leak
LABEL=release bun scripts/perf/measure.mjs idle
bun scripts/perf/app.mjs stop
```

The probe feature is **never shipped**. Build shipping binaries separately using
`VIBEWORK_INSTALL_TARGET_DIR=/tmp/vibework-perf/target bash scripts/install-app.sh --build-only`.
`app.mjs` supplies a dummy key, loopback origin and private data folder. Release
probe loopback forwarding requires the accompanying engine/bridge.rs change.
Before that change, zero-event streaming results are invalid authentication failures.

`PERF_FRESH_FROM` copies a template into `PERF_DATA` on launch (the destination is
removed first). Never point either at personal app data. `PERF_BACKGROUND=1` is
for functional checks only: **do not use its frame timings as performance evidence**.
A normal window can still become occluded. Record `document.visibilityState` and
`document.hasFocus()` with each run; neither proves the window is unobscured.
Do not activate it over someone else's work. `idle` hides the window last.
Its unfocused phase simulates blur; it is not a native focus-switch measurement.

Results land in `/tmp/vibework-perf/results/<LABEL>-<scenario>.json`. `*-error.json`
means incomplete, not a performance regression. The runner exits nonzero on any
scenario failure. Do not compare different loads, build modes or fixture versions.
The bridge has a 30-second deadline; the runner bounds frame samples and rejects
missing frames. Remaining long viewer/gallery operations can exceed that deadline;
restart the probe after a timeout, since bridge timeout does not cancel page JS.
Open timings include a 250ms settling guard; `openMs` is DOM-settle timing,
`paintedMs` includes the guard and two frame callbacks, not first-paint telemetry.
Stream event bytes are JSON string lengths, not network byte accounting. React
render counters use an opt-in development hook, not production Profiler evidence.

For the startup dependency graph:

```
bunx vite build --outDir /tmp/vibework-perf/dist --sourcemap
bun scripts/perf/bundle.mjs /tmp/vibework-perf/dist
```

This counts static JS imports and entry CSS, not fonts actually fetched. Sourcemap
attribution is generated character spans, approximately bytes for ASCII code.
Vite's large-chunk warning also includes lazy viewers and workers.

`app.mjs status` shows owned app descendants. Sample only those PIDs and the
WebContent PID returned by the authenticated bridge. Always stop the app and
verify those PIDs exited. Do not use an old `pids.json` to stop a previous run:
PIDs can be reused. Archive stale tracking files before starting a new session.

## Foreground slot (explicit permission required)

`foreground.mjs` starts only the supplied isolated release probe, activates its
exact PID, and quits it in `finally`. Do not run it while the owner is working.
It rejects background mode, checks visibility/focus/frame arrival before each
scenario, records failures and continues, and has a 9.5-minute work budget plus
shutdown. It never sends desktop input. Build/copy the probe separately before
rebuilding the shipping package (the latter overwrites the target bundle):

```
DEVELOPER_DIR=/Library/Developer/CommandLineTools CARGO_TARGET_DIR=/tmp/vibework-perf/target bun run tauri build --bundles app --features dev-release-probe
ditto /tmp/vibework-perf/target/release/bundle/macos/Vibework.app /tmp/vibework-perf/probe-next/Vibework.app
# Only during the authorized slot; stop your competing builds first:
env -u PERF_BACKGROUND bun scripts/perf/foreground.mjs /private/tmp/vibework-perf/probe-next/Vibework.app
```

Outputs: `/tmp/vibework-perf/results/foreground.json` and `foreground.md`;
`foreground-progress.json` is updated after each scenario. Cold means a new
process with restored fixture data, not flushed OS disk caches. Interactive
and engine-ready times are upper bounds including activation and frame checks.
`PERF_ONLY` optionally selects comma-separated scenario prefixes for a retry.
The script restores private data from `PERF_TEMPLATE` (default `data-template`)
for the first launch. Do not point either at personal data. It reads the existing
long/big fixture ID files. It validates file-card paths to exclude native Open /
Reveal actions. Sandboxed viewer iframe scrolling is not bypassed; a result with
`scrollExercised: false` is only a parent-frame sample, not viewer interaction proof.
The rejected conversation-containment trial is not rerun; conversation structure stays unchanged.

Hidden diagnostics (no foreground activation):

```
LABEL=hidden bun scripts/perf/hidden.mjs home index conversation pickers
LABEL=throughput bun scripts/perf/throughput.mjs
bun scripts/perf/home-scheduler.mjs
bun scripts/perf/cv-experiment.mjs
bun scripts/perf/table-experiment.mjs
```

`home` samples the owned WebContent PID with `ps -o %cpu` for 30 seconds;
`throughput` measures three scripted turns, exact UTF-8 event payload sizes,
completion-window event rate, and owned Rust/WebContent CPU for 30 seconds.
The scheduler probe is a deterministic 120 Hz simulation, not measured FPS.
The CSS experiments remove the styles before returning; they are not product fixes.

## Windowed gallery / legacy XLS (background-safe)

Start an isolated probe with `PERF_BACKGROUND=1`, then run:

```
PERF_PRIME_INDEX=1 LABEL=windowing bun scripts/perf/windowing.mjs gallery xls
bun scripts/perf/xls-checks.mjs
bun scripts/perf/windowing-checks.mjs
bun scripts/perf/gallery-controls.mjs
bun scripts/perf/app.mjs stop
```

The optional prime calls `artifacts_index` before navigation and records its IPC
latency separately. First-card and worksheet readiness record DOM insertion and
forced layout completion separately; neither is first paint. At four scroll
stops the harness changes grid width by 0.1%, or table border spacing by 0.01px,
and forces layout with geometry reads. These are **invalidated-layout stress
costs**, not normal scrolling duration or FPS. JSON includes node counts, actual
sizes/column widths and owned WebContent physical footprint (`top MEM`). Memory
is a process snapshot and includes caches; it is not retained-heap accounting.
Hidden page timers can be throttled, so checks poll DOM conditions through the
bridge instead of assuming a 20ms in-page timer means React has committed.

For the HomeField comparison, start the **development** probe and run:

```
LABEL=glyph-cache bun scripts/perf/glyph-cache.mjs
bun scripts/perf/app.mjs stop
```

It uses the current HomeField drawing source and the production glyph helper,
substituting native `fillText` for the baseline. Twelve frame pairs cover three
timesteps, two themes and DPR 1/2. PNG pairs and JSON land under the perf output
directory. It reports raw RGBA and composited RGB pixel differences, then times
four alternating 200-draw batches per renderer with a full readback at each
batch's end. This is synchronous elapsed draw cost, **not thread CPU time or a
new focused-process CPU sample**. The real background animation remains paused.
