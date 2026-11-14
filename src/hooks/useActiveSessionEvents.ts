/**
 * Hook for subscribing to agent events for multiple active sessions
 *
 * This hook sets up event listeners ONCE per event type (not per session),
 * then routes events to the correct session based on sessionId.
 * This is more efficient than creating N sets of listeners for N sessions.
 */

import { useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { agentApi } from "../tauri/agent";
import type { OutputChunkData } from "../types/agent";

/**
 * Hook to subscribe to agent events for multiple sessions simultaneously
 *
 * @param activeSessionIds - Array of session IDs to listen for
 * @param onEvent - Callback invoked with sessionId and chunk for each matching event
 *
 * @example
 * ```tsx
 * useActiveSessionEvents(
 *   ['session-1', 'session-2'],
 *   (sessionId, chunk) => {
 *     if (chunk === 'Done') {
 *       console.log(`Session ${sessionId} turn complete`);
 *     }
 *     updateSessionState(sessionId, chunk);
 *   }
 * );
 * ```
 */
export function useActiveSessionEvents(
  activeSessionIds: string[],
  onEvent: (sessionId: string, chunk: OutputChunkData) => void,
): void {
  // Use ref to avoid re-subscribing when callback changes
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  // Use ref to track active session IDs without re-subscribing
  const activeSessionIdsRef = useRef(activeSessionIds);
  activeSessionIdsRef.current = activeSessionIds;

  useEffect(() => {
    console.log("[useActiveSessionEvents] Setting up global event listeners");
    let isCancelled = false;
    const unlisteners: UnlistenFn[] = [];

    // Helper to check if sessionId is in our active list and call handler
    const handleEvent = (sessionId: string, data: OutputChunkData) => {
      if (activeSessionIdsRef.current.includes(sessionId)) {
        onEventRef.current(sessionId, data);
      }
    };

    // Helper to subscribe and handle cancellation
    const subscribe = async (
      subscriptionPromise: Promise<UnlistenFn>,
    ): Promise<boolean> => {
      const unlisten = await subscriptionPromise;
      if (isCancelled) {
        unlisten();
        return false; // Signal to stop subscribing
      }
      unlisteners.push(unlisten);
      return true; // Continue subscribing
    };

    const setupListeners = async () => {
      const handler = (payload: {
        sessionId: string;
        data: OutputChunkData;
      }) => {
        handleEvent(payload.sessionId, payload.data);
      };

      if (!(await subscribe(listen<{ sessionId: string; timing: import("../types/agent").StepTiming }>("agent:timing", ({ payload }) => handleEvent(payload.sessionId, { Timing: payload.timing }))))) return;
      if (!(await subscribe(listen<{ sessionId: string; session: import("../types/agent").UsageTotals }>("agent:usage", ({ payload }) => handleEvent(payload.sessionId, { Usage: payload.session }))))) return;
      // Subscribe to all event types, stopping early if cancelled
      if (!(await subscribe(agentApi.onAgentEvent("agent:user-message", handler)))) return;
      if (!(await subscribe(agentApi.onTextDelta(handler)))) return;
      if (
        !(await subscribe(
          agentApi.onAgentEvent("agent:text-complete", handler),
        ))
      )
        return;
      if (!(await subscribe(agentApi.onThinkingDelta(handler)))) return;
      if (
        !(await subscribe(
          agentApi.onAgentEvent("agent:thinking-complete", handler),
        ))
      )
        return;
      if (!(await subscribe(agentApi.onToolStart(handler)))) return;
      if (
        !(await subscribe(
          agentApi.onAgentEvent("agent:tool-progress", handler),
        ))
      )
        return;
      if (!(await subscribe(agentApi.onAgentEvent("agent:helper", handler)))) return;
      if (!(await subscribe(agentApi.onToolEnd(handler)))) return;
      if (!(await subscribe(agentApi.onPermissionRequest(handler)))) return;
      if (!(await subscribe(agentApi.onAskUserQuestion(handler)))) return;
      if (
        !(await subscribe(agentApi.onAgentEvent("agent:state-change", handler)))
      )
        return;
      if (!(await subscribe(agentApi.onAgentError(handler)))) return;
      if (!(await subscribe(agentApi.onAgentDone(handler)))) return;

      console.log(
        `[useActiveSessionEvents] Registered ${unlisteners.length} event listeners`,
      );
    };

    setupListeners();

    // Cleanup: unlisten from all events
    return () => {
      console.log(
        `[useActiveSessionEvents] Cleaning up ${unlisteners.length} event listeners`,
      );
      isCancelled = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []); // Empty deps - only set up once, use refs for dynamic values
}
