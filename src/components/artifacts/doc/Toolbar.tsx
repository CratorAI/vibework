/** Formatting toolbar for the Doc editor. Re-rendered on every editor transaction. */

import type { ReactNode } from "react";
import type { Command, EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { redo, undo } from "prosemirror-history";
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  isInTable,
} from "prosemirror-tables";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Code,
  Copy,
  Ellipsis,
  ImagePlus,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Redo2,
  Strikethrough,
  Table,
  TextQuote,
  Underline,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  alignColumn,
  blockKind,
  inBlockquote,
  insertHorizontalRule,
  insertTable,
  listKind,
  markActive,
  setHeading,
  setParagraph,
  toggleBlockquote,
  toggleBold,
  toggleCode,
  toggleCodeBlock,
  toggleItalic,
  toggleList,
  toggleStrike,
  toggleUnderline,
  type BlockKind,
} from "./editor/commands";
import { SHORTCUTS, shortcutLabel } from "./editor/keymap";
import { schema } from "./editor/schema";

export interface ToolbarProps {
  view: EditorView;
  state: EditorState;
  status: string;
  onLink: () => void;
  onImage: () => void;
  onCopyMarkdown: () => void;
}

const BLOCK_LABELS: Record<BlockKind, string> = {
  paragraph: "Text",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  h4: "Heading 4",
  h5: "Heading 5",
  h6: "Heading 6",
  code: "Code block",
  other: "Text",
};

function ToolButton({
  label,
  shortcut,
  active,
  disabled,
  onRun,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onRun: () => void;
  children: ReactNode;
}) {
  const title = shortcut ? `${label} (${shortcutLabel(shortcut)})` : label;
  return (
    <button
      type="button"
      title={title}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      // Keep the editor's selection: act on click without taking focus.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onRun}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />;
}

export function Toolbar({ view, state, status, onLink, onImage, onCopyMarkdown }: ToolbarProps) {
  const run = (cmd: Command) => () => {
    cmd(view.state, view.dispatch, view);
    view.focus();
  };
  const can = (cmd: Command) => cmd(state, undefined, view);
  const kind = blockKind(state);
  const list = listKind(state);
  const inTable = isInTable(state);
  const iconCls = "size-4";
  const refocus = (e: Event) => {
    e.preventDefault();
    view.focus();
  };

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      // Wraps to a second row in a narrow panel rather than hiding buttons.
      className="flex min-h-11 shrink-0 flex-wrap items-center gap-0.5 border-b border-border px-2 py-[0.3125rem]"
    >
      <ToolButton label="Undo" shortcut={SHORTCUTS.undo} disabled={!can(undo)} onRun={run(undo)}>
        <Undo2 className={iconCls} />
      </ToolButton>
      <ToolButton label="Redo" shortcut={SHORTCUTS.redo} disabled={!can(redo)} onRun={run(redo)}>
        <Redo2 className={iconCls} />
      </ToolButton>
      <Divider />

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-meta text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label="Text style"
          >
            <span className="w-[5.5rem] truncate text-left">{BLOCK_LABELS[kind]}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-48" onCloseAutoFocus={refocus}>
          <DropdownMenuItem onSelect={run(setParagraph)}>
            Text<DropdownMenuShortcut>{shortcutLabel(SHORTCUTS.paragraph)}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={run(setHeading(1))} className="text-lg font-semibold">
            Heading 1<DropdownMenuShortcut>{shortcutLabel(SHORTCUTS.h1)}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={run(setHeading(2))} className="text-base font-semibold">
            Heading 2<DropdownMenuShortcut>{shortcutLabel(SHORTCUTS.h2)}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={run(setHeading(3))} className="font-semibold">
            Heading 3<DropdownMenuShortcut>{shortcutLabel(SHORTCUTS.h3)}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={run(toggleCodeBlock)} className="font-mono text-meta">
            Code block<DropdownMenuShortcut>{shortcutLabel(SHORTCUTS.codeBlock)}</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Divider />

      <ToolButton label="Bold" shortcut={SHORTCUTS.bold} active={markActive(state, schema.marks.strong)} onRun={run(toggleBold)}>
        <Bold className={iconCls} />
      </ToolButton>
      <ToolButton label="Italic" shortcut={SHORTCUTS.italic} active={markActive(state, schema.marks.em)} onRun={run(toggleItalic)}>
        <Italic className={iconCls} />
      </ToolButton>
      <ToolButton
        label="Underline"
        shortcut={SHORTCUTS.underline}
        active={markActive(state, schema.marks.underline)}
        onRun={run(toggleUnderline)}
      >
        <Underline className={iconCls} />
      </ToolButton>
      <ToolButton
        label="Strikethrough"
        shortcut={SHORTCUTS.strike}
        active={markActive(state, schema.marks.strike)}
        onRun={run(toggleStrike)}
      >
        <Strikethrough className={iconCls} />
      </ToolButton>
      <ToolButton
        label="Inline code"
        shortcut={SHORTCUTS.code}
        active={markActive(state, schema.marks.code)}
        onRun={run(toggleCode)}
      >
        <Code className={iconCls} />
      </ToolButton>
      <ToolButton label="Link" shortcut={SHORTCUTS.link} active={markActive(state, schema.marks.link)} onRun={onLink}>
        <Link className={iconCls} />
      </ToolButton>
      <Divider />

      <ToolButton label="Bulleted list" shortcut={SHORTCUTS.bullet} active={list === "bullet"} onRun={run(toggleList("bullet"))}>
        <List className={iconCls} />
      </ToolButton>
      <ToolButton
        label="Numbered list"
        shortcut={SHORTCUTS.ordered}
        active={list === "ordered"}
        onRun={run(toggleList("ordered"))}
      >
        <ListOrdered className={iconCls} />
      </ToolButton>
      <ToolButton label="Checklist" shortcut={SHORTCUTS.task} active={list === "task"} onRun={run(toggleList("task"))}>
        <ListChecks className={iconCls} />
      </ToolButton>
      <ToolButton label="Quote" active={inBlockquote(state)} onRun={run(toggleBlockquote)}>
        <TextQuote className={iconCls} />
      </ToolButton>
      <Divider />

      {inTable ? (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              aria-label="Table"
              title="Table"
              className="inline-flex h-7 shrink-0 items-center gap-0.5 rounded-md bg-muted px-1.5 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <Table className={iconCls} />
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-52" onCloseAutoFocus={refocus}>
            <DropdownMenuItem onSelect={run(addRowBefore)}>Insert row above</DropdownMenuItem>
            <DropdownMenuItem onSelect={run(addRowAfter)}>Insert row below</DropdownMenuItem>
            <DropdownMenuItem onSelect={run(addColumnBefore)}>Insert column left</DropdownMenuItem>
            <DropdownMenuItem onSelect={run(addColumnAfter)}>Insert column right</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={run(alignColumn("left"))}>
              <AlignLeft /> Align column left
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={run(alignColumn("center"))}>
              <AlignCenter /> Align column center
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={run(alignColumn("right"))}>
              <AlignRight /> Align column right
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={run(deleteRow)}>Delete row</DropdownMenuItem>
            <DropdownMenuItem onSelect={run(deleteColumn)}>Delete column</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={run(deleteTable)}>
              Delete table
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <ToolButton label="Insert table" onRun={run(insertTable(3, 3))} disabled={!can(insertTable(3, 3))}>
          <Table className={iconCls} />
        </ToolButton>
      )}
      <ToolButton label="Divider" onRun={run(insertHorizontalRule)} disabled={!can(insertHorizontalRule)}>
        <Minus className={iconCls} />
      </ToolButton>
      <ToolButton label="Insert image" onRun={onImage}>
        <ImagePlus className={iconCls} />
      </ToolButton>

      <span className="min-w-2 flex-1" />
      <span className="shrink-0 whitespace-nowrap px-1 text-meta text-muted-foreground" aria-live="polite">
        {status}
      </span>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            aria-label="More"
            title="More"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Ellipsis className={iconCls} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48" onCloseAutoFocus={refocus}>
          <DropdownMenuItem onSelect={onCopyMarkdown}>
            <Copy /> Copy as Markdown
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
