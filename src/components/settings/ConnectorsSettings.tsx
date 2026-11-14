import React, { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Braces, ChevronRight, Globe, LogOut, MoreHorizontal, Pencil, Plug, Plus, RefreshCw, Terminal, Trash2 } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { useMcpServers, mcpServersStore } from "@/stores/mcpServers";
import { mcpApi, type McpServerView } from "@/tauri/mcp";
import { revealInFinder } from "@/tauri/files";
import { formatCommandLine } from "@/utils/shellArgs";
import { humanizeToolName } from "@/utils/mcpToolName";
import { cn, errorMessage } from "@/lib/utils";
import { AddConnectorForm } from "./AddConnectorForm";
import { ImportJsonForm } from "./ImportJsonForm";
import { InlineError, SettingsFooter, SettingsPageHeader, settingsCardClass, settingsRowClass } from "./settingsUi";
import { ServiceMark, resolveService } from "@/components/ServiceMark";
import { Skeleton } from "@/components/ui/skeleton";

type Panel = "add" | "json" | { edit: string } | null;

/** One line describing how the server is reached */
function serverSummary(server: McpServerView): string {
  if (server.transport === "http") return server.url ?? "";
  return server.command ? formatCommandLine(server.command, server.args) : "";
}

const StatusLine: React.FC<{
  server: McpServerView;
  expanded: boolean;
  toolsId: string;
  onToggleTools: () => void;
}> = ({ server, expanded, toolsId, onToggleTools }) => {
  if (server.signingIn) {
    return (
      <span className="inline-flex items-center gap-1.5 text-meta text-muted-foreground">
        <Spinner className="size-3" aria-hidden />
        Signing in through your browser…
      </span>
    );
  }
  switch (server.status) {
    case "connected": {
      // The count is known once a task's turn has been offered its tools
      const count = server.tools.length;
      const label = count === 0 ? "Connected" : `Connected, ${count} ${count === 1 ? "tool" : "tools"}`;
      const dot = <span aria-hidden className="size-1.5 rounded-full bg-success shrink-0" />;
      if (count === 0) {
        return (
          <span className="inline-flex items-center gap-1.5 text-meta text-muted-foreground">
            {dot}
            {label}
          </span>
        );
      }
      return (
        <button
          type="button"
          onClick={onToggleTools}
          aria-expanded={expanded}
          aria-controls={toolsId}
          className="inline-flex items-center gap-1.5 text-meta text-muted-foreground hover:text-foreground rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {dot}
          {label}
          <ChevronRight className={cn("size-3 transition-transform", expanded && "rotate-90")} />
        </button>
      );
    }
    case "connecting":
      return (
        <span className="inline-flex items-center gap-1.5 text-meta text-muted-foreground">
          <Spinner className="size-3" aria-hidden />
          Connecting…
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1.5 text-meta text-destructive">
          <span aria-hidden className="size-1.5 rounded-full bg-destructive shrink-0" />
          Couldn’t connect
        </span>
      );
    case "needs-sign-in":
      return (
        <span className="inline-flex items-center gap-1.5 text-meta text-foreground">
          <span aria-hidden className="size-1.5 rounded-full bg-warning shrink-0" />
          Needs sign-in
        </span>
      );
    case "disabled":
      return (
        <span className="inline-flex items-center gap-1.5 text-meta text-muted-foreground">
          <span aria-hidden className="size-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
          Off
        </span>
      );
  }
};

const ServerRow: React.FC<{ server: McpServerView; onEdit: () => void }> = ({ server, onEdit }) => {
  const toolsId = useId();
  const [expanded, setExpanded] = useState(false);
  const [pendingEnabled, setPendingEnabled] = useState<boolean | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const summary = serverSummary(server);
  const service = resolveService(server.name, server.url);
  const busy = pendingEnabled !== null || isRemoving;

  const handleToggle = async (enabled: boolean) => {
    setActionError(null);
    setPendingEnabled(enabled);
    try {
      await mcpServersStore.setServerEnabled(server.name, enabled);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setPendingEnabled(null);
    }
  };

  const handleRemove = async () => {
    setActionError(null);
    setIsRemoving(true);
    try {
      // On success the row unmounts
      await mcpServersStore.removeServer(server.name);
    } catch (err) {
      setActionError(errorMessage(err));
      setIsRemoving(false);
      setConfirmingRemove(false);
    }
  };

  const handleRetry = async () => {
    setActionError(null);
    setIsRetrying(true);
    try {
      await mcpServersStore.reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setIsRetrying(false);
    }
  };

  const handleSignIn = async () => {
    setActionError(null);
    setIsSigning(true);
    try {
      await mcpServersStore.signIn(server.name);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setIsSigning(false);
    }
  };

  const handleCancelSignIn = async () => {
    setActionError(null);
    try {
      await mcpServersStore.cancelSignIn(server.name);
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const handleSignOut = async () => {
    setActionError(null);
    try {
      await mcpServersStore.signOut(server.name);
      toast(`Signed out of ${server.name}`);
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const showTools = expanded && server.status === "connected" && server.tools.length > 0;
  const needsSignIn = server.status === "needs-sign-in" && !server.signingIn;

  return (
    <li className={settingsRowClass}>
      <div className="flex items-start gap-3">
        <div className="size-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
          {service ? (
            <ServiceMark service={service} className="text-foreground" />
          ) : server.transport === "http" ? (
            <Globe className="size-4" />
          ) : (
            <Terminal className="size-4" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate select-text">{server.name}</p>
          {summary && (
            <p className="font-mono text-xs leading-5 text-muted-foreground truncate select-text" title={summary}>
              {summary}
            </p>
          )}
          <div className="mt-0.5">
            <StatusLine
              server={server}
              expanded={showTools}
              toolsId={toolsId}
              onToggleTools={() => setExpanded((v) => !v)}
            />
          </div>
        </div>

        {confirmingRemove ? (
          <div
            className="flex items-center gap-2 shrink-0"
            data-dialog-escape="local"
            onKeyDown={(e) => {
              if (e.key === "Escape" && !isRemoving) setConfirmingRemove(false);
            }}
          >
            <span className="text-meta text-muted-foreground">Remove {server.name}?</span>
            <Button
              size="sm"
              variant="outline"
              autoFocus
              disabled={isRemoving}
              onClick={() => setConfirmingRemove(false)}
            >
              Cancel
            </Button>
            <Button size="sm" variant="destructive" disabled={isRemoving} onClick={handleRemove}>
              {isRemoving && <Spinner className="size-3.5" />}
              Remove
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            {needsSignIn && (
              <Button size="sm" variant="outline" className="mr-2" disabled={busy || isSigning} onClick={handleSignIn}>
                {isSigning && <Spinner className="size-3.5" />}
                Sign in
              </Button>
            )}
            {server.signingIn && (
              <Button size="sm" variant="ghost" className="mr-2 text-muted-foreground" onClick={handleCancelSignIn}>
                Cancel
              </Button>
            )}
            {pendingEnabled !== null && <Spinner className="size-3.5 text-muted-foreground mr-1" />}
            <Switch
              checked={pendingEnabled ?? server.enabled}
              onCheckedChange={handleToggle}
              disabled={busy}
              aria-label={`${server.name} enabled`}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`More for ${server.name}`}
                  title="More"
                  disabled={busy}
                  className="ml-1 text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem
                  className="cursor-pointer"
                  onSelect={() => {
                    setActionError(null);
                    onEdit();
                  }}
                >
                  <Pencil className="size-4" />
                  Edit
                </DropdownMenuItem>
                {server.oauth && server.signedIn && (
                  <DropdownMenuItem className="cursor-pointer" onSelect={handleSignOut}>
                    <LogOut className="size-4" />
                    Sign out
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  className="cursor-pointer"
                  onSelect={() => {
                    setActionError(null);
                    setConfirmingRemove(true);
                  }}
                >
                  <Trash2 className="size-4" />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {server.status === "failed" && (
        <div className="mt-3 ml-11 flex flex-col gap-2">
          <pre className="px-3 py-2 rounded-lg bg-muted text-xs leading-relaxed font-mono text-foreground whitespace-pre-wrap break-words max-h-40 overflow-y-auto select-text cursor-text">
            {server.error || "The server stopped without reporting an error."}
          </pre>
          <Button size="sm" variant="outline" className="self-start" disabled={isRetrying} onClick={handleRetry}>
            {isRetrying ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />}
            Retry
          </Button>
        </div>
      )}

      {/* Switched off for a reason (an old SSE connector carried over) */}
      {server.status === "disabled" && server.error && (
        <p className="mt-2 ml-11 text-meta text-muted-foreground">{server.error}</p>
      )}

      {showTools && (
        <ul id={toolsId} className="mt-2 ml-11 space-y-1.5">
          {server.tools.map((tool) => (
            <li key={tool.name}>
              <p className="text-sm text-foreground break-all select-text" title={tool.name}>{humanizeToolName(tool.name)}</p>
              {tool.description && (
                <p className="text-meta text-muted-foreground line-clamp-2 select-text" title={tool.description}>
                  {tool.description}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {server.signInError && !server.signingIn && (
        <InlineError className="mt-3 ml-11">{server.signInError}</InlineError>
      )}
      {actionError && <InlineError className="mt-3 ml-11">{actionError}</InlineError>}
    </li>
  );
};

export const ConnectorsSettings: React.FC = () => {
  const { servers, loaded, error, refresh } = useMcpServers();
  const [panel, setPanel] = useState<Panel>(null);
  const [configPath, setConfigPath] = useState<string | null>(null);
  const [isReloading, setIsReloading] = useState(false);
  const [isRetryingList, setIsRetryingList] = useState(false);
  /** Shown in the add form while it connects, so not listed twice. */
  const [connectingName, setConnectingName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    mcpApi
      .getConfigPath()
      .then((path) => {
        if (!cancelled) setConfigPath(path);
      })
      .catch((err) => console.error("[MCP] Failed to read config path:", err));
    return () => {
      cancelled = true;
    };
  }, []);

  const handleReload = async () => {
    setIsReloading(true);
    try {
      await mcpServersStore.reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not reload connectors."));
    } finally {
      setIsReloading(false);
    }
  };

  const handleRetryList = async () => {
    setIsRetryingList(true);
    await refresh();
    setIsRetryingList(false);
  };

  const handleReveal = () => {
    if (!configPath) return;
    revealInFinder(configPath).catch((err) =>
      toast.error(errorMessage(err, "Could not show the file in Finder.")),
    );
  };

  const addButtons = (
    <>
      <Button variant="outline" size="sm" onClick={() => setPanel("json")}>
        <Braces className="size-4" />
        Paste JSON
      </Button>
      <Button size="sm" onClick={() => setPanel("add")}>
        <Plus className="size-4" />
        Add connector
      </Button>
    </>
  );

  const listed = servers.filter((s) => s.name !== connectingName);
  const hasServers = servers.length > 0;
  const editing = panel !== null && typeof panel === "object" ? servers.find((s) => s.name === panel.edit) : undefined;

  return (
    <div className="space-y-8">
      <SettingsPageHeader
        title="Connectors"
        actions={loaded && hasServers && panel === null ? addButtons : undefined}
      />

      <section className="space-y-3">
        {panel === "add" && (
          <AddConnectorForm
            existingNames={servers.map((s) => s.name)}
            onPasteJson={() => setPanel("json")}
            onConnecting={setConnectingName}
            onDone={() => setPanel(null)}
            onCancel={() => setPanel(null)}
          />
        )}
        {editing && (
          <AddConnectorForm
            key={editing.name}
            editing={editing}
            existingNames={servers.map((s) => s.name)}
            onDone={() => setPanel(null)}
            onCancel={() => setPanel(null)}
          />
        )}
        {panel === "json" && <ImportJsonForm onDone={() => setPanel(null)} onCancel={() => setPanel(null)} />}

        {!loaded ? (
          <div className={settingsCardClass} aria-busy="true" aria-label="Loading connectors">
            {[0, 1].map((i) => (
              <div key={i} className={cn(settingsRowClass, "flex items-center gap-3")}>
                <Skeleton className="size-8 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-32 rounded-sm" />
                  <Skeleton className="h-3 w-56 rounded-sm" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {error && (
              <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-destructive/20 bg-destructive-muted/50">
                <InlineError className="flex-1">{error}</InlineError>
                <Button variant="outline" size="sm" onClick={handleRetryList} disabled={isRetryingList}>
                  {isRetryingList && <Spinner className="size-3.5" />}
                  Try again
                </Button>
              </div>
            )}

            {listed.length > 0 ? (
              <ul className={settingsCardClass} aria-label="Connectors">
                {listed.map((server) => (
                  <ServerRow key={server.name} server={server} onEdit={() => setPanel({ edit: server.name })} />
                ))}
              </ul>
            ) : (
              !error &&
              !hasServers &&
              panel === null && (
                <div className="flex flex-col items-center text-center gap-3 px-6 py-10 rounded-xl border bg-card">
                  <div className="size-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                    <Plug className="size-4" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">Connect your other apps</p>
                    <p className="text-meta text-muted-foreground max-w-sm">
                      Let the agent work with your issues, documents and data in the tools you already use.
                    </p>
                  </div>
                  <Button size="sm" className="mt-1" onClick={() => setPanel("add")}>
                    <Plus className="size-4" />
                    Add connector
                  </Button>
                </div>
              )
            )}
          </>
        )}
      </section>

      {loaded && (
        <SettingsFooter
          actions={
            <>
              <Button variant="ghost" size="sm" onClick={handleReveal} disabled={!configPath} className="text-muted-foreground">
                Show in Finder
              </Button>
              <Button variant="outline" size="sm" onClick={handleReload} disabled={isReloading}>
                {isReloading ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />}
                Reload
              </Button>
            </>
          }
        >
          Saved in{" "}
          <span className="font-mono select-text" title={configPath ?? undefined}>
            {configPath ?? "opencode.json"}
          </span>
        </SettingsFooter>
      )}
    </div>
  );
};
