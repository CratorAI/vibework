/**
 * Agent API module
 * Handles all agent-related Tauri commands
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn, Event } from "@tauri-apps/api/event";
import type {
  SessionInfo,
  MessageInfo,
  OutputChunkData,
  PermissionRequestRaw,
  AskUserQuestionRaw,
} from "../types/agent";

/**
 * Create a new agent session
 * @param sessionId - Unique identifier for the session
 * @param name - Name of the session
 * @param workingFolder - Optional working folder path to set for the session
 * @param model - Optional OpenRouter model id for this session (defaults to the default model)
 * @param permissionMode - Optional permission mode (ask, auto, skip); defaults to the Settings default
 * @returns Promise<void>
 */
export async function createSession(
  sessionId: string,
  name: string,
  workingFolder?: string,
  model?: string,
  permissionMode?: string,
): Promise<void> {
  return await invoke("agent_create_session", { sessionId, name, workingFolder, model, permissionMode });
}

/**
 * Send a message to an agent
 * @param sessionId - Session ID to send message to
 * @param message - Message content
 * @returns Connector notes for this message (empty when the task's tools did not change)
 */
export async function sendMessage(
  sessionId: string,
  message: string,
): Promise<string[]> {
  // The task's connector notes for this message ("Connector added: …"), if its tools changed
  return (await invoke<string[] | null>("agent_send_message", { sessionId, message })) ?? [];
}

/**
 * Interrupt the current agent response
 * @param sessionId - Session ID to interrupt
 * @returns Promise<void>
 */
export async function interrupt(sessionId: string): Promise<void> {
  return await invoke("agent_interrupt", { sessionId });
}

/**
 * Shutdown an agent session
 * @param sessionId - Session ID to shutdown
 * @returns Promise<void>
 */
export async function shutdown(sessionId: string): Promise<void> {
  return await invoke("agent_shutdown", { sessionId });
}

/**
 * Respond to a permission request
 * @param sessionId - Session ID
 * @param requestId - ID of the request being answered (from the PermissionRequest event)
 * @param allowed - Whether to allow the tool execution
 * @param remember - Whether to remember this decision
 * @returns Promise<void>
 */
export async function permissionRespond(
  sessionId: string,
  requestId: string,
  allowed: boolean,
  remember: boolean,
): Promise<void> {
  return await invoke("agent_permission_respond", {
    sessionId,
    requestId,
    allowed,
    remember,
  });
}

/**
 * Respond to an AskUserQuestion request
 * @param sessionId - Session ID
 * @param requestId - The question request ID
 * @param answers - Map of question header to selected answer(s)
 * @returns Promise<void>
 */
export async function questionRespond(
  sessionId: string,
  requestId: string,
  answers: Record<string, string>,
): Promise<boolean> {
  // true: the engine had restarted, so the answers went back as a new message
  return await invoke<boolean>("agent_question_respond", {
    sessionId,
    requestId,
    answers,
  });
}

/**
 * List all sessions
 * @returns Promise<SessionInfo[]> - List of all sessions
 */
export async function listSessions(): Promise<SessionInfo[]> {
  return await invoke<SessionInfo[]>("agent_list_sessions");
}

/**
 * Load a session (returns history)
 * @param sessionId - Session ID to load
 * @returns Promise<MessageInfo[]> - Message history
 */
export async function loadSession(sessionId: string): Promise<MessageInfo[]> {
  return await invoke<MessageInfo[]>("agent_load_session", { sessionId });
}

/**
 * Resume an existing session (load + spawn agent)
 * @param sessionId - Session ID to resume
 * @returns Promise<MessageInfo[]> - Message history
 */
export async function resumeSession(sessionId: string): Promise<MessageInfo[]> {
  return await invoke<MessageInfo[]>("agent_resume_session", { sessionId });
}

/**
 * Delete a session
 * @param sessionId - Session ID to delete
 * @returns Promise<void>
 */
export async function deleteSession(sessionId: string): Promise<void> {
  return await invoke("agent_delete_session", { sessionId });
}

/**
 * Check if an agent session is currently running
 * @param sessionId - Session ID to check
 * @returns Promise<boolean> - true if running, false otherwise
 */
export async function isRunning(sessionId: string): Promise<boolean> {
  return await invoke<boolean>("agent_is_running", { sessionId });
}

/**
 * Get list of currently running agent session IDs
 * @returns Promise<string[]> - List of running session IDs
 */
export async function listRunning(): Promise<string[]> {
  return await invoke<string[]>("agent_list_running");
}

/**
 * Rename a session (update its conversation name)
 * @param sessionId - Session ID to rename
 * @param newName - New name for the session
 * @returns Promise<void>
 */
export async function renameSession(
  sessionId: string,
  newName: string,
): Promise<void> {
  return await invoke("agent_rename_session", { sessionId, newName });
}

/**
 * Settle a conversation (move it to the Settled shelf) or un-settle it
 * @returns the settled time, or null when un-settled
 */
export async function setSessionSettled(sessionId: string, settled: boolean): Promise<string | null> {
  return await invoke<string | null>("agent_set_settled", { sessionId, settled });
}

/**
 * Set the working folder for a session
 * @param sessionId - Session ID
 * @param folderPath - Absolute path to the working folder
 * @returns Promise<void>
 */
export async function setWorkingFolder(
  sessionId: string,
  folderPath: string,
): Promise<void> {
  return await invoke("agent_set_working_folder", { sessionId, folderPath });
}

/**
 * Get the working folder for a session
 * @param sessionId - Session ID
 * @returns Promise<string | null> - Working folder path or null if not set
 */
export async function getWorkingFolder(
  sessionId: string,
): Promise<string | null> {
  return await invoke<string | null>("agent_get_working_folder", { sessionId });
}

/**
 * Switch a session to a different model
 * @param modelId - OpenRouter model id (e.g. "deepseek/deepseek-v4.1-flash")
 * @param sessionId - Session to switch
 * @returns Promise<void>
 */
export async function switchModel(
  modelId: string,
  sessionId: string,
): Promise<void> {
  return await invoke("agent_switch_model", { modelId, sessionId });
}

/**
 * Get the model a session is using
 * @param sessionId - Session ID
 * @returns Promise<string> - OpenRouter model id
 */
export async function getModel(sessionId: string): Promise<string> {
  return await invoke<string>("agent_get_model", { sessionId });
}

// Agent event listeners
export type AgentEventType =
  | "agent:text-delta"
  | "agent:text-complete"
  | "agent:thinking-delta"
  | "agent:thinking-complete"
  | "agent:tool-start"
  | "agent:tool-progress"
  | "agent:helper"
  | "agent:tool-end"
  | "agent:permission-request"
  | "agent:ask-user-question"
  | "agent:state-change"
  | "agent:user-message"
  | "agent:error"
  | "agent:done";

export interface AgentEventPayload<T = OutputChunkData> {
  sessionId: string;
  data: T;
}

/**
 * Generic agent event listener
 * @param eventType - Type of event to listen for
 * @param handler - Callback to handle the event
 * @returns Promise<UnlistenFn> - Function to unlisten
 */
export async function onAgentEvent<T = OutputChunkData>(
  eventType: AgentEventType,
  handler: (payload: AgentEventPayload<T>) => void,
): Promise<UnlistenFn> {
  return await listen<AgentEventPayload<T>>(
    eventType,
    (event: Event<AgentEventPayload<T>>) => {
      handler(event.payload);
    },
  );
}

// Specific event listeners for common use cases
export const onTextDelta = (
  handler: (payload: AgentEventPayload<{ TextDelta: string }>) => void,
) => onAgentEvent("agent:text-delta", handler);

export const onThinkingDelta = (
  handler: (payload: AgentEventPayload<{ ThinkingDelta: string }>) => void,
) => onAgentEvent("agent:thinking-delta", handler);

export const onToolStart = (
  handler: (payload: AgentEventPayload<{ ToolStart: any }>) => void,
) => onAgentEvent("agent:tool-start", handler);

export const onToolEnd = (
  handler: (payload: AgentEventPayload<{ ToolEnd: any }>) => void,
) => onAgentEvent("agent:tool-end", handler);

export const onPermissionRequest = (
  handler: (
    payload: AgentEventPayload<{ PermissionRequest: PermissionRequestRaw }>,
  ) => void,
) => onAgentEvent("agent:permission-request", handler);

export const onAskUserQuestion = (
  handler: (
    payload: AgentEventPayload<{ AskUserQuestion: AskUserQuestionRaw }>,
  ) => void,
) => onAgentEvent("agent:ask-user-question", handler);

export const onAgentDone = (
  handler: (payload: AgentEventPayload<"Done">) => void,
) => onAgentEvent("agent:done", handler);

export const onAgentError = (
  handler: (payload: AgentEventPayload<{ Error: string }>) => void,
) => onAgentEvent("agent:error", handler);

// Export all agent functions as a namespace
export const agentApi = {
  createSession,
  sendMessage,
  interrupt,
  shutdown,
  permissionRespond,
  questionRespond,
  listSessions,
  loadSession,
  resumeSession,
  deleteSession,
  restoreSession,
  purgeDeletedSessions,
  renameSession,
  setSessionSettled,
  setWorkingFolder,
  getWorkingFolder,
  switchModel,
  getModel,
  isRunning,
  listRunning,
  // Event listeners
  onAgentEvent,
  onTextDelta,
  onThinkingDelta,
  onToolStart,
  onToolEnd,
  onPermissionRequest,
  onAskUserQuestion,
  onAgentDone,
  onAgentError,
} as const;

/** A task whose message text matches a search: its best message and a snippet (UTF-16 ranges of the matched words). */
export interface MessageHit {
  task: string;
  messageId: string;
  role: "user" | "assistant";
  snippet: string;
  ranges: [number, number][];
  cutStart: boolean;
  cutEnd: boolean;
}

/** Tasks whose messages match `query` (the local message index), best first. */
export async function searchMessages(query: string): Promise<MessageHit[]> {
  return await invoke<MessageHit[]>("agent_search_messages", { query });
}

/** Restore a task from local trash without starting its agent. */
export async function restoreSession(sessionId: string): Promise<SessionInfo> {
  return await invoke<SessionInfo>("agent_restore_session", { sessionId });
}

/** Permanently empty task trash, returning the number removed. */
export async function purgeDeletedSessions(): Promise<number> {
  return await invoke<number>("agent_purge_deleted_sessions");
}
