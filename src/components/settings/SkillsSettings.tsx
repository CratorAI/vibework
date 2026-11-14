import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, FolderOpen, RefreshCw, Search, X } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { SKILLS_CHANGED_EVENT } from "@/stores/skillCatalog";
import { skillsApi, type SkillInfo, type SkillSource, type SkillSourceState, type SkillsSummary } from "@/tauri/skills";
import { cn, errorMessage } from "@/lib/utils";
import { InlineError, SettingsFooter, SettingsPageHeader, settingsCardClass, settingsRowClass } from "./settingsUi";
import { Skeleton } from "@/components/ui/skeleton";

const GROUPS: { source: SkillSource; title: string; defaultOpen: boolean }[] = [
  { source: "user", title: "Your skills", defaultOpen: true },
  { source: "bundled", title: "Built in", defaultOpen: true },
  // Often hundreds of entries: closed until asked for
  { source: "claude", title: "From Claude Code", defaultOpen: false },
  { source: "agents", title: "From ~/.agents", defaultOpen: false },
];

const SOURCE_LABELS: Record<SkillSourceState["id"], string> = {
  user: "Your skills folder",
  claude: "Claude Code skills",
  agents: "Agent skills",
};

/** "/home/example/.claude/skills" -> "~/.claude/skills" */
function tildePath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, "~");
}

/** Which personal skill folders load, with the cost of the list in each task's first message. */
const SkillSources: React.FC<{
  summary: SkillsSummary;
  pending: string | null;
  onToggle: (id: SkillSourceState["id"], enabled: boolean) => void;
}> = ({ summary, pending, onToggle }) => (
  <section aria-labelledby="skill-sources-heading">
    <div className="mb-2 flex items-baseline justify-between gap-4">
      <h3 id="skill-sources-heading" className="text-sm font-medium text-foreground">
        Sources
      </h3>
      <p className="text-meta text-muted-foreground tabular-nums" data-testid="skills-load-summary">
        {summary.loaded} skills loaded · about {summary.approxTokens.toLocaleString()} tokens in each task’s first message
      </p>
    </div>
    <ul className={settingsCardClass}>
      {summary.sources.map((source) => {
        const label = SOURCE_LABELS[source.id];
        return (
          <li key={source.id} className={cn(settingsRowClass, "flex items-center gap-4")}>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">{label}</p>
              <p className="truncate font-mono text-xs text-muted-foreground select-text" title={source.path}>
                {tildePath(source.path)} · {source.count} {source.count === 1 ? "skill" : "skills"}
              </p>
            </div>
            {pending === source.id && <Spinner className="size-3.5 text-muted-foreground" />}
            <Switch
              checked={source.enabled}
              disabled={pending !== null}
              onCheckedChange={(checked) => onToggle(source.id, checked)}
              aria-label={label}
              data-skill-source={source.id}
            />
          </li>
        );
      })}
    </ul>
  </section>
);

/** Rows rendered per group before "Show more" (keeps a 400-skill list fast). */
const PAGE_SIZE = 50;

function matches(skill: SkillInfo, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const haystack = `${skill.name} ${skill.description ?? ""}`.toLowerCase();
  return tokens.every((t) => haystack.includes(t));
}

const SkillList: React.FC<{ skills: SkillInfo[] }> = ({ skills }) => {
  const [shown, setShown] = useState(PAGE_SIZE);
  const visible = skills.slice(0, shown);
  const rest = skills.length - visible.length;
  return (
    <ul className={settingsCardClass}>
      {visible.map((skill) => (
        <li key={skill.path} className="px-4 py-2.5">
          <p className="text-sm font-medium text-foreground truncate select-text" title={skill.path}>
            {skill.name}
          </p>
          {skill.description && (
            <p className="text-meta text-muted-foreground truncate select-text" title={skill.description}>
              {skill.description}
            </p>
          )}
        </li>
      ))}
      {rest > 0 && (
        <li>
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE_SIZE * 4)}
            className="h-10 w-full rounded-b-xl px-4 text-left text-meta text-muted-foreground transition-colors outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Show {Math.min(rest, PAGE_SIZE * 4)} more of {rest}
          </button>
        </li>
      )}
    </ul>
  );
};

/** A collapsible group: heading with its count, then its rows. */
const SkillGroup: React.FC<{
  title: string;
  total: number;
  skills: SkillInfo[];
  open: boolean;
  searching: boolean;
  onToggle: () => void;
  empty?: React.ReactNode;
}> = ({ title, total, skills, open, searching, onToggle, empty }) => {
  const id = `skills-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        className="mb-2 -ml-1 flex h-7 items-center gap-1.5 rounded-md px-1 text-sm font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden />
        {title}
        <span className="text-meta font-normal tabular-nums text-muted-foreground">
          {searching ? `${skills.length} of ${total}` : total}
        </span>
      </button>
      {open && (
        <div id={id}>
          {skills.length > 0 ? (
            // Keyed by the result set so a new search starts from the top
            <SkillList key={skills.length} skills={skills} />
          ) : (
            empty
          )}
        </div>
      )}
    </section>
  );
};

export const SkillsSettings: React.FC = () => {
  const [skills, setSkills] = useState<SkillInfo[] | null>(null);
  const [summary, setSummary] = useState<SkillsSummary | null>(null);
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [query, setQuery] = useState("");
  // Typing stays responsive; the list catches up a frame later
  const deferredQuery = useDeferredValue(query);
  const [openGroups, setOpenGroups] = useState<Record<SkillSource, boolean>>(
    () => Object.fromEntries(GROUPS.map((g) => [g.source, g.defaultOpen])) as Record<SkillSource, boolean>,
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [list, path, sources] = await Promise.all([
        skillsApi.list(),
        skillsApi.getFolderPath().catch((err) => {
          console.error("[Skills] Failed to read folder path:", err);
          return null;
        }),
        skillsApi.summary(),
      ]);
      setSummary(sources);
      setSkills([...list].sort((a, b) => a.name.localeCompare(b.name)));
      setFolderPath(path);
      setError(null);
    } catch (err) {
      console.error("[Skills] Failed to list skills:", err);
      setError(errorMessage(err, "Could not load skills."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tokens = useMemo(() => deferredQuery.toLowerCase().split(/\s+/).filter(Boolean), [deferredQuery]);
  const searching = tokens.length > 0;
  const grouped = useMemo(
    () =>
      GROUPS.map((group) => {
        const all = (skills ?? []).filter((s) => s.source === group.source);
        return { ...group, all, matching: searching ? all.filter((s) => matches(s, tokens)) : all };
      }),
    [skills, tokens, searching],
  );
  const matchCount = grouped.reduce((n, g) => n + g.matching.length, 0);

  const handleToggleSource = async (id: SkillSourceState["id"], enabled: boolean) => {
    setPendingSource(id);
    try {
      setSummary(await skillsApi.setSourceEnabled(id, enabled));
      window.dispatchEvent(new Event(SKILLS_CHANGED_EVENT));
    } catch (err) {
      toast.error(errorMessage(err, "Couldn’t change the skill source."));
    } finally {
      setPendingSource(null);
    }
  };

  const enabledSources = useMemo(
    () => new Set<SkillSource>(["bundled", ...(summary?.sources ?? []).filter((s) => s.enabled).map((s) => s.id)]),
    [summary],
  );

  const handleOpenFolder = async () => {
    setIsOpening(true);
    try {
      await skillsApi.openFolder();
    } catch (err) {
      toast.error(errorMessage(err, "Could not open the skills folder."));
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <div className="space-y-8">
      <SettingsPageHeader
        title="Skills"
        actions={
          <Button variant="outline" size="sm" onClick={handleOpenFolder} disabled={isOpening}>
            {isOpening ? <Spinner className="size-3.5" /> : <FolderOpen className="size-3.5" />}
            Open skills folder
          </Button>
        }
      />

      {error && (
        <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-destructive/20 bg-destructive-muted/50">
          <InlineError className="flex-1">{error}</InlineError>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={isLoading}>
            {isLoading && <Spinner className="size-3.5" />}
            Try again
          </Button>
        </div>
      )}

      {!skills ? (
        !error && (
          <section aria-busy="true" aria-label="Loading skills">
            <Skeleton className="mb-3 h-3.5 w-24 rounded-sm" />
            <div className={settingsCardClass}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2 px-4 py-3">
                  <Skeleton className="h-3 w-32 rounded-sm" />
                  <Skeleton className="h-3 w-3/4 rounded-sm" />
                </div>
              ))}
            </div>
          </section>
        )
      ) : (
        <>
          {summary && summary.sources.length > 0 && (
            <SkillSources summary={summary} pending={pendingSource} onToggle={(id, on) => void handleToggleSource(id, on)} />
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${skills.length} skills`}
              aria-label="Search skills"
              spellCheck={false}
              autoComplete="off"
              // Escape clears the search first, then closes Settings
              data-dialog-escape={query ? "local" : undefined}
              onKeyDown={(e) => {
                if (e.key === "Escape" && query) {
                  e.preventDefault();
                  setQuery("");
                }
              }}
              className="pr-8 pl-8"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {searching && matchCount === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <p className="text-sm text-muted-foreground">No skills match “{deferredQuery.trim()}”</p>
              <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
                Clear search
              </Button>
            </div>
          ) : (
            grouped.map((group) => {
              // Only "Your skills" shows when empty, with a pointer to the folder
              if (group.all.length === 0 && group.source !== "user") return null;
              // While searching, groups without a match step aside and the rest open
              if (searching && group.matching.length === 0) return null;
              return (
                <SkillGroup
                  key={group.source}
                  title={enabledSources.has(group.source) ? group.title : `${group.title} (off)`}
                  total={group.all.length}
                  skills={group.matching}
                  searching={searching}
                  open={searching || openGroups[group.source]}
                  onToggle={() =>
                    setOpenGroups((prev) => ({ ...prev, [group.source]: !(searching || prev[group.source]) }))
                  }
                  empty={
                    <div className="rounded-xl border bg-card px-4 py-5 text-center">
                      <p className="text-sm text-foreground">Teach the agent your own ways of working</p>
                      <p className="mt-1 text-meta text-muted-foreground">
                        Add a folder with a SKILL.md to your skills folder. New conversations pick it up.
                      </p>
                    </div>
                  }
                />
              );
            })
          )}
        </>
      )}

      {skills && (
        <SettingsFooter
          actions={
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={isLoading}>
              <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />
              Reload
            </Button>
          }
        >
          {folderPath ? (
            <>
              Saved in{" "}
              <span className="font-mono select-text" title={folderPath}>
                {folderPath}
              </span>
            </>
          ) : (
            "New and changed skills apply to new conversations."
          )}
        </SettingsFooter>
      )}
    </div>
  );
};
