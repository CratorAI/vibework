/**
 * Files tab: the task's working folder as a tree. Folders load one level at a
 * time when opened (folders first); hidden entries and dependency folders
 * (node_modules, .git, target…) are listed quietly and never opened by
 * default. A file the panel can show opens in its own tab, the same as
 * a file card; any other file offers Open in default app and Show in Finder.
 * The filter searches names in the whole folder. The tree follows changes on
 * disk, and files the agent made or changed in this task carry a quiet dot.
 *
 * Every read goes through the sandboxed artifact commands (the same folder
 * checks as the panel's viewers).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, ExternalLink, File as FileIcon, Folder, FolderOpen, Search, X } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ArtifactTypeChip } from "@/components/artifacts/typeColor";
import { artifactTypeById, isPreviewable, resolveArtifactType } from "@/components/artifacts/registry";
import { useAgentSessionsContext } from "@/contexts/AgentSessionsContext";
import {
  findInTree,
  isArtifactError,
  listTree,
  unwatchArtifact,
  watchTree,
  type TreeListing,
  type TreeMatch,
} from "@/tauri/artifacts";
import { openFile, revealInFinder } from "@/tauri/files";
import { cn, errorMessage } from "@/lib/utils";
import { openArtifactInPanel } from "../actions";
import { onWatchEvent } from "../artifacts/useArtifactWatch";
import { folderTouched, touchedBy, useAgentTouched } from "./agentTouched";
import { CHOOSE_TASK_FOLDER_EVENT } from "./events";


/** Per-task tree state kept for the app session (survives switching tabs and tasks) */
interface TreeMemory {
  expanded: Set<string>;
  selected: string | null;
  query: string;
}
const memory = new Map<string, TreeMemory>();
function treeMemory(sessionId: string): TreeMemory {
  let m = memory.get(sessionId);
  if (!m) {
    m = { expanded: new Set(), selected: null, query: "" };
    memory.set(sessionId, m);
  }
  return m;
}

interface Row {
  key: string;
  name: string;
  path: string;
  isDir: boolean;
  artifactType?: string | null;
  quiet: boolean;
  depth: number;
  modifiedMs: number;
  /** Folder (relative), filter results only */
  folder?: string;
  /** Parent folder's path, tree rows only */
  parent: string | null;
  /** "N more not shown" row of a capped folder */
  more?: number;
}

const ROW_ID = (sessionId: string, path: string) => `files-${sessionId}-${encodeURIComponent(path)}`;

function useTaskFolder(sessionId: string): { chosen: boolean; known: boolean } {
  const { sessions } = useAgentSessionsContext();
  const session = sessions.find((s) => s.sessionId === sessionId);
  return { chosen: !!session?.workingFolder, known: !!session };
}

export function FilesTab({ sessionId, agentBusy }: { sessionId: string; agentBusy: boolean }) {
  const { chosen, known } = useTaskFolder(sessionId);
  if (known && !chosen) return <NoFolder sessionId={sessionId} />;
  return <FileTree sessionId={sessionId} agentBusy={agentBusy} />;
}

function NoFolder({ sessionId }: { sessionId: string }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[420px] flex-col items-start px-6 pt-16 pb-10">
        <p className="text-meta text-muted-foreground">Give this task a folder to browse and open its files here.</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => window.dispatchEvent(new CustomEvent(CHOOSE_TASK_FOLDER_EVENT, { detail: { sessionId } }))}
        >
          <FolderOpen className="size-4" />
          Choose a folder
        </Button>
      </div>
    </div>
  );
}

function FileTree({ sessionId, agentBusy }: { sessionId: string; agentBusy: boolean }) {
  const mem = treeMemory(sessionId);
  const [listings, setListings] = useState<Map<string, TreeListing>>(new Map());
  const [rootDir, setRootDir] = useState<string | null>(null);
  const [rootError, setRootError] = useState<unknown>(null);
  const [folderErrors, setFolderErrors] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(mem.expanded));
  const [selected, setSelected] = useState<string | null>(mem.selected);
  const [query, setQuery] = useState(mem.query);
  const [matches, setMatches] = useState<TreeMatch[] | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const touched = useAgentTouched(sessionId, agentBusy);

  // Remember the view for this task
  useEffect(() => {
    mem.expanded = expanded;
    mem.selected = selected;
    mem.query = query;
  }, [mem, expanded, selected, query]);

  const load = useCallback(
    async (dir?: string) => {
      try {
        const listing = await listTree(sessionId, dir);
        setListings((prev) => new Map(prev).set(dir ?? "", listing));
        if (!dir) {
          setRootDir(listing.dir);
          setRootError(null);
        } else {
          setFolderErrors((prev) => {
            if (!prev.has(dir)) return prev;
            const next = new Set(prev);
            next.delete(dir);
            return next;
          });
        }
      } catch (err) {
        if (!dir) setRootError(err);
        else {
          // A folder that is gone collapses quietly; anything else says so in place
          if (isArtifactError(err) && err.code === "not_found") {
            setExpanded((prev) => {
              const next = new Set(prev);
              next.delete(dir);
              return next;
            });
          } else setFolderErrors((prev) => new Set(prev).add(dir));
        }
      }
    },
    [sessionId],
  );

  // Everything currently on screen, again (after a change on disk or a turn)
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const queryRef = useRef(query);
  queryRef.current = query;
  const refresh = useCallback(() => {
    void load();
    for (const dir of expandedRef.current) void load(dir);
    const q = queryRef.current.trim();
    if (q) findInTree(sessionId, q).then((m) => queryRef.current.trim() === q && setMatches(m), () => {});
  }, [load, sessionId]);

  useEffect(() => {
    void load();
    for (const dir of mem.expanded) void load(dir);
  }, [load, mem]);

  // Follow the folder on disk (one recursive watch for the tab's lifetime)
  useEffect(() => {
    let cancelled = false;
    let watchId: string | null = null;
    let unsubscribe: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    watchTree(sessionId).then(
      (id) => {
        if (cancelled) {
          unwatchArtifact(id).catch(() => {});
          return;
        }
        watchId = id;
        unsubscribe = onWatchEvent(id, () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(refresh, 120);
        });
      },
      (err) => console.warn("[files] could not watch the folder", err),
    );
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsubscribe?.();
      if (watchId) unwatchArtifact(watchId).catch(() => {});
    };
  }, [sessionId, refresh]);

  // A turn that ends may have written files the watch coalesced away
  const wasBusy = useRef(agentBusy);
  useEffect(() => {
    if (wasBusy.current && !agentBusy) refresh();
    wasBusy.current = agentBusy;
  }, [agentBusy, refresh]);

  // The filter searches the whole folder by name
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setMatches(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      findInTree(sessionId, q).then(
        (m) => !cancelled && setMatches(m),
        () => !cancelled && setMatches([]),
      );
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, sessionId]);

  const rows = useMemo<Row[]>(() => {
    if (query.trim()) {
      return (matches ?? []).map((m) => ({
        key: m.path,
        name: m.name,
        path: m.path,
        isDir: m.isDir && !m.artifactType, artifactType: m.artifactType,
        quiet: false,
        depth: 0,
        modifiedMs: m.modifiedMs,
        folder: m.folder,
        parent: null,
      }));
    }
    const out: Row[] = [];
    const walk = (dirKey: string, parent: string | null, depth: number) => {
      const listing = listings.get(dirKey);
      if (!listing) return;
      for (const e of listing.entries) {
        out.push({ key: e.path, name: e.name, path: e.path, isDir: e.isDir && !e.artifactType, artifactType: e.artifactType, quiet: e.quiet, depth, modifiedMs: e.modifiedMs, parent });
        if (e.isDir && !e.artifactType && expanded.has(e.path)) walk(e.path, e.path, depth + 1);
      }
      if (listing.more > 0) {
        out.push({ key: `${dirKey}\u0000more`, name: "", path: `${dirKey}\u0000more`, isDir: false, quiet: true, depth, modifiedMs: 0, parent, more: listing.more });
      }
    };
    walk("", null, 0);
    return out;
  }, [query, matches, listings, expanded]);

  const selectable = useMemo(() => rows.filter((r) => r.more === undefined), [rows]);
  const selectedIndex = selectable.findIndex((r) => r.path === selected);

  // Keep the selected row in view as it moves
  useLayoutEffect(() => {
    if (!selected) return;
    document.getElementById(ROW_ID(sessionId, selected))?.scrollIntoView({ block: "nearest" });
  }, [selected, sessionId]);

  const toggle = (path: string, open?: boolean) => {
    setExpanded((prev) => {
      const isOpen = prev.has(path);
      const want = open ?? !isOpen;
      if (want === isOpen) return prev;
      const next = new Set(prev);
      if (want) {
        next.add(path);
        void load(path);
      } else next.delete(path);
      return next;
    });
  };

  // Show a folder found by the filter in the tree: open its ancestors
  const reveal = (path: string) => {
    if (!rootDir) return;
    const rel = path.startsWith(`${rootDir}/`) ? path.slice(rootDir.length + 1) : "";
    const parts = rel.split("/").filter(Boolean);
    const ancestors: string[] = [];
    for (let i = 1; i <= parts.length; i++) ancestors.push(`${rootDir}/${parts.slice(0, i).join("/")}`);
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const a of ancestors) {
        if (!next.has(a)) {
          next.add(a);
          void load(a);
        }
      }
      return next;
    });
    setQuery("");
    setSelected(path);
    treeRef.current?.focus();
  };

  const runFileAction = async (action: (path: string) => Promise<void>, path: string, failure: string) => {
    try {
      await action(path);
    } catch (err) {
      toast.error(failure, { description: errorMessage(err) });
    }
  };

  const activate = (row: Row) => {
    setSelected(row.path);
    if (row.isDir) {
      if (row.folder !== undefined) reveal(row.path);
      else toggle(row.path);
      return;
    }
    if (isPreviewable(row.name)) openArtifactInPanel(sessionId, row.path);
    else setMenuFor(row.path);
  };

  const onTreeKeyDown = (e: React.KeyboardEvent) => {
    if (selectable.length === 0) return;
    const current = selectedIndex >= 0 ? selectable[selectedIndex] : null;
    const move = (index: number) => setSelected(selectable[Math.max(0, Math.min(selectable.length - 1, index))].path);
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(selectedIndex + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (selectedIndex <= 0 && query) filterRef.current?.focus();
        else move(selectedIndex - 1);
        break;
      case "Home":
        e.preventDefault();
        move(0);
        break;
      case "End":
        e.preventDefault();
        move(selectable.length - 1);
        break;
      case "ArrowRight":
        e.preventDefault();
        if (current?.isDir && current.folder === undefined) {
          if (!expanded.has(current.path)) toggle(current.path, true);
          else if (selectable[selectedIndex + 1]?.parent === current.path) move(selectedIndex + 1);
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (current?.isDir && expanded.has(current.path)) toggle(current.path, false);
        else if (current?.parent) setSelected(current.parent);
        break;
      case "Enter":
        e.preventDefault();
        if (current) activate(current);
        else move(0);
        break;
    }
  };

  const filterBar = (
    <div className="flex h-10 shrink-0 items-center border-b px-2">
      <label className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-muted-foreground focus-within:bg-muted/60 hover:bg-muted/60">
        <Search className="size-3.5 shrink-0" />
        <input
          ref={filterRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "Enter") {
              e.preventDefault();
              if (selectable.length > 0) {
                setSelected(selectable[0].path);
                treeRef.current?.focus();
                if (e.key === "Enter") activate(selectable[0]);
              }
            } else if (e.key === "Escape" && query) {
              e.preventDefault();
              e.stopPropagation();
              setQuery("");
            }
          }}
          placeholder="Filter by name"
          aria-label="Filter files by name"
          spellCheck={false}
          className="h-full min-w-0 flex-1 bg-transparent text-meta text-foreground outline-none placeholder:text-faint"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear filter"
            title="Clear filter"
            onClick={() => {
              setQuery("");
              filterRef.current?.focus();
            }}
            className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <X className="size-3" />
          </button>
        )}
      </label>
    </div>
  );

  if (rootError !== null) {
    return (
      <div className="flex h-full flex-col">
        {filterBar}
        <div className="px-4 pt-6 text-meta text-muted-foreground">
          Couldn’t list this task’s folder.{" "}
          <button type="button" className="rounded-sm font-medium text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50" onClick={() => void load()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const loading = !listings.has("") || (query.trim() !== "" && matches === null);
  const root = rootDir ?? "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {filterBar}
      <div
        ref={treeRef}
        role="tree"
        aria-label="Files"
        tabIndex={0}
        aria-activedescendant={selected && selectedIndex >= 0 ? ROW_ID(sessionId, selected) : undefined}
        onKeyDown={onTreeKeyDown}
        onFocus={() => {
          if (!selected && selectable.length > 0) setSelected(selectable[0].path);
        }}
        className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        {loading ? (
          <div className="flex flex-col gap-1 px-2 pt-1" aria-hidden>
            {[62, 48, 70, 40, 56].map((w, i) => (
              <div key={i} className="flex h-8 items-center gap-2">
                <Skeleton className="size-5 rounded-[5px]" />
                <Skeleton className="h-3" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="px-2.5 pt-2 text-meta text-muted-foreground">
            {query.trim() ? `No files match “${query.trim()}”` : "This folder is empty"}
          </p>
        ) : (
          rows.map((row) =>
            row.more !== undefined ? (
              <div key={row.key} className="flex h-8 items-center text-meta text-faint" style={{ paddingLeft: 8 + row.depth * 16 + 16 + 8 }}>
                {row.more.toLocaleString()} more not shown
              </div>
            ) : (
              <TreeRow
                key={row.key}
                id={ROW_ID(sessionId, row.path)}
                row={row}
                expanded={expanded.has(row.path)}
                selected={row.path === selected}
                failed={folderErrors.has(row.path)}
                marked={
                  row.isDir
                    ? !expanded.has(row.path) && folderTouched(touched, root, row.path)
                    : touchedBy(touched, root, row.path, row.modifiedMs)
                }
                menuOpen={menuFor === row.path}
                onMenuOpenChange={(open) => {
                  setMenuFor(open ? row.path : null);
                  if (!open) treeRef.current?.focus();
                }}
                onActivate={() => {
                  treeRef.current?.focus();
                  activate(row);
                }}
                onOpenExternally={() => runFileAction(openFile, row.path, "Couldn’t open the file")}
                onReveal={() => runFileAction(revealInFinder, row.path, "Couldn’t show the file in Finder")}
              />
            ),
          )
        )}
      </div>
    </div>
  );
}

function TreeRow({
  id,
  row,
  expanded,
  selected,
  failed,
  marked,
  menuOpen,
  onMenuOpenChange,
  onActivate,
  onOpenExternally,
  onReveal,
}: {
  id: string;
  row: Row;
  expanded: boolean;
  selected: boolean;
  failed: boolean;
  marked: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onActivate: () => void;
  onOpenExternally: () => void;
  onReveal: () => void;
}) {
  const type = row.artifactType ? artifactTypeById(row.artifactType) : row.isDir ? null : resolveArtifactType(row.name);
  const Icon = type?.icon ?? FileIcon;
  const inFilter = row.folder !== undefined;
  const canShow = !!row.artifactType || (!row.isDir && isPreviewable(row.name));
  return (
    <div
      id={id}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-expanded={row.isDir && !inFilter ? expanded : undefined}
      aria-selected={selected}
      title={failed ? "Couldn’t list this folder" : row.path}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onActivate}
      className={cn(
        "relative flex h-8 cursor-default items-center gap-2 rounded-md pr-2 text-sm transition-colors select-none",
        selected ? "bg-muted text-foreground" : "hover:bg-muted/60",
        row.quiet ? "text-faint" : "text-foreground",
      )}
      style={{ paddingLeft: 8 + row.depth * 16 }}
    >
      {/* Disclosure slot (16px), so names line up whether or not a row has one */}
      <span className="grid size-4 shrink-0 place-items-center text-muted-foreground">
        {row.isDir && !inFilter && (
          <ChevronRight className={cn("size-3.5 transition-transform duration-150", expanded && "rotate-90")} />
        )}
      </span>
      {row.isDir ? (
        <span className={cn("grid size-5 shrink-0 place-items-center", row.quiet ? "text-faint" : "text-muted-foreground")}>
          <Folder className="size-4" />
        </span>
      ) : (
        <ArtifactTypeChip typeId={row.artifactType ?? undefined} fileName={row.name} icon={Icon} size="sm" className={row.quiet ? "opacity-60" : undefined} />
      )}
      <span className="min-w-0 flex-1 truncate">
        {row.name}
        {inFilter && row.folder && <span className="ml-2 text-meta text-muted-foreground">{row.folder}</span>}
      </span>
      {marked && (
        <span
          className="size-1.5 shrink-0 rounded-full bg-foreground/40"
          title={row.isDir ? "Holds files the agent made or changed in this task" : "Made or changed by the agent in this task"}
          aria-label="Changed by the agent"
        />
      )}
      {!row.isDir && !canShow && (
        <DropdownMenu open={menuOpen} onOpenChange={onMenuOpenChange}>
          <DropdownMenuTrigger asChild>
            <span aria-hidden className="pointer-events-none absolute top-0 right-2 h-8 w-0" tabIndex={-1} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52" onCloseAutoFocus={(e) => e.preventDefault()}>
            <DropdownMenuItem onClick={onOpenExternally}>
              <ExternalLink className="size-4" />
              Open in default app
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onReveal}>
              <FolderOpen className="size-4" />
              Show in Finder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

