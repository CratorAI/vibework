/** Editing commands used by the toolbar, keymap and input rules. */

import { setBlockType, toggleMark, wrapIn, lift } from "prosemirror-commands";
import { liftListItem, splitListItem, wrapInList } from "prosemirror-schema-list";
import { Fragment, type MarkType, type Node as PMNode, type NodeType, type ResolvedPos } from "prosemirror-model";
import { TextSelection, type Command, type EditorState } from "prosemirror-state";
import { CellSelection, TableMap, addRowAfter, isInTable, selectedRect } from "prosemirror-tables";
import { schema } from "./schema";

const n = schema.nodes;

export function markActive(state: EditorState, type: MarkType): boolean {
  const { from, $from, to, empty } = state.selection;
  if (empty) return Boolean(type.isInSet(state.storedMarks || $from.marks()));
  return state.doc.rangeHasMark(from, to, type);
}

export type BlockKind = "paragraph" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "code" | "other";

export function blockKind(state: EditorState): BlockKind {
  const parent = state.selection.$from.parent;
  if (parent.type === n.paragraph) return "paragraph";
  if (parent.type === n.heading) return `h${parent.attrs.level}` as BlockKind;
  if (parent.type === n.code_block) return "code";
  return "other";
}

/** The closest ancestor of the selection of one of the given types */
export function findAncestor(
  $pos: ResolvedPos,
  types: NodeType[],
): { node: PMNode; pos: number; depth: number } | null {
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d);
    if (types.includes(node.type)) return { node, pos: $pos.before(d), depth: d };
  }
  return null;
}

export function listKind(state: EditorState): "bullet" | "ordered" | "task" | null {
  const list = findAncestor(state.selection.$from, [n.bullet_list, n.ordered_list]);
  if (!list) return null;
  const item = findAncestor(state.selection.$from, [n.list_item]);
  if (item && item.node.attrs.checked !== null) return "task";
  return list.node.type === n.ordered_list ? "ordered" : "bullet";
}

export function inBlockquote(state: EditorState): boolean {
  return findAncestor(state.selection.$from, [n.blockquote]) !== null;
}

export const setParagraph: Command = setBlockType(n.paragraph);
export const setHeading = (level: number): Command => setBlockType(n.heading, { level });

export const toggleCodeBlock: Command = (state, dispatch) => {
  if (state.selection.$from.parent.type === n.code_block) return setBlockType(n.paragraph)(state, dispatch);
  return setBlockType(n.code_block)(state, dispatch);
};

export const toggleBold = toggleMark(schema.marks.strong);
export const toggleItalic = toggleMark(schema.marks.em);
export const toggleUnderline = toggleMark(schema.marks.underline);
export const toggleStrike = toggleMark(schema.marks.strike);
export const toggleCode = toggleMark(schema.marks.code);

/** Bulleted, numbered or check list: wrap, switch kind, or unwrap when already that kind */
export function toggleList(kind: "bullet" | "ordered" | "task"): Command {
  return (state, dispatch) => {
    const current = listKind(state);
    const listType = kind === "ordered" ? n.ordered_list : n.bullet_list;
    if (current === kind) return liftListItem(n.list_item)(state, dispatch);
    const list = findAncestor(state.selection.$from, [n.bullet_list, n.ordered_list]);
    if (list) {
      if (!dispatch) return true;
      let tr = state.tr;
      if (list.node.type !== listType) tr.setNodeMarkup(list.pos, listType, kind === "ordered" ? { start: 1 } : {});
      const updated = tr.doc.nodeAt(list.pos)!;
      const checked = kind === "task" ? false : null;
      updated.forEach((item, offset) => {
        const pos = list.pos + 1 + offset;
        const want = checked === false ? (item.attrs.checked === true ? true : false) : null;
        if (item.attrs.checked !== want) tr = tr.setNodeMarkup(pos, undefined, { ...item.attrs, checked: want });
      });
      dispatch(tr.scrollIntoView());
      return true;
    }
    if (!wrapInList(listType)(state)) return false;
    if (!dispatch) return true;
    wrapInList(listType)(state, (tr) => {
      if (kind === "task") {
        const $pos = tr.doc.resolve(tr.mapping.map(state.selection.from));
        const inner = findAncestor($pos, [n.bullet_list]);
        if (inner) {
          inner.node.forEach((item, offset) => {
            tr.setNodeMarkup(inner.pos + 1 + offset, undefined, { ...item.attrs, checked: false });
          });
        }
      }
      dispatch(tr);
    });
    return true;
  };
}

export const toggleBlockquote: Command = (state, dispatch) => {
  if (inBlockquote(state)) return lift(state, dispatch);
  return wrapIn(n.blockquote)(state, dispatch);
};

/** Enter in a list item; a new item under a task item is an unchecked task */
export const splitListItemKeepTask: Command = (state, dispatch) => {
  const item = findAncestor(state.selection.$from, [n.list_item]);
  const attrs = item && item.node.attrs.checked !== null ? { checked: false } : undefined;
  return splitListItem(n.list_item, attrs)(state, dispatch);
};

/** Backspace at the very start of a list item lifts it out of the list */
export const liftItemAtStart: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  if ($from.depth < 2 || $from.node(-1).type !== n.list_item || $from.index(-1) !== 0) return false;
  return liftListItem(n.list_item)(state, dispatch);
};

/** Backspace at the start of the first block in a quote lifts it out */
export const liftQuoteAtStart: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  if ($from.depth < 2 || $from.node(-1).type !== n.blockquote || $from.index(-1) !== 0) return false;
  return lift(state, dispatch);
};

/** Turn a paragraph that reads "```lang" into a code block on Enter */
export const codeFenceOnEnter: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parent.type !== n.paragraph) return false;
  const m = $from.parent.textContent.match(/^```([\w+#.-]*)$/);
  if (!m || $from.parentOffset !== $from.parent.content.size) return false;
  if (dispatch) {
    const start = $from.start();
    const tr = state.tr.delete(start, $from.end()).setBlockType(start, start, n.code_block, { lang: m[1] });
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/** Tab inside a code block inserts two spaces */
export const indentInCode: Command = (state, dispatch) => {
  if (state.selection.$from.parent.type !== n.code_block) return false;
  if (dispatch) dispatch(state.tr.insertText("  ").scrollIntoView());
  return true;
};

export const insertHardBreak: Command = (state, dispatch) => {
  const { $from } = state.selection;
  if ($from.parent.type.spec.code || $from.parent.type.spec.tableRole) return false;
  if (dispatch) dispatch(state.tr.replaceSelectionWith(n.hard_break.create()).scrollIntoView());
  return true;
};

/** Insert a block node after the current top-level block, with an empty paragraph after it if it is last */
function insertBlock(node: PMNode, selectInside = false): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    if ($from.parent.type.spec.tableRole) return false;
    if (!dispatch) return true;
    const tr = state.tr;
    const empty = $from.parent.type === n.paragraph && $from.parent.content.size === 0 && $from.depth >= 1;
    let pos: number;
    if (empty) {
      pos = $from.before();
      tr.replaceWith(pos, $from.after(), node);
    } else {
      pos = $from.after(Math.max(1, $from.depth));
      tr.insert(pos, node);
    }
    const after = pos + node.nodeSize;
    if (after >= tr.doc.content.size || !tr.doc.resolve(after).nodeAfter) tr.insert(after, n.paragraph.create());
    if (selectInside) tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 3)));
    else tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(after + 1, tr.doc.content.size))));
    dispatch(tr.scrollIntoView());
    return true;
  };
}

export const insertHorizontalRule: Command = (state, dispatch) =>
  insertBlock(n.horizontal_rule.create())(state, dispatch);

export function insertTable(rows = 3, cols = 3): Command {
  return (state, dispatch) => {
    const header = n.table_row.create(
      null,
      Array.from({ length: cols }, () => n.table_header.create()),
    );
    const body = Array.from({ length: rows - 1 }, () =>
      n.table_row.create(
        null,
        Array.from({ length: cols }, () => n.table_cell.create()),
      ),
    );
    return insertBlock(n.table.create(null, [header, ...body]), true)(state, dispatch);
  };
}

/** Set the alignment of the selected table column(s) */
export function alignColumn(align: "left" | "center" | "right" | null): Command {
  return (state, dispatch) => {
    if (!isInTable(state)) return false;
    if (!dispatch) return true;
    const rect = selectedRect(state);
    const map: TableMap = rect.map;
    const tr = state.tr;
    for (let col = rect.left; col < rect.right; col++) {
      for (let row = 0; row < map.height; row++) {
        const cellPos = map.map[row * map.width + col];
        const cell = rect.table.nodeAt(cellPos);
        if (cell && cell.attrs.align !== align)
          tr.setNodeMarkup(rect.tableStart + cellPos, undefined, { ...cell.attrs, align });
      }
    }
    dispatch(tr);
    return true;
  };
}

/** Enter in a table cell moves to the cell below, adding a row at the end of the table */
export const enterInCell: Command = (state, dispatch) => {
  if (!isInTable(state) || state.selection instanceof CellSelection) return false;
  const $from = state.selection.$from;
  if (!$from.parent.type.spec.tableRole) return false;
  if (!dispatch) return true;
  const rect = selectedRect(state);
  let tr = state.tr;
  let map = rect.map;
  let tableStart = rect.tableStart;
  if (rect.bottom >= map.height) {
    addRowAfter(state, (t) => (tr = t));
    const table = tr.doc.nodeAt(rect.tableStart - 1)!;
    map = TableMap.get(table);
    tableStart = rect.tableStart;
  }
  const cellPos = map.map[rect.bottom * map.width + rect.left];
  tr.setSelection(TextSelection.create(tr.doc, tableStart + cellPos + 1));
  dispatch(tr.scrollIntoView());
  return true;
};

export interface LinkRange {
  from: number;
  to: number;
  href: string;
}

/** The link around the cursor (or at the start of the selection), as its full extent */
export function linkAt(state: EditorState): LinkRange | null {
  const type = schema.marks.link;
  const { $from, from } = state.selection;
  const parent = $from.parent;
  if (!parent.inlineContent) return null;
  const start = $from.start();
  const kids: { node: PMNode; from: number; to: number }[] = [];
  parent.forEach((child, offset) => kids.push({ node: child, from: start + offset, to: start + offset + child.nodeSize }));
  let idx = kids.findIndex((k) => k.from <= from && from < k.to && type.isInSet(k.node.marks));
  if (idx < 0) idx = kids.findIndex((k) => k.to === from && type.isInSet(k.node.marks));
  if (idx < 0) return null;
  const mark = type.isInSet(kids[idx].node.marks)!;
  let a = idx;
  let b = idx;
  while (a > 0 && mark.isInSet(kids[a - 1].node.marks)) a--;
  while (b < kids.length - 1 && mark.isInSet(kids[b + 1].node.marks)) b++;
  return { from: kids[a].from, to: kids[b].to, href: mark.attrs.href };
}

/** Apply a link to the selection (or the link under the cursor); inserts the URL as text if nothing is selected */
export function setLink(href: string, range?: LinkRange | null): Command {
  return (state, dispatch) => {
    const type = schema.marks.link;
    const mark = type.create({ href, kind: "inline" });
    if (!dispatch) return true;
    const tr = state.tr;
    if (range) {
      tr.removeMark(range.from, range.to, type).addMark(range.from, range.to, mark);
    } else if (state.selection.empty) {
      const { from } = state.selection;
      tr.insert(from, schema.text(href, [mark]));
    } else {
      const { from, to } = state.selection;
      tr.removeMark(from, to, type).addMark(from, to, mark);
    }
    dispatch(tr.scrollIntoView());
    return true;
  };
}

export function removeLink(range: LinkRange | null): Command {
  return (state, dispatch) => {
    const { from, to } = range ?? state.selection;
    if (from === to) return false;
    if (dispatch) dispatch(state.tr.removeMark(from, to, schema.marks.link));
    return true;
  };
}

/** Insert image nodes at `pos` (or the selection) */
export function insertImages(images: { src: string; alt: string }[], pos?: number): Command {
  return (state, dispatch) => {
    if (!images.length) return false;
    if (!dispatch) return true;
    const nodes = images.map((img) => n.image.create({ src: img.src, alt: img.alt }));
    const tr = state.tr;
    const at = pos ?? state.selection.from;
    const $at = tr.doc.resolve(at);
    if ($at.parent.inlineContent && $at.parent.type.allowsMarks([]) && !$at.parent.type.spec.code) {
      tr.insert(at, Fragment.from(nodes));
    } else {
      tr.insert(at, n.paragraph.create(null, nodes));
    }
    dispatch(tr.scrollIntoView());
    return true;
  };
}
