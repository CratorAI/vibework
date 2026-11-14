import React, { useEffect, useId, useRef, useState } from "react";
import { Globe, Plus, X } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ServiceMark, resolveService } from "@/components/ServiceMark";
import { mcpServersStore, useMcpServers } from "@/stores/mcpServers";
import type { McpServerConfig, McpServerView } from "@/tauri/mcp";
import { POPULAR_CONNECTORS, type PopularConnector } from "./popularConnectors";
import { quoteShellArg, splitShellArgs } from "@/utils/shellArgs";
import { cn, errorMessage } from "@/lib/utils";
import { InlineError } from "./settingsUi";

type Mode = "local" | "remote";

interface KeyValueRow {
  id: number;
  key: string;
  value: string;
  /** Editing: the name this row had when saved. Its value is never shown; left empty, it stays as saved. */
  saved?: string;
}

type FieldErrors = Partial<Record<"name" | "command" | "args" | "url" | "pairs", string>>;

const NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** RFC 7230 token characters */
const HEADER_KEY_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

const MODES: { id: Mode; label: string }[] = [
  { id: "local", label: "Local" },
  { id: "remote", label: "Remote" },
];

/**
 * Non-empty rows as a map, plus the saved names left unchanged (their values
 * stay as saved), or a readable error.
 */
function collectPairs(
  rows: KeyValueRow[],
  kind: "variable" | "header",
): { pairs: Record<string, string>; keep: string[] } | { error: string } {
  const pairs: Record<string, string> = {};
  const keep: string[] = [];
  for (const row of rows) {
    const key = row.key.trim();
    if (!key && !row.value) continue;
    if (row.saved && key === row.saved && row.value === "") {
      if (keep.includes(key) || key in pairs) return { error: `"${key}" is listed twice.` };
      keep.push(key);
      continue;
    }
    if (!key) return { error: `Each ${kind} needs a name.` };
    if (kind === "variable" && !ENV_KEY_PATTERN.test(key)) {
      return { error: `"${key}" is not a valid variable name. Use letters, digits and _, not starting with a digit.` };
    }
    if (kind === "header" && !HEADER_KEY_PATTERN.test(key)) {
      return { error: `"${key}" is not a valid header name.` };
    }
    if (key in pairs || keep.includes(key)) return { error: `"${key}" is listed twice.` };
    pairs[key] = row.value;
  }
  return { pairs, keep };
}

/** A remote server's address on the older SSE transport ("…/sse"). */
function looksLikeSse(url: string): boolean {
  try {
    return /\/sse\/?$/.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

const ConnectorMark: React.FC<{ name: string; url?: string | null }> = ({ name, url }) => {
  const service = resolveService(name, url);
  return (
    <div className="size-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
      {service ? <ServiceMark service={service} className="text-foreground" /> : <Globe className="size-4" />}
    </div>
  );
};

/**
 * Right after a remote connector is added: connect at once and, when the
 * server asks for a sign-in, offer it here. Closes itself once connected.
 */
const ConnectStep: React.FC<{ name: string; onClose: () => void }> = ({ name, onClose }) => {
  const { servers } = useMcpServers();
  const server = servers.find((s) => s.name === name);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const status = server?.status;

  useEffect(() => {
    // Connected (or gone): the row in the list takes over.
    if (!server || status === "connected" || status === "failed" || status === "disabled") onClose();
  }, [server, status, onClose]);

  const signIn = async () => {
    setError(null);
    setStarting(true);
    try {
      await mcpServersStore.signIn(name);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setStarting(false);
    }
  };

  const cancel = async () => {
    try {
      await mcpServersStore.cancelSignIn(name);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const waiting = server?.signingIn ?? false;
  const needsSignIn = status === "needs-sign-in" && !waiting;

  return (
    <div
      className="p-5 rounded-xl border border-border bg-card flex flex-col gap-4"
      data-dialog-escape="local"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <ConnectorMark name={name} url={server?.url} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{name}</p>
          {server?.url && (
            <p className="font-mono text-xs leading-5 text-muted-foreground truncate" title={server.url}>
              {server.url}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 min-h-8">
        {waiting ? (
          <span className="inline-flex items-center gap-1.5 text-meta text-muted-foreground mr-auto">
            <Spinner className="size-3" aria-hidden />
            Signing in through your browser…
          </span>
        ) : needsSignIn ? (
          <span className="inline-flex items-center gap-1.5 text-meta text-foreground mr-auto">
            <span aria-hidden className="size-1.5 rounded-full bg-warning shrink-0" />
            {name} signs in through your browser
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-meta text-muted-foreground mr-auto">
            <Spinner className="size-3" aria-hidden />
            Connecting…
          </span>
        )}
        {waiting ? (
          <Button type="button" variant="outline" onClick={cancel}>
            Cancel
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              {needsSignIn ? "Later" : "Close"}
            </Button>
            {needsSignIn && (
              <Button type="button" autoFocus disabled={starting} onClick={signIn}>
                {starting && <Spinner className="size-3.5" />}
                Sign in
              </Button>
            )}
          </>
        )}
      </div>
      {(error || (server?.signInError && !waiting)) && <InlineError>{error ?? server?.signInError}</InlineError>}
    </div>
  );
};

const PopularList: React.FC<{
  existingNames: readonly string[];
  disabled: boolean;
  onPick: (c: PopularConnector) => void;
}> = ({ existingNames, disabled, onPick }) => (
  <div role="group" aria-label="Popular connectors" className="flex flex-col gap-1.5">
    <p className="text-meta font-medium text-muted-foreground">Popular</p>
    <div className="grid grid-cols-4 gap-1 -mx-2">
      {POPULAR_CONNECTORS.map((c) => {
        const added = existingNames.includes(c.name);
        const service = resolveService(c.name, c.url);
        return (
          <button
            key={c.name}
            type="button"
            disabled={disabled || added}
            onClick={() => onPick(c)}
            title={added ? `${c.label} is already added` : c.url}
            className="h-8 px-2 inline-flex items-center gap-2 rounded-md text-sm text-foreground hover:bg-muted transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 disabled:hover:bg-transparent"
          >
            {service ? <ServiceMark service={service} /> : <Globe className="size-4 text-muted-foreground" />}
            <span className="truncate">{c.label}</span>
          </button>
        );
      })}
    </div>
  </div>
);

interface AddConnectorFormProps {
  existingNames: readonly string[];
  /** Edit this connector instead of adding one (saved through the same checks). */
  editing?: McpServerView;
  /** Add mode: switch to pasting a JSON config. */
  onPasteJson?: () => void;
  /** A remote connector was just added and is shown here while it connects (null: no longer). */
  onConnecting?: (name: string | null) => void;
  onDone: () => void;
  onCancel: () => void;
}

export const AddConnectorForm: React.FC<AddConnectorFormProps> = ({ existingNames, editing, onPasteJson, onConnecting, onDone, onCancel }) => {
  const formId = useId();
  const nextRowId = useRef(1);
  const savedRows = (keys: string[] | undefined): KeyValueRow[] =>
    (keys ?? []).map((key) => ({ id: nextRowId.current++, key, value: "", saved: key }));
  const [mode, setMode] = useState<Mode>(editing?.transport === "http" ? "remote" : "local");
  const [name, setName] = useState(editing?.name ?? "");
  const [command, setCommand] = useState(editing?.command ? quoteShellArg(editing.command) : "");
  const [args, setArgs] = useState(editing ? editing.args.map(quoteShellArg).join(" ") : "");
  const [url, setUrl] = useState(editing?.url ?? "");
  const [envRows, setEnvRows] = useState<KeyValueRow[]>(() => savedRows(editing?.envKeys));
  const [headerRows, setHeaderRows] = useState<KeyValueRow[]>(() => savedRows(editing?.headerKeys));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** A remote connector just added: show its connection (and Sign in) here. */
  const [connecting, setConnecting] = useState<string | null>(null);
  const firstHeaderValue = useRef<HTMLInputElement | null>(null);
  const [focusHeader, setFocusHeader] = useState(false);

  useEffect(() => {
    onConnecting?.(connecting);
  }, [connecting, onConnecting]);
  useEffect(() => () => onConnecting?.(null), [onConnecting]);

  useEffect(() => {
    if (focusHeader) {
      firstHeaderValue.current?.focus();
      setFocusHeader(false);
    }
  }, [focusHeader]);

  const rows = mode === "local" ? envRows : headerRows;
  const setRows = mode === "local" ? setEnvRows : setHeaderRows;

  const clearError = (field: keyof FieldErrors) => {
    if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    if (submitError) setSubmitError(null);
  };

  const addRow = () => {
    setRows((prev) => [...prev, { id: nextRowId.current++, key: "", value: "" }]);
  };

  const updateRow = (id: number, patch: Partial<Omit<KeyValueRow, "id">>) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    clearError("pairs");
  };

  const removeRow = (id: number) => {
    setRows((prev) => prev.filter((row) => row.id !== id));
    clearError("pairs");
  };

  /** Validates the form and builds the config, or records field errors and returns null. */
  const buildConfig = (): { name: string; config: McpServerConfig; keep: string[] } | null => {
    const errors: FieldErrors = {};
    const trimmedName = name.trim();
    if (!trimmedName) errors.name = "Give the connector a name.";
    else if (!NAME_PATTERN.test(trimmedName)) errors.name = "Use only letters, digits, - and _.";
    else if (trimmedName !== editing?.name && existingNames.includes(trimmedName)) errors.name = `A connector named "${trimmedName}" already exists.`;

    let config: McpServerConfig | null = null;
    let keep: string[] = [];

    if (mode === "local") {
      let parsedArgs: string[] = [];
      try {
        parsedArgs = splitShellArgs(args);
      } catch (err) {
        errors.args = errorMessage(err, "Could not read the arguments.");
      }
      // A whole command line pasted into Command ("npx -y @scope/server") is split into command + arguments
      let commandParts: string[] = [];
      try {
        commandParts = splitShellArgs(command);
      } catch (err) {
        errors.command = errorMessage(err, "Could not read the command.");
      }
      if (!errors.command && commandParts.length === 0) errors.command = "Enter the command that starts the server.";

      const env = collectPairs(envRows, "variable");
      if ("error" in env) errors.pairs = env.error;

      if (!errors.command && !errors.args && "pairs" in env) {
        keep = env.keep;
        const allArgs = [...commandParts.slice(1), ...parsedArgs];
        config = {
          command: commandParts[0],
          ...(allArgs.length > 0 ? { args: allArgs } : {}),
          ...(Object.keys(env.pairs).length > 0 ? { env: env.pairs } : {}),
        };
      }
    } else {
      const trimmedUrl = url.trim();
      if (!trimmedUrl) {
        errors.url = "Enter the server's URL.";
      } else {
        try {
          const parsed = new URL(trimmedUrl);
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            errors.url = "The URL must start with http:// or https://.";
          }
        } catch {
          errors.url = "That doesn't look like a URL. Include https://.";
        }
      }

      const headers = collectPairs(headerRows, "header");
      if ("error" in headers) errors.pairs = headers.error;

      if (!errors.url && looksLikeSse(trimmedUrl)) {
        errors.url = "This address uses the older SSE connection, which Vibework no longer supports. Use the provider’s address that ends in /mcp.";
      }
      if (!errors.url && "pairs" in headers) {
        keep = headers.keep;
        config = {
          type: "http",
          url: trimmedUrl,
          ...(Object.keys(headers.pairs).length > 0 ? { headers: headers.pairs } : {}),
        };
      }
    }

    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean) || !config) return null;
    return { name: trimmedName, config, keep };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setSubmitError(null);
    const built = buildConfig();
    if (!built) return;
    setIsSubmitting(true);
    try {
      if (editing) {
        await mcpServersStore.updateServer(editing.name, built.name, built.config, built.keep);
        onDone();
      } else {
        await mcpServersStore.addServer(built.name, built.config);
        // A remote connector may ask to sign in: stay and offer it.
        if ("url" in built.config) setConnecting(built.name);
        else onDone();
      }
    } catch (err) {
      setSubmitError(errorMessage(err, editing ? "Could not save the connector." : "Could not add the connector."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const ids = {
    name: `${formId}-name`,
    command: `${formId}-command`,
    args: `${formId}-args`,
    url: `${formId}-url`,
    pairs: `${formId}-pairs`,
    hint: (field: string) => `${formId}-${field}-hint`,
    error: (field: string) => `${formId}-${field}-error`,
  };

  // The hint and the error share a slot, so point at whichever is showing
  const describedBy = (field: keyof FieldErrors, hasHint?: boolean) =>
    fieldErrors[field] ? ids.error(field) : hasHint ? ids.hint(field) : undefined;

  const pairKind = mode === "local" ? "Environment variables" : "Headers";

  const pickPopular = async (c: PopularConnector) => {
    setSubmitError(null);
    setFieldErrors({});
    if (c.auth.kind === "key") {
      // A key goes in a header: fill the form and let the person paste it.
      setMode("remote");
      setName(c.name);
      setUrl(c.url);
      setHeaderRows([{ id: nextRowId.current++, key: c.auth.header, value: "" }]);
      setFocusHeader(true);
      return;
    }
    setIsSubmitting(true);
    try {
      await mcpServersStore.addServer(c.name, { type: "http", url: c.url });
      setConnecting(c.name);
    } catch (err) {
      setSubmitError(errorMessage(err, "Could not add the connector."));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (connecting) return <ConnectStep name={connecting} onClose={onDone} />;

  const popularKey = POPULAR_CONNECTORS.find((c) => c.name === name.trim() && c.auth.kind === "key");
  const headerPlaceholder = popularKey?.auth.kind === "key" ? popularKey.auth.placeholder : undefined;

  return (
    <form
      onSubmit={handleSubmit}
      data-dialog-escape="local"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !isSubmitting) {
          e.stopPropagation();
          onCancel();
        }
      }}
      className="p-5 rounded-xl border border-border bg-card flex flex-col gap-4"
      aria-labelledby={`${formId}-title`}
      noValidate
    >
      <div className="flex items-center justify-between gap-4">
        <h3 id={`${formId}-title`} className="text-sm font-medium text-foreground">
          {editing ? `Edit ${editing.name}` : "Add connector"}
        </h3>
        <fieldset disabled={isSubmitting}>
          <legend className="sr-only">Where the server runs</legend>
          <div className="inline-flex rounded-lg bg-muted p-0.5">
            {MODES.map((m) => (
              <label
                key={m.id}
                className={cn(
                  "h-7 inline-flex items-center px-3 text-sm rounded-md cursor-pointer transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                  mode === m.id
                    ? "bg-background dark:bg-input/40 text-foreground font-medium shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <input
                  type="radio"
                  name={`${formId}-mode`}
                  value={m.id}
                  checked={mode === m.id}
                  onChange={() => {
                    setMode(m.id);
                    setFieldErrors({});
                    setSubmitError(null);
                  }}
                  className="sr-only"
                />
                {m.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <p className="text-meta text-muted-foreground -mt-2.5">
        {mode === "local"
          ? "A program on this computer that the app starts for you."
          : "A server on the internet, reached over HTTP."}
      </p>

      {!editing && (
        <PopularList existingNames={existingNames} disabled={isSubmitting} onPick={pickPopular} />
      )}

      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.name} className="text-sm font-medium text-foreground">
          Name
        </label>
        <Input
          id={ids.name}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder={mode === "local" ? "filesystem" : "linear"}
          value={name}
          disabled={isSubmitting}
          aria-invalid={fieldErrors.name ? true : undefined}
          aria-describedby={describedBy("name", true)}
          onChange={(e) => {
            setName(e.target.value);
            clearError("name");
          }}
          className="text-sm"
        />
        {fieldErrors.name ? (
          <InlineError id={ids.error("name")}>{fieldErrors.name}</InlineError>
        ) : (
          <p id={ids.hint("name")} className="text-meta text-muted-foreground">
            Letters, digits, - and _. Tools appear to the agent under this name.
          </p>
        )}
      </div>

      {mode === "local" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.command} className="text-sm font-medium text-foreground">
              Command
            </label>
            <Input
              id={ids.command}
              autoComplete="off"
              spellCheck={false}
              placeholder="npx"
              value={command}
              disabled={isSubmitting}
              aria-invalid={fieldErrors.command ? true : undefined}
              aria-describedby={describedBy("command")}
              onChange={(e) => {
                setCommand(e.target.value);
                clearError("command");
              }}
              className="font-mono text-sm"
            />
            {fieldErrors.command && <InlineError id={ids.error("command")}>{fieldErrors.command}</InlineError>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.args} className="text-sm font-medium text-foreground">
              Arguments <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input
              id={ids.args}
              autoComplete="off"
              spellCheck={false}
              placeholder="-y @modelcontextprotocol/server-filesystem ~/Documents"
              value={args}
              disabled={isSubmitting}
              aria-invalid={fieldErrors.args ? true : undefined}
              aria-describedby={describedBy("args", true)}
              onChange={(e) => {
                setArgs(e.target.value);
                clearError("args");
              }}
              className="font-mono text-sm"
            />
            {fieldErrors.args ? (
              <InlineError id={ids.error("args")}>{fieldErrors.args}</InlineError>
            ) : (
              <p id={ids.hint("args")} className="text-meta text-muted-foreground">
                Separated by spaces. Put quotes around an argument that contains spaces.
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.url} className="text-sm font-medium text-foreground">
            URL
          </label>
          <Input
            id={ids.url}
            type="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://example.com/mcp"
            value={url}
            disabled={isSubmitting}
            aria-invalid={fieldErrors.url ? true : undefined}
            aria-describedby={describedBy("url")}
            onChange={(e) => {
              setUrl(e.target.value);
              clearError("url");
            }}
            className="font-mono text-sm"
          />
          {fieldErrors.url && <InlineError id={ids.error("url")}>{fieldErrors.url}</InlineError>}
        </div>
      )}

      {/* Environment variables / headers */}
      <div role="group" aria-labelledby={ids.pairs} className="flex flex-col gap-1.5">
        <p id={ids.pairs} className="text-sm font-medium text-foreground">
          {pairKind} <span className="font-normal text-muted-foreground">(optional)</span>
        </p>
        {rows.map((row, index) => (
          <div key={row.id} className="flex items-center gap-2">
            <Input
              aria-label={`${mode === "local" ? "Variable" : "Header"} ${index + 1} name`}
              autoComplete="off"
              spellCheck={false}
              placeholder={mode === "local" ? "API_KEY" : "Authorization"}
              value={row.key}
              disabled={isSubmitting}
              onChange={(e) => updateRow(row.id, { key: e.target.value })}
              className="w-[40%] font-mono text-sm"
            />
            <Input
              type="password"
              aria-label={`${mode === "local" ? "Variable" : "Header"} ${index + 1} value${row.saved && row.key.trim() === row.saved ? " (set; type to replace)" : ""}`}
              autoComplete="off"
              spellCheck={false}
              // A saved value is write-only: shown as set, never rendered back
              placeholder={
                row.saved && row.key.trim() === row.saved
                  ? "Set · type to replace"
                  : index === 0 && mode === "remote" && headerPlaceholder
                    ? headerPlaceholder
                    : "Value"
              }
              ref={index === 0 && mode === "remote" ? firstHeaderValue : undefined}
              value={row.value}
              disabled={isSubmitting}
              onChange={(e) => updateRow(row.id, { value: e.target.value })}
              className="flex-1 text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${mode === "local" ? "variable" : "header"} ${index + 1}`}
              disabled={isSubmitting}
              onClick={() => removeRow(row.id)}
              className="text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          disabled={isSubmitting}
          className="self-start inline-flex items-center gap-1 h-7 text-sm text-muted-foreground hover:text-foreground rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        >
          <Plus className="size-3.5" />
          {mode === "local" ? "Add variable" : "Add header"}
        </button>
        {fieldErrors.pairs && <InlineError>{fieldErrors.pairs}</InlineError>}
        {rows.length > 0 && !fieldErrors.pairs && (
          <p className="text-meta text-muted-foreground">Values are saved in the connectors file on this computer and are not shown here again.</p>
        )}
      </div>

      {submitError && <InlineError>{submitError}</InlineError>}

      <div className="flex items-center justify-end gap-2 pt-1">
        {!editing && onPasteJson && (
          <button
            type="button"
            onClick={onPasteJson}
            disabled={isSubmitting}
            className="mr-auto inline-flex items-center h-7 text-sm text-muted-foreground hover:text-foreground rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            Paste a config instead
          </button>
        )}
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Spinner className="size-3.5" />
              {editing ? "Saving…" : "Adding…"}
            </>
          ) : editing ? (
            "Save changes"
          ) : (
            "Add connector"
          )}
        </Button>
      </div>
    </form>
  );
};
