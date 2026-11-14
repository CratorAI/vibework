/**
 * Utility for converting agent history from Rust MessageInfo to ChatMessage
 *
 * This converter transforms the Anthropic Messages API format into our block-based
 * ChatMessage format, preserving the chronological order of content blocks.
 */

import type {
  MessageInfo,
  ChatMessage,
  MessageBlock,
  ThinkingBlock as MsgThinkingBlock,
  TextBlock as MsgTextBlock,
  ToolBlock as MsgToolBlock,
  ToolCall,
  ToolResult,
} from "../types/agent";
import { stripSystemTags } from "./agentEventHandler";

/**
 * Content block types from the Anthropic Messages API
 */
interface ApiTextBlock {
  type: "text";
  text: string;
}

interface ApiThinkingBlock {
  type: "thinking";
  thinking: string;
}

interface ApiToolUseBlock {
  helper?: import("../types/agent").HelperState;
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

interface ApiToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | unknown[];
  is_error?: boolean;
}

type ApiContentBlock =
  | ApiTextBlock
  | ApiThinkingBlock
  | ApiToolUseBlock
  | ApiToolResultBlock;

/**
 * Generate a unique block ID
 */
function generateBlockId(type: string, index: number): string {
  return `history-${type}-${index}`;
}

/**
 * Extracts tool results from user message content blocks
 * Tool results appear in user messages following assistant tool use
 */
function extractToolResults(content: unknown): Map<string, ToolResult> {
  const resultsMap = new Map<string, ToolResult>();

  if (!Array.isArray(content)) {
    return resultsMap;
  }

  const toolResultBlocks = content.filter(
    (block): block is ApiToolResultBlock =>
      typeof block === "object" &&
      block !== null &&
      "type" in block &&
      block.type === "tool_result",
  );

  for (const block of toolResultBlocks) {
    const contentStr =
      typeof block.content === "string"
        ? block.content
        : JSON.stringify(block.content);

    resultsMap.set(block.tool_use_id, {
      success: !block.is_error,
      output: block.is_error ? undefined : contentStr,
      error: block.is_error ? contentStr : undefined,
    });
  }

  return resultsMap;
}

/**
 * Check if content has only tool results (no text)
 */
function hasOnlyToolResults(content: unknown): boolean {
  if (!Array.isArray(content)) {
    return false;
  }

  return content.every(
    (block) =>
      typeof block === "object" &&
      block !== null &&
      "type" in block &&
      block.type === "tool_result",
  );
}

/**
 * Convert content blocks to our MessageBlock format, preserving order
 */
function convertContentToBlocks(
  content: unknown,
  toolResultsMap: Map<string, ToolResult>,
  messageIndex: number,
  timings: MessageInfo["timings"],
): MessageBlock[] {
  // Handle simple string content (user messages)
  if (typeof content === "string") {
    const cleanedContent = stripSystemTags(content);
    if (!cleanedContent.trim()) {
      return [];
    }
    return [
      {
        type: "text",
        id: generateBlockId("text", messageIndex),
        content: cleanedContent,
        isComplete: true,
      },
    ];
  }

  if (!Array.isArray(content)) {
    return [];
  }

  const blocks: MessageBlock[] = [];
  let blockIndex = 0;

  for (const [sourceIndex, apiBlock] of content.entries()) {
    if (
      typeof apiBlock !== "object" ||
      apiBlock === null ||
      !("type" in apiBlock)
    ) {
      continue;
    }

    const block = apiBlock as ApiContentBlock;

    switch (block.type) {
      case "thinking": {
        const thinkingBlock: MsgThinkingBlock = {
          type: "thinking",
          timing: timings?.find(t => t.kind === "thinking" && t.blockIndex === sourceIndex),
          id: generateBlockId("thinking", messageIndex * 1000 + blockIndex),
          content: block.thinking,
          isComplete: true,
        };
        blocks.push(thinkingBlock);
        blockIndex++;
        break;
      }

      case "text": {
        const cleanedText = stripSystemTags(block.text);
        if (cleanedText.trim()) {
          const textBlock: MsgTextBlock = {
            type: "text",
            id: generateBlockId("text", messageIndex * 1000 + blockIndex),
            content: cleanedText,
            isComplete: true,
          };
          blocks.push(textBlock);
          blockIndex++;
        }
        break;
      }

      case "tool_use": {
        const toolCall: ToolCall = {
          id: block.id,
          name: block.name,
          input: block.input,
          helper: block.helper,
          result: toolResultsMap.get(block.id),
          isExecuting: false,
        };
        const toolBlock: MsgToolBlock = {
          type: "tool",
          timing: timings?.find(t => t.kind === "tool" && (t.id === block.id || t.blockIndex === sourceIndex)),
          id: block.id, // Use tool's ID for consistency
          call: toolCall,
        };
        blocks.push(toolBlock);
        blockIndex++;
        break;
      }

      case "tool_result":
        // Tool results are handled separately and attached to their tool_use blocks
        break;
    }
  }

  return blocks;
}

/**
 * Converts MessageInfo from Rust to ChatMessage for UI display
 * @param history - Array of MessageInfo from backend
 * @returns Array of ChatMessage for frontend
 */
export function convertHistoryToMessages(
  history: MessageInfo[],
): ChatMessage[] {
  // Debug: log history structure
  console.log("[convertHistoryToMessages] History structure:",
    history.map(m => ({ role: m.role, contentType: Array.isArray(m.content) ? 'array' : typeof m.content }))
  );

  const messages: ChatMessage[] = [];

  // First pass: extract all tool results from user messages
  const toolResultsMap = new Map<string, ToolResult>();
  for (const msg of history) {
    if (msg.role === "user") {
      const results = extractToolResults(msg.content);
      results.forEach((result, toolUseId) => {
        toolResultsMap.set(toolUseId, result);
      });
    }
  }

  // Second pass: build chat messages with blocks
  for (let i = 0; i < history.length; i++) {
    const msg = history[i];

    // Skip user messages that only contain tool results
    if (msg.role === "user" && hasOnlyToolResults(msg.content)) {
      continue;
    }

    const blocks = convertContentToBlocks(msg.content, toolResultsMap, i, msg.timings);

    // Skip messages with no displayable blocks
    if (blocks.length === 0 && msg.role === "user") {
      // For user messages, create a text block if there's string content
      const textContent = typeof msg.content === "string" ? msg.content : "";
      if (!textContent.trim()) {
        continue;
      }
    }

    // Merge consecutive assistant messages into one
    const lastMessage = messages[messages.length - 1];
    if (
      msg.role === "assistant" &&
      lastMessage &&
      lastMessage.role === "assistant"
    ) {
      // Append blocks to the existing assistant message
      lastMessage.blocks.push(...blocks);
      if (msg.end) lastMessage.end = msg.end;
      if (msg.sourceIds?.length) lastMessage.sourceIds = [...(lastMessage.sourceIds ?? []), ...msg.sourceIds];
    } else {
      messages.push({
        id: `history-${i}`,
        role: msg.role as "user" | "assistant",
        blocks,
        timestamp: new Date(),
        isStreaming: false,
        ...(msg.role === "user" && msg.notes?.length ? { notes: msg.notes } : {}),
        ...(msg.role === "assistant" && msg.end ? { end: msg.end } : {}),
        ...(msg.sourceIds?.length ? { sourceIds: [...msg.sourceIds] } : {}),
      });
    }
  }

  // Debug: log resulting messages
  console.log("[convertHistoryToMessages] Result:",
    messages.map(m => ({ id: m.id, role: m.role, blockCount: m.blocks.length }))
  );

  // Turn records live on the initiating user message, displayed after its reply.
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (message.role !== "user") continue;
    const source = history[Number(message.id.slice(8))];
    const timing = source?.timings?.find(t => t.kind === "turn");
    if (timing && messages[i + 1]?.role === "assistant") messages[i + 1].turnTiming = timing;
  }
  return messages;
}
