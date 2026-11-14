import { invoke } from "@tauri-apps/api/core";
import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown, Search, Star } from "@/lib/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { useModels } from "@/contexts/ModelsContext";
import { useProviderKey } from "@/hooks/useProviderKey";
import {
  RECOMMENDED_MODEL_IDS,
  RECOMMENDED_MODEL_NOTES,
  priceTier,
} from "@/data/recommendedModels";
import type { ModelInfo } from "@/tauri/models";
import { cn } from "@/lib/utils";
import { ProviderMark } from "@/components/ProviderMark";
import { resolveProvider } from "@/lib/modelProviders";
import { usePickerRequest } from "@/stores/searchWindow";
import { toast } from "sonner";
import {
  cachedAgentModels,
  refreshAgentModels,
  modelSelection,
  modelKey,
  withEffort,
  effortLabel,
  harnessLabel,
  readPickerSetting,
  favoriteShortcut,
  type Harness,
} from "@/lib/agentModels";
/** "$0.27" style price, per million tokens. */
function formatUsd(value: number): string {
  if (value === 0) return "$0";
  if (value >= 100) return `$${value.toFixed(0)}`;
  if (value >= 0.01) return `$${value.toFixed(2)}`;
  return `$${value.toPrecision(2)}`;
}

/** "$in / $out per M", or null when either price is unknown. */
export function formatModelPrice(model: ModelInfo): string | null {
  if (model.promptPrice == null || model.completionPrice == null) return null;
  if (model.promptPrice === 0 && model.completionPrice === 0) return "Free";
  return `${formatUsd(model.promptPrice)} / ${formatUsd(model.completionPrice)} per M`;
}

/** "DeepSeek: DeepSeek V4.1 Flash" -> "DeepSeek V4.1 Flash" for compact display. */
export function shortModelName(name: string): string {
  const stripped = name.replace(/^[^:]{1,40}:\s+/, "");
  return stripped || name;
}

type Row =
  | { kind: "header"; label: string; key: string }
  | {
      kind: "model";
      model: ModelInfo;
      key: string;
      note?: string;
      tier?: string | null;
    };
const ROW = 36,
  NOTE = 50,
  HEADER = 28,
  HEIGHT = 340,
  PAD = 4,
  OVERSCAN = 6;
const rowHeight = (r: Row) =>
  r.kind === "header" ? HEADER : r.note ? NOTE : ROW;
const NOTE_TEXT =
  "Your subscription, with its own permissions, skills and connectors";
interface ModelPickerProps {
  value: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  className?: string;
  answersSearch?: boolean;
}
export const ModelPicker: React.FC<ModelPickerProps> = ({
  value,
  onSelect,
  disabled = false,
  side = "top",
  align = "start",
  className,
  answersSearch = false,
}) => {
  const { models: routerModels, isLoading, error, refresh } = useModels();
  const { isConnected } = useProviderKey();
  const [agents, setAgents] = useState<ModelInfo[]>([]);
  const [nativeModels, setNativeModels] = useState<Record<string, ModelInfo[]>>(
    {},
  );
  const [loading, setLoading] = useState<string[]>([]);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const [harness, setHarness] = useState<Harness>(() =>
    readPickerSetting("model-picker-harness", "opencode"),
  );
  const [favourites, setFavourites] = useState<string[]>(() =>
    readPickerSetting("model-picker-favourites", []),
  );
  const [active, setActive] = useState(0),
    [column, setColumn] = useState(1),
    [effortIndex, setEffortIndex] = useState(0),
    [scrollTop, setScrollTop] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null),
    listRef = useRef<HTMLDivElement>(null),
    railRef = useRef<HTMLDivElement>(null),
    effortRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const selected = modelSelection(value);
  const loadAgents = useCallback(async () => {
    const list = await invoke<ModelInfo[]>("agent_installed_agents");
    setAgents(list);
    for (const a of list) {
      if (a.disabledReason) continue;
      void cachedAgentModels(a.id).then((rows) =>
        setNativeModels((p) => ({ ...p, [a.id]: rows })),
      );
      setLoading((p) => [...new Set([...p, a.id])]);
      void refreshAgentModels(a.id)
        .then((rows) => setNativeModels((p) => ({ ...p, [a.id]: rows })))
        .catch(() => {})
        .finally(() => setLoading((p) => p.filter((x) => x !== a.id)));
    }
  }, []);
  useEffect(() => {
    void loadAgents().catch(() => {});
  }, [loadAgents]);
  const rails = useMemo(
    () =>
      [
        "favourites",
        "opencode",
        ...["agent:claude-code", "agent:codex"].filter((h) =>
          agents.some((a) => a.id === h),
        ),
      ] as Harness[],
    [agents],
  );
  const reason = (h: Harness) =>
    h === "opencode"
      ? !isConnected
        ? "Connect an OpenRouter key in Settings."
        : null
      : (agents.find((a) => a.id === h)?.disabledReason ?? agents.find((a) => a.id === h)?.limitReason);
  const all = useMemo<ModelInfo[]>(
    () => [
      ...routerModels.map((m) => ({ ...m, harness: "opencode" })),
      ...agents.flatMap((a) =>
        (
          nativeModels[a.id] ?? [
            { ...a, id: a.id, name: "Default", efforts: [] },
          ]
        ).map((m) => ({
          ...m,
          harness: a.id,
          disabledReason: a.disabledReason ?? a.limitReason,
        })),
      ),
    ],
    [routerModels, agents, nativeModels],
  );
  const byId = useMemo(
    () => new Map(all.map((m) => [modelKey(m.id), m])),
    [all],
  );
  const current =
    (value ? byId.get(modelKey(value)) : undefined) ??
    (selected.harness !== "opencode" && !selected.model
      ? all.find((m) => m.harness === selected.harness && m.isDefault)
      : undefined);
  const displayKey = modelKey(current?.id ?? value ?? "");
  const title = current
    ? shortModelName(current.name)
    : selected.harness !== "opencode"
      ? selected.model || harnessLabel(selected.harness)
      : (value ?? "Choose a model");
  const triggerLabel = selected.effort
    ? `${title} · ${effortLabel(selected.effort)}`
    : title;
  const byCompany = useMemo(
    () =>
      routerModels
        .slice()
        .sort(
          (a, b) =>
            resolveProvider(a.id, a.name).label.localeCompare(
              resolveProvider(b.id, b.name).label,
            ) || shortModelName(a.name).localeCompare(shortModelName(b.name)),
        ),
    [routerModels],
  );
  const rows = useMemo<Row[]>(() => {
    if (query.trim()) {
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      return all
        .filter((m) =>
          terms.every((t) =>
            `${m.name} ${m.id} ${harnessLabel(m.harness ?? "opencode")}`
              .toLowerCase()
              .includes(t),
          ),
        )
        .map((m) => ({ kind: "model", model: m, key: m.id }));
    }
    if (harness === "favourites")
      return favourites
        .map((key) => byId.get(key))
        .filter((m): m is ModelInfo => !!m)
        .map((m) => ({ kind: "model", model: m, key: m.id }));
    if (harness !== "opencode")
      return all
        .filter((m) => m.harness === harness)
        .map((m) => ({ kind: "model", model: m, key: m.id }));
    const recommended = RECOMMENDED_MODEL_IDS.map((key) =>
      byId.get(key),
    ).filter((m): m is ModelInfo => !!m);
    return [
      ...(recommended.length
        ? [
            {
              kind: "header" as const,
              label: "Recommended",
              key: "recommended",
            },
            ...recommended.map((m) => ({
              kind: "model" as const,
              key: "rec:" + m.id,
              model: m,
              note: RECOMMENDED_MODEL_NOTES[m.id],
              tier: priceTier(m.promptPrice, m.completionPrice),
            })),
            { kind: "header" as const, label: "All models", key: "all" },
          ]
        : []),
      ...byCompany.map((m) => ({
        kind: "model" as const,
        key: m.id,
        model: m,
      })),
    ];
  }, [query, harness, all, favourites, byId, byCompany]);
  const { offsets, selectable, total } = useMemo(() => {
    let total = PAD;
    const offsets: number[] = [],
      selectable: number[] = [];
    rows.forEach((r, i) => {
      offsets.push(total);
      total += rowHeight(r);
      if (r.kind === "model") selectable.push(i);
    });
    return { offsets, selectable, total: total + PAD };
  }, [rows]);
  const activeRow = rows[selectable[Math.min(active, selectable.length - 1)]];
  const activeModel = activeRow?.kind === "model" ? activeRow.model : undefined;
  const efforts = activeModel?.efforts?.length
    ? ["", ...activeModel.efforts]
    : [];
  const activeEffort =
    activeModel && value && modelKey(activeModel.id) === modelKey(value)
      ? selected.effort
      : (activeModel?.defaultEffort ?? "");
  const reveal = useCallback(
    (n: number) => {
      const at = selectable[n],
        el = listRef.current;
      if (!el || at === undefined) return;
      const top = offsets[at],
        bottom = top + rowHeight(rows[at]);
      if (top < el.scrollTop) el.scrollTop = top;
      else if (bottom > el.scrollTop + el.clientHeight)
        el.scrollTop = bottom - el.clientHeight;
    },
    [selectable, offsets, rows],
  );
  useEffect(() => {
    setActive(0);
    setScrollTop(0);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [query, harness]);
  useEffect(() => {
    if (!open || query) return;
    const n = selectable.findIndex(
      (i) =>
        rows[i].kind === "model" &&
        modelKey((rows[i] as Extract<Row, { kind: "model" }>).model.id) ===
          displayKey,
    );
    setActive(Math.max(0, n));
    const frame = requestAnimationFrame(() => reveal(Math.max(0, n)));
    return () => cancelAnimationFrame(frame);
  }, [open, harness, all.length]); // selection follows catalog arrival, not pointer movement
  const changeHarness = (h: Harness) => {
    setHarness(h);
    localStorage.setItem("model-picker-harness", JSON.stringify(h));
    setQuery("");
    setColumn(0);
  };
  const toggleStar = (model: ModelInfo) => {
    const key = modelKey(model.id);
    setFavourites((old) => {
      const next = old.includes(key)
        ? old.filter((k) => k !== key)
        : [...old, key];
      localStorage.setItem("model-picker-favourites", JSON.stringify(next));
      return next;
    });
  };
  const choose = (model: ModelInfo, effort?: string) => {
    if (disabled) {
      toast("Stop this task before changing models.");
      return;
    }
    if (
      model.disabledReason ||
      reason((model.harness ?? modelSelection(model.id).harness) as Harness)
    ) {
      return;
    }
    onSelect(
      effort === undefined
        ? withEffort(
            model.id,
            displayKey === modelKey(model.id)
              ? selected.effort
              : (model.defaultEffort ?? ""),
          )
        : withEffort(model.id, effort),
    );
    setOpen(false);
  };
  const changeOpen = (next: boolean) => {
    if (next && (window as Window & { __VIBEWORK_PERF__?: boolean }).__VIBEWORK_PERF__) {
      performance.clearMarks("model-picker:open");
      performance.clearMarks("model-picker:first-row");
      performance.clearMeasures("model-picker:dom");
      performance.mark("model-picker:open");
    }
    setOpen(next);
    if (next) {
      setQuery("");
      setColumn(1);
      void loadAgents().catch(() => {});
    }
  };
  usePickerRequest("model-picker", () => changeOpen(true), answersSearch);
  const focusColumn = (next: number) => {
    const c = Math.max(0, Math.min(efforts.length ? 2 : 1, next));
    setColumn(c);
    if (c === 1) inputRef.current?.focus();
    else if (c === 0)
      (
        railRef.current?.querySelector(
          `[data-harness="${harness}"]`,
        ) as HTMLElement
      )?.focus();
    else {
      const index = Math.max(0, efforts.indexOf(activeEffort));
      setEffortIndex(index);
      (
        effortRef.current?.querySelectorAll("button")[index] as HTMLElement
      )?.focus();
    }
  };
  const keyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    const target = e.target as Node;
    const keyColumn = railRef.current?.contains(target)
      ? 0
      : effortRef.current?.contains(target)
        ? 2
        : 1;
    const favorite = favoriteShortcut(e.key, e.metaKey, e.ctrlKey);
    if (favorite !== null) {
      e.preventDefault();
      e.stopPropagation();
      const m = byId.get(favourites[favorite]);
      if (m) choose(m);
      return;
    }
    if (e.key === "Tab" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
      if (
        e.target === inputRef.current &&
        e.key !== "Tab" &&
        query &&
        inputRef.current.selectionStart !==
          (e.key === "ArrowLeft" ? 0 : query.length)
      )
        return;
      e.preventDefault();
      focusColumn(
        keyColumn +
          (e.key === "ArrowLeft" || (e.key === "Tab" && e.shiftKey) ? -1 : 1),
      );
      return;
    }
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(e.key)) {
      e.preventDefault();
      const d =
        (e.key === "ArrowUp" || e.key === "PageUp" ? -1 : 1) *
        (e.key.startsWith("Page") ? 8 : 1);
      if (keyColumn === 0) {
        const h =
          rails[
            Math.max(0, Math.min(rails.length - 1, rails.indexOf(harness) + d))
          ];
        changeHarness(h);
        (
          railRef.current?.querySelector(`[data-harness="${h}"]`) as HTMLElement
        )?.focus();
      } else if (keyColumn === 2) {
        const n = Math.max(0, Math.min(efforts.length - 1, effortIndex + d));
        setEffortIndex(n);
        (
          effortRef.current?.querySelectorAll("button")[n] as HTMLElement
        )?.focus();
      } else {
        const n = Math.max(0, Math.min(selectable.length - 1, active + d));
        setActive(n);
        reveal(n);
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (keyColumn === 0) {
        focusColumn(1);
      } else if (activeModel) {
        choose(activeModel, keyColumn === 2 ? efforts[effortIndex] : undefined);
      }
    }
  };
  // Binary search keeps the 380-model OpenRouter list windowed.
  let lo = 0,
    hi = Math.max(0, rows.length - 1);
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= scrollTop) lo = mid;
    else hi = mid - 1;
  }
  let end = lo;
  while (end < rows.length - 1 && offsets[end + 1] < scrollTop + HEIGHT) end++;
  const visible = rows.slice(Math.max(0, lo - OVERSCAN), end + OVERSCAN + 1);
  const disabledReason = reason(harness);
  // Portal mounting may commit after this parent; measure both the ref mount
  // and later catalog arrivals. DOM presence, never a frame/paint wait.
  const markFirstRow = (node: HTMLDivElement | null) => {
    if (!node?.querySelector('[role="option"]') ||
        !performance.getEntriesByName("model-picker:open").length ||
        performance.getEntriesByName("model-picker:first-row").length) return;
    performance.mark("model-picker:first-row");
    performance.measure("model-picker:dom", "model-picker:open", "model-picker:first-row");
  };
  useLayoutEffect(() => { if (open) markFirstRow(listRef.current); }, [open, rows]);
  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Choose model"
          title={
            disabled ? "Stop this task before changing models." : triggerLabel
          }
          className={cn(
            "flex h-8 min-w-0 max-w-[260px] items-center gap-1.5 rounded-md px-2 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
            open && "bg-muted",
            className,
          )}
        >
          {value && (
            <ProviderMark modelId={value} modelName={current?.name} size={16} />
          )}
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={6}
        collisionPadding={12}
        className="w-auto max-w-[calc(100vw-24px)] overflow-hidden rounded-lg p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
        onKeyDown={keyDown}
      >
        <div className="flex" data-testid="harness-picker">
          <div
            ref={railRef}
            role="toolbar"
            aria-label="Harnesses"
            className="flex w-12 shrink-0 flex-col gap-1 border-r border-border p-1.5"
          >
            {rails.map((h) => (
              <Tooltip key={h}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    data-harness={h}
                    aria-label={harnessLabel(h)}
                    aria-pressed={h === harness}
                    aria-disabled={!!reason(h)}
                    onFocus={() => setColumn(0)}
                    onClick={() => changeHarness(h)}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-md outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50",
                      h === harness && "bg-accent",
                      reason(h) && "opacity-45",
                    )}
                  >
                    {h === "favourites" ? (
                      <Star className="size-[18px]" />
                    ) : (
                      <ProviderMark
                        modelId={h === "opencode" ? "openrouter/default" : h}
                        size={19}
                      />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">{harnessLabel(h)}</TooltipContent>
              </Tooltip>
            ))}
          </div>
          <div className="flex w-[408px] min-w-0 flex-col">
            <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
              <Search className="size-4 text-muted-foreground" />
              <input
                ref={inputRef}
                role="combobox"
                aria-label="Search models"
                aria-expanded
                aria-controls={id}
                aria-activedescendant={
                  activeRow ? `${id}-${selectable[active]}` : undefined
                }
                value={query}
                onFocus={() => setColumn(1)}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search models"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {(isLoading || loading.includes(harness)) && (
                <Spinner className="size-3.5 text-muted-foreground" />
              )}
            </div>
            {harness.startsWith("agent:") && (
              <div
                className="px-3 py-2 text-xs text-muted-foreground"
                title={NOTE_TEXT}
              >
                <p className="truncate">{NOTE_TEXT}</p>
              </div>
            )}
            {disabled && (
              <p
                role="status"
                className="px-3 py-2 text-meta text-muted-foreground"
              >
                Stop this task before changing models.
              </p>
            )}
            {disabledReason && !query ? (
              <p
                role="status"
                className="px-3 py-4 text-sm text-muted-foreground"
              >
                {disabledReason}
              </p>
            ) : (
              <div
                ref={(node) => { listRef.current = node; markFirstRow(node); }}
                id={id}
                role="listbox"
                aria-label="Models"
                className="overflow-y-auto overscroll-contain"
                onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
                style={{ height: HEIGHT }}
              >
                <div
                  style={{
                    position: "relative",
                    height: Math.max(total, HEIGHT),
                  }}
                >
                  {visible.map((r, j) => {
                    const i = Math.max(0, lo - OVERSCAN) + j,
                      style: React.CSSProperties = {
                        position: "absolute",
                        top: offsets[i],
                        height: rowHeight(r),
                        left: 0,
                        right: 0,
                      };
                    if (r.kind === "header")
                      return (
                        <div
                          key={r.key}
                          style={style}
                          className="flex items-end px-3.5 pb-1 text-meta text-muted-foreground"
                        >
                          {r.label}
                        </div>
                      );
                    const m = r.model,
                      starred = favourites.includes(modelKey(m.id)),
                      favIndex = favourites.indexOf(modelKey(m.id));
                    return (
                      <div key={r.key} style={style} className="px-1.5">
                        <div
                          id={`${id}-${i}`}
                          role="option"
                          aria-selected={modelKey(m.id) === displayKey}
                          aria-disabled={!!m.disabledReason || disabled}
                          onMouseMove={() => setActive(selectable.indexOf(i))}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => choose(m)}
                          title={[m.name, formatModelPrice(m)]
                            .filter(Boolean)
                            .join("\n")}
                          className={cn(
                            "group flex h-full cursor-pointer items-center gap-2 rounded-sm px-2",
                            i === selectable[active] && "bg-accent",
                            (m.disabledReason || disabled) && "opacity-50",
                          )}
                        >
                          <ProviderMark modelId={m.id} modelName={m.name} />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="flex min-w-0 items-baseline gap-2">
                              <span className="truncate text-sm">
                                {shortModelName(m.name)}
                              </span>
                              {r.tier && (
                                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                                  {r.tier}
                                </span>
                              )}
                              {(query || harness === "favourites") && (
                                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                                  {harnessLabel(
                                    m.harness ?? modelSelection(m.id).harness,
                                  )}
                                </span>
                              )}
                            </span>
                            {r.note && (
                              <span className="truncate text-meta text-muted-foreground">
                                {r.note}
                              </span>
                            )}
                          </span>
                          {modelKey(m.id) === displayKey && (
                            <Check className="size-3.5 shrink-0" />
                          )}
                          <button
                            type="button"
                            aria-label={`${starred ? "Remove" : "Add"} ${m.name} ${starred ? "from" : "to"} favourites`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleStar(m);
                            }}
                            className={cn(
                              "flex size-6 shrink-0 items-center justify-center rounded hover:bg-muted focus:opacity-100",
                              starred
                                ? "opacity-100"
                                : "opacity-0 group-hover:opacity-100",
                            )}
                          >
                            <Star
                              className="size-3.5"
                              fill={starred ? "currentColor" : "none"}
                            />
                          </button>
                          {harness === "favourites" &&
                            favIndex >= 0 &&
                            favIndex < 9 && (
                              <kbd className="text-xs text-muted-foreground">
                                ⌘{favIndex + 1}
                              </kbd>
                            )}
                        </div>
                      </div>
                    );
                  })}
                  {!rows.length && (
                    <div className="px-4 py-6 text-sm text-muted-foreground">
                      {query ? (
                        `No models match “${query}”`
                      ) : harness === "favourites" ? (
                        "Star a model to keep it here."
                      ) : error && harness === "opencode" ? (
                        <>
                          <p>Couldn’t load the model list.</p>
                          <button
                            onClick={() => refresh(true)}
                            className="mt-2 underline"
                          >
                            Try again
                          </button>
                        </>
                      ) : isLoading ? (
                        "Loading models…"
                      ) : (
                        "No models available."
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {efforts.length > 0 && !disabledReason && (
            <div
              ref={effortRef}
              role="group"
              aria-label="Reasoning effort"
              className="w-[156px] shrink-0 border-l border-border p-1.5"
            >
              <p className="flex h-[34px] items-center px-2 text-meta text-muted-foreground">
                Reasoning
              </p>
              {efforts.map((effort, i) => (
                <button
                  type="button"
                  key={effort}
                  onFocus={() => {
                    setColumn(2);
                    setEffortIndex(i);
                  }}
                  onClick={() => activeModel && choose(activeModel, effort)}
                  className={cn(
                    "flex h-9 w-full items-center justify-between rounded-sm px-2 text-sm outline-none hover:bg-accent focus-visible:bg-accent",
                    column === 2 && effortIndex === i && "bg-accent",
                  )}
                >
                  <span>{effortLabel(effort)}</span>
                  {effort === activeEffort && <Check className="size-3.5" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
