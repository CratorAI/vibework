/**
 * Low-level hook for subscribing to agent events for a specific session
 *
 * This hook sets up event listeners for all OutputChunk types and filters by sessionId.
 * It calls the provided callback for each event that matches the session.
 */

import { useEffect } from 'react';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { agentApi } from '../tauri/agent';
import type { OutputChunkData } from '../types/agent';

/**
 * Hook to subscribe to agent events for a specific session
 *
 * @param sessionId - The session ID to subscribe to (null to skip subscription)
 * @param onEvent - Callback invoked for each OutputChunk event
 *
 * @example
 * ```tsx
 * useAgentEvents(sessionId, (chunk) => {
 *   if (chunk === 'Done') {
 *     console.log('Turn complete');
 *   } else if ('TextDelta' in chunk) {
 *     console.log('Text:', chunk.TextDelta);
 *   }
 * });
 * ```
 */
export function useAgentEvents(
  sessionId: string | null,
  onEvent: (chunk: OutputChunkData) => void
): void {
  useEffect(() => {
    if (!sessionId) {
      return;
    }

    console.log(`[useAgentEvents:${sessionId}] Setting up event listeners`);
    const unlisteners: UnlistenFn[] = [];

    const setupListeners = async () => {
      // TextDelta events
      unlisteners.push(
        await agentApi.onTextDelta((payload) => {
          if (payload.sessionId === sessionId) {
            onEvent(payload.data);
          }
        })
      );

      // TextComplete events
      unlisteners.push(
        await agentApi.onAgentEvent('agent:text-complete', (payload) => {
          if (payload.sessionId === sessionId) {
            onEvent(payload.data);
          }
        })
      );

      // ThinkingDelta events
      unlisteners.push(
        await agentApi.onThinkingDelta((payload) => {
          if (payload.sessionId === sessionId) {
            onEvent(payload.data);
          }
        })
      );

      // ThinkingComplete events
      unlisteners.push(
        await agentApi.onAgentEvent('agent:thinking-complete', (payload) => {
          if (payload.sessionId === sessionId) {
            onEvent(payload.data);
          }
        })
      );

      // ToolStart events
      unlisteners.push(
        await agentApi.onToolStart((payload) => {
          if (payload.sessionId === sessionId) {
            onEvent(payload.data);
          }
        })
      );

      // ToolProgress events
      unlisteners.push(
        await agentApi.onAgentEvent('agent:tool-progress', (payload) => {
          if (payload.sessionId === sessionId) {
            onEvent(payload.data);
          }
        })
      );

      unlisteners.push(await agentApi.onAgentEvent("agent:helper", (payload) => {
        if (payload.sessionId === sessionId) onEvent(payload.data);
      }));

      // ToolEnd events
      unlisteners.push(
        await agentApi.onToolEnd((payload) => {
          if (payload.sessionId === sessionId) {
            onEvent(payload.data);
          }
        })
      );

      // PermissionRequest events
      unlisteners.push(
        await agentApi.onPermissionRequest((payload) => {
          if (payload.sessionId === sessionId) {
            onEvent(payload.data);
          }
        })
      );

      // AskUserQuestion events
      unlisteners.push(
        await agentApi.onAskUserQuestion((payload) => {
          if (payload.sessionId === sessionId) {
            onEvent(payload.data);
          }
        })
      );

      // StateChange events
      unlisteners.push(
        await agentApi.onAgentEvent('agent:state-change', (payload) => {
          if (payload.sessionId === sessionId) {
            onEvent(payload.data);
          }
        })
      );


      // Error events
      unlisteners.push(
        await agentApi.onAgentError((payload) => {
          if (payload.sessionId === sessionId) {
            onEvent(payload.data);
          }
        })
      );

      // Done events
      unlisteners.push(
        await agentApi.onAgentDone((payload) => {
          if (payload.sessionId === sessionId) {
            onEvent(payload.data);
          }
        })
      );
    };

    setupListeners();

    // Cleanup: unlisten from all events
    return () => {
      console.log(`[useAgentEvents:${sessionId}] Cleaning up event listeners (${unlisteners.length} listeners)`);
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [sessionId, onEvent]);
}
