import { useState, useCallback } from "react";
import { toast } from "sonner";
import { revealInFinder, openFile } from "../tauri/files";

export interface UsePresentFileReturn {
  revealInFinder: (path: string) => Promise<void>;
  openFile: (path: string) => Promise<void>;
  isLoading: boolean;
}

export function usePresentFile(): UsePresentFileReturn {
  const [isLoading, setIsLoading] = useState(false);

  const handleRevealInFinder = useCallback(async (path: string) => {
    try {
      setIsLoading(true);
      await revealInFinder(path);
    } catch (error) {
      console.error("Failed to reveal in Finder:", error);
      toast.error("Couldn’t show the file in Finder. It may have been moved or deleted.", { duration: Infinity, closeButton: true });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleOpenFile = useCallback(async (path: string) => {
    try {
      setIsLoading(true);
      await openFile(path);
    } catch (error) {
      console.error("Failed to open file:", error);
      toast.error("Couldn’t open the file. It may have been moved or deleted.", { duration: Infinity, closeButton: true });
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    revealInFinder: handleRevealInFinder,
    openFile: handleOpenFile,
    isLoading,
  };
}
