import React, { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { mcpServersStore } from "@/stores/mcpServers";
import { errorMessage } from "@/lib/utils";
import { InlineError, settingsInputClass } from "./settingsUi";

const EXAMPLE = `{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/you/Documents"]
    },
    "linear": {
      "type": "http",
      "url": "https://mcp.linear.app/mcp"
    }
  }
}`;

interface ImportJsonFormProps {
  onDone: () => void;
  onCancel: () => void;
}

/** Paste a Claude Desktop style `{"mcpServers": {...}}` config. */
export const ImportJsonForm: React.FC<ImportJsonFormProps> = ({ onDone, onCancel }) => {
  const formId = useId();
  const [json, setJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isImporting || !json.trim()) return;
    // Catch plain syntax errors here; the backend checks the shape
    try {
      JSON.parse(json);
    } catch (err) {
      setError(`That isn't valid JSON: ${errorMessage(err, "could not parse it.")}`);
      return;
    }
    setError(null);
    setIsImporting(true);
    try {
      await mcpServersStore.importJson(json);
      onDone();
    } catch (err) {
      setError(errorMessage(err, "Could not import that JSON."));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      data-dialog-escape="local"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !isImporting) {
          e.stopPropagation();
          onCancel();
        }
      }}
      className="p-5 rounded-xl border border-border bg-card flex flex-col gap-3"
      aria-labelledby={`${formId}-title`}
    >
      <div>
        <h3 id={`${formId}-title`} className="text-sm font-medium text-foreground">
          Paste JSON
        </h3>
        <p id={`${formId}-hint`} className="text-meta text-muted-foreground mt-0.5">
          Paste the <code className="font-mono text-xs px-1 py-px rounded bg-muted text-foreground">mcpServers</code> config from Claude Desktop, Claude
          Code or a server's README. Servers in it are added to your connectors.
        </p>
      </div>
      <textarea
        aria-labelledby={`${formId}-title`}
        aria-describedby={error ? `${formId}-error` : `${formId}-hint`}
        aria-invalid={error ? true : undefined}
        autoFocus
        spellCheck={false}
        autoComplete="off"
        rows={12}
        placeholder={EXAMPLE}
        value={json}
        disabled={isImporting}
        onChange={(e) => {
          setJson(e.target.value);
          if (error) setError(null);
        }}
        className={settingsInputClass(!!error, "w-full font-mono text-sm leading-relaxed resize-y py-2")}
      />
      {error && <InlineError id={`${formId}-error`}>{error}</InlineError>}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isImporting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isImporting || !json.trim()}>
          {isImporting ? (
            <>
              <Spinner className="size-3.5" />
              Importing…
            </>
          ) : (
            "Import"
          )}
        </Button>
      </div>
    </form>
  );
};
