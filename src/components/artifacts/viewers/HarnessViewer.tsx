/**
 * Views that render a generated harness page around the file's source
 * (React component preview, Mermaid diagram).
 */

import { useMemo } from "react";
import type { ArtifactViewProps } from "../types";
import { SandboxFrame, useInlinePage } from "./SandboxFrame";
import { currentHarnessTheme, mermaidHarness, reactHarness, type HarnessTheme } from "./harness";
import { folderUrl, useArtifactFile, useArtifactStat } from "./useArtifactFile";
import { NoPreviewCard, ViewerError, ViewerLoading } from "./ViewerStates";
import { useIsDark } from "./useIsDark";

type Builder = (opts: { source: string; fileName: string; baseHref: string; theme: HarnessTheme }) => string;

function HarnessView({
  artifact,
  modifiedMs,
  build,
  canvas,
  loadingLabel,
}: ArtifactViewProps & { build: Builder; canvas: "page" | "app"; loadingLabel: string }) {
  const file = useArtifactFile(artifact, modifiedMs);
  const stat = useArtifactStat(artifact, modifiedMs);
  const dark = useIsDark();

  const html = useMemo(() => {
    if (!file.data || file.data.text === null || !stat.data) return null;
    return build({
      source: file.data.text,
      fileName: file.data.name,
      baseHref: folderUrl(stat.data.url),
      theme: currentHarnessTheme(),
    });
    // `dark` re-themes the page when the appearance changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.data, stat.data, build, dark]);

  const page = useInlinePage(html);

  const error = file.error ?? stat.error ?? page.error;
  if (error) return <ViewerError error={error} path={artifact.path} name={artifact.name} />;
  if (file.data && file.data.text === null) {
    return <NoPreviewCard path={file.data.path} name={file.data.name} reason="This file is not text." />;
  }
  if (!page.url) return <ViewerLoading label={loadingLabel} />;
  return <SandboxFrame src={page.url} title={artifact.name} canvas={canvas} />;
}

export function ReactViewer(props: ArtifactViewProps) {
  return <HarnessView {...props} build={reactHarness} canvas="page" loadingLabel="Preparing preview…" />;
}

export function MermaidViewer(props: ArtifactViewProps) {
  return <HarnessView {...props} build={mermaidHarness} canvas="app" loadingLabel="Rendering diagram…" />;
}
