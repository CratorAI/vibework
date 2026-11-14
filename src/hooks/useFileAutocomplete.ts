import { useState, useCallback, useEffect, useRef } from "react";
import { searchFiles, FileSearchResult } from "../tauri/files";

export interface UseFileAutocompleteReturn {
  // Autocomplete state
  isActive: boolean;
  results: FileSearchResult[];
  selectedIndex: number;

  // Methods
  handleInputChange: (value: string, selectionStart: number | null) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
  selectResult: (index: number) => void;
  closeAutocomplete: () => void;

  // For positioning dropdown
  autocompleteQuery: string;
}

/**
 * Custom hook for file autocomplete with @ mentions
 */
export function useFileAutocomplete(
  workingFolder: string | null,
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  onInsertFile: (filePath: string) => void,
): UseFileAutocompleteReturn {
  const [isActive, setIsActive] = useState(false);
  const [results, setResults] = useState<FileSearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [autocompleteQuery, setAutocompleteQuery] = useState("");

  // Track @ position for insertion
  const atPositionRef = useRef<number>(0);

  // Debounce timer for search
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Search for files
  const performSearch = useCallback(async (query: string) => {
    if (!workingFolder) {
      setResults([]);
      return;
    }

    try {
      const searchResults = await searchFiles(workingFolder, query);
      setResults(searchResults);
      setSelectedIndex(0);
    } catch (err) {
      console.error("Failed to search files:", err);
      setResults([]);
    }
  }, [workingFolder]);

  // Handle input change to detect @ and update query
  const handleInputChange = useCallback((value: string, selectionStart: number | null) => {
    if (!workingFolder || selectionStart === null) {
      setIsActive(false);
      return;
    }

    // Find the @ before cursor
    const textBeforeCursor = value.slice(0, selectionStart);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    // Check if we're in an @ mention context
    if (lastAtIndex !== -1) {
      // Check if there's a space between @ and cursor (if so, not in mention)
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      if (textAfterAt.includes(" ") || textAfterAt.includes("\n")) {
        setIsActive(false);
        return;
      }

      // We're in an active @ mention
      setIsActive(true);
      atPositionRef.current = lastAtIndex;
      setAutocompleteQuery(textAfterAt);

      // Debounce search
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
      searchTimerRef.current = setTimeout(() => {
        performSearch(textAfterAt);
      }, 150);
    } else {
      setIsActive(false);
    }
  }, [workingFolder, performSearch]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!isActive || results.length === 0) {
      return false;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % results.length);
      return true;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
      return true;
    }

    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      selectResult(selectedIndex);
      return true;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setIsActive(false);
      return true;
    }

    return false;
  }, [isActive, results.length, selectedIndex]);

  // Select a result and insert it
  const selectResult = useCallback((index: number) => {
    if (!isActive || index < 0 || index >= results.length) {
      return;
    }

    const selectedFile = results[index];
    const textarea = textareaRef.current;
    if (!textarea) return;

    const value = textarea.value;
    const atPos = atPositionRef.current;
    const cursorPos = textarea.selectionStart || 0;

    // Replace @query with @filepath and add a space
    const before = value.slice(0, atPos);
    const after = value.slice(cursorPos);
    const newValue = `${before}@${selectedFile.path} ${after}`;

    // Insert the file
    onInsertFile(newValue);

    // Set cursor position after the inserted path and space
    const newCursorPos = atPos + 1 + selectedFile.path.length + 1;
    setTimeout(() => {
      textarea.setSelectionRange(newCursorPos, newCursorPos);
      textarea.focus();
    }, 0);

    // Close autocomplete
    setIsActive(false);
  }, [isActive, results, textareaRef, onInsertFile]);

  const closeAutocomplete = useCallback(() => {
    setIsActive(false);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  return {
    isActive,
    results,
    selectedIndex,
    handleInputChange,
    handleKeyDown,
    selectResult,
    closeAutocomplete,
    autocompleteQuery,
  };
}
