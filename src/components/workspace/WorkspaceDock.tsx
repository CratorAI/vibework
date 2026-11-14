import { useLocation } from "react-router-dom";
/**
 * Right-hand dock for the workspace panel inside a conversation: width,
 * resize handle, open/close transition, and the sidebar hand-off.
 *
 * - Width is a fraction of the content area (default 45%), clamped so the
 *   panel is at least PANEL_MIN_PX and the chat keeps CHAT_MIN_PX.
 * - When both do not fit, the left sidebar collapses while the panel is open
 *   and is restored when it closes (unless the user re-opened it meanwhile).
 * - The native browser view is allowed to show only while the layout is
 *   settled: not during the open/close transition, not while the window is
 *   being resized.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { openUrl } from "@/tauri/files";
import { cn } from "@/lib/utils";
import {
  CHAT_MIN_PX,
  DEFAULT_WIDTH_FRAC,
  PANEL_MIN_PX,
  useWorkspacePrefs,
  workspaceStore,
} from "./store";
import { WorkspacePanel } from "./WorkspacePanel";
import "./workspace.css";

/** Width of the window at which the app's sidebar starts out collapsed (ui/sidebar.tsx) */
const SIDEBAR_AUTO_COLLAPSE_BELOW = 1024;
/** Open/close: the panel travels on the drawer curve, closing a little faster */
const OPEN_MS = 280;
const CLOSE_MS = 200;
const TRANSITION_MS = Math.max(OPEN_MS, CLOSE_MS);
const KEY_STEP_PX = 24;

function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  // Parent DOM refs are attached after child layout effects on initial mount.
  // Observe after commit so navigation cannot leave contentWidth stuck at zero.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/** True while the window is being resized, and briefly after */
function useWindowResizing(): boolean {
  const [resizing, setResizing] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      setResizing(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setResizing(false), 180);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (timer) clearTimeout(timer);
    };
  }, []);
  return resizing;
}

export function WorkspaceDock({
  sessionId,
  agentBusy,
  containerRef,
}: {
  sessionId: string;
  agentBusy: boolean;
  /** The row holding the chat column and the dock: its width is the content area */
  containerRef: RefObject<HTMLElement | null>;
}) {
  const galleryOpen = useLocation().pathname === "/artifacts";
  const prefs = useWorkspacePrefs();
  const contentWidth = useElementWidth(containerRef);
  const { open: sidebarOpen, setOpen: setSidebarOpen, isMobile } = useSidebar();
  const windowResizing = useWindowResizing();
  const [dragging, setDragging] = useState(false);

  const maxWidth = Math.max(PANEL_MIN_PX, contentWidth - CHAT_MIN_PX);
  const panelWidth = Math.round(Math.min(maxWidth, Math.max(PANEL_MIN_PX, prefs.widthFrac * contentWidth)));

  // A task with nothing open starts with the panel closed: it opens when the
  // person asks for it or when the agent presents a file, never by default.
  useEffect(() => {
    if (workspaceStore.getConversation(sessionId).tabs.length === 0 && workspaceStore.getPrefs().open) {
      workspaceStore.setOpen(false);
    }
  }, [sessionId]);

  // ── Open/close transition ───────────────────────────────────────────────
  const [mounted, setMounted] = useState(prefs.open);
  const [settled, setSettled] = useState(true);
  const firstRender = useRef(true);
  // The open state as of the last commit (to spot the render that flips it)
  const lastOpen = useRef(prefs.open);
  useEffect(() => {
    lastOpen.current = prefs.open;
  }, [prefs.open]);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (prefs.open) setMounted(true);
    setSettled(false);
    const timer = setTimeout(() => {
      setSettled(true);
      if (!workspaceStore.getPrefs().open) setMounted(false);
    }, TRANSITION_MS + 40);
    return () => clearTimeout(timer);
  }, [prefs.open]);

  // ── Sidebar hand-off ────────────────────────────────────────────────────
  const collapsedBySelf = useRef(false);
  const userReopened = useRef(false);
  const prevSidebarOpen = useRef(sidebarOpen);
  const tooNarrow = contentWidth > 0 && contentWidth < PANEL_MIN_PX + CHAT_MIN_PX;

  // Mirrors `windowResizing` for effects: the sidebar provider opens the
  // sidebar by itself when the window grows past its breakpoint, which is not
  // the user asking for it.
  const windowResizingRef = useRef(windowResizing);
  windowResizingRef.current = windowResizing;

  useEffect(() => {
    const opened = sidebarOpen && !prevSidebarOpen.current;
    prevSidebarOpen.current = sidebarOpen;
    // The user opened the sidebar while the panel is open: leave it be
    if (opened && workspaceStore.getPrefs().open && !windowResizingRef.current) {
      collapsedBySelf.current = false;
      userReopened.current = true;
    }
  }, [sidebarOpen]);

  const wasOpen = useRef(prefs.open);
  useEffect(() => {
    // Each time the panel opens, the hand-off starts afresh
    if (prefs.open && !wasOpen.current) userReopened.current = false;
    wasOpen.current = prefs.open;
    if (isMobile) return;
    if (prefs.open && tooNarrow && sidebarOpen && !userReopened.current) {
      collapsedBySelf.current = true;
      setSidebarOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.open, tooNarrow, sidebarOpen]);

  useEffect(() => {
    if (prefs.open) return;
    userReopened.current = false;
    if (collapsedBySelf.current) {
      collapsedBySelf.current = false;
      if (window.innerWidth >= SIDEBAR_AUTO_COLLAPSE_BELOW) setSidebarOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.open]);

  // ── Resize handle ───────────────────────────────────────────────────────
  const setWidthPx = useCallback(
    (px: number, persist: boolean) => {
      if (contentWidth <= 0) return;
      const clamped = Math.min(maxWidth, Math.max(PANEL_MIN_PX, px));
      workspaceStore.setWidthFrac(clamped / contentWidth, persist);
    },
    [contentWidth, maxWidth],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const right = containerRef.current?.getBoundingClientRect().right ?? window.innerWidth;
    setDragging(true);
    let frame = 0;
    let lastX = e.clientX;
    const move = (ev: PointerEvent) => {
      lastX = ev.clientX;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setWidthPx(right - lastX, false));
    };
    const up = () => {
      cancelAnimationFrame(frame);
      setWidthPx(right - lastX, true);
      setDragging(false);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") setWidthPx(panelWidth + KEY_STEP_PX, true);
    else if (e.key === "ArrowRight") setWidthPx(panelWidth - KEY_STEP_PX, true);
    else return;
    e.preventDefault();
  };

  const allowNative = prefs.open && settled && !windowResizing;
  // Width animates only while the panel opens or closes (from the render
  // that flips it until it settles). Other width changes (the content area
  // measured on mount, the sidebar moving, the window resizing) follow at
  // once, so a conversation never opens with its panel still growing.
  const animateWidth = !dragging && !firstRender.current && (lastOpen.current !== prefs.open || !settled);

  return (
    <div
      className={cn(
        "relative h-full shrink-0 overflow-hidden",
        animateWidth && "transition-[width] ease-(--ease-drawer) motion-reduce:transition-none",
      )}
      style={{
        width: prefs.open ? panelWidth : 0,
        ...(animateWidth && { transitionDuration: `${prefs.open ? OPEN_MS : CLOSE_MS}ms` }),
      }}
      aria-hidden={!prefs.open}
      inert={!prefs.open ? true : undefined}
    >
      {prefs.open && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize workspace panel"
          aria-valuemin={PANEL_MIN_PX}
          aria-valuemax={Math.round(maxWidth)}
          aria-valuenow={panelWidth}
          tabIndex={0}
          title="Drag to resize. Double-click to reset."
          onPointerDown={onPointerDown}
          onDoubleClick={() => workspaceStore.setWidthFrac(DEFAULT_WIDTH_FRAC, true)}
          onKeyDown={onKeyDown}
          className="group/handle absolute inset-y-0 left-0 z-[56] w-1.5 cursor-col-resize outline-none"
        >
          <div
            className={cn(
              "h-full w-px transition-colors group-hover/handle:bg-border-strong group-focus-visible/handle:bg-ring",
              dragging && "bg-ring",
            )}
          />
        </div>
      )}
      {mounted && (
        <div className="absolute inset-y-0 right-0" style={{ width: panelWidth }}>
          <WorkspacePanel
            sessionId={sessionId}
            agentBusy={agentBusy}
            allowNative={!galleryOpen && allowNative}
            onOpenExternalUrl={(url) => openUrl(url).catch(() => {})}
          />
        </div>
      )}
      {/* Block iframes and the terminal from swallowing pointer events mid-drag */}
      {dragging && <div className="fixed inset-0 z-[57] cursor-col-resize" />}
    </div>
  );
}
