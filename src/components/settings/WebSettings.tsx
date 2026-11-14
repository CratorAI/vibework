import React, { useCallback, useEffect, useId, useState } from "react";
import { Check } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  webApi,
  WEB_KEY_URLS,
  type WebKeyProvider,
  type WebSearchProvider,
  type WebSettings as WebSettingsState,
} from "@/tauri/web";
import { cn, errorMessage } from "@/lib/utils";
import { ExternalLinkButton, InlineError, SettingsPageHeader, settingsCardClass, settingsRowClass } from "./settingsUi";

interface ProviderOption {
  id: WebSearchProvider;
  label: string;
  description: string;
}

const PROVIDERS: ProviderOption[] = [
  {
    id: "openrouter",
    label: "OpenRouter web search",
    description: "Uses your OpenRouter key, billed per search.",
  },
  {
    id: "exa",
    label: "Exa",
    description: "A search engine built for AI agents.",
  },
  {
    id: "brave",
    label: "Brave Search",
    description: "Brave’s independent web index.",
  },
];

const KEY_LABELS: Record<WebKeyProvider, { name: string; placeholder: string; linkText: string }> = {
  exa: { name: "Exa", placeholder: "Exa API key", linkText: "Get a key at dashboard.exa.ai" },
  brave: {
    name: "Brave Search",
    placeholder: "Brave Search API key",
    linkText: "Get a key at api-dashboard.search.brave.com",
  },
};

function hasKey(settings: WebSettingsState, provider: WebSearchProvider): boolean {
  if (provider === "exa") return settings.hasExaKey;
  if (provider === "brave") return settings.hasBraveKey;
  return true;
}

const KeyField: React.FC<{
  provider: WebKeyProvider;
  saved: boolean;
  onChanged: () => Promise<void>;
}> = ({ provider, saved, onChanged }) => {
  const inputId = useId();
  const labels = KEY_LABELS[provider];
  const [key, setKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || !key.trim()) return;
    setError(null);
    setIsSaving(true);
    try {
      await webApi.setKey(provider, key.trim());
      setKey("");
      await onChanged();
    } catch (err) {
      setError(errorMessage(err, `Could not save the ${labels.name} key.`));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    setError(null);
    setIsRemoving(true);
    try {
      await webApi.setKey(provider, "");
      await onChanged();
    } catch (err) {
      setError(errorMessage(err, `Could not remove the ${labels.name} key.`));
    } finally {
      setIsRemoving(false);
    }
  };

  if (saved) {
    return (
      <div className="mt-3 ml-7 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="flex-1 inline-flex items-center gap-1.5 text-meta text-muted-foreground">
            <Check className="size-3.5 text-success" />
            Key saved
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            disabled={isRemoving}
            className="text-muted-foreground hover:text-destructive"
          >
            {isRemoving && <Spinner className="size-3.5" />}
            Remove key
          </Button>
        </div>
        {error && <InlineError>{error}</InlineError>}
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="mt-3 ml-7 flex flex-col gap-2">
      <label htmlFor={inputId} className="sr-only">
        {labels.name} API key
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={inputId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={labels.placeholder}
          value={key}
          disabled={isSaving}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setKey(e.target.value);
            if (error) setError(null);
          }}
          className="flex-1"
        />
        <Button type="submit" variant="outline" disabled={isSaving || !key.trim()}>
          {isSaving ? (
            <>
              <Spinner className="size-3.5" />
              Checking…
            </>
          ) : (
            "Save"
          )}
        </Button>
      </div>
      {error && <InlineError>{error}</InlineError>}
      <ExternalLinkButton href={WEB_KEY_URLS[provider]}>{labels.linkText}</ExternalLinkButton>
    </form>
  );
};

export const WebSettings: React.FC = () => {
  const groupName = useId();
  const [settings, setSettings] = useState<WebSettingsState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<WebSearchProvider | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSettings(await webApi.getSettings());
      setLoadError(null);
    } catch (err) {
      console.error("[Web] Failed to read settings:", err);
      setLoadError(errorMessage(err, "Could not load web settings."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRetry = async () => {
    setIsRetrying(true);
    await load();
    setIsRetrying(false);
  };

  const handleSelect = async (provider: WebSearchProvider) => {
    if (!settings || provider === settings.provider || pendingProvider) return;
    setProviderError(null);
    setPendingProvider(provider);
    try {
      await webApi.setProvider(provider);
    } catch (err) {
      setProviderError(errorMessage(err, "Could not change the search provider."));
    } finally {
      await load();
      setPendingProvider(null);
    }
  };

  return (
    <div className="space-y-8">
      <SettingsPageHeader title="Web" />

      {!settings ? (
        loadError ? (
          <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-destructive/20 bg-destructive-muted/50">
            <InlineError className="flex-1">{loadError}</InlineError>
            <Button variant="outline" size="sm" onClick={handleRetry} disabled={isRetrying}>
              {isRetrying && <Spinner className="size-3.5" />}
              Try again
            </Button>
          </div>
        ) : (
          <div className={settingsCardClass} aria-busy="true" aria-label="Loading web settings">
            {[0, 1, 2].map((i) => (
              <div key={i} className={cn(settingsRowClass, "flex items-start gap-3")}>
                <Skeleton className="mt-0.5 size-4 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-40 rounded-sm" />
                  <Skeleton className="h-3 w-64 rounded-sm" />
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <section>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-foreground">Search provider</legend>
            <div className={settingsCardClass}>
              {PROVIDERS.map((option) => {
                const available = hasKey(settings, option.id);
                const checked = (pendingProvider ?? settings.provider) === option.id;
                const radioId = `${groupName}-${option.id}`;
                const reasonId = `${radioId}-reason`;
                return (
                  <div key={option.id} className={settingsRowClass}>
                    <label
                      htmlFor={radioId}
                      className={cn("flex items-start gap-3", available ? "cursor-pointer" : "cursor-not-allowed")}
                    >
                      <input
                        id={radioId}
                        type="radio"
                        name={groupName}
                        value={option.id}
                        checked={checked}
                        disabled={!available || pendingProvider !== null}
                        aria-describedby={!available ? reasonId : undefined}
                        onChange={() => handleSelect(option.id)}
                        className="mt-0.5 size-4 shrink-0 accent-foreground disabled:opacity-50 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-full"
                      />
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2 text-sm text-foreground">
                          {option.label}
                          {pendingProvider === option.id && <Spinner className="size-3.5 text-muted-foreground" />}
                        </span>
                        <span className="block text-meta text-muted-foreground">
                          {option.description}
                          {!available && (
                            <span id={reasonId}> Needs your API key.</span>
                          )}
                        </span>
                      </span>
                    </label>
                    {option.id !== "openrouter" && (
                      <KeyField provider={option.id} saved={available} onChanged={load} />
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
          {providerError && <InlineError className="mt-3">{providerError}</InlineError>}

          <p className="text-meta text-muted-foreground mt-3">
            Pages the agent opens are always fetched from this computer.
          </p>
        </section>
      )}
    </div>
  );
};
