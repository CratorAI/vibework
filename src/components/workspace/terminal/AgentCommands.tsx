/**
 * The Agent commands tab: the commands the agent ran in this
 * task and what they printed, read from the task's history (the same tool
 * events the conversation shows). Read-only; it never touches a shell.
 */

import { useEffect, useMemo, useRef } from "react";
import { useAgentSessionsContext } from "@/contexts/AgentSessionsContext";
import type { ChatMessage } from "@/types/agent";

const MAX_LINES = 160;
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g;

export interface AgentCommand {
  id: string;
  command: string;
  output: string;
  running: boolean;
  failed: boolean;
}

/** Every shell command in the history, oldest first. */
export function agentCommands(messages: ChatMessage[]): AgentCommand[] {
  const out: AgentCommand[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const block of message.blocks) {
      if (block.type !== "tool" || block.call.name !== "Bash") continue;
      const input = block.call.input as { command?: unknown } | null;
      const command = typeof input?.command === "string" ? input.command : "";
      if (!command) continue;
      const result = block.call.result;
      out.push({
        id: block.call.id,
        command,
        output: (result?.output ?? result?.error ?? "").replace(ANSI, "").replace(/\s+$/, ""),
        running: block.call.isExecuting,
        failed: result?.success === false,
      });
    }
  }
  return out;
}

function clip(output: string): { text: string; hidden: number } {
  const lines = output.split("\n");
  if (lines.length <= MAX_LINES) return { text: output, hidden: 0 };
  return { text: lines.slice(0, MAX_LINES).join("\n"), hidden: lines.length - MAX_LINES };
}

export function AgentCommands({ sessionId }: { sessionId: string }) {
  const { getSession } = useAgentSessionsContext();
  const messages = getSession(sessionId)?.state.messages;
  const commands = useMemo(() => agentCommands(messages ?? []), [messages]);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);

  // Follow new commands while the reader is at the bottom.
  useEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [commands]);

  if (commands.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="text-sm text-muted-foreground">Commands the agent runs in this task show here, with what they printed.</p>
      </div>
    );
  }

  return (
    <div
      ref={scroller}
      data-testid="agent-commands"
      onScroll={(e) => {
        const el = e.currentTarget;
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
      className="h-full overflow-y-auto bg-background py-2 pr-3 pl-3 font-mono text-[13px] leading-[1.45] select-text"
    >
      {commands.map((c) => {
        const { text, hidden } = clip(c.output);
        return (
          <div key={c.id} className="mb-3">
            <div className="flex items-baseline gap-2">
              <span className="shrink-0 text-muted-foreground">$</span>
              <span className="min-w-0 flex-1 break-words whitespace-pre-wrap text-foreground">{c.command}</span>
              {c.running ? (
                <span className="shrink-0 font-sans text-meta text-muted-foreground">Running…</span>
              ) : c.failed ? (
                <span className="shrink-0 font-sans text-meta text-destructive">Failed</span>
              ) : null}
            </div>
            {text && <pre className="m-0 mt-0.5 break-words whitespace-pre-wrap text-muted-foreground">{text}</pre>}
            {hidden > 0 && <div className="mt-0.5 font-sans text-meta text-muted-foreground">{hidden} more lines</div>}
          </div>
        );
      })}
    </div>
  );
}
