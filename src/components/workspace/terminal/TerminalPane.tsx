/**
 * A terminal tab's body: one shell, opened in the task's working folder the
 * first time its tab is shown. The shell keeps running while another tab or
 * task is shown (the view re-attaches from its snapshot); closing the tab
 * ends it. After a relaunch a remembered terminal tab starts a fresh shell.
 */

import { useEffect, useState } from "react";
import { agentApi } from "@/tauri/agent";
import { pathBaseName } from "@/lib/utils";
import { workspaceStore, type TerminalTab } from "../store";
import { TerminalView } from "./TerminalView";

/** Working folder per task for the app run (null: none, so the home folder) */
const folders = new Map<string, string | null>();

export function TerminalPane({
  sessionId,
  tab,
  onOpenUrl,
}: {
  sessionId: string;
  tab: TerminalTab;
  onOpenUrl: (url: string) => void;
}) {
  const [cwd, setCwd] = useState<string | null | undefined>(() => folders.get(sessionId));

  useEffect(() => {
    let cancelled = false;
    agentApi.getWorkingFolder(sessionId).then(
      (folder) => {
        folders.set(sessionId, folder ?? null);
        if (!cancelled) setCwd(folder ?? null);
      },
      () => !cancelled && setCwd((c) => (c === undefined ? null : c)),
    );
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (cwd === undefined) return null;
  return (
    <TerminalView
      key={tab.terminalId}
      id={tab.terminalId}
      cwd={cwd}
      active
      onInfo={(info) => {
        const current = workspaceStore.getConversation(sessionId).tabs.find((t) => t.id === tab.id);
        if (current?.kind === "terminal" && !current.title) workspaceStore.setTerminalTitle(sessionId, tab.id, pathBaseName(info.shell));
      }}
      onTitle={(title) => workspaceStore.setTerminalTitle(sessionId, tab.id, title)}
      onOpenLink={onOpenUrl}
    />
  );
}
