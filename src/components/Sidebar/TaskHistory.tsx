import { formatCost } from "@/utils/telemetry";
import { SETTLED_OPEN_KEY, sidebarLists } from "./order";
import React, { useState, useMemo, useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { useNavigate, useLocation } from "react-router-dom";
import { MoreHorizontal, Pencil, Trash2, Loader2, CircleCheck, ChevronRight } from "@/lib/icons";
import type { SessionInfo } from "@/types/agent";
import { useAgentSessionsContext } from "../../contexts/AgentSessionsContext";
import { restoreSession } from "@/tauri/agent";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAutohideScrollbar } from "@/hooks/useAutohideScrollbar";
import { cn, pathBaseName } from "@/lib/utils";
import { EASE_OUT } from "@/lib/motion";
import { TaskRowMotion } from "./TaskRowMotion";
import { FolderBadge } from "../FolderBadge";

/** Settled rows shown per "Show more" step */
const SETTLED_PAGE_SIZE = 25;

type SessionStatus = "loading" | "waiting" | "done" | null;

/** "now", "16m", "3h", "2d", else "Nov 3": the time since the task's last activity. */
function relativeTime(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  const minutes = Math.floor(Math.max(0, now - at) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Re-render once a minute so relative times stay current. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** The sidebar's task list: Recents (needs-you first), then the Settled shelf. Search lives in the search window. */
export const TaskHistory: React.FC = () => {
  const {
    sessions,
    isLoading,
    activeSessionId,
    activeSessions,
    openSession,
    deleteSession,
    renameSession,
    setSessionSettled,
    refreshSessions,
  } = useAgentSessionsContext();
  const now = useMinuteClock();
  const onListScroll = useAutohideScrollbar();

  // Helper to get status indicator for a session
  // Spinner shows when loading (live status), done/waiting show as notifications
  // that clear when user visits the session
  const getSessionStatus = (sessionId: string): SessionStatus => {
    const sessionState = activeSessions.get(sessionId);
    if (!sessionState) return null; // Not currently active/open

    // Waiting (permission/question) takes priority - it's the current live state
    // Show amber if there's a pending request AND (user hasn't seen it OR it's still pending)
    const hasWaiting = sessionState.permissionRequest || sessionState.questionRequest;
    if (hasWaiting) {
      // Always show waiting indicator when there's a pending request
      // (it's the live state, and notification will clear when user visits)
      return 'waiting';
    }

    // Spinner shows when loading (but not waiting for permission/question)
    if (sessionState.isLoading) return 'loading';

    // Done only shows if user hasn't seen it yet (notification behavior)
    if (sessionState.hasUnseenNotification && sessionState.turnCompleted) return 'done';

    return null;
  };

  const navigate = useNavigate();
  const location = useLocation();

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);
  const [openMenuSessionId, setOpenMenuSessionId] = useState<string | null>(
    null,
  );
  // Tasks blocked on the user (a permission prompt or a question)
  const waitingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, state] of activeSessions.entries()) {
      if (state.permissionRequest || state.questionRequest) ids.add(id);
    }
    return ids;
  }, [activeSessions]);

  // Active conversations stay in the main list; settled ones move to a shelf below it,
  // most recently settled first. Tasks that need
  // the user go to the top of Recents while they wait, even settled ones, so
  // none is hidden in the closed shelf.
  const { activeList, settledList } = useMemo(() => sidebarLists(sessions, waitingIds), [sessions, waitingIds]);

  // Motion: rows re-measure their places only when the order or a row's
  // height changes (see TaskRowMotion), not on every stream flush
  const layoutKey = useMemo(
    () => activeList.map((s) => (waitingIds.has(s.sessionId) ? `${s.sessionId}!` : s.sessionId)).join() + "|" + settledList.map((s) => s.sessionId).join(),
    [activeList, settledList, waitingIds],
  );
  // When each row's live state last changed, so a new mark arrives once (and
  // not again each time the hover actions give way to it)
  const statusSince = useRef(new Map<string, { status: SessionStatus; at: number }>());
  const statusJustChanged = (sessionId: string, status: SessionStatus): boolean => {
    const seen = statusSince.current.get(sessionId);
    const now = performance.now();
    if (!seen) {
      statusSince.current.set(sessionId, { status, at: -Infinity });
      return false;
    }
    if (seen.status !== status) statusSince.current.set(sessionId, { status, at: now });
    return now - (statusSince.current.get(sessionId)?.at ?? -Infinity) < 400;
  };
  // The list fades in over its skeleton, the first time it loads
  const showedSkeleton = useRef(false);
  // Reduced motion: the shelf fades instead of opening
  const reduceMotion = useReducedMotion();

  const [settledOpen, setSettledOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SETTLED_OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [settledShown, setSettledShown] = useState(SETTLED_PAGE_SIZE);
  const showSettledRows = settledOpen;

  const toggleSettledOpen = () => {
    setSettledOpen((open) => {
      try {
        localStorage.setItem(SETTLED_OPEN_KEY, open ? "0" : "1");
      } catch {
        // Not remembered across restarts
      }
      return !open;
    });
  };

  const handleSetSettled = async (session: SessionInfo, settled: boolean, e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    const name = session.conversationName || session.name || "Untitled task";
    try {
      await setSessionSettled(session.sessionId, settled);
      toast(settled ? `Settled “${name}”` : `Moved “${name}” back to Recents`, {
        action: {
          label: "Undo",
          onClick: () => {
            setSessionSettled(session.sessionId, !settled).catch(() =>
              toast.error("Couldn’t undo that. Try again from the task’s menu."),
            );
          },
        },
      });
    } catch {
      toast.error(settled ? "Couldn’t settle this task. Try again." : "Couldn’t move this task back. Try again.");
    }
  };

  const handleLoadSession = async (sessionId: string) => {
    try {
      await openSession(sessionId);
      // Navigate to home if not already there
      if (location.pathname !== '/') {
        navigate('/');
      }
    } catch (error) {
      console.error("Error loading session:", error);
    }
  };

  const handleStartRename = (
    sessionId: string,
    currentName: string,
    e: React.SyntheticEvent,
  ) => {
    e.stopPropagation();
    setEditingSessionId(sessionId);
    setEditName(currentName);
  };

  const handleRename = async (sessionId: string) => {
    if (editName.trim()) {
      try {
        await renameSession(sessionId, editName.trim());
      } catch (error) {
        console.error("Error renaming session:", error);
      }
    }
    setEditingSessionId(null);
    setEditName("");
  };

  const handleCancelRename = () => {
    setEditingSessionId(null);
    setEditName("");
  };

  // Deleting moves the task to a 7-day trash, so it happens at once and offers Undo
  const handleDelete = async (session: SessionInfo, e: React.SyntheticEvent) => {
    e.stopPropagation();
    const name = session.conversationName || session.name || "Untitled task";
    try {
      await deleteSession(session.sessionId);
      toast(`Deleted “${name}”`, {
        action: {
          label: "Undo",
          onClick: () => {
            restoreSession(session.sessionId)
              .then(() => refreshSessions())
              .catch(() => toast.error("Couldn’t restore that task. Try again."));
          },
        },
      });
    } catch (error) {
      console.error("Error deleting session:", error);
      toast.error("Couldn’t delete this task. Try again.");
    }
  };

  if (isLoading && sessions.length === 0) {
    showedSkeleton.current = true;
    // Layout-matching placeholder rows while the list loads
    return (
      <div className="px-3" aria-busy="true" aria-label="Loading tasks">
        {[72, 58, 80, 64].map((w) => (
          <div key={w} className="mb-[2px] flex h-8 items-center px-2">
            <Skeleton className="h-3 rounded-sm" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="px-5 py-2">
        <span className="text-sm text-muted-foreground">No tasks yet</span>
      </div>
    );
  }

  return (
    <>
      <div className="mb-0.5 flex h-7 shrink-0 items-center px-5 text-meta font-medium text-muted-foreground">Recents</div>
      {/* Active tasks: the scrolling part */}
      <div onScroll={onListScroll} className={cn("min-h-0 flex-1 overflow-y-auto px-3 pb-2 scrollbar-autohide", showedSkeleton.current && "motion-fade-in")} data-testid="task-list">
        <AnimatePresence initial={false}>{activeList.map((session) => renderRow(session))}</AnimatePresence>
      </div>

      {/* Settled: pinned above the footer; opens its list beneath the row */}
      {settledList.length > 0 && (
        <div className="shrink-0 border-t border-sidebar-border px-3 pt-1.5" data-testid="settled-section">
          <button
            type="button"
            onClick={toggleSettledOpen}
            aria-expanded={showSettledRows}
            data-testid="settled-shelf-toggle"
            className="flex h-8 w-full cursor-pointer items-center gap-1.5 rounded-md px-2 text-left text-meta text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:cursor-default disabled:hover:text-muted-foreground"
          >
            <span className="flex-1">Settled</span>
            <span className="tabular-nums text-muted-foreground/70">{settledList.length}</span>
            <ChevronRight
              className={cn("size-3.5 shrink-0 transition-transform", showSettledRows && "rotate-90")}
              aria-hidden
            />
          </button>
          <AnimatePresence initial={false}>
          {showSettledRows && (
            <motion.div
              // The shelf opens and closes beneath its row
              initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: reduceMotion ? "auto" : 0, opacity: 0, transition: { duration: 0.16, ease: EASE_OUT } }}
              transition={{ duration: 0.22, ease: EASE_OUT }}
              onScroll={onListScroll}
              className="max-h-[40vh] overflow-y-auto scrollbar-autohide"
              data-testid="settled-shelf"
            >
              {/* Padding inside the animated box, so its measured height is its full height */}
              <div className="pb-1">
              <AnimatePresence initial={false}>{settledList.slice(0, settledShown).map((session) => renderRow(session))}</AnimatePresence>
              {settledList.length > settledShown && (
                <button
                  type="button"
                  onClick={() => setSettledShown((n) => n + SETTLED_PAGE_SIZE)}
                  className="h-8 w-full cursor-pointer rounded-md px-2 text-left text-meta text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                >
                  Show {Math.min(SETTLED_PAGE_SIZE, settledList.length - settledShown)} more
                </button>
              )}
              </div>
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      )}
    </>
  );

  function renderRow(session: SessionInfo) {
    const isSettled = Boolean(session.settledAt);
    const isActive = session.sessionId === activeSessionId;
    const isEditing = editingSessionId === session.sessionId;
    const isHovered = hoveredSessionId === session.sessionId;
    const isMenuOpen = openMenuSessionId === session.sessionId;
    const showMenu = isHovered || isMenuOpen;
    const displayName = session.conversationName || session.name || "Untitled task";
    const status = getSessionStatus(session.sessionId);
    const needsYou = status === "waiting";
    const waitingKind = activeSessions.get(session.sessionId)?.permissionRequest ? "approval" : "answer";
    const at = Date.parse(session.updatedAt);
    const lastActivity = Number.isNaN(at) ? "" : `Last activity ${relativeTime(session.updatedAt, now)} (${new Date(at).toLocaleString()})`;
    const statusIsNew = statusJustChanged(session.sessionId, status);
    const statusLabel = needsYou
      ? `needs your ${waitingKind}`
      : status === "loading"
        ? "working"
        : status === "done"
          ? "finished, not yet seen"
          : null;

    return (
      <TaskRowMotion key={session.sessionId} layoutKey={layoutKey}>
      <div
        data-testid="task-row"
        data-settled={isSettled ? "true" : "false"}
        data-status={status ?? undefined}
        className={cn(
          "group/row relative mb-[2px] w-full rounded-md transition-colors",
          needsYou ? "min-h-12" : "h-8",
          isSettled && !isActive && !needsYou && "opacity-70",
          isActive
            ? "bg-muted text-foreground"
            : needsYou
              ? "bg-warning-muted text-foreground hover:bg-warning-muted/70"
              : status === "done"
                ? "text-foreground hover:bg-foreground/[0.035]"
                : "text-muted-foreground hover:bg-foreground/[0.035] hover:text-foreground",
        )}
        onMouseEnter={() => setHoveredSessionId(session.sessionId)}
        onMouseLeave={() => setHoveredSessionId(null)}
        // Keyboard: the row's actions show while focus is inside it
        onFocus={() => setHoveredSessionId(session.sessionId)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHoveredSessionId(null);
        }}
        // Right-click (or the context-menu key) opens the same menu as "…"
        onContextMenu={(e) => {
          if (isEditing) return;
          e.preventDefault();
          setOpenMenuSessionId(session.sessionId);
        }}
      >
        {isEditing ? (
          <div className="flex h-8 items-center px-[5px]">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => handleRename(session.sessionId)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleRename(session.sessionId);
                } else if (e.key === "Escape") {
                  handleCancelRename();
                }
              }}
              aria-label="Task name"
              className="h-[29px] w-full rounded-md border border-input bg-background px-[6px] text-sm text-foreground focus:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
              autoFocus
            />
          </div>
        ) : (
          <button
            onClick={() => handleLoadSession(session.sessionId)}
            aria-current={isActive ? "page" : undefined}
            aria-label={statusLabel ? `${displayName}, ${statusLabel}` : displayName}
            title={[displayName, session.workingFolder ? `In ${pathBaseName(session.workingFolder)} (${session.workingFolder})` : "", lastActivity, formatCost(activeSessions.get(session.sessionId)?.usage?.costUsd ?? session.costUsd)].filter(Boolean).join("\n")}
            className={cn(
              "flex w-full cursor-pointer flex-col justify-center rounded-md px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              needsYou ? "min-h-12 py-1.5" : "h-8",
            )}
          >
            {/* The folder's badge leads the line (an empty slot when the task
                has none, so titles line up). Full width at rest; under the
                hover actions the text fades out instead of moving. A status
                mark at the right reserves its slot. */}
            <span className="flex w-full min-w-0 items-center gap-2">
              <span className="flex size-4 shrink-0 items-center justify-center" data-testid="task-row-folder">
                {session.workingFolder && <FolderBadge path={session.workingFolder} size="sm" />}
              </span>
              <span
                className={cn(
                  "block min-w-0 flex-1 truncate text-sm leading-5",
                  (isActive || needsYou) && "font-medium",
                  !showMenu && (status === "loading" || status === "done") && "pr-5",
                  showMenu && "[mask-image:linear-gradient(to_left,transparent_60px,black_84px)]",
                )}
              >
                {displayName}
              </span>
            </span>
            {needsYou && (
              <span className={cn("mt-0.5 ml-6 flex items-center gap-1.5 text-xs leading-4 font-medium text-foreground", statusIsNew && "motion-fade-in")} data-testid="needs-you">
                <span className="grid size-3.5 place-items-center" aria-hidden>
                  <span className="block size-2 rounded-full bg-warning ring-3 ring-warning/30" />
                </span>
                Needs your {waitingKind}
              </span>
            )}
          </button>
        )}

        {/* Working and unread marks, at the right while not hovered */}
        {!isEditing && !showMenu && (status === "loading" || status === "done") && (
          <div className={cn("pointer-events-none absolute top-1/2 right-[11px] -translate-y-1/2", statusIsNew && status === "loading" && "motion-fade-in")} aria-hidden>
            {status === "loading" ? (
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            ) : (
              <span className="flex size-3.5 items-center justify-center">
                <span className={cn("block size-2 rounded-full bg-info", statusIsNew && "motion-pop")} />
              </span>
            )}
          </div>
        )}

        {/* Hover/focus actions, over the faded end of the title */}
        {!isEditing && showMenu && (
          <div className="absolute right-[4px] top-1/2 flex -translate-y-1/2 items-center">
            <button
              type="button"
              onClick={(e) => handleSetSettled(session, !isSettled, e)}
              className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              aria-label={isSettled ? "Move back to Recents" : "Settle task"}
              title={isSettled ? "Move back to Recents" : "Settle"}
              data-testid={isSettled ? "unsettle-task" : "settle-task"}
            >
              <CircleCheck className="size-4" />
            </button>
            <DropdownMenu
              open={isMenuOpen}
              onOpenChange={(open) =>
                setOpenMenuSessionId(open ? session.sessionId : null)
              }
            >
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[state=open]:bg-sidebar-accent"
                  aria-label="Task options"
                  title="More"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40" data-testid="task-menu">
                <DropdownMenuItem
                  onClick={(e) => handleSetSettled(session, !isSettled, e)}
                  className="cursor-pointer"
                >
                  <CircleCheck className="size-4" />
                  {isSettled ? "Move back to Recents" : "Settle"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) =>
                    handleStartRename(session.sessionId, displayName, e)
                  }
                  className="cursor-pointer"
                >
                  <Pencil className="size-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => handleDelete(session, e)}
                  variant="destructive"
                  className="cursor-pointer"
                >
                  <Trash2 className="size-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      </TaskRowMotion>
    );
  }
};
