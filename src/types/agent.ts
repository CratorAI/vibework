// Types for agent communication

export interface UsageTotals {
  inputTokens: number;
  cachedInputTokens: number | null;
  outputTokens: number;
  reasoningTokens: number | null;
  costUsd: number | null;
  calls: number;
}
export interface StepTiming {
  kind: "tool" | "thinking" | "turn";
  id: string;
  startedAt: string;
  /** The step's own run time: time spent waiting for the user is left out (see waitMs). */
  durationMs: number | null;
  /** Time the step waited for the user's approval, if it did (shown in the tooltip). */
  waitMs?: number;
  messageIndex: number;
  blockIndex: number | null;
}

export interface SessionInfo {
  costUsd?: number | null;
  sessionId: string;
  name: string;
  description: string;
  agentType: string;
  createdAt: string;
  updatedAt: string;
  conversationName: string | null;
  /** When the user settled this conversation (ISO time); null while it is active */
  settledAt: string | null;
  /** The folder the user chose for the task; null when it works in the default location */
  workingFolder?: string | null;
}

export interface MessageInfo {
  timings?: StepTiming[];
  role: string;
  content: unknown;
  /** Quiet timeline lines shown above a user message ("Connector added: …") */
  notes?: string[];
  /** Assistant messages: how an unfinished turn ended */
  end?: TurnEnd;
  /** The engine's message id(s) this entry shows (search scrolls to them) */
  sourceIds?: string[];
}

/** A turn that did not finish: cut by Stop, or the engine died or restarted (with the reason). */
export type TurnEnd = { kind: "stopped" } | { kind: "failed"; text: string };

// Output chunk types from the agent
export type OutputChunkData =
  | { UserMessage: { id: string; text: string } }
  | { Timing: StepTiming }
  | { Usage: UsageTotals }
  | { TextDelta: string }
  | { TextComplete: string }
  | { ThinkingDelta: string }
  | { ThinkingComplete: string }
  | { ToolStart: { id: string; name: string; input: unknown } }
  | { Helper: HelperEvent }
  | { ToolProgress: { id: string; output: string } }
  | { ToolEnd: { id: string; result: ToolResultRaw } }
  | {
      PermissionRequest: {
        /** Opaque ID of this request; a reply names the request it answers */
        request_id: string;
        tool_name: string;
        action: string;
        input: string;
        details: string | null;
        position?: number;
        total?: number;
        reason?: string | null;
        helper?: string;
      };
    }
  | { AskUserQuestion: AskUserQuestionRaw }
  | { StateChange: AgentState }
  | { Error: string }
  | "Done";

// ToolResult as received from Rust backend
// Rust sends: { content: ToolResultData, is_error: boolean }
// where ToolResultData is: { Text: string } | { Image: {...} } | { Document: {...} }
export interface ToolResultRaw {
  content:
    | { Text: string }
    | { Image: { data: number[]; media_type: string } }
    | { Document: { data: number[]; media_type: string; description: string } };
  is_error: boolean;
}

// Simplified ToolResult for frontend use
export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}

export type AgentState =
  | "Idle"
  | "Processing"
  | "WaitingForPermission"
  | { ExecutingTool: { tool_name: string; tool_use_id: string } }
  | "Done"
  | { Error: { message: string } };

// Event payload structure
export interface AgentEventPayload {
  sessionId: string;
  data: OutputChunkData;
}

// Block types for message content
export type MessageBlock = ThinkingBlock | TextBlock | ToolBlock;

export interface ThinkingBlock {
  timing?: StepTiming;
  type: "thinking";
  id: string;
  content: string;
  isComplete: boolean;
}

export interface TextBlock {
  type: "text";
  id: string;
  content: string;
  isComplete: boolean;
}

export interface ToolBlock {
  timing?: StepTiming;
  type: "tool";
  id: string;
  call: ToolCall;
}

// Message for display (block-based model)
export interface ChatMessage {
  timings?: StepTiming[];
  turnTiming?: StepTiming;
  id: string;
  role: "user" | "assistant";
  blocks: MessageBlock[];
  timestamp: Date;
  isStreaming: boolean;
  /**
   * Stream buffer only: this message's turn has finished (Done arrived) and
   * it stays on screen until the history reload that replaces it lands.
   */
  settled?: boolean;
  /**
   * Optimistic user messages only: how many user messages precede this one in
   * the conversation, i.e. its position among user messages once it is in the
   * history on disk.
   */
  userOrdinal?: number;
  /** User messages: quiet timeline lines shown above it ("Connector added: …") */
  notes?: string[];
  /** Assistant messages: the turn did not finish (shown inline after the reply) */
  end?: TurnEnd;
  /** History only: the engine's message ids shown here (search scrolls to them) */
  sourceIds?: string[];
}

export interface HelperState {
  steps: ToolBlock[];
  text: string;
  status?: "done" | "stopped" | "failed";
  error?: string;
}
export interface HelperEvent {
  toolId: string;
  kind: "step" | "step-end" | "step-started" | "text" | "end" | "retry";
  id?: string; name?: string; input?: unknown; startedAt?: string;
  result?: ToolResultRaw; durationMs?: number; waitMs?: number;
  delta?: string; status?: HelperState["status"]; error?: string;
}

export interface ToolCall {
  helper?: HelperState;
  id: string;
  name: string;
  input: unknown;
  result?: ToolResult;
  isExecuting: boolean;
}

// PermissionRequest as received from Rust (snake_case)
export interface PermissionRequestRaw {
  /** Opaque ID of this request; a reply names the request it answers */
  request_id: string;
  tool_name: string;
  action: string;
  input: string;
  details: string | null;
  /** Place in the current run of requests ("2 of 3"); absent when only one */
  position?: number;
  total?: number;
  /** Why the policy asks, when it says */
  reason?: string | null;
  helper?: string;
}

// PermissionRequest for frontend use (camelCase)
export interface PermissionRequest {
  /** Opaque ID of this request, passed back with the reply */
  requestId: string;
  toolName: string;
  action: string;
  input: string;
  details: string | null;
  position?: number;
  total?: number;
  reason?: string | null;
  helper?: string;
}

export function toPermissionRequest(req: PermissionRequestRaw): PermissionRequest {
  return {
    requestId: req.request_id,
    toolName: req.tool_name,
    action: req.action,
    input: req.input,
    details: req.details,
    position: req.position,
    total: req.total,
    reason: req.reason ?? null,
    helper: req.helper,
  };
}

// AskUserQuestion types
export interface QuestionOption {
  label: string;
  description?: string;
}

export interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

// AskUserQuestion as received from Rust (snake_case)
export interface AskUserQuestionRaw {
  request_id: string;
  questions: Question[];
}

// AskUserQuestion for frontend use
export interface AskUserQuestionRequest {
  requestId: string;
  questions: Question[];
}

// Todo types for progress tracking
export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm: string;
}
