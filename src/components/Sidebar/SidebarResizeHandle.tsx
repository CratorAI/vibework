import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { SIDEBAR_DEFAULT_PX, SIDEBAR_MAX_PX, SIDEBAR_MIN_PX, sidebarWidthStore, useSidebarWidth } from "./sidebarWidth";

const KEY_STEP_PX = 16;

/**
 * The sidebar's right edge: drag to resize (220–400px, remembered),
 * double-click to reset, arrow keys when focused. Hidden on the collapsed rail.
 */
export const SidebarResizeHandle: React.FC = () => {
  const width = useSidebarWidth();
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = sidebarWidthStore.get();
    let lastX = startX;
    let frame = 0;
    setDragging(true);
    // The sidebar animates its width when it opens and closes; not while dragged
    document.documentElement.dataset.sidebarResizing = "true";
    const move = (ev: PointerEvent) => {
      lastX = ev.clientX;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => sidebarWidthStore.set(startWidth + lastX - startX, false));
    };
    const up = () => {
      cancelAnimationFrame(frame);
      sidebarWidthStore.set(startWidth + lastX - startX, true);
      setDragging(false);
      delete document.documentElement.dataset.sidebarResizing;
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };

  return (
    <>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuemin={SIDEBAR_MIN_PX}
        aria-valuemax={SIDEBAR_MAX_PX}
        aria-valuenow={width}
        tabIndex={0}
        title="Drag to resize. Double-click to reset."
        onPointerDown={onPointerDown}
        onDoubleClick={() => sidebarWidthStore.set(SIDEBAR_DEFAULT_PX, true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") sidebarWidthStore.set(width - KEY_STEP_PX, true);
          else if (e.key === "ArrowRight") sidebarWidthStore.set(width + KEY_STEP_PX, true);
          else return;
          e.preventDefault();
        }}
        className="group/handle absolute inset-y-0 -right-[3px] z-20 w-1.5 cursor-col-resize outline-none group-data-[collapsible=icon]:hidden"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <div
          className={cn(
            "mx-auto h-full w-px transition-colors group-hover/handle:bg-border-strong group-focus-visible/handle:bg-ring",
            dragging && "bg-ring",
          )}
        />
      </div>
      {/* Keep iframes and the terminal from swallowing the pointer mid-drag */}
      {dragging && <div className="fixed inset-0 z-[57] cursor-col-resize" />}
    </>
  );
};
