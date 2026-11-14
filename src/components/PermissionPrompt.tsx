import React, { useCallback, useEffect, useRef } from "react";
import { withChord } from "@/lib/shortcuts";
import { ChevronDown, ShieldCheck, Square } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ServiceMark, resolveService } from "@/components/ServiceMark";
import { connectorLabel } from "@/components/settings/popularConnectors";
import { PermissionRequest } from "@/types/agent";
import {
  formatToolArguments,
  getMcpToolInfo,
  getMcpToolLabel,
  toolInputRecord,
  urlHost,
} from "@/utils/toolDisplayUtils";

interface PermissionPromptProps {
  permissionRequest: PermissionRequest;
  onRespond: (allowed: boolean, remember: boolean) => void | Promise<void>;
  /** External agents own their rules; do not promise persistent host rules. */
  allowRemember?: boolean;
  /** Stop the whole turn (the prompt takes the composer's place, and its Stop) */
  onStop?: () => void;
}

/** Enter only approves once the prompt has been on screen this long, so a
 *  keystroke meant for the message box can't approve it by accident. */
const ENTER_ARM_MS = 400;

interface PermissionContent {
  /** The action, verb first ("Run a command") */
  title: string;
  /** One line: what it touches, who sees it, what can be undone */
  consequence: string;
  /** The exact thing being approved (command, path, URL), if any */
  preview?: string;
}

const fileName = (path: string) => path.split(/[\\/]/).pop() || path;
const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/**
 * What the consent card says for a tool: action, data and risk in plain
 * language. Pure function - no side effects or backend calls.
 */
function getPermissionContent(
  toolName: string,
  action: string,
  details: string | null,
  input?: Record<string, unknown>,
): PermissionContent {
  const data = toolInputRecord(input);
  const path = str(data.file_path);

  switch (toolName) {
    case "Bash": {
      const purpose = str(data.description);
      return {
        title: purpose || "Run a command",
        consequence: "Runs on this computer and can change or delete files.",
        preview: str(data.command) || details || undefined,
      };
    }
    case "Write":
      return {
        title: path ? `Write ${fileName(path)}` : "Write a file",
        consequence: "Creates the file, or replaces it if it already exists.",
        preview: path || details || undefined,
      };
    case "Edit":
    case "MultiEdit":
      return {
        title: path ? `Edit ${fileName(path)}` : "Edit a file",
        consequence: "Changes part of the file in place.",
        preview: path || details || undefined,
      };
    case "Read":
      return {
        title: path ? `Read ${fileName(path)}` : "Read a file",
        consequence: "Reads the file. Nothing is changed.",
        preview: path || details || undefined,
      };
    case "WebSearch": {
      const query = str(data.query);
      return {
        title: "Search the web",
        consequence: "Sends the search to the provider chosen in Settings → Web.",
        preview: query || undefined,
      };
    }
    case "WebFetch": {
      const url = str(data.url);
      return {
        title: url ? `Open ${urlHost(url)}` : "Open a web page",
        consequence: "Downloads the page from this computer.",
        preview: url || undefined,
      };
    }
    case "AddConnector": {
      const label = connectorLabel(str(data.name)) || "a";
      return {
        title: action.trim() || `Add the ${label} connector`,
        consequence: `${label} will be able to offer its tools to your tasks.`,
        preview: details || undefined,
      };
    }
    case "RemoveConnector": {
      const label = connectorLabel(str(data.name)) || "a";
      return {
        title: action.trim() || `Remove the ${label} connector`,
        consequence: `${label} will no longer offer its tools to your tasks.`,
      };
    }
    default: {
      const label = action.trim() || `Use ${toolName}`;
      return {
        title: label.charAt(0).toUpperCase() + label.slice(1),
        consequence: "Needs your approval before it runs.",
        preview: details || undefined,
      };
    }
  }
}

/** The request's action as the prompt titles it ("Send 4 reminder emails", "Write notes.md"). */
export function permissionTitle(request: Pick<PermissionRequest, "toolName" | "action" | "details" | "input">): string {
  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = request.input ? toolInputRecord(JSON.parse(request.input)) : undefined;
  } catch {
    // Input is not JSON
  }
  const mcp = getMcpToolInfo(request.toolName);
  return mcp ? getMcpToolLabel(mcp) : getPermissionContent(request.toolName, request.action, request.details, parsed).title;
}

export const PermissionPrompt: React.FC<PermissionPromptProps> = ({
  permissionRequest,
  onRespond,
  onStop,
  allowRemember = true,
}) => {
  const { requestId, toolName, action, details, input, position, total, reason } = permissionRequest;

  // One answer per request, however fast the keys come
  const answered = useRef<string | null>(null);
  const respond = useCallback(
    (allowed: boolean, remember: boolean) => {
      if (answered.current === requestId) return;
      answered.current = requestId;
      // Settled: the next request has its own id; a failed reply can be retried
      void Promise.resolve(onRespond(allowed, remember)).finally(() => {
        answered.current = null;
      });
    },
    [onRespond, requestId],
  );

  // The prompt is what needs answering: it takes focus when it appears (or
  // the task is opened on it), unless the user is typing somewhere else.
  // Enter allows once and Escape denies while it has focus.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const active = document.activeElement as HTMLElement | null;
    const typingElsewhere =
      !!active && active !== document.body && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName));
    if (!typingElsewhere || active?.closest('[data-testid="composer"]')) {
      el.focus({ preventScroll: true });
    }
    const shownAt = performance.now();
    // Native listener: keys inside the (portalled) menu never reach it
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        respond(false, false);
      } else if (e.key === "Enter" && !e.shiftKey && !e.repeat && e.target === el) {
        e.preventDefault();
        if (performance.now() - shownAt >= ENTER_ARM_MS) respond(true, false);
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [requestId, respond]);

  // Tool input arrives as a JSON string
  let parsedInput: Record<string, unknown> | undefined;
  try {
    parsedInput = input ? toolInputRecord(JSON.parse(input)) : undefined;
  } catch {
    // Input is not JSON, ignore
  }

  // Tools from the user's MCP servers: show which service, and the exact arguments
  const mcp = getMcpToolInfo(toolName);
  const mcpArguments = mcp && parsedInput ? formatToolArguments(parsedInput) : null;
  // Adding or removing a connector shows that service's mark too
  const connectorName = toolName === "AddConnector" || toolName === "RemoveConnector" ? str(parsedInput?.name) : "";
  const service = mcp ? resolveService(mcp.server) : connectorName ? resolveService(connectorName) : null;

  const content: PermissionContent = mcp
    ? {
        title: getMcpToolLabel(mcp),
        consequence:
          mcpArguments && mcpArguments.length > 0
            ? `Sends the details below to your ${mcp.server} connector.`
            : `Runs a tool from your ${mcp.server} connector.`,
      }
    : getPermissionContent(toolName, action, details, parsedInput);
  // The policy's reason says why this one asks; without one, what it does
  const line = reason?.trim() || content.consequence;

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role="alertdialog"
      aria-label={`Needs your approval: ${content.title}`}
      aria-describedby="permission-prompt-line"
      data-testid="permission-prompt"
      className="px-4 pt-3 pb-3 outline-none"
    >
      {permissionRequest.helper && <p className="mb-1 text-meta text-muted-foreground">Helper · {permissionRequest.helper}</p>}
      <div className="flex h-7 items-center gap-2.5">
        <span className="grid size-4 shrink-0 place-items-center text-warning [&>svg]:size-4" aria-hidden>
          {service ? <ServiceMark service={service} /> : <ShieldCheck />}
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground" title={mcp ? mcp.tool : content.title}>
          {content.title}
        </p>
        {total && total > 1 && position ? (
          <span className="shrink-0 text-meta text-muted-foreground tabular-nums" data-testid="permission-count">
            {position} of {total}
          </span>
        ) : null}
        {onStop && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onStop}
            className="-mr-1.5 shrink-0 text-muted-foreground"
            title={withChord("Stop the task", "stop")}
            data-testid="prompt-stop"
          >
            <Square className="size-3" fill="currentColor" />
            Stop
          </Button>
        )}
      </div>

      {content.preview && (
        <pre
          className="mt-2 max-h-[124px] overflow-y-auto rounded-lg bg-muted px-3 py-2 font-mono text-meta leading-[18px] whitespace-pre-wrap break-all text-foreground select-text"
          data-testid="permission-preview"
        >
          {content.preview}
        </pre>
      )}

      {mcpArguments && mcpArguments.length > 0 && (
        <dl className="mt-2 max-h-[176px] space-y-2 overflow-y-auto">
          {mcpArguments.map((arg) => (
            <div key={arg.key}>
              <dt className="mb-1 font-mono text-xs text-muted-foreground">{arg.key}</dt>
              <dd className="rounded-lg bg-muted px-3 py-2">
                <pre className="font-mono text-meta leading-[18px] whitespace-pre-wrap break-words text-foreground select-text">
                  {arg.value}
                </pre>
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-3 flex items-center gap-3">
        <p id="permission-prompt-line" className="min-w-0 flex-1 text-meta text-muted-foreground">
          {line}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => respond(false, false)} className="text-muted-foreground" title="Deny (esc)">
            Deny
          </Button>
          <div className="flex items-center">
            <Button size="sm" className={allowRemember ? "rounded-r-none" : undefined} onClick={() => respond(true, false)} title="Allow once (⏎)">
              Allow once
            </Button>
            {allowRemember && <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  className="rounded-l-none border-l border-l-primary-foreground/20 px-1.5"
                  aria-label="More answers"
                >
                  <ChevronDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top">
                <DropdownMenuItem onClick={() => respond(true, true)}>Always allow</DropdownMenuItem>
                <DropdownMenuItem onClick={() => respond(false, true)}>Always deny</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>}
          </div>
        </div>
      </div>
    </div>
  );
};
