import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface ExternalStatus {
  message: string | null;
  retry: boolean;
}

/**
 * What a Claude Code or Codex task is doing before its first output
 * ("Starting Codex…"), or why it could not start (with `retry`).
 */
export function useExternalStatus(sessionId: string | null | undefined): [ExternalStatus | null, () => void] {
  const [status, setStatus] = useState<ExternalStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    setStatus(null);
    const unlisten = listen<{ sessionId: string; data: ExternalStatus }>("agent:external-status", (e) => {
      if (e.payload.sessionId === sessionId) setStatus(e.payload.data);
    });
    void unlisten
      .then(() => (sessionId ? invoke<ExternalStatus | null>("agent_external_status", { sessionId }) : null))
      .then((s) => { if (!cancelled) setStatus(s); })
      .catch(() => {});
    return () => { cancelled = true; void unlisten.then((fn) => fn()); };
  }, [sessionId]);
  return [status, () => setStatus(null)];
}
