/**
 * The search window: a centred dialog, opened from the sidebar's Search row or
 * ⌘K anywhere, that finds tasks (settled ones too), the files they made, and a
 * few actions, and puts the tasks waiting on the user first. Titles and file
 * names only: searching message text needs an index (see DESIGN.md).
 *
 * Everything is filtered in memory: the task list is already loaded, and the
 * artifacts index is read once each time the window opens.
 */

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart, Cpu, FileText, Folder, Keyboard, Plus, Search, Settings, ViewGrid, X } from "@/lib/icons";
import { chord, matchShortcut } from "@/lib/shortcuts";
import { shortcutsSheet } from "@/stores/shortcutsSheet";
import { FolderBadge } from "@/components/FolderBadge";
import { ArtifactTypeChip } from "@/components/artifacts/typeColor";
import { resolveArtifactType } from "@/components/artifacts/registry";
import { fileKind } from "@/components/PresentFile";
import { permissionTitle } from "@/components/PermissionPrompt";
import { shortModelName } from "@/components/ModelPicker";
import { openArtifactInPanel } from "@/components/workspace/actions";
import { useAgentSessionsContext } from "@/contexts/AgentSessionsContext";
import { useModels } from "@/contexts/ModelsContext";
import { useFolders } from "@/stores/folders";
import { requestPicker, searchWindow, useSearchWindow } from "@/stores/searchWindow";
import { artifactsIndex, type GalleryItem } from "@/tauri/gallery";
import { getModel, searchMessages, type MessageHit } from "@/tauri/agent";
import { messageReveal } from "@/stores/messageReveal";
import { openSettings } from "@/lib/settingsNav";
import { fold, highlightRuns, matchFields, rank, tokenize, type Match, type MatchRange } from "@/lib/search";
import { EASE_DRAWER } from "@/lib/motion";
import { cn, pathBaseName } from "@/lib/utils";
import type { SessionInfo } from "@/types/agent";

type Tab = "all" | "tasks" | "artifacts";
const TABS: { id: Tab; label: string; placeholder: string }[] = [
  { id: "all", label: "All", placeholder: "Search tasks, artifacts and actions…" },
  { id: "tasks", label: "Tasks", placeholder: "Search tasks…" },
  { id: "artifacts", label: "Artifacts", placeholder: "Search artifacts…" },
];

/** Rows per section on the All tab while searching; the rest are a tab away */
const PER_SECTION = 5;
/** Recent tasks on the All tab before anything is typed */
const RECENT = 5;
/** Rows drawn per section on the Tasks and Artifacts tabs before "Show more" */
const TAB_PAGE = 150;
/** Pause in typing before the message index is asked */
const MESSAGE_DEBOUNCE_MS = 120;

/** Every query word starts a word of the snippet (folded): a previous result still fits. */
function snippetHasEvery(snippet: string, tokens: string[]): boolean {
  const words = fold(snippet).split(/[^\p{L}\p{N}]+/u);
  return tokens.every((t) => t.split(/[^\p{L}\p{N}]+/u).filter(Boolean).every((part) => words.some((w) => w.startsWith(part))));
}
/** The results list grows to this, then scrolls */
const LIST_MAX = 468;

// ── Time ─────────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const startOfDay = (now: number) => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** "now", "12m", "3h" today; "Yesterday"; a weekday this week; else "Nov 3". */
function when(at: number, now: number): string {
  if (Number.isNaN(at)) return "";
  const today = startOfDay(now);
  if (at >= today) {
    const minutes = Math.floor(Math.max(0, now - at) / 60_000);
    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h`;
  }
  if (at >= today - DAY) return "Yesterday";
  if (at >= today - 6 * DAY) return new Date(at).toLocaleDateString(undefined, { weekday: "short" });
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type DayGroup = "Today" | "This week" | "Earlier";
function dayGroup(at: number, now: number): DayGroup {
  const today = startOfDay(now);
  if (at >= today) return "Today";
  if (at >= today - 6 * DAY) return "This week";
  return "Earlier";
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ── Rows ─────────────────────────────────────────────────────────────────

interface TaskEntry {
  session: SessionInfo;
  title: string;
  folded: string[];
  at: number;
}
interface ArtifactEntry {
  item: GalleryItem;
  folder: string | null;
  folded: string[];
  at: number;
}
interface Waiting {
  kind: "approval" | "answer";
  /** The action or question it waits on */
  detail: string;
}
interface Action {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** The current value of what it changes */
  value?: string;
  chord?: string;
  run: () => void;
}

type Row =
  | { kind: "task"; key: string; task: TaskEntry; waiting?: Waiting; match?: Match; hit?: MessageHit }
  | { kind: "artifact"; key: string; artifact: ArtifactEntry; match?: Match }
  | { kind: "action"; key: string; action: Action; match?: Match }
  | { kind: "more"; key: string; tab: Tab; label: string; page?: boolean }
  | { kind: "new-task"; key: string }
  | { kind: "clear"; key: string };

interface Section {
  key: string;
  label: string;
  rows: Row[];
}

// ── The window ───────────────────────────────────────────────────────────

export const SearchWindow: React.FC = () => {
  const { open, generation } = useSearchWindow();
  // Stays mounted through the close animation, then lets go of its state
  const [present, setPresent] = useState(open);
  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    const timer = setTimeout(() => setPresent(false), 250);
    return () => clearTimeout(timer);
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? searchWindow.open() : searchWindow.close())}>
      {(open || present) && <SearchWindowContent key={generation} />}
    </Dialog>
  );
};

const SearchWindowContent: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    sessions,
    activeSessions,
    activeSessionId,
    openSession,
    clearActiveSession,
    pendingWorkingFolder,
    pendingModel,
  } = useAgentSessionsContext();
  const { defaultModel, modelsById } = useModels();
  const folders = useFolders();

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [active, setActive] = useState(0);
  // How many rows per section the Tasks and Artifacts tabs draw (they grow by a page)
  const [shown, setShown] = useState(TAB_PAGE);
  const [artifacts, setArtifacts] = useState<GalleryItem[] | null>(null);
  const [artifactsFailed, setArtifactsFailed] = useState(false);
  const [taskModel, setTaskModel] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  // What to do once the window has closed, instead of returning focus
  const afterClose = useRef<(() => void) | null>(null);
  const [now] = useState(() => Date.now());

  // Read once per opening
  const loadArtifacts = useCallback(() => {
    setArtifactsFailed(false);
    artifactsIndex().then(setArtifacts, () => setArtifactsFailed(true));
  }, []);
  useEffect(loadArtifacts, [loadArtifacts]);
  useEffect(() => {
    if (!activeSessionId) return;
    let cancelled = false;
    getModel(activeSessionId).then((id) => !cancelled && setTaskModel(id), () => {});
    return () => {
      cancelled = true;
    };
  }, [activeSessionId]);

  // ── Data, folded once ──
  const tasks = useMemo<TaskEntry[]>(
    () =>
      sessions
        .map((session) => {
          const title = session.conversationName || session.name || "Untitled task";
          return { session, title, folded: [fold(title)], at: Date.parse(session.updatedAt) || 0 };
        })
        .sort((a, b) => b.at - a.at),
    [sessions],
  );
  const sessionsById = useMemo(() => new Map(sessions.map((s) => [s.sessionId, s])), [sessions]);
  const artifactEntries = useMemo<ArtifactEntry[]>(() => {
    if (!artifacts) return [];
    const seen = new Set<string>();
    const out: ArtifactEntry[] = [];
    for (const item of artifacts) {
      const key = `${item.sessionId}:${item.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const folder = sessionsById.get(item.sessionId)?.workingFolder ?? null;
      out.push({ item, folder, folded: [fold(item.name), fold(item.taskName)], at: Date.parse(item.lastTouchedAt) || 0 });
    }
    return out.sort((a, b) => b.at - a.at);
  }, [artifacts, sessionsById]);

  // Tasks waiting on the user, and on what. Keyed by a string so a stream
  // flush (which replaces activeSessions) recomputes nothing below.
  const waitingKey = useMemo(() => {
    const parts: string[] = [];
    for (const [id, state] of activeSessions.entries()) {
      if (state.permissionRequest) parts.push(`${id}\u0001approval\u0001${permissionTitle(state.permissionRequest)}`);
      else if (state.questionRequest) parts.push(`${id}\u0001answer\u0001${state.questionRequest.questions[0]?.question ?? ""}`);
    }
    return parts.join("\u0002");
  }, [activeSessions]);
  const waiting = useMemo(() => {
    const map = new Map<string, Waiting>();
    if (!waitingKey) return map;
    for (const part of waitingKey.split("\u0002")) {
      const [id, kind, detail] = part.split("\u0001");
      map.set(id, { kind: kind as Waiting["kind"], detail });
    }
    return map;
  }, [waitingKey]);

  // ── Actions ──
  const activeSessionsRef = useRef(activeSessions);
  activeSessionsRef.current = activeSessions;
  const homeFolder = pendingWorkingFolder ?? folders.homeFolder;
  const modelId = activeSessionId ? taskModel : pendingModel ?? defaultModel;
  const modelName = modelId ? shortModelName(modelsById.get(modelId)?.name ?? modelId) : undefined;

  /** Close, then run `then` in place of returning focus (the destination takes it) */
  const finish = useCallback((run: () => void, then: () => void = focusComposer) => {
    afterClose.current = then;
    searchWindow.close();
    run();
  }, []);

  const goHome = useCallback(() => {
    if (location.pathname !== "/") navigate("/");
  }, [location.pathname, navigate]);

  const actions = useMemo<Action[]>(
    () => [
      { id: "new-task", label: "New task", icon: Plus, chord: chord("newTask"), run: () => finish(() => { clearActiveSession(); goHome(); }) },
      { id: "artifacts", label: "Open Artifacts", icon: ViewGrid, chord: chord("artifacts"), run: () => finish(() => navigate("/artifacts"), () => {}) },
      { id: "settings", label: "Settings", icon: Settings, chord: chord("settings"), run: () => finish(() => openSettings(navigate), () => {}) },
      { id: "usage", label: "Usage", icon: BarChart, run: () => finish(() => openSettings(navigate, "usage"), () => {}) },
      { id: "shortcuts", label: "Keyboard shortcuts", icon: Keyboard, chord: chord("shortcuts"), run: () => finish(() => {}, () => shortcutsSheet.open()) },
      {
        id: "folder",
        label: "Change folder",
        icon: Folder,
        value: homeFolder ? pathBaseName(homeFolder) : "No folder",
        // Home's folder picker: leave the task (or page) for home first
        run: () => finish(() => { if (activeSessionId) clearActiveSession(); goHome(); }, () => requestPicker("home-folder-picker")),
      },
      {
        id: "model",
        label: "Change model",
        icon: Cpu,
        value: modelName,
        // The model picker of the composer on screen (the task's, or home's).
        // A task's model can't change mid-turn: say so, and go back to where focus was.
        run: () => {
          if (activeSessionId && activeSessionsRef.current.get(activeSessionId)?.isLoading) {
            searchWindow.close();
            toast("The model can change once this task stops working.");
          } else finish(goHome, () => requestAnimationFrame(() => requestPicker("model-picker")));
        },
      },
    ],
    [activeSessionId, clearActiveSession, finish, goHome, homeFolder, modelName, navigate],
  );
  const foldedActions = useMemo(() => actions.map((a) => [fold(a.label)]), [actions]);

  // ── Results ──
  const tokens = useMemo(() => tokenize(query), [query]);
  const searching = tokens.length > 0;

  // Message text matches, from the local index, off the main thread and
  // debounced. While a longer query is on its way the previous results stay
  // if their snippet still has every word, so rows don't flicker.
  const [messageHits, setMessageHits] = useState<{ query: string; hits: MessageHit[] }>({ query: "", hits: [] });
  const messageRequest = useRef(0);
  useEffect(() => {
    const q = query.trim();
    const request = ++messageRequest.current;
    if (!q) {
      setMessageHits({ query: "", hits: [] });
      return;
    }
    const timer = setTimeout(() => {
      searchMessages(q).then(
        (hits) => request === messageRequest.current && setMessageHits({ query: q, hits }),
        () => request === messageRequest.current && setMessageHits({ query: q, hits: [] }),
      );
    }, MESSAGE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);
  const liveHits = useMemo(() => {
    const q = query.trim();
    if (!q || !messageHits.query) return [];
    if (messageHits.query === q) return messageHits.hits;
    if (!fold(q).startsWith(fold(messageHits.query))) return [];
    return messageHits.hits.filter((hit) => snippetHasEvery(hit.snippet, tokens));
  }, [messageHits, query, tokens]);

  const taskRow = useCallback(
    (task: TaskEntry, match?: Match): Row => ({ kind: "task", key: `t:${task.session.sessionId}`, task, waiting: waiting.get(task.session.sessionId), match }),
    [waiting],
  );
  const artifactRow = (artifact: ArtifactEntry, match?: Match): Row => ({
    kind: "artifact",
    key: `a:${artifact.item.sessionId}:${artifact.item.path}`,
    artifact,
    match,
  });

  const { sections, taskCount, artifactCount } = useMemo(() => {
    const out: Section[] = [];
    const push = (key: string, label: string, rows: Row[]) => {
      if (rows.length === 0) return;
      // Long lists on a tab draw a page at a time, so typing stays instant
      if (tab !== "all" && rows.length > shown) {
        const rest = rows.length - shown;
        rows = [...rows.slice(0, shown), { kind: "more", key: `more:${key}`, tab, page: true, label: `Show ${Math.min(rest, TAB_PAGE)} more` }];
      }
      out.push({ key, label, rows });
    };
    const byDay = <T,>(entries: T[], at: (e: T) => number, toRow: (e: T) => Row, prefix: string) => {
      const groups: Record<DayGroup, Row[]> = { Today: [], "This week": [], Earlier: [] };
      for (const e of entries) groups[dayGroup(at(e), now)].push(toRow(e));
      (Object.keys(groups) as DayGroup[]).forEach((g) => push(`${prefix}:${g}`, g, groups[g]));
    };

    if (!searching) {
      const waitingTasks = tasks.filter((t) => waiting.has(t.session.sessionId));
      const others = tasks.filter((t) => !waiting.has(t.session.sessionId));
      if (tab !== "artifacts") push("needs", "Needs you", waitingTasks.map((t) => taskRow(t)));
      if (tab === "all") {
        push("recent", "Recent", others.filter((t) => !t.session.settledAt).slice(0, RECENT).map((t) => taskRow(t)));
        push("actions", "Actions", actions.map((action) => ({ kind: "action", key: `x:${action.id}`, action })));
      } else if (tab === "tasks") {
        byDay(others, (t) => t.at, (t) => taskRow(t), "tasks");
      } else {
        byDay(artifactEntries, (a) => a.at, (a) => artifactRow(a), "artifacts");
      }
      return { sections: out, taskCount: 0, artifactCount: 0 };
    }

    const matchedTasks = rank(
      tasks.flatMap((task) => {
        const match = matchFields([{ text: task.title, primary: true }], tokens, task.folded);
        return match ? [{ item: task, match, at: task.at }] : [];
      }),
    );
    const matchedArtifacts = rank(
      artifactEntries.flatMap((artifact) => {
        const match = matchFields(
          [{ text: artifact.item.name, primary: true }, { text: artifact.item.taskName }],
          tokens,
          artifact.folded,
        );
        return match ? [{ item: artifact, match, at: artifact.at }] : [];
      }),
    );
    // Tasks matched by their messages come after the title matches (once each)
    const byTitle = new Set(matchedTasks.map((m) => m.item.session.sessionId));
    const tasksById = new Map(tasks.map((t) => [t.session.sessionId, t]));
    const messageMatches = liveHits.flatMap((hit) => {
      const task = tasksById.get(hit.task);
      return task && !byTitle.has(hit.task) ? [{ task, hit }] : [];
    });
    type TaskMatch = { row: Row; waiting: boolean };
    const allTaskMatches: TaskMatch[] = [
      ...matchedTasks.map((m) => ({ row: taskRow(m.item, m.match), waiting: waiting.has(m.item.session.sessionId) })),
      ...messageMatches.map(({ task, hit }) => ({ row: { ...taskRow(task), hit }, waiting: waiting.has(task.session.sessionId) })),
    ];
    const waitingMatches = allTaskMatches.filter((m) => m.waiting);
    const taskMatches = allTaskMatches.filter((m) => !m.waiting);
    const taskTotal = allTaskMatches.length;

    if (tab !== "artifacts") push("needs", "Needs you", waitingMatches.map((m) => m.row));
    if (tab === "all") {
      const capped = <T,>(key: string, label: string, list: T[], toRow: (e: T) => Row, more: Tab, total: number, noun: string) => {
        const rows = list.slice(0, PER_SECTION).map(toRow);
        if (list.length > PER_SECTION) rows.push({ kind: "more", key: `more:${key}`, tab: more, label: `Show all ${total} ${noun}` });
        push(key, label, rows);
      };
      capped("tasks", "Tasks", taskMatches, (m) => m.row, "tasks", taskTotal, "tasks");
      capped("artifacts", "Artifacts", matchedArtifacts, (m) => artifactRow(m.item, m.match), "artifacts", matchedArtifacts.length, "artifacts");
      const matchedActions = actions.flatMap((action, i) => {
        const match = matchFields([{ text: action.label, primary: true }], tokens, foldedActions[i]);
        return match ? [{ kind: "action" as const, key: `x:${action.id}`, action, match }] : [];
      });
      push("actions", "Actions", matchedActions);
    } else if (tab === "tasks") {
      push("tasks", "Tasks", taskMatches.map((m) => m.row));
    } else {
      push("artifacts", "Artifacts", matchedArtifacts.map((m) => artifactRow(m.item, m.match)));
    }
    return { sections: out, taskCount: taskTotal, artifactCount: matchedArtifacts.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, tokens, tab, tasks, artifactEntries, waiting, actions, foldedActions, taskRow, now, shown, liveHits]);

  // Nothing found: say what was searched, offer a task named for the query
  const noResults = searching && sections.length === 0;
  const artifactsLoading = tab === "artifacts" && artifacts === null && !artifactsFailed;
  const displaySections: Section[] = noResults
    ? [{ key: "none", label: "", rows: [{ kind: "new-task", key: "new-task" }, { kind: "clear", key: "clear" }] }]
    : sections;
  const rows = useMemo(() => displaySections.flatMap((s) => s.rows), [displaySections]);

  // Typing or switching tabs starts again from the top
  useEffect(() => {
    setActive(0);
    setShown(TAB_PAGE);
  }, [query, tab]);
  const activeIndex = Math.min(active, Math.max(0, rows.length - 1));
  const activeRow = rows[activeIndex];

  // Keep the selected row in view (with its section's header when it is the first row)
  useEffect(() => {
    const list = listRef.current;
    if (!list || !activeRow) return;
    const el = list.querySelector<HTMLElement>(`[data-row="${CSS.escape(activeRow.key)}"]`);
    if (!el) return;
    const header = el.dataset.first === "true" ? el.parentElement?.querySelector<HTMLElement>("[data-section-header]") : null;
    (header ?? el).scrollIntoView({ block: "nearest" });
    if (header) el.scrollIntoView({ block: "nearest" });
  }, [activeRow]);

  // ── Choosing ──
  const choose = (row: Row | undefined) => {
    if (!row) return;
    switch (row.kind) {
      case "task":
        finish(() => {
          // Opening never un-settles a task; only sending to it does.
          // A message match scrolls to that message once the task is open.
          if (row.hit) {
            const [start, end] = row.hit.ranges[0] ?? [0, 0];
            messageReveal.request(row.task.session.sessionId, row.hit.messageId, row.hit.snippet.slice(start, end) || undefined);
          }
          openSession(row.task.session.sessionId).then(focusOpenedTask, () => toast.error("Couldn’t open the task. Try again."));
          goHome();
        }, () => {});
        break;
      case "artifact": {
        const { item } = row.artifact;
        finish(() => {
          openSession(item.sessionId).then(
            () => {
              if (item.exists) openArtifactInPanel(item.sessionId, item.path);
              focusOpenedTask();
            },
            () => toast.error("Couldn’t open the task. Try again."),
          );
          goHome();
        }, () => {});
        break;
      }
      case "action":
        row.action.run();
        break;
      case "more":
        if (row.page) setShown((n) => n + TAB_PAGE);
        else setTab(row.tab);
        break;
      case "new-task": {
        const text = query.trim();
        // The home composer gets the query, unsent
        finish(() => {
          clearActiveSession();
          navigate("/", { state: { artifactStarter: text } });
        }, () => {});
        break;
      }
      case "clear":
        setQuery("");
        inputRef.current?.focus();
        break;
    }
  };

  const chooseRef = useRef(choose);
  chooseRef.current = choose;

  const switchTab = (step: 1 | -1) => {
    const i = TABS.findIndex((t) => t.id === tab);
    setTab(TABS[(i + step + TABS.length) % TABS.length].id);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    const input = e.currentTarget;
    const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
    const atEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
    let handled = true;
    if (e.key === "ArrowDown") setActive(Math.min(rows.length - 1, activeIndex + 1));
    else if (e.key === "ArrowUp") setActive(Math.max(0, activeIndex - 1));
    else if (e.key === "Enter") choose(activeRow);
    else if (e.key === "Tab") switchTab(e.shiftKey ? -1 : 1);
    else if (e.key === "ArrowLeft" && atStart && !e.shiftKey) switchTab(-1);
    else if (e.key === "ArrowRight" && atEnd && !e.shiftKey) switchTab(1);
    else handled = false;
    if (handled) e.preventDefault();
    // Keys typed here are the search window's: listeners on the page behind
    // (a docked question's ↑↓ and 1–4) never see them. The app-wide
    // shortcuts that work over dialogs (⌘K, ⌘N, ⌘, and ⌘/) still do.
    if (matchShortcut(e.nativeEvent)?.inDialogs) return;
    e.stopPropagation();
  };

  const optionId = (key: string) => `${listboxId}-${key}`;
  const placeholder = TABS.find((t) => t.id === tab)!.placeholder;
  const counts: Record<Tab, number | null> = { all: null, tasks: searching ? taskCount : null, artifacts: searching ? artifactCount : null };

  // The list is memoised so a stream flush elsewhere doesn't redraw it
  const list = useMemo(() => {
    const noun = tab === "tasks" ? "tasks" : tab === "artifacts" ? "artifacts" : "tasks or artifacts";
    const searched = [
      tab !== "artifacts" && `${plural(tasks.length, "task", "tasks")}, settled ones included`,
      tab !== "tasks" && artifacts && plural(artifactEntries.length, "artifact", "artifacts"),
    ].filter(Boolean);
    return (
      <>
        {noResults && (
          <div className="flex flex-col items-center gap-1 px-6 pt-9 pb-7 text-center" data-testid="search-no-results">
            <p className="text-sm font-medium text-foreground">
              No {noun} match “{query.trim()}”
            </p>
            <p className="text-meta text-foreground-secondary">Searched {searched.join(", and ")}.</p>
          </div>
        )}
        {artifactsLoading ? (
          <div aria-busy="true" aria-label="Loading artifacts">
            <div className="flex h-[30px] items-center px-3">
              <Skeleton className="h-3 w-16 rounded-sm" />
            </div>
            {[62, 48, 70, 54].map((w) => (
              <div key={w} className="flex h-9 items-center gap-3 px-3">
                <Skeleton className="size-5 rounded-[5px]" />
                <Skeleton className="h-3 rounded-sm" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
        ) : tab === "artifacts" && artifactsFailed ? (
          <div className="flex flex-col items-start gap-1 px-3 py-3">
            <p className="text-sm text-foreground">Couldn’t load artifacts.</p>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={loadArtifacts} className="rounded-sm text-meta text-foreground-secondary outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
              Try again
            </button>
          </div>
        ) : tab === "artifacts" && !searching && artifactEntries.length === 0 ? (
          <p className="px-3 py-3 text-meta text-foreground-secondary">Files your tasks make will appear here.</p>
        ) : (
          displaySections.map((section, s) => (
            <div
              key={section.key}
              role="group"
              aria-label={section.label || undefined}
              className={cn(
                "flex flex-col",
                section.key === "needs" && "gap-0.5",
                s > 0 && !noResults && "pt-1.5",
                noResults && "border-t border-border pt-1.5",
              )}
            >
              {section.label && (
                <div data-section-header className="flex h-[30px] shrink-0 items-center px-3 text-xs font-medium text-foreground-secondary" aria-hidden>
                  {section.label}
                </div>
              )}
              {section.rows.map((row, r) => (
                <ResultRow
                  key={row.key}
                  row={row}
                  first={r === 0}
                  id={optionId(row.key)}
                  selected={activeRow?.key === row.key}
                  now={now}
                  query={query.trim()}
                  onHover={() => setActive(rows.indexOf(row))}
                  onChoose={() => chooseRef.current(row)}
                />
              ))}
            </div>
          ))
        )}
      </>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displaySections, activeRow?.key, noResults, artifactsLoading, artifactsFailed, tab, searching, artifactEntries.length, tasks.length, artifacts, query, rows]);

  return (
    <DialogContent
      hideClose
      aria-describedby={undefined}
      data-testid="search-window"
      className="top-[104px] flex w-[min(680px,calc(100%-2rem))] max-w-none translate-y-0 flex-col gap-0 p-0"
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        inputRef.current?.focus();
      }}
      onCloseAutoFocus={(e) => {
        e.preventDefault();
        const then = afterClose.current;
        afterClose.current = null;
        const previous = searchWindow.takeReturnFocus();
        // Chosen: the destination takes focus. Dismissed: back to where it was.
        if (then) requestAnimationFrame(then);
        else previous?.focus({ preventScroll: true });
      }}
      // Escape closes this window only (the page behind has its own Escape)
      onEscapeKeyDown={(e) => e.stopPropagation()}
    >
      <DialogTitle className="sr-only">Search</DialogTitle>

      {/* The field */}
      <div className="flex h-14 shrink-0 items-center gap-3 pr-4 pl-5">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded
          aria-controls={listboxId}
          aria-activedescendant={activeRow ? optionId(activeRow.key) : undefined}
          aria-autocomplete="list"
          aria-label={placeholder.replace("…", "")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          data-testid="search-input"
          className="h-14 min-w-0 flex-1 bg-transparent text-prose leading-6 text-foreground placeholder:text-faint focus:outline-none"
        />
        <span className="kbd" aria-hidden>esc</span>
      </div>

      {/* Tabs (focus stays in the field; Tab, ←→ at the field's ends, or a click switch them) */}
      <div role="tablist" aria-label="Search in" className="flex shrink-0 items-center gap-0.5 border-b border-border px-3 pb-2.5">
        {TABS.map((t) => {
          const selected = t.id === tab;
          const count = counts[t.id];
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              tabIndex={-1}
              aria-selected={selected}
              aria-controls={listboxId}
              data-testid={`search-tab-${t.id}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setTab(t.id)}
              className={cn(
                "relative flex h-7 cursor-pointer items-center rounded-md px-2.5 text-meta leading-[18px] transition-colors outline-none",
                selected ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {selected && (
                <motion.span
                  layoutId="search-tab-fill"
                  className="absolute inset-0 rounded-md bg-secondary"
                  transition={{ duration: 0.22, ease: EASE_DRAWER }}
                />
              )}
              <span className="relative">
                {t.label}
                {count !== null && <span className="font-normal text-faint"> {count}</span>}
              </span>
            </button>
          );
        })}
      </div>

      {/* Results */}
      <ScrollArea
        type="scroll"
        viewportRef={listRef}
        viewportClassName="overscroll-contain"
        viewportStyle={{ maxHeight: `min(${LIST_MAX}px, calc(100vh - 104px - 135px - 24px))` }}
      >
        <div id={listboxId} role="listbox" aria-label="Results" className="flex flex-col px-2 pt-1.5 pb-2" data-testid="search-results">
          {list}
        </div>
      </ScrollArea>

      {/* Keys */}
      <div className="flex h-10 shrink-0 items-center gap-4 border-t border-border bg-background px-5 text-xs text-foreground-secondary" aria-hidden>
        <Hint chord="↑↓" label="to move" />
        <Hint chord="↵" label="to open" />
        <Hint chord="esc" label="to close" />
        <span className="flex-1" />
        <Hint chord="⌘K" label="to search from anywhere" />
      </div>
    </DialogContent>
  );
};

/**
 * After opening a task or going home: focus what answers the keyboard there,
 * the prompt docked in the message box if one waits, else the message box.
 */
function focusOpenedTask() {
  // Once the opened task has rendered
  requestAnimationFrame(() => requestAnimationFrame(focusComposer));
}

function focusComposer() {
  const docked = document.querySelector<HTMLElement>('[data-testid="docked-prompt"] [tabindex="-1"]');
  (docked ?? document.querySelector<HTMLElement>('[data-testid="composer"] [contenteditable="true"]'))?.focus({ preventScroll: true });
}

const Hint: React.FC<{ chord: string; label: string }> = ({ chord, label }) => (
  <span className="flex items-center gap-1.5">
    <span className="kbd bg-foreground/[0.05]">{chord}</span>
    {label}
  </span>
);

/** Text with the matched letters at weight 600. */
const Highlight: React.FC<{ text: string; ranges?: MatchRange[]; hitClassName?: string }> = ({ text, ranges, hitClassName = "font-semibold" }) => (
  <>
    {highlightRuns(text, ranges ?? []).map((run, i) =>
      run.hit ? (
        <span key={i} className={hitClassName}>
          {run.text}
        </span>
      ) : (
        run.text
      ),
    )}
  </>
);

interface ResultRowProps {
  row: Row;
  id: string;
  selected: boolean;
  first: boolean;
  now: number;
  query: string;
  onHover: () => void;
  onChoose: () => void;
}

const ResultRow: React.FC<ResultRowProps> = ({ row, id, selected, first, now, query, onHover, onChoose }) => {
  const waiting = row.kind === "task" ? row.waiting : undefined;
  const hit = row.kind === "task" ? row.hit : undefined;
  const enterKey = <span className={cn("kbd", waiting ? "bg-popover/70" : "bg-popover")}>↵</span>;

  let leading: React.ReactNode = null;
  let title: React.ReactNode;
  let meta: React.ReactNode = null;
  let trailing: React.ReactNode = null;
  let tooltip: string | undefined;

  switch (row.kind) {
    case "task": {
      const { session, title: name, at } = row.task;
      const folder = session.workingFolder ? pathBaseName(session.workingFolder) : null;
      leading = session.workingFolder ? <FolderBadge path={session.workingFolder} /> : null;
      title = <Highlight text={name} ranges={row.match?.fields[0].ranges} />;
      const settled = Boolean(session.settledAt);
      meta = (folder || settled) && (
        <>
          {folder}
          {folder && settled && " · "}
          {settled && <span data-testid="search-settled">Settled</span>}
        </>
      );
      trailing = when(at, now);
      tooltip = [name, session.workingFolder ? `In ${folder} (${session.workingFolder})` : ""].filter(Boolean).join("\n");
      break;
    }
    case "artifact": {
      const { item, folder } = row.artifact;
      const Icon = resolveArtifactType(item.name)?.icon ?? FileText;
      leading = <ArtifactTypeChip fileName={item.name} icon={Icon} size="sm" />;
      title = <Highlight text={item.name} ranges={row.match?.fields[0].ranges} />;
      const fromTask = row.match?.fields[1].ranges ?? [];
      // A match in the task's name says so; otherwise "Type · folder"
      meta =
        fromTask.length > 0 ? (
          <>
            {fileKind(item.name)} · from “<Highlight text={item.taskName} ranges={fromTask} />”
          </>
        ) : (
          `${fileKind(item.name)} · ${folder ? pathBaseName(folder) : "no folder"}`
        );
      trailing = item.exists ? when(row.artifact.at, now) : "Missing";
      tooltip = `${item.name}\nFrom “${item.taskName}”${item.taskSettled ? " (settled)" : ""}\n${item.path}`;
      break;
    }
    case "action": {
      const Icon = row.action.icon;
      leading = <Icon className="size-4 text-foreground/70" />;
      title = <Highlight text={row.action.label} ranges={row.match?.fields[0].ranges} />;
      meta = row.action.value;
      trailing = row.action.chord ? <span className="kbd">{row.action.chord}</span> : null;
      break;
    }
    case "more":
      title = <span className="text-meta text-foreground-secondary">{row.label}</span>;
      break;
    case "new-task":
      leading = <Plus className="size-4 text-foreground/70" />;
      title = `New task: “${query}”`;
      break;
    case "clear":
      leading = <X className="size-4 text-foreground/70" />;
      title = "Clear search";
      break;
  }

  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      data-row={row.key}
      data-first={first ? "true" : undefined}
      data-kind={row.kind}
      data-testid="search-row"
      title={tooltip}
      onMouseMove={() => !selected && onHover()}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onChoose}
      className={cn(
        "flex shrink-0 cursor-pointer items-center gap-3 rounded-[10px] px-3 text-sm leading-5 text-foreground",
        waiting || hit ? "h-[52px]" : "h-9",
        waiting ? (selected ? "bg-warning-selected" : "bg-warning-muted") : selected && "bg-secondary",
      )}
    >
      <span className="flex size-5 shrink-0 items-center justify-center">{leading}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 truncate whitespace-pre">{title}</span>
          {meta && <span className="max-w-[45%] shrink-0 truncate text-meta leading-[18px] text-foreground-secondary">{meta}</span>}
        </span>
        {hit && !waiting && (
          <span className="min-w-0 truncate whitespace-pre text-meta leading-[18px] text-foreground-secondary" data-testid="search-snippet">
            “{hit.cutStart && "…"}
            <Highlight text={hit.snippet} ranges={hit.ranges} hitClassName="font-semibold text-foreground" />
            {hit.cutEnd && "…"}”
          </span>
        )}
        {waiting && (
          <span className="flex min-w-0 items-center gap-1.5 text-meta leading-[18px] text-foreground/80" data-testid="search-needs-you">
            <span className="size-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
            <span className="truncate">
              Needs your {waiting.kind}
              {waiting.detail && ` · ${waiting.detail}`}
            </span>
          </span>
        )}
      </span>
      <span className="flex w-[72px] shrink-0 items-center justify-end text-meta leading-[18px] text-foreground-secondary">
        {selected ? enterKey : trailing}
      </span>
    </div>
  );
};
