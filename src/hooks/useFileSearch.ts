import { useState, useCallback, useRef } from "react";
import { searchFiles, FileSearchResult } from "../tauri/files";

export interface UseFileSearchReturn {
  results: FileSearchResult[];
  selectedIndex: number;
  isSearching: boolean;
  search: (query: string) => void;
  setSelectedIndex: (index: number) => void;
  selectNext: () => void;
  selectPrevious: () => void;
  clearResults: () => void;
}

/**
 * Hook for searching files in a working directory
 * Handles debouncing and result management
 */
export function useFileSearch(workingFolder: string | null): UseFileSearchReturn {
  const [results, setResults] = useState<FileSearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const search = useCallback(
    (query: string) => {
      if (!workingFolder) {
        setResults([]);
        return;
      }

      // Clear existing timer
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }

      // Debounce search
      searchTimerRef.current = setTimeout(async () => {
        setIsSearching(true);
        try {
          const searchResults = await searchFiles(workingFolder, query);
          setResults(searchResults);
          setSelectedIndex(0);
        } catch (err) {
          console.error("Failed to search files:", err);
          setResults([]);
        } finally {
          setIsSearching(false);
        }
      }, 150);
    },
    [workingFolder]
  );

  const selectNext = useCallback(() => {
    if (results.length > 0) {
      setSelectedIndex((prev) => (prev + 1) % results.length);
    }
  }, [results.length]);

  const selectPrevious = useCallback(() => {
    if (results.length > 0) {
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
    }
  }, [results.length]);

  const clearResults = useCallback(() => {
    setResults([]);
    setSelectedIndex(0);
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
  }, []);

  return {
    results,
    selectedIndex,
    isSearching,
    search,
    setSelectedIndex,
    selectNext,
    selectPrevious,
    clearResults,
  };
}
