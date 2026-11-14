import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../markdown/parse";
import { contentKey, documentToMarkdown, serializeMarkdown } from "../markdown/serialize";
import { schema } from "../editor/schema";
import { fixture, fixtureNames } from "./helpers";

const variants: Record<string, (s: string) => string> = {
  as_is: (s) => s,
  crlf: (s) => s.replace(/\n/g, "\r\n"),
  no_final_newline: (s) => s.replace(/\n+$/, ""),
  extra_final_newlines: (s) => s + "\n\n",
  bom: (s) => "﻿" + s,
  leading_blank_lines: (s) => "\n\n" + s,
  mixed_eol: (s) => s.replace(/\n/g, (_m, i: number) => (i % 3 ? "\n" : "\r\n")),
};

describe("unedited save is byte-identical", () => {
  for (const name of fixtureNames()) {
    for (const [variant, fn] of Object.entries(variants)) {
      it(`${name} (${variant})`, () => {
        const md = fn(fixture(name));
        const { doc, map } = parseMarkdown(md);
        const out = serializeMarkdown(doc, map);
        expect(out.text).toBe(md);
        expect(out.strategy).toBe("minimal");
      });
    }
  }

  it("empty and whitespace-only files", () => {
    for (const md of ["", "\n", "\n\n  \n", "\r\n"]) {
      const { doc, map } = parseMarkdown(md);
      expect(serializeMarkdown(doc, map).text).toBe(md);
    }
  });
});

describe("canonical serializer reads back as the same document", () => {
  for (const name of fixtureNames()) {
    it(name, () => {
      const { doc, map } = parseMarkdown(fixture(name));
      const md = documentToMarkdown(doc, map.style);
      const again = parseMarkdown(md);
      expect(contentKey(again.doc)).toBe(contentKey(doc));
    });
  }
});

describe("what the editor models", () => {
  const types = (md: string) => {
    const { doc } = parseMarkdown(md);
    const out: string[] = [];
    doc.forEach((n) => out.push(n.type.name === "raw_block" ? `raw:${n.attrs.kind}` : n.type.name));
    return out;
  };

  it("maps supported constructs to editable nodes", () => {
    expect(types(fixture("report.md"))).toEqual([
      "raw:frontmatter",
      "heading",
      "paragraph",
      "heading",
      "paragraph",
      "ordered_list",
      "blockquote",
      "heading",
      "table",
      "heading",
      "bullet_list",
      "heading",
      "paragraph",
      "code_block",
      "horizontal_rule",
      "paragraph",
    ]);
  });

  it("keeps blockquotes with lists editable", () => {
    expect(types(fixture("blockquotes.md"))).not.toContain("raw:markdown");
  });

  it("preserves what it cannot edit as raw blocks", () => {
    expect(types(fixture("html.md"))).toContain("raw:html");
    expect(types(fixture("footnotes.md"))).toContain("raw:footnote");
    expect(types(fixture("math.md"))).toContain("raw:math");
    expect(types(fixture("links.md"))).toContain("raw:definition");
  });

  it("list items that start with a code block or a list stay editable and round-trip", () => {
    for (const md of ["- ```\n  code\n  ```\n- b\n", "- - nested first\n- b\n", "1. > quote in item\n"]) {
      expect(types(md)).not.toContain("raw:markdown");
      const { doc, map } = parseMarkdown(md);
      expect(serializeMarkdown(doc, map).text).toBe(md);
      expect(documentToMarkdown(doc, map.style)).toBe(md);
    }
  });

  it("HTML emphasis tags are read as marks and written back as tags", () => {
    const md = "a <b>bold</b> <i>it</i> <s>gone</s> <em>e</em> <strong>s</strong> <del>d</del> <u>u</u>\n";
    const { doc, map } = parseMarkdown(md);
    let marks = 0;
    doc.descendants((n) => {
      if (n.isText && n.marks.length) marks++;
      return true;
    });
    expect(marks).toBe(7);
    expect(documentToMarkdown(doc, map.style)).toBe(md);
  });

  it("task items, alignment, underline, raw inline", () => {
    const { doc } = parseMarkdown(fixture("task-lists.md") + "\n" + fixture("tables.md") + "\n" + fixture("html.md"));
    const checked: unknown[] = [];
    const aligns: unknown[] = [];
    let underline = 0;
    let rawInline = 0;
    doc.descendants((n) => {
      if (n.type === schema.nodes.list_item) checked.push(n.attrs.checked);
      if (n.type === schema.nodes.table_header) aligns.push(n.attrs.align);
      if (n.isText && n.marks.some((m) => m.type === schema.marks.underline)) underline++;
      if (n.type === schema.nodes.raw_inline) rawInline++;
      return true;
    });
    expect(checked.slice(0, 7)).toEqual([false, true, true, false, false, true, null]);
    expect(aligns.slice(0, 4)).toEqual(["left", "center", "right", null]);
    expect(underline).toBe(1);
    expect(rawInline).toBeGreaterThanOrEqual(5);
  });
});
