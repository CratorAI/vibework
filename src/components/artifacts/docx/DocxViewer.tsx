/**
 * Read-only Word view: the document rendered to a static page inside the
 * sandboxed iframe (no scripts, see office/shared.tsx), under a quiet
 * "Read-only view. Open in … to edit." line.
 */

import { useEffect, useMemo, useState } from "react";
import type { ArtifactViewProps } from "../types";
import { docxBody, docxPage } from "../office/docx";
import { officeTheme, ReadOnlyBar } from "../office/shared";
import { SandboxFrame, useInlinePage } from "../viewers/SandboxFrame";
import { decodeBase64, useArtifactFile } from "../viewers/useArtifactFile";
import { useIsDark } from "../viewers/useIsDark";
import { ViewerError, ViewerLoading, ViewerMessage } from "../viewers/ViewerStates";

export default function DocxViewer({ artifact, modifiedMs }: ArtifactViewProps) {
  const file = useArtifactFile(artifact, modifiedMs);
  const dark = useIsDark();
  const [body, setBody] = useState<{ html: string } | { error: unknown } | null>(null);

  useEffect(() => {
    const base64 = file.data?.base64;
    if (!base64) return;
    let cancelled = false;
    docxBody(decodeBase64(base64)).then(
      (html) => !cancelled && setBody({ html }),
      (error) => !cancelled && setBody({ error }),
    );
    return () => {
      cancelled = true;
    };
  }, [file.data]);

  // `dark` re-themes the page when the appearance changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => (body && "html" in body ? docxPage(body.html, artifact.name, officeTheme()) : null), [body, artifact.name, dark]);
  const page = useInlinePage(html);

  if (file.error) return <ViewerError error={file.error} path={artifact.path} name={artifact.name} />;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ReadOnlyBar path={artifact.path} />
      <div className="relative min-h-0 flex-1">
        {body && "error" in body ? (
          <ViewerMessage title="Couldn’t read this document" detail="It may be damaged, or not a Word document. Open it in its app instead." tone="error" />
        ) : page.error ? (
          <ViewerError error={page.error} path={artifact.path} name={artifact.name} />
        ) : page.url ? (
          <SandboxFrame src={page.url} title={artifact.name} scripts={false} canvas="app" />
        ) : (
          <ViewerLoading label="Opening document" />
        )}
      </div>
    </div>
  );
}
