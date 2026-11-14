/** Floating box under a link: shows the target, opens, edits or removes it. Also the Mod-K link editor. */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { Check, ExternalLink, Pencil, Unlink } from "lucide-react";
import { cn } from "@/lib/utils";
import { linkAt, removeLink, setLink } from "./editor/commands";

export interface LinkBubbleProps {
  view: EditorView;
  state: EditorState;
  /** Element the bubble is positioned in (the scrolling content box) */
  container: HTMLElement | null;
  /** Open the URL editor (toolbar button / Mod-K) */
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  focused: boolean;
  onOpen: (href: string) => void;
}

const iconBtn =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export function LinkBubble({ view, state, container, editing, onEditingChange, focused, onOpen }: LinkBubbleProps) {
  const range = linkAt(state);
  const visible = editing || (focused && range !== null && state.selection.empty);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!visible || !container) {
      setPos(null);
      return;
    }
    const at = range ? range.from : state.selection.from;
    try {
      const coords = view.coordsAtPos(at);
      const box = container.getBoundingClientRect();
      const width = boxRef.current?.offsetWidth ?? 320;
      const left = Math.max(0, Math.min(coords.left - box.left, box.width - width));
      setPos({ top: coords.bottom - box.top + 6, left });
    } catch {
      setPos(null);
    }
  }, [visible, container, view, state, range?.from]);

  useEffect(() => {
    if (editing) {
      setDraft(range?.href ?? "");
      requestAnimationFrame(() => inputRef.current?.select());
    }
    // Only when the editor opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (!visible || !pos) return null;

  const apply = () => {
    const href = draft.trim();
    if (href) setLink(href, range)(view.state, view.dispatch);
    else if (range) removeLink(range)(view.state, view.dispatch);
    onEditingChange(false);
    view.focus();
  };

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label="Link"
      className={cn(
        "absolute z-20 flex max-w-[min(26rem,100%)] items-center gap-1 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md",
      )}
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).tagName !== "INPUT") e.preventDefault();
      }}
    >
      {editing ? (
        <>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                apply();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onEditingChange(false);
                view.focus();
              }
            }}
            onBlur={() => onEditingChange(false)}
            placeholder="Paste a link or a file name"
            spellCheck={false}
            className="h-7 w-72 min-w-0 rounded-md bg-transparent px-2 text-meta text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button type="button" className={iconBtn} title="Apply" aria-label="Apply" onClick={apply}>
            <Check className="size-4" />
          </button>
        </>
      ) : range ? (
        <>
          <button
            type="button"
            title={range.href}
            onClick={() => onOpen(range.href)}
            className="h-7 min-w-0 max-w-64 truncate rounded-md px-2 text-left text-meta text-foreground hover:bg-muted"
          >
            {range.href || "(no address)"}
          </button>
          <button type="button" className={iconBtn} title="Open" aria-label="Open link" onClick={() => onOpen(range.href)}>
            <ExternalLink className="size-4" />
          </button>
          <button type="button" className={iconBtn} title="Edit link" aria-label="Edit link" onClick={() => onEditingChange(true)}>
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            className={iconBtn}
            title="Remove link"
            aria-label="Remove link"
            onClick={() => {
              removeLink(range)(view.state, view.dispatch);
              view.focus();
            }}
          >
            <Unlink className="size-4" />
          </button>
        </>
      ) : null}
    </div>
  );
}
