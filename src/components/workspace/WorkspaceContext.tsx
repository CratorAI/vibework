/**
 * Lets views inside a conversation (presented-file cards, tool rows) open
 * files in the workspace panel without knowing the session id.
 */

import { createContext, useContext, useMemo, useEffect, type ReactNode } from "react";
import { isPreviewable } from "@/components/artifacts/registry";
import { pathBaseName } from "@/lib/utils";
import { openArtifactInPanel, openSurface } from "./actions";
import { useAgentBrowserRequest } from "./browser/agentEvents";
import { workspaceStore } from "./store";

export interface WorkspaceActions {
  sessionId: string;
  /** Whether the panel can show this file */
  canPreview: (path: string) => boolean;
  /** Open the file in the panel (and show the panel) */
  openArtifact: (path: string) => void;
  /**
   * A presented file's tool call finished. Opens the panel on it the first
   * time the call is seen, if that is during a live turn.
   */
  presentArtifact: (callKey: string, path: string, live: boolean) => void;
}

const WorkspaceContext = createContext<WorkspaceActions | null>(null);

/** Agent browser requests already shown (each brings the Browser tab forward once) */
const shownBrowserRequests = new WeakSet<object>();

export function WorkspaceActionsProvider({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  const browserRequest = useAgentBrowserRequest(sessionId);
  useEffect(() => {
    if (browserRequest && !shownBrowserRequests.has(browserRequest)) {
      shownBrowserRequests.add(browserRequest);
      openSurface(sessionId, "browser");
      workspaceStore.setOpen(true, sessionId);
    }
  }, [browserRequest, sessionId]);
  const value = useMemo<WorkspaceActions>(
    () => ({
      sessionId,
      canPreview: (path) => !!path && isPreviewable(pathBaseName(path)),
      openArtifact: (path) => openArtifactInPanel(sessionId, path),
      presentArtifact: (callKey, path, live) => {
        if (workspaceStore.firstSighting(sessionId, callKey) && live) {
          openArtifactInPanel(sessionId, path, { auto: callKey });
        }
      },
    }),
    [sessionId],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

/** Null outside a conversation (e.g. on the home screen) */
export function useWorkspaceActions(): WorkspaceActions | null {
  return useContext(WorkspaceContext);
}
