/**
 * HTML page: loaded straight from the file's artifact:// URL in the sandbox,
 * so relative CSS, scripts and images resolve inside the working folder.
 */

import type { ArtifactViewProps } from "../types";
import { SandboxFrame } from "./SandboxFrame";
import { useArtifactStat, versionedUrl } from "./useArtifactFile";
import { ViewerError, ViewerLoading } from "./ViewerStates";

export default function HtmlViewer({ artifact, modifiedMs }: ArtifactViewProps) {
  const { data: stat, error } = useArtifactStat(artifact, modifiedMs);
  if (error) return <ViewerError error={error} path={artifact.path} name={artifact.name} />;
  if (!stat) return <ViewerLoading />;
  return <SandboxFrame src={versionedUrl(stat.url, stat.modifiedMs)} title={stat.name} />;
}
