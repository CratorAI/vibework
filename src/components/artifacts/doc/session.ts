/**
 * Load/save/reload logic for one open Doc, independent of React and of Tauri
 * so it can be unit-tested.
 *
 * - Autosave: `AUTOSAVE_MS` after the last edit, and on `flush()` (blur, unmount).
 *   Nothing is written when the Markdown would be identical to the file.
 * - Outside change (`diskModified`): if there are no unsaved edits the new file
 *   is applied in place as a minimal replace (cursor and scroll survive outside
 *   the changed region); otherwise the user's text stays, autosave pauses and
 *   the host is told about the conflict until `reloadFromDisk()` or `keepMine()`.
 */

import type { Node as PMNode } from "prosemirror-model";
import type { EditorState, Transaction } from "prosemirror-state";
import { parseMarkdown, type SourceMap } from "./markdown/parse";
import { serializeMarkdown } from "./markdown/serialize";

export const AUTOSAVE_MS = 800;

/** Transaction meta key marking a reload from disk (not a user edit) */
export const EXTERNAL = "vibework-doc-external";

export interface DocIO {
  read(): Promise<{ text: string; modifiedMs: number }>;
  write(text: string): Promise<{ modifiedMs: number }>;
}

export interface SessionStatus {
  dirty: boolean;
  saving: boolean;
  /** The file changed on disk while there were unsaved edits */
  conflict: { modifiedMs: number } | null;
  /** Last save or reload error, cleared by the next success */
  error: string | null;
}

export interface SessionHost {
  getState(): EditorState;
  dispatch(tr: Transaction): void;
  onStatus(status: SessionStatus): void;
  onDirtyChange?(dirty: boolean): void;
  onConflict?(info: { diskModifiedMs: number }): void;
}

function errorMessage(err: unknown): string {
  if (typeof err === "object" && err && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

/** Replace only the part of `state.doc` that differs from `next` */
export function replaceWithMinimalDiff(state: EditorState, next: PMNode): Transaction {
  const tr = state.tr;
  const a = state.doc.content;
  const b = next.content;
  const start = a.findDiffStart(b);
  if (start === null) return tr;
  let end = a.findDiffEnd(b);
  if (!end) return tr;
  // Overlap happens when the changed region is a repetition; clamp both ends.
  let { a: endA, b: endB } = end;
  const overlap = start - Math.min(endA, endB);
  if (overlap > 0) {
    endA += overlap;
    endB += overlap;
  }
  end = { a: endA, b: endB };
  tr.replace(start, end.a, next.slice(start, end.b));
  return tr;
}

export class DocSession {
  private map: SourceMap;
  /** Text known to be on disk */
  private diskText: string;
  /** Text being written right now */
  private pendingText: string | null = null;
  private savedDoc: PMNode;
  private lastWrittenMs: number | null = null;
  private knownDiskMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> | null = null;
  private conflict: { text: string; modifiedMs: number } | null = null;
  private error: string | null = null;
  private reportedDirty = false;
  private disposed = false;

  constructor(
    private io: DocIO,
    private host: SessionHost,
    text: string,
    map: SourceMap,
    doc: PMNode,
    modifiedMs: number,
  ) {
    this.diskText = text;
    this.map = map;
    this.savedDoc = doc;
    this.knownDiskMs = modifiedMs;
  }

  get status(): SessionStatus {
    return {
      dirty: this.isDirty(),
      saving: this.saving !== null,
      conflict: this.conflict ? { modifiedMs: this.conflict.modifiedMs } : null,
      error: this.error,
    };
  }

  /** The Markdown the document would be saved as right now */
  currentMarkdown(): string {
    return serializeMarkdown(this.host.getState().doc, this.map).text;
  }

  private isDirty() {
    return this.host.getState().doc !== this.savedDoc;
  }

  private emit() {
    const dirty = this.isDirty() || this.conflict !== null;
    if (dirty !== this.reportedDirty) {
      this.reportedDirty = dirty;
      this.host.onDirtyChange?.(dirty);
    }
    this.host.onStatus(this.status);
  }

  /** Call after every transaction the editor applies */
  onTransaction(tr: Transaction) {
    if (!tr.docChanged || tr.getMeta(EXTERNAL)) return;
    this.schedule();
    this.emit();
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, AUTOSAVE_MS);
  }

  /** Save now if there are unsaved edits (no-op during a conflict) */
  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.saving) {
      // Chain: save again after the current write if more edits arrived.
      return this.saving.then(() => (this.isDirty() ? this.flush() : undefined));
    }
    if (!this.isDirty() || this.conflict) return Promise.resolve();
    this.saving = this.save().finally(() => {
      this.saving = null;
      this.emit();
    });
    this.emit();
    return this.saving;
  }

  private async save() {
    const doc = this.host.getState().doc;
    const result = serializeMarkdown(doc, this.map);
    if (result.text === this.diskText) {
      this.map = result.map;
      this.savedDoc = doc;
      return;
    }
    this.pendingText = result.text;
    try {
      const stat = await this.io.write(result.text);
      this.diskText = result.text;
      this.lastWrittenMs = stat.modifiedMs;
      this.knownDiskMs = stat.modifiedMs;
      this.map = result.map;
      this.savedDoc = doc;
      this.error = null;
    } catch (err) {
      this.error = `Could not save: ${errorMessage(err)}`;
    } finally {
      this.pendingText = null;
    }
    if (this.isDirty() && !this.disposed) this.schedule();
  }

  /** The panel reports a new modification time for the file */
  async diskModified(modifiedMs: number): Promise<void> {
    if (this.disposed) return;
    if (modifiedMs === this.lastWrittenMs || modifiedMs === this.knownDiskMs) return;
    let file: { text: string; modifiedMs: number };
    try {
      file = await this.io.read();
    } catch (err) {
      this.error = `Could not read the file: ${errorMessage(err)}`;
      this.emit();
      return;
    }
    this.knownDiskMs = file.modifiedMs;
    // Our own write (the watcher can report it before the write call returns), or a touch.
    if (file.text === this.diskText || file.text === this.pendingText) return;
    if (this.isDirty() || this.pendingText !== null || this.saving) {
      this.conflict = { text: file.text, modifiedMs: file.modifiedMs };
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      this.emit();
      this.host.onConflict?.({ diskModifiedMs: file.modifiedMs });
      return;
    }
    this.applyExternal(file.text);
  }

  private applyExternal(text: string) {
    const parsed = parseMarkdown(text);
    const tr = replaceWithMinimalDiff(this.host.getState(), parsed.doc);
    tr.setMeta(EXTERNAL, true);
    tr.setMeta("addToHistory", false);
    if (tr.docChanged) this.host.dispatch(tr);
    const doc = this.host.getState().doc;
    // The editor now equals the parsed document; point the source map at its nodes.
    const map = parsed.map;
    if (map.blocks.length === doc.childCount) {
      map.blocks = map.blocks.map((b, i) => ({ node: doc.child(i), text: b.text }));
    }
    this.map = map;
    this.diskText = text;
    this.savedDoc = doc;
    this.conflict = null;
    this.error = null;
    this.emit();
  }

  /** Conflict resolution: discard the user's edits and show the file */
  async reloadFromDisk(): Promise<void> {
    try {
      const file = await this.io.read();
      this.knownDiskMs = file.modifiedMs;
      this.applyExternal(file.text);
    } catch (err) {
      this.error = `Could not read the file: ${errorMessage(err)}`;
      this.emit();
    }
  }

  /** Conflict resolution: keep the user's version and write it over the file */
  async keepMine(): Promise<void> {
    const conflict = this.conflict;
    if (!conflict) return;
    this.conflict = null;
    this.diskText = conflict.text;
    this.knownDiskMs = conflict.modifiedMs;
    this.emit();
    if (this.saving) await this.saving;
    this.saving = this.save().finally(() => {
      this.saving = null;
      this.emit();
    });
    this.emit();
    await this.saving;
  }

  /** Unmount: write pending edits without waiting */
  dispose() {
    if (this.disposed) return;
    void this.flush();
    this.disposed = true;
  }
}
