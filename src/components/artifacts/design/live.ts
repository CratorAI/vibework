import type { Box } from "./geometry";
export const idOfElement = (el: Element) =>
  el.getAttribute("data-design-id") ??
  el.getAttribute("data-design-frame") ??
  "";
export const findElement = (doc: Document, id: string) =>
  doc.defaultView
    ? [
        ...doc.querySelectorAll<HTMLElement>(
          "[data-design-id],[data-design-frame]",
        ),
      ].find((el) => idOfElement(el) === id)
    : undefined;
export interface Layout {
  local: Box;
  world: Box;
  parentAngle: number;
  element: HTMLElement;
  computed: CSSStyleDeclaration;
}
export function measure(element: HTMLElement): Layout {
  const win = element.ownerDocument.defaultView!;
  const cs = win.getComputedStyle(element),
    rect = element.getBoundingClientRect();
  const matrix = new DOMMatrix(
    cs.transform === "none" ? undefined : cs.transform,
  );
  const rotation = (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
  let parentAngle = 0;
  for (
    let p = element.parentElement;
    p && !p.hasAttribute("data-design-frame");
    p = p.parentElement
  ) {
    const m = new DOMMatrix(
      win.getComputedStyle(p).transform === "none"
        ? undefined
        : win.getComputedStyle(p).transform,
    );
    parentAngle += (Math.atan2(m.b, m.a) * 180) / Math.PI;
  }
  return {
    element,
    computed: cs,
    parentAngle,
    local: {
      x: element.offsetLeft,
      y: element.offsetTop,
      w: element.offsetWidth,
      h: element.offsetHeight,
      rotation,
    },
    world: { x: rect.x, y: rect.y, w: rect.width, h: rect.height, rotation: 0 },
  };
}
export function layouts(doc: Document) {
  if (!doc.defaultView) return new Map<string, Layout>();
  return new Map(
    [
      ...doc.querySelectorAll<HTMLElement>(
        "[data-design-id],[data-design-frame]",
      ),
    ].map((el) => [idOfElement(el), measure(el)]),
  );
}
export function paintBox(el: HTMLElement, b: Box) {
  Object.assign(el.style, {
    left: `${b.x}px`,
    top: `${b.y}px`,
    width: `${b.w}px`,
    height: `${b.h}px`,
    transform: `rotate(${b.rotation}deg)`,
  });
}
export function union(boxes: Box[]): Box {
  if (!boxes.length) return { x: 0, y: 0, w: 0, h: 0, rotation: 0 };
  const x = Math.min(...boxes.map((b) => b.x)),
    y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...boxes.map((b) => b.x + b.w)) - x,
    h: Math.max(...boxes.map((b) => b.y + b.h)) - y,
    rotation: 0,
  };
}
export function localDelta(dx: number, dy: number, angle: number) {
  const a = (angle * Math.PI) / 180;
  return {
    x: dx * Math.cos(a) + dy * Math.sin(a),
    y: -dx * Math.sin(a) + dy * Math.cos(a),
  };
}
export function locked(el: HTMLElement) {
  return !!el.closest('[data-locked="true"]');
}
export function readOnlyReason(el: HTMLElement): string | null {
  if (!el.ownerDocument.defaultView) return "This frame is reloading.";
  const kind = el.getAttribute("data-design-kind");
  if (
    !kind ||
    !["text", "rect", "ellipse", "line", "image", "svg", "group"].includes(kind)
  )
    return "This HTML block is preserved, but its element type is not editable.";
  if (kind === "text" && el.children.length)
    return "Rich HTML text is preserved. Edit this block in the source file.";
  const s = el.ownerDocument.defaultView!.getComputedStyle(el);
  const origin = s.transformOrigin.split(" ").map(parseFloat);
  if (
    s.transform !== "none" &&
    (Math.abs(origin[0] - el.offsetWidth / 2) > 1 ||
      Math.abs(origin[1] - el.offsetHeight / 2) > 1)
  )
    return "This block rotates around a custom origin. It is preserved as read-only.";
  if (s.position !== "absolute")
    return "This block uses flowing layout. Canvas edits need absolute positioning.";
  const m = new DOMMatrix(s.transform === "none" ? undefined : s.transform);
  if (
    Math.abs(Math.hypot(m.a, m.b) - 1) > 0.001 ||
    Math.abs(Math.hypot(m.c, m.d) - 1) > 0.001
  )
    return "Scaled or skewed CSS transforms are preserved as read-only.";
  return null;
}

/** An oriented box for a single layer, axis-aligned bounds for many layers. */
export function selectionBox(items: Layout[]): Box {
  if (items.length !== 1) return union(items.map((l) => l.world));
  const l = items[0];
  return {
    x: l.world.x + l.world.w / 2 - l.local.w / 2,
    y: l.world.y + l.world.h / 2 - l.local.h / 2,
    w: l.local.w,
    h: l.local.h,
    rotation: l.local.rotation + l.parentAngle,
  };
}
