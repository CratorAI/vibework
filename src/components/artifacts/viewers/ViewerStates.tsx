/**
 * Shared states for artifact views: loading, errors, and the "no preview"
 * card (Open in default app / Reveal in Finder).
 */

import React from "react";
import { ExternalLink, File as FileIcon, Folder } from "@/lib/icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { openFile, revealInFinder, formatFileSize } from "@/tauri/files";
import { isArtifactError } from "@/tauri/artifacts";
import { errorMessage } from "@/lib/utils";

/** Errors that mean "we cannot show this file here", as opposed to a failed read */
export function isNoPreviewError(err: unknown): boolean {
  return (
    isArtifactError(err) &&
    (err.code === "outside_root" || err.code === "too_large" || err.code === "forbidden" || err.code === "is_directory")
  );
}

/** A short sentence for an artifact backend error */
export function describeArtifactError(err: unknown): string {
  if (isArtifactError(err)) {
    switch (err.code) {
      case "not_found":
        return "This file no longer exists.";
      case "outside_root":
        return "This file is outside the conversation's working folder.";
      case "too_large":
        return "This file is too large to preview here.";
      case "no_working_folder":
        return "This conversation has no working folder.";
      case "is_directory":
        return "This is a folder.";
      default:
        return err.message || "Could not read this file.";
    }
  }
  return errorMessage(err, "Could not read this file.");
}

/** Placeholder in the shape of a page while a file or view loads */
export function ViewerLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="h-full min-h-40 px-6 py-6" aria-busy="true" aria-label={label}>
      <div className="mx-auto max-w-2xl space-y-3">
        <Skeleton className="h-5 w-2/5 rounded-sm" />
        <Skeleton className="h-3 w-full rounded-sm" />
        <Skeleton className="h-3 w-11/12 rounded-sm" />
        <Skeleton className="h-3 w-4/5 rounded-sm" />
        <Skeleton className="mt-6 h-3 w-full rounded-sm" />
        <Skeleton className="h-3 w-3/4 rounded-sm" />
      </div>
    </div>
  );
}

export function ViewerMessage({
  title,
  detail,
  tone = "muted",
  children,
}: {
  title: string;
  detail?: string;
  tone?: "muted" | "error";
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-1.5 px-6 text-center">
      <p className={tone === "error" ? "text-sm text-destructive" : "text-sm text-foreground"}>{title}</p>
      {detail && <p className="max-w-sm text-meta text-muted-foreground select-text">{detail}</p>}
      {children && <div className="mt-3 flex items-center gap-2">{children}</div>}
    </div>
  );
}

async function run(action: () => Promise<void>, failure: string) {
  try {
    await action();
  } catch (err) {
    toast.error(failure, { description: errorMessage(err) });
  }
}

/**
 * Card for files the panel cannot render: unknown types, binaries, files
 * outside the working folder, files that are too large.
 */
export function NoPreviewCard({
  path,
  name,
  reason,
  size,
}: {
  path: string;
  name: string;
  reason?: string;
  size?: number;
}) {
  return (
    <div className="flex h-full min-h-60 items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 px-6 py-7 text-center">
        <div className="grid size-11 place-items-center rounded-lg bg-muted">
          <FileIcon className="size-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 max-w-full">
          <div className="truncate text-sm font-medium" title={path}>{name}</div>
          <div className="mt-1 text-meta text-muted-foreground">
            {reason ?? "No preview available for this file type."}
            {size !== undefined && size > 0 ? ` ${formatFileSize(size)}.` : ""}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => run(() => openFile(path), "Couldn’t open the file")}>
            <ExternalLink />
            Open in default app
          </Button>
          <Button variant="ghost" size="sm" onClick={() => run(() => revealInFinder(path), "Couldn’t show the file in Finder")}>
            <Folder />
            Show in Finder
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Error state for a viewer: the no-preview card for "cannot show here" errors, a message otherwise */
export function ViewerError({ error, path, name }: { error: unknown; path: string; name: string }) {
  if (isNoPreviewError(error)) {
    return <NoPreviewCard path={path} name={name} reason={describeArtifactError(error)} />;
  }
  return <ViewerMessage title="Couldn’t load this file" detail={describeArtifactError(error)} tone="error" />;
}
