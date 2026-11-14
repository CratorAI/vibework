import type { SessionInfo } from "@/types/agent";

/** Whether the Settled shelf is open (remembered across restarts). */
export const SETTLED_OPEN_KEY = "vibework.sidebar.settledOpen";

/**
 * The sidebar's task order: tasks that need the user first (even settled
 * ones, so none hides in the closed shelf), then the active ones as listed,
 * and the settled shelf apart, most recently settled first.
 */
export function sidebarLists(sessions: SessionInfo[], waitingIds: Set<string>): { activeList: SessionInfo[]; settledList: SessionInfo[] } {
  const needsYou: SessionInfo[] = [];
  const active: SessionInfo[] = [];
  const settled: SessionInfo[] = [];
  for (const session of sessions) {
    if (waitingIds.has(session.sessionId)) needsYou.push(session);
    else (session.settledAt ? settled : active).push(session);
  }
  settled.sort((a, b) => (b.settledAt ?? "").localeCompare(a.settledAt ?? ""));
  return { activeList: [...needsYou, ...active], settledList: settled };
}

/** The tasks as the sidebar shows them, top to bottom (settled ones only while the shelf is open). */
export function visibleTaskOrder(sessions: SessionInfo[], waitingIds: Set<string>): SessionInfo[] {
  const { activeList, settledList } = sidebarLists(sessions, waitingIds);
  let shelfOpen = false;
  try {
    shelfOpen = localStorage.getItem(SETTLED_OPEN_KEY) === "1";
  } catch {
    // Treated as closed
  }
  return shelfOpen ? [...activeList, ...settledList] : activeList;
}
