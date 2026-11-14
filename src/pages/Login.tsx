import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check } from "@/lib/icons";
import type { ModelInfo } from "../tauri/models";
import { markWelcomed } from "@/lib/welcome";
import { useProviderKey } from "../hooks/useProviderKey";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { WINDOW_SIZES } from "../constants/windowSizes";
import { appApi } from "../tauri";
import { openUrl } from "../tauri/files";
import { OPENROUTER_KEYS_URL } from "../tauri/byok";
import { Titlebar } from "../components/Titlebar";
import { cn, errorMessage } from "@/lib/utils";

const AGENTS = [
  { harness: "agent:claude-code", name: "Claude Code", icon: "claude-color", help: "https://docs.claude.com/en/docs/claude-code/overview" },
  { harness: "agent:codex", name: "Codex", icon: "openai", help: "https://developers.openai.com/codex/cli" },
] as const;
const OPEN_ICONS = ["deepseek-color", "qwen-color", "moonshot-color"] as const;

/** ready: installed and signed in. note: installed, but needs something first. Missing key: not on this Mac. */
type AgentState = { ready: boolean; note: string | null };

function Logo({ icon, dim }: { icon: string; dim?: boolean }) {
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-white", dim && "opacity-55")}>
      <img src={`/model-icons/${icon}.svg`} alt="" className="size-[18px]" draggable={false} />
    </span>
  );
}

const rowClass = "flex w-full items-center gap-3.5 rounded-xl border px-4 py-3.5 text-left";

/**
 * First-run setup, one question per step: choose what to use, then (only for
 * open models) add an OpenRouter key. Layout follows the Crator onboarding:
 * one left-aligned column, a progress bar, a heading at a fixed height and a
 * single pill button.
 */
export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { isConnected, connect } = useProviderKey();
  const [step, setStep] = useState<"choose" | "key">("choose");
  const [openModels, setOpenModels] = useState(true);
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [agents, setAgents] = useState<Record<string, AgentState> | null>(null);

  // Size the window for setup (remove min constraints first)
  useEffect(() => {
    const setupWindow = async () => {
      await appApi.setMinWindowSize(0, 0);
      await appApi.setWindowSize(WINDOW_SIZES.LOGIN.width, WINDOW_SIZES.LOGIN.height, true);
    };
    setupWindow();
  }, []);

  // Look for Claude Code and Codex now, and again whenever the window comes
  // back to the front, so installing one is picked up without a restart.
  useEffect(() => {
    let alive = true;
    const look = () =>
      void invoke<ModelInfo[]>("agent_installed_agents")
        .then((list) => {
          if (!alive) return;
          const found: Record<string, AgentState> = {};
          for (const { harness } of AGENTS) {
            const mine = list.find((m) => m.id === harness);
            if (mine) found[harness] = { ready: !mine.disabledReason, note: mine.disabledReason ?? null };
          }
          setAgents(found);
        })
        .catch(() => alive && setAgents({}));
    look();
    window.addEventListener("focus", look);
    return () => {
      alive = false;
      window.removeEventListener("focus", look);
    };
  }, []);

  const enter = () => {
    markWelcomed();
    navigate("/", { replace: true });
  };

  // Into the app once a key is connected
  useEffect(() => {
    if (isConnected) enter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const anyAgentReady = AGENTS.some((a) => agents?.[a.harness]?.ready);
  const canContinue = openModels || anyAgentReady;

  const submitKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isChecking || !key.trim()) return;
    setError(null);
    setIsChecking(true);
    try {
      await connect(key);
    } catch (err) {
      setError(errorMessage(err, "Could not verify the key with OpenRouter."));
    } finally {
      setIsChecking(false);
    }
  };

  const pill = "h-11 rounded-full px-6 text-sm active:scale-[0.97]";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Titlebar />
      <div className="flex flex-1 flex-col px-14 pt-[72px]">
        <div
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={step === "choose" ? 50 : 100}
          className="h-1 w-full overflow-hidden rounded-full bg-border"
        >
          <div
            className="h-full origin-left rounded-full bg-primary transition-transform duration-200 ease-out"
            style={{ transform: `scaleX(${step === "choose" ? 0.5 : 1})` }}
          />
        </div>

        {step === "choose" ? (
          <section className="pt-14">
            <h1 className="text-[28px] leading-[34px] font-semibold tracking-tight">Choose your models</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Use any of these. You can change this later.</p>

            <div className="mt-7 flex flex-col gap-2.5">
              <button
                type="button"
                role="checkbox"
                aria-checked={openModels}
                onClick={() => setOpenModels((v) => !v)}
                className={cn(rowClass, "cursor-pointer bg-card outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50", openModels ? "border-foreground" : "border-border hover:bg-muted/50")}
              >
                <span className="flex w-[76px] shrink-0 items-center">
                  {OPEN_ICONS.map((icon, i) => (
                    <span key={icon} className={i ? "-ml-2.5" : undefined}><Logo icon={icon} /></span>
                  ))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] leading-5 font-semibold">Open models</span>
                  <span className="mt-0.5 block text-meta text-muted-foreground">Needs your own OpenRouter key</span>
                </span>
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full", openModels ? "bg-foreground text-background" : "border-[1.5px] border-foreground/25")}>
                  {openModels && <Check className="size-3" strokeWidth={3} />}
                </span>
              </button>

              {AGENTS.map(({ harness, name, icon, help }) => {
                const state = agents?.[harness];
                const usable = !!state?.ready;
                return (
                  <div key={harness} className={cn(rowClass, usable ? "border-border bg-card" : "border-dashed border-border bg-muted/30")}>
                    <span className="flex w-[76px] shrink-0 items-center"><Logo icon={icon} dim={!usable} /></span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-[15px] leading-5 font-semibold", !usable && "text-muted-foreground")}>{name}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-meta text-muted-foreground">
                        {usable && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-emerald-600" />}
                        {!agents ? "Looking…" : usable ? "Found on this Mac, uses your login" : state?.note ?? "Not found on this Mac"}
                      </span>
                    </span>
                    {usable ? (
                      <span className="shrink-0 text-meta font-medium text-emerald-700 dark:text-emerald-400">Ready</span>
                    ) : agents && !state ? (
                      <button
                        type="button"
                        onClick={() => openUrl(help).catch((err) => console.error("Failed to open URL:", err))}
                        className="shrink-0 cursor-pointer rounded-sm text-meta font-medium underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        How to add
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="mt-8">
              <Button size="lg" className={pill} disabled={!canContinue} onClick={() => (openModels ? setStep("key") : enter())}>
                Continue
              </Button>
            </div>
          </section>
        ) : (
          <form onSubmit={submitKey} className="pt-14">
            <h1 className="text-[28px] leading-[34px] font-semibold tracking-tight">Add your OpenRouter key</h1>
            <p className="mt-3 text-sm leading-relaxed text-pretty text-muted-foreground">
              Open models run through OpenRouter, and you pay it for what you use.
            </p>

            <div className="mt-7 flex flex-col gap-2.5">
              <label htmlFor="openrouter-key" className="text-sm">API key</label>
              <Input
                id="openrouter-key"
                type="password"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-or-v1-…"
                value={key}
                disabled={isChecking}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "openrouter-key-error" : "openrouter-key-hint"}
                onChange={(e) => {
                  setKey(e.target.value);
                  if (error) setError(null);
                }}
                className="h-11 rounded-lg px-3.5 text-sm"
              />
              {error ? (
                <p id="openrouter-key-error" role="alert" className="text-xs text-destructive">{error}</p>
              ) : (
                <p id="openrouter-key-hint" className="text-xs text-muted-foreground">
                  Kept in your Mac&rsquo;s keychain.{" "}
                  <button
                    type="button"
                    onClick={() => openUrl(OPENROUTER_KEYS_URL).catch((err) => console.error("Failed to open URL:", err))}
                    className="cursor-pointer rounded-sm text-foreground underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    Get a key
                  </button>
                </p>
              )}
            </div>

            <div className="mt-8 flex items-center gap-2">
              <Button type="submit" size="lg" className={pill} disabled={isChecking || !key.trim()}>
                {isChecking ? (<><Spinner className="size-4" />Checking key…</>) : "Continue"}
              </Button>
              <Button type="button" variant="ghost" size="lg" className="h-11 rounded-full px-4 text-sm text-muted-foreground" disabled={isChecking} onClick={() => { setError(null); setStep("choose"); }}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
            </div>
          </form>
        )}
      </div>
      <p className="px-6 pt-3 pb-6 text-center text-xs text-muted-foreground">Setup takes about a minute.</p>
    </div>
  );
};
