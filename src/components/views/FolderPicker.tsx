import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { homeDir } from "@tauri-apps/api/path";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { FolderBadge } from "../FolderBadge";
import { Folder, FolderPlus, Pin, Search } from "@/lib/icons";
import { useAgentSessionsContext } from "../../contexts/AgentSessionsContext";
import { folderOptions, foldersStore, useFolders } from "@/stores/folders";
import { cn } from "@/lib/utils";
import { folderPathApi, type FolderCompletion } from "@/tauri/folders";
import { completeStep, folderMatches, isPathLike, parentHint } from "@/lib/folderPath";
import { toast } from "sonner";

interface FolderPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The subtree holding the element the picker hangs from, wrapped in `FolderPickerAnchor` */
  children: React.ReactNode;
  /** The folder chosen now, if any */
  current: string | null;
  onChoose: (path: string) => void;
  /** "Choose another folder…": the native folder dialog */
  onChooseOther: () => void;
  /** A folder found by typing its path (not a recent one): it goes through consent */
  onChooseNew: (path: string) => void;
  /** Where focus goes when the picker closes (the control that opened it) */
  returnFocus?: () => HTMLElement | null;
}

/** Wraps what the picker hangs from: the folder word, or "or pick a folder" */
export const FolderPickerAnchor = PopoverAnchor;

const ROW = 32;
const MAX_ROWS = 8;

type Row =
  | { kind: "recent"; path: string; name: string; pinned: boolean }
  | { kind: "dir"; path: string; name: string };

let homeCache: string | null = null;

/**
 * Home's folder picker: a search field, recent folders (pinned first) with
 * their badges and a pin toggle, and "Choose another folder…". Typing
 * filters by name and by path; a path (~/…, /…, ./…, or anything with a /)
 * also lists the folders on disk there, like a shell's Tab completion. ↑↓
 * to move, Tab or → to go into a folder, Enter to choose, Escape to close.
 */
export const FolderPicker: React.FC<FolderPickerProps> = ({ open, onOpenChange, children, current, onChoose, onChooseOther, onChooseNew, returnFocus }) => {
  const prefs = useFolders();
  const { sessions } = useAgentSessionsContext();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const [home, setHome] = useState<string | null>(homeCache);
  useEffect(() => {
    if (homeCache) return;
    homeDir()
      .then((dir) => {
        homeCache = dir;
        setHome(dir);
      })
      .catch(() => {});
  }, []);

  const options = useMemo(() => folderOptions(prefs, sessions), [prefs, sessions]);
  const pathMode = isPathLike(query);
  const recentMatches = useMemo(() => {
    const q = query.trim();
    if (!q) return options;
    return options.filter((o) => folderMatches(o.path, o.name, q, home));
  }, [options, query, home]);

  // A typed path lists the folders on disk there; the latest answer wins,
  // and the previous rows stay until it comes
  const [completion, setCompletion] = useState<FolderCompletion | null>(null);
  const asked = useRef(0);
  useEffect(() => {
    if (!open || !pathMode) {
      asked.current++;
      setCompletion(null);
      return;
    }
    const ticket = ++asked.current;
    folderPathApi
      .complete(query.trim(), current)
      .then((result) => ticket === asked.current && setCompletion(result))
      .catch((error) => {
        console.error("[folders] Could not list folders:", error);
        if (ticket === asked.current) setCompletion(null);
      });
  }, [open, pathMode, query, current]);

  const rows = useMemo<Row[]>(() => {
    const recent: Row[] = recentMatches.map((o) => ({ kind: "recent", path: o.path, name: o.name, pinned: o.pinned }));
    if (!pathMode || !completion) return recent;
    const same = (a: string, b: string) => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
    const found: Row[] = completion.entries
      .filter((e) => !recent.some((r) => same(r.path, e.path)))
      .map((e) => ({ kind: "dir", path: e.path, name: e.name }));
    return [...recent, ...found];
  }, [recentMatches, pathMode, completion]);

  // Paths show when a path is typed, and for rows that share a name
  const sharedNames = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of rows) seen.set(r.name, (seen.get(r.name) ?? 0) + 1);
    return new Set([...seen].filter(([, n]) => n > 1).map(([name]) => name));
  }, [rows]);

  // The last row is always "Choose another folder…"
  const count = rows.length + 1;
  const otherIndex = rows.length;

  // The list keeps its height while typing: what it opened with (up to 8
  // rows), and all 8 once a path is typed, so results never make it jump
  const [listRows, setListRows] = useState(1);
  useEffect(() => {
    if (open) setListRows(Math.min(Math.max(options.length, 1), MAX_ROWS));
    // Only when it opens
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open && pathMode) setListRows(MAX_ROWS);
  }, [open, pathMode]);

  // Opening starts on the current folder, with an empty search
  useEffect(() => {
    if (!open) return;
    setQuery("");
    const at = current ? options.findIndex((o) => o.path === current) : -1;
    setActive(Math.max(0, at));
    // Only when it opens
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Typing starts again from the top match
  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const choose = async (index: number) => {
    if (index === otherIndex) {
      onOpenChange(false);
      onChooseOther();
      return;
    }
    const row = rows[index];
    if (!row) return;
    if (row.kind === "recent") {
      onOpenChange(false);
      onChoose(row.path);
      return;
    }
    // Not a recent folder: checked, then the same consent as the native dialog
    try {
      const path = await folderPathApi.check(row.path);
      onOpenChange(false);
      onChooseNew(path);
    } catch (error) {
      toast.error(typeof error === "string" ? error : "Couldn’t use that folder.");
    }
  };

  // Tab (or → at the end of the field) goes into the highlighted folder
  const enter = (index: number) => {
    const row = rows[index];
    if (!row) return false;
    setQuery(completeStep(row.path, query, home));
    return true;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(count - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      void choose(active);
    } else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      enter(active);
    } else if (e.key === "ArrowRight") {
      const input = e.currentTarget;
      const atEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
      if (atEnd && query.trim() && enter(active)) e.preventDefault();
    }
    // Escape: the popover closes and focus goes back to where it opened from
  };

  // What the list says when it has no folder rows (or more than it shows)
  const status = (() => {
    if (pathMode && completion?.refused && rows.length === 0) return completion.refused;
    if (rows.length > 0) return null;
    if (pathMode && completion?.missing) return `No folder at ${query.trim()}`;
    return `No folders match “${query.trim()}”`;
  })();

  const optionId = (index: number) => `${listboxId}-${index}`;
  const rowClass = (index: number) =>
    cn(
      "group/folder flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-sm px-2 text-left text-sm text-foreground/90 outline-none transition-colors",
      index === active && "bg-foreground/[0.043] text-foreground",
    );

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {children}
      <PopoverContent
        side="bottom"
        align="start"
        alignOffset={-12}
        sideOffset={8}
        collisionPadding={12}
        className="flex w-[288px] flex-col overflow-hidden p-0"
        data-testid="folder-picker"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
        onCloseAutoFocus={(e) => {
          // Anchored, not triggered: send focus back to the folder control
          e.preventDefault();
          returnFocus?.()?.focus({ preventScroll: true });
        }}
      >
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded
            aria-controls={listboxId}
            aria-activedescendant={optionId(active)}
            aria-autocomplete="list"
            aria-label="Search folders"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search folders…"
            spellCheck={false}
            autoComplete="off"
            className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-faint focus:outline-none"
          />
        </div>
        <div id={listboxId} role="listbox" aria-label="Folders" ref={listRef}>
          <div className="overflow-y-auto overscroll-contain p-1" style={{ height: listRows * ROW + 8 }} data-testid="folder-list">
            {status && <div className="flex min-h-8 items-center px-2 py-1.5 text-meta text-muted-foreground" data-testid="folder-status">{status}</div>}
            {rows.map((row, index) => {
              // Found rows sit in the directory typed, so only recents need it
              const showPath = row.kind === "recent" && (pathMode || sharedNames.has(row.name));
              return (
                <div
                  key={`${row.kind}:${row.path}`}
                  id={optionId(index)}
                  data-index={index}
                  role="option"
                  aria-selected={index === active}
                  data-current={row.path === current ? "true" : undefined}
                  title={row.path}
                  className={rowClass(index)}
                  onMouseMove={() => index !== active && setActive(index)}
                  onClick={() => void choose(index)}
                  data-testid={row.kind === "recent" ? "folder-option" : "folder-found"}
                >
                  {row.kind === "recent" ? (
                    <FolderBadge path={row.path} />
                  ) : (
                    <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
                      <Folder className="size-4" />
                    </span>
                  )}
                  <span className={cn("min-w-0 flex-1 truncate", row.path === current && "text-foreground")}>{row.name}</span>
                  {showPath && (
                    <span className="max-w-[48%] shrink-0 truncate text-meta text-muted-foreground" data-testid="folder-path">
                      {parentHint(row.path, home)}
                    </span>
                  )}
                  {row.kind === "recent" && (
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={row.pinned ? `Unpin ${row.name}` : `Pin ${row.name}`}
                      aria-pressed={row.pinned}
                      title={row.pinned ? "Unpin" : "Pin to the top"}
                      data-testid="folder-pin"
                      onClick={(e) => {
                        e.stopPropagation();
                        void foldersStore.setPinned(row.path, !row.pinned);
                        inputRef.current?.focus();
                      }}
                      className={cn(
                        "-mr-1 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[5px] transition-[color,opacity,background-color] hover:bg-foreground/[0.06] hover:text-foreground",
                        row.pinned
                          ? "text-muted-foreground"
                          : cn("text-muted-foreground/70 opacity-0", index === active && "opacity-100"),
                      )}
                    >
                      <Pin className="size-3.5" fill={row.pinned ? "currentColor" : "none"} />
                    </button>
                  )}
                </div>
              );
            })}
            {pathMode && completion?.truncated && (
              <div className="flex h-8 items-center px-2 text-meta text-muted-foreground">Showing the first {completion.entries.length} folders</div>
            )}
          </div>
          <div className="border-t border-border p-1">
            <div
              id={optionId(otherIndex)}
              data-index={otherIndex}
              role="option"
              aria-selected={active === otherIndex}
              className={rowClass(otherIndex)}
              onMouseMove={() => active !== otherIndex && setActive(otherIndex)}
              onClick={() => void choose(otherIndex)}
              data-testid="folder-choose-other"
            >
              <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
                <FolderPlus className="size-4" />
              </span>
              <span className="min-w-0 flex-1 truncate">Choose another folder…</span>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
