import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  openFilePicker,
  openFolderPicker,
  getFileInfo,
  onDragDropEvent,
  FileInfo,
} from "../tauri/files";

/** Maximum payload size for PDFs and images (32MB) - Anthropic API limit */
const MAX_PAYLOAD_SIZE = 32 * 1024 * 1024;

/** File extensions that count towards payload limit (PDFs and images) */
const PAYLOAD_EXTENSIONS = new Set([
  "pdf",
  // Images
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff", "tif", "ico", "svg", "heic", "heif", "avif"
]);

/** Check if a file counts towards the payload limit (PDFs and images) */
function isPayloadFile(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  return PAYLOAD_EXTENSIONS.has(ext);
}

export interface UseAttachmentsReturn {
  attachments: FileInfo[];
  isDragging: boolean;
  addFiles: () => Promise<void>;
  addFolder: () => Promise<void>;
  removeAttachment: (path: string) => void;
  clearAttachments: () => void;
  /** Put attachments back (a send that failed), ahead of any added since */
  restoreAttachments: (list: FileInfo[]) => void;
}

/**
 * Custom hook for managing file attachments
 * Handles file picker, drag-drop, and validation
 */
export function useAttachments(): UseAttachmentsReturn {
  const [attachments, setAttachments] = useState<FileInfo[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Use ref to track attachments in callbacks without causing stale closures
  const attachmentsRef = useRef<FileInfo[]>([]);
  attachmentsRef.current = attachments;

  // Add files from paths (used by both file picker and drag-drop)
  const addFilesFromPaths = useCallback(async (paths: string[]) => {
    const currentPaths = new Set(attachmentsRef.current.map((a) => a.path));
    // Calculate current payload size (only PDFs and images count)
    const currentPayloadSize = attachmentsRef.current
      .filter((a) => isPayloadFile(a.name))
      .reduce((sum, a) => sum + a.size, 0);

    const newAttachments: FileInfo[] = [];
    let newPayloadSize = currentPayloadSize;

    for (const path of paths) {
      // Skip if already attached
      if (currentPaths.has(path)) continue;
      // Skip if we're about to add it (handles duplicates in the same drop)
      if (newAttachments.some((a) => a.path === path)) continue;

      try {
        const info = await getFileInfo(path);
        const fileName = info.name;

        // Only check payload size limit for PDFs and images
        if (isPayloadFile(fileName)) {
          if (newPayloadSize + info.size > MAX_PAYLOAD_SIZE) {
            const currentMB = (newPayloadSize / (1024 * 1024)).toFixed(1);
            const fileMB = (info.size / (1024 * 1024)).toFixed(1);
            toast.error(
              `${fileName} (${fileMB}MB) exceeds 32MB payload limit. Current: ${currentMB}MB`,
              { duration: Infinity, closeButton: true },
            );
            continue;
          }
          newPayloadSize += info.size;
        }

        newAttachments.push(info);
      } catch (err) {
        console.error(`Failed to get file info for ${path}:`, err);
        const fileName = path.split("/").pop() || path;
        toast.error(`${fileName}: Failed to read file`, { duration: Infinity, closeButton: true });
      }
    }

    if (newAttachments.length > 0) {
      // Two drops in flight at once must not attach the same file twice
      setAttachments((prev) => [...prev, ...newAttachments.filter((a) => !prev.some((p) => p.path === a.path))]);
    }
  }, []);

  // Set up drag-drop listener
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    let disposed = false;
    const setupDragDrop = async () => {
      const stop = await onDragDropEvent((event) => {
        if (event.type === "drop" && event.paths) {
          setIsDragging(false);
          addFilesFromPaths(event.paths);
        } else if (event.type === "over" || event.type === "enter") {
          setIsDragging(true);
        } else if (event.type === "leave") {
          setIsDragging(false);
        }
      });
      // Unmounted while subscribing: stop at once, or the listener leaks
      if (disposed) stop();
      else unlisten = stop;
    };

    setupDragDrop();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [addFilesFromPaths]);

  // Open file picker and add selected files
  const addFiles = useCallback(async () => {
    try {
      const paths = await openFilePicker(true);
      if (!paths || paths.length === 0) return;
      await addFilesFromPaths(paths);
    } catch (err) {
      console.error("Failed to open file picker:", err);
    }
  }, [addFilesFromPaths]);

  // Open folder picker and add selected folder
  const addFolder = useCallback(async () => {
    try {
      const folderPath = await openFolderPicker();
      if (!folderPath) return;

      // Check if folder is already attached
      const currentPaths = new Set(attachmentsRef.current.map((a) => a.path));
      if (currentPaths.has(folderPath)) return;

      // Create a folder attachment (size 0 since it's a directory)
      const folderName = folderPath.split("/").pop() || folderPath;
      const folderInfo: FileInfo = {
        name: folderName,
        size: 0,
        path: folderPath,
      };

      setAttachments((prev) => [...prev, folderInfo]);
    } catch (err) {
      console.error("Failed to open folder picker:", err);
    }
  }, []);

  // Remove a single attachment
  const removeAttachment = useCallback((pathToRemove: string) => {
    setAttachments((prev) => prev.filter((a) => a.path !== pathToRemove));
  }, []);

  // Clear all attachments
  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  const restoreAttachments = useCallback((list: FileInfo[]) => {
    setAttachments((prev) => [...list, ...prev.filter((a) => !list.some((b) => b.path === a.path))]);
  }, []);

  return {
    attachments,
    isDragging,
    restoreAttachments,
    addFiles,
    addFolder,
    removeAttachment,
    clearAttachments,
  };
}
