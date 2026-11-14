import type { CSSProperties } from "react";
import { withChord } from "@/lib/shortcuts";
import { PanelRight } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useWorkspacePrefs, workspaceStore } from "./store";

/**
 * Shows/hides the workspace panel. Sits in the titlebar band at the window's
 * top-right (mirroring the sidebar toggle at the top-left), above the drag
 * region; when the panel is open it is the panel's close button.
 */
export function WorkspaceToggle({ sessionId }: { sessionId: string }) {
  const { open } = useWorkspacePrefs();
  return (
    <button
      type="button"
      onClick={() => workspaceStore.setOpen(!open, sessionId)}
      aria-pressed={open}
      aria-label={open ? "Close workspace panel" : "Open workspace panel"}
      title={withChord(open ? "Close workspace panel" : "Open workspace panel", "panel")}
      aria-keyshortcuts="Meta+Backslash"
      className={cn(
        "fixed top-[16px] right-[12px] z-[60] flex size-7 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        open ? "text-foreground hover:bg-muted" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
    >
      <PanelRight className="size-4" />
    </button>
  );
}
