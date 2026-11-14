/**
 * Load, autosave and reload a deck file.
 *
 * - The working copy (`source`) is what the editor shows; `disk` is the last
 *   text read from or written to the file.
 * - Autosave writes `source` when edits settle (debounced), on window blur and
 *   on unmount, and never when nothing changed.
 * - When `modifiedMs` changes to a value this hook did not write, the file is
 *   re-read: with no unsaved edits the deck reloads; with unsaved edits the
 *   user's version stays on screen and `onConflict` is called.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { readArtifact, statArtifact, writeArtifact, isArtifactError } from "@/tauri/artifacts";
import type { ArtifactViewProps } from "../types";

const SAVE_DELAY_MS = 700;
const HISTORY_LIMIT = 100;

export interface Conflict {
  diskModifiedMs: number;
  text: string;
}

export interface DeckFile {
  status: "loading" | "ready" | "error";
  error: string | null;
  source: string;
  dirty: boolean;
  conflict: Conflict | null;
  /** `artifact://` URL of the deck's folder, for relative image paths */
  baseHref: string | null;
  /** Replace the working copy (an edit). Pushes the previous text on the undo stack unless `history` is false. */
  update: (next: string, opts?: { history?: boolean }) => void;
  undo: () => boolean;
  canUndo: boolean;
  reloadFromDisk: () => void;
  keepMine: () => void;
  /** Hold back reloads while the person is typing in the slide */
  setEditing: (on: boolean) => void;
}

function message(err: unknown): string {
  if (isArtifactError(err)) return err.message;
  return err instanceof Error ? err.message : String(err);
}

export function useDeckFile({ artifact, modifiedMs, onDirtyChange, onConflict }: ArtifactViewProps): DeckFile {
  const [status, setStatus] = useState<DeckFile["status"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [disk, setDisk] = useState("");
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [baseHref, setBaseHref] = useState<string | null>(null);
  const [historyLen, setHistoryLen] = useState(0);

  const sourceRef = useRef(source);
  const diskRef = useRef(disk);
  const conflictRef = useRef(conflict);
  const lastWrittenMs = useRef<number | null>(null);
  const saving = useRef<Promise<void> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const history = useRef<string[]>([]);
  const editing = useRef(false);
  const pendingCheck = useRef<number | null>(null);
  const loaded = useRef(false);
  const alive = useRef(true);
  sourceRef.current = source;
  diskRef.current = disk;
  conflictRef.current = conflict;

  const { sessionId, path } = artifact;
  const propsRef = useRef({ onConflict, onDirtyChange });
  propsRef.current = { onConflict, onDirtyChange };

  // ---- save
  const save = useCallback(async (): Promise<void> => {
    if (saving.current) await saving.current.catch(() => {});
    const text = sourceRef.current;
    if (!loaded.current || conflictRef.current || text === diskRef.current) return;
    const run = (async () => {
      const stat = await writeArtifact(sessionId, path, { text });
      lastWrittenMs.current = stat.modifiedMs;
      diskRef.current = text;
      if (alive.current) setDisk(text);
    })();
    saving.current = run;
    try {
      await run;
    } catch (err) {
      console.error("[slides] save failed", err);
      if (alive.current) setError(`Could not save: ${message(err)}`);
    } finally {
      if (saving.current === run) saving.current = null;
    }
  }, [sessionId, path]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void save();
    }, SAVE_DELAY_MS);
  }, [save]);

  const flush = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    return save();
  }, [save]);

  // ---- initial load
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    (async () => {
      try {
        const [file, stat] = await Promise.all([readArtifact(sessionId, path), statArtifact(sessionId, path)]);
        if (cancelled) return;
        if (file.kind !== "text" || file.text === null) throw new Error("This file is not text.");
        const url = stat.url;
        setBaseHref(url.slice(0, url.lastIndexOf("/") + 1));
        lastWrittenMs.current = file.modifiedMs;
        loaded.current = true;
        diskRef.current = file.text;
        sourceRef.current = file.text;
        setDisk(file.text);
        setSource(file.text);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setError(message(err));
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, path]);

  // ---- outside changes
  const checkDisk = useCallback(
    async (ms: number) => {
      if (!loaded.current) return;
      if (saving.current) await saving.current.catch(() => {});
      if (ms === lastWrittenMs.current) return;
      if (editing.current) {
        pendingCheck.current = ms;
        return;
      }
      let file;
      try {
        file = await readArtifact(sessionId, path);
      } catch (err) {
        console.warn("[slides] reload failed", err);
        return;
      }
      if (!alive.current || file.text === null) return;
      lastWrittenMs.current = file.modifiedMs;
      const text = file.text;
      if (text === diskRef.current) return;
      const dirty = sourceRef.current !== diskRef.current;
      if (text === sourceRef.current) {
        diskRef.current = text;
        setDisk(text);
        return;
      }
      if (dirty) {
        const c = { diskModifiedMs: file.modifiedMs, text };
        conflictRef.current = c;
        setConflict(c);
        propsRef.current.onConflict?.({ diskModifiedMs: file.modifiedMs });
        return;
      }
      diskRef.current = text;
      sourceRef.current = text;
      setDisk(text);
      setSource(text);
    },
    [sessionId, path],
  );

  useEffect(() => {
    void checkDisk(modifiedMs);
  }, [modifiedMs, checkDisk]);

  // ---- dirty state for the panel
  const dirty = status === "ready" && source !== disk;
  useEffect(() => {
    propsRef.current.onDirtyChange?.(dirty);
  }, [dirty]);

  // ---- save on blur, hide and unmount
  useEffect(() => {
    const onBlur = () => void flush();
    const onVis = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [flush]);

  useEffect(
    () => () => {
      void flush();
      alive.current = false;
    },
    [flush],
  );

  // ---- edits
  const update = useCallback(
    (next: string, opts?: { history?: boolean }) => {
      const prev = sourceRef.current;
      if (next === prev) return;
      if (opts?.history !== false) {
        history.current.push(prev);
        if (history.current.length > HISTORY_LIMIT) history.current.shift();
        setHistoryLen(history.current.length);
      }
      sourceRef.current = next;
      setSource(next);
      if (!conflictRef.current) scheduleSave();
    },
    [scheduleSave],
  );

  const undo = useCallback(() => {
    const prev = history.current.pop();
    setHistoryLen(history.current.length);
    if (prev === undefined) return false;
    sourceRef.current = prev;
    setSource(prev);
    if (!conflictRef.current) scheduleSave();
    return true;
  }, [scheduleSave]);

  const reloadFromDisk = useCallback(() => {
    const c = conflictRef.current;
    if (!c) return;
    conflictRef.current = null;
    setConflict(null);
    history.current.push(sourceRef.current);
    setHistoryLen(history.current.length);
    diskRef.current = c.text;
    sourceRef.current = c.text;
    setDisk(c.text);
    setSource(c.text);
  }, []);

  const keepMine = useCallback(() => {
    const c = conflictRef.current;
    if (!c) return;
    conflictRef.current = null;
    setConflict(null);
    diskRef.current = c.text;
    setDisk(c.text);
    void flush();
  }, [flush]);

  const setEditing = useCallback(
    (on: boolean) => {
      editing.current = on;
      if (!on && pendingCheck.current !== null) {
        const ms = pendingCheck.current;
        pendingCheck.current = null;
        // let the edit that ended the typing land first
        setTimeout(() => void checkDisk(ms), 0);
      }
    },
    [checkDisk],
  );

  return {
    status,
    error,
    source,
    dirty,
    conflict,
    baseHref,
    update,
    undo,
    canUndo: historyLen > 0,
    reloadFromDisk,
    keepMine,
    setEditing,
  };
}
