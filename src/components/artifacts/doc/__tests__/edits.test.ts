import { describe, expect, it } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { toggleMark, setBlockType } from "prosemirror-commands";
import { wrapInList } from "prosemirror-schema-list";
import type { Transaction } from "prosemirror-state";
import { schema } from "../editor/schema";
import { parseMarkdown } from "../markdown/parse";
import { serializeMarkdown } from "../markdown/serialize";
import { edit, find, fixture, lineDiff, replaceText, select } from "./helpers";

function run(state: EditorState, cmd: (s: EditorState, d: (tr: Transaction) => void) => boolean): Transaction {
  let out: Transaction | null = null;
  cmd(state, (tr) => (out = tr));
  if (!out) throw new Error("command did not apply");
  return out;
}

describe("edits change only the affected lines", () => {
  it("one word in a paragraph", () => {
    const md = fixture("report.md");
    const out = edit(md, (s) => replaceText(s, "14 suppliers", "15 suppliers"));
    expect(out.strategy).toBe("minimal");
    expect(lineDiff(md, out.text)).toEqual({
      removed: ["We reviewed **14 suppliers** across three regions. Key findings:"],
      added: ["We reviewed **15 suppliers** across three regions. Key findings:"],
    });
  });

  it("one item in a `*` list keeps the other items byte-for-byte", () => {
    const md = fixture("nested-lists.md");
    const out = edit(md, (s) => replaceText(s, "Loose item two", "Loose item 2"));
    expect(lineDiff(md, out.text)).toEqual({ removed: ["* Loose item two"], added: ["* Loose item 2"] });
  });

  it("one item of a list with four-space nesting", () => {
    const md = fixture("nested-lists.md");
    const out = edit(md, (s) => replaceText(s, "Another", "Another one"));
    const d = lineDiff(md, out.text);
    expect(d.removed).toEqual(["    - Another"]);
    expect(d.added.length).toBe(1);
    expect(d.added[0]).toMatch(/^ +- Another one$/);
    // Still nested under "Vegetables"
    const again = parseMarkdown(out.text).doc;
    expect(again.child(1).childCount).toBe(2);
  });

  it("ticking a task checkbox", () => {
    const md = fixture("report.md");
    const out = edit(md, (s) => {
      const { from } = find(s.doc, "Decide on Castell");
      const $pos = s.doc.resolve(from);
      const itemPos = $pos.before($pos.depth - 1);
      return s.tr.setNodeMarkup(itemPos, undefined, { ...s.doc.nodeAt(itemPos)!.attrs, checked: true });
    });
    expect(lineDiff(md, out.text)).toEqual({ removed: ["- [ ] Decide on Castell"], added: ["- [x] Decide on Castell"] });
  });

  it("one cell of an aligned-pipes table rewrites only as much as alignment needs", () => {
    const md = fixture("tables.md");
    const out = edit(md, (s) => replaceText(s, "four", "4444"));
    const d = lineDiff(md, out.text);
    // Unchanged rows keep their bytes; the edited row is re-padded to the content width.
    expect(d.removed).toEqual(["| three   | four    |"]);
    expect(d.added).toEqual(["| three   | 4444  |"]);
  });

  it("one cell of an unaligned table changes one row", () => {
    const md = fixture("tables.md");
    const out = edit(md, (s) => replaceText(s, "Pears", "Plums"));
    const d = lineDiff(md, out.text);
    expect(d.removed).toEqual(["| Pears | 12 | $0.80 | `code`, [link](https://example.com) |"]);
    expect(d.added).toEqual(["| Plums | 12 | $0.80 | `code`, [link](https://example.com) |"]);
  });

  it("compact table without outer pipes", () => {
    const md = fixture("tables.md");
    const out = edit(md, (s) => replaceText(s, "b", "bee", 0));
    const d = lineDiff(md, out.text);
    expect(d.removed.length).toBe(1);
    expect(d.added.length).toBe(1);
  });

  it("inserting a paragraph between blocks", () => {
    const md = fixture("report.md");
    const out = edit(md, (s) => {
      const { to } = find(s.doc, "Operations team");
      const $p = s.doc.resolve(to);
      const after = $p.after(1);
      return s.tr.insert(after, schema.nodes.paragraph.create(null, schema.text("A new paragraph.")));
    });
    const d = lineDiff(md, out.text);
    expect(d.removed).toEqual([]);
    expect(d.added.sort()).toEqual(["", "A new paragraph."]);
    expect(out.text).toContain("**Status:** Draft\n\nA new paragraph.\n\n## Summary");
  });

  it("deleting a block", () => {
    const md = fixture("report.md");
    const out = edit(md, (s) => {
      let pos = -1;
      let size = 0;
      s.doc.forEach((n, p) => {
        if (n.type === schema.nodes.blockquote) {
          pos = p;
          size = n.nodeSize;
        }
      });
      return s.tr.delete(pos, pos + size);
    });
    const d = lineDiff(md, out.text);
    expect(d.added).toEqual([]);
    expect(d.removed.filter((l) => l.trim())).toEqual([
      "> **Note:** figures exclude the Leeds site, which reports separately.",
    ]);
  });

  it("bold on a word uses the document's strong marker", () => {
    const md = "Plain __strong__ text with words.\n";
    const out = edit(md, (s) => run(select(s, "words"), toggleMark(schema.marks.strong)));
    expect(out.text).toBe("Plain __strong__ text with __words__.\n");
  });

  it("underline is written as <u> and read back", () => {
    const md = "Some words here.\n";
    const out = edit(md, (s) => run(select(s, "words"), toggleMark(schema.marks.underline)));
    expect(out.text).toBe("Some <u>words</u> here.\n");
    let underlined = "";
    parseMarkdown(out.text).doc.descendants((n) => {
      if (n.isText && n.marks.some((m) => m.type === schema.marks.underline)) underlined += n.text;
      return true;
    });
    expect(underlined).toBe("words");
  });

  it("editing inside a blockquote that contains a list", () => {
    const md = fixture("blockquotes.md");
    const out = edit(md, (s) => replaceText(s, "nested", "nested item"));
    expect(lineDiff(md, out.text)).toEqual({ removed: [">   - nested"], added: [">   - nested item"] });
  });

  it("editing a raw HTML block's source", () => {
    const md = fixture("html.md");
    const out = edit(md, (s) => {
      let pos = -1;
      s.doc.forEach((n, p) => {
        if (pos < 0 && n.type === schema.nodes.raw_block) pos = p;
      });
      const node = s.doc.nodeAt(pos)!;
      return s.tr.setNodeMarkup(pos, undefined, { ...node.attrs, source: node.attrs.source.replace("120", "200") });
    });
    expect(lineDiff(md, out.text)).toEqual({
      removed: ['  <img src="logo.png" width="120">'],
      added: ['  <img src="logo.png" width="200">'],
    });
  });

  it("text next to inline HTML keeps the HTML", () => {
    const md = fixture("html.md");
    const out = edit(md, (s) => replaceText(s, "Some text", "Some more text"));
    expect(lineDiff(md, out.text)).toEqual({
      removed: ["Some text with <kbd>Ctrl</kbd>+<kbd>C</kbd> and <u>underlined</u> words<br>and a br."],
      added: ["Some more text with <kbd>Ctrl</kbd>+<kbd>C</kbd> and <u>underlined</u> words<br>and a br."],
    });
  });

  it("setext headings stay setext", () => {
    const md = fixture("setext.md");
    const out = edit(md, (s) => replaceText(s, "Main Title", "Main Heading"));
    expect(lineDiff(md, out.text)).toEqual({
      removed: ["Main Title", "=========="],
      added: ["Main Heading", "============"],
    });
  });

  it("CRLF files stay CRLF, including new text", () => {
    const md = fixture("report.md").replace(/\n/g, "\r\n");
    const out = edit(md, (s) => {
      const { to } = find(s.doc, "Operations team");
      return s.tr.insert(
        s.doc.resolve(to).after(1),
        schema.nodes.bullet_list.create(null, [
          schema.nodes.list_item.create(null, schema.nodes.paragraph.create(null, schema.text("one"))),
          schema.nodes.list_item.create(null, schema.nodes.paragraph.create(null, schema.text("two"))),
        ]),
      );
    });
    expect(out.text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(out.text).toContain("\r\n\r\n- one\r\n- two\r\n");
  });

  it("hard breaks keep their style when the paragraph is edited", () => {
    const md = fixture("breaks.md");
    const out = edit(md, (s) => {
      const t1 = replaceText(s, "line two", "LINE TWO");
      const s1 = s.apply(t1);
      return t1.insertText("NEXT", find(s1.doc, "next").from, find(s1.doc, "next").to);
    });
    const d = lineDiff(md, out.text);
    expect(d.removed).toEqual(["line two after a hard break.", "next line."]);
    expect(d.added).toEqual(["LINE TWO after a hard break.", "NEXT line."]);
  });

  it("front matter, footnotes and math survive edits elsewhere", () => {
    for (const name of ["frontmatter.md", "footnotes.md", "math.md"]) {
      const md = fixture(name);
      const out = edit(md, (s) => {
        const { from } = find(s.doc, name === "frontmatter.md" ? "Body" : name === "math.md" ? "Costs" : "More text");
        return s.tr.insertText("X", from, from);
      });
      const d = lineDiff(md, out.text);
      expect(d.removed.length).toBe(1);
      expect(d.added.length).toBe(1);
    }
  });

  it("editing a paragraph that contains footnote references", () => {
    const md = fixture("footnotes.md");
    const out = edit(md, (s) => replaceText(s, "Here is", "Here's"));
    expect(lineDiff(md, out.text)).toEqual({
      removed: ["Here is a claim[^1] and another[^note]."],
      added: ["Here's a claim[^1] and another[^note]."],
    });
  });

  it("links keep their form (reference, autolink, literal) when the paragraph is edited", () => {
    const md = fixture("links.md");
    let out = edit(md, (s) => replaceText(s, " and a ", " plus a "));
    expect(lineDiff(md, out.text)).toEqual({
      removed: ["A [reference link][ref] and a [collapsed reference][] and a [shortcut]."],
      added: ["A [reference link][ref] plus a [collapsed reference][] and a [shortcut]."],
    });
    out = edit(md, (s) => replaceText(s, "Literal autolinks:", "Bare links:"));
    expect(lineDiff(md, out.text).added).toEqual(["Bare links: https://github.com/vibework and www.example.com."]);
    out = edit(md, (s) => replaceText(s, "Autolink", "An autolink"));
    expect(lineDiff(md, out.text).added).toEqual(["An autolink <https://example.org/x> and email <me@example.com>."]);
  });

  it("two adjacent bullet lists do not merge", () => {
    const md = "- a\n- b\n";
    const out = edit(md, (s) =>
      s.tr.insert(
        s.doc.content.size,
        schema.nodes.bullet_list.create(null, [
          schema.nodes.list_item.create(null, schema.nodes.paragraph.create(null, schema.text("c"))),
        ]),
      ),
    );
    const again = parseMarkdown(out.text).doc;
    expect(again.childCount).toBe(2);
  });

  it("typing into an empty file", () => {
    const out = edit("", (s) => s.tr.insertText("Hello world", 1));
    expect(out.text).toBe("Hello world\n");
  });

  it("deleting everything gives an empty file", () => {
    const out = edit(fixture("report.md"), (s) =>
      s.tr.replaceWith(0, s.doc.content.size, schema.nodes.paragraph.create()),
    );
    expect(out.text).toBe("");
  });

  it("empty paragraphs are not written", () => {
    const md = "One.\n\nTwo.\n";
    const out = edit(md, (s) => s.tr.insert(s.doc.child(0).nodeSize, schema.nodes.paragraph.create()));
    expect(out.text).toBe(md);
  });

  it("new heading and list via commands", () => {
    const md = "Intro.\n\nTitle\n\nItem\n";
    const out = edit(md, (s) => {
      const s1 = s.apply(
        run(
          s.apply(s.tr.setSelection(TextSelection.create(s.doc, find(s.doc, "Title").from))),
          setBlockType(schema.nodes.heading, { level: 2 }),
        ),
      );
      const s2 = s1.apply(s1.tr.setSelection(TextSelection.create(s1.doc, find(s1.doc, "Item").from)));
      const tr = run(s2, wrapInList(schema.nodes.bullet_list));
      // Combine both steps into one transaction from the original state
      const combined = s.tr;
      for (const step of [...run(s.apply(s.tr.setSelection(TextSelection.create(s.doc, find(s.doc, "Title").from))), setBlockType(schema.nodes.heading, { level: 2 })).steps, ...tr.steps]) combined.step(step);
      return combined;
    });
    expect(out.text).toBe("Intro.\n\n## Title\n\n- Item\n");
  });

  it("special characters typed by the user are escaped only where needed", () => {
    const out = edit("Para.\n", (s) =>
      s.tr.insertText(" Use snake_case, 2*3, a_b, [x], #tag, <b> and 1. one.", s.doc.child(0).nodeSize - 1),
    );
    const again = parseMarkdown(out.text).doc.textContent;
    expect(again).toBe("Para. Use snake_case, 2*3, a_b, [x], #tag, <b> and 1. one.");
  });

  it("repeated saves keep minimising against the last write", () => {
    const md = fixture("report.md");
    const { doc, map } = parseMarkdown(md);
    let state = EditorState.create({ doc });
    state = state.apply(replaceText(state, "14 suppliers", "15 suppliers"));
    const first = serializeMarkdown(state.doc, map);
    state = state.apply(replaceText(state, "Priya", "Priya S."));
    const second = serializeMarkdown(state.doc, first.map);
    const d = lineDiff(first.text, second.text);
    expect(d.removed).toEqual(["| Acme Ltd | 2026-11-30 | 60 days | Priya |"]);
    expect(d.added).toEqual(["| Acme Ltd | 2026-11-30 | 60 days | Priya S. |"]);
  });

  it("large documents serialize quickly", () => {
    const big = Array.from({ length: 60 }, () => fixture("report.md").replace(/^---[\s\S]*?---\n/, "")).join("\n");
    const t0 = performance.now();
    const { doc, map } = parseMarkdown(big);
    const t1 = performance.now();
    // Wall time includes descheduling by parallel workers/builds. Keep the
    // same work budget using this test thread (not the entire process).
    const cpuStart = process.threadCpuUsage();
    let state = EditorState.create({ doc });
    state = state.apply(replaceText(state, "14 suppliers", "15 suppliers", 30));
    const out = serializeMarkdown(state.doc, map);
    const t2 = performance.now();
    const cpu = process.threadCpuUsage(cpuStart);
    const cpuMs = (cpu.user + cpu.system) / 1000;
    expect(lineDiff(big, out.text).added.length).toBe(1);
    console.log(`large doc: ${big.length} chars, parse ${(t1 - t0).toFixed(0)}ms, save ${(t2 - t1).toFixed(0)}ms wall, ${cpuMs.toFixed(0)}ms CPU`);
    expect(cpuMs).toBeLessThan(1500);
  }, 30000);
});
