/**
 * Live state of one open artifact: stat once, then watch it on disk for as
 * long as it is the active artifact. Unwatches on unmount (switching or
 * closing the artifact). One `artifact:changed` listener serves every watch.
 */

import { useEffect, useState } from "react";
import {
  onArtifactChanged,
  statArtifact,
  unwatchArtifact,
  watchArtifact,
  type ArtifactChangedEvent,
  type ArtifactStat,
} from "@/tauri/artifacts";

type Handler = (event: ArtifactChangedEvent) => void;
const handlers = new Map<string, Handler>();
let listening: Promise<unknown> | null = null;

function ensureListener() {
  listening ??= onArtifactChanged((event) => handlers.get(event.watchId)?.(event)).catch((err) => {
    listening = null;
    console.warn("[workspace] artifact:changed listener failed", err);
  });
}

/** Route `artifact:changed` events of one watch (e.g. a folder watch) to `handler`. Returns the unsubscribe. */
export function onWatchEvent(watchId: string, handler: Handler): () => void {
  ensureListener();
  handlers.set(watchId, handler);
  return () => {
    if (handlers.get(watchId) === handler) handlers.delete(watchId);
  };
}

export interface ArtifactLiveState {
  /** The path (as requested) this state describes */
  forPath: string;
  stat: ArtifactStat | null;
  /** Last-modified time to hand to the viewer; bumps on every change */
  modifiedMs: number;
  error: unknown;
  deleted: boolean;
}

export function useArtifactWatch(sessionId: string, path: string, reloadKey: number): ArtifactLiveState {
  const [state, setState] = useState<ArtifactLiveState>({ forPath: path, stat: null, modifiedMs: 0, error: null, deleted: false });

  useEffect(() => {
    if (!path) {
      setState({ forPath: path, stat: null, modifiedMs: 0, error: null, deleted: false });
      return;
    }
    let cancelled = false;
    let watchId: string | null = null;
    setState((s) => (s.forPath === path ? { ...s, error: null } : { forPath: path, stat: null, modifiedMs: 0, error: null, deleted: false }));
    ensureListener();

    statArtifact(sessionId, path).then(
      (stat) => {
        if (cancelled) return;
        setState({ forPath: path, stat, modifiedMs: stat.modifiedMs, error: null, deleted: false });
        watchArtifact(sessionId, stat.path).then(
          (id) => {
            if (cancelled) {
              unwatchArtifact(id).catch(() => {});
              return;
            }
            watchId = id;
            handlers.set(id, (event) => {
              if (event.modifiedMs === null) {
                setState((s) => ({ ...s, deleted: true }));
                return;
              }
              const modifiedMs = event.modifiedMs;
              setState((s) => ({
                ...s,
                deleted: false,
                modifiedMs,
                stat: s.stat ? { ...s.stat, modifiedMs } : s.stat,
              }));
            });
          },
          (err) => console.warn("[workspace] could not watch", path, err),
        );
      },
      (error) => {
        if (!cancelled) setState({ forPath: path, stat: null, modifiedMs: 0, error, deleted: false });
      },
    );

    return () => {
      cancelled = true;
      if (watchId) {
        handlers.delete(watchId);
        unwatchArtifact(watchId).catch(() => {});
      }
    };
  }, [sessionId, path, reloadKey]);

  // Never hand out the previous file's state for a new path
  return state.forPath === path ? state : { forPath: path, stat: null, modifiedMs: 0, error: null, deleted: false };
}
