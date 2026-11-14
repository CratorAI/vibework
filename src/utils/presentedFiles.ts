import type { ChatMessage } from "@/types/agent";

/**
 * The file the latest turn presented last (its finished PresentFile call
 * after the last user message), or null.
 */
export function latestPresentedFile(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === "user") return null;
    for (let j = message.blocks.length - 1; j >= 0; j--) {
      const block = message.blocks[j];
      if (block.type !== "tool" || block.call.name !== "PresentFile") continue;
      if (block.call.isExecuting || block.call.result?.success === false) continue;
      const path = (block.call.input as Record<string, unknown> | undefined)?.file_path;
      if (typeof path === "string" && path) return path;
    }
  }
  return null;
}
