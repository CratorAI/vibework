import { statArtifact } from "@/tauri/artifacts";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Folder, FileText, ExternalLink } from "@/lib/icons";
import { artifactTypeById, resolveArtifactType } from "@/components/artifacts/registry";
import { ArtifactTypeChip } from "@/components/artifacts/typeColor";
import { usePresentFile } from "@/hooks/usePresentFile";
import { useWorkspaceActions } from "@/components/workspace/WorkspaceContext";

const DISMISS_FILE_HINT_KEY = "vibe-work-dismiss-file-refresh-hint";

/** Plain-language kinds by extension, for the card's type line ("Spreadsheet · XLSX"). */
const KIND_BY_EXT: Record<string, string> = {
  xlsx: "Spreadsheet", xls: "Spreadsheet", xlsm: "Spreadsheet", ods: "Spreadsheet", numbers: "Spreadsheet",
  csv: "Table", tsv: "Table",
  docx: "Document", doc: "Document", odt: "Document", rtf: "Document", pages: "Document",
  md: "Document", markdown: "Document", txt: "Text",
  pptx: "Presentation", ppt: "Presentation", key: "Presentation", odp: "Presentation",
  pdf: "PDF",
  html: "Web page", htm: "Web page",
  png: "Image", jpg: "Image", jpeg: "Image", gif: "Image", webp: "Image", svg: "Image", heic: "Image",
  mp4: "Video", mov: "Video", webm: "Video",
  mp3: "Audio", wav: "Audio", m4a: "Audio",
  excalidraw: "Whiteboard",
  zip: "Archive",
  json: "Data", yaml: "Data", yml: "Data", xml: "Data",
};

/** "Spreadsheet", "Slides", "Dashboard": the file's kind in plain language. */
export function fileKind(fileName: string): string {
  const lower = fileName.toLowerCase();
  // Compound extensions the panel knows by their own type (e.g. deck.slides.md)
  if (lower.endsWith(".design.html")) return "Design";
  if (lower.endsWith(".slides.md")) return "Slides";
  if (lower.endsWith(".dashboard.md")) return "Dashboard";
  const ext = lower.includes(".") ? lower.split(".").pop() ?? "" : "";
  return KIND_BY_EXT[ext] ?? resolveArtifactType(fileName)?.label ?? "File";
}

/** "Spreadsheet · XLSX"; falls back to the viewer's label, then to the extension alone. */
export function fileTypeLine(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".design.html") || lower.endsWith(".slides.md") || lower.endsWith(".dashboard.md")) return fileKind(fileName);
  const ext = lower.includes(".") ? lower.split(".").pop() ?? "" : "";
  const kind = fileKind(fileName);
  return ext ? `${kind} · ${ext.toUpperCase()}` : kind;
}

interface PresentFileProps {
  filePath: string;
  fileName: string;
  description?: string;
  fileType?: string;
  defaultApp?: string;
  className?: string;
  /**
   * The PresentFile tool call behind this card. The first time a call is seen
   * finished (`ready`), the workspace panel opens on the file if the turn is
   * `live`; a call first seen outside a live turn (loaded history) never does.
   */
  presentation?: { key: string; live: boolean; ready: boolean };
}

export const PresentFile: React.FC<PresentFileProps> = ({
  filePath,
  fileName,
  description,
  fileType,
  defaultApp,
  className = "",
  presentation,
}) => {
  const { revealInFinder, openFile, isLoading } = usePresentFile();
  const workspace = useWorkspaceActions();
  const [projectType,setProjectType]=useState<string | null>(null);
  useEffect(()=>{let live=true;setProjectType(null);if(workspace)void statArtifact(workspace.sessionId,filePath).then(s=>{if(live)setProjectType(s.artifactType??null)}).catch(()=>{});return()=>{live=false}},[workspace?.sessionId,filePath]);
  const canPreview = !!workspace && (!!projectType || workspace.canPreview(filePath));

  const presentationKey = presentation?.key;
  const presentationLive = presentation?.live ?? false;
  const presentationReady = presentation?.ready ?? false;
  // Arrives (rises in) when it first shows up mid-turn, still being made; a
  // card already finished when it mounts (history, a reopened task) stays still
  const [arrived] = useState(() => presentationLive && !presentationReady);
  useEffect(() => {
    if (!workspace || !canPreview || !presentationKey || !presentationReady) return;
    workspace.presentArtifact(presentationKey, filePath, presentationLive);
  }, [workspace, canPreview, presentationKey, presentationReady, presentationLive, filePath]);
  const handleOpenClick = () => {
    openFile(filePath);
    // One quiet hint instead of a confirmation before every open
    if (localStorage.getItem(DISMISS_FILE_HINT_KEY) !== "true") {
      toast("If the file was already open in another app, reopen it to see the latest version.", {
        id: "file-refresh-hint",
        action: {
          label: "Don’t show again",
          onClick: () => localStorage.setItem(DISMISS_FILE_HINT_KEY, "true"),
        },
      });
    }
  };

  // The type comes from the file itself: the agent's display name may have
  // no extension ("Q4 focus report" for q4-focus-report.md)
  const typeName = filePath.split(/[\\/]/).filter(Boolean).pop() || fileName;
  const Icon = (projectType ? artifactTypeById(projectType) : resolveArtifactType(typeName))?.icon ?? FileText;
  const typeLine = projectType === "motion" ? "Motion · HyperFrames" : fileType ?? fileTypeLine(typeName);
  // The whole card is the primary action: the preview when the panel can
  // show the file, else the file in its default app
  const primary = canPreview && workspace ? () => workspace.openArtifact(filePath) : handleOpenClick;
  const primaryLabel = canPreview ? `Preview ${fileName}` : `Open ${fileName}${defaultApp ? ` in ${defaultApp}` : ""}`;

  const quietIcon =
    "grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 [&>svg]:size-4";

  return (
    <div
      className={`group/file relative flex w-full max-w-[480px] items-center rounded-xl border bg-card transition-colors hover:bg-muted/40 ${arrived ? "motion-arrive" : ""} ${className}`}
      data-testid="file-card"
    >
      <button
        type="button"
        onClick={primary}
        title={description ? `${filePath}\n${description}` : filePath}
        aria-label={primaryLabel}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2.5 pr-2 pl-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ArtifactTypeChip typeId={projectType ?? undefined} fileName={typeName} icon={Icon} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{fileName}</span>
          <span className="block truncate text-meta text-muted-foreground">{typeLine}</span>
        </span>
      </button>

      {/* Secondary: outside the card's button, so they never trigger it */}
      <div className="flex shrink-0 items-center gap-0.5 pr-2">
        {canPreview && (
          <button
            type="button"
            onClick={handleOpenClick}
            disabled={isLoading}
            title={defaultApp ? `Open in ${defaultApp}` : "Open in default app"}
            aria-label={defaultApp ? `Open in ${defaultApp}` : "Open in default app"}
            className={quietIcon}
          >
            <ExternalLink />
          </button>
        )}
        <button
          type="button"
          onClick={() => revealInFinder(filePath)}
          disabled={isLoading}
          title="Show in Finder"
          aria-label="Show in Finder"
          className={quietIcon}
        >
          <Folder />
        </button>
      </div>
    </div>
  );
};
