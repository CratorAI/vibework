import React from "react";
import { File, Folder } from "@/lib/icons";
import { FileSearchResult } from "../tauri/files";

interface FileAutocompleteProps {
  results: FileSearchResult[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  query: string;
}

export const FileAutocomplete: React.FC<FileAutocompleteProps> = ({
  results,
  selectedIndex,
  onSelect,
  query,
}) => {
  if (results.length === 0) {
    return (
      <div className="absolute bottom-full left-0 z-50 mb-2 w-full max-w-md rounded-lg bg-popover p-3 text-popover-foreground shadow-md ring-1 ring-foreground/10">
        <div className="text-center text-meta text-muted-foreground">
          {query ? "No files found" : "Start typing to search files..."}
        </div>
      </div>
    );
  }

  const kbdClass =
    "rounded border bg-muted px-1 py-px font-sans text-meta text-muted-foreground";

  return (
    <div className="absolute bottom-full left-0 z-50 mb-2 flex max-h-72 w-full max-w-md flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10">
      <div className="min-h-0 max-h-64 overflow-y-auto p-1">
        {results.map((result, index) => {
          const isSelected = index === selectedIndex;
          const IconComponent = result.isDirectory ? Folder : File;

          // Extract just the filename for display
          const fileName = result.path.split("/").pop() || result.path;

          return (
            <button
              key={result.path}
              type="button"
              onClick={() => onSelect(index)}
              className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-ui transition-colors ${
                isSelected
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground hover:bg-accent/60"
              }`}
            >
              <IconComponent className="size-4 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{fileName}</span>
                <span className="truncate text-meta text-muted-foreground">
                  {result.path}
                </span>
              </div>
              {result.isDirectory && (
                <span className="shrink-0 text-meta text-muted-foreground">/</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="border-t px-3 py-1.5">
        <div className="text-meta text-muted-foreground">
          <kbd className={kbdClass}>↑↓</kbd> to navigate,{" "}
          <kbd className={kbdClass}>↵</kbd> to select,{" "}
          <kbd className={kbdClass}>Esc</kbd> to close
        </div>
      </div>
    </div>
  );
};
