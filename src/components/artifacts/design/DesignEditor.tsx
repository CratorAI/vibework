import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";
import {
  MousePointer2,
  Type,
  Square,
  Circle,
  Minus,
  Image,
  Frame,
  Undo2,
  Redo2,
  Layers,
  SlidersHorizontal,
  Download,
  MoreHorizontal,
  ChevronDown,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
  Group,
  Ungroup,
  X,
} from "@/lib/icons";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { openFilePicker } from "@/tauri/files";
import type { ArtifactViewProps } from "../types";
import { useDesignFile } from "./useDesignFile";
import {
  parseDesign,
  box,
  style,
  attribute,
  patchStyle,
  replace,
  escape,
  frameMarkup,
  presets,
  type Node,
} from "./model";
import { History } from "./geometry";
import { DesignCanvas, type FrameDocuments } from "./Canvas";
import {
  findElement,
  measure,
  union,
  readOnlyReason,
  locked,
  localDelta,
} from "./live";
import { IconButton, NumberField, ColorField } from "./controls";
import { exportLive, exportWarnings } from "./export";
import "./design.css";
const id = (n: Node) =>
  n.attrs["data-design-id"] ?? n.attrs["data-design-frame"];
const freshIds = (raw: string) =>
  raw.replace(
    /data-design-(id|frame)\s*=\s*(["'])(.*?)\2/gi,
    (_, kind) => `data-design-${kind}="${crypto.randomUUID()}"`,
  );
export default function DesignEditor(props: ArtifactViewProps) {
  const file = useDesignFile(props),
    design = useMemo(() => parseDesign(file.source), [file.source]);
  const [selection, select] = useState<string[]>([]),
    [active, setActive] = useState(""),
    [zoom, setZoom] = useState(0.5),
    [layers, setLayers] = useState(false),
    [inspector, setInspector] = useState(true),
    [exportScope, setExportScope] = useState<"frame" | "selection">("frame");
  const documents = useRef<FrameDocuments>(new Map()),
    history = useRef(new History("")),
    source = useRef(file.source);
  source.current = file.source;
  const [, setRevision] = useState(0);
  const measured = useCallback(() => setRevision((v) => v + 1), []);
  const frame = design.frames.find((n) => id(n) === active) ?? design.frames[0];
  const getElement = (key: string) => {
    for (const doc of documents.current.values()) {
      const el = findElement(doc, key);
      if (el) return el;
    }
    return undefined;
  };
  const selected = design.nodes.filter((n) => selection.includes(id(n)));
  const topSelected = selected.filter(
    (n) => !selected.some((p) => p !== n && p.start < n.start && p.end > n.end),
  );
  const first = selected[0],
    el = first && getElement(id(first)),
    layout = el ? measure(el) : null,
    css = layout?.computed;
  const isText = first?.attrs["data-design-kind"] === "text";
  const reason =
    el && !el.hasAttribute("data-design-frame") ? readOnlyReason(el) : null;
  const colors = [
    ...new Set(
      design.nodes.flatMap((n) =>
        Object.values(style(n)).flatMap(
          (v) => v.match(/#[a-f\d]{6}\b/gi) ?? [],
        ),
      ),
    ),
  ];
  function commit(next: string) {
    if (next === source.current) return;
    if (history.current.current !== source.current)
      history.current = new History(source.current);
    history.current.push(next);
    source.current = next;
    file.update(next, { history: false });
  }
  function undo(redo = false) {
    if (history.current.current !== source.current) {
      history.current = new History(source.current);
      return;
    }
    const next = redo ? history.current.redo() : history.current.undo();
    source.current = next;
    file.update(next, { history: false });
  }
  function change(patch: Record<string, string>) {
    let next = source.current;
    for (const n of topSelected) {
      const element = getElement(id(n));
      if (
        element &&
        !locked(element) &&
        (!readOnlyReason(element) || element.hasAttribute("data-design-frame"))
      )
        next = patchStyle(next, id(n), patch);
    }
    commit(next);
  }
  function attr(n: Node, key: string, value: string) {
    const current = parseDesign(source.current).nodes.find(
      (x) => id(x) === id(n),
    );
    if (current) commit(attribute(source.current, current, key, value));
  }
  function insert(raw: string) {
    const d = parseDesign(source.current),
      f = d.frames.find((n) => id(n) === id(frame)) ?? d.frames[0];
    if (f) commit(replace(source.current, f.closeStart, f.closeStart, raw));
  }
  function pasteMarkup(raw: string) {
    const html = freshIds(raw),
      incoming = parseDesign(html);
    if (incoming.frames.length) {
      const body = parseDesign(source.current).nodes.find(
        (n) => n.tag === "body",
      );
      if (body)
        commit(replace(source.current, body.closeStart, body.closeStart, html));
    } else insert(html);
  }
  function remove() {
    let next = source.current;
    for (const n of [...topSelected]
      .filter((n) => !getElement(id(n)) || !locked(getElement(id(n))!))
      .sort((a, b) => b.start - a.start))
      next = replace(next, n.start, n.end, "");
    commit(next);
    select([]);
  }
  function duplicate() {
    const raw = freshIds(
      topSelected.map((n) => source.current.slice(n.start, n.end)).join(""),
    );
    if (topSelected.some((n) => "data-design-frame" in n.attrs)) {
      const body = design.nodes.find((n) => n.tag === "body");
      if (body)
        commit(replace(source.current, body.closeStart, body.closeStart, raw));
    } else insert(raw);
  }
  function add(kind: string, value = "Text") {
    const key = crypto.randomUUID();
    insert(
      `<div data-design-id="${key}" data-design-kind="${kind}" data-name="${kind === "text" ? "Text" : kind === "rect" ? "Rectangle" : kind === "ellipse" ? "Ellipse" : "Line"}" style="position:absolute;left:64px;top:64px;width:240px;height:${kind === "line" ? 2 : kind === "text" ? 64 : 160}px;background:${kind === "text" ? "transparent" : "#c8c3d4"};border-radius:${kind === "ellipse" ? "50%" : "0"};font-family:Arial;font-size:32px;line-height:1.2;color:#202020;white-space:pre-wrap">${kind === "text" ? escape(value) : ""}</div>`,
    );
    select([key]);
  }
  function addFrame(preset = "Square") {
    const d = parseDesign(source.current),
      body = d.nodes.find((n) => n.tag === "body");
    if (!body) return;
    const key = crypto.randomUUID(),
      [w, h] = presets[preset];
    commit(
      replace(
        source.current,
        body.closeStart,
        body.closeStart,
        frameMarkup(key, w, h).replace(
          'data-name="Frame"',
          `data-name="${preset} ${d.frames.length + 1}"`,
        ),
      ),
    );
    setActive(key);
    select([key]);
  }
  function reorder(delta: number) {
    const n = first;
    if (!n) return;
    const siblings = n.parent?.children ?? [],
      other = siblings[siblings.indexOf(n) + delta];
    if (!other) return;
    const a = n.start < other.start ? n : other,
      b = a === n ? other : n;
    commit(
      source.current.slice(0, a.start) +
        source.current.slice(b.start, b.end) +
        source.current.slice(a.end, b.start) +
        source.current.slice(a.start, a.end) +
        source.current.slice(b.end),
    );
  }
  function group(ungroup = false) {
    if (!first) return;
    if (ungroup) {
      if (first.attrs["data-design-kind"] !== "group" || !el) return;
      if (readOnlyReason(el)) {
        toast("This group uses an unsupported transform.");
        return;
      }
      if (
        css?.overflow === "hidden" ||
        (css?.backgroundColor !== "rgba(0, 0, 0, 0)" &&
          css?.backgroundColor !== "transparent")
      ) {
        toast("Remove the group’s clipping or fill before ungrouping.");
        return;
      }
      const gb = measure(el).local,
        a = (gb.rotation * Math.PI) / 180;
      let raw = source.current.slice(first.openEnd, first.closeStart);
      for (const child of first.children) {
        const element = getElement(id(child));
        if (!element) continue;
        const cb = measure(element).local,
          cx = cb.x + cb.w / 2 - gb.w / 2,
          cy = cb.y + cb.h / 2 - gb.h / 2;
        const cs = measure(element).computed;
        raw = patchStyle(raw, id(child), {
          left: `${gb.x + gb.w / 2 + cx * Math.cos(a) - cy * Math.sin(a) - cb.w / 2}px`,
          top: `${gb.y + gb.h / 2 + cx * Math.sin(a) + cy * Math.cos(a) - cb.h / 2}px`,
          transform: `rotate(${gb.rotation + cb.rotation}deg)`,
          "font-family": cs.fontFamily,
          "font-size": cs.fontSize,
          "font-weight": cs.fontWeight,
          "line-height": cs.lineHeight,
          color: cs.color,
          opacity: String(Number(cs.opacity) * Number(css?.opacity ?? 1)),
        });
      }
      commit(replace(source.current, first.start, first.end, raw));
      select(first.children.map(id));
      return;
    }
    const nodes = topSelected.filter((n) => n.parent === first.parent);
    if (nodes.length < 2) {
      toast("Select two layers in the same group.");
      return;
    }
    const boxes = nodes.map((n) => measure(getElement(id(n))!).local),
      bounds = union(boxes),
      key = crypto.randomUUID();
    let raw = nodes.map((n) => source.current.slice(n.start, n.end)).join("");
    for (const n of nodes) {
      const b = measure(getElement(id(n))!).local;
      raw = patchStyle(raw, id(n), {
        left: `${b.x - bounds.x}px`,
        top: `${b.y - bounds.y}px`,
      });
    }
    let next = source.current;
    const ordered = [...nodes].sort((a, b) => b.start - a.start);
    for (const n of ordered) next = replace(next, n.start, n.end, "");
    const at = Math.min(...nodes.map((n) => n.start));
    commit(
      replace(
        next,
        at,
        at,
        `<div data-design-id="${key}" data-design-kind="group" data-name="Group" style="position:absolute;left:${bounds.x}px;top:${bounds.y}px;width:${bounds.w}px;height:${bounds.h}px">${raw}</div>`,
      ),
    );
    select([key]);
  }
  async function imageUrls(urls: { url: string; name: string }[]) {
    const parts: string[] = [],
      ids: string[] = [];
    for (const [i, { url, name }] of urls.entries()) {
      const image = new window.Image();
      image.src = url;
      await image.decode();
      let data = url,
        w = image.width,
        h = image.height;
      if (w * h > 24_000_000) {
        const c = document.createElement("canvas"),
          k = Math.min(1, 4096 / Math.max(w, h));
        c.width = w * k;
        c.height = h * k;
        c.getContext("2d")!.drawImage(image, 0, 0, c.width, c.height);
        data = c.toDataURL("image/png");
        toast("Large image reduced to 4096 pixels.");
      }
      const key = crypto.randomUUID(),
        ratio = Math.min(1, 480 / w);
      ids.push(key);
      parts.push(
        `<img data-design-id="${key}" data-design-kind="image" data-name="${escape(name)}" alt="${escape(name)}" src="${data}" style="position:absolute;left:${64 + i * 24}px;top:${64 + i * 24}px;width:${w * ratio}px;height:${h * ratio}px;object-fit:contain">`,
      );
    }
    insert(parts.join(""));
    select(ids);
  }
  async function pickImage() {
    const paths = await openFilePicker();
    if (!paths) return;
    try {
      const results = await Promise.allSettled(
        paths.map(async (path) => ({
          url: await invoke<string>("attachment_design_image", { path }),
          name: path.split("/").pop() ?? "Image",
        })),
      );
      const urls = results.flatMap((r) =>
        r.status === "fulfilled" ? [r.value] : [],
      );
      if (urls.length) await imageUrls(urls);
      for (const r of results)
        if (r.status === "rejected") toast.error(String(r.reason));
    } catch (e) {
      toast.error(String(e));
    }
  }
  async function imageFiles(files: FileList) {
    try {
      const urls = await Promise.all(
        [...files].map(async (f) => {
          if (
            !/^image\/(png|jpeg|webp|gif)$/.test(f.type) ||
            f.size > 40_000_000
          )
            throw Error("Choose a PNG, JPEG, WebP or GIF under 40 MB.");
          return {
            name: f.name,
            url: await new Promise<string>((resolve, reject) => {
              const r = new FileReader();
              r.onload = () => resolve(String(r.result));
              r.onerror = reject;
              r.readAsDataURL(f);
            }),
          };
        }),
      );
      await imageUrls(urls);
    } catch (e) {
      toast.error(String(e));
    }
  }
  function fit() {
    const v = document.querySelector(".design-viewport");
    if (frame && v)
      setZoom(
        Math.max(
          0.05,
          Math.min(
            (v.clientWidth - 64) / box(frame).w,
            (v.clientHeight - 80) / box(frame).h,
          ),
        ),
      );
  }
  const activeDoc = frame && documents.current.get(id(frame));
  const exportElements = activeDoc
    ? exportScope === "selection"
      ? topSelected
          .map((n) => getElement(id(n)))
          .filter((n): n is HTMLElement => !!n && n.ownerDocument === activeDoc)
      : [activeDoc.querySelector<HTMLElement>("[data-design-frame]")!]
    : [];
  const warnings = exportWarnings(exportElements);
  const pdfWarnings =
    exportScope === "frame"
      ? exportWarnings(
          [...documents.current.values()].flatMap((d) => [
            ...d.querySelectorAll<HTMLElement>("[data-design-frame]"),
          ]),
        )
      : warnings;
  async function exportAs(format: "png" | "svg" | "pdf", scale: 1 | 2 = 1) {
    try {
      const base = props.artifact.path.replace(/\.design\.html$/i, "");
      const path = `${base}-${exportScope === "selection" ? "selection" : Math.max(1, design.frames.indexOf(frame) + 1)}${scale === 2 ? "@2x" : ""}.${format}`;
      await exportLive({
        documents: new Map(
          design.frames.flatMap((f) => {
            const d = documents.current.get(id(f));
            return d ? [[id(f), d] as const] : [];
          }),
        ),
        elements: exportElements,
        format,
        scale,
        path,
        sessionId: props.artifact.sessionId,
      });
      toast.success("Export saved");
      props.onOpenArtifact?.(path);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }
  const tools = [
    { icon: MousePointer2, label: "Select · V", action: () => select([]) },
    { icon: Type, label: "Text · T", action: () => add("text") },
    { icon: Square, label: "Rectangle · R", action: () => add("rect") },
    { icon: Circle, label: "Ellipse · O", action: () => add("ellipse") },
    { icon: Minus, label: "Line · L", action: () => add("line") },
    { icon: Image, label: "Image · ⇧⌘K", action: () => void pickImage() },
  ];
  const frameMenu = (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>New frame</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {Object.entries(presets).map(([name, [w, h]]) => (
          <DropdownMenuItem key={name} onSelect={() => addFrame(name)}>
            {name}
            <span className="ml-auto text-xs text-muted-foreground">
              {w} × {h}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
  if (file.status !== "ready")
    return (
      <div className="p-4 text-meta" role={file.error ? "alert" : undefined}>
        {file.error
          ? `Couldn’t open this design: ${file.error}`
          : "Loading design…"}
      </div>
    );
  return (
    <div
      className="design-editor"
      data-shortcut-owner
      tabIndex={0}
      onCopy={(e) => {
        if ((e.target as HTMLElement).matches("input,textarea")) return;
        if (!topSelected.length) return;
        e.preventDefault();
        const raw = topSelected
          .map((n) => source.current.slice(n.start, n.end))
          .join("");
        e.clipboardData.setData("text/html", `<!--vibework-design-->${raw}`);
        e.clipboardData.setData(
          "text/plain",
          JSON.stringify({ vibeworkDesign: 1, html: raw }),
        );
      }}
      onPaste={(e) => {
        if ((e.target as HTMLElement).matches("input,textarea")) return;
        e.preventDefault();
        if (e.clipboardData.files.length) {
          void imageFiles(e.clipboardData.files);
          return;
        }
        const html = e.clipboardData.getData("text/html"),
          plain = e.clipboardData.getData("text/plain");
        if (html.startsWith("<!--vibework-design-->")) {
          pasteMarkup(html.slice(22));
          return;
        }
        try {
          const data = JSON.parse(plain);
          if (data.vibeworkDesign === 1 && typeof data.html === "string") {
            pasteMarkup(data.html);
            return;
          }
        } catch {
          /* Plain system text. */
        }
        if (plain) add("text", plain);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void imageFiles(e.dataTransfer.files);
      }}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).matches("input,textarea,select")) return;
        const mod = e.metaKey || e.ctrlKey;
        if (mod && e.key === "z") {
          e.preventDefault();
          undo(e.shiftKey);
        } else if (mod && e.key === "g") {
          e.preventDefault();
          group(e.shiftKey);
        } else if (mod && e.key === "d") {
          e.preventDefault();
          duplicate();
        } else if (e.key === "Escape") select([]);
        else if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          remove();
        } else if (e.key.startsWith("Arrow")) {
          e.preventDefault();
          let next = source.current;
          for (const n of topSelected) {
            const element = getElement(id(n));
            if (!element || locked(element) || readOnlyReason(element))
              continue;
            const l = measure(element),
              b = l.local,
              v = e.shiftKey ? 10 : 1;
            const delta = localDelta(
              e.key === "ArrowRight" ? v : e.key === "ArrowLeft" ? -v : 0,
              e.key === "ArrowDown" ? v : e.key === "ArrowUp" ? -v : 0,
              l.parentAngle,
            );
            next = patchStyle(next, id(n), {
              left: `${b.x + delta.x}px`,
              top: `${b.y + delta.y}px`,
            });
          }
          commit(next);
        } else if (!mod && ["t", "r", "o", "l"].includes(e.key))
          add(
            (
              { t: "text", r: "rect", o: "ellipse", l: "line" } as Record<
                string,
                string
              >
            )[e.key],
          );
        else if (mod && e.shiftKey && e.key.toLowerCase() === "k") {
          e.preventDefault();
          void pickImage();
        } else if (e.key === "v" && !mod) select([]);
        else if (e.key === "f" && !mod) addFrame();
      }}
    >
      <div className="design-toolbar">
        <IconButton
          icon={Layers}
          label="Layers"
          pressed={layers}
          onClick={() => setLayers((v) => !v)}
        />
        <span className="design-divider" />
        {tools.map((t, i) => (
          <IconButton
            key={t.label}
            {...t}
            label={t.label}
            onClick={t.action}
            className={i > 2 ? "design-secondary-tool" : ""}
          />
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="design-icon design-secondary-tool"
              aria-label="New frame · F"
            >
              <Frame className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {Object.keys(presets).map((name) => (
              <DropdownMenuItem key={name} onSelect={() => addFrame(name)}>
                {name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="design-divider design-secondary-tool" />
        <IconButton
          icon={Undo2}
          label="Undo · ⌘Z"
          onClick={() => undo()}
          className="design-secondary-tool"
        />
        <IconButton
          icon={Redo2}
          label="Redo · ⇧⌘Z"
          onClick={() => undo(true)}
          className="design-secondary-tool"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="design-icon" aria-label="More tools">
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {tools.map((t) => (
              <DropdownMenuItem key={t.label} onSelect={t.action}>
                <t.icon className="size-4" />
                {t.label}
              </DropdownMenuItem>
            ))}
            {frameMenu}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => undo()}>Undo</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => undo(true)}>
              Redo
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="design-zoom" aria-label="Zoom">
              {Math.round(zoom * 100)}%<ChevronDown className="size-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={fit}>Fit frame</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setZoom(1)}>
              100%
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setZoom((v) => Math.min(4, v * 1.25))}
            >
              Zoom in
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setZoom((v) => Math.max(0.05, v / 1.25))}
            >
              Zoom out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="design-icon" aria-label="Export">
              <Download className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Export</DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setExportScope("frame");
              }}
            >
              Current frame {exportScope === "frame" ? "✓" : ""}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!selection.length}
              onSelect={(e) => {
                e.preventDefault();
                setExportScope("selection");
              }}
            >
              Selection {exportScope === "selection" ? "✓" : ""}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              {warnings.length || pdfWarnings.length
                ? [...new Set([...warnings, ...pdfWarnings])].join(" ")
                : "Measured canvas text. SVG needs the same fonts on other devices. PDF contains raster pages."}
            </div>
            {(["PNG", "PNG 2×", "SVG", "PDF"] as const).map((label) => (
              <DropdownMenuItem
                key={label}
                disabled={
                  !exportElements.length ||
                  warnings.length > 0 ||
                  (label === "PDF" && pdfWarnings.length > 0)
                }
                onSelect={() =>
                  void exportAs(
                    label === "SVG" ? "svg" : label === "PDF" ? "pdf" : "png",
                    label === "PNG 2×" ? 2 : 1,
                  )
                }
              >
                {label}
                {label === "PDF" && exportScope === "frame"
                  ? " · all frames"
                  : ""}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <IconButton
          icon={SlidersHorizontal}
          label="Inspector"
          pressed={inspector}
          onClick={() => setInspector((v) => !v)}
        />
      </div>
      {(file.error || file.conflict) && (
        <div className="design-status" role="status">
          {file.error ?? "This file changed while you were editing."}
          {file.conflict && (
            <>
              <button onClick={file.reloadFromDisk}>Load disk version</button>
              <button onClick={file.keepMine}>Keep my changes</button>
            </>
          )}
        </div>
      )}
      <div className="design-body">
        {layers && (
          <aside className="design-layers">
            <header>
              Layers
              <IconButton
                icon={X}
                label="Close layers"
                onClick={() => setLayers(false)}
              />
            </header>
            {design.frames.map((f) => (
              <section key={id(f)}>
                <button
                  className="design-layer-frame"
                  onClick={() => {
                    setActive(id(f));
                    select([id(f)]);
                  }}
                >
                  <Frame className="size-3.5" />
                  {f.attrs["data-name"] || "Frame"}
                </button>
                {design.nodes
                  .filter(
                    (n) =>
                      n.attrs["data-design-id"] &&
                      n.start > f.start &&
                      n.end < f.end,
                  )
                  .map((n) => {
                    let depth = 0;
                    for (let p = n.parent; p && p !== f; p = p.parent) depth++;
                    return (
                      <div
                        key={id(n)}
                        className={`design-layer ${selection.includes(id(n)) ? "selected" : ""}`}
                        style={{ paddingLeft: 8 + depth * 12 }}
                      >
                        <button
                          onClick={(e) => {
                            setActive(id(f));
                            select(
                              e.shiftKey
                                ? [...new Set([...selection, id(n)])]
                                : [id(n)],
                            );
                          }}
                        >
                          {n.attrs["data-name"] || "Layer"}
                        </button>
                        <button
                          aria-label={`Toggle visibility ${id(n)}`}
                          onClick={() =>
                            attr(
                              n,
                              "data-hidden",
                              String(n.attrs["data-hidden"] !== "true"),
                            )
                          }
                        >
                          {n.attrs["data-hidden"] === "true" ? (
                            <EyeOff />
                          ) : (
                            <Eye />
                          )}
                        </button>
                        <button
                          aria-label={`Toggle lock ${id(n)}`}
                          onClick={() =>
                            attr(
                              n,
                              "data-locked",
                              String(n.attrs["data-locked"] !== "true"),
                            )
                          }
                        >
                          {n.attrs["data-locked"] === "true" ? (
                            <Lock />
                          ) : (
                            <Unlock />
                          )}
                        </button>
                      </div>
                    );
                  })}
              </section>
            ))}
          </aside>
        )}
        {design.frames.length ? (
          <DesignCanvas
            design={design}
            selection={selection}
            select={select}
            zoom={zoom}
            setZoom={setZoom}
            active={active}
            setActive={setActive}
            commit={commit}
            documents={documents.current}
            editing={file.setEditing}
            onMeasure={measured}
          />
        ) : (
          <div className="design-empty">
            <Frame className="size-6" />
            <p>This design has no frames yet.</p>
            <button onClick={() => addFrame()}>Add a frame</button>
          </div>
        )}
        {inspector && first && (
          <aside className="design-inspector">
            <header>
              {selected.length > 1
                ? `${selected.length} layers`
                : first.attrs["data-design-kind"] || "Frame"}
              <IconButton
                icon={X}
                label="Close inspector"
                onClick={() => setInspector(false)}
              />
            </header>
            <input
              className="design-name"
              aria-label="Layer name"
              key={id(first)}
              defaultValue={first.attrs["data-name"] || ""}
              onBlur={(e) => attr(first, "data-name", e.target.value)}
            />
            {reason ? (
              <p className="design-status">Read-only. {reason}</p>
            ) : (
              <>
                <section>
                  <span className="design-section-title">Position</span>
                  <div className="design-field-grid">
                    {(["x", "y", "w", "h", "rotation"] as const).map((key) => (
                      <NumberField
                        key={key}
                        label={
                          { x: "X", y: "Y", w: "W", h: "H", rotation: "Angle" }[
                            key
                          ]
                        }
                        value={layout?.local[key] ?? box(first)[key]}
                        min={key === "w" || key === "h" ? 1 : undefined}
                        onChange={(v) =>
                          change({
                            [{
                              x: "left",
                              y: "top",
                              w: "width",
                              h: "height",
                              rotation: "transform",
                            }[key]]:
                              key === "rotation" ? `rotate(${v}deg)` : `${v}px`,
                          })
                        }
                      />
                    ))}
                  </div>
                </section>
                <section>
                  <ColorField
                    label={isText ? "Text colour" : "Fill"}
                    value={
                      style(first)[isText ? "color" : "background"] ??
                      (isText ? "#202020" : "#ffffff")
                    }
                    colors={colors}
                    onChange={(v) =>
                      change({ [isText ? "color" : "background"]: v })
                    }
                  />
                  <div className="design-field-grid">
                    <NumberField
                      label="Opacity"
                      value={Number(css?.opacity ?? 1) * 100}
                      min={0}
                      max={100}
                      unit="%"
                      onChange={(v) => change({ opacity: String(v / 100) })}
                    />
                    <NumberField
                      label="Radius"
                      value={parseFloat(css?.borderRadius ?? "0") || 0}
                      min={0}
                      onChange={(v) => change({ "border-radius": `${v}px` })}
                    />
                  </div>
                  <ColorField
                    label="Stroke"
                    value={style(first)["border-color"] ?? "#202020"}
                    colors={colors}
                    onChange={(v) =>
                      change({
                        "border-color": v,
                        "border-style": "solid",
                        "border-width":
                          css?.borderWidth === "0px"
                            ? "1px"
                            : (css?.borderWidth ?? "1px"),
                      })
                    }
                  />
                  <NumberField
                    label="Width"
                    value={parseFloat(css?.borderWidth ?? "0") || 0}
                    min={0}
                    max={100}
                    onChange={(v) =>
                      change({
                        "border-width": `${v}px`,
                        "border-style": "solid",
                      })
                    }
                  />
                </section>
                {isText && (
                  <section>
                    <span className="design-section-title">Typography</span>
                    <select
                      aria-label="Font family"
                      value={css?.fontFamily ?? "Arial"}
                      onChange={(e) =>
                        change({ "font-family": e.target.value })
                      }
                    >
                      {[
                        ...new Set([
                          "Arial",
                          "Helvetica",
                          "Georgia",
                          "Verdana",
                          "Courier New",
                          css?.fontFamily ?? "Arial",
                          ...design.nodes
                            .map((n) => style(n)["font-family"])
                            .filter(Boolean),
                        ]),
                      ].map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                    <div className="design-field-grid">
                      <NumberField
                        label="Size"
                        value={parseFloat(css?.fontSize ?? "32")}
                        min={1}
                        max={1000}
                        onChange={(v) => change({ "font-size": `${v}px` })}
                      />
                      <NumberField
                        label="Weight"
                        value={parseFloat(css?.fontWeight ?? "400")}
                        min={100}
                        max={900}
                        onChange={(v) => change({ "font-weight": String(v) })}
                      />
                      <NumberField
                        label="Leading"
                        value={parseFloat(css?.lineHeight ?? "38") || 38}
                        min={1}
                        onChange={(v) => change({ "line-height": `${v}px` })}
                      />
                      <NumberField
                        label="Tracking"
                        value={parseFloat(css?.letterSpacing ?? "0") || 0}
                        onChange={(v) => change({ "letter-spacing": `${v}px` })}
                      />
                    </div>
                    <div className="flex gap-1">
                      {[
                        [AlignLeft, "left"],
                        [AlignCenter, "center"],
                        [AlignRight, "right"],
                      ].map(([Icon, align]) => (
                        <IconButton
                          key={String(align)}
                          icon={Icon as typeof AlignLeft}
                          label={`Align ${align}`}
                          pressed={css?.textAlign === align}
                          onClick={() =>
                            change({ "text-align": String(align) })
                          }
                        />
                      ))}
                    </div>
                  </section>
                )}
                {"data-design-frame" in first.attrs && (
                  <section>
                    <select
                      aria-label="Frame size preset"
                      defaultValue=""
                      onChange={(e) => {
                        const [w, h] = presets[e.target.value];
                        change({ width: `${w}px`, height: `${h}px` });
                      }}
                    >
                      <option value="" disabled>
                        Frame preset
                      </option>
                      {Object.keys(presets).map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </section>
                )}
              </>
            )}
            <section className="design-layer-actions">
              <IconButton
                icon={ArrowUp}
                label="Bring forward"
                onClick={() => reorder(1)}
              />
              <IconButton
                icon={ArrowDown}
                label="Send backward"
                onClick={() => reorder(-1)}
              />
              <IconButton
                icon={Group}
                label="Group · ⌘G"
                onClick={() => group()}
              />
              <IconButton
                icon={Ungroup}
                label="Ungroup · ⇧⌘G"
                onClick={() => group(true)}
              />
              <IconButton
                icon={Copy}
                label="Duplicate · ⌘D"
                onClick={duplicate}
              />
              <IconButton icon={Trash2} label="Delete" onClick={remove} />
            </section>
            <div className="design-save-state">
              {file.dirty ? "Saving…" : "Saved"}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
