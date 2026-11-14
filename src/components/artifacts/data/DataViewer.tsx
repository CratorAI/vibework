import { useEffect, useMemo, useRef, useState } from "react";
import type { ArtifactViewProps } from "../types";
import { useDeckFile } from "../slides/useDeckFile";
import {
  createInlineArtifact,
  releaseInlineArtifact,
  readArtifact,
  writeArtifact,
  watchArtifact,
  unwatchArtifact,
  onArtifactChanged,
} from "@/tauri/artifacts";
import { Button } from "@/components/ui/button";
import { parse, reference, editLine, editNote, type Dashboard } from "./core";
import { resolve } from "./sources";
import { page } from "./page";
export default function DataViewer(props: ArtifactViewProps) {
  const file = useDeckFile(props),
    frame = useRef<HTMLIFrameElement>(null);
  const [sourceView, setSourceView] = useState(false),
    [dark, setDark] = useState(false),
    [revision, setRevision] = useState(0),
    [url, setUrl] = useState(""),
    [notice, setNotice] = useState(""),
    [updated, setUpdated] = useState<Date | null>(null),
    [resolved, setResolved] = useState<Dashboard | null>(null);
  const parsed = useMemo(() => parse(file.source), [file.source]);
  const paths = useMemo(
    () =>
      JSON.stringify([
        ...new Set(
          parsed.blocks.flatMap((b) => {
            try {
              return b.options.data ? [reference(b.options.data).path] : [];
            } catch {
              return [];
            }
          }),
        ),
      ]),
    [parsed],
  );
  useEffect(() => {
    let stopped = false;
    const ids: string[] = [];
    let off: (() => void) | undefined;
    void (async () => {
      try {
        off = await onArtifactChanged((e) => {
          if (ids.includes(e.watchId)) setRevision((n) => n + 1);
        });
        if (stopped) {
          off();
          return;
        }
        const files: string[] = JSON.parse(paths);
        if (files.length > 8)
          setNotice(
            "Only the first 8 source files are watched. Refresh to update others.",
          );
        for (const path of files.slice(0, 8)) {
          try {
            const id = await watchArtifact(props.artifact.sessionId, path);
            if (stopped) {
              await unwatchArtifact(id);
              break;
            }
            ids.push(id);
          } catch {
            if (!stopped)
              setNotice(
                "Some sources cannot be watched. Use Refresh after editing them.",
              );
          }
        }
      } catch {
        if (!stopped) setNotice("Live refresh unavailable. Use Refresh.");
      }
    })();
    return () => {
      stopped = true;
      off?.();
      ids.forEach((id) => void unwatchArtifact(id));
    };
  }, [paths, props.artifact.sessionId]);
  useEffect(() => {
    let stopped = false;
    void resolve(parsed, (p) => readArtifact(props.artifact.sessionId, p)).then(
      (d) => {
        if (!stopped) {
          setResolved(d);
          setUpdated(new Date());
        }
      },
    );
    return () => {
      stopped = true;
    };
  }, [parsed, revision, props.artifact.sessionId]);
  useEffect(() => {
    if (!resolved) return;
    let stopped = false,
      id: string | undefined;
    void createInlineArtifact(page(resolved, dark))
      .then((v) => {
        id = v.id;
        if (stopped) void releaseInlineArtifact(id);
        else setUrl(v.url);
      })
      .catch((e) => setNotice(String(e)));
    return () => {
      stopped = true;
      if (id) void releaseInlineArtifact(id);
    };
  }, [resolved, dark]);
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const m = e.data;
      if (m?.type === "data-focus") file.setEditing(true);
      if (
        m?.type === "data-edit" &&
        typeof m.text === "string" &&
        m.text.length < 10000
      ) {
        if (m.title)
          file.update(editLine(file.source, parsed.titleLine, `# ${m.text}`));
        else {
          const b = parsed.blocks.find(
            (b) => b.line === m.line && b.kind === "note",
          );
          if (b) file.update(editNote(file.source, b, m.text));
        }
        file.setEditing(false);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [file, parsed]);
  async function exportHtml() {
    if (!resolved) return;
    try {
      const path = props.artifact.path.replace(
        /\.dashboard\.md$/i,
        ".dashboard.html",
      );
      await writeArtifact(props.artifact.sessionId, path, {
        text: page(resolved, dark, false),
      });
      setNotice(`Exported ${path.split("/").pop()}`);
    } catch (e) {
      setNotice(String(e));
    }
  }
  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1 text-xs">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setRevision((n) => n + 1)}
        >
          Refresh
        </Button>
        <span className="mr-auto text-muted-foreground">
          {updated
            ? `Updated ${updated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "Reading data…"}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setDark((v) => !v)}>
          {dark ? "Light" : "Dark"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void exportHtml()}>
          Export HTML
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            file.setEditing(false);
            setSourceView((v) => !v);
          }}
        >
          {sourceView ? "Preview" : "Source"}
        </Button>
      </div>
      {(notice || file.error) && (
        <p role="status" className="px-3 py-2 text-xs text-muted-foreground">
          {file.error || notice}
        </p>
      )}
      {file.conflict && (
        <div className="px-3 py-2 text-sm">
          File changed outside this editor.
          <Button variant="ghost" onClick={file.reloadFromDisk}>
            Use disk version
          </Button>
          <Button variant="ghost" onClick={file.keepMine}>
            Keep my edits
          </Button>
        </div>
      )}
      {sourceView ? (
        <textarea
          aria-label="Dashboard source"
          className="min-h-0 flex-1 resize-none bg-background p-4 font-mono text-xs focus-visible:ring-2 focus-visible:ring-ring"
          value={file.source}
          onChange={(e) => file.update(e.target.value)}
        />
      ) : url ? (
        <iframe
          ref={frame}
          title="Data dashboard"
          className="min-h-0 flex-1 w-full border-0"
          sandbox="allow-scripts allow-forms allow-popups allow-modals"
          referrerPolicy="no-referrer"
          src={url}
        />
      ) : (
        <div className="m-6 h-48 animate-pulse rounded-md bg-muted" />
      )}
    </div>
  );
}
