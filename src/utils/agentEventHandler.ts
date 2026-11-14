/**
 * Utility for handling streaming OutputChunk events and updating the stream buffer
 *
 * This function accumulates the current turn's output in the stream buffer using
 * a block-based model. Each phase (thinking, text, tool) is stored as a separate
 * block to preserve chronological order.
 *
 * Event sequence in an agentic loop:
 *   ThinkingDelta* → ThinkingComplete → TextDelta* → TextComplete → ToolStart → ToolEnd → (repeat)
 *
 * This handler does NOT handle Done or StateChange events - those are managed at the hook level.
 */

import type {
  OutputChunkData,
  ChatMessage,
  MessageBlock,
  ThinkingBlock,
  TextBlock,
  ToolBlock,
  ToolResultRaw,
  ToolResult,
} from "../types/agent";

/**
 * Convert raw Rust ToolResult to frontend ToolResult format
 */
function convertToolResult(raw: ToolResultRaw): ToolResult {
  let output: string | undefined;

  if ("Text" in raw.content) {
    output = raw.content.Text;
  } else if ("Image" in raw.content) {
    output = `[Image: ${raw.content.Image.media_type}]`;
  } else if ("Document" in raw.content) {
    output = `[Document: ${raw.content.Document.description}]`;
  }

  return {
    success: !raw.is_error,
    output: raw.is_error ? undefined : output,
    error: raw.is_error ? output : undefined,
  };
}

/**
 * Strips internal system tags from text content
 * Tags like <vibe-working-agent-system>...</vibe-working-agent-system> should not be shown in UI
 */
export function stripSystemTags(text: string): string {
  return text
    .replace(
      /<vibe-working-agent-[^>]*>[\s\S]*?<\/vibe-working-agent-[^>]*>/g,
      "",
    )
    .trim();
}

/**
 * Generate a unique block ID
 */
function generateBlockId(type: string): string {
  return `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}


/**
 * Get the last block of a specific type that is not complete
 */
function getLastIncompleteBlock<T extends MessageBlock>(
  blocks: MessageBlock[],
  type: T["type"],
): T | null {
  const last = blocks[blocks.length - 1];
  if (last?.type === type && "isComplete" in last && !last.isComplete) {
    return last as T;
  }
  return null;
}

/**
 * The assistant message the current turn is writing into: the last message,
 * when it is an assistant message that has not settled. A settled message
 * belongs to a finished turn waiting for its history reload and must never
 * receive more output (the reload would drop that output with it).
 */
function liveAssistantIndex(buffer: ChatMessage[]): number {
  const last = buffer[buffer.length - 1];
  return last?.role === "assistant" && !last.settled ? buffer.length - 1 : -1;
}

/**
 * Applies `update` to the live assistant message, creating one first when
 * `create` is set and there is none. Returns `buffer` itself when nothing
 * changed, so no-op chunks cost no render.
 */
function updateLiveAssistant(
  buffer: ChatMessage[],
  update: (msg: ChatMessage) => ChatMessage,
  create: boolean,
): ChatMessage[] {
  const index = liveAssistantIndex(buffer);
  if (index === -1) {
    if (!create) return buffer;
    const fresh: ChatMessage = {
      id: generateBlockId("stream"),
      role: "assistant",
      blocks: [],
      timestamp: new Date(),
      isStreaming: true,
    };
    return [...buffer, update(fresh)];
  }
  const msg = buffer[index];
  const next = update(msg);
  if (next === msg) return buffer;
  return [...buffer.slice(0, index), next];
}

/** Replace the last block of `msg` (which the caller has checked exists). */
function replaceLastBlock(msg: ChatMessage, block: MessageBlock): ChatMessage {
  return { ...msg, blocks: [...msg.blocks.slice(0, -1), block] };
}

/**
 * Index of the running tool block a ToolProgress/ToolEnd refers to.
 *
 * Tool events carry the call's id. Should two calls ever share an id, the
 * target is the earliest call with that id that is still executing.
 */
function findRunningTool(blocks: MessageBlock[], callId: string): number {
  return blocks.findIndex(
    (b) => b.type === "tool" && b.call.id === callId && b.call.isExecuting,
  );
}

/**
 * A block id for a new tool call that is unique within the message, since
 * the stream's tool ids are not (see findRunningTool).
 */
function uniqueToolBlockId(blocks: MessageBlock[], callId: string): string {
  const taken = new Set(blocks.map((b) => b.id));
  if (!taken.has(callId)) return callId;
  let n = 2;
  while (taken.has(`${callId}#${n}`)) n++;
  return `${callId}#${n}`;
}

/**
 * Applies one streaming OutputChunk to the stream buffer. Pure: returns the
 * next buffer, or `prev` itself when the chunk does not change it, so a batch
 * of chunks folds into a single state update.
 *
 * Blocks and messages a chunk does not touch keep their object identity,
 * which lets memoized views of finished blocks skip rendering while the last
 * block grows.
 */
function applyStreamChunkCore(
  prev: ChatMessage[],
  chunk: OutputChunkData,
): ChatMessage[] {
  if (chunk === "Done") return prev;

  // ThinkingDelta - Append to current thinking block or create new one
  if ("ThinkingDelta" in chunk) {
    if (!chunk.ThinkingDelta) return prev;
    return updateLiveAssistant(
      prev,
      (msg) => {
        const lastThinking = getLastIncompleteBlock<ThinkingBlock>(
          msg.blocks,
          "thinking",
        );
        if (lastThinking) {
          return replaceLastBlock(
            { ...msg, isStreaming: true },
            {
              ...lastThinking,
              content: lastThinking.content + chunk.ThinkingDelta,
            },
          );
        }
        const newBlock: ThinkingBlock = {
          type: "thinking",
          id: generateBlockId("thinking"),
          content: chunk.ThinkingDelta,
          isComplete: false,
        };
        return { ...msg, isStreaming: true, blocks: [...msg.blocks, newBlock] };
      },
      true,
    );
  }

  // ThinkingComplete - Mark current thinking block as complete
  if ("ThinkingComplete" in chunk) {
    return updateLiveAssistant(
      prev,
      (msg) => {
        const lastThinking = getLastIncompleteBlock<ThinkingBlock>(
          msg.blocks,
          "thinking",
        );
        return lastThinking
          ? replaceLastBlock(msg, { ...lastThinking, isComplete: true })
          : msg;
      },
      false,
    );
  }

  // TextDelta - Append to current text block or create new one
  if ("TextDelta" in chunk) {
    if (!chunk.TextDelta) return prev;
    return updateLiveAssistant(
      prev,
      (msg) => {
        const lastText = getLastIncompleteBlock<TextBlock>(msg.blocks, "text");
        if (lastText) {
          return replaceLastBlock(
            { ...msg, isStreaming: true },
            { ...lastText, content: lastText.content + chunk.TextDelta },
          );
        }
        const newBlock: TextBlock = {
          type: "text",
          id: generateBlockId("text"),
          content: chunk.TextDelta,
          isComplete: false,
        };
        return { ...msg, isStreaming: true, blocks: [...msg.blocks, newBlock] };
      },
      true,
    );
  }

  // TextComplete - Mark current text block as complete
  if ("TextComplete" in chunk) {
    return updateLiveAssistant(
      prev,
      (msg) => {
        const lastText = getLastIncompleteBlock<TextBlock>(msg.blocks, "text");
        return lastText
          ? replaceLastBlock(msg, { ...lastText, isComplete: true })
          : msg;
      },
      false,
    );
  }

  // ToolStart - Create a new tool block
  if ("ToolStart" in chunk) {
    const { id, name, input } = chunk.ToolStart;
    return updateLiveAssistant(
      prev,
      (msg) => {
        const newBlock: ToolBlock = {
          type: "tool",
          // call.id keeps the stream's id for matching ToolProgress/ToolEnd;
          // the block id must be unique within the message.
          id: uniqueToolBlockId(msg.blocks, id),
          call: { id, name, input, isExecuting: true },
        };
        return { ...msg, isStreaming: true, blocks: [...msg.blocks, newBlock] };
      },
      true,
    );
  }

  if ("Helper" in chunk) {
    const event = chunk.Helper;
    return updateLiveAssistant(prev, (msg) => {
      const index = findRunningTool(msg.blocks, event.toolId);
      if (index < 0) return msg;
      const block = msg.blocks[index] as ToolBlock;
      const helper = { steps: [], text: "", ...block.call.helper };
      if (event.kind === "step" && event.id && !helper.steps.some(s => s.id === event.id)) {
        helper.steps = [...helper.steps, { type: "tool", id: event.id,
          call: { id: event.id, name: event.name ?? "Tool", input: event.input, isExecuting: true },
          timing: { kind: "tool", id: event.id, startedAt: event.startedAt ?? "", durationMs: null, messageIndex: 0, blockIndex: null } }];
      } else if (event.kind === "step-end") {
        helper.steps = helper.steps.map(s => s.id !== event.id ? s : { ...s,
          call: { ...s.call, isExecuting: false, result: event.result ? convertToolResult(event.result) : undefined },
          timing: s.timing ? { ...s.timing, durationMs: event.durationMs ?? null, waitMs: event.waitMs } : undefined });
      } else if (event.kind === "text") helper.text += event.delta ?? "";
      else if (event.kind === "step-started") helper.text = "";
      else if (event.kind === "end") { helper.status = event.status; helper.error = event.error; }
      const blocks = msg.blocks.slice();
      blocks[index] = { ...block, call: { ...block.call, helper } };
      return { ...msg, blocks };
    }, false);
  }

  // ToolProgress - Accumulate progress output on the running tool
  if ("ToolProgress" in chunk) {
    const { id, output } = chunk.ToolProgress;
    if (!output) return prev;
    return updateLiveAssistant(
      prev,
      (msg) => {
        const index = findRunningTool(msg.blocks, id);
        if (index === -1) return msg;
        const block = msg.blocks[index] as ToolBlock;
        const blocks = msg.blocks.slice();
        blocks[index] = {
          ...block,
          call: {
            ...block.call,
            result: {
              success: true,
              output: (block.call.result?.output || "") + output,
            },
          },
        };
        return { ...msg, blocks };
      },
      false,
    );
  }

  // ToolEnd - Update tool block with final result
  if ("ToolEnd" in chunk) {
    const { id, result: rawResult } = chunk.ToolEnd;
    return updateLiveAssistant(
      prev,
      (msg) => {
        const index = findRunningTool(msg.blocks, id);
        if (index === -1) return msg;
        const block = msg.blocks[index] as ToolBlock;
        const blocks = msg.blocks.slice();
        blocks[index] = {
          ...block,
          call: {
            ...block.call,
            result: convertToolResult(rawResult),
            isExecuting: false,
          },
        };
        return { ...msg, blocks };
      },
      false,
    );
  }

  // Error - Add error as a text block
  if ("Error" in chunk) {
    return updateLiveAssistant(
      prev,
      (msg) => {
        const errorBlock: TextBlock = {
          type: "text",
          id: generateBlockId("error"),
          content: `Error: ${chunk.Error}`,
          isComplete: true,
        };
        return {
          ...msg,
          isStreaming: false,
          blocks: [...msg.blocks, errorBlock],
        };
      },
      true,
    );
  }

  // PermissionRequest, AskUserQuestion and the rest are handled at the
  // hook level (they need UI beyond the message buffer).
  return prev;
}

/**
 * Handles streaming OutputChunks and updates the stream buffer
 *
 * @param chunk - The OutputChunk event data
 * @param setStreamBuffer - React state setter for the stream buffer
 */
export function handleStreamChunk(
  chunk: OutputChunkData,
  setStreamBuffer: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
): void {
  if (chunk === "Done") return;
  setStreamBuffer((prev) => applyStreamChunk(prev, chunk));
}

/** Keep timing events even when they arrive before their stream block.
 * Per-kind order bridges live IDs to the IDs history uses. */
export function applyStreamChunk(prev: ChatMessage[], chunk: OutputChunkData): ChatMessage[] {
  if (chunk !== 'Done' && 'UserMessage' in chunk) {
    if (prev.some(m => m.id === chunk.UserMessage.id)) return prev;
    return [...prev.map(m => m.isStreaming ? { ...m, isStreaming: false, blocks: m.blocks.map(b => b.type === 'text' || b.type === 'thinking' ? { ...b, isComplete: true } : b) } : m), { id: chunk.UserMessage.id, role: 'user', timestamp: new Date(), isStreaming: false, blocks: [{ type: 'text', id: chunk.UserMessage.id + '-text', content: chunk.UserMessage.text, isComplete: true }] }];
  }
  const toolId = chunk !== 'Done' && ('ToolEnd' in chunk ? chunk.ToolEnd.id : 'ToolProgress' in chunk ? chunk.ToolProgress.id : null);
  if (toolId) {
    const index = prev.findIndex(m => m.role === 'assistant' && m.blocks.some(b => b.type === 'tool' && b.call.id === toolId && b.call.isExecuting));
    if (index >= 0 && index < prev.length - 1) { const updated = applyStreamChunk([prev[index]], chunk); return prev.map((m, i) => i === index ? updated[0] : m); }
  }
  let next = applyStreamChunkCore(prev, chunk);
  if (chunk !== "Done" && "Timing" in chunk) {
    next = updateLiveAssistant(next, msg => ({ ...msg, timings: [
      ...(msg.timings ?? []).filter(t => t.kind !== chunk.Timing.kind || t.id !== chunk.Timing.id), chunk.Timing,
    ] }), true);
  }
  const msg = next[next.length - 1];
  if (!msg || msg.role !== "assistant" || !msg.timings) return next;
  const ordered = [...msg.timings].sort((a, b) => a.messageIndex - b.messageIndex || (a.blockIndex ?? -1) - (b.blockIndex ?? -1));
  const tools = ordered.filter(t => t.kind === "tool");
  const thinking = ordered.filter(t => t.kind === "thinking");
  let ti = 0, hi = 0;
  let changed = false;
  const blocks = msg.blocks.map(b => {
    const timing = b.type === "tool" ? tools[ti++] : b.type === "thinking" ? thinking[hi++] : undefined;
    if (!timing || b.type === "text" || b.timing === timing) return b;
    changed = true;
    return { ...b, timing };
  });
  const turnTiming = ordered.find(t => t.kind === "turn");
  return changed || turnTiming !== msg.turnTiming
    ? [...next.slice(0, -1), { ...msg, blocks, turnTiming }] : next;
}
