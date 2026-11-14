import { measure, union } from "./live";
import { escape } from "./model";
import { roundedRectPath } from "./svgGeometry";
const esc = (s: string) => escape(s).replace(/>/g, "&gt;");
/** Check before offering an export: unsupported paint is never approximated. */
export function exportWarnings(elements: HTMLElement[]): string[] {
  const warnings = new Set<string>();
  for (const doc of new Set(elements.map((el) => el.ownerDocument)))
    for (const sheet of [...doc.styleSheets]) {
      try {
        if ([...sheet.cssRules].some((r) => r.cssText.startsWith("@font-face")))
          warnings.add(
            "Custom font files are not embedded by export. Use an installed font before exporting.",
          );
      } catch {
        warnings.add("A stylesheet could not be inspected for export.");
      }
    }
  for (const root of elements)
    for (const el of [root, ...root.querySelectorAll<HTMLElement>("*")]) {
      if (el.tagName.toLowerCase() === "style") continue;
      const warn = (message: string) =>
        warnings.add(
          `${el.getAttribute("data-name") || el.tagName.toLowerCase()}: ${message}`,
        );
      if (!el.ownerDocument.defaultView) continue;
      const cs = el.ownerDocument.defaultView!.getComputedStyle(el);
      if (cs.display === "none") continue;
      if (cs.backgroundImage !== "none")
        warn(
          "Background images and gradients are not supported by this export.",
        );
      if (
        cs.boxShadow !== "none" ||
        cs.textShadow !== "none" ||
        cs.filter !== "none"
      )
        warn("Shadows and filters are not supported by this export.");
      if (
        el.tagName.toLowerCase() === "img" &&
        !el.getAttribute("src")?.startsWith("data:image/")
      )
        warn("Embed images before exporting.");
      if (
        !el.closest('[data-design-kind="svg"]') &&
        ![
          "div",
          "section",
          "p",
          "span",
          "h1",
          "h2",
          "h3",
          "img",
          "br",
        ].includes(el.tagName.toLowerCase())
      )
        warn("This selection contains unsupported HTML.");
      if (cs.mixBlendMode !== "normal")
        warn("Blend modes are not supported by this export.");
      if (cs.clipPath !== "none" || cs.maskImage !== "none")
        warn("CSS masks and clip paths are not supported by this export.");
      if (cs.textDecorationLine !== "none")
        warn("Text decorations are not supported by this export.");
      if (
        new Set([
          cs.borderTopWidth,
          cs.borderRightWidth,
          cs.borderBottomWidth,
          cs.borderLeftWidth,
        ]).size > 1
      )
        warn("Unequal border widths are not supported by this export.");
      if (
        [
          "dashed",
          "dotted",
          "double",
          "groove",
          "ridge",
          "inset",
          "outset",
        ].includes(cs.borderTopStyle)
      )
        warn("Patterned and relief borders are not supported by this export.");
      if (
        cs.direction === "rtl" ||
        /[\p{Script=Arabic}\p{Script=Devanagari}\p{Mark}]/u.test(
          [...el.childNodes]
            .filter((n) => n.nodeType === 3)
            .map((n) => n.textContent)
            .join(""),
        )
      )
        warn("Complex-script text is not supported by this export.");
      if (cs.writingMode !== "horizontal-tb")
        warn("Vertical text is not supported by this export.");
    }
  return [...warnings];
}
/** Snapshot browser layout as native SVG, avoiding WebKit foreignObject taint.
 * Text uses measured DOM ranges and an actual inline baseline marker. */
export function snapshotSvg(elements: HTMLElement[]): {
  svg: string;
  width: number;
  height: number;
} {
  if (!elements.length) throw Error("Select a frame or some layers first.");
  const warnings = exportWarnings(elements);
  if (warnings.length) throw Error(warnings.join(" "));
  const bounds = union(elements.map((el) => measure(el).world)),
    doc = elements[0].ownerDocument,
    win = doc.defaultView!;
  const all = [
    ...doc.querySelectorAll<HTMLElement>(
      "[data-design-frame], [data-design-id], [data-design-id] *",
    ),
  ];
  const originals = all.map((el) => ({
    el,
    style: el.style.transform,
    transform: win.getComputedStyle(el).transform,
  }));
  const transforms = new Map(originals.map((x) => [x.el, x.transform]));
  for (const { el } of originals) el.style.transform = "none";
  let clipId = 0;
  function render(el: HTMLElement): string {
    const cs = win.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return "";
    const w = el.offsetWidth,
      h = el.offsetHeight,
      x = el.offsetLeft,
      y = el.offsetTop,
      m = transforms.get(el) ?? cs.transform;
    const origin = cs.transformOrigin.split(" ").map(parseFloat);
    const transform = `translate(${x} ${y}) translate(${origin[0] || 0} ${origin[1] || 0}) ${m === "none" ? "" : m.replace(/,/g, " ")} translate(${-origin[0] || 0} ${-origin[1] || 0})`;
    const border = parseFloat(cs.borderTopWidth) || 0,
      ellipse = el.dataset.designKind === "ellipse";
    let out = `<g transform="${esc(transform)}" opacity="${cs.opacity}">`;
    if (cs.backgroundColor !== "rgba(0, 0, 0, 0)" || border) {
      const attrs = `fill="${esc(cs.backgroundColor)}" stroke="${border ? esc(cs.borderTopColor) : "none"}" stroke-width="${border}"`;
      out += ellipse
        ? `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${Math.max(0, w / 2 - border / 2)}" ry="${Math.max(0, h / 2 - border / 2)}" ${attrs}/>`
        : `<path d="${roundedRectPath(w, h, [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius], border / 2)}" ${attrs}/>`;
    }
    const clip =
      cs.overflow === "hidden" || el.tagName.toLowerCase() === "img"
        ? `design-clip-${clipId++}`
        : null;
    if (clip)
      out += `<defs><clipPath id="${clip}"><path d="${roundedRectPath(w, h, [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius])}"/></clipPath></defs><g clip-path="url(#${clip})">`;
    if (el.tagName.toLowerCase() === "img") {
      out += `<image width="${w}" height="${h}" href="${esc(el.getAttribute("src") ?? "")}" preserveAspectRatio="${cs.objectFit === "contain" ? "xMidYMid meet" : cs.objectFit === "cover" ? "xMidYMid slice" : "none"}"/>`;
    } else if (el.dataset.designKind === "svg") {
      const svg =
        el.tagName.toLowerCase() === "svg" ? el : el.querySelector("svg");
      if (svg) {
        const clone = svg.cloneNode(true) as Element;
        clone.setAttribute("x", "0");
        clone.setAttribute("y", "0");
        clone.setAttribute("width", String(w));
        clone.setAttribute("height", String(h));
        out += new XMLSerializer().serializeToString(clone);
      }
    } else {
      const textNodes = [...el.childNodes].filter(
        (n) => n.nodeType === 3 && n.textContent?.trim(),
      );
      for (const text of textNodes) {
        const content = text.textContent ?? "",
          base = el.getBoundingClientRect(),
          range = doc.createRange();
        const entries: { char: string; x: number; y: number; end: number }[] =
          [];
        let offset = 0;
        for (const char of Array.from(content)) {
          range.setStart(text, offset);
          offset += char.length;
          range.setEnd(text, offset);
          const r = range.getBoundingClientRect();
          if (r.width > 0 && char !== "\n")
            entries.push({
              char,
              x: r.left - base.left,
              y: r.top - base.top,
              end: offset,
            });
        }
        const lines = new Map<number, typeof entries>();
        for (const entry of entries) {
          const key = Math.round(entry.y * 100) / 100;
          const line = lines.get(key) ?? [];
          line.push(entry);
          lines.set(key, line);
        }
        // Baseline markers use the real inline formatting context. Work backwards
        // so splitText never invalidates offsets that have yet to be measured.
        const baselines = new Map<number, number>();
        for (const [top, line] of [...lines].reverse()) {
          const marker = doc.createElement("span");
          marker.style.cssText =
            "display:inline-block!important;width:0!important;height:0!important;padding:0!important;margin:0!important;border:0!important;vertical-align:baseline!important;";
          const r = doc.createRange();
          r.setStart(text, line[line.length - 1].end);
          r.collapse(true);
          r.insertNode(marker);
          baselines.set(top, marker.getBoundingClientRect().top - base.top);
          marker.remove();
          el.normalize();
        }
        for (const [top, line] of lines) {
          const baseline = baselines.get(top) ?? top + parseFloat(cs.fontSize);
          out += `<text xml:space="preserve" font-family="${esc(cs.fontFamily)}" font-size="${cs.fontSize}" font-weight="${cs.fontWeight}" font-style="${cs.fontStyle}" fill="${esc(cs.color)}" x="${line.map((c) => c.x).join(" ")}" y="${baseline}">${esc(line.map((c) => c.char).join(""))}</text>`;
        }
      }
      for (const child of [...el.children]) out += render(child as HTMLElement);
    }
    return out + (clip ? "</g>" : "") + "</g>";
  }
  try {
    // Root selection may be nested: wrap its ancestor transforms, without paint.
    let body = "";
    for (const el of elements) {
      let parents = "";
      let closings = "";
      for (
        let parent = el.parentElement;
        parent && parent !== doc.body;
        parent = parent.parentElement
      ) {
        const cs = win.getComputedStyle(parent),
          o = cs.transformOrigin.split(" ").map(parseFloat),
          m = transforms.get(parent) ?? "none";
        parents =
          `<g opacity="${cs.opacity}" transform="translate(${parent.offsetLeft} ${parent.offsetTop}) translate(${o[0]} ${o[1]}) ${m === "none" ? "" : m.replace(/,/g, " ")} translate(${-o[0]} ${-o[1]})">` +
          parents;
        closings += "</g>";
      }
      body += parents + render(el) + closings;
    }
    return {
      width: Math.ceil(bounds.w),
      height: Math.ceil(bounds.h),
      svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${Math.ceil(bounds.w)}" height="${Math.ceil(bounds.h)}" viewBox="${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}">${body}</svg>`,
    };
  } finally {
    for (const { el, style } of originals) el.style.transform = style;
  }
}
