/**
 * The panel with no tabs: what it can open, centred, each with its key, and
 * the task's recent files under them. The keys work while the panel has
 * focus.
 */

import { File as FileIcon } from "@/lib/icons";
import { ArtifactTypeChip } from "@/components/artifacts/typeColor";
import { resolveArtifactType } from "@/components/artifacts/registry";
import type { ArtifactEntry } from "@/tauri/artifacts";
import { openArtifactInPanel } from "./actions";
import { relativeTime } from "./artifacts/useRecentFiles";
import { PANEL_CHOICES, choiceForKey, choose, runChoice } from "./surfaces";

const ROW =
  "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50";

export function PanelEmpty({ sessionId, recent, failed }: { sessionId: string; recent: ArtifactEntry[]; failed: boolean }) {
  return (
    <div
      className="flex h-full overflow-y-auto"
      data-testid="panel-empty"
      onKeyDown={(e) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        const picked = choiceForKey(e, recent);
        if (!picked) return;
        e.preventDefault();
        runChoice(sessionId, picked);
      }}
    >
      {/* Centred while it fits; scrolls from the top when it does not */}
      <div className="m-auto flex w-full max-w-[320px] flex-col px-6 py-10">
        <p className="mb-2 px-2 text-meta text-muted-foreground">Open something</p>
        <ul className="flex flex-col">
          {PANEL_CHOICES.map(({ id, label, icon: Icon, key }) => (
            <li key={id}>
              <button type="button" className={ROW} onClick={() => choose(sessionId, id)}>
                <Icon className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <kbd className="kbd">{key}</kbd>
              </button>
            </li>
          ))}
        </ul>
        {recent.length > 0 && (
          <>
            <p className="mt-6 mb-1 px-2 text-meta text-muted-foreground">Recent files</p>
            <ul className="flex flex-col">
              {recent.map((entry, i) => {
                const Icon = resolveArtifactType(entry.name)?.icon ?? FileIcon;
                return (
                  <li key={entry.path}>
                    <button type="button" className={ROW} title={entry.path} onClick={() => openArtifactInPanel(sessionId, entry.path)}>
                      <ArtifactTypeChip fileName={entry.name} icon={Icon} size="sm" className="-mx-0.5" />
                      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                      <span className="shrink-0 text-meta text-muted-foreground tabular-nums">{relativeTime(entry.modifiedMs)}</span>
                      {i < 9 && <kbd className="kbd">{i + 1}</kbd>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {failed && <p className="mt-6 px-2 text-meta text-muted-foreground">Couldn’t list the working folder. Reopen the panel to try again.</p>}
      </div>
    </div>
  );
}
