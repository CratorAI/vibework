/**
 * Hook for managing an individual agent session
 *
 * This hook implements the History + Stream Buffer pattern:
 * - historyMessages: Complete turns loaded from disk (source of truth)
 * - streamBuffer: Current turn's streaming output (ephemeral)
 * - displayedMessages = historyMessages + streamBuffer
 *
 * Turn boundaries are marked by OutputChunk::Done, which triggers:
 * 1. Reload history from disk
 * 2. Clear stream buffer
 * 3. Set isLoading = false
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { agentApi } from "../tauri/agent";
import { useAgentEvents } from "./useAgentEvents";
import { convertHistoryToMessages } from "../utils/agentHistoryConverter";
import { handleStreamChunk } from "../utils/agentEventHandler";
import type {
  ChatMessage,
  AgentState,
  PermissionRequest,
  AskUserQuestionRequest,
  TodoItem,
} from "../types/agent";

export interface UseAgentSessionResult {
  /** Combined messages for display (history + stream buffer) */
  messages: ChatMessage[];
  /** Whether the agent is currently processing */
  isLoading: boolean;
  /** Current agent state */
  agentState: AgentState;
  /** Active permission request (if any) */
  permissionRequest: PermissionRequest | null;
  /** Active question request (if any) */
  questionRequest: AskUserQuestionRequest | null;
  /** Current todo list from TodoWrite tool calls */
  todos: TodoItem[];
  /** Send a message to the agent */
  sendMessage: (text: string) => Promise<void>;
  /** Interrupt the current agent response */
  interrupt: () => Promise<void>;
  /** Shutdown the agent session */
  shutdown: () => Promise<void>;
  /** Respond to a permission request */
  respondToPermission: (allowed: boolean, remember: boolean) => Promise<void>;
  /** Respond to a question request */
  respondToQuestion: (answers: Record<string, string>) => Promise<void>;
  /** Reload history from disk */
  reloadHistory: () => Promise<void>;
  /** Error message if any */
  error: string | null;
}

/**
 * Hook to manage an individual agent session
 *
 * @param sessionId - The session ID to manage (null to skip initialization)
 * @returns Session state and control functions
 *
 * @example
 * ```tsx
 * const {
 *   messages,
 *   isLoading,
 *   sendMessage,
 *   interrupt
 * } = useAgentSession(sessionId);
 *
 * return (
 *   <ChatView
 *     messages={messages}
 *     onSend={sendMessage}
 *     onInterrupt={interrupt}
 *     isLoading={isLoading}
 *   />
 * );
 * ```
 */
export function useAgentSession(
  sessionId: string | null,
): UseAgentSessionResult {
  // History from disk (read-only, source of truth)
  const [historyMessages, setHistoryMessages] = useState<ChatMessage[]>([]);

  // Stream buffer for current turn (ephemeral)
  const [streamBuffer, setStreamBuffer] = useState<ChatMessage[]>([]);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [agentState, setAgentState] = useState<AgentState>("Idle");
  const [permissionRequest, setPermissionRequest] =
    useState<PermissionRequest | null>(null);
  const [questionRequest, setQuestionRequest] =
    useState<AskUserQuestionRequest | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  /**
   * Combined messages for display
   * This is what the UI should render
   */
  const messages = useMemo(
    () => [...historyMessages, ...streamBuffer],
    [historyMessages, streamBuffer],
  );

  /**
   * Load history from disk
   * This is the single source of truth for completed turns
   */
  const loadHistory = useCallback(async () => {
    if (!sessionId) {
      setHistoryMessages([]);
      return;
    }

    try {
      const history = await agentApi.loadSession(sessionId);
      const converted = convertHistoryToMessages(history);
      setHistoryMessages(converted);
      setError(null);
    } catch (err) {
      console.error("[useAgentSession] Failed to load history:", err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [sessionId]);

  /**
   * Load history on mount or when sessionId changes
   */
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  /**
   * Clear todos when session changes
   */
  useEffect(() => {
    setTodos([]);
  }, [sessionId]);

  /**
   * Subscribe to agent events and handle OutputChunks
   */
  useAgentEvents(
    sessionId,
    useCallback(
      (chunk) => {
        // Handle Done event - marks turn boundary
        if (chunk === "Done") {
          console.log(
            `[useAgentSession:${sessionId}] Done event received - turn complete`,
          );
          // ⭐ MANDATORY: Reload history from disk (includes just-completed turn)
          loadHistory();
          // Clear stream buffer (reset for next turn)
          setStreamBuffer([]);
          // Re-enable input
          setIsLoading(false);
          // Clear any active permission request and question request
          setPermissionRequest(null);
          setQuestionRequest(null);
        }

        // Handle StateChange events
        else if ("StateChange" in chunk) {
          console.log(
            `[useAgentSession:${sessionId}] StateChange:`,
            chunk.StateChange,
          );
          setAgentState(chunk.StateChange);

          // Auto-set loading based on state
          const state = chunk.StateChange;
          if (
            state === "Processing" ||
            (typeof state === "object" && "ExecutingTool" in state)
          ) {
            setIsLoading(true);
          } else if (state === "Idle" || state === "Done") {
            setIsLoading(false);
          }
        }

        // Handle PermissionRequest events
        else if ("PermissionRequest" in chunk) {
          const req = chunk.PermissionRequest;
          setPermissionRequest({
            requestId: req.request_id,
            toolName: req.tool_name,
            action: req.action,
            input: req.input,
            details: req.details,
            helper: req.helper,
          });
          setIsLoading(true); // Waiting for user input
        }

        // Handle AskUserQuestion events
        else if ("AskUserQuestion" in chunk) {
          const req = chunk.AskUserQuestion;
          console.log(`[useAgentSession:${sessionId}] AskUserQuestion:`, req);
          setQuestionRequest({
            requestId: req.request_id,
            questions: req.questions,
          });
          setIsLoading(true); // Waiting for user input
        }

        // Handle Error events
        else if ("Error" in chunk) {
          setError(chunk.Error);
          setIsLoading(false);
        }

        // All other streaming events update the buffer
        else {
          // Log streaming chunks (sample to avoid spam)
          if ("TextDelta" in chunk) {
            console.log(
              `[useAgentSession:${sessionId}] TextDelta:`,
              chunk.TextDelta.substring(0, 20),
            );
          } else if ("ToolStart" in chunk) {
            console.log(
              `[useAgentSession:${sessionId}] ToolStart:`,
              chunk.ToolStart.name,
            );
            // Extract todos from TodoWrite tool calls
            if (chunk.ToolStart.name === "TodoWrite") {
              const input = chunk.ToolStart.input as { todos?: TodoItem[] };
              if (input.todos && Array.isArray(input.todos)) {
                setTodos(input.todos);
              }
            }
          } else if ("ToolEnd" in chunk) {
            console.log(
              `[useAgentSession:${sessionId}] ToolEnd:`,
              chunk.ToolEnd.id,
            );
          }
          handleStreamChunk(chunk, setStreamBuffer);
        }
      },
      [loadHistory, sessionId],
    ),
  );

  /**
   * Send a message to the agent
   */
  const sendMessage = useCallback(
    async (text: string) => {
      if (!sessionId || !text.trim()) {
        return;
      }

      try {
        console.log(
          `[useAgentSession:${sessionId}] sendMessage called:`,
          text.substring(0, 50),
        );
        setIsLoading(true);
        setError(null);

        // Send to backend (backend saves user message to disk)
        console.log(
          `[useAgentSession:${sessionId}] Calling agentApi.sendMessage`,
        );
        await agentApi.sendMessage(sessionId, text);
        console.log(
          `[useAgentSession:${sessionId}] agentApi.sendMessage completed`,
        );

        // ⭐ MANDATORY: Reload history to get user message from disk
        console.log(
          `[useAgentSession:${sessionId}] Reloading history after send`,
        );
        await loadHistory();

        // Clear stream buffer for new turn
        setStreamBuffer([]);
        console.log(
          `[useAgentSession:${sessionId}] Stream buffer cleared, ready for agent response`,
        );
      } catch (err) {
        console.error(
          `[useAgentSession:${sessionId}] Failed to send message:`,
          err,
        );
        setError(err instanceof Error ? err.message : String(err));
        setIsLoading(false);
      }
    },
    [sessionId, loadHistory],
  );

  /**
   * Interrupt the current agent response
   */
  const interrupt = useCallback(async () => {
    if (!sessionId) {
      return;
    }

    try {
      await agentApi.interrupt(sessionId);
      setIsLoading(false);
      setError(null);
    } catch (err) {
      console.error("[useAgentSession] Failed to interrupt:", err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [sessionId]);

  /**
   * Shutdown the agent session
   */
  const shutdown = useCallback(async () => {
    if (!sessionId) {
      return;
    }

    try {
      await agentApi.shutdown(sessionId);
      setIsLoading(false);
      setError(null);
    } catch (err) {
      console.error("[useAgentSession] Failed to shutdown:", err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [sessionId]);

  /**
   * Respond to a permission request
   */
  const respondToPermission = useCallback(
    async (allowed: boolean, remember: boolean) => {
      if (!sessionId || !permissionRequest) {
        return;
      }

      try {
        const answered = permissionRequest.requestId;
        await agentApi.permissionRespond(
          sessionId,
          answered,
          allowed,
          remember,
        );
        // Clear only the answered request: the next queued one may already be showing.
        setPermissionRequest((current) => (current?.requestId === answered ? null : current));
        setError(null);

        // If allowed, agent will continue; if denied, it will stop
        // Either way, we stay in loading state until Done is received
      } catch (err) {
        console.error(
          "[useAgentSession] Failed to respond to permission:",
          err,
        );
        setError(err instanceof Error ? err.message : String(err));
        setIsLoading(false);
      }
    },
    [sessionId, permissionRequest],
  );

  /**
   * Respond to a question request
   */
  const respondToQuestion = useCallback(
    async (answers: Record<string, string>) => {
      if (!sessionId || !questionRequest) {
        return;
      }

      try {
        await agentApi.questionRespond(
          sessionId,
          questionRequest.requestId,
          answers,
        );
        setQuestionRequest(null);
        setError(null);

        // Agent will continue after receiving the response
        // Stay in loading state until Done is received
      } catch (err) {
        console.error("[useAgentSession] Failed to respond to question:", err);
        setError(err instanceof Error ? err.message : String(err));
        setIsLoading(false);
      }
    },
    [sessionId, questionRequest],
  );

  return {
    messages,
    isLoading,
    agentState,
    permissionRequest,
    questionRequest,
    todos,
    sendMessage,
    interrupt,
    shutdown,
    respondToPermission,
    respondToQuestion,
    reloadHistory: loadHistory,
    error,
  };
}
