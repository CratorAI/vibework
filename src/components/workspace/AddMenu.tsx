/**
 * The "+" after the last tab: Files, Terminal, Browser, Agent commands, then
 * the task's recent files. Each row shows its key at the right; pressing the
 * key while the menu is open chooses the row. ⌘T opens it (see
 * `PANEL_ADD_MENU_EVENT`).
 */

import { useEffect, useState } from "react";
import { File as FileIcon, Plus } from "@/lib/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArtifactTypeChip } from "@/components/artifacts/typeColor";
import { resolveArtifactType } from "@/components/artifacts/registry";
import { chord } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import type { ArtifactEntry } from "@/tauri/artifacts";
import { openArtifactInPanel, PANEL_ADD_MENU_EVENT } from "./actions";
import { PANEL_CHOICES, choiceForKey, choose, runChoice } from "./surfaces";

/** Recent files listed in the menu (the empty panel lists more) */
const MENU_RECENT = 5;

export function AddMenu({ sessionId, recent }: { sessionId: string; recent: ArtifactEntry[] }) {
  const [open, setOpen] = useState(false);
  const files = recent.slice(0, MENU_RECENT);

  useEffect(() => {
    const onRequest = () => setOpen(true);
    window.addEventListener(PANEL_ADD_MENU_EVENT, onRequest);
    return () => window.removeEventListener(PANEL_ADD_MENU_EVENT, onRequest);
  }, []);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Open in the panel"
          title={`Open in the panel  ${chord("panelAddMenu")}`}
          className={cn(
            "pressable grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-[color,background-color,scale] outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
            open && "bg-muted/60 text-foreground",
          )}
        >
          <Plus className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-64"
        data-testid="panel-add-menu"
        // The keys shown at the right choose their row (instead of the menu's type-to-find)
        onKeyDown={(e) => {
          const picked = choiceForKey(e, files);
          if (!picked) return;
          e.preventDefault();
          setOpen(false);
          runChoice(sessionId, picked);
        }}
      >
        {PANEL_CHOICES.map(({ id, label, icon: Icon, key }) => (
          <DropdownMenuItem key={id} onSelect={() => choose(sessionId, id)}>
            <Icon className="size-4" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <span className="text-xs text-muted-foreground">{key}</span>
          </DropdownMenuItem>
        ))}
        {files.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex h-7 items-end px-2 pt-0 pb-1 text-xs font-medium text-foreground-secondary">
              Recent files
            </DropdownMenuLabel>
            {files.map((entry, i) => {
              const Icon = resolveArtifactType(entry.name)?.icon ?? FileIcon;
              return (
                <DropdownMenuItem
                  key={entry.path}
                  title={entry.path}
                  // The type chip keeps its hue (menu items mute their icons)
                  className="[&_svg]:!text-inherit"
                  onSelect={() => openArtifactInPanel(sessionId, entry.path)}
                >
                  <ArtifactTypeChip fileName={entry.name} icon={Icon} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                  <span className="text-xs text-muted-foreground">{i + 1}</span>
                </DropdownMenuItem>
              );
            })}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
