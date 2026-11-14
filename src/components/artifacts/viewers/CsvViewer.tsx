/**
 * CSV/TSV as a simple read-only table (first row as header, capped rows).
 * A dedicated sheet editor, when present, takes priority for these files.
 */

import { useMemo } from "react";
import type { ArtifactViewProps } from "../types";
import { extOf } from "./fileKinds";
import { useArtifactFile } from "./useArtifactFile";
import { NoPreviewCard, ViewerError, ViewerLoading, ViewerMessage } from "./ViewerStates";

const MAX_ROWS = 2_000;
const MAX_COLS = 200;

/** RFC 4180-style parse: quoted fields, doubled quotes, CRLF/LF. Stops after `limit` rows. */
export function parseDelimited(text: string, delimiter: string, limit: number): { rows: string[][]; total: number } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let total = 0;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const endRow = () => {
    row.push(field);
    field = "";
    if (!(row.length === 1 && row[0] === "")) {
      total++;
      if (rows.length < limit) rows.push(row);
    }
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      endRow();
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) endRow();
  return { rows, total };
}

export default function CsvViewer({ artifact, modifiedMs }: ArtifactViewProps) {
  const { data: file, error } = useArtifactFile(artifact, modifiedMs);

  const parsed = useMemo(() => {
    if (!file?.text) return null;
    const delimiter = extOf(file.name) === "tsv" ? "\t" : ",";
    return parseDelimited(file.text, delimiter, MAX_ROWS + 1);
  }, [file]);

  if (error) return <ViewerError error={error} path={artifact.path} name={artifact.name} />;
  if (!file) return <ViewerLoading />;
  if (file.text === null) return <NoPreviewCard path={file.path} name={file.name} reason="This file is not text." />;
  if (!parsed || parsed.rows.length === 0) return <ViewerMessage title="This file is empty" />;

  const [header, ...body] = parsed.rows;
  const colCount = Math.min(
    MAX_COLS,
    parsed.rows.reduce((n, r) => Math.max(n, r.length), 0),
  );
  const cols = Array.from({ length: colCount }, (_, i) => i);
  const dataRows = body.slice(0, MAX_ROWS);
  const totalDataRows = Math.max(0, parsed.total - 1);

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="border-separate border-spacing-0 text-meta tabular-nums select-text">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 border-r border-b bg-muted px-2 py-1.5 text-right font-normal text-muted-foreground" />
              {cols.map((c) => (
                <th
                  key={c}
                  className="sticky top-0 z-10 max-w-[320px] truncate border-r border-b bg-muted px-3 py-1.5 text-left font-medium whitespace-nowrap text-foreground"
                  title={header[c] ?? ""}
                >
                  {header[c] ?? ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.map((row, r) => (
              <tr key={r}>
                <td className="sticky left-0 z-[1] border-r border-b bg-background px-2 py-1 text-right text-muted-foreground/70 select-none">
                  {r + 1}
                </td>
                {cols.map((c) => (
                  <td
                    key={c}
                    className="max-w-[320px] truncate border-r border-b px-3 py-1 whitespace-nowrap text-foreground"
                    title={row[c] && row[c].length > 40 ? row[c] : undefined}
                  >
                    {row[c] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex h-8 shrink-0 items-center gap-3 border-t px-3 text-meta text-muted-foreground tabular-nums">
        <span>
          {totalDataRows > MAX_ROWS
            ? `Showing the first ${MAX_ROWS.toLocaleString()} of ${totalDataRows.toLocaleString()} rows`
            : `${totalDataRows.toLocaleString()} ${totalDataRows === 1 ? "row" : "rows"}`}
        </span>
        <span>
          {colCount} {colCount === 1 ? "column" : "columns"}
        </span>
      </div>
    </div>
  );
}
