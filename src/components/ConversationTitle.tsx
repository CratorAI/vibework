import React, { useEffect, useRef, useState } from "react";
import { Pencil } from "@/lib/icons";
import { useSidebar } from "@/components/ui/sidebar";
import { useAgentSessionsContext } from "@/contexts/AgentSessionsContext";
import { useWorkspacePrefs } from "@/components/workspace/store";
import { FolderBadge } from "./FolderBadge";
import { cn, pathBaseName } from "@/lib/utils";

/**
 * The current task's title, in the titlebar band above the conversation.
 *
 * The band itself stays a drag region: this strip lets pointer events through
 * and only the title button takes them. It starts clear of the traffic
 * lights and the sidebar toggle when the sidebar is collapsed, and clear of
 * the workspace toggle when the panel is closed (when it is open, the strip
 * ends at the panel, whose own tab strip carries the toggle).
 *
 * Clicking the title renames the task in place, through the same path as the
 * sidebar's Rename.
 */
export const ConversationTitle: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const { sessions, renameSession } = useAgentSessionsContext();
  const { open: sidebarOpen, isMobile } = useSidebar();
  const { open: panelOpen } = useWorkspacePrefs();
  const session = sessions.find((s) => s.sessionId === sessionId);
  const title = session ? session.conversationName || session.name || "Untitled task" : null;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Enter commits and blurs; the blur that follows must not commit again
  const doneRef = useRef(false);

  // Another conversation, or the task disappeared: leave edit mode
  useEffect(() => setEditing(false), [sessionId]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  if (!title) return null;

  const startEditing = () => {
    doneRef.current = false;
    setDraft(title);
    setEditing(true);
  };

  const finish = async (commit: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    const next = draft.trim();
    setEditing(false);
    requestAnimationFrame(() => buttonRef.current?.focus());
    if (commit && next && next !== title) {
      try {
        await renameSession(sessionId, next);
      } catch {
        // The context reports the failure; the old title stays
      }
    }
  };

  const projectFolder = session?.workingFolder;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 z-[55] flex h-(--titlebar-height) items-center gap-3",
        // A hidden sidebar leaves the window controls and the sidebar button
        // (which ends at 118px) over the page, so the title starts after them.
        isMobile ? "pl-32" : !sidebarOpen ? "pl-[132px]" : "pl-6",
        panelOpen ? "pr-6" : "pr-14",
      )}
      data-testid="conversation-title"
    >
      {projectFolder && (
        <>
          <div
            className="pointer-events-auto flex min-w-0 max-w-[40%] shrink-0 items-center gap-2 text-meta text-muted-foreground"
            title={projectFolder}
            aria-label={`Project: ${pathBaseName(projectFolder)}`}
            data-testid="task-project"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <FolderBadge path={projectFolder} size="sm" />
            <span className="truncate">{pathBaseName(projectFolder)}</span>
          </div>
        </>
      )}
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void finish(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void finish(true);
            } else if (e.key === "Escape") {
              e.preventDefault();
              void finish(false);
            }
          }}
          aria-label="Task name"
          spellCheck={false}
          className="pointer-events-auto h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm font-medium text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        />
      ) : (
        <button
          ref={buttonRef}
          type="button"
          onClick={startEditing}
          title={title}
          aria-label={`Rename task: ${title}`}
          className="group/title pointer-events-auto flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <span className="truncate">{title}</span>
          <Pencil
            aria-hidden
            className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/title:opacity-100 group-focus-visible/title:opacity-100"
          />
        </button>
      )}
    </div>
  );
};
