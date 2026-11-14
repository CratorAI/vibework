/**
 * Doc artifact editor: a Markdown file edited as a rich-text document.
 *
 * Loading, autosave and outside-change handling live in DocSession; the
 * Markdown <-> document mapping (and the guarantee that unchanged parts of the
 * file are written back byte-for-byte) lives in ./markdown.
 */

import "./doc.css";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { TableView } from "prosemirror-tables";
import { toast } from "sonner";
import { readArtifact, writeArtifact } from "@/tauri/artifacts";
import { openUrl } from "@/tauri/files";
import type { ArtifactViewProps } from "../types";
import { parseMarkdown } from "./markdown/parse";
import { DocSession, type SessionStatus } from "./session";
import { buildPlugins, buildViewProps, type EditorEnv } from "./editor/setup";
import { insertImages } from "./editor/commands";
import { linkTargetPath, resolveImageUrl, saveImagesNextTo } from "./files";
import { Toolbar } from "./Toolbar";
import { LinkBubble } from "./LinkBubble";

interface LoadedFile {
  text: string;
  url: string;
  modifiedMs: number;
}

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; file: LoadedFile };

function errorText(err: unknown): string {
  if (typeof err === "object" && err && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export default function DocEditor(props: ArtifactViewProps) {
  const { sessionId, path } = props.artifact;
  const [load, setLoad] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setLoad({ status: "loading" });
    readArtifact(sessionId, path)
      .then((f) => {
        if (cancelled) return;
        // An empty file may be reported without text.
        const text = f.text ?? (f.size === 0 ? "" : null);
        if (text === null) setLoad({ status: "error", message: "This file is not a text file." });
        else setLoad({ status: "ready", file: { text, url: f.url, modifiedMs: f.modifiedMs } });
      })
      .catch((err) => !cancelled && setLoad({ status: "error", message: errorText(err) }));
    return () => {
      cancelled = true;
    };
  }, [sessionId, path]);

  if (load.status === "loading") {
    return <div className="flex h-full items-center justify-center text-meta text-muted-foreground">Opening…</div>;
  }
  if (load.status === "error") {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-meta text-muted-foreground">
        Could not open this document. {load.message}
      </div>
    );
  }
  return <DocSurface key={`${sessionId}:${path}`} file={load.file} {...props} />;
}

function statusLabel(s: SessionStatus): string {
  if (s.saving) return "Saving…";
  if (s.conflict) return "Not saved";
  if (s.dirty) return "Edited";
  return "Saved";
}

function DocSurface({ file, ...props }: ArtifactViewProps & { file: LoadedFile }) {
  const { artifact } = props;
  const mountRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const [view, setView] = useState<EditorView | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const sessionRef = useRef<DocSession | null>(null);
  const [status, setStatus] = useState<SessionStatus>({ dirty: false, saving: false, conflict: null, error: null });
  const [linkEditing, setLinkEditing] = useState(false);
  const [focused, setFocused] = useState(false);

  const openLink = useCallback(
    (href: string) => {
      const target = linkTargetPath(artifact.path, href);
      if (target) propsRef.current.onOpenArtifact?.(target);
      else if (/^(https?|mailto):/i.test(href)) void openUrl(href);
    },
    [artifact.path],
  );

  const saveImages = useCallback(
    async (files: File[]) => {
      try {
        return await saveImagesNextTo(artifact.sessionId, artifact.path, artifact.name, files);
      } catch (err) {
        toast.error(`Could not save the image: ${errorText(err)}`);
        return [];
      }
    },
    [artifact.sessionId, artifact.path, artifact.name],
  );

  useLayoutEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const parsed = parseMarkdown(file.text);
    const env: EditorEnv = {
      resolveImage: (src) => resolveImageUrl(src, file.url),
      saveImages,
      openLink,
      openLinkEditor: () => setLinkEditing(true),
    };
    let session: DocSession | null = null;
    const v = new EditorView(mount, {
      state: EditorState.create({ doc: parsed.doc, plugins: buildPlugins(env) }),
      ...buildViewProps(env),
      nodeViews: {
        ...buildViewProps(env).nodeViews,
        table: (node) => new TableView(node, 80),
      },
      attributes: {
        "aria-label": artifact.name,
        "aria-multiline": "true",
        role: "textbox",
        spellcheck: "true",
      },
      dispatchTransaction(tr) {
        const next = v.state.apply(tr);
        v.updateState(next);
        session?.onTransaction(tr);
        setEditorState(next);
      },
      handleDOMEvents: {
        ...buildViewProps(env).handleDOMEvents,
        focus: () => {
          setFocused(true);
          return false;
        },
        blur: (_view, event) => {
          // Stay "focused" while moving into the link box or toolbar menus.
          const to = (event as FocusEvent).relatedTarget as Node | null;
          if (!to || !contentRef.current?.contains(to)) setFocused(false);
          void session?.flush();
          return false;
        },
      },
    });
    session = new DocSession(
      {
        read: async () => {
          const f = await readArtifact(artifact.sessionId, artifact.path);
          if (f.text === null && f.size > 0) throw new Error("The file is no longer a text file.");
          return { text: f.text ?? "", modifiedMs: f.modifiedMs };
        },
        write: async (text) => {
          const stat = await writeArtifact(artifact.sessionId, artifact.path, { text });
          return { modifiedMs: stat.modifiedMs };
        },
      },
      {
        getState: () => v.state,
        dispatch: (tr) => v.dispatch(tr),
        onStatus: setStatus,
        onDirtyChange: (d) => propsRef.current.onDirtyChange?.(d),
        onConflict: (info) => propsRef.current.onConflict?.(info),
      },
      file.text,
      parsed.map,
      parsed.doc,
      file.modifiedMs,
    );
    sessionRef.current = session;
    // Shortcuts handled by the editor (Mod-B, Mod-K, ...) must not reach app-wide listeners.
    const stopHandled = (e: KeyboardEvent) => {
      if (e.defaultPrevented) e.stopPropagation();
    };
    mount.addEventListener("keydown", stopHandled);
    setView(v);
    setEditorState(v.state);
    return () => {
      mount.removeEventListener("keydown", stopHandled);
      session?.dispose();
      sessionRef.current = null;
      v.destroy();
    };
    // The surface is keyed by file; it is created once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Outside changes: the panel reports a new modification time.
  const initialMs = useRef(props.modifiedMs);
  useEffect(() => {
    if (props.modifiedMs === initialMs.current) return;
    initialMs.current = -1;
    void sessionRef.current?.diskModified(props.modifiedMs);
  }, [props.modifiedMs]);

  const copyMarkdown = useCallback(async () => {
    const md = sessionRef.current?.currentMarkdown();
    if (md === undefined) return;
    try {
      await navigator.clipboard.writeText(md);
      toast.success("Copied as Markdown");
    } catch (err) {
      toast.error(`Could not copy: ${errorText(err)}`);
    }
  }, []);

  const pickImages = useCallback(() => fileInputRef.current?.click(), []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      {view && editorState && (
        <Toolbar
          view={view}
          state={editorState}
          status={statusLabel(status)}
          onLink={() => setLinkEditing(true)}
          onImage={pickImages}
          onCopyMarkdown={copyMarkdown}
        />
      )}
      {status.conflict && (
        <div
          role="alert"
          className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-warning-muted px-4 py-2 text-meta"
        >
          <span className="min-w-0 flex-1 text-foreground">
            This file was changed outside the editor while you had unsaved edits.
          </span>
          <button
            type="button"
            onClick={() => void sessionRef.current?.reloadFromDisk()}
            className="rounded-md px-2 py-1 font-medium text-foreground hover:bg-background/60"
          >
            Reload from disk
          </button>
          <button
            type="button"
            onClick={() => void sessionRef.current?.keepMine()}
            className="rounded-md bg-foreground px-2 py-1 font-medium text-background hover:bg-foreground/85"
          >
            Keep mine
          </button>
        </div>
      )}
      {status.error && !status.conflict && (
        <div role="alert" className="shrink-0 border-b border-border bg-destructive-muted px-4 py-2 text-meta text-destructive">
          {status.error}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto" data-doc-scroll>
        <div ref={contentRef} className="vw-doc relative mx-auto w-full max-w-[44rem] px-6 pt-8 sm:px-10">
          <div ref={mountRef} />
          {view && editorState && (
            <LinkBubble
              view={view}
              state={editorState}
              container={contentRef.current}
              editing={linkEditing}
              onEditingChange={setLinkEditing}
              focused={focused}
              onOpen={openLink}
            />
          )}
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (!files.length || !view) return;
          void saveImages(files).then((images) => {
            if (images.length) insertImages(images)(view.state, view.dispatch);
            view.focus();
          });
        }}
      />
    </div>
  );
}
