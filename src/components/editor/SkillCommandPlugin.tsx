import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isDecoratorNode,
  $isElementNode,
  $isLineBreakNode,
  $isNodeSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  type LexicalNode,
} from "lexical";
import { mergeRegister } from "@lexical/utils";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { $createSkillNode, $isSkillNode } from "./SkillNode";
import { skillCatalog, useSkillCatalog } from "@/stores/skillCatalog";
import { matchSkills, slashTrigger, type SkillMatch } from "@/lib/skillMatch";
import type { SkillSource } from "@/tauri/skills";
import { cn } from "@/lib/utils";

const ROW = 32;
const MAX_ROWS = 8;
/** Rows drawn beyond the visible window, each way */
const OVERSCAN = 6;

const SOURCE_LABEL: Record<SkillSource, string> = {
  bundled: "Built in",
  user: "Your skills",
  claude: "~/.claude/skills",
  agents: "~/.agents/skills",
};

interface Trigger {
  /** The text node holding the "/" */
  key: string;
  slash: number;
  query: string;
}

type Item = { kind: "header"; label: string } | { kind: "skill"; match: SkillMatch; index: number };

/** The menu's rows: grouped by source with headers while nothing is typed, best match first after. */
function buildItems(matches: SkillMatch[], grouped: boolean): Item[] {
  const items: Item[] = [];
  let last: SkillSource | null = null;
  matches.forEach((match, index) => {
    if (grouped && match.skill.source !== last) {
      last = match.skill.source;
      items.push({ kind: "header", label: SOURCE_LABEL[last] });
    }
    items.push({ kind: "skill", match, index });
  });
  return items;
}

function Highlighted({ text, hits }: { text: string; hits: number[] }) {
  if (hits.length === 0) return <>{text}</>;
  const set = new Set(hits);
  const runs: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const hit = set.has(i);
    const lastRun = runs[runs.length - 1];
    if (lastRun && lastRun.hit === hit) lastRun.text += text[i];
    else runs.push({ text: text[i], hit });
  }
  return (
    <>
      {runs.map((run, i) => (run.hit ? <span key={i} className="font-semibold text-foreground">{run.text}</span> : <span key={i}>{run.text}</span>))}
    </>
  );
}

/** Where the "/" sits on screen, so the menu hangs from it and stays put while typing. */
function slashRect(root: HTMLElement | null, el: HTMLElement | null, offset: number): DOMRect {
  const fallback = (root ?? document.body).getBoundingClientRect();
  if (!el) return fallback;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let left = offset;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (left < length) {
      const range = document.createRange();
      range.setStart(node, left);
      range.setEnd(node, left + 1);
      const rect = range.getBoundingClientRect();
      return rect.height > 0 ? rect : fallback;
    }
    left -= length;
  }
  return fallback;
}

/**
 * "/" commands in the message box: typing "/" at the start or after a space
 * opens a menu of the skills this task can use, filtered as one types.
 * ↑↓ move, Enter or Tab choose, Escape closes (the text stays). Choosing
 * puts a chip in the message (one unit for Backspace) and the caret after it.
 */
export function SkillCommandPlugin({ side }: { side: "top" | "bottom" }) {
  const [editor] = useLexicalComposerContext();
  const catalog = useSkillCatalog();
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [active, setActive] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  // Escape (or a click away) closes the menu for this "/" until it is gone
  const dismissed = useRef<string | null>(null);

  useEffect(() => {
    skillCatalog.warm();
  }, []);

  // Watch the caret: is a "/" command being typed?
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      const next = editorState.read((): Trigger | null => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
        const node = selection.anchor.getNode();
        if (!$isTextNode(node)) return null;
        const before = node.getTextContent().slice(0, selection.anchor.offset);
        const prev = node.getPreviousSibling();
        const boundary = prev === null || $isDecoratorNode(prev) || $isLineBreakNode(prev);
        const found = slashTrigger(before, boundary);
        return found ? { key: node.getKey(), slash: found.slash, query: found.query } : null;
      });
      if (!next) dismissed.current = null;
      const visible = next && dismissed.current !== `${next.key}:${next.slash}` ? next : null;
      setTrigger((current) =>
        current && visible && current.key === visible.key && current.slash === visible.slash && current.query === visible.query ? current : visible,
      );
    });
  }, [editor]);

  const opening = trigger !== null;
  // Each opening reads the list again in the background (shown from memory meanwhile)
  useEffect(() => {
    if (opening) skillCatalog.refresh();
  }, [opening]);

  const query = trigger?.query ?? "";
  const matches = useMemo(() => (trigger && catalog.skills ? matchSkills(catalog.skills, query) : []), [catalog.skills, query, trigger]);
  const grouped = query.trim() === "";
  const items = useMemo(() => buildItems(matches, grouped), [matches, grouped]);
  const open = trigger !== null && matches.length > 0;

  // Typing starts again from the best match, at the top of the list
  useEffect(() => {
    setActive(0);
    setScrollTop(0);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [query, trigger?.key, trigger?.slash]);

  const dismiss = useCallback(() => {
    if (trigger) dismissed.current = `${trigger.key}:${trigger.slash}`;
    setTrigger(null);
  }, [trigger]);

  const choose = useCallback(
    (index: number) => {
      const match = matches[index];
      if (!match || !trigger) return;
      editor.update(() => {
        const node = $getNodeByKey(trigger.key);
        if (!$isTextNode(node)) return;
        const selection = $getSelection();
        const caret =
          $isRangeSelection(selection) && selection.anchor.key === trigger.key
            ? selection.anchor.offset
            : trigger.slash + 1 + trigger.query.length;
        const text = node.getTextContent();
        const before = text.slice(0, trigger.slash);
        const after = text.slice(caret);
        const chip = $createSkillNode(match.skill.id);
        if (before) {
          node.setTextContent(before);
          node.insertAfter(chip);
        } else {
          node.replace(chip);
        }
        // One space after the chip; the caret goes after it
        const rest = $createTextNode(after.startsWith(" ") ? after : ` ${after}`);
        chip.insertAfter(rest);
        rest.select(1, 1);
      });
      setTrigger(null);
    },
    [editor, matches, trigger],
  );

  // A chip goes in one Backspace, wherever the caret sits right after it
  useEffect(() => {
    return editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event) => {
        const selection = $getSelection();
        if ($isNodeSelection(selection)) {
          const chips = selection.getNodes().filter($isSkillNode);
          if (chips.length === 0) return false;
          event?.preventDefault();
          chips.forEach((chip) => chip.remove());
          return true;
        }
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
        const { anchor } = selection;
        let prev: LexicalNode | null = null;
        if (anchor.type === "text") {
          if (anchor.offset !== 0) return false;
          prev = anchor.getNode().getPreviousSibling();
        } else {
          const element = anchor.getNode();
          prev = $isElementNode(element) && anchor.offset > 0 ? element.getChildAtIndex(anchor.offset - 1) : null;
        }
        if (!$isSkillNode(prev)) return false;
        event?.preventDefault();
        prev.remove();
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor]);

  // The menu's keys, while it is open
  useEffect(() => {
    if (!open) return;
    const move = (delta: number) => (event: KeyboardEvent | null) => {
      event?.preventDefault();
      setActive((i) => (i + delta + matches.length) % matches.length);
      return true;
    };
    const pick = (event: KeyboardEvent | null) => {
      event?.preventDefault();
      choose(active);
      return true;
    };
    return mergeRegister(
      editor.registerCommand(KEY_ARROW_DOWN_COMMAND, move(1), COMMAND_PRIORITY_HIGH),
      editor.registerCommand(KEY_ARROW_UP_COMMAND, move(-1), COMMAND_PRIORITY_HIGH),
      editor.registerCommand(KEY_ENTER_COMMAND, pick, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(KEY_TAB_COMMAND, pick, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        (event) => {
          event?.preventDefault();
          dismiss();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [active, choose, dismiss, editor, matches.length, open]);

  // Keep the selected row in view (the list is windowed, so by arithmetic)
  const activeItem = useMemo(() => items.findIndex((it) => it.kind === "skill" && it.index === active), [items, active]);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || activeItem < 0) return;
    // The group header above the first row of a group shows with it
    const top = (items[activeItem - 1]?.kind === "header" ? activeItem - 1 : activeItem) * ROW;
    const bottom = (activeItem + 1) * ROW;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight - 8) list.scrollTop = bottom - list.clientHeight + 8;
  }, [activeItem, items]);

  const anchor = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () =>
          trigger ? slashRect(editor.getRootElement(), editor.getElementByKey(trigger.key), trigger.slash) : new DOMRect(),
      },
    }),
    [editor, trigger],
  );

  const height = Math.min(items.length, MAX_ROWS) * ROW + 8;
  const first = Math.max(0, Math.floor(scrollTop / ROW) - OVERSCAN);
  const last = Math.min(items.length, Math.ceil((scrollTop + height) / ROW) + OVERSCAN);

  return (
    <Popover open={open} onOpenChange={(next) => !next && dismiss()}>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        side={side}
        align="start"
        alignOffset={-8}
        sideOffset={6}
        collisionPadding={12}
        className="w-[400px] overflow-hidden p-0"
        data-testid="skill-menu"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          // Clicking in the message box moves the caret; that decides
          if (editor.getRootElement()?.contains(e.target as Node)) e.preventDefault();
        }}
      >
        <div
          ref={listRef}
          role="listbox"
          aria-label="Skills"
          className="overflow-y-auto overscroll-contain p-1"
          style={{ height }}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          <div className="relative" style={{ height: items.length * ROW }}>
            {items.slice(first, last).map((item, i) => {
              const at = first + i;
              if (item.kind === "header") {
                return (
                  <div
                    key={`h-${item.label}`}
                    className="absolute inset-x-0 flex h-8 items-end px-2 pb-1.5 text-xs font-medium text-foreground-secondary"
                    style={{ top: at * ROW }}
                  >
                    {item.label}
                  </div>
                );
              }
              const { skill, hits } = item.match;
              const selected = item.index === active;
              return (
                <div
                  key={`${skill.source}-${skill.id}`}
                  role="option"
                  aria-selected={selected}
                  title={skill.name !== skill.id ? `${skill.name}: ${skill.description}` : skill.description}
                  data-testid="skill-option"
                  data-skill-id={skill.id}
                  className={cn(
                    "absolute inset-x-0 flex h-8 cursor-pointer items-center gap-2.5 rounded-sm px-2 text-sm text-foreground/90",
                    selected && "bg-foreground/[0.043] text-foreground",
                  )}
                  style={{ top: at * ROW }}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => !selected && setActive(item.index)}
                  onClick={() => choose(item.index)}
                >
                  <span className="max-w-[55%] shrink-0 truncate">
                    <Highlighted text={skill.id} hits={hits} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-meta text-muted-foreground">{skill.description}</span>
                </div>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
