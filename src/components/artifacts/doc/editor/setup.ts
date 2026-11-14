/** Plugins and view props for the Doc editor. */

import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import { history } from "prosemirror-history";
import { Fragment, Slice, type Node as PMNode, type ResolvedPos } from "prosemirror-model";
import { Plugin, type Command } from "prosemirror-state";
import { tableEditing } from "prosemirror-tables";
import { Decoration, DecorationSet, type EditorProps, type EditorView } from "prosemirror-view";
import { parseMarkdownFragment, DEFAULT_STYLE } from "../markdown/parse";
import { documentToMarkdown } from "../markdown/serialize";
import { insertImages } from "./commands";
import { buildInputRules } from "./inputRules";
import { buildKeymaps } from "./keymap";
import { CodeBlockView, ImageView, ListItemView, RawBlockView } from "./nodeViews";
import { schema } from "./schema";

export interface EditorEnv {
  /** URL to display an image `src` from the file (relative paths resolve against the document) */
  resolveImage(src: string): string;
  /** Save pasted/dropped image files next to the document; returns the Markdown paths */
  saveImages(files: File[]): Promise<{ src: string; alt: string }[]>;
  /** Open a link target (web URL or a file in the working folder) */
  openLink(href: string): void;
  /** Mod-K: open the link editor for the selection */
  openLinkEditor(): void;
}

function placeholder(text: string) {
  return new Plugin({
    props: {
      decorations(state) {
        const doc = state.doc;
        const first = doc.firstChild;
        if (doc.childCount !== 1 || !first || first.type !== schema.nodes.paragraph || first.content.size) return null;
        return DecorationSet.create(doc, [
          Decoration.node(0, first.nodeSize, { class: "vw-placeholder", "data-placeholder": text }),
        ]);
      },
    },
  });
}

export function buildPlugins(env: EditorEnv): Plugin[] {
  const openLinkEditor: Command = (_state, dispatch) => {
    if (dispatch) env.openLinkEditor();
    return true;
  };
  return [
    buildInputRules(),
    ...buildKeymaps(openLinkEditor),
    history(),
    dropCursor({ class: "vw-dropcursor", color: false, width: 2 }),
    gapCursor(),
    tableEditing(),
    placeholder("Start writing, or type # for a heading, - for a list…"),
  ];
}

function imageFiles(list: FileList | null | undefined): File[] {
  return list ? Array.from(list).filter((f) => f.type.startsWith("image/")) : [];
}

/** Plain text pasted into the document is read as Markdown (Shift-paste keeps it plain) */
function textToSlice(text: string, $context: ResolvedPos, plain: boolean): Slice {
  const lines = text.replace(/\r\n?/g, "\n");
  if ($context.parent.type.spec.code) return new Slice(Fragment.from(schema.text(lines)), 0, 0);
  if (plain || $context.parent.type.spec.tableRole) {
    const paras = lines.split(/\n{2,}/).map((p) => schema.nodes.paragraph.create(null, p ? schema.text(p) : null));
    if ($context.parent.type.spec.tableRole) return new Slice(Fragment.from(schema.text(lines.replace(/\n+/g, " "))), 0, 0);
    return paras.length === 1 ? new Slice(Fragment.from(paras[0]), 1, 1) : new Slice(Fragment.from(paras), 1, 1);
  }
  const nodes = parseMarkdownFragment(lines);
  if (nodes.length === 1 && nodes[0].type === schema.nodes.paragraph) return new Slice(Fragment.from(nodes[0]), 1, 1);
  return new Slice(Fragment.from(nodes), 0, 0);
}

/** Copy puts Markdown on the clipboard as the plain-text flavour */
function sliceToMarkdown(slice: Slice): string {
  try {
    let content = slice.content;
    if (content.firstChild?.isInline) content = Fragment.from(schema.nodes.paragraph.create(null, content));
    const blocks: PMNode[] = [];
    content.forEach((n) => blocks.push(n.type === schema.nodes.table_row ? schema.nodes.table.create(null, n) : n));
    const doc = schema.nodes.doc.create(null, blocks);
    return documentToMarkdown(doc, DEFAULT_STYLE).replace(/\n$/, "");
  } catch {
    return slice.content.textBetween(0, slice.content.size, "\n\n");
  }
}

export function buildViewProps(env: EditorEnv): Partial<EditorProps> {
  const insertSaved = (view: EditorView, files: File[], pos?: number) => {
    void env.saveImages(files).then((images) => {
      if (images.length) insertImages(images, pos)(view.state, view.dispatch);
    });
  };
  return {
    nodeViews: {
      image: (node) => new ImageView(node, env.resolveImage),
      list_item: (node, view, getPos) => new ListItemView(node, view, getPos),
      code_block: (node, view, getPos) => new CodeBlockView(node, view, getPos),
      raw_block: (node, view, getPos) => new RawBlockView(node, view, getPos),
    },
    clipboardTextParser: (text, $context, plain) => textToSlice(text, $context, plain),
    clipboardTextSerializer: (slice) => sliceToMarkdown(slice),
    handlePaste(view, event) {
      const files = imageFiles(event.clipboardData?.files);
      if (!files.length) return false;
      insertSaved(view, files);
      return true;
    },
    handleDrop(view, event) {
      const files = imageFiles((event as DragEvent).dataTransfer?.files);
      if (!files.length) return false;
      const at = view.posAtCoords({ left: (event as DragEvent).clientX, top: (event as DragEvent).clientY });
      insertSaved(view, files, at?.pos);
      return true;
    },
    handleDOMEvents: {
      // Cmd/Ctrl-click opens a link
      click(view, event) {
        const a = (event.target as HTMLElement).closest("a[href]");
        if (!a || !view.dom.contains(a)) return false;
        // Never navigate the app window; a plain click just places the cursor.
        event.preventDefault();
        if (!(event.metaKey || event.ctrlKey)) return false;
        env.openLink(a.getAttribute("href") || "");
        return true;
      },
    },
  };
}
