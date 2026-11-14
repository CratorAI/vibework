import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { openFolderPicker } from "../tauri/files";
import { getWorkingFolder, setWorkingFolder } from "../tauri/agent";
import { useAgentSessionsContext } from "../contexts/AgentSessionsContext";

export interface UseWorkingFolderReturn {
  workingFolder: string | null;
  isLoading: boolean;
  selectFolder: () => Promise<void>;
  openPicker: () => Promise<string | null>;
  confirmFolder: (folderPath: string) => Promise<void>;
}

/**
 * Custom hook for managing the working folder for a session
 * @param sessionId - The session ID to manage working folder for (optional)
 * @returns Working folder state and selection function
 */
export function useWorkingFolder(sessionId?: string): UseWorkingFolderReturn {
  const { pendingWorkingFolder, setPendingWorkingFolder } = useAgentSessionsContext();
  const [workingFolder, setWorkingFolderState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch working folder on mount (only if sessionId exists)
  useEffect(() => {
    if (!sessionId) {
      // No session - use pending folder from context
      setWorkingFolderState(pendingWorkingFolder);
      setIsLoading(false);
      return;
    }

    // Session exists - fetch from backend
    const fetchWorkingFolder = async () => {
      try {
        console.log(`[useWorkingFolder] Fetching for session ${sessionId}, pending:`, pendingWorkingFolder);
        const folder = await getWorkingFolder(sessionId);
        console.log(`[useWorkingFolder] Fetched folder:`, folder);
        setWorkingFolderState(folder);

        // If we had a pending folder and successfully fetched the same value, clear pending
        if (pendingWorkingFolder && folder === pendingWorkingFolder) {
          console.log('[useWorkingFolder] Fetched folder matches pending, clearing pending');
          setPendingWorkingFolder(null);
        }
      } catch (error) {
        console.error("[useWorkingFolder] Failed to fetch working folder:", error);
        // If fetch fails but we have a pending folder, use it
        if (pendingWorkingFolder) {
          console.log('[useWorkingFolder] Using pending folder as fallback');
          setWorkingFolderState(pendingWorkingFolder);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchWorkingFolder();
  }, [sessionId, pendingWorkingFolder, setPendingWorkingFolder]);

  // Open the native folder picker without setting the folder
  const openPicker = useCallback(async (): Promise<string | null> => {
    if (workingFolder) {
      toast.info("You can only have one working folder per task to keep your files safe. Start a new task to work in a different folder.");
      return null;
    }

    try {
      const folderPath = await openFolderPicker();
      return folderPath || null;
    } catch (error) {
      console.error("Failed to open folder picker:", error);
      toast.error("Failed to open folder picker", { duration: Infinity, closeButton: true });
      return null;
    }
  }, [workingFolder]);

  // Confirm and set the selected folder
  const confirmFolder = useCallback(async (folderPath: string) => {
    try {
      if (sessionId) {
        await setWorkingFolder(sessionId, folderPath);
        setWorkingFolderState(folderPath);
        toast.success(`Working folder set: ${folderPath}`);
      } else {
        setPendingWorkingFolder(folderPath);
        setWorkingFolderState(folderPath);
        toast.success(`Working folder set: ${folderPath}`);
      }
    } catch (error) {
      console.error("Failed to set working folder:", error);
      toast.error("Failed to set working folder", { duration: Infinity, closeButton: true });
    }
  }, [sessionId, setPendingWorkingFolder]);

  // Legacy: select folder in one step (picker + confirm)
  const selectFolder = useCallback(async () => {
    const folderPath = await openPicker();
    if (folderPath) {
      await confirmFolder(folderPath);
    }
  }, [openPicker, confirmFolder]);

  return {
    workingFolder,
    isLoading,
    selectFolder,
    openPicker,
    confirmFolder,
  };
}
