import { describe, expect, it } from "vitest";
import {
  EMPTY_TABS,
  activate,
  canonicalizeFile,
  closeTab,
  fileTabId,
  fromStored,
  moveTab,
  newTerminal,
  openFile,
  openTab,
  patchTab,
  terminalLabel,
  toStored,
  type FileTab,
  type TabsState,
  type TerminalTab,
} from "../tabs";

const ids = (s: TabsState) => s.tabs.map((t) => t.id);
const withTerminal = (s: TabsState) => openTab(s, newTerminal(s, "t-s1"));

describe("panel tabs", () => {
  it("opens files once per path, at the end, and focuses them", () => {
    let s = openFile(EMPTY_TABS, "/w/a.md");
    s = openFile(s, "/w/b.xlsx");
    expect(ids(s)).toEqual(["file:/w/a.md", "file:/w/b.xlsx"]);
    expect(s.active).toBe("file:/w/b.xlsx");
    const again = openFile(s, "/w/a.md");
    expect(ids(again)).toEqual(ids(s));
    expect(again.active).toBe("file:/w/a.md");
    expect((again.tabs[0] as FileTab).name).toBe("a.md");
  });

  it("keeps one Files, Browser and Agent commands tab, focusing the open one", () => {
    let s = openTab(EMPTY_TABS, { kind: "browser", id: "browser" });
    s = openFile(s, "/w/a.md");
    s = openTab(s, { kind: "browser", id: "browser" });
    expect(ids(s)).toEqual(["browser", "file:/w/a.md"]);
    expect(s.active).toBe("browser");
  });

  it("always adds a new terminal, numbered Terminal, Terminal 2… reusing freed numbers", () => {
    let s = withTerminal(EMPTY_TABS);
    s = withTerminal(s);
    s = withTerminal(s);
    const terms = s.tabs as TerminalTab[];
    expect(terms.map(terminalLabel)).toEqual(["Terminal", "Terminal 2", "Terminal 3"]);
    expect(terms.map((t) => t.terminalId)).toEqual(["t-s1", "t-s1-2", "t-s1-3"]);
    s = closeTab(s, terms[1].id);
    s = withTerminal(s);
    const last = s.tabs[s.tabs.length - 1] as TerminalTab;
    expect(terminalLabel(last)).toBe("Terminal 2");
    expect(last.terminalId).toBe("t-s1-2");
    expect(s.active).toBe(last.id);
  });

  it("closing the active tab activates its right neighbour, else the left", () => {
    let s = openFile(openFile(openFile(EMPTY_TABS, "/a"), "/b"), "/c");
    s = activate(s, fileTabId("/b"));
    s = closeTab(s, fileTabId("/b"));
    expect(s.active).toBe(fileTabId("/c"));
    s = closeTab(s, fileTabId("/c"));
    expect(s.active).toBe(fileTabId("/a"));
    s = closeTab(s, fileTabId("/a"));
    expect(s).toEqual({ tabs: [], active: null });
  });

  it("closing another tab keeps the active one", () => {
    const s = closeTab(openFile(openFile(EMPTY_TABS, "/a"), "/b"), fileTabId("/a"));
    expect(s.active).toBe(fileTabId("/b"));
  });

  it("moves a tab to a new position", () => {
    const s = openFile(openFile(openFile(EMPTY_TABS, "/a"), "/b"), "/c");
    expect(ids(moveTab(s, fileTabId("/c"), 0))).toEqual(["file:/c", "file:/a", "file:/b"]);
    expect(ids(moveTab(s, fileTabId("/a"), 9))).toEqual(["file:/b", "file:/c", "file:/a"]);
    expect(moveTab(s, fileTabId("/b"), 1)).toBe(s);
  });

  it("swaps in the canonical path, merging a duplicate", () => {
    let s = openFile(EMPTY_TABS, "notes.md");
    s = canonicalizeFile(s, "notes.md", "/w/notes.md");
    expect(ids(s)).toEqual(["file:/w/notes.md"]);
    expect(s.active).toBe("file:/w/notes.md");
    s = openFile(s, "./notes.md");
    s = canonicalizeFile(s, "./notes.md", "/w/notes.md");
    expect(ids(s)).toEqual(["file:/w/notes.md"]);
  });

  it("patches a tab only when something differs", () => {
    const s = openFile(EMPTY_TABS, "/a");
    expect(patchTab<FileTab>(s, fileTabId("/a"), { dirty: false })).toBe(s);
    expect((patchTab<FileTab>(s, fileTabId("/a"), { dirty: true }).tabs[0] as FileTab).dirty).toBe(true);
  });

  it("round-trips through storage without unsaved flags or shell titles", () => {
    let s = openFile(EMPTY_TABS, "/w/deck.pptx");
    s = patchTab<FileTab>(s, fileTabId("/w/deck.pptx"), { dirty: true, mode: "code" });
    s = withTerminal(s);
    s = patchTab<TerminalTab>(s, s.active!, { title: "zsh" });
    s = openTab(s, { kind: "files", id: "files" });
    s = openTab(s, { kind: "agent", id: "agent" });
    s = activate(s, fileTabId("/w/deck.pptx"));
    const back = fromStored(JSON.parse(JSON.stringify(toStored(s))));
    expect(ids(back)).toEqual(ids(s));
    expect(back.active).toBe(fileTabId("/w/deck.pptx"));
    expect((back.tabs[0] as FileTab).dirty).toBe(false);
    expect((back.tabs[0] as FileTab).mode).toBe("code");
    expect((back.tabs[1] as TerminalTab).title).toBe("");
  });

  it("ignores malformed or repeated stored tabs", () => {
    expect(fromStored(null)).toBe(EMPTY_TABS);
    expect(fromStored({ tabs: "x" })).toBe(EMPTY_TABS);
    const s = fromStored({
      tabs: [{ kind: "file", path: "/a" }, { kind: "file", path: "/a" }, { kind: "terminal", terminalId: "bad id!" }, { kind: "nope" }, { kind: "files" }],
      active: 7,
    });
    expect(ids(s)).toEqual(["file:/a", "files"]);
    expect(s.active).toBe("file:/a");
  });
});
