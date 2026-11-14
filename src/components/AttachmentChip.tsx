import React, { useEffect, useState } from "react";
import { X, FileText, Folder } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { resolveArtifactType } from "@/components/artifacts/registry";
import { ArtifactTypeChip } from "@/components/artifacts/typeColor";
import { fileTypeLine } from "@/components/PresentFile";
import { useWorkspaceActions } from "@/components/workspace/WorkspaceContext";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { attachmentPreview, isPreviewableImage } from "@/tauri/files";

export interface AttachmentData {
  path: string;
  name: string;
  size?: number;
}

/** Tiles are 56px (64px in the home composer); previews are fetched at twice that for a sharp retina tile. */
const TILE_PX = 128;

/** "md": 56px tiles and chips (conversation, sent messages); "lg": 64px (the home composer). */
type AttachmentSize = "md" | "lg";
const LIGHTBOX_PX = 1600;

function useImagePreview(path: string, maxPx: number, enabled = true) {
  const [state, setState] = useState<{ path: string; url: string | null; failed: boolean }>({ path, url: null, failed: false });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState((s) => (s.path === path && s.url ? s : { path, url: null, failed: false }));
    attachmentPreview(path, maxPx).then(
      (url) => !cancelled && setState({ path, url, failed: false }),
      () => !cancelled && setState({ path, url: null, failed: true }),
    );
    return () => {
      cancelled = true;
    };
  }, [path, maxPx, enabled]);
  return state.path === path ? state : { url: null, failed: false };
}

const isFolderAttachment = (a: AttachmentData) => a.size === 0 && !a.name.includes(".");

/** The small round remove control at a tile's or chip's top-right corner, shown on hover or focus. */
const RemoveButton: React.FC<{ name: string; onRemove: () => void; size?: AttachmentSize }> = ({ name, onRemove, size = "md" }) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onRemove();
    }}
    aria-label={`Remove ${name}`}
    title={`Remove ${name}`}
    className={cn(
      "absolute z-[1] grid place-items-center rounded-full opacity-0 transition-opacity outline-none group-hover/attachment:opacity-100 group-focus-within/attachment:opacity-100 focus-visible:opacity-100",
      size === "lg"
        ? "top-1 right-1 size-[18px] bg-foreground/72 text-background focus-visible:ring-2 focus-visible:ring-ring/50"
        : "-top-1.5 -right-1.5 size-5 bg-foreground text-background ring-2 ring-card focus-visible:ring-ring/50",
    )}
  >
    <X className={size === "lg" ? "size-2.5" : "size-3"} strokeWidth={size === "lg" ? 3 : 2.5} />
  </button>
);

/** A larger look at an attached image, in the standard dialog. */
const ImageLightbox: React.FC<{ attachment: AttachmentData; open: boolean; onOpenChange: (open: boolean) => void }> = ({
  attachment,
  open,
  onOpenChange,
}) => {
  const { url, failed } = useImagePreview(attachment.path, LIGHTBOX_PX, open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-auto max-w-[min(1120px,calc(100vw-4rem))] gap-3 p-4"
        aria-describedby={undefined}
        data-testid="attachment-lightbox"
      >
        <DialogTitle className="h-7 truncate pr-10 text-sm leading-7 font-medium" title={attachment.path}>
          {attachment.name}
        </DialogTitle>
        <div className="grid min-h-40 min-w-60 place-items-center overflow-hidden rounded-lg bg-muted/40">
          {url ? (
            <img src={url} alt={attachment.name} className="max-h-[calc(88vh-5.5rem)] max-w-full object-contain" />
          ) : failed ? (
            <p className="p-6 text-meta text-muted-foreground">Couldn’t show this image.</p>
          ) : (
            <div className="size-40 animate-pulse rounded-lg bg-muted" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

/** An attached image: a square preview; click for a larger look. */
const ImageTile: React.FC<{ attachment: AttachmentData; onRemove?: () => void; onFailed: () => void; size?: AttachmentSize }> = ({
  attachment,
  onRemove,
  onFailed,
  size = "md",
}) => {
  const { url, failed } = useImagePreview(attachment.path, TILE_PX);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (failed) onFailed();
  }, [failed, onFailed]);
  return (
    <div className={cn("group/attachment relative shrink-0", onRemove && "motion-scale-in")} data-testid="attachment-image">
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={attachment.name}
        aria-label={`Preview ${attachment.name}`}
        className={cn(
          "pressable block overflow-hidden rounded-lg border bg-muted transition-[scale] outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          size === "lg" ? "size-16" : "size-14",
        )}
      >
        {url ? (
          <img src={url} alt="" draggable={false} className="size-full object-cover" />
        ) : (
          <span className="block size-full animate-pulse bg-muted" />
        )}
      </button>
      {onRemove && <RemoveButton name={attachment.name} onRemove={onRemove} size={size} />}
      <ImageLightbox attachment={attachment} open={open} onOpenChange={setOpen} />
    </div>
  );
};

/** Any other file: the type's tinted chip, the name, and a type line. */
const FileChip: React.FC<{ attachment: AttachmentData; onRemove?: () => void; size?: AttachmentSize }> = ({ attachment, onRemove, size = "md" }) => {
  const workspace = useWorkspaceActions();
  const folder = isFolderAttachment(attachment);
  const Icon = folder ? Folder : (resolveArtifactType(attachment.name)?.icon ?? FileText);
  const typeLine = folder ? "Folder" : fileTypeLine(attachment.name);
  // On a sent message, the chip opens the file in the workspace panel when it can show it
  const canPreview = !onRemove && !folder && !!workspace && workspace.canPreview(attachment.path);
  const body = (
    <>
      <ArtifactTypeChip fileName={folder ? "" : attachment.name} icon={Icon} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-meta leading-[18px] font-medium text-foreground">{attachment.name}</span>
        <span className="block truncate text-xs leading-4 text-muted-foreground">{typeLine}</span>
      </span>
    </>
  );
  const chipClass = cn(
    "flex items-center gap-2.5 rounded-lg border bg-card pl-2.5",
    size === "lg" ? "h-16 max-w-[240px] pr-3.5" : "h-14 w-[224px] pr-3",
  );
  return (
    <div className={cn("group/attachment relative shrink-0", onRemove && "motion-scale-in")} data-testid="attachment-file">
      {canPreview && workspace ? (
        <button
          type="button"
          onClick={() => workspace.openArtifact(attachment.path)}
          title={attachment.path}
          aria-label={`Preview ${attachment.name}`}
          className={cn(chipClass, "transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50")}
        >
          {body}
        </button>
      ) : (
        <div className={chipClass} title={attachment.path}>
          {body}
        </div>
      )}
      {onRemove && <RemoveButton name={attachment.name} onRemove={onRemove} size={size} />}
    </div>
  );
};

interface AttachmentChipProps {
  attachment: AttachmentData;
  /** In the composer: removable */
  onRemove?: () => void;
  /** @deprecated sizes are not shown */
  showSize?: boolean;
  size?: AttachmentSize;
}

/** One attachment: an image preview tile, or a file chip (also the fallback when an image can't be previewed). */
export const AttachmentChip: React.FC<AttachmentChipProps> = ({ attachment, onRemove, size }) => {
  const [previewFailed, setPreviewFailed] = useState(false);
  const markFailed = React.useCallback(() => setPreviewFailed(true), []);
  if (isPreviewableImage(attachment.name) && !previewFailed) {
    return <ImageTile attachment={attachment} onRemove={onRemove} onFailed={markFailed} size={size} />;
  }
  return <FileChip attachment={attachment} onRemove={onRemove} size={size} />;
};

/** A row of attachments: images first as tiles, then files as chips. */
export const AttachmentList: React.FC<{
  attachments: AttachmentData[];
  onRemove?: (path: string) => void;
  className?: string;
  size?: AttachmentSize;
}> = ({ attachments, onRemove, className, size }) => {
  const images = attachments.filter((a) => isPreviewableImage(a.name));
  const files = attachments.filter((a) => !isPreviewableImage(a.name));
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} data-testid="attachment-list">
      {[...images, ...files].map((attachment, index) => (
        <AttachmentChip
          key={`${attachment.path}-${index}`}
          attachment={attachment}
          onRemove={onRemove ? () => onRemove(attachment.path) : undefined}
          size={size}
        />
      ))}
    </div>
  );
};
