/**
 * Types for active session state management
 *
 * These types define the live state for sessions that are open as tabs,
 * as well as the handlers for interacting with those sessions.
 */

import type {
  ChatMessage,
  AgentState,
  PermissionRequest,
  AskUserQuestionRequest,
  TodoItem,
} from "./agent";

/**
 * State for an open/active session
 */
export interface AgentSessionState {
  usage?: import("./agent").UsageTotals;
  /** Combined messages for display (derived: history + stream buffer) */
  messages: ChatMessage[];
  /** History messages loaded from disk */
  historyMessages: ChatMessage[];
  /** Stream buffer for current turn */
  streamBuffer: ChatMessage[];
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
  /** Whether the agent just completed a turn (received Done event) */
  turnCompleted: boolean;
  /** Error message if any */
  error: string | null;
}

/**
 * Handlers for interacting with a session
 */
export interface AgentSessionHandlers {
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
}

/**
 * Combined state and handlers for a session
 */
export interface AgentSession {
  state: AgentSessionState;
  handlers: AgentSessionHandlers;
}

/**
 * Internal state stored in context (without derived messages)
 */
export type AgentSessionStateStored = Omit<AgentSessionState, "messages"> & {
  /** Whether this session has a notification the user hasn't seen yet */
  hasUnseenNotification: boolean;
  /**
   * Opened after finishing unseen: the conversation opens the turn's latest
   * presented file in the panel once (as it would have live), then clears it.
   */
  revealLatestFile?: boolean;
};

/**
 * Create initial state for a new active session
 */
export function createInitialSessionState(): AgentSessionStateStored {
  return {
    historyMessages: [],
    streamBuffer: [],
    isLoading: false,
    agentState: "Idle",
    permissionRequest: null,
    questionRequest: null,
    todos: [],
    turnCompleted: false,
    error: null,
    hasUnseenNotification: false,
  };
}
