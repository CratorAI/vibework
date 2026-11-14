// Save/reload bookkeeping of an open board, with a fake editor and disk.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoardSession } from "../session";

function setup() {
  const disk = { text: "v0", modifiedMs: 1 };
  const editor = { text: "v0" as string | null };
  const writes: string[] = [];
  const dirty: boolean[] = [];
  const conflicts: number[] = [];
  const session = new BoardSession({
    read: async () => ({ ...disk }),
    write: async (text) => {
      writes.push(text);
      disk.text = text;
      disk.modifiedMs += 1;
      return { modifiedMs: disk.modifiedMs };
    },
    serialize: () => editor.text,
    apply: (text) => {
      editor.text = text;
    },
    onDirty: (d) => dirty.push(d),
    onConflict: (i) => conflicts.push(i.diskModifiedMs),
  });
  session.loaded(disk.text);
  session.absorb();
  const outside = (text: string) => {
    disk.text = text;
    disk.modifiedMs += 1;
    return session.externalChange(disk.modifiedMs);
  };
  return { disk, editor, writes, dirty, conflicts, session, outside };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("BoardSession", () => {
  it("saves once, about 800ms after the last change", async () => {
    const t = setup();
    t.editor.text = "v1";
    t.session.changed();
    await vi.advanceTimersByTimeAsync(500);
    t.editor.text = "v2";
    t.session.changed();
    await vi.advanceTimersByTimeAsync(700);
    expect(t.writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(t.writes).toEqual(["v2"]);
    expect(t.dirty).toEqual([true, false]);
  });

  it("never writes when the content is back to what was loaded", async () => {
    const t = setup();
    t.editor.text = "v1";
    t.session.changed();
    t.editor.text = "v0"; // undo
    t.session.changed();
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.writes).toEqual([]);
    expect(t.session.dirty).toBe(false);
  });

  it("absorbs changes the editor makes on its own", async () => {
    const t = setup();
    t.editor.text = "v0-normalised";
    t.session.absorb();
    await t.session.flush();
    expect(t.writes).toEqual([]);
    expect(t.session.dirty).toBe(false);
  });

  it("ignores the change notification for its own write", async () => {
    const t = setup();
    t.editor.text = "mine";
    t.session.changed();
    await t.session.flush();
    const applied = vi.fn();
    await t.session.externalChange(t.disk.modifiedMs);
    expect(applied).not.toHaveBeenCalled();
    expect(t.editor.text).toBe("mine");
    expect(t.conflicts).toEqual([]);
  });

  it("applies an outside change when there are no unsaved edits", async () => {
    const t = setup();
    await t.outside("agent");
    expect(t.editor.text).toBe("agent");
    expect(t.session.dirty).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.writes).toEqual([]);
  });

  it("with unsaved edits: keeps them, reports a conflict, pauses saving; reload takes the disk", async () => {
    const t = setup();
    t.editor.text = "mine";
    t.session.changed();
    await t.outside("agent");
    expect(t.editor.text).toBe("mine");
    expect(t.conflicts.length).toBe(1);
    expect(t.session.conflict?.text).toBe("agent");
    await vi.advanceTimersByTimeAsync(2000);
    expect(t.writes).toEqual([]);
    t.session.reloadFromDisk();
    expect(t.editor.text).toBe("agent");
    expect(t.session.dirty).toBe(false);
    expect(t.session.conflict).toBeNull();
  });

  it("keep mine writes the person's version over the disk", async () => {
    const t = setup();
    t.editor.text = "mine";
    t.session.changed();
    await t.outside("agent");
    await t.session.keepMine();
    expect(t.writes).toEqual(["mine"]);
    expect(t.disk.text).toBe("mine");
    expect(t.session.dirty).toBe(false);
  });

  it("flush saves immediately (blur, agent turn starting)", async () => {
    const t = setup();
    t.editor.text = "v1";
    t.session.changed();
    await t.session.flush();
    expect(t.writes).toEqual(["v1"]);
  });
});
