/**
 * Code view of a text file: the viewer for JSON and other source/text files,
 * and the "Code" side of the Preview/Code toggle for previewable types.
 */

import type { ArtifactViewProps } from "../types";
import { CodeView } from "./CodeView";
import { languageFor } from "./fileKinds";
import { useArtifactFile } from "./useArtifactFile";
import { NoPreviewCard, ViewerError, ViewerLoading } from "./ViewerStates";

export default function SourceViewer({ artifact, modifiedMs }: ArtifactViewProps) {
  const { data: file, error } = useArtifactFile(artifact, modifiedMs);

  if (error) return <ViewerError error={error} path={artifact.path} name={artifact.name} />;
  if (!file) return <ViewerLoading />;
  if (file.text === null) {
    return <NoPreviewCard path={file.path} name={file.name} size={file.size} reason="This file is not text." />;
  }
  return <CodeView text={file.text} language={languageFor(file.name)} />;
}
