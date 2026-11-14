import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorState, TextSelection, type Transaction } from "prosemirror-state";
import { parseMarkdown } from "../markdown/parse";
import { AUTOSAVE_MS, DocSession, type SessionStatus } from "../session";
import { find } from "./helpers";

function setup(initial: string) {
  const disk = { text: initial, modifiedMs: 1000 };
  const writes: string[] = [];
  const io = {
    read: vi.fn(async () => ({ ...disk })),
    write: vi.fn(async (text: string) => {
      writes.push(text);
      disk.text = text;
      disk.modifiedMs += 1;
      return { modifiedMs: disk.modifiedMs };
    }),
  };
  const { doc, map } = parseMarkdown(initial);
  let state = EditorState.create({ doc });
  const statuses: SessionStatus[] = [];
  const dirty: boolean[] = [];
  const conflicts: number[] = [];
  // eslint-disable-next-line prefer-const
  let session: DocSession;
  const host = {
    getState: () => state,
    dispatch: (tr: Transaction) => {
      state = state.apply(tr);
      session.onTransaction(tr);
    },
    onStatus: (s: SessionStatus) => statuses.push(s),
    onDirtyChange: (d: boolean) => dirty.push(d),
    onConflict: (i: { diskModifiedMs: number }) => conflicts.push(i.diskModifiedMs),
  };
  session = new DocSession(io, host, initial, map, doc, disk.modifiedMs);
  const type = (after: string, text: string) => {
    const { to } = find(state.doc, after);
    host.dispatch(state.tr.insertText(text, to));
  };
  /** Simulate another program writing the file */
  const externalWrite = (text: string) => {
    disk.text = text;
    disk.modifiedMs += 1000;
    return disk.modifiedMs;
  };
  return { io, disk, writes, session, host, type, externalWrite, dirty, conflicts, statuses, getState: () => state };
}

describe("DocSession", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("autosaves once, shortly after typing stops, with only the edit changed", async () => {
    const md = "# Title\n\nFirst paragraph.\n\n* keep\n* this\n";
    const t = setup(md);
    t.type("First", " edited");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 100);
    t.type("edited", "!");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 100);
    expect(t.writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(t.writes).toEqual(["# Title\n\nFirst edited! paragraph.\n\n* keep\n* this\n"]);
    expect(t.dirty).toEqual([true, false]);
  });

  it("never writes when nothing changed (including edit + undo)", async () => {
    const md = "Hello *world*\n";
    const t = setup(md);
    await t.session.flush();
    const before = t.getState();
    t.type("Hello", "X");
    // Undo by restoring the original document content
    t.host.dispatch(t.getState().tr.delete(6, 7));
    expect(t.getState().doc.eq(before.doc)).toBe(true);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS + 10);
    expect(t.writes).toEqual([]);
    expect(t.dirty).toEqual([true, false]);
  });

  it("flush saves immediately (blur/unmount)", async () => {
    const t = setup("a\n");
    t.type("a", "b");
    await t.session.flush();
    expect(t.writes).toEqual(["ab\n"]);
  });

  it("ignores the change event caused by its own write", async () => {
    const t = setup("a\n");
    t.type("a", "b");
    await t.session.flush();
    await t.session.diskModified(t.disk.modifiedMs);
    expect(t.io.read).not.toHaveBeenCalled();
    // Even if the watcher reports a different time, identical content is not a reload
    await t.session.diskModified(t.disk.modifiedMs + 5);
    expect(t.conflicts).toEqual([]);
  });

  it("reloads in place when clean, keeping the cursor", async () => {
    const t = setup("# Title\n\nFirst paragraph.\n\nSecond paragraph.\n");
    const { from } = find(t.getState().doc, "Second");
    t.host.dispatch(t.getState().tr.setSelection(TextSelection.create(t.getState().doc, from + 3)));
    const ms = t.externalWrite("# New title\n\nFirst paragraph.\n\nSecond paragraph.\n");
    await t.session.diskModified(ms);
    const state = t.getState();
    expect(state.doc.child(0).textContent).toBe("New title");
    // Cursor still inside "Second", shifted by the 4 inserted characters
    expect(state.selection.from).toBe(from + 3 + 4);
    expect(t.writes).toEqual([]);
    expect(t.session.status.dirty).toBe(false);
    // A later edit only changes its own lines against the reloaded file
    t.type("Second", "!");
    await t.session.flush();
    expect(t.writes).toEqual(["# New title\n\nFirst paragraph.\n\nSecond! paragraph.\n"]);
  });

  it("keeps the user's text and reports a conflict when dirty", async () => {
    const t = setup("Line one.\n");
    t.type("Line", " ONE");
    const ms = t.externalWrite("Agent rewrote this.\n");
    await t.session.diskModified(ms);
    expect(t.conflicts).toEqual([ms]);
    expect(t.getState().doc.textContent).toBe("Line ONE one.");
    // Autosave is paused during the conflict
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 3);
    expect(t.writes).toEqual([]);
    expect(t.disk.text).toBe("Agent rewrote this.\n");
  });

  it("conflict: Reload from disk discards local edits", async () => {
    const t = setup("Line one.\n");
    t.type("Line", " ONE");
    await t.session.diskModified(t.externalWrite("Agent rewrote this.\n"));
    await t.session.reloadFromDisk();
    expect(t.getState().doc.textContent).toBe("Agent rewrote this.");
    expect(t.session.status.conflict).toBe(null);
    expect(t.session.status.dirty).toBe(false);
    expect(t.writes).toEqual([]);
  });

  it("conflict: Keep mine writes the user's version", async () => {
    const t = setup("Line one.\n\nOther.\n");
    t.type("Line", " ONE");
    await t.session.diskModified(t.externalWrite("Agent rewrote this.\n"));
    await t.session.keepMine();
    expect(t.writes).toEqual(["Line ONE one.\n\nOther.\n"]);
    expect(t.session.status.conflict).toBe(null);
    expect(t.session.status.dirty).toBe(false);
  });

  it("an outside change during the debounce window is a conflict, not a silent overwrite", async () => {
    const t = setup("Text.\n");
    t.type("Text", "s");
    await vi.advanceTimersByTimeAsync(100);
    await t.session.diskModified(t.externalWrite("Changed by agent.\n"));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 2);
    expect(t.writes).toEqual([]);
    expect(t.conflicts.length).toBe(1);
  });

  it("dispose flushes pending edits", async () => {
    const t = setup("a\n");
    t.type("a", "z");
    t.session.dispose();
    await vi.runAllTimersAsync();
    expect(t.writes).toEqual(["az\n"]);
  });
});
