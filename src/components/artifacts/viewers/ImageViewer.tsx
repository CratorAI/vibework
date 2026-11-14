/**
 * Images and SVG. Always an <img> (an SVG never goes inline, so its scripts
 * cannot run). Click toggles between fit-to-panel and actual size.
 */

import { useState } from "react";
import type { ArtifactViewProps } from "../types";
import { cn } from "@/lib/utils";
import { formatFileSize } from "@/tauri/files";
import { useArtifactStat, versionedUrl } from "./useArtifactFile";
import { ViewerError, ViewerLoading, ViewerMessage } from "./ViewerStates";

export default function ImageViewer({ artifact, modifiedMs }: ArtifactViewProps) {
  const { data: stat, error } = useArtifactStat(artifact, modifiedMs);
  const [actualSize, setActualSize] = useState(false);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);

  if (error) return <ViewerError error={error} path={artifact.path} name={artifact.name} />;
  if (!stat) return <ViewerLoading />;
  if (failed) return <ViewerMessage title="Could not display this image" detail="The file may be damaged or in a format this viewer does not support." tone="error" />;

  return (
    <div className="flex h-full flex-col">
      <button
        type="button"
        onClick={() => setActualSize((v) => !v)}
        title={actualSize ? "Fit to panel" : "Actual size"}
        className={cn(
          "min-h-0 flex-1 overflow-auto bg-muted/40 p-6 outline-none",
          actualSize ? "cursor-zoom-out" : "flex cursor-zoom-in items-center justify-center",
        )}
      >
        <img
          key={stat.modifiedMs}
          src={versionedUrl(stat.url, stat.modifiedMs)}
          alt={stat.name}
          onLoad={(e) => {
            setFailed(false);
            setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
          }}
          onError={() => setFailed(true)}
          className={cn(actualSize ? "max-w-none" : "max-h-full max-w-full object-contain")}
        />
      </button>
      <div className="flex h-8 shrink-0 items-center gap-3 border-t px-3 text-meta text-muted-foreground tabular-nums">
        {natural && natural.w > 0 && (
          <span>
            {natural.w} × {natural.h}
          </span>
        )}
        <span>{formatFileSize(stat.size)}</span>
        <span className="ml-auto">{actualSize ? "Actual size" : "Fit"}</span>
      </div>
    </div>
  );
}
