/**
 * Save/reload bookkeeping for one open board, independent of the canvas library.
 *
 * - `baseline` is the editor's serialised content at the last load or save; the board is
 *   dirty when the editor's content differs from it. Changes the editor makes on its own
 *   (normalising a loaded file, re-measuring text once fonts load) are absorbed into the
 *   baseline instead of being saved.
 * - Saves are debounced, skipped when nothing differs, and paused while a conflict is open.
 * - An outside change (agent or another app) is applied when there are no unsaved edits;
 *   with unsaved edits it opens a conflict and the person chooses.
 */

export interface SessionDeps {
  read(): Promise<{ text: string; modifiedMs: number }>;
  write(text: string): Promise<{ modifiedMs: number }>;
  /** Current editor content as file text, or null when the editor is not ready */
  serialize(): string | null;
  /** Show this file text in the editor, keeping viewport and selection */
  apply(text: string): void;
  onDirty?(dirty: boolean): void;
  onConflict?(info: { diskModifiedMs: number }): void;
  /** Something the UI shows changed (conflict, error) */
  onState?(): void;
  debounceMs?: number;
}

export interface Conflict {
  text: string;
  modifiedMs: number;
}

export class BoardSession {
  /** Last content known to be on disk (read or written by us) */
  diskText: string | null = null;
  /** Editor content considered clean */
  baseline: string | null = null;
  dirty = false;
  conflict: Conflict | null = null;
  error: string | null = null;
  lastWrittenMs: number | null = null;
  writes = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> | null = null;
  private disposed = false;

  constructor(private deps: SessionDeps) {}

  /** The file was read and handed to the editor. */
  loaded(text: string) {
    this.diskText = text;
    this.baseline = null;
    this.setDirty(false);
  }

  /** The editor changed without the person doing anything: treat the result as clean. */
  absorb() {
    if (this.dirty) return;
    const now = this.deps.serialize();
    if (now !== null) this.baseline = now;
  }

  /** The person changed the board. */
  changed() {
    if (this.baseline === null) {
      // First change before any baseline: the loaded content is the baseline.
      this.absorb();
    }
    this.setDirty(true);
    if (this.conflict) return;
    this.schedule();
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.deps.debounceMs ?? 800);
  }

  /** Save now if there is anything to save. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.writing) await this.writing;
    if (!this.dirty || this.conflict) return;
    const text = this.deps.serialize();
    if (text === null) return;
    if (text === this.baseline || text === this.diskText) {
      this.baseline = text;
      this.setDirty(false);
      return;
    }
    this.writing = (async () => {
      try {
        const stat = await this.deps.write(text);
        this.writes++;
        this.lastWrittenMs = stat.modifiedMs;
        this.diskText = text;
        this.baseline = text;
        if (this.error) {
          this.error = null;
          this.deps.onState?.();
        }
      } catch (e) {
        this.error = describeError(e);
        this.deps.onState?.();
      }
    })();
    await this.writing;
    this.writing = null;
    if (this.error) return;
    // Edits made while writing are still pending.
    const after = this.deps.serialize();
    if (after !== null && after !== this.baseline) {
      if (!this.disposed) this.schedule();
    } else {
      this.setDirty(false);
    }
  }

  /** The file's modification time changed on disk. */
  async externalChange(modifiedMs: number): Promise<void> {
    if (modifiedMs === this.lastWrittenMs) return;
    if (this.writing) await this.writing;
    if (modifiedMs === this.lastWrittenMs) return;
    let disk: { text: string; modifiedMs: number };
    try {
      disk = await this.deps.read();
    } catch (e) {
      this.error = describeError(e);
      this.deps.onState?.();
      return;
    }
    if (this.disposed) return;
    if (disk.text === this.diskText && !this.conflict) return;
    const mine = this.deps.serialize();
    if (disk.text === mine) {
      this.diskText = disk.text;
      this.baseline = mine;
      this.conflict = null;
      this.setDirty(false);
      this.deps.onState?.();
      return;
    }
    if (this.dirty) {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      this.conflict = { text: disk.text, modifiedMs: disk.modifiedMs };
      this.deps.onConflict?.({ diskModifiedMs: disk.modifiedMs });
      this.deps.onState?.();
      return;
    }
    this.applyDisk(disk.text);
  }

  private applyDisk(text: string) {
    this.diskText = text;
    this.deps.apply(text);
    this.baseline = this.deps.serialize();
    this.setDirty(false);
  }

  /** Conflict choice: take the version on disk. */
  reloadFromDisk() {
    if (!this.conflict) return;
    const { text } = this.conflict;
    this.conflict = null;
    this.applyDisk(text);
    this.deps.onState?.();
  }

  /** Conflict choice: keep the person's version and write it over the disk. */
  async keepMine(): Promise<void> {
    if (!this.conflict) return;
    this.diskText = this.conflict.text;
    this.conflict = null;
    this.deps.onState?.();
    this.setDirty(true);
    await this.flush();
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private setDirty(d: boolean) {
    if (this.dirty === d) return;
    this.dirty = d;
    this.deps.onDirty?.(d);
  }
}

function describeError(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}
