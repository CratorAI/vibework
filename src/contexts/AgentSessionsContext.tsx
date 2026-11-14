/**
 * Context for managing all agent sessions
 *
 * This context manages:
 * 1. Session list - all sessions from disk (create, delete, resume, list)
 * 2. Active sessions - sessions open as tabs with live state
 * 3. Event routing - streaming events routed to correct session
 *
 * Key principle: Each tab connects to its own AgentSession instance within this context.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getUsage } from "../tauri/usage";
import { agentApi } from "../tauri/agent";
import { overlayApi } from "../tauri/overlay";
import { generateSessionId } from "../utils/sessionIdGenerator";
import { convertHistoryToMessages } from "../utils/agentHistoryConverter";
import { applyStreamChunk } from "../utils/agentEventHandler";

/** An answer as the answered-question card shows it (several choices joined). */
function shownAnswer(value: string): string {
  try {
    const list: unknown = JSON.parse(value);
    if (Array.isArray(list) && list.every((v) => typeof v === "string")) return list.join(", ");
  } catch {
    /* a plain answer */
  }
  return value;
}
import { useActiveSessionEvents } from "../hooks/useActiveSessionEvents";
import type {
  SessionInfo,
  ChatMessage,
  TodoItem,
  TextBlock,
  OutputChunkData,
  PermissionRequestRaw,
} from "../types/agent";
import { toPermissionRequest } from "../types/agent";
import type {
  AgentSessionStateStored,
  AgentSessionHandlers,
  AgentSession,
} from "../types/session";
import { createInitialSessionState } from "../types/session";

/**
 * Context value type
 */
export interface AgentSessionsContextValue {
  // Session list management
  sessions: SessionInfo[];
  isLoading: boolean;
  runningSessions: string[];
  createSession: (name: string) => Promise<string>;
  resumeSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, newName: string) => Promise<void>;
  /** Move a conversation to the Settled shelf, or bring it back to the active list */
  setSessionSettled: (sessionId: string, settled: boolean) => Promise<void>;
  refreshSessions: () => Promise<void>;
  refreshRunningSessions: () => Promise<void>;

  // Active sessions (tabs) management
  activeSessions: Map<string, AgentSessionStateStored>;
  activeSessionId: string | null;
  openSession: (sessionId: string) => Promise<void>;
  closeSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string) => void;
  clearActiveSession: () => void;
  getSession: (sessionId: string) => AgentSession | undefined;
  /** The conversation has opened the latest presented file (see `revealLatestFile`) */
  consumeRevealLatestFile: (sessionId: string) => void;

  // Start a new conversation (creates session + sends first message)
  startNewConversation: (text: string) => Promise<string>;

  // Working folder for new conversations (before session exists)
  pendingWorkingFolder: string | null;
  setPendingWorkingFolder: (folder: string | null) => void;

  // OpenRouter model id for new conversations (before session exists).
  // null means "use the default model".
  pendingModel: string | null;
  setPendingModel: (modelId: string | null) => void;

  // Permission mode for new conversations (before session exists)
  pendingPermissionMode: string | null;
  setPendingPermissionMode: (mode: string | null) => void;

  // Convenience for active session
  activeSession: AgentSession | null;

  error: string | null;
}

/**
 * How often buffered stream chunks are applied to state. Models emit deltas far faster than the screen needs them; one
 * state update per chunk re-rendered every context consumer per token. A
 * timer rather than requestAnimationFrame keeps flushing while the window is
 * hidden (rAF pauses there).
 */
const STREAM_FLUSH_MS = 50;

/**
 * Freeze the finished turn's messages as they will look once reloaded. A
 * settled message stays on screen until the history that replaces it is in
 * state, so the end of a turn never blanks; nothing streams into it again.
 */
function settleStreamBuffer(buffer: ChatMessage[]): ChatMessage[] {
  return buffer.map((msg) => ({
    ...msg,
    isStreaming: false,
    settled: true,
    blocks: msg.blocks.map((block) => {
      if (block.type === "tool") {
        return block.call.isExecuting
          ? { ...block, call: { ...block.call, isExecuting: false } }
          : block;
      }
      return block.isComplete ? block : { ...block, isComplete: true };
    }),
  }));
}

function countUserMessages(messages: ChatMessage[]): number {
  return messages.reduce((n, m) => (m.role === "user" ? n + 1 : n), 0);
}

/**
 * Optimistic user message for a turn being sent. `userOrdinal` records where
 * it will sit among the conversation's user messages, so a history reload
 * can tell whether the disk copy already contains it.
 */
function optimisticUserMessage(text: string, userOrdinal: number): ChatMessage {
  const now = Date.now();
  return {
    id: `user-${now}`,
    role: "user",
    blocks: [
      {
        type: "text",
        id: `text-${now}`,
        content: text,
        isComplete: true,
      } as TextBlock,
    ],
    timestamp: new Date(),
    isStreaming: false,
    userOrdinal,
  };
}

/**
 * Combine freshly loaded history with what is in the stream buffer.
 *
 * Settled messages (finished turns) are replaced by the history. A turn that
 * is still streaming stays in the buffer; if the history on disk already
 * holds its start (the backend appends the user message, and each finished
 * model step, as the turn runs), the history is cut before that turn's user
 * message so the live turn is shown once, from the buffer.
 */
function mergeHistory(
  converted: ChatMessage[],
  streamBuffer: ChatMessage[],
): { historyMessages: ChatMessage[]; streamBuffer: ChatMessage[] } {
  const live = streamBuffer.filter((m) => !m.settled);
  const liveUser = live.find(
    (m) => m.role === "user" && m.userOrdinal !== undefined,
  );
  if (!liveUser) {
    // No turn in flight from this window: any user message left is an
    // optimistic copy the history now holds.
    return {
      historyMessages: converted,
      streamBuffer: live.filter((m) => m.role !== "user"),
    };
  }
  let seen = -1;
  const cut = converted.findIndex(
    (m) => m.role === "user" && ++seen === liveUser.userOrdinal,
  );
  return {
    historyMessages: cut === -1 ? converted : converted.slice(0, cut),
    streamBuffer: live,
  };
}

/**
 * Create the context
 */
const AgentSessionsContext = createContext<
  AgentSessionsContextValue | undefined
>(undefined);

/**
 * Provider props
 */
export interface AgentSessionsProviderProps {
  children: ReactNode;
}

/**
 * Provider component that wraps the application
 */
export function AgentSessionsProvider({
  children,
}: AgentSessionsProviderProps) {
  // Session list state
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [runningSessions, setRunningSessions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active sessions state (tabs) - messages are derived in getSession()
  const [activeSessions, setActiveSessions] = useState<
    Map<string, AgentSessionStateStored>
  >(new Map());
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(
    null,
  );
  // Pending working folder (for new conversations before session exists)
  const [pendingWorkingFolder, setPendingWorkingFolderState] = useState<string | null>(null);
  // Pending model id (for new conversations before session exists)
  const [pendingModel, setPendingModelState] = useState<string | null>(null);
  // Pending permission mode (for new conversations before session exists)
  const [pendingPermissionMode, setPendingPermissionMode] = useState<string | null>(null);

  // Ref for current active session ID (used in event handlers to check if session is being viewed)
  const activeSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  // Ref for sessions list (used in event handlers to get session names)
  const sessionsRef = useRef<SessionInfo[]>([]);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // Get list of active session IDs for event subscription
  const activeSessionIds = useMemo(
    () => Array.from(activeSessions.keys()),
    [activeSessions],
  );

  // ============================================
  // Session List Management
  // ============================================

  const refreshSessions = useCallback(async () => {
    try {
      const list = await agentApi.listSessions();
      setSessions(list);
      setError(null);
    } catch (err) {
      console.error("[AgentSessionsContext] Failed to list sessions:", err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const refreshRunningSessions = useCallback(async () => {
    try {
      const running = await agentApi.listRunning();
      setRunningSessions(running);
      setError(null);
    } catch (err) {
      console.error(
        "[AgentSessionsContext] Failed to list running sessions:",
        err,
      );
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Load sessions on mount
  useEffect(() => {
    Promise.all([refreshSessions(), refreshRunningSessions()]).finally(() => {
      setIsLoading(false);
    });
  }, [refreshSessions, refreshRunningSessions]);

  // The engine names a task early in its first turn; show the name then,
  // not only when the turn ends.
  useEffect(() => {
    const subscription = listen("agent:session-renamed", () => void refreshSessions());
    return () => { void subscription.then((unlisten) => unlisten()); };
  }, [refreshSessions]);

  // ============================================
  // Active Session State Helpers
  // ============================================

  const updateSessionState = useCallback(
    (
      sessionId: string,
      updater: (prev: AgentSessionStateStored) => AgentSessionStateStored,
    ) => {
      setActiveSessions((prev) => {
        const current = prev.get(sessionId);
        if (!current) return prev;
        const newMap = new Map(prev);
        newMap.set(sessionId, updater(current));
        return newMap;
      });
    },
    [],
  );

  // Connector notes for the message just sent: they belong to the optimistic
  // user message (the history copy carries them once reloaded).
  const attachNotes = useCallback(
    (sessionId: string, notes: string[]) => {
      updateSessionState(sessionId, (state) => {
        const index = state.streamBuffer.findIndex((m) => m.role === "user" && !m.settled && m.userOrdinal !== undefined);
        if (index === -1) return state;
        const streamBuffer = state.streamBuffer.slice();
        streamBuffer[index] = { ...streamBuffer[index], notes };
        return { ...state, streamBuffer };
      });
    },
    [updateSessionState],
  );

  // Latest history request per session: a slower, older read must not
  // overwrite a newer one.
  const historyLoadSeqRef = useRef(new Map<string, number>());

  const loadSessionHistory = useCallback(
    async (sessionId: string, attempt = 0): Promise<void> => {
      const seq = (historyLoadSeqRef.current.get(sessionId) ?? 0) + 1;
      historyLoadSeqRef.current.set(sessionId, seq);
      try {
        const history = await agentApi.loadSession(sessionId);
        const usage = await invoke<import("../types/agent").UsageTotals>("agent_get_usage", { sessionId }).catch(() => undefined);
        if (historyLoadSeqRef.current.get(sessionId) !== seq) return;
        const converted = convertHistoryToMessages(history);
        const pendingQuestion = await invoke<import("../types/agent").AskUserQuestionRaw | null>("agent_pending_question", {sessionId}).catch(() => null);
        // A permission request still waiting in the engine: the event that
        // showed it may have gone to a page that has since reloaded, or to a
        // task view that was closed.
        const pendingPermission = await invoke<PermissionRequestRaw | null>("agent_pending_permission", {sessionId}).catch(() => null);
        if (historyLoadSeqRef.current.get(sessionId) !== seq) return;

        // One update swaps the settled turn for its reloaded copy. The view
        // keys messages, groups and timeline entries by position, so the swap
        // updates the same components in place: no blank frame, no remount.
        updateSessionState(sessionId, (state) => ({
          ...state,
          ...mergeHistory(converted, state.streamBuffer),
          ...(pendingQuestion ? {questionRequest:{requestId:pendingQuestion.request_id,questions:pendingQuestion.questions},isLoading:true} : {}),
          ...(pendingPermission ? {permissionRequest: toPermissionRequest(pendingPermission), isLoading: true} : {}),
          usage: state.usage && usage && state.usage.calls > usage.calls ? state.usage : usage ?? state.usage,
          // A failed turn also emits Done. Keep its error through this reload
          // so React can render it; the next send clears it.
        }));
      } catch (err) {
        if (historyLoadSeqRef.current.get(sessionId) !== seq) return;
        console.error(
          `[AgentSessionsContext] Failed to load history for ${sessionId}:`,
          err,
        );
        // The engine may be restarting (a turn it ended just before): try
        // again shortly instead of failing on the first read.
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
          if (historyLoadSeqRef.current.get(sessionId) !== seq) return;
          return loadSessionHistory(sessionId, attempt + 1);
        }
        // Keep the error that explains why the turn ended, if there is one.
        updateSessionState(sessionId, (state) => ({
          ...state,
          error: state.error ?? (err instanceof Error ? err.message : String(err)),
        }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- retries call itself
    [updateSessionState],
  );

  // Tasks still waiting on the user when this page loads (a reload, or a
  // relaunch with a saved question): load them in the background so their
  // sidebar rows, the waiting count and the toast show, and the prompt is
  // docked when one is opened.
  useEffect(() => {
    let cancelled = false;
    invoke<string[]>("agent_waiting_sessions")
      .then((ids) => {
        if (cancelled) return;
        for (const id of ids) {
          setActiveSessions((prev) => {
            if (prev.has(id)) return prev;
            const next = new Map(prev);
            next.set(id, { ...createInitialSessionState(), isLoading: true, hasUnseenNotification: true });
            return next;
          });
          // Runs after the state above is applied (its first await yields).
          void loadSessionHistory(id);
        }
      })
      .catch((err) => console.warn("[AgentSessionsContext] Could not list waiting tasks:", err));
    return () => {
      cancelled = true;
    };
    // Once per page load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================
  // Event Handling for All Active Sessions
  // ============================================

  // Stream chunks waiting for the next flush, per session, in arrival order.
  const pendingChunksRef = useRef(new Map<string, OutputChunkData[]>());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Apply every buffered chunk in one state update (= one render).
  const flushStreamChunks = useCallback(() => {
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const pending = pendingChunksRef.current;
    if (pending.size === 0) return;
    pendingChunksRef.current = new Map();

    setActiveSessions((prev) => {
      let next: Map<string, AgentSessionStateStored> | null = null;
      pending.forEach((chunks, sessionId) => {
        const current = prev.get(sessionId);
        if (!current) return;
        let streamBuffer = current.streamBuffer;
        let todos = current.todos;
        let usage = current.usage;
        for (const chunk of chunks) {
          if (chunk !== "Done" && "Usage" in chunk) { usage = chunk.Usage; continue; }
          // Extract todos from TodoWrite tool calls
          if (
            chunk !== "Done" &&
            "ToolStart" in chunk &&
            chunk.ToolStart.name === "TodoWrite"
          ) {
            const input = chunk.ToolStart.input as { todos?: TodoItem[] };
            if (input.todos && Array.isArray(input.todos)) {
              todos = input.todos as TodoItem[];
            }
          }
          streamBuffer = applyStreamChunk(streamBuffer, chunk);
        }
        if (streamBuffer === current.streamBuffer && todos === current.todos && usage === current.usage) {
          return;
        }
        next = next ?? new Map(prev);
        next.set(sessionId, { ...current, streamBuffer, todos, usage });
      });
      return next ?? prev;
    });
  }, []);

  useEffect(
    () => () => {
      if (flushTimerRef.current !== null) clearTimeout(flushTimerRef.current);
    },
    [],
  );

  const handleSessionEvent = useCallback(
    (sessionId: string, chunk: OutputChunkData) => {
      if (chunk !== 'Done' && 'UserMessage' in chunk) {
        flushStreamChunks();
        updateSessionState(sessionId, state => {
          if (state.streamBuffer.some(m => m.id === chunk.UserMessage.id)) return state;
          const next = applyStreamChunk(state.streamBuffer, chunk);
          const last = next[next.length - 1];
          if (last) last.userOrdinal = countUserMessages(state.historyMessages) + countUserMessages(state.streamBuffer);
          return { ...state, streamBuffer: next, isLoading: true, turnCompleted: false };
        });
        return;
      }
      // Buffer stream chunks; everything else first applies what is
      // buffered so events keep their order.
      const isStreamChunk =
        chunk !== "Done" &&
        !("StateChange" in chunk) &&
        !("PermissionRequest" in chunk) &&
        !("AskUserQuestion" in chunk) &&
        !("Error" in chunk);
      if (isStreamChunk) {
        const queue = pendingChunksRef.current.get(sessionId);
        if (queue) queue.push(chunk);
        else pendingChunksRef.current.set(sessionId, [chunk]);
        if (flushTimerRef.current === null) {
          flushTimerRef.current = setTimeout(flushStreamChunks, STREAM_FLUSH_MS);
        }
        return;
      }
      flushStreamChunks();
      // Logged after the early return: one log per token is a real cost on
      // long replies.
      console.log(`[AgentSessionsContext:${sessionId}] Event received:`, chunk);

      // Handle Done event - marks turn boundary
      if (chunk === "Done") {
        void getUsage().catch(() => {});
        console.log(
          `[AgentSessionsContext:${sessionId}] Done event - turn complete`,
        );
        // Mark notification as unseen only if user is not currently viewing this session
        const shouldNotify = sessionId !== activeSessionIdRef.current;
        updateSessionState(sessionId, (state) => ({
          ...state,
          // Keep the turn on screen, frozen as finished, until the reloaded
          // history replaces it (loadSessionHistory). Clearing it here blanked
          // the turn for the length of the disk read.
          streamBuffer: settleStreamBuffer(state.streamBuffer),
          isLoading: false,
          permissionRequest: null,
          questionRequest: null,
          turnCompleted: true,
          hasUnseenNotification: shouldNotify ? true : state.hasUnseenNotification,
        }));
        loadSessionHistory(sessionId);
        // Refresh session list to get updated conversationName, then show overlay
        refreshSessions().then(() => {
          // Clear any existing timeout
          if (doneOverlayTimeoutRef.current) {
            clearTimeout(doneOverlayTimeoutRef.current);
          }
          lastOverlayStateRef.current = `done:${sessionId}`;
          // Get session name from ref (now updated after refresh)
          const sessionInfo = sessionsRef.current.find(s => s.sessionId === sessionId);
          const sessionName = sessionInfo?.conversationName || sessionInfo?.name;
          console.log("[Overlay] Showing done overlay with session name:", sessionName);
          overlayApi.show({
            type: "done",
            message: "Task complete",
            session_id: sessionId,
            session_name: sessionName,
          });
        });
        // Clear the done state after overlay auto-dismisses (8 seconds + buffer)
        doneOverlayTimeoutRef.current = setTimeout(() => {
          if (lastOverlayStateRef.current?.startsWith("done:")) {
            lastOverlayStateRef.current = null;
          }
          doneOverlayTimeoutRef.current = null;
        }, 9000);
      }
      // Handle StateChange events
      else if ("StateChange" in chunk) {
        console.log(
          `[AgentSessionsContext:${sessionId}] StateChange:`,
          chunk.StateChange,
        );
        const agentState = chunk.StateChange;
        updateSessionState(sessionId, (state) => {
          let isLoading = state.isLoading;
          if (
            agentState === "Processing" ||
            (typeof agentState === "object" && "ExecutingTool" in agentState)
          ) {
            isLoading = true;
          } else if (agentState === "Idle" || agentState === "Done") {
            isLoading = false;
          }
          return { ...state, agentState, isLoading };
        });
      }
      // Handle PermissionRequest events
      else if ("PermissionRequest" in chunk) {
        const req = chunk.PermissionRequest;
        // Mark notification as unseen only if user is not currently viewing this session
        const shouldNotify = sessionId !== activeSessionIdRef.current;
        updateSessionState(sessionId, (state) => ({
          ...state,
          permissionRequest: toPermissionRequest(req),
          isLoading: true,
          hasUnseenNotification: shouldNotify ? true : state.hasUnseenNotification,
        }));
      }
      // Handle AskUserQuestion events
      else if ("AskUserQuestion" in chunk) {
        const req = chunk.AskUserQuestion;
        console.log(
          `[AgentSessionsContext:${sessionId}] AskUserQuestion received:`,
          req,
        );
        console.log(
          `[AgentSessionsContext:${sessionId}] Setting questionRequest with requestId:`,
          req.request_id,
        );
        // Mark notification as unseen only if user is not currently viewing this session
        const shouldNotify = sessionId !== activeSessionIdRef.current;
        updateSessionState(sessionId, (state) => {
          console.log(`[AgentSessionsContext:${sessionId}] Updating state for questionRequest`);
          return {
            ...state,
            questionRequest: {
              requestId: req.request_id,
              questions: req.questions,
            },
            isLoading: true,
            hasUnseenNotification: shouldNotify ? true : state.hasUnseenNotification,
          };
        });
      }
      // Handle Error events
      else if ("Error" in chunk) {
        updateSessionState(sessionId, (state) => ({
          ...state,
          error: chunk.Error,
          isLoading: false,
        }));
      }
    },
    [loadSessionHistory, updateSessionState, refreshSessions, flushStreamChunks],
  );

  // Subscribe to events for all active sessions
  useActiveSessionEvents(activeSessionIds, handleSessionEvent);

  // ============================================
  // Overlay Notification Management
  // ============================================

  // Track last shown overlay state to avoid redundant calls
  const lastOverlayStateRef = useRef<string | null>(null);
  // Track "done" overlay to prevent immediate hide
  const doneOverlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Helper to get session name from sessions list
  const getSessionName = useCallback((sessionId: string): string | undefined => {
    const session = sessions.find(s => s.sessionId === sessionId);
    return session?.conversationName || session?.name;
  }, [sessions]);

  useEffect(() => {
    const checkForOverlay = async () => {
      // Check all active sessions for permission or question requests
      for (const [sessionId, state] of activeSessions.entries()) {
        if (state.permissionRequest) {
          const stateKey = `permission:${sessionId}:${state.permissionRequest.requestId}`;
          if (lastOverlayStateRef.current !== stateKey) {
            lastOverlayStateRef.current = stateKey;
            console.log("[Overlay] Showing permission overlay:", stateKey);
            try {
              const result = await overlayApi.show({
                type: "permission",
                message: `Permission: ${state.permissionRequest.toolName}`,
                session_id: sessionId,
                session_name: getSessionName(sessionId),
              });
              console.log("[Overlay] Show result:", result);
            } catch (err) {
              console.error("[Overlay] Show failed:", err);
            }
          }
          return;
        }
        if (state.questionRequest) {
          const stateKey = `question:${sessionId}:${state.questionRequest.requestId}`;
          if (lastOverlayStateRef.current !== stateKey) {
            lastOverlayStateRef.current = stateKey;
            console.log("[Overlay] Showing question overlay:", stateKey);
            try {
              const result = await overlayApi.show({
                type: "question",
                message: "Input needed",
                session_id: sessionId,
                session_name: getSessionName(sessionId),
              });
              console.log("[Overlay] Show result:", result);
            } catch (err) {
              console.error("[Overlay] Show failed:", err);
            }
          }
          return;
        }
      }
      // No pending requests - hide overlay (but not if showing a "done" notification)
      if (lastOverlayStateRef.current !== null && !lastOverlayStateRef.current.startsWith("done:")) {
        console.log("[Overlay] Hiding overlay");
        lastOverlayStateRef.current = null;
        await overlayApi.hide();
      }
    };
    checkForOverlay();
  }, [activeSessions, getSessionName]);

  // ============================================
  // Session CRUD Operations
  // ============================================

  const createSession = useCallback(
    async (name: string): Promise<string> => {
      const sessionId = generateSessionId();

      try {
        await agentApi.createSession(sessionId, name);
        await refreshSessions();
        await refreshRunningSessions();

        // Auto-open the new session as a tab
        setActiveSessions((prev) => {
          const newMap = new Map(prev);
          newMap.set(sessionId, createInitialSessionState());
          return newMap;
        });
        setActiveSessionIdState(sessionId);

        setError(null);
        return sessionId;
      } catch (err) {
        console.error("[AgentSessionsContext] Failed to create session:", err);
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [refreshSessions, refreshRunningSessions],
  );

  const resumeSession = useCallback(
    async (sessionId: string): Promise<void> => {
      try {
        await agentApi.resumeSession(sessionId);
        await refreshRunningSessions();
        setError(null);
      } catch (err) {
        console.error("[AgentSessionsContext] Failed to resume session:", err);
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [refreshRunningSessions],
  );

  const deleteSession = useCallback(
    async (sessionId: string): Promise<void> => {
      try {
        await agentApi.deleteSession(sessionId);

        // Close tab if this session was open
        setActiveSessions((prev) => {
          if (!prev.has(sessionId)) return prev;
          const newMap = new Map(prev);
          newMap.delete(sessionId);
          return newMap;
        });

        // If this was the active session, switch to another
        if (activeSessionId === sessionId) {
          const remainingIds = activeSessionIds.filter(
            (id) => id !== sessionId,
          );
          const newActiveId = remainingIds.length > 0 ? remainingIds[0] : null;
          setActiveSessionIdState(newActiveId);
        }

        await refreshSessions();
        await refreshRunningSessions();
        setError(null);
      } catch (err) {
        console.error("[AgentSessionsContext] Failed to delete session:", err);
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [
      activeSessionId,
      activeSessionIds,
      refreshSessions,
      refreshRunningSessions,
    ],
  );

  const setSessionSettled = useCallback(
    async (sessionId: string, settled: boolean): Promise<void> => {
      const previous = sessions.find((s) => s.sessionId === sessionId)?.settledAt ?? null;
      const apply = (settledAt: string | null) =>
        setSessions((prev) => prev.map((s) => (s.sessionId === sessionId ? { ...s, settledAt } : s)));
      // Move the row at once; correct it if the backend refuses
      apply(settled ? new Date().toISOString() : null);
      try {
        apply(await agentApi.setSessionSettled(sessionId, settled));
      } catch (err) {
        apply(previous);
        console.error("[AgentSessionsContext] Failed to settle session:", err);
        throw err;
      }
    },
    [sessions],
  );

  const renameSession = useCallback(
    async (sessionId: string, newName: string): Promise<void> => {
      try {
        await agentApi.renameSession(sessionId, newName);
        await refreshSessions();
        setError(null);
      } catch (err) {
        console.error("[AgentSessionsContext] Failed to rename session:", err);
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [refreshSessions],
  );

  // ============================================
  // Tab (Active Session) Operations
  // ============================================

  const openSession = useCallback(
    async (sessionId: string): Promise<void> => {
      // If already open, just set active, clear notification, and return
      if (activeSessions.has(sessionId)) {
        setActiveSessionIdState(sessionId);
        // Clear notification when user views this session. A turn that
        // finished while the user was elsewhere shows its result: the
        // conversation opens its latest presented file once.
        updateSessionState(sessionId, (state) => ({
          ...state,
          hasUnseenNotification: false,
          revealLatestFile: (state.hasUnseenNotification && state.turnCompleted) || state.revealLatestFile,
        }));
        return;
      }

      // Create initial state and add to active sessions
      setActiveSessions((prev) => {
        const newMap = new Map(prev);
        newMap.set(sessionId, createInitialSessionState());
        return newMap;
      });

      // Set as active immediately
      setActiveSessionIdState(sessionId);

      // Resume session on backend if not already running
      if (!runningSessions.includes(sessionId)) {
        try {
          await agentApi.resumeSession(sessionId);
          await refreshRunningSessions();
        } catch (err) {
          console.error(
            `[AgentSessionsContext] Failed to resume session ${sessionId}:`,
            err,
          );
        }
      }

      // Load history
      await loadSessionHistory(sessionId);
    },
    [
      activeSessions,
      runningSessions,
      refreshRunningSessions,
      loadSessionHistory,
      updateSessionState,
    ],
  );

  const closeSession = useCallback(
    (sessionId: string) => {
      void invoke("motion_close_session", {sessionId}).catch(() => {});
      setActiveSessions((prev) => {
        if (!prev.has(sessionId)) return prev;
        const newMap = new Map(prev);
        newMap.delete(sessionId);
        return newMap;
      });

      // If closing the active session, switch to another
      if (activeSessionId === sessionId) {
        const remainingIds = activeSessionIds.filter((id) => id !== sessionId);
        const newActiveId = remainingIds.length > 0 ? remainingIds[0] : null;
        setActiveSessionIdState(newActiveId);
      }
    },
    [activeSessionId, activeSessionIds],
  );

  const setActiveSession = useCallback(
    (sessionId: string) => {
      if (!activeSessions.has(sessionId)) {
        console.warn(
          `[AgentSessionsContext] Cannot set active session ${sessionId} - not open`,
        );
        return;
      }
      setActiveSessionIdState(sessionId);
    },
    [activeSessions],
  );

  const clearActiveSession = useCallback(() => {
    setActiveSessionIdState(null);
    // Also clear any pending state when starting a new task
    setPendingWorkingFolderState(null);
    setPendingModelState(null);
    setPendingPermissionMode(null);
  }, []);

  const setPendingWorkingFolder = useCallback((folder: string | null) => {
    setPendingWorkingFolderState(folder);
  }, []);

  const setPendingModel = useCallback((modelId: string | null) => {
    setPendingModelState(modelId);
  }, []);

  const startNewConversation = useCallback(
    async (text: string): Promise<string> => {
      if (!text.trim()) throw new Error("Message text cannot be empty");

      // Generate session ID and create session
      const sessionId = generateSessionId();
      const sessionName = "New task";

      try {
        // Create the session on backend, passing working folder, model, and permission mode directly to avoid race condition
        console.log('[startNewConversation] Creating session:', sessionId, 'with working folder:', pendingWorkingFolder, 'model:', pendingModel, 'permission mode:', pendingPermissionMode);
        await agentApi.createSession(sessionId, sessionName, pendingWorkingFolder || undefined, pendingModel || undefined, pendingPermissionMode || undefined);
        setPendingPermissionMode(null);
        console.log('[startNewConversation] Session created');

        // Clear pending state after successful creation
        if (pendingWorkingFolder) {
          console.log('[startNewConversation] Clearing pending working folder');
          setPendingWorkingFolderState(null);
        }
        if (pendingModel) {
          console.log('[startNewConversation] Clearing pending model');
          setPendingModelState(null);
        }

        await refreshSessions();
        await refreshRunningSessions();

        // Add session to active sessions with the optimistic user message
        // (the conversation's first) in streamBuffer
        setActiveSessions((prev) => {
          const newMap = new Map(prev);
          newMap.set(sessionId, {
            ...createInitialSessionState(),
            isLoading: true, // Start in loading state since we're sending a message
            turnCompleted: false, // Not completed yet
            streamBuffer: [optimisticUserMessage(text, 0)], // Show user message immediately
          });
          return newMap;
        });

        // Switch to session IMMEDIATELY so user sees the chat view right away
        setActiveSessionIdState(sessionId);

        // Send message (don't await - let streaming events flow)
        // Don't call loadSessionHistory here - the optimistic user message is already shown
        // History will be loaded when Done event arrives
        await agentApi.sendMessage(sessionId, text);

        setError(null);
        return sessionId;
      } catch (err) {
        console.error(
          "[AgentSessionsContext] Failed to start new conversation:",
          err,
        );
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [pendingWorkingFolder, pendingModel, pendingPermissionMode, refreshSessions, refreshRunningSessions, loadSessionHistory],
  );

  // ============================================
  // Session Handlers Factory
  // ============================================

  const createSessionHandlers = useCallback(
    (sessionId: string): AgentSessionHandlers => ({
      sendMessage: async (text: string) => {
        if (!text.trim()) return;

        try {
          // Set loading and add an optimistic user message to the buffer. A
          // previous turn still waiting for its history reload stays put.
          updateSessionState(sessionId, (state) => {
            const settled = state.streamBuffer.filter((m) => m.settled);
            const userOrdinal =
              countUserMessages(state.historyMessages) +
              countUserMessages(settled);
            return {
              ...state,
              isLoading: true,
              error: null,
              turnCompleted: false,
              streamBuffer: [...settled, optimisticUserMessage(text, userOrdinal)],
            };
          });

          // Send to backend (non-blocking - returns before attachments are processed)
          // Don't await loadSessionHistory - optimistic message is already shown
          // History will be loaded when Done event arrives
          // The backend un-settles a settled conversation when a message is sent to it
          setSessions((prev) =>
            prev.some((s) => s.sessionId === sessionId && s.settledAt)
              ? prev.map((s) => (s.sessionId === sessionId ? { ...s, settledAt: null } : s))
              : prev,
          );
          const notes = await agentApi.sendMessage(sessionId, text);
          if (notes.length > 0) attachNotes(sessionId, notes);
        } catch (err) {
          console.error(
            `[AgentSessionsContext] Failed to send message to ${sessionId}:`,
            err,
          );
          updateSessionState(sessionId, (state) => ({
            ...state,
            error: err instanceof Error ? err.message : String(err),
            isLoading: false,
            streamBuffer: state.streamBuffer.filter(m => m.settled),
          }));
          throw err;
        }
      },

      interrupt: async () => {
        try {
          await agentApi.interrupt(sessionId);
          updateSessionState(sessionId, (state) => ({
            ...state,
            isLoading: false,
            error: null,
          }));
        } catch (err) {
          console.error(
            `[AgentSessionsContext] Failed to interrupt ${sessionId}:`,
            err,
          );
          updateSessionState(sessionId, (state) => ({
            ...state,
            error: err instanceof Error ? err.message : String(err),
          }));
        }
      },

      shutdown: async () => {
        try {
          await agentApi.shutdown(sessionId);
          updateSessionState(sessionId, (state) => ({
            ...state,
            isLoading: false,
            error: null,
          }));
        } catch (err) {
          console.error(
            `[AgentSessionsContext] Failed to shutdown ${sessionId}:`,
            err,
          );
          updateSessionState(sessionId, (state) => ({
            ...state,
            error: err instanceof Error ? err.message : String(err),
          }));
        }
      },

      respondToPermission: async (allowed: boolean, remember: boolean) => {
        const state = activeSessions.get(sessionId);
        if (!state?.permissionRequest) return;

        const answered = state.permissionRequest.requestId;
        try {
          await agentApi.permissionRespond(
            sessionId,
            answered,
            allowed,
            remember,
          );
          // Clear only the answered request: the next queued one may already be showing.
          updateSessionState(sessionId, (s) => ({
            ...s,
            permissionRequest: s.permissionRequest?.requestId === answered ? null : s.permissionRequest,
            error: null,
          }));
        } catch (err) {
          console.error(
            `[AgentSessionsContext] Failed to respond to permission for ${sessionId}:`,
            err,
          );
          updateSessionState(sessionId, (s) => ({
            ...s,
            error: err instanceof Error ? err.message : String(err),
            isLoading: false,
          }));
        }
      },

      respondToQuestion: async (answers: Record<string, string>) => {
        const state = activeSessions.get(sessionId);
        if (!state?.questionRequest) return;

        try {
          const request = state.questionRequest;
          const resent = await agentApi.questionRespond(
            sessionId,
            request.requestId,
            answers,
          );
          updateSessionState(sessionId, (s) => {
            let streamBuffer = s.streamBuffer;
            if (resent) {
              // Answered after a relaunch: the answers went back as a new
              // message. Show the answered question, as a live answer does
              // (the reloaded history shows the same card).
              const id = `relaunch-answer-${request.requestId}`;
              const shown = Object.fromEntries(Object.entries(answers).map(([header, value]) => [header, shownAnswer(value)]));
              streamBuffer = applyStreamChunk(streamBuffer, { ToolStart: { id, name: "AskUserQuestion", input: { questions: request.questions } } });
              streamBuffer = applyStreamChunk(streamBuffer, {
                ToolEnd: { id, result: { content: { Text: `User responded with the following answers:\n${JSON.stringify(shown)}` }, is_error: false } },
              });
            }
            return { ...s, streamBuffer, questionRequest: null, error: null };
          });
        } catch (err) {
          console.error(
            `[AgentSessionsContext] Failed to respond to question for ${sessionId}:`,
            err,
          );
          updateSessionState(sessionId, (s) => ({
            ...s,
            error: err instanceof Error ? err.message : String(err),
            isLoading: false,
          }));
        }
      },

      reloadHistory: async () => {
        await loadSessionHistory(sessionId);
      },
    }),
    [activeSessions, loadSessionHistory, updateSessionState, attachNotes],
  );

  // ============================================
  // Get Session (State + Handlers)
  // ============================================

  const getSession = useCallback(
    (sessionId: string): AgentSession | undefined => {
      const state = activeSessions.get(sessionId);
      if (!state) return undefined;

      return {
        state: {
          ...state,
          // Derive messages from historyMessages + streamBuffer
          messages: [...state.historyMessages, ...state.streamBuffer],
        },
        handlers: createSessionHandlers(sessionId),
      };
    },
    [activeSessions, createSessionHandlers],
  );

  // Convenience getter for active session
  const consumeRevealLatestFile = useCallback(
    (sessionId: string) => {
      updateSessionState(sessionId, (state) => (state.revealLatestFile ? { ...state, revealLatestFile: false } : state));
    },
    [updateSessionState],
  );

  const activeSession = useMemo((): AgentSession | null => {
    if (!activeSessionId) return null;
    return getSession(activeSessionId) || null;
  }, [activeSessionId, getSession]);

  // ============================================
  // Context Value
  // ============================================

  const value: AgentSessionsContextValue = {
    consumeRevealLatestFile,
    // Session list
    sessions,
    isLoading,
    runningSessions,
    createSession,
    resumeSession,
    deleteSession,
    renameSession,
    setSessionSettled,
    refreshSessions,
    refreshRunningSessions,

    // Active sessions
    activeSessions,
    activeSessionId,
    openSession,
    closeSession,
    setActiveSession,
    clearActiveSession,
    getSession,

    // Start new conversation
    startNewConversation,

    // Pending working folder
    pendingWorkingFolder,
    setPendingWorkingFolder,

    // Pending model
    pendingModel,
    setPendingModel,

    // Pending dangerous mode
    pendingPermissionMode,
    setPendingPermissionMode,

    // Convenience
    activeSession,

    error,
  };

  return (
    <AgentSessionsContext.Provider value={value}>
      {children}
    </AgentSessionsContext.Provider>
  );
}

/**
 * Hook to access the agent sessions context
 */
export function useAgentSessionsContext(): AgentSessionsContextValue {
  const context = useContext(AgentSessionsContext);

  if (context === undefined) {
    throw new Error(
      "useAgentSessionsContext must be used within an AgentSessionsProvider",
    );
  }

  return context;
}
