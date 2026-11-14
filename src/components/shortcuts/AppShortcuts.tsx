/**
 * The one handler for app-wide keyboard shortcuts (the table is in
 * `@/lib/shortcuts`). It listens on the window after everything else: a key
 * an editor, field, menu or dialog already handled (default prevented) is
 * theirs, and an editor or terminal with focus keeps the chords it uses
 * (bold, link, clear, caret moves). While a dialog is open only search, new
 * task, Settings and the shortcuts sheet run. Renders nothing.
 */

import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAgentSessionsContext } from "@/contexts/AgentSessionsContext";
import { useSidebar } from "@/components/ui/sidebar";
import { dialogOpen, matchShortcut, ownedByFocus, panelTabIndex } from "@/lib/shortcuts";
import { openSettings } from "@/lib/settingsNav";
import { searchWindow } from "@/stores/searchWindow";
import { shortcutsSheet } from "@/stores/shortcutsSheet";
import { workspaceStore } from "@/components/workspace/store";
import { closeActivePanelTab, PANEL_ADD_MENU_EVENT } from "@/components/workspace/actions";
import { visibleTaskOrder } from "@/components/Sidebar/order";

export function AppShortcuts() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { toggleSidebar } = useSidebar();
  const sessionsContext = useAgentSessionsContext();
  // The latest values, read when a key arrives (one listener for the app's life)
  const latest = useRef({ navigate, pathname, toggleSidebar, sessionsContext });
  latest.current = { navigate, pathname, toggleSidebar, sessionsContext };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const shortcut = matchShortcut(e);
      if (!shortcut) return;
      if (ownedByFocus(shortcut, e.target)) return;
      if (!shortcut.inDialogs && dialogOpen()) return;
      const { navigate, pathname, toggleSidebar, sessionsContext: ctx } = latest.current;
      const inTask = pathname === "/" && !!ctx.activeSessionId;
      const run = (action: () => void) => {
        e.preventDefault();
        action();
      };
      switch (shortcut.id) {
        case "search":
          return run(() => searchWindow.toggle());
        case "newTask":
          return run(() => {
            searchWindow.close();
            shortcutsSheet.close();
            ctx.clearActiveSession();
            if (pathname !== "/") navigate("/");
          });
        case "settings":
          return run(() => {
            searchWindow.close();
            shortcutsSheet.close();
            if (pathname !== "/settings") openSettings(navigate);
          });
        case "shortcuts":
          return run(() => {
            searchWindow.close();
            shortcutsSheet.toggle();
          });
        case "artifacts":
          return run(() => {
            if (pathname !== "/artifacts") navigate("/artifacts");
          });
        case "sidebar":
          return run(toggleSidebar);
        case "panel":
          if (!inTask) return;
          return run(() => workspaceStore.setOpen(!workspaceStore.getPrefs().open, ctx.activeSessionId));
        case "stop": {
          const id = ctx.activeSessionId;
          const session = id ? ctx.getSession(id) : undefined;
          if (!inTask || !session?.state.isLoading) return;
          return run(() => void session.handlers.interrupt());
        }
        case "previousTask":
        case "nextTask": {
          const waiting = new Set<string>();
          for (const [id, state] of ctx.activeSessions.entries()) if (state.permissionRequest || state.questionRequest) waiting.add(id);
          const order = visibleTaskOrder(ctx.sessions, waiting);
          if (!order.length) return;
          const at = order.findIndex((s) => s.sessionId === ctx.activeSessionId);
          const step = shortcut.id === "nextTask" ? 1 : -1;
          const next = at < 0 ? (step > 0 ? order[0] : order[order.length - 1]) : order[(at + step + order.length) % order.length];
          return run(() => {
            void ctx.openSession(next.sessionId);
            if (pathname !== "/") navigate("/");
          });
        }
        // The panel's tabs: only in a task, while the panel is open (⌘W
        // otherwise stays the window's Close)
        case "panelTab": {
          const index = panelTabIndex(e);
          const id = ctx.activeSessionId;
          if (!inTask || !id || index === null || !workspaceStore.getPrefs().open) return;
          if (!workspaceStore.getConversation(id).tabs[index]) return;
          return run(() => workspaceStore.activateIndex(id, index));
        }
        case "panelCloseTab": {
          const id = ctx.activeSessionId;
          if (!inTask || !id || !workspaceStore.getPrefs().open) return;
          return run(() => closeActivePanelTab(id));
        }
        case "panelAddMenu":
          if (!inTask || !workspaceStore.getPrefs().open) return;
          return run(() => window.dispatchEvent(new Event(PANEL_ADD_MENU_EVENT)));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return null;
}
