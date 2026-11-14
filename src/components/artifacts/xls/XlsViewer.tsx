import { useEffect, useState } from "react";
import type { ArtifactViewProps } from "../types";
import { LegacyTable } from "./LegacyTable";
import type { LegacyWorkbook } from "./parse";
import { ReadOnlyBar } from "../office/shared";
import { decodeBase64, useArtifactFile } from "../viewers/useArtifactFile";
import { ViewerError, ViewerLoading, ViewerMessage } from "../viewers/ViewerStates";

export default function XlsViewer({ artifact, modifiedMs }: ArtifactViewProps) {
  const { data: file, error: readError, loading } = useArtifactFile(artifact, modifiedMs);
  const [result, setResult] = useState<{ workbook?: LegacyWorkbook; error?: string }>({});
  const [selected, setSelected] = useState("");
  useEffect(() => {
    setResult({});
    if (loading || !file) return;
    if (!file.base64) {
      setResult({ error: "This file is not a binary Excel workbook." });
      return;
    }
    // Parsing untrusted Office files runs off the UI thread and can be stopped.
    let worker: Worker;
    try {
      worker = new Worker(new URL("./parse.worker.ts", import.meta.url), { type: "module" });
      worker.postMessage(decodeBase64(file.base64));
    } catch {
      setResult({ error: "Could not start the workbook preview." });
      return;
    }
    const timer = window.setTimeout(() => {
      worker.terminate();
      setResult({ error: "This workbook took too long to preview. Open it in Excel." });
    }, 15000);
    worker.onmessage = (event: MessageEvent<typeof result>) => {
      window.clearTimeout(timer);
      setResult(event.data);
      worker.terminate();
    };
    worker.onerror = () => {
      window.clearTimeout(timer);
      setResult({ error: "Could not read this workbook. It may be damaged or password-protected." });
      worker.terminate();
    };
    return () => { window.clearTimeout(timer); worker.terminate(); };
  }, [file, loading]);

  const error = readError ?? result.error;
  if (error) return <ViewerError error={error} path={artifact.path} name={artifact.name} />;
  if (!result.workbook) return <ViewerLoading />;
  const { sheets, omittedSheets } = result.workbook;
  const sheet = sheets.find((s) => s.name === selected) ?? sheets.find((s) => !s.hidden) ?? sheets[0];
  const columns = Array.from({ length: sheet.rows[0]?.length ?? 0 }, (_, c) => c);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ReadOnlyBar path={artifact.path} />
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-1" aria-label="Worksheets">
        {sheets.map((s) => <button key={s.name} type="button" aria-pressed={sheet.name === s.name} onClick={() => setSelected(s.name)} className={`shrink-0 rounded px-2 py-1 text-meta focus-visible:outline focus-visible:outline-ring ${sheet.name === s.name ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"}`}>
          {s.name}{s.hidden ? " (hidden)" : ""}
        </button>)}
      </div>
      {sheet.rowCount === 0 ? <div className="min-h-0 flex-1 overflow-auto"><ViewerMessage title="This worksheet is empty" /></div> : <LegacyTable key={sheet.name} sheet={sheet} />}
      <div className="shrink-0 border-t px-3 py-2 text-meta text-muted-foreground" role="status">
        {sheet.rowCount > 1000 || sheet.columnCount > 100 ? `Showing the first ${sheet.rows.length.toLocaleString()} rows and ${columns.length} columns. ` : `${sheet.rowCount.toLocaleString()} rows · ${sheet.columnCount} columns. `}
        Saved cell values only; merged cells are shown as separate cells. Formatting, charts, and macros are not shown.
        {omittedSheets > 0 && ` ${omittedSheets} more worksheets are not shown.`}
      </div>
    </div>
  );
}
