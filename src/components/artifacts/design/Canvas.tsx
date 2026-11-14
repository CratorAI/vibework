import { useCallback, useEffect, useRef, useState } from "react";
import { DesignFrame } from "./DesignFrame";
import {
  type Design,
  type Node,
  box,
  patchStyle,
  replace,
  escape,
} from "./model";
import { resizeHandle, type Handle, type Box, snap } from "./geometry";
import {
  layouts,
  measure,
  paintBox,
  union,
  localDelta,
  locked,
  readOnlyReason,
  selectionBox,
  type Layout,
} from "./live";
const id = (n: Node) =>
  n.attrs["data-design-id"] ?? n.attrs["data-design-frame"];
const handles: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
export type FrameDocuments = Map<string, Document>;
interface Props {
  design: Design;
  selection: string[];
  select: (ids: string[]) => void;
  zoom: number;
  setZoom: (n: number) => void;
  active: string;
  setActive: (id: string) => void;
  commit: (s: string) => void;
  documents: FrameDocuments;
  editing: (on: boolean) => void;
  onMeasure: () => void;
}
export function DesignCanvas(p: Props) {
  const viewport = useRef<HTMLDivElement>(null),
    space = useRef(false),
    [revision, refresh] = useState(0),
    [text, setText] = useState<{
      id: string;
      value: string;
      layout: Layout;
    } | null>(null);
  const measured = useRef(new Map<string, Layout>());
  const frameRoots = useRef(new Map<string, HTMLDivElement>());
  const fitted = useRef(false);
  const read = useCallback(() => {
    const all = new Map<string, Layout>();
    for (const doc of p.documents.values())
      for (const [key, l] of layouts(doc)) all.set(key, l);
    measured.current = all;
    refresh((v) => v + 1);
    p.onMeasure();
  }, [p.documents, p.onMeasure]);
  const zoomRef = useRef(p.zoom);
  zoomRef.current = p.zoom;
  useEffect(() => {
    const v = viewport.current;
    if (!v) return;
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const r = v.getBoundingClientRect(),
          x = e.clientX - r.left,
          y = e.clientY - r.top,
          old = zoomRef.current,
          next = Math.max(0.05, Math.min(4, old * Math.exp(-e.deltaY * 0.01)));
        const sx = (v.scrollLeft + x) / old,
          sy = (v.scrollTop + y) / old;
        p.setZoom(next);
        requestAnimationFrame(() => {
          v.scrollLeft = sx * next - x;
          v.scrollTop = sy * next - y;
        });
      } else {
        e.preventDefault();
        v.scrollLeft += e.shiftKey ? e.deltaY : e.deltaX;
        if (!e.shiftKey) v.scrollTop += e.deltaY;
      }
    };
    const key = (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
        !(e.target as HTMLElement).matches("input,textarea,[contenteditable]")
      ) {
        space.current = e.type === "keydown";
        if (space.current) e.preventDefault();
      }
    };
    let gestureZoom = 1,
      gx = 0,
      gy = 0;
    const gesture = (e: Event) => {
      const g = e as Event & {
        scale: number;
        clientX: number;
        clientY: number;
      };
      e.preventDefault();
      const r = v.getBoundingClientRect(),
        x = g.clientX - r.left,
        y = g.clientY - r.top;
      if (e.type === "gesturestart") {
        gestureZoom = zoomRef.current;
        gx = (v.scrollLeft + x) / gestureZoom;
        gy = (v.scrollTop + y) / gestureZoom;
      } else {
        const next = Math.max(0.05, Math.min(4, gestureZoom * g.scale));
        p.setZoom(next);
        requestAnimationFrame(() => {
          v.scrollLeft = gx * next - x;
          v.scrollTop = gy * next - y;
        });
      }
    };
    v.addEventListener("wheel", wheel, { passive: false });
    v.addEventListener("gesturestart", gesture);
    v.addEventListener("gesturechange", gesture);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    return () => {
      v.removeEventListener("wheel", wheel);
      v.removeEventListener("gesturestart", gesture);
      v.removeEventListener("gesturechange", gesture);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
    };
  }, [p.setZoom]);
  useEffect(() => {
    const v = viewport.current;
    if (!v || fitted.current || !p.design.frames.length) return;
    const b = box(p.design.frames[0]);
    p.setZoom(
      Math.max(
        0.05,
        Math.min(1, (v.clientWidth - 64) / b.w, (v.clientHeight - 80) / b.h),
      ),
    );
    fitted.current = true;
  }, [p.design, p.setZoom]);
  function pan(e: React.PointerEvent) {
    if (!space.current && e.button !== 1) return false;
    e.preventDefault();
    const v = viewport.current!,
      x = e.clientX,
      y = e.clientY,
      sx = v.scrollLeft,
      sy = v.scrollTop;
    const move = (ev: PointerEvent) => {
      v.scrollLeft = sx - ev.clientX + x;
      v.scrollTop = sy - ev.clientY + y;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return true;
  }
  function visibleBox(root: HTMLElement, b: Box) {
    Object.assign(root.style, {
      left: `${b.x}px`,
      top: `${b.y}px`,
      width: `${b.w}px`,
      height: `${b.h}px`,
      transform: `rotate(${b.rotation}deg)`,
    });
  }
  function drag(
    e: React.PointerEvent,
    n: Node,
    f: Node,
    handle?: Handle | "rotate",
  ) {
    e.preventDefault();
    e.stopPropagation();
    viewport.current
      ?.closest<HTMLElement>(".design-editor")
      ?.focus({ preventScroll: true });
    if (pan(e)) return;
    const initial = measured.current.get(id(n));
    if (!initial || locked(initial.element) || readOnlyReason(initial.element))
      return;
    p.setActive(id(f));
    let ids = p.selection.includes(id(n)) ? p.selection : [id(n)];
    if (e.shiftKey && !handle && !p.selection.includes(id(n)))
      ids = [...p.selection, id(n)];
    // Selecting a parent excludes its descendants from a multi-transform.
    let items = ids
      .map((i) => ({ id: i, l: measured.current.get(i)! }))
      .filter((x) => x.l && !locked(x.l.element));
    items = items.filter(
      (x) => !items.some((y) => x !== y && y.l.element.contains(x.l.element)),
    );
    let source = p.design.source;
    if (e.altKey && !handle) {
      const inserts: { at: number; raw: string }[] = [];
      for (const x of items) {
        const node = p.design.nodes.find((n) => id(n) === x.id)!;
        const newId = crypto.randomUUID(),
          clone = x.l.element.cloneNode(true) as HTMLElement;
        const raw = p.design.source.slice(node.start, node.end);
        const mapping = new Map<string, string>();
        clone
          .querySelectorAll<HTMLElement>("[data-design-id]")
          .forEach((el) => {
            const old = el.dataset.designId!,
              next = crypto.randomUUID();
            mapping.set(old, next);
            el.dataset.designId = next;
          });
        mapping.set(x.id, newId);
        clone.dataset.designId = newId;
        x.l.element.after(clone);
        const copy = raw.replace(
          /(data-design-id\s*=\s*)(["'])(.*?)\2/gi,
          (_all, prefix, quote, old) =>
            `${prefix}${quote}${mapping.get(old) ?? old}${quote}`,
        );
        inserts.push({ at: node.end, raw: copy });
        x.id = newId;
        x.l = measure(clone);
      }
      for (const item of inserts.sort((a, b) => b.at - a.at))
        source = replace(source, item.at, item.at, item.raw);
      ids = items.map((x) => x.id);
    }
    p.editing(true);
    p.select(ids);
    const startX = e.clientX,
      startY = e.clientY,
      root = frameRoots.current.get(id(f))!,
      outline = root.querySelector<HTMLElement>(".design-transform-box")!,
      guide = root.querySelector<SVGSVGElement>(".design-guides")!;
    const bbox = union(items.map((x) => x.l.world)),
      centre = { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h / 2 };
    const rect = root.getBoundingClientRect();
    const initialAngle = Math.atan2(
      (e.clientY - rect.top) / p.zoom - centre.y,
      (e.clientX - rect.left) / p.zoom - centre.x,
    );
    const fb = measured.current.get(id(f))?.world ?? box(f);
    const siblings = [...measured.current.values()]
      .filter(
        (x) =>
          x.element.ownerDocument === initial.element.ownerDocument &&
          !items.some(
            (y) => y.l.element === x.element || y.l.element.contains(x.element),
          ) &&
          !x.element.hasAttribute("data-design-frame"),
      )
      .map((x) => x.world);
    let final = items.map((x) => x.l.local),
      pending: PointerEvent | null = null,
      raf = 0;
    const timestamps: number[] = [];
    let last = performance.now();
    function paint(ev: PointerEvent) {
      const now = performance.now();
      timestamps.push(now - last);
      last = now;
      let dx = (ev.clientX - startX) / p.zoom,
        dy = (ev.clientY - startY) / p.zoom;
      if (ev.shiftKey && !handle) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      let sx = dx,
        sy = dy;
      const guides: string[] = [];
      if (!handle) {
        const xs = [
            0,
            fb.w / 2,
            fb.w,
            ...siblings.flatMap((b) => [b.x, b.x + b.w / 2, b.x + b.w]),
          ],
          ys = [
            0,
            fb.h / 2,
            fb.h,
            ...siblings.flatMap((b) => [b.y, b.y + b.h / 2, b.y + b.h]),
          ];
        let best = 5 / p.zoom;
        for (const edge of [bbox.x, bbox.x + bbox.w / 2, bbox.x + bbox.w]) {
          const target = snap(edge + dx, xs, 5 / p.zoom),
            delta = target - (edge + dx);
          if (delta !== 0 && Math.abs(delta) < best) {
            best = Math.abs(delta);
            sx = dx + delta;
            guides[0] = `<line x1="${target}" x2="${target}" y1="0" y2="${fb.h}"/>`;
          }
        }
        best = 5 / p.zoom;
        for (const edge of [bbox.y, bbox.y + bbox.h / 2, bbox.y + bbox.h]) {
          const target = snap(edge + dy, ys, 5 / p.zoom),
            delta = target - (edge + dy);
          if (delta !== 0 && Math.abs(delta) < best) {
            best = Math.abs(delta);
            sy = dy + delta;
            guides[1] = `<line y1="${target}" y2="${target}" x1="0" x2="${fb.w}"/>`;
          }
        }
      }
      let angle = 0;
      if (handle === "rotate") {
        angle =
          ((Math.atan2(
            (ev.clientY - rect.top) / p.zoom - centre.y,
            (ev.clientX - rect.left) / p.zoom - centre.x,
          ) -
            initialAngle) *
            180) /
          Math.PI;
        if (ev.shiftKey) angle = Math.round(angle / 15) * 15;
      }
      const scaled =
        handle && handle !== "rotate"
          ? resizeHandle(bbox, dx, dy, handle, ev.shiftKey, ev.altKey)
          : bbox;
      final = items.map(({ l }) => {
        let b = { ...l.local };
        if (!handle) {
          const d = localDelta(sx, sy, l.parentAngle);
          b.x += d.x;
          b.y += d.y;
        } else if (handle === "rotate") {
          const a = (angle * Math.PI) / 180,
            cx = l.world.x + l.world.w / 2 - centre.x,
            cy = l.world.y + l.world.h / 2 - centre.y;
          const d = localDelta(
            cx * Math.cos(a) - cy * Math.sin(a) - cx,
            cx * Math.sin(a) + cy * Math.cos(a) - cy,
            l.parentAngle,
          );
          b.x += d.x;
          b.y += d.y;
          b.rotation += angle;
        } else if (items.length === 1) {
          const d = localDelta(dx, dy, l.parentAngle);
          b = resizeHandle(b, d.x, d.y, handle, ev.shiftKey, ev.altKey);
        } else {
          const wx = scaled.w / bbox.w,
            hy = scaled.h / bbox.h,
            d = localDelta(
              scaled.x + (l.world.x - bbox.x) * wx - l.world.x,
              scaled.y + (l.world.y - bbox.y) * hy - l.world.y,
              l.parentAngle,
            );
          b = { ...b, x: b.x + d.x, y: b.y + d.y, w: b.w * wx, h: b.h * hy };
        }
        if (!handle) {
          l.element.style.transform = `translate3d(${b.x - l.local.x}px,${b.y - l.local.y}px,0) rotate(${b.rotation}deg)`;
        } else paintBox(l.element, b);
        return b;
      });
      const live = items.map((x) => measure(x.l.element)),
        world = union(live.map((x) => x.world));
      visibleBox(outline, selectionBox(live));
      outline.style.display = "block";
      const distances: string[] = [];
      if (!handle) {
        const near = siblings
          .filter((b) => b.y < world.y + world.h && b.y + b.h > world.y)
          .map((b) =>
            b.x >= world.x + world.w
              ? { a: world.x + world.w, b: b.x }
              : b.x + b.w <= world.x
                ? { a: b.x + b.w, b: world.x }
                : null,
          )
          .filter((v): v is { a: number; b: number } => !!v)
          .sort((a, b) => a.b - a.a - (b.b - b.a))[0];
        if (near && near.b - near.a < 200 / p.zoom) {
          const y = world.y + world.h / 2;
          distances.push(
            `<line x1="${near.a}" x2="${near.b}" y1="${y}" y2="${y}"/><text x="${(near.a + near.b) / 2}" y="${y - 5 / p.zoom}" font-size="${10 / p.zoom}" text-anchor="middle">${Math.round(near.b - near.a)} px</text>`,
          );
        }
      }
      guide.innerHTML =
        guides.join("") +
        distances.join("") +
        `<text x="${world.x + world.w / 2}" y="${Math.max(14, world.y - 12 / p.zoom)}" font-size="${11 / p.zoom}" text-anchor="middle">${Math.round(world.x)}, ${Math.round(world.y)} · ${Math.round(world.w)} × ${Math.round(world.h)}</text>`;
      for (const [i, { id: key }] of items.entries()) {
        const overlay = root.querySelector<HTMLElement>(
          `[data-overlay="${CSS.escape(key)}"]`,
        );
        if (overlay) visibleBox(overlay, live[i].world);
      }
    }
    function move(ev: PointerEvent) {
      pending = ev;
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (pending) paint(pending);
        });
    }
    function up() {
      if (raf) cancelAnimationFrame(raf);
      if (pending) paint(pending);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      let next = source;
      items.forEach((x, i) => {
        const b = final[i];
        next = patchStyle(next, x.id, {
          left: `${b.x}px`,
          top: `${b.y}px`,
          width: `${b.w}px`,
          height: `${b.h}px`,
          transform: `rotate(${b.rotation}deg)`,
        });
      });
      if (e.shiftKey && !handle && !pending && p.selection.includes(id(n)))
        p.select(p.selection.filter((key) => key !== id(n)));
      guide.innerHTML = "";
      root.dataset.dragFrames = JSON.stringify(timestamps);
      p.commit(next);
      p.editing(false);
      read();
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }
  function marquee(e: React.PointerEvent, f: Node) {
    if (pan(e)) return;
    e.preventDefault();
    p.setActive(id(f));
    const root = frameRoots.current.get(id(f))!,
      r = root.getBoundingClientRect(),
      x = (e.clientX - r.left) / p.zoom,
      y = (e.clientY - r.top) / p.zoom,
      marquee = root.querySelector<HTMLElement>(".design-marquee")!;
    const prior = e.shiftKey ? p.selection : [];
    p.select(prior);
    const move = (ev: PointerEvent) => {
      const ex = (ev.clientX - r.left) / p.zoom,
        ey = (ev.clientY - r.top) / p.zoom,
        b = {
          x: Math.min(x, ex),
          y: Math.min(y, ey),
          w: Math.abs(ex - x),
          h: Math.abs(ey - y),
          rotation: 0,
        };
      visibleBox(marquee, b);
      marquee.style.display = "block";
      const doc = p.documents.get(id(f));
      p.select([
        ...new Set([
          ...prior,
          ...[...measured.current]
            .filter(
              ([, l]) =>
                l.element.ownerDocument === doc &&
                !l.element.hasAttribute("data-design-frame") &&
                !locked(l.element) &&
                !readOnlyReason(l.element) &&
                l.world.x >= b.x &&
                l.world.y >= b.y &&
                l.world.x + l.world.w <= b.x + b.w &&
                l.world.y + l.world.h <= b.y + b.h,
            )
            .map(([key]) => key),
        ]),
      ]);
    };
    const up = () => {
      marquee.style.display = "none";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  void revision;
  return (
    <div
      ref={viewport}
      className="design-viewport"
      data-testid="design-canvas"
      onPointerDownCapture={(e) => {
        if ((space.current || e.button === 1) && pan(e)) e.stopPropagation();
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          if (!pan(e)) p.select([]);
        }
      }}
    >
      <div
        className="design-frames"
        style={{
          width: p.design.frames.reduce(
            (v, n) =>
              v +
              (measured.current.get(id(n))?.local.w ?? box(n).w) * p.zoom +
              40,
            40,
          ),
        }}
      >
        {p.design.frames.map((f) => {
          const b = measured.current.get(id(f))?.local ?? box(f),
            doc = p.documents.get(id(f)),
            items = p.design.nodes.filter(
              (n) =>
                doc?.defaultView &&
                n.attrs["data-design-id"] &&
                measured.current.get(id(n))?.element.ownerDocument === doc,
            );
          const selected = items.filter((n) => p.selection.includes(id(n)));
          const bb = selectionBox(
              selected.map((n) => measured.current.get(id(n))!),
            ),
            textLayout = text
              ? (measured.current.get(text.id) ?? text.layout)
              : null;
          return (
            <div
              className="design-artboard"
              key={id(f)}
              style={{ width: b.w * p.zoom, flexShrink: 0 }}
            >
              <button
                className="design-frame-label"
                onClick={() => {
                  p.setActive(id(f));
                  p.select([id(f)]);
                }}
              >
                {f.attrs["data-name"] || "Frame"}
                <span>
                  {b.w} × {b.h}
                </span>
              </button>
              <div
                style={{
                  width: b.w * p.zoom,
                  height: b.h * p.zoom,
                  position: "relative",
                }}
              >
                <div
                  className="design-frame-root"
                  ref={(el) => {
                    if (el) frameRoots.current.set(id(f), el);
                    else frameRoots.current.delete(id(f));
                  }}
                  style={{
                    width: b.w,
                    height: b.h,
                    transform: `scale(${p.zoom})`,
                    transformOrigin: "0 0",
                    position: "absolute",
                  }}
                >
                  <div className="pointer-events-none size-full">
                    <DesignFrame
                      design={p.design}
                      frame={f}
                      onReady={(iframe) => {
                        const d = iframe.contentDocument;
                        if (!d) return;
                        for (const key of p.documents.keys())
                          if (
                            !p.design.frames.some((frame) => id(frame) === key)
                          )
                            p.documents.delete(key);
                        p.documents.set(id(f), d);
                        void d.fonts.ready.then(read);
                        d.querySelectorAll("img").forEach((im) =>
                          im.addEventListener("load", read, { once: true }),
                        );
                        read();
                      }}
                    />
                  </div>
                  <div
                    className="design-hit-area"
                    onPointerDown={(e) => marquee(e, f)}
                  />
                  {items.map((n) => {
                    const l = measured.current.get(id(n))!,
                      key = id(n),
                      reason = readOnlyReason(l.element),
                      sel = p.selection.includes(key);
                    if (
                      l.computed.display === "none" ||
                      !l.world.w ||
                      !l.world.h
                    )
                      return null;
                    return (
                      <div
                        key={key}
                        data-overlay={key}
                        title={reason ?? n.attrs["data-name"]}
                        className={`design-overlay ${sel ? "selected" : ""} ${reason ? "read-only" : ""}`}
                        style={{
                          left: l.world.x,
                          top: l.world.y,
                          width: l.world.w,
                          height: l.world.h,
                          pointerEvents: locked(l.element) ? "none" : "auto",
                          zIndex:
                            n.attrs["data-design-kind"] === "group" ? 1 : 2,
                        }}
                        onPointerDown={(e) => {
                          if (reason) {
                            e.stopPropagation();
                            p.select([key]);
                            return;
                          }
                          drag(e, n, f);
                        }}
                        onDoubleClick={() => {
                          if (
                            n.attrs["data-design-kind"] === "text" &&
                            !reason
                          ) {
                            setText({
                              id: key,
                              value: l.element.textContent ?? "",
                              layout: l,
                            });
                            p.editing(true);
                          }
                        }}
                      >
                        {reason && (
                          <span style={{ fontSize: 11 / p.zoom }}>
                            Read-only
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {doc &&
                    [
                      ...doc.querySelectorAll<HTMLElement>(
                        "[data-design-readonly]",
                      ),
                    ].map((el) => {
                      const r = el.getBoundingClientRect();
                      return (
                        <div
                          key={el.dataset.designReadonly}
                          className="design-overlay read-only"
                          title="This HTML block has no editable design ID. It is preserved unchanged in the file."
                          style={{
                            left: r.x,
                            top: r.y,
                            width: r.width,
                            height: r.height,
                            zIndex: 3,
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <span style={{ fontSize: 11 / p.zoom }}>
                            Read-only
                          </span>
                        </div>
                      );
                    })}
                  <div
                    className="design-transform-box"
                    style={{
                      display: selected.length ? "block" : "none",
                      left: bb.x,
                      top: bb.y,
                      width: bb.w,
                      height: bb.h,
                      transform: `rotate(${bb.rotation}deg)`,
                      pointerEvents: "none",
                    }}
                  >
                    {selected.length > 0 &&
                      handles.map((h) => (
                        <button
                          key={h}
                          aria-label={`Resize ${h}`}
                          data-handle={h}
                          style={{
                            width: 7 / p.zoom,
                            height: 7 / p.zoom,
                            margin: -3.5 / p.zoom,
                            pointerEvents: "auto",
                          }}
                          onPointerDown={(e) => drag(e, selected[0], f, h)}
                        />
                      ))}
                    {selected.length > 0 && (
                      <button
                        aria-label="Rotate selection"
                        className="design-rotation"
                        style={{
                          top: -24 / p.zoom,
                          width: 8 / p.zoom,
                          height: 8 / p.zoom,
                          pointerEvents: "auto",
                        }}
                        onPointerDown={(e) => drag(e, selected[0], f, "rotate")}
                      />
                    )}
                  </div>
                  <svg
                    className="design-guides"
                    style={{ strokeWidth: 1 / p.zoom }}
                    width={b.w}
                    height={b.h}
                  />
                  <div className="design-marquee" />
                  {text &&
                    textLayout &&
                    textLayout.element.ownerDocument === doc && (
                      <textarea
                        className="design-text-edit"
                        autoFocus
                        value={text.value}
                        aria-label="Edit text"
                        style={{
                          left: selectionBox([textLayout]).x,
                          top: selectionBox([textLayout]).y,
                          width: textLayout.local.w,
                          height: textLayout.local.h,
                          transform: `rotate(${textLayout.local.rotation + textLayout.parentAngle}deg)`,
                          font: textLayout.computed.font,
                          lineHeight: textLayout.computed.lineHeight,
                          letterSpacing: textLayout.computed.letterSpacing,
                          textAlign: textLayout.computed.textAlign as "left",
                          color: textLayout.computed.color,
                          padding: textLayout.computed.padding,
                        }}
                        onChange={(e) =>
                          setText({ ...text, value: e.target.value })
                        }
                        onKeyDown={(e) => e.stopPropagation()}
                        onBlur={() => {
                          const n = p.design.nodes.find(
                            (n) => id(n) === text.id,
                          );
                          if (n) {
                            let next = replace(
                              p.design.source,
                              n.openEnd,
                              n.closeStart,
                              escape(text.value),
                            );
                            next = patchStyle(next, text.id, {
                              "white-space": "pre-wrap",
                            });
                            p.commit(next);
                          }
                          setText(null);
                          p.editing(false);
                        }}
                      />
                    )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
