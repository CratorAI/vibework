/**
 * Node views: images (relative paths resolved against the document's folder),
 * task list items (checkbox), code blocks (language field) and raw blocks
 * (Markdown the editor does not model, shown as source with an editor).
 */

import type { Node as PMNode } from "prosemirror-model";
import { Selection } from "prosemirror-state";
import type { EditorView, NodeView, ViewMutationRecord } from "prosemirror-view";

type GetPos = () => number | undefined;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class ImageView implements NodeView {
  dom: HTMLElement;
  private img: HTMLImageElement;
  private missing: HTMLElement;

  constructor(
    private node: PMNode,
    private resolve: (src: string) => string,
  ) {
    this.dom = el("span", "vw-image");
    this.img = el("img");
    this.img.draggable = false;
    this.missing = el("span", "vw-image-missing");
    this.img.addEventListener("error", () => {
      this.dom.classList.add("is-missing");
    });
    this.img.addEventListener("load", () => this.dom.classList.remove("is-missing"));
    this.dom.append(this.img, this.missing);
    this.render();
  }

  private render() {
    const { src, alt, title } = this.node.attrs;
    this.dom.classList.remove("is-missing");
    this.img.src = src ? this.resolve(src) : "";
    this.img.alt = alt;
    if (title) this.img.title = title;
    else this.img.removeAttribute("title");
    this.missing.textContent = `Image not found: ${src}`;
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    const changed = node.attrs.src !== this.node.attrs.src || node.attrs.alt !== this.node.attrs.alt || node.attrs.title !== this.node.attrs.title;
    this.node = node;
    if (changed) this.render();
    return true;
  }

  selectNode() {
    this.dom.classList.add("is-selected");
  }

  deselectNode() {
    this.dom.classList.remove("is-selected");
  }
}

export class ListItemView implements NodeView {
  dom: HTMLLIElement;
  contentDOM: HTMLElement;
  private box: HTMLInputElement;
  private boxWrap: HTMLElement;

  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: GetPos,
  ) {
    this.dom = el("li");
    this.boxWrap = el("span", "vw-task-box");
    this.boxWrap.contentEditable = "false";
    this.box = el("input");
    this.box.type = "checkbox";
    this.box.tabIndex = -1;
    this.box.setAttribute("aria-label", "Done");
    this.box.addEventListener("mousedown", (e) => e.preventDefault());
    this.box.addEventListener("click", (e) => {
      e.preventDefault();
      const pos = this.getPos();
      if (pos === undefined || !this.view.editable) return;
      const checked = !this.node.attrs.checked;
      this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, checked }));
    });
    this.boxWrap.append(this.box);
    this.contentDOM = el("div", "vw-li-body");
    this.dom.append(this.boxWrap, this.contentDOM);
    this.render();
  }

  private render() {
    const task = this.node.attrs.checked !== null;
    this.dom.classList.toggle("vw-task", task);
    this.dom.classList.toggle("is-checked", this.node.attrs.checked === true);
    this.boxWrap.hidden = !task;
    this.box.checked = this.node.attrs.checked === true;
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  stopEvent(e: Event) {
    return this.boxWrap.contains(e.target as Node);
  }

  ignoreMutation(m: ViewMutationRecord) {
    return this.boxWrap.contains(m.target as Node);
  }
}

export class CodeBlockView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private lang: HTMLInputElement;

  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: GetPos,
  ) {
    this.dom = el("div", "vw-code");
    const pre = el("pre");
    this.contentDOM = el("code");
    pre.append(this.contentDOM);
    const bar = el("div", "vw-code-lang");
    bar.contentEditable = "false";
    this.lang = el("input");
    this.lang.placeholder = "language";
    this.lang.spellcheck = false;
    this.lang.setAttribute("aria-label", "Code language");
    this.lang.value = node.attrs.lang;
    const commit = () => {
      const pos = this.getPos();
      const value = this.lang.value.trim().replace(/\s+/g, "");
      if (pos === undefined || value === this.node.attrs.lang) return;
      this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, lang: value }));
    };
    this.lang.addEventListener("change", commit);
    this.lang.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        commit();
        this.view.focus();
      }
    });
    bar.append(this.lang);
    this.dom.append(bar, pre);
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    if (document.activeElement !== this.lang) this.lang.value = node.attrs.lang;
    return true;
  }

  stopEvent(e: Event) {
    return e.target === this.lang;
  }

  ignoreMutation(m: ViewMutationRecord) {
    return !this.contentDOM.contains(m.target as Node);
  }
}

const RAW_LABELS: Record<string, string> = {
  html: "HTML",
  frontmatter: "Front matter",
  footnote: "Footnote",
  definition: "Link definition",
  math: "Math",
  markdown: "Markdown",
};

export class RawBlockView implements NodeView {
  dom: HTMLElement;
  private pre: HTMLElement;
  private label: HTMLElement;
  private editing: HTMLTextAreaElement | null = null;
  private body: HTMLElement;

  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: GetPos,
  ) {
    this.dom = el("div", "vw-raw");
    this.dom.contentEditable = "false";
    const head = el("div", "vw-raw-head");
    this.label = el("span", "vw-raw-label");
    const edit = el("button", "vw-raw-btn", "Edit source");
    edit.type = "button";
    edit.addEventListener("click", () => this.startEditing());
    head.append(this.label, edit);
    this.body = el("div", "vw-raw-body");
    this.pre = el("pre", "vw-raw-src");
    this.body.append(this.pre);
    this.dom.append(head, this.body);
    this.dom.addEventListener("dblclick", () => this.startEditing());
    this.render();
  }

  private render() {
    this.label.textContent = RAW_LABELS[this.node.attrs.kind] ?? "Markdown";
    this.dom.title = "Kept exactly as written in the file";
    this.pre.textContent = this.node.attrs.source;
  }

  private startEditing() {
    if (this.editing || !this.view.editable) return;
    const ta = el("textarea", "vw-raw-input");
    ta.value = this.node.attrs.source;
    ta.spellcheck = false;
    ta.rows = Math.min(30, Math.max(2, this.node.attrs.source.split("\n").length + 1));
    const actions = el("div", "vw-raw-actions");
    const done = el("button", "vw-raw-btn is-primary", "Done");
    done.type = "button";
    const cancel = el("button", "vw-raw-btn", "Cancel");
    cancel.type = "button";
    actions.append(cancel, done);
    const finish = (save: boolean) => {
      if (!this.editing) return;
      const value = ta.value;
      this.editing = null;
      this.body.replaceChildren(this.pre);
      this.dom.classList.remove("is-editing");
      const pos = this.getPos();
      if (save && pos !== undefined && value !== this.node.attrs.source) {
        this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, source: value }));
      }
      this.view.focus();
      // Put the cursor after the block (selecting it would let the next keystroke replace it).
      if (pos !== undefined) {
        try {
          const doc = this.view.state.doc;
          const after = Math.min(pos + (doc.nodeAt(pos)?.nodeSize ?? 0), doc.content.size);
          this.view.dispatch(this.view.state.tr.setSelection(Selection.near(doc.resolve(after))));
        } catch {
          /* node may have been replaced */
        }
      }
    };
    done.addEventListener("click", () => finish(true));
    cancel.addEventListener("click", () => finish(false));
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        finish(true);
      }
    });
    ta.addEventListener("input", () => {
      ta.rows = Math.min(30, Math.max(2, ta.value.split("\n").length + 1));
    });
    this.editing = ta;
    this.dom.classList.add("is-editing");
    this.body.replaceChildren(ta, actions);
    ta.focus();
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    if (!this.editing) this.render();
    return true;
  }

  selectNode() {
    this.dom.classList.add("is-selected");
  }

  deselectNode() {
    this.dom.classList.remove("is-selected");
  }

  stopEvent(e: Event) {
    const t = e.target as HTMLElement;
    return Boolean(this.editing) || t.tagName === "BUTTON";
  }

  ignoreMutation() {
    return true;
  }
}
