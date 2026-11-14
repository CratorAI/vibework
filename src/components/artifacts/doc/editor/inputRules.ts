/** Markdown shortcuts while typing: "# ", "- ", "1. ", "[ ] ", "> ", "```", "---", **bold**, *italic*, `code`, ~~strike~~ */

import {
  InputRule,
  inputRules,
  textblockTypeInputRule,
  wrappingInputRule,
} from "prosemirror-inputrules";
import type { MarkType } from "prosemirror-model";
import { TextSelection, type Plugin } from "prosemirror-state";
import { findWrapping } from "prosemirror-transform";
import { schema } from "./schema";

const n = schema.nodes;

/** Wrap the text between the delimiters in a mark and drop the delimiters */
function markRule(regexp: RegExp, type: MarkType): InputRule {
  return new InputRule(regexp, (state, match, start, end) => {
    const full = match[1];
    const inner = match[2];
    if (!full || !inner) return null;
    const tr = state.tr;
    const fullStart = start + match[0].indexOf(full);
    const innerStart = fullStart + full.indexOf(inner);
    const innerEnd = innerStart + inner.length;
    // `end` is where the last delimiter character is being typed; it is not in the doc yet.
    if (innerEnd < end) tr.delete(innerEnd, end);
    if (innerStart > fullStart) tr.delete(fullStart, innerStart);
    const markEnd = fullStart + inner.length;
    tr.addMark(fullStart, markEnd, type.create());
    tr.removeStoredMark(type);
    return tr;
  });
}

/** "[ ] " / "[x] " at the start of a list item (or a paragraph) makes it a task */
const taskRule = new InputRule(/^\[([ xX]?)\]\s$/, (state, match, start, end) => {
  const $start = state.doc.resolve(start);
  const checked = match[1].toLowerCase() === "x";
  if ($start.parent.type !== n.paragraph) return null;
  const tr = state.tr.delete(start, end);
  if ($start.depth >= 2 && $start.node(-1).type === n.list_item && $start.index(-1) === 0) {
    const itemPos = $start.before(-1);
    tr.setNodeMarkup(itemPos, undefined, { ...$start.node(-1).attrs, checked });
    return tr;
  }
  const $from = tr.doc.resolve(start);
  const range = $from.blockRange();
  const wrapping = range && findWrapping(range, n.bullet_list, null);
  if (!range || !wrapping) return null;
  tr.wrap(range, wrapping);
  const $item = tr.doc.resolve(tr.mapping.map(start));
  for (let d = $item.depth; d > 0; d--) {
    if ($item.node(d).type === n.list_item) {
      tr.setNodeMarkup($item.before(d), undefined, { ...$item.node(d).attrs, checked });
      break;
    }
  }
  return tr;
});

/** "---", "***" or "___" alone in a paragraph becomes a horizontal rule */
const ruleRule = new InputRule(/^(?:---|\*\*\*|___)$/, (state, _match, start, end) => {
  const $start = state.doc.resolve(start);
  const para = $start.parent;
  if (para.type !== n.paragraph || end !== $start.end() || para.content.size !== end - start) return null;
  const from = $start.before();
  const to = $start.after();
  const tr = state.tr.replaceWith(from, to, [n.horizontal_rule.create(), n.paragraph.create()]);
  tr.setSelection(TextSelection.create(tr.doc, from + 2));
  return tr;
});

export function buildInputRules(): Plugin {
  return inputRules({
    rules: [
      textblockTypeInputRule(/^(#{1,6})\s$/, n.heading, (m) => ({ level: m[1].length })),
      wrappingInputRule(/^\s*>\s$/, n.blockquote),
      wrappingInputRule(/^\s*[-+*]\s$/, n.bullet_list),
      wrappingInputRule(
        /^(\d+)[.)]\s$/,
        n.ordered_list,
        (m) => ({ start: Number(m[1]) }),
        (m, node) => node.childCount + node.attrs.start === Number(m[1]),
      ),
      taskRule,
      textblockTypeInputRule(/^```([\w+#.-]*)\s$/, n.code_block, (m) => ({ lang: m[1] })),
      ruleRule,
      markRule(/(?:^|\s)(\*\*(?!\s)([^*]+?)\*\*)$/, schema.marks.strong),
      markRule(/(?:^|\s)(__(?!\s)([^_]+?)__)$/, schema.marks.strong),
      markRule(/(?:^|[\s(])(\*(?![\s*])([^*]+?)\*)$/, schema.marks.em),
      markRule(/(?:^|[\s(])(_(?![\s_])([^_]+?)_)$/, schema.marks.em),
      markRule(/(?:^|[^`])(`([^`]+)`)$/, schema.marks.code),
      markRule(/(?:^|\s)(~~(?!\s)([^~]+?)~~)$/, schema.marks.strike),
    ],
  });
}
