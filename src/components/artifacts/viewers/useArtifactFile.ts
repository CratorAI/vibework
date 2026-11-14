/**
 * Loading hooks for the generic viewers. Each reloads when the file's
 * `modifiedMs` changes, and keeps the previous contents on screen while the
 * new read is in flight so a live reload never blanks the view.
 */

import { useEffect, useState } from "react";
import {
  readArtifact,
  statArtifact,
  type ArtifactFile,
  type ArtifactStat,
} from "@/tauri/artifacts";
import type { ArtifactRef } from "../types";

interface LoadState<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
}

function useLoad<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ data: null, error: null, loading: true });
  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));
    load().then(
      (data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      },
      (error) => {
        if (!cancelled) setState({ data: null, error, loading: false });
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

/** Contents of the file (text or base64), re-read whenever it changes on disk */
export function useArtifactFile(artifact: ArtifactRef, modifiedMs: number): LoadState<ArtifactFile> {
  return useLoad(
    () => readArtifact(artifact.sessionId, artifact.path),
    [artifact.sessionId, artifact.path, modifiedMs],
  );
}

/** Metadata (including the sandboxed `artifact://` URL), refreshed whenever it changes on disk */
export function useArtifactStat(artifact: ArtifactRef, modifiedMs: number): LoadState<ArtifactStat> {
  return useLoad(
    () => statArtifact(artifact.sessionId, artifact.path),
    [artifact.sessionId, artifact.path, modifiedMs],
  );
}

/** Bytes of a standard base64 string */
export function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** URL with a cache-busting query so a changed file is fetched again */
export function versionedUrl(url: string, modifiedMs: number): string {
  return `${url}${url.includes("?") ? "&" : "?"}v=${modifiedMs}`;
}

/** The folder URL a file's relative links resolve against (its URL minus the file name) */
export function folderUrl(fileUrl: string): string {
  const clean = fileUrl.split(/[?#]/)[0];
  return clean.slice(0, clean.lastIndexOf("/") + 1);
}
