/**
 * The panel's one row of tabs. Every open thing is a tab at the same level:
 * files (type chip and name), terminals, the Browser, Files, Agent commands.
 *
 * - The active tab has the fill; the type chip is the only colour.
 * - Tabs close with their ×, a middle click or ⌘W; a file with unsaved edits
 *   shows a dot in the ×'s place and asks before closing.
 * - Drag a tab sideways to reorder; the row scrolls sideways when full
 *   (wheel or trackpad) and keeps the active tab in view.
 * - ←/→ move between tabs, Home/End to the ends.
 */

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { File as FileIcon, Folder, Globe, SquareTerminal, Terminal as PromptIcon, X } from "@/lib/icons";
import { ArtifactTypeChip } from "@/components/artifacts/typeColor";
import { artifactTypeById, resolveArtifactType } from "@/components/artifacts/registry";
import { cn } from "@/lib/utils";
import { SURFACE_LABEL, terminalLabel, type PanelTab } from "./tabs";
import { workspaceStore } from "./store";
import { closePanelTab } from "./actions";

/** Pixels a press must travel before it counts as a drag */
const DRAG_SLOP = 4;
/** Width of the fade at an edge with more tabs past it */
const FADE = 24;

function tabLabel(tab: PanelTab, browserTitle: string | null): string {
  if (tab.kind === "file") return tab.name;
  if (tab.kind === "terminal") return terminalLabel(tab);
  if (tab.kind === "browser") return browserTitle || SURFACE_LABEL.browser;
  return SURFACE_LABEL[tab.kind];
}

function tabTooltip(tab: PanelTab, label: string, index: number): string {
  const detail = tab.kind === "file" ? tab.path : tab.kind === "terminal" && tab.title ? `${label} · ${tab.title}` : label;
  return index < 9 ? `${detail}  ⌘${index + 1}` : detail;
}

function TabIcon({ tab }: { tab: PanelTab }) {
  if (tab.kind === "file") {
    return <ArtifactTypeChip typeId={tab.artifactType} fileName={tab.name} icon={(tab.artifactType ? artifactTypeById(tab.artifactType) : resolveArtifactType(tab.name))?.icon ?? FileIcon} size="sm" />;
  }
  const Icon = tab.kind === "terminal" ? SquareTerminal : tab.kind === "browser" ? Globe : tab.kind === "files" ? Folder : PromptIcon;
  return <Icon className="size-3.5 shrink-0" />;
}

interface Drag {
  id: string;
  pointerId: number;
  startX: number;
  /** Where in the tab it was grabbed */
  grab: number;
  /** Latest pointer x, in the row's scrolled coordinates */
  x: number;
  moved: boolean;
}

export function TabStrip({
  sessionId,
  tabs,
  active,
  browserTitle,
}: {
  sessionId: string;
  tabs: PanelTab[];
  active: string | null;
  browserTitle: string | null;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const suppressClick = useRef(false);

  // Tabs that open while the strip shows scale in; the ones already there stay still.
  const seen = useRef<Set<string> | null>(null);
  const arrived = useRef(new Set<string>());
  if (seen.current === null) seen.current = new Set(tabs.map((t) => t.id));
  for (const t of tabs) {
    if (!seen.current.has(t.id)) {
      seen.current.add(t.id);
      arrived.current.add(t.id);
    }
  }

  // Which ends have more tabs past them: those edges fade out
  const [edges, setEdges] = useState({ start: false, end: false });
  const measureEdges = () => {
    const el = scroller.current;
    if (!el) return;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((e) => (e.start === start && e.end === end ? e : { start, end }));
  };

  /** Scroll the active tab fully into view, clear of the faded edges */
  const revealActive = () => {
    const strip = scroller.current;
    const tab = strip?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!strip || !tab || drag.current?.moved) return;
    const bounds = strip.getBoundingClientRect();
    const rect = tab.getBoundingClientRect();
    if (rect.left < bounds.left + FADE) strip.scrollLeft -= bounds.left + FADE - rect.left;
    else if (rect.right > bounds.right - FADE) strip.scrollLeft += rect.right - (bounds.right - FADE);
    measureEdges();
  };

  // The active tab stays in view when it changes, a tab opens or closes, or the panel resizes
  useEffect(revealActive, [active, tabs.length]);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(revealActive);
    ro.observe(el);
    if (row.current) ro.observe(row.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While dragging, keep the dragged tab under the pointer after each reorder
  const order = tabs.map((t) => t.id).join("\n");
  useLayoutEffect(() => {
    const d = drag.current;
    if (d?.moved) place(d);
  }, [order]);

  const elementOf = (id: string) =>
    row.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(id)}"]`) ?? null;

  /** Pointer x in the row's own (scrolled) coordinates */
  const rowX = (clientX: number) => {
    const el = row.current;
    return el ? clientX - el.getBoundingClientRect().left : clientX;
  };

  function place(d: Drag) {
    const el = elementOf(d.id);
    if (el) el.style.transform = `translateX(${d.x - d.grab - el.offsetLeft}px)`;
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>, tab: PanelTab) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("[data-tab-close]")) return;
    const el = e.currentTarget;
    drag.current = { id: tab.id, pointerId: e.pointerId, startX: e.clientX, grab: rowX(e.clientX) - el.offsetLeft, x: rowX(e.clientX), moved: false };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.moved) {
      if (Math.abs(e.clientX - d.startX) < DRAG_SLOP) return;
      d.moved = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* the pointer is already gone: the drag ends on its next event */
      }
      setDragging(d.id);
    }
    d.x = rowX(e.clientX);
    // Where the dragged tab's middle now falls among the others' middles
    const centre = d.x - d.grab + (elementOf(d.id)?.offsetWidth ?? 0) / 2;
    const others = tabs.filter((t) => t.id !== d.id);
    let to = 0;
    for (const t of others) {
      const el = elementOf(t.id);
      if (el && el.offsetLeft + el.offsetWidth / 2 < centre) to++;
    }
    const from = tabs.findIndex((t) => t.id === d.id);
    if (to !== from) workspaceStore.moveTab(sessionId, d.id, to);
    else place(d);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    suppressClick.current = true;
    const el = elementOf(d.id);
    if (el) el.style.transform = "";
    setDragging(null);
  };

  const focusTab = (index: number) => {
    const tab = tabs[(index + tabs.length) % tabs.length];
    if (!tab) return;
    workspaceStore.setActiveTab(sessionId, tab.id);
    elementOf(tab.id)?.focus();
  };

  return (
    <div
      ref={scroller}
      className="min-w-0 overflow-x-auto overflow-y-hidden scrollbar-hide"
      onScroll={measureEdges}
      style={
        edges.start || edges.end
          ? {
              maskImage: `linear-gradient(to right, ${edges.start ? `transparent, black ${FADE}px` : "black"}, ${edges.end ? `black calc(100% - ${FADE}px), transparent` : "black"})`,
            }
          : undefined
      }
      // A mouse wheel scrolls the row sideways
      onWheel={(e) => {
        const el = scroller.current;
        if (el && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY;
      }}
    >
      <div ref={row} role="tablist" aria-label="Open in the panel" className="relative flex h-8 w-max items-center gap-0.5" data-testid="panel-tabs">
        {tabs.map((tab, index) => {
          const label = tabLabel(tab, browserTitle);
          const selected = tab.id === active;
          const dirty = tab.kind === "file" && tab.dirty;
          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              role="tab"
              aria-selected={selected}
              tabIndex={selected || (!active && index === 0) ? 0 : -1}
              title={tabTooltip(tab, label, index)}
              onPointerDown={(e) => onPointerDown(e, tab)}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onClick={() => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                workspaceStore.setActiveTab(sessionId, tab.id);
              }}
              // A middle click closes (and never starts the page's auto-scroll)
              onMouseDown={(e) => e.button === 1 && e.preventDefault()}
              onAuxClick={(e) => {
                if (e.button === 1) closePanelTab(sessionId, tab.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  workspaceStore.setActiveTab(sessionId, tab.id);
                } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  focusTab(index + (e.key === "ArrowRight" ? 1 : -1));
                } else if (e.key === "Home" || e.key === "End") {
                  e.preventDefault();
                  focusTab(e.key === "Home" ? 0 : tabs.length - 1);
                }
              }}
              className={cn(
                "group/tab relative flex h-8 max-w-[200px] shrink-0 cursor-default items-center gap-1.5 rounded-md pr-1 pl-2 text-meta outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50",
                dragging === tab.id ? "z-10" : "transition-[color,background-color]",
                selected ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                arrived.current.has(tab.id) && dragging !== tab.id && "motion-scale-in",
              )}
              onAnimationEnd={() => arrived.current.delete(tab.id)}
            >
              <TabIcon tab={tab} />
              <span className="min-w-0 truncate">{label}</span>
              <button
                type="button"
                data-tab-close
                tabIndex={-1}
                aria-label={dirty ? `Close ${label} (unsaved changes)` : `Close ${label}`}
                title={dirty ? "Unsaved changes" : "Close"}
                onClick={(e) => {
                  e.stopPropagation();
                  closePanelTab(sessionId, tab.id);
                }}
                className={cn(
                  "relative grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition-opacity hover:bg-background hover:text-foreground",
                  // Shown on the active tab and on hover; a dirty file always shows its dot
                  !selected && !dirty && "opacity-0 group-hover/tab:opacity-100 group-focus-visible/tab:opacity-100",
                )}
              >
                {dirty ? (
                  <>
                    <span className="size-2 rounded-full bg-foreground/70 group-hover/tab:hidden" />
                    <X className="hidden size-3 group-hover/tab:block" />
                  </>
                ) : (
                  <X className="size-3" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
