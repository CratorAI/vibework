/**
 * Slides editor for `.slides.md` decks: filmstrip, stage, in-place text
 * editing, notes/source drawer, themes, presenting and PowerPoint export.
 *
 * Deck content is untrusted: slides render inside two sandboxed artifact://
 * frames (stage and filmstrip) that share one inline page; this component
 * only exchanges data with them through postMessage.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Download,
  Loader2,
  MoreHorizontal,
  Play,
  Plus,
  StickyNote,
  Trash2,
  ArrowUp,
  ArrowDown,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { createInlineArtifact, releaseInlineArtifact } from "@/tauri/artifacts";
import type { ArtifactViewProps } from "../types";
import { parseDeck, type Deck } from "./core/parse";
import { sanitizeRuns } from "./core/inline";
import { deleteSlide, duplicateSlide, editField, insertSlide, moveSlide, replaceSlide, setMeta, setNotes, slideSource, SLIDE_TEMPLATES } from "./core/edit";
import { renderDeck } from "./core/render";
import { getTheme, THEMES } from "./core/themes";
import { buildFramePage } from "./frame/page";
import { useDeckFile } from "./useDeckFile";
import { exportPptx } from "./exportPptx";

const NARROW_PX = 640;

const NEW_SLIDE_LABELS: [keyof typeof SLIDE_TEMPLATES, string][] = [
  ["bullets", "Bullets"],
  ["section", "Section divider"],
  ["statement", "Statement"],
  ["stats", "Big numbers"],
  ["chart", "Chart"],
  ["table", "Table"],
  ["split", "Text and image"],
  ["closing", "Closing"],
];

/** Theme tokens of the app chrome, passed to the frames for the filmstrip and slide outline */
function chromeVars(el: HTMLElement): Record<string, string> {
  const cs = getComputedStyle(el);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  return {
    "--c-border": v("--border"),
    "--c-border-strong": v("--border-strong"),
    "--c-accent": v("--ring"),
    "--c-muted": v("--muted-foreground"),
    "--c-fg": v("--foreground"),
  };
}

function isNum(v: unknown, max = 1e6): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
}

export default function SlidesEditor(props: ArtifactViewProps) {
  const { artifact, agentBusy, onOpenArtifact } = props;
  const file = useDeckFile(props);
  const deck = useMemo<Deck>(() => parseDeck(file.source), [file.source]);
  const rendered = useMemo(() => renderDeck(deck), [deck]);
  const count = deck.slides.length;

  const [current, setCurrent] = useState(0);
  const [present, setPresent] = useState<false | "fullscreen" | "overlay">(false);
  const [drawer, setDrawer] = useState<null | "notes" | "source">(null);
  const [narrow, setNarrow] = useState(false);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const stageWrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLIFrameElement>(null);
  const stripRef = useRef<HTMLIFrameElement>(null);
  const ready = useRef({ stage: false, strip: false });
  const version = useRef(0);
  const versions = useRef(new Map<number, Deck>());
  const lastPosted = useRef({ stage: "", strip: "" });

  const idx = Math.min(current, Math.max(0, count - 1));
  const currentRef = useRef(idx);
  currentRef.current = idx;
  const deckRef = useRef(deck);
  deckRef.current = deck;

  // keep a short history of decks by version, to apply edits made against a slightly older render
  const deckVersion = useMemo(() => {
    version.current += 1;
    versions.current.set(version.current, deck);
    for (const k of versions.current.keys()) if (k < version.current - 20) versions.current.delete(k);
    return version.current;
  }, [deck]);

  // ---- inline page for the frames
  useEffect(() => {
    if (file.status !== "ready") return;
    let id: string | null = null;
    let cancelled = false;
    createInlineArtifact(buildFramePage(file.baseHref))
      .then((r) => {
        if (cancelled) {
          void releaseInlineArtifact(r.id);
          return;
        }
        id = r.id;
        setFrameUrl(r.url);
      })
      .catch((err) => console.error("[slides] could not create the slide frame", err));
    return () => {
      cancelled = true;
      if (id) void releaseInlineArtifact(id);
    };
  }, [file.status, file.baseHref]);

  // ---- width → filmstrip orientation
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < NARROW_PX));
    ro.observe(el);
    return () => ro.disconnect();
  }, [file.status]);

  // ---- posting to the frames
  const post = useCallback((which: "stage" | "strip", msg: unknown) => {
    const w = (which === "stage" ? stageRef : stripRef).current?.contentWindow;
    if (w) w.postMessage(msg, "*");
  }, []);

  const sendChrome = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const vars = chromeVars(el);
    // frames must use the app's color-scheme, or the webview paints them an opaque canvas
    const scheme = getComputedStyle(document.documentElement).colorScheme.includes("dark") ? "dark" : "light";
    post("stage", { type: "chrome", vars, scheme });
    post("strip", { type: "chrome", vars, scheme, orientation: narrow ? "horizontal" : "vertical" });
  }, [post, narrow]);

  const sendDeck = useCallback(
    (which: "stage" | "strip", force = false) => {
      if (!ready.current[which]) return;
      const payload = { themeId: rendered.themeId, extraCss: rendered.extraCss, slides: rendered.slides.map((s) => ({ html: s.html, title: s.title })) };
      const key = JSON.stringify(payload);
      if (!force && lastPosted.current[which] === key) {
        // content unchanged: only move the frame to the current version so its edits map to this deck
        post(which, { type: "version", version: deckVersion });
        return;
      }
      lastPosted.current[which] = key;
      post(which, { type: "deck", deck: payload, version: deckVersion, current: currentRef.current, editable: true });
    },
    [rendered, deckVersion, post],
  );

  useEffect(() => {
    sendDeck("stage");
    sendDeck("strip");
  }, [sendDeck]);

  useEffect(() => {
    post("stage", { type: "goto", index: idx });
    post("strip", { type: "goto", index: idx });
  }, [idx, post]);

  useEffect(() => {
    sendChrome();
  }, [sendChrome]);

  // app light/dark switches restyle the filmstrip chrome
  useEffect(() => {
    const mo = new MutationObserver(() => sendChrome());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => mo.disconnect();
  }, [sendChrome]);

  // ---- edits
  const apply = useCallback((edit: (d: Deck) => string) => file.update(edit(deckRef.current)), [file]);

  const go = useCallback((i: number) => setCurrent(Math.max(0, Math.min(deckRef.current.slides.length - 1, i))), []);

  const exitPresent = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    setPresent(false);
  }, []);

  const handleEdit = useCallback(
    (m: Record<string, unknown>) => {
      const runs = sanitizeRuns(m.runs);
      if (!runs || !isNum(m.slide) || !isNum(m.field, 1e5) || !isNum(m.version, 1e12)) return;
      const now = deckRef.current;
      const then = versions.current.get(m.version);
      if (!then) return;
      const slide = m.slide;
      const field = m.field;
      // the field must still hold the text the person started from
      const a = then.slides[slide]?.fields[field];
      const b = now.slides[slide]?.fields[field];
      if (!a || !b || then.source.slice(a.start, a.end) !== now.source.slice(b.start, b.end)) {
        toast("That edit could not be applied because the slide changed meanwhile.");
        return;
      }
      file.update(editField(now, slide, field, runs));
    },
    [file],
  );

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const stageWin = stageRef.current?.contentWindow;
      const stripWin = stripRef.current?.contentWindow;
      const from = e.source === stageWin && stageWin ? "stage" : e.source === stripWin && stripWin ? "strip" : null;
      if (!from) return;
      const m = e.data as Record<string, unknown> | null;
      if (!m || typeof m !== "object" || typeof m.type !== "string") return;
      switch (m.type) {
        case "ready":
          ready.current[from] = true;
          post(from, { type: "init", mode: from });
          sendChrome();
          lastPosted.current[from] = "";
          sendDeck(from, true);
          break;
        case "nav":
        case "select":
          if (isNum(m.index)) go(m.index);
          break;
        case "move":
          if (from === "strip" && isNum(m.from) && isNum(m.to)) {
            const to = m.to;
            apply((d) => moveSlide(d, m.from as number, to));
            setCurrent(to);
          }
          break;
        case "edit":
          if (from === "stage") handleEdit(m);
          break;
        case "editing":
          file.setEditing(m.on === true);
          break;
        case "escape":
          exitPresent();
          break;
        case "undo":
          file.undo();
          break;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [post, sendChrome, sendDeck, go, apply, handleEdit, file, exitPresent]);

  // a new frame URL means fresh documents
  useEffect(() => {
    ready.current = { stage: false, strip: false };
    lastPosted.current = { stage: "", strip: "" };
  }, [frameUrl]);

  // ---- presenting
  const startPresent = useCallback(async () => {
    const wrap = stageWrapRef.current;
    let mode: "fullscreen" | "overlay" = "overlay";
    if (wrap && typeof wrap.requestFullscreen === "function" && document.fullscreenEnabled !== false) {
      try {
        await wrap.requestFullscreen();
        mode = document.fullscreenElement === wrap ? "fullscreen" : "overlay";
      } catch {
        mode = "overlay";
      }
    }
    setPresent(mode);
  }, []);

  useEffect(() => {
    post("stage", { type: "present", on: !!present });
    if (present) {
      stageRef.current?.focus();
      post("stage", { type: "focus" });
    }
  }, [present, post]);

  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setPresent((p) => (p === "fullscreen" ? false : p));
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    if (!present) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        exitPresent();
      } else if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        go(currentRef.current + 1);
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        go(currentRef.current - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [present, exitPresent, go]);

  // keys while focus is on the editor chrome (not in a text field)
  const onRootKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("textarea,input,[contenteditable=true]")) return;
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
      if (file.undo()) e.preventDefault();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown") {
      e.preventDefault();
      go(idx + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") {
      e.preventDefault();
      go(idx - 1);
    }
  };

  // ---- slide actions
  const addSlide = (kind: keyof typeof SLIDE_TEMPLATES) => {
    apply((d) => insertSlide(d, d.slides.length ? idx : -1, SLIDE_TEMPLATES[kind]));
    setCurrent(count ? idx + 1 : 0);
  };
  const duplicate = () => {
    apply((d) => duplicateSlide(d, idx));
    setCurrent(idx + 1);
  };
  const remove = () => {
    if (!count) return;
    apply((d) => deleteSlide(d, idx));
    setCurrent(Math.max(0, Math.min(idx, count - 2)));
    toast(`Deleted slide ${idx + 1}`, { action: { label: "Undo", onClick: () => file.undo() } });
  };
  const move = (delta: number) => {
    const to = idx + delta;
    if (to < 0 || to >= count) return;
    apply((d) => moveSlide(d, idx, to));
    setCurrent(to);
  };

  const themeId = getTheme(deck.meta.theme).id;

  const doExport = async () => {
    setExporting(true);
    try {
      const out = await exportPptx(artifact, deckRef.current);
      const name = out.split(/[\\/]/).pop();
      toast(`Exported ${name}`, onOpenArtifact ? { action: { label: "Open", onClick: () => onOpenArtifact(out) } } : undefined);
    } catch (err) {
      console.error("[slides] export failed", err);
      toast.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
    }
  };

  // ---- drawer drafts (notes and slide source), applied as the person types
  const slide = deck.slides[idx];
  const [notesDraft, setNotesDraft] = useState<{ i: number; text: string } | null>(null);
  const [srcDraft, setSrcDraft] = useState<{ i: number; text: string } | null>(null);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const srcTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesValue = notesDraft && notesDraft.i === idx ? notesDraft.text : (slide?.notes ?? "");
  const srcValue = srcDraft && srcDraft.i === idx ? srcDraft.text : slideSource(deck, idx);

  const commitNotes = useCallback(
    (i: number, text: string) => {
      if (notesTimer.current) clearTimeout(notesTimer.current);
      notesTimer.current = null;
      apply((d) => setNotes(d, i, text));
    },
    [apply],
  );
  const commitSrc = useCallback(
    (i: number, text: string) => {
      if (srcTimer.current) clearTimeout(srcTimer.current);
      srcTimer.current = null;
      apply((d) => replaceSlide(d, i, text));
    },
    [apply],
  );
  useEffect(() => {
    // switching slides ends a draft
    setNotesDraft(null);
    setSrcDraft(null);
  }, [idx]);

  // ---- render
  if (file.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-meta text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Opening deck
      </div>
    );
  }
  if (file.status === "error") {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-ui text-muted-foreground">
        Could not open this deck. {file.error}
      </div>
    );
  }

  const presenting = !!present;
  const iconOnly = narrow;

  return (
    <div ref={rootRef} data-shortcut-owner="slides" className="flex h-full min-h-0 flex-col bg-background text-foreground" onKeyDown={onRootKey} tabIndex={-1}>
      {/* toolbar */}
      <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-border px-1.5 text-meta">
        <Button variant="ghost" size="icon-sm" aria-label="Previous slide" onClick={() => go(idx - 1)} disabled={idx <= 0}>
          <ChevronLeft />
        </Button>
        <span className="min-w-[3.25rem] text-center tabular-nums text-muted-foreground">{count ? `${idx + 1} / ${count}` : "0 / 0"}</span>
        <Button variant="ghost" size="icon-sm" aria-label="Next slide" onClick={() => go(idx + 1)} disabled={idx >= count - 1}>
          <ChevronRight />
        </Button>

        <div className="flex-1" />

        {agentBusy && !iconOnly && <span className="mr-1 text-muted-foreground">Agent is working</span>}
        {file.error && <span className="mr-1 truncate text-destructive" title={file.error}>Not saved</span>}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="text-meta">
              {iconOnly ? <span className="max-w-16 truncate">{getTheme(themeId).label}</span> : <>Theme: {getTheme(themeId).label}</>}
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel className="text-meta text-muted-foreground">Theme</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={themeId} onValueChange={(v) => apply((d) => setMeta(d, "theme", v))}>
              {THEMES.map((t) => (
                <DropdownMenuRadioItem key={t.id} value={t.id} className="items-start py-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-ui">{t.label}</span>
                    <span className="text-meta text-muted-foreground">{t.description}</span>
                  </div>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Slide actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Plus /> New slide after this
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {NEW_SLIDE_LABELS.map(([k, label]) => (
                  <DropdownMenuItem key={k} onSelect={() => addSlide(k)}>
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onSelect={duplicate} disabled={!count}>
              <Copy /> Duplicate slide
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => move(-1)} disabled={idx <= 0}>
              <ArrowUp /> Move up
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => move(1)} disabled={idx >= count - 1}>
              <ArrowDown /> Move down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={remove} disabled={!count}>
              <Trash2 /> Delete slide
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size={iconOnly ? "icon-sm" : "sm"}
          aria-label="Speaker notes"
          aria-pressed={drawer === "notes"}
          className={cn("text-meta", drawer === "notes" && "bg-muted")}
          onClick={() => setDrawer((d) => (d === "notes" ? null : "notes"))}
        >
          <StickyNote /> {!iconOnly && "Notes"}
        </Button>
        <Button
          variant="ghost"
          size={iconOnly ? "icon-sm" : "sm"}
          aria-label="Slide source"
          aria-pressed={drawer === "source"}
          className={cn("text-meta", drawer === "source" && "bg-muted")}
          onClick={() => setDrawer((d) => (d === "source" ? null : "source"))}
        >
          <Code2 /> {!iconOnly && "Source"}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Export" disabled={exporting}>
              {exporting ? <Loader2 className="animate-spin" /> : <Download />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onSelect={() => void doExport()} disabled={!count}>
              PowerPoint (.pptx)
            </DropdownMenuItem>
            <DropdownMenuItem disabled className="flex-col items-start gap-0.5">
              <span>PDF</span>
              <span className="text-meta">Ask the agent to export this deck to PDF</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="default" size="sm" aria-label="Present" title="Present" className="ml-1 text-meta" onClick={() => void startPresent()} disabled={!count}>
          <Play /> {!iconOnly && "Present"}
        </Button>
      </div>

      {/* conflict bar */}
      {file.conflict && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-warning-muted px-3 py-1.5 text-meta text-foreground">
          <span className="flex-1">This deck changed on disk while you had unsaved edits.</span>
          <Button variant="outline" size="sm" className="h-7 text-meta" onClick={file.reloadFromDisk}>
            Reload from disk
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-meta" onClick={file.keepMine}>
            Keep mine
          </Button>
        </div>
      )}

      {/* filmstrip + stage */}
      <div className={cn("flex min-h-0 flex-1", narrow ? "flex-col-reverse" : "flex-row")}>
        <div className={cn("shrink-0 bg-background", narrow ? "h-[104px] border-t border-border" : "w-[184px] border-r border-border")}>
          {frameUrl && (
            <iframe
              ref={stripRef}
              key={`strip-${frameUrl}`}
              title="Slides"
              src={frameUrl}
              sandbox="allow-scripts allow-forms allow-popups allow-modals"
              referrerPolicy="no-referrer"
              className="block h-full w-full border-0 bg-transparent"
            />
          )}
        </div>
        <div
          ref={stageWrapRef}
          className={cn(
            presenting ? "bg-black" : "relative min-h-0 min-w-0 flex-1 bg-muted/60 p-4 dark:bg-muted/30",
            present === "overlay" && "fixed inset-0 z-[1000]",
            present === "fullscreen" && "h-full w-full",
          )}
        >
          {frameUrl ? (
            <iframe
              ref={stageRef}
              key={`stage-${frameUrl}`}
              title="Slide"
              src={frameUrl}
              sandbox="allow-scripts allow-forms allow-popups allow-modals"
              referrerPolicy="no-referrer"
              className="block h-full w-full border-0 bg-transparent"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-meta text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> Rendering
            </div>
          )}
          {!count && frameUrl && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-ui text-muted-foreground">
              This deck has no slides yet.
              <Button variant="outline" size="sm" onClick={() => addSlide("bullets")}>
                <Plus /> Add a slide
              </Button>
            </div>
          )}
          {present === "overlay" && (
            <Button variant="ghost" size="icon-sm" aria-label="Stop presenting" className="absolute top-3 right-3 text-white/70 hover:bg-white/10 hover:text-white" onClick={exitPresent}>
              <X />
            </Button>
          )}
        </div>
      </div>

      {/* notes / source drawer */}
      {drawer && slide && (
        <div className={cn("flex shrink-0 flex-col border-t border-border", narrow ? "h-[168px]" : "h-[200px]")}>
          <div className="flex h-8 shrink-0 items-center gap-2 px-3 text-meta text-muted-foreground">
            <span className="text-foreground">{drawer === "notes" ? "Speaker notes" : "Slide source"}</span>
            <span>Slide {idx + 1}</span>
            {drawer === "source" && <span className="truncate">Markdown for this slide only; layouts and charts are set here</span>}
            <div className="flex-1" />
            <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={() => setDrawer(null)}>
              <X />
            </Button>
          </div>
          {drawer === "notes" ? (
            <textarea
              key={`notes-${idx}`}
              className="min-h-0 flex-1 resize-none bg-transparent px-3 pb-3 text-ui leading-relaxed outline-none placeholder:text-muted-foreground"
              placeholder="What to say on this slide. Notes go to the presenter view in PowerPoint."
              value={notesValue}
              onChange={(e) => {
                const text = e.target.value;
                const i = idx;
                setNotesDraft({ i, text });
                if (notesTimer.current) clearTimeout(notesTimer.current);
                notesTimer.current = setTimeout(() => commitNotes(i, text), 500);
              }}
              onBlur={() => notesDraft && notesDraft.i === idx && commitNotes(idx, notesDraft.text)}
            />
          ) : (
            <>
              <textarea
                key={`src-${idx}`}
                spellCheck={false}
                className="min-h-0 flex-1 resize-none bg-transparent px-3 pb-2 font-mono text-meta leading-relaxed outline-none"
                value={srcValue}
                onChange={(e) => {
                  const text = e.target.value;
                  const i = idx;
                  setSrcDraft({ i, text });
                  if (srcTimer.current) clearTimeout(srcTimer.current);
                  srcTimer.current = setTimeout(() => commitSrc(i, text), 600);
                }}
                onBlur={() => srcDraft && srcDraft.i === idx && commitSrc(idx, srcDraft.text)}
              />
              {slide.warnings.length > 0 && (
                <div className="shrink-0 border-t border-border px-3 py-1.5 text-meta text-muted-foreground">{slide.warnings.join(" ")}</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
