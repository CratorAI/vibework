/**
 * The panel itself: one row of tabs in the titlebar band (every open file,
 * terminal, the Browser, Files and Agent commands, then "+"), the active
 * file's actions at the right end of the same band, and the active tab
 * below. With no tabs it lists what it can open.
 */

import { lazy, Suspense, useCallback, useState, type MouseEvent as ReactMouseEvent } from "react";
import { appApi } from "@/tauri/app";
import { ViewerLoading } from "@/components/artifacts/viewers/ViewerStates";
import { browserViewId, closePanelTab, openSurface } from "./actions";
import { activeTab, useConversationWorkspace, workspaceStore } from "./store";
import { TabStrip } from "./TabStrip";
import { AddMenu } from "./AddMenu";
import { PanelEmpty } from "./PanelEmpty";
import { ConfirmDialog } from "./ConfirmDialog";
import { FileTabView } from "./artifacts/FileTabView";
import { useRecentFiles } from "./artifacts/useRecentFiles";
import { FilesTab } from "./files/FilesTab";
import { BrowserTab } from "./browser/BrowserTab";
import { useBrowserState } from "./browser/browserStates";
import { AgentCommands } from "./terminal/AgentCommands";

// xterm.js loads with the first terminal tab, not with the app
const TerminalPane = lazy(() => import("./terminal/TerminalPane").then((m) => ({ default: m.TerminalPane })));

const isLocalUrl = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(url);

/** Empty space in the band drags the window; a double click zooms it */
const dragBand = {
  onMouseDown: (e: ReactMouseEvent) => {
    if (e.target === e.currentTarget && e.button === 0 && e.detail === 1) appApi.startDrag().catch(() => {});
  },
  onDoubleClick: (e: ReactMouseEvent) => {
    if (e.target === e.currentTarget) appApi.toggleMaximizeWindow().catch(() => {});
  },
};

export function WorkspacePanel({
  sessionId,
  agentBusy,
  allowNative,
  onOpenExternalUrl,
}: {
  sessionId: string;
  agentBusy: boolean;
  /** Layout settled: the native browser view may show */
  allowNative: boolean;
  onOpenExternalUrl: (url: string) => void;
}) {
  const workspace = useConversationWorkspace(sessionId);
  const tab = activeTab(workspace);
  const browser = useBrowserState(browserViewId(sessionId));
  const recent = useRecentFiles(sessionId, agentBusy);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null);

  // Terminal links: local servers open in the Browser tab, the rest in the system browser
  const openUrl = useCallback(
    (url: string) => {
      if (isLocalUrl(url)) {
        setPendingUrl(url);
        openSurface(sessionId, "browser");
      } else {
        onOpenExternalUrl(url);
      }
    },
    [sessionId, onOpenExternalUrl],
  );
  const clearPendingUrl = useCallback(() => setPendingUrl(null), []);
  const pendingClose = workspace.tabs.find((t) => t.id === workspace.pendingClose);

  return (
    <div className="flex h-full min-w-0 flex-col border-l bg-card">
      {/* Sits in the titlebar band: above the drag region, and drags the window from its empty space */}
      <div
        className="@container/panel relative z-[55] flex h-(--titlebar-height) shrink-0 items-center bg-card pr-12 pl-2"
        {...dragBand}
      >
        <div className="flex min-w-0 items-center gap-1">
          <TabStrip key={sessionId} sessionId={sessionId} tabs={workspace.tabs} active={workspace.active} browserTitle={browser?.title || null} />
          {/* With nothing open the empty panel lists the same choices, so the + would repeat them */}
          {workspace.tabs.length > 0 && <AddMenu sessionId={sessionId} recent={recent.files ?? []} />}
        </div>
        <div className="h-full min-w-4 flex-1" {...dragBand} />
        <div ref={setActionsSlot} className="flex shrink-0 items-center" />
      </div>

      <div className="relative z-[41] min-h-0 flex-1 bg-card" role="tabpanel">
        {!tab && <PanelEmpty sessionId={sessionId} recent={recent.files ?? []} failed={recent.failed} />}
        {tab?.kind === "file" && (
          <FileTabView allowNative={allowNative} key={`${sessionId}:${tab.id}`} sessionId={sessionId} entry={tab} agentBusy={agentBusy} actionsSlot={actionsSlot} />
        )}
        {tab?.kind === "terminal" && (
          <Suspense fallback={<ViewerLoading />}>
            <TerminalPane key={`${sessionId}:${tab.id}`} sessionId={sessionId} tab={tab} onOpenUrl={openUrl} />
          </Suspense>
        )}
        {tab?.kind === "files" && <FilesTab key={sessionId} sessionId={sessionId} agentBusy={agentBusy} />}
        {tab?.kind === "agent" && <AgentCommands key={sessionId} sessionId={sessionId} />}
        {tab?.kind === "browser" && (
          <BrowserTab
            key={sessionId}
            sessionId={sessionId}
            allowNative={allowNative}
            pendingUrl={pendingUrl}
            onPendingUrlHandled={clearPendingUrl}
          />
        )}
      </div>

      <ConfirmDialog
        open={pendingClose?.kind === "file"}
        title="Discard unsaved changes?"
        description={`${pendingClose?.kind === "file" ? pendingClose.name : "This file"} has edits that are not saved. Closing it discards them.`}
        confirmLabel="Discard and close"
        onCancel={() => workspaceStore.setPendingClose(sessionId, null)}
        onConfirm={() => workspace.pendingClose && closePanelTab(sessionId, workspace.pendingClose, { force: true })}
      />
    </div>
  );
}
