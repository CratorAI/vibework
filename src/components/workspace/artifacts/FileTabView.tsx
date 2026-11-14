/**
 * An open file's tab: its editor/viewer below the strip, and its actions
 * (preview/code, reload, copy, download as HTML, open in default app, show in
 * Finder) at the right end of the strip, rendered into `actionsSlot`. The
 * actions sit as icons when the panel is wide and fold into a "…" menu when
 * it is not.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Check, Code, Copy, Download, ExternalLink, Eye, FolderOpen, MoreHorizontal, RotateCw } from "@/lib/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { artifactTypeById, resolveArtifactType } from "@/components/artifacts/registry";
import { EXPORT_HTML_TYPES, GENERIC_TYPES, SOURCE_VIEW_TYPES } from "@/components/artifacts/viewers/all";
import { dirName, resolvePath } from "@/components/artifacts/viewers/paths";
import type { ArtifactRef } from "@/components/artifacts/types";
import { Spinner } from "@/components/ui/spinner";
import { readArtifact, isArtifactError } from "@/tauri/artifacts";
import { openFile, revealInFinder } from "@/tauri/files";
import { cn, errorMessage } from "@/lib/utils";
import { EASE_OUT_CSS, prefersReducedMotion, useArrivedKey } from "@/lib/motion";
import { workspaceStore, type FileTab } from "../store";
import { openArtifactInPanel } from "../actions";
import { ConfirmDialog } from "../ConfirmDialog";
import { IconButton } from "../IconButton";
import { ArtifactHost } from "./ArtifactHost";
import { useArtifactWatch } from "./useArtifactWatch";

export function FileTabView({
  allowNative,
  sessionId,
  entry,
  agentBusy,
  actionsSlot,
}: {
  allowNative?: boolean;
  sessionId: string;
  entry: FileTab;
  agentBusy: boolean;
  /** Where in the strip the file's actions go */
  actionsSlot: HTMLElement | null;
}) {
  const [reloadKey, setReloadKey] = useState(0);
  const [pendingReload, setPendingReload] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  const live = useArtifactWatch(sessionId, entry.path, reloadKey);

  // A file opened while the panel shows fades in; switching to a file that
  // was already open does not move.
  const hostRef = useRef<HTMLDivElement>(null);
  const arrivedName = useArrivedKey(entry.name, sessionId);
  useEffect(() => {
    const el = hostRef.current;
    if (!el || arrivedName !== entry.name || prefersReducedMotion()) return;
    const anim = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: EASE_OUT_CSS });
    return () => anim.cancel();
  }, [entry.name, arrivedName]);

  const type = live.stat?.artifactType ? artifactTypeById(live.stat.artifactType) ?? null : resolveArtifactType(entry.name);
  const isGeneric = !!type && GENERIC_TYPES.includes(type);
  const hasSourceView = isGeneric && SOURCE_VIEW_TYPES.has(type.id);
  const canExport = isGeneric && EXPORT_HTML_TYPES.has(type.id);
  const canonicalPath = live.stat?.path ?? entry.path;

  // Adopt the canonical path once stat resolves it
  useEffect(() => {
    if (live.stat && live.stat.path !== entry.path) workspaceStore.canonicalizeArtifact(sessionId, entry.path, live.stat.path);
    if (live.stat?.artifactType) workspaceStore.setArtifactType(sessionId, live.stat.path, live.stat.artifactType);
  }, [sessionId, entry.path, live.stat]);

  useEffect(() => setConflict(null), [entry.path]);

  const artifactRef = useMemo<ArtifactRef>(
    () => ({ sessionId, path: canonicalPath, name: entry.name }),
    [sessionId, canonicalPath, entry.name],
  );

  const onDirtyChange = useCallback(
    (dirty: boolean) => workspaceStore.setArtifactDirty(sessionId, entry.path, dirty),
    [sessionId, entry.path],
  );
  const onConflict = useCallback(() => setConflict(entry.path), [entry.path]);
  const onOpenArtifact = useCallback(
    (path: string) => openArtifactInPanel(sessionId, resolvePath(dirName(canonicalPath), path)),
    [sessionId, canonicalPath],
  );

  const reload = () => {
    setConflict(null);
    setReloadKey((k) => k + 1);
  };

  const copyContents = async () => {
    try {
      const file = await readArtifact(sessionId, canonicalPath);
      if (file.text === null) {
        toast.error("This file isn’t text, so it can’t be copied. Use Open in default app instead.");
        return;
      }
      await navigator.clipboard.writeText(file.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      toast.error("Couldn’t copy the file", { description: errorMessage(err) });
    }
  };

  const downloadHtml = async () => {
    if (!type) return;
    setExporting(true);
    try {
      const { exportArtifactAsHtml } = await import("@/components/artifacts/viewers/exportHtml");
      const written = await exportArtifactAsHtml(artifactRef, type.id);
      toast.success("Saved as HTML", { description: written.split(/[\\/]/).pop() });
      await revealInFinder(written).catch(() => {});
    } catch (err) {
      toast.error("Couldn’t save as HTML", { description: isArtifactError(err) ? err.message : errorMessage(err) });
    } finally {
      setExporting(false);
    }
  };

  const runFileAction = async (action: (path: string) => Promise<void>, failure: string) => {
    try {
      await action(canonicalPath);
    } catch (err) {
      toast.error(failure, { description: errorMessage(err) });
    }
  };

  const reloadOrAsk = () => (entry.dirty ? setPendingReload(true) : reload());
  const openExternally = () => runFileAction(openFile, "Couldn’t open the file");
  const reveal = () => runFileAction(revealInFinder, "Couldn’t show the file in Finder");

  const actions = (
    <div className="flex shrink-0 items-center gap-0.5" data-testid="file-actions">
      {hasSourceView && (
        <div className="mr-1 flex h-7 items-center rounded-md bg-muted p-0.5" role="radiogroup" aria-label="View">
          {(["preview", "code"] as const).map((mode) => {
            const label = mode === "preview" ? "Preview" : "Code";
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={entry.mode === mode}
                aria-label={label}
                title={label}
                onClick={() => workspaceStore.setArtifactMode(sessionId, entry.path, mode)}
                className={cn(
                  "grid h-6 w-7 place-items-center rounded-[6px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  entry.mode === mode ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {mode === "preview" ? <Eye className="size-3.5" /> : <Code className="size-3.5" />}
              </button>
            );
          })}
        </div>
      )}
      {/* Wide panel: the actions as icons */}
      <div className="hidden items-center gap-0.5 @min-[720px]/panel:flex">
        <IconButton label="Reload" onClick={reloadOrAsk}>
          <RotateCw />
        </IconButton>
        <IconButton label="Copy contents" onClick={copyContents}>
          {copied ? <Check className="text-success" /> : <Copy />}
        </IconButton>
        {canExport && (
          <IconButton label="Download as HTML" onClick={downloadHtml} disabled={exporting}>
            {exporting ? <Spinner className="size-4" /> : <Download />}
          </IconButton>
        )}
        <IconButton label="Open in default app" onClick={openExternally}>
          <ExternalLink />
        </IconButton>
        <IconButton label="Show in Finder" onClick={reveal}>
          <FolderOpen />
        </IconButton>
      </div>
      {/* Narrower: one "…" menu */}
      <div className="@min-[720px]/panel:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label="File actions">
              <MoreHorizontal />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={reloadOrAsk}>
              <RotateCw className="size-4" />
              Reload
            </DropdownMenuItem>
            <DropdownMenuItem onClick={copyContents}>
              <Copy className="size-4" />
              Copy contents
            </DropdownMenuItem>
            {canExport && (
              <DropdownMenuItem onClick={downloadHtml} disabled={exporting}>
                <Download className="size-4" />
                Download as HTML
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={openExternally}>
              <ExternalLink className="size-4" />
              Open in default app
            </DropdownMenuItem>
            <DropdownMenuItem onClick={reveal}>
              <FolderOpen className="size-4" />
              Show in Finder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {actionsSlot && type?.id !== "motion" && createPortal(actions, actionsSlot)}

      {conflict === entry.path && (
        <div className="flex shrink-0 items-center gap-3 border-b bg-warning-muted px-3 py-2 text-meta text-foreground">
          <span className="min-w-0 flex-1">This file changed on disk while you had unsaved edits.</span>
          <button type="button" className="shrink-0 rounded-sm font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50" onClick={reload}>
            Load the disk version
          </button>
          <button type="button" className="shrink-0 rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50" onClick={() => setConflict(null)}>
            Keep mine
          </button>
        </div>
      )}

      <div ref={hostRef} className="relative min-h-0 flex-1">
        <ArtifactHost allowNative={allowNative}
          artifact={artifactRef}
          type={type}
          mode={hasSourceView ? entry.mode : "preview"}
          live={live}
          agentBusy={agentBusy}
          reloadKey={reloadKey}
          onRetry={reload}
          onDirtyChange={onDirtyChange}
          onConflict={onConflict}
          onConflictResolved={() => setConflict(null)}
          onOpenArtifact={onOpenArtifact}
        />
      </div>

      <ConfirmDialog
        open={pendingReload}
        title="Discard unsaved changes?"
        description={`Reloading ${entry.name} replaces your unsaved edits with the version on disk.`}
        confirmLabel="Discard and reload"
        onCancel={() => setPendingReload(false)}
        onConfirm={() => {
          setPendingReload(false);
          workspaceStore.setArtifactDirty(sessionId, entry.path, false);
          reload();
        }}
      />
    </div>
  );
}
