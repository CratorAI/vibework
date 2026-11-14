/**
 * ToolItem Component
 *
 * One tool call on the activity timeline. A
 * running call is signalled in the row itself, with a shimmering label, not a
 * separate "Executing..." line that would appear and vanish under it. Clicking
 * the row shows the input and output cards; while the call is still running
 * an open card is soft and settles crisp when the result lands.
 */

import { Duration } from "./Duration";
import React, { useState, useSyncExternalStore, type ReactNode } from "react";
import { ToolBlock } from "@/types/agent";
import { getToolIcon } from "./toolIcons";
import { getMcpToolInfo, getToolDescription, toolInputRecord } from "@/utils/toolDisplayUtils";
import { mcpServersStore } from "@/stores/mcpServers";
import { connectorLabel } from "@/components/settings/popularConnectors";
import { cn } from "@/lib/utils";
import { Code, PanelRight, TriangleAlert } from "@/lib/icons";
import { useWorkspaceActions } from "@/components/workspace/WorkspaceContext";

/** Tools that write a file the workspace panel may be able to show */
const FILE_WRITING_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

const OUTPUT_MAX = 4000;

/** What the input card shows: a label, the content's kind, and the raw content. */
function getInputSection(
  name: string,
  input: Record<string, unknown>,
): { label: string; language: "bash" | "json"; content: string } | null {
  if (name === "Bash") {
    const command = typeof input.command === "string" ? input.command : "";
    return command ? { label: "Command", language: "bash", content: command } : null;
  }
  if (Object.keys(input).length === 0) return null;
  return { label: "Input", language: "json", content: JSON.stringify(input, null, 2) };
}

/**
 * First line of an error, short enough to sit under the row. The engine's
 * wrapper around a connector's own message ("MCP tool "x" on server "y"
 * failed: …") is dropped, so "linear needs you to sign in again…" reads plainly.
 */
export function errorSummary(text: string, toolName?: string): string {
  // A connector whose sign-in lapsed fails with the engine's "Connection
  // closed" (or is gone on a later call): say what to do instead.
  const server = toolName ? getMcpToolInfo(toolName)?.server : undefined;
  if (server && /connection closed|needs authentication|requires a login|unauthori[sz]ed|\b401\b|no tool named/i.test(text)) {
    const status = mcpServersStore.getSnapshot().servers.find((s) => s.name === server)?.status;
    if (status === "needs-sign-in") return `${connectorLabel(server)} needs you to sign in again in Settings → Connectors.`;
  }
  const line =
    text
      .replace(/^(error:\s*)+/i, "")
      .replace(/^MCP tool "[^"]*" on server "[^"]*" failed:\s*/, "")
      .split("\n")
      .find((l) => l.trim()) ?? "";
  return line.length > 140 ? `${line.slice(0, 139)}…` : line;
}

/** The failed step's one-line reason; a connector step follows the connector's status. */
function ErrorLine({ output, toolName }: { output: string; toolName: string }) {
  return getMcpToolInfo(toolName) ? (
    <ConnectorErrorLine output={output} toolName={toolName} />
  ) : (
    <p className="mt-0.5 line-clamp-2 text-meta text-muted-foreground select-text">{errorSummary(output)}</p>
  );
}

function ConnectorErrorLine({ output, toolName }: { output: string; toolName: string }) {
  // Subscribing loads the connector list (and keeps it current) while shown.
  useSyncExternalStore(mcpServersStore.subscribe, mcpServersStore.getSnapshot);
  return <p className="mt-0.5 line-clamp-2 text-meta text-muted-foreground select-text">{errorSummary(output, toolName)}</p>;
}

/**
 * Light JSON accenting for the input card: keys in info, string values in
 * success. Regex over stringified JSON; a parser would be overkill for a
 * read-only display.
 */
function highlightJson(json: string): ReactNode[] {
  const tokens = json.split(/("(?:[^"\\]|\\.)*"(?:\s*:)?)/g);
  return tokens.map((token, i) => {
    if (!token.startsWith('"')) return token;
    return (
      <span key={i} className={token.endsWith(":") ? "text-info" : "text-success"}>
        {token}
      </span>
    );
  });
}

function CodeCard({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-background px-3 py-2.5">
      <div className="text-xs font-medium leading-4 text-muted-foreground">{label}</div>
      <div
        className={cn(
          "max-h-72 overflow-y-auto whitespace-pre-wrap break-all font-mono text-xs leading-5 text-foreground select-text",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

interface ToolItemProps {
  block: ToolBlock;
  /** The turn is live. A call still marked executing after the turn stopped
   * (interrupted, or waiting on a prompt) is not shown as running. */
  isLive?: boolean;
}

export const ToolItem: React.FC<ToolItemProps> = React.memo(({ block, isLive = false }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const tool = block.call;
  const input = toolInputRecord(tool.input);
  const isExecuting = isLive && tool.isExecuting;
  const failed = Boolean(tool.result && !tool.result.success);
  const description = getToolDescription(
    tool.name,
    tool.input,
    isExecuting ? "running" : failed ? "failed" : "done",
  );
  const output = tool.result
    ? tool.result.success
      ? tool.result.output
      : tool.result.error ?? tool.result.output
    : undefined;
  const hasError = Boolean(tool.result && !tool.result.success);
  const inputSection = getInputSection(tool.name, input);
  const canExpand = Boolean(inputSection) || Boolean(output);

  // "Open in panel" for a file the agent wrote, once the write has landed
  const workspace = useWorkspaceActions();
  const writtenPath =
    FILE_WRITING_TOOLS.has(tool.name) && typeof input.file_path === "string" ? input.file_path : "";
  const canOpenInPanel =
    !!workspace && !!writtenPath && !isExecuting && !hasError && workspace.canPreview(writtenPath);

  return (
    <div className="relative pl-6">
      {/* h-5 centres the icon on the label's first line; the opaque
          background masks the timeline rail behind it. */}
      <div
        className={cn(
          "absolute left-0 top-0 flex h-5 w-4 items-center justify-center bg-background",
          hasError ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {hasError ? <TriangleAlert className="size-4 shrink-0" /> : getToolIcon(tool.name, tool.input)}
      </div>

      <div className="group/tool flex min-h-5 items-center gap-1.5">
        <button
          type="button"
          onClick={() => canExpand && setIsExpanded((open) => !open)}
          aria-expanded={canExpand ? isExpanded : undefined}
          title={description}
          className={cn(
            "flex min-w-0 items-center text-left text-sm leading-5 transition-colors outline-none focus-visible:underline",
            hasError ? "text-destructive" : "text-muted-foreground",
            canExpand ? "hover:text-foreground" : "cursor-default",
          )}
        >
          <span className={cn("line-clamp-1", isExecuting && "text-shimmer")}>{description}</span>
        </button>
        {/* Beside the label, so the duration keeps the trailing edge like every other step */}
        {canOpenInPanel && (
          <button
            type="button"
            onClick={() => workspace.openArtifact(writtenPath)}
            title="Open in panel"
            aria-label="Open in panel"
            className="flex h-5 shrink-0 items-center gap-1 rounded px-1 text-meta text-muted-foreground opacity-0 transition-[opacity,color,background-color] group-hover/tool:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
          >
            <PanelRight className="size-3.5" />
            Open in panel
          </button>
        )}
        <Duration timings={[block.timing]} live={isExecuting} className="ml-auto" />
        {/* Quiet details affordance: on hover or focus, always on a failure */}
        {canExpand && (
          <button
            type="button"
            onClick={() => setIsExpanded((open) => !open)}
            aria-label={isExpanded ? "Hide details" : "Show details"}
            aria-expanded={isExpanded}
            title={isExpanded ? "Hide details" : "Show details"}
            className={cn(
              "grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition-[opacity,color,background-color] hover:bg-muted hover:text-foreground focus-visible:opacity-100",
              hasError || isExpanded ? "opacity-100" : "opacity-0 group-hover/tool:opacity-100",
            )}
          >
            <Code className="size-3.5" />
          </button>
        )}
      </div>

      {hasError && output && !isExpanded && <ErrorLine output={output} toolName={tool.name} />}

      {isExpanded && canExpand && (
        <div
          className={cn(
            "mt-2 flex flex-col gap-1 rounded-xl bg-muted p-1",
            // Resolving treatment: soft while the call runs, crisp once the
            // result lands.
            "transition-[opacity,filter,transform] duration-200 ease-[var(--ease-out-strong)] motion-reduce:transition-none",
            isExecuting && "scale-[.985] opacity-[.55] [filter:blur(0.5px)]",
          )}
        >
          {inputSection && (
            <CodeCard label={inputSection.label}>
              {inputSection.language === "json"
                ? highlightJson(inputSection.content)
                : inputSection.content}
            </CodeCard>
          )}
          {output && (
            <CodeCard
              label={hasError ? "Error" : "Output"}
              className={hasError ? "text-destructive" : undefined}
            >
              {output.length > OUTPUT_MAX ? `${output.slice(0, OUTPUT_MAX)}…` : output}
            </CodeCard>
          )}
        </div>
      )}
    </div>
  );
});

ToolItem.displayName = "ToolItem";
