/**
 * The task's recent files: previewable files in its working folder, newest
 * first. A task with no folder of its own works in the default folder, so
 * there it lists only what the task made or was given, not the folder's
 * other files. Listed again when a turn ends (the agent may have written
 * files); a failed listing is retried a few times (usually the engine
 * restarting) before it counts as an error.
 */

import { useEffect, useMemo, useState } from "react";
import { isGalleryArtifact } from "@/gallery/kinds";
import { useAgentSessionsContext } from "@/contexts/AgentSessionsContext";
import { parseAttachments } from "@/utils/attachments";
import { isArtifactError, listArtifacts, type ArtifactEntry } from "@/tauri/artifacts";
import { pathKey, touchedBy, useAgentTouched } from "../files/agentTouched";

export interface RecentFiles {
  /** Null until the first listing */
  files: ArtifactEntry[] | null;
  /** The folder could not be listed (a task without a folder is not an error) */
  failed: boolean;
}

export function useRecentFiles(sessionId: string, agentBusy: boolean, limit = 8): RecentFiles {
  const [listed, setListed] = useState<ArtifactEntry[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const { sessions, activeSessions } = useAgentSessionsContext();
  const session = sessions.find((s) => s.sessionId === sessionId);
  const ownFilesOnly = !!session && !session.workingFolder;
  const touched = useAgentTouched(sessionId, agentBusy);
  const state = activeSessions.get(sessionId);
  const given = useMemo(() => {
    const out = new Set<string>();
    for (const message of [...(state?.historyMessages ?? []), ...(state?.streamBuffer ?? [])]) {
      if (message.role !== "user") continue;
      for (const block of message.blocks) {
        if (block.type === "text") parseAttachments(block.content).attachments.forEach((a) => out.add(pathKey(a.path)));
      }
    }
    return out;
  }, [state?.historyMessages, state?.streamBuffer]);

  const files = useMemo(() => {
    if (!listed) return null;
    const own = ownFilesOnly
      ? listed.filter((e) => given.has(pathKey(e.path)) || touchedBy(touched, e.path.slice(0, Math.max(0, e.path.length - e.name.length - 1)), e.path, e.modifiedMs))
      : listed;
    return own.slice(0, limit);
  }, [listed, ownFilesOnly, given, touched, limit]);

  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const list = (attempt: number) =>
      listArtifacts(sessionId).then(
        (entries) => {
          if (cancelled) return;
          setError(null);
          setListed(entries.filter((e) => !e.isDir && isGalleryArtifact(e.name)).sort((a, b) => b.modifiedMs - a.modifiedMs));
        },
        (err) => {
          if (cancelled) return;
          if (attempt < 3) retry = setTimeout(() => list(attempt + 1), 1500 * (attempt + 1));
          else setError(err);
        },
      );
    list(0);
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, [sessionId, agentBusy]);

  return { files, failed: error !== null && !(isArtifactError(error) && error.code === "no_working_folder") };
}

export function relativeTime(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
