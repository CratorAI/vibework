/**
 * Spreadsheet editor for .xlsx, .csv and .tsv artifacts.
 *
 * The grid, toolbar, formula bar and sheet tabs are IronCalc's widget
 * (vendored, themed from our tokens). This component owns the file: loading,
 * change detection, debounced autosave, reloading when the agent rewrites the
 * file, and the conflict and read-only states.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { AlertTriangle, FileWarning, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { isArtifactError, readArtifact, statArtifact, writeArtifact } from "@/tauri/artifacts";
import type { ArtifactViewProps } from "../types";
import "./vendor/ironcalc-workbook/ironcalc.css";
import { IronCalc as IronCalcWidget } from "./vendor/ironcalc-workbook/ironcalc.js";
import { displayModel } from "./displayModel";
import { loadEngine } from "./engine";
import { ironCalcThemeFromTokens } from "./theme";
import {
  bytesToBase64,
  captureView,
  exportXlsx,
  openDocument,
  restoreView,
  serializeDocument,
  takePendingChanges,
  type SheetDocument,
} from "./workbook";

/** The widget re-renders (and re-reads the model) on every parent render otherwise */
const IronCalc = memo(IronCalcWidget);

const MIN_SAVE_DELAY_MS = 1000;
const MAX_SAVE_DELAY_MS = 10_000;
/** How often to look for edits made through paths no DOM event reports (menus, async paste) */
const CHANGE_POLL_MS = 1000;
/** Old models are freed after the widget that used them is gone */
const FREE_DELAY_MS = 3000;

type Status = { kind: "loading" } | { kind: "ready" } | { kind: "error"; message: string };

function errorMessage(err: unknown): string {
  if (isArtifactError(err)) {
    if (err.code === "too_large") return "This file is too large to open here.";
    if (err.code === "not_found") return "The file no longer exists.";
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Light or dark, following the `.dark` class src/lib/theme.ts keeps on <html>. */
function useDarkMode(): boolean {
  const read = () => document.documentElement.classList.contains("dark");
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

export default function SheetEditor({
  artifact,
  modifiedMs,
  onDirtyChange,
  onConflict,
  onOpenArtifact,
}: ArtifactViewProps) {
  const { sessionId, path, name } = artifact;

  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [doc, setDoc] = useState<SheetDocument | null>(null);
  const [docVersion, setDocVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState<{ diskMs: number } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [csvNotice, setCsvNotice] = useState<"hidden" | "shown" | "dismissed">("hidden");
  const [copyState, setCopyState] = useState<{ busy: boolean; message: string | null }>({ busy: false, message: null });
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const dark = useDarkMode();

  const docRef = useRef<SheetDocument | null>(null);
  /** modifiedMs of the file version `doc` corresponds to (as loaded or last saved by us) */
  const baseMtimeRef = useRef<number>(-1);
  const dirtyRef = useRef(false);
  const changeGenRef = useRef(0);
  const conflictRef = useRef<{ diskMs: number } | null>(null);
  const savingRef = useRef<Promise<void> | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const saveCostRef = useRef(0);
  const loadSeqRef = useRef(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** An outside change that arrived while a cell was being typed into; applied when typing ends */
  const deferredDiskMsRef = useRef<number | null>(null);
  const propsRef = useRef({ onDirtyChange, onConflict });
  propsRef.current = { onDirtyChange, onConflict };

  const readOnly = (doc?.unsupported.length ?? 0) > 0;

  const setDirtyState = useCallback((value: boolean) => {
    if (dirtyRef.current === value) return;
    dirtyRef.current = value;
    setDirty(value);
    propsRef.current.onDirtyChange?.(value);
  }, []);

  const clearSaveTimer = () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  };

  const raiseConflict = useCallback((diskMs: number) => {
    clearSaveTimer();
    if (conflictRef.current?.diskMs === diskMs) return;
    conflictRef.current = { diskMs };
    setConflict({ diskMs });
    propsRef.current.onConflict?.({ diskModifiedMs: diskMs });
  }, []);

  const replaceDocument = useCallback((next: SheetDocument, diskMs: number) => {
    const previous = docRef.current;
    takePendingChanges(next.model);
    docRef.current = next;
    baseMtimeRef.current = diskMs;
    changeGenRef.current++;
    setDoc(next);
    setDocVersion((v) => v + 1);
    setDirtyState(false);
    conflictRef.current = null;
    deferredDiskMsRef.current = null;
    setConflict(null);
    setSaveError(null);
    setStatus({ kind: "ready" });
    if (previous) window.setTimeout(() => previous.model.free(), FREE_DELAY_MS);
  }, [setDirtyState]);

  /** Read the file and show it; with `keepView`, the active sheet, selection and scroll stay where they were. */
  const load = useCallback(
    async (keepView: boolean) => {
      const seq = ++loadSeqRef.current;
      clearSaveTimer();
      if (!docRef.current) setStatus({ kind: "loading" });
      try {
        const [file] = await Promise.all([readArtifact(sessionId, path), loadEngine()]);
        if (seq !== loadSeqRef.current) return;
        const next = openDocument(name, file);
        const current = docRef.current;
        if (keepView && current) restoreView(next.model, captureView(current.model));
        replaceDocument(next, file.modifiedMs);
        // a zero-byte .xlsx is a new blank artifact: materialise it as a real workbook
        if (next.format === "xlsx" && file.size === 0) {
          const written = await writeArtifact(sessionId, path, { base64: bytesToBase64(exportXlsx(next.model)) });
          if (docRef.current === next) baseMtimeRef.current = written.modifiedMs;
        }
      } catch (err) {
        if (seq !== loadSeqRef.current) return;
        if (docRef.current && keepView) setSaveError(`Could not reload the file: ${errorMessage(err)}`);
        else setStatus({ kind: "error", message: errorMessage(err) });
      }
    },
    [sessionId, path, name, replaceDocument],
  );

  const loadRef = useRef(load);
  loadRef.current = load;

  const save = useCallback(async (): Promise<void> => {
    clearSaveTimer();
    while (savingRef.current) await savingRef.current.catch(() => {});
    const current = docRef.current;
    if (!current || current.unsupported.length > 0 || !dirtyRef.current || conflictRef.current) return;
    const gen = changeGenRef.current;
    const run = (async () => {
      // the agent (or another app) may have written since we last read or saved
      try {
        const stat = await statArtifact(sessionId, path);
        if (stat.modifiedMs !== baseMtimeRef.current) {
          raiseConflict(stat.modifiedMs);
          return;
        }
      } catch (err) {
        if (!(isArtifactError(err) && err.code === "not_found")) throw err;
      }
      if (docRef.current !== current) return;
      const started = performance.now();
      const contents = serializeDocument(current);
      saveCostRef.current = performance.now() - started;
      const written = await writeArtifact(sessionId, path, contents);
      if (docRef.current !== current) return;
      baseMtimeRef.current = written.modifiedMs;
      setSaveError(null);
      if (changeGenRef.current === gen) setDirtyState(false);
    })();
    savingRef.current = run;
    try {
      await run;
    } catch (err) {
      setSaveError(`Could not save: ${errorMessage(err)}`);
    } finally {
      savingRef.current = null;
    }
    // edits made while saving
    if (dirtyRef.current && !conflictRef.current && docRef.current === current) scheduleSave();
  }, [sessionId, path, raiseConflict, setDirtyState]);

  const saveRef = useRef(save);
  saveRef.current = save;

  /** Debounce: at least a second after edits settle, longer for workbooks that are slow to serialise. */
  function scheduleSave() {
    clearSaveTimer();
    const delay = Math.min(MAX_SAVE_DELAY_MS, Math.max(MIN_SAVE_DELAY_MS, saveCostRef.current * 4));
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void saveRef.current();
    }, delay);
  }

  /** A cell (or the formula bar) is being typed into: its text is not in the model yet. */
  const isTypingInCell = () => {
    const active = document.activeElement;
    return !!active && active.tagName === "TEXTAREA" && !!containerRef.current?.contains(active);
  };

  /** Look at the engine's change queue; selection and scrolling do not count as changes. */
  const checkForChanges = useCallback(() => {
    const current = docRef.current;
    if (!current) return;
    if (current.unsupported.length === 0 && takePendingChanges(current.model)) {
      changeGenRef.current++;
      setDirtyState(true);
      if (current.format === "csv") setCsvNotice((s) => (s === "hidden" ? "shown" : s));
      if (!conflictRef.current) scheduleSave();
    }
    const deferred = deferredDiskMsRef.current;
    if (deferred !== null && !isTypingInCell()) {
      deferredDiskMsRef.current = null;
      if (deferred === baseMtimeRef.current) return;
      if (dirtyRef.current) raiseConflict(deferred);
      else void loadRef.current(true);
    }
  }, [setDirtyState, raiseConflict]);
  const checkForChangesRef = useRef(checkForChanges);
  checkForChangesRef.current = checkForChanges;

  // initial load
  useEffect(() => {
    void load(false);
  }, [load]);

  // the file changed on disk
  useEffect(() => {
    if (status.kind !== "ready") return;
    const handle = () => {
      // pick up edits the change check has not seen yet, so they are not reloaded away
      checkForChangesRef.current();
      if (modifiedMs === baseMtimeRef.current || conflictRef.current?.diskMs === modifiedMs) return;
      if (dirtyRef.current) raiseConflict(modifiedMs);
      else if (isTypingInCell()) deferredDiskMsRef.current = modifiedMs;
      else void load(true);
    };
    // our own save may be in flight: its result tells us whether this change was ours
    if (savingRef.current) void savingRef.current.finally(handle);
    else handle();
  }, [modifiedMs, status.kind]);

  // edits: check right after interactions, and poll for the rest
  useEffect(() => {
    const el = containerRef.current;
    if (!el || status.kind !== "ready") return;
    const soon = () => {
      window.setTimeout(checkForChanges, 0);
      window.setTimeout(checkForChanges, 120);
    };
    const events = ["keyup", "pointerup", "paste", "cut", "drop", "input", "change"] as const;
    for (const e of events) el.addEventListener(e, soon, true);
    const timer = window.setInterval(checkForChanges, CHANGE_POLL_MS);
    return () => {
      for (const e of events) el.removeEventListener(e, soon, true);
      window.clearInterval(timer);
    };
  }, [status.kind, checkForChanges]);

  // Cmd/Ctrl+S saves now (the widget does not use it)
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      checkForChanges();
      if (dirtyRef.current) void save();
    }
  };

  // save when focus leaves the editor
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && containerRef.current?.contains(next)) return;
    checkForChanges();
    if (dirtyRef.current) void save();
  };

  // save on unmount, then free the engine model
  useEffect(() => {
    return () => {
      loadSeqRef.current++;
      clearSaveTimer();
      const current = docRef.current;
      docRef.current = null;
      if (!current) return;
      const free = () => window.setTimeout(() => current.model.free(), FREE_DELAY_MS);
      try {
        if (current.unsupported.length === 0 && !conflictRef.current) {
          if (takePendingChanges(current.model)) dirtyRef.current = true;
          if (dirtyRef.current) {
            const contents = serializeDocument(current);
            void writeArtifact(sessionId, path, contents).catch(() => {}).finally(free);
            return;
          }
        }
      } catch {
        /* fall through to free */
      }
      free();
    };
  }, [sessionId, path]);

  const keepMine = () => {
    const c = conflictRef.current;
    if (!c) return;
    baseMtimeRef.current = c.diskMs;
    conflictRef.current = null;
    setConflict(null);
    void save();
  };

  const reloadFromDisk = () => {
    conflictRef.current = null;
    setConflict(null);
    setDirtyState(false);
    void load(true);
  };

  const editCopy = async () => {
    const current = docRef.current;
    if (!current) return;
    setCopyState({ busy: true, message: null });
    try {
      const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
      const dir = path.slice(0, cut + 1);
      const base = name.replace(/\.[^.]+$/, "");
      let target = "";
      for (let i = 1; i < 100 && !target; i++) {
        const candidate = `${dir}${base} (editable${i > 1 ? ` ${i}` : ""}).xlsx`;
        try {
          await statArtifact(sessionId, candidate);
        } catch (err) {
          if (isArtifactError(err) && err.code === "not_found") target = candidate;
          else throw err;
        }
      }
      if (!target) throw new Error("Could not find a free file name.");
      const written = await writeArtifact(sessionId, target, { base64: bytesToBase64(exportXlsx(current.model)) });
      if (onOpenArtifact) {
        onOpenArtifact(written.path);
        setCopyState({ busy: false, message: null });
      } else {
        setCopyState({ busy: false, message: `Saved an editable copy as ${written.name}.` });
      }
    } catch (err) {
      setCopyState({ busy: false, message: `Could not make a copy: ${errorMessage(err)}` });
    }
  };

  // the grid reads its colours once when it mounts, so a theme switch remounts it (the model keeps the view)
  const themeVariables = useMemo(() => ironCalcThemeFromTokens(), [dark]);
  const shownModel = useMemo(() => {
    if (!doc) return null;
    const css = getComputedStyle(document.documentElement);
    return displayModel(doc.model, dark, {
      background: css.getPropertyValue("--background"),
      foreground: css.getPropertyValue("--foreground"),
    });
  }, [doc, dark]);

  if (status.kind === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <FileWarning className="size-5 text-muted-foreground" />
        <div className="text-ui text-foreground">Couldn't open this spreadsheet</div>
        <div className="max-w-md text-meta text-muted-foreground">{status.message}</div>
        <Button variant="outline" size="sm" onClick={() => void load(false)}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex h-full min-h-0 flex-col bg-background text-foreground"
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      data-sheet-dirty={dirty ? "true" : "false"}
    >
      {conflict && (
        <Bar tone="warning" icon={<AlertTriangle className="size-4" />}>
          <span className="min-w-0 flex-1">This file changed on disk while you had unsaved edits.</span>
          <Button size="sm" variant="outline" onClick={reloadFromDisk}>
            Reload from disk
          </Button>
          <Button size="sm" variant="outline" onClick={keepMine}>
            Keep mine
          </Button>
        </Bar>
      )}
      {readOnly && doc && (
        <Bar tone="info" icon={<Info className="size-4" />}>
          <span className="min-w-0 flex-1">
            Read-only: this workbook has {joinList(doc.unsupported)}, which this editor can't keep. A copy can be
            edited without them.
            {copyState.message && <span className="ml-1 text-muted-foreground">{copyState.message}</span>}
          </span>
          <Button size="sm" variant="outline" disabled={copyState.busy} onClick={() => void editCopy()}>
            Edit a copy
          </Button>
        </Bar>
      )}
      {doc?.format === "csv" && csvNotice === "shown" && !conflict && (
        <Bar tone="muted" icon={<Info className="size-4" />}>
          <span className="min-w-0 flex-1">
            {name.toLowerCase().endsWith(".tsv") ? "TSV" : "CSV"} files keep values only: formulas are saved as their
            results, and formatting and extra sheets are not kept.
          </span>
          <button
            type="button"
            aria-label="Dismiss"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setCsvNotice("dismissed")}
          >
            <X className="size-3.5" />
          </button>
        </Bar>
      )}
      {saveError && !conflict && (
        <Bar tone="destructive" icon={<AlertTriangle className="size-4" />}>
          <span className="min-w-0 flex-1">{saveError}</span>
          <Button size="sm" variant="outline" onClick={() => void save()}>
            Retry
          </Button>
        </Bar>
      )}
      <div ref={setHost} data-shortcut-owner="sheet" className="relative min-h-0 flex-1 overflow-hidden">
        {status.kind === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-meta text-muted-foreground">
            <Spinner /> Opening spreadsheet…
          </div>
        )}
        {shownModel && host && (
          <IronCalc
            key={`${docVersion}:${dark ? "dark" : "light"}`}
            model={shownModel}
            rootContainer={host}
            themeVariables={themeVariables}
            canEdit={!readOnly}
          />
        )}
      </div>
    </div>
  );
}

function Bar({
  tone,
  icon,
  children,
}: {
  tone: "warning" | "info" | "muted" | "destructive";
  icon: ReactNode;
  children: ReactNode;
}) {
  const tones = {
    warning: "bg-warning-muted text-foreground [&>svg]:text-warning",
    info: "bg-info-muted text-foreground [&>svg]:text-info",
    muted: "bg-muted text-foreground [&>svg]:text-muted-foreground",
    destructive: "bg-destructive-muted text-foreground [&>svg]:text-destructive",
  } as const;
  return (
    <div
      role="status"
      className={`flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5 text-meta ${tones[tone]}`}
    >
      {icon}
      {children}
    </div>
  );
}
