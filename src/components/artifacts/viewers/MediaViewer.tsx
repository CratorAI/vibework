/**
 * Video and audio, played from the file's artifact:// URL (the scheme honours
 * Range requests, so seeking works).
 */

import { useState } from "react";
import type { ArtifactViewProps } from "../types";
import { useArtifactStat, versionedUrl } from "./useArtifactFile";
import { extOf, AUDIO_EXTS } from "./fileKinds";
import { NoPreviewCard, ViewerError, ViewerLoading } from "./ViewerStates";

export default function MediaViewer({ artifact, modifiedMs }: ArtifactViewProps) {
  const { data: stat, error } = useArtifactStat(artifact, modifiedMs);
  const [failed, setFailed] = useState(false);

  if (error) return <ViewerError error={error} path={artifact.path} name={artifact.name} />;
  if (!stat) return <ViewerLoading />;
  if (failed) {
    return (
      <NoPreviewCard
        path={stat.path}
        name={stat.name}
        size={stat.size}
        reason="This media format cannot be played here."
      />
    );
  }

  const src = versionedUrl(stat.url, stat.modifiedMs);
  if (AUDIO_EXTS.has(extOf(stat.name))) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <audio key={src} src={src} controls className="w-full max-w-md" onError={() => setFailed(true)} />
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center bg-muted/40 p-4">
      <video
        key={src}
        src={src}
        controls
        playsInline
        className="max-h-full max-w-full rounded-md"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
