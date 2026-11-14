import { useCallback, useEffect, useState, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  $createTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_ESCAPE_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_TAB_COMMAND,
  $isTextNode,
} from "lexical";
import { mergeRegister } from "@lexical/utils";
import { $createFileMentionNode } from "./FileMentionNode";
import { FileAutocomplete } from "../FileAutocomplete";
import { useFileSearch } from "../../hooks/useFileSearch";

interface FileMentionPluginProps {
  workingFolder: string | null;
}

export function FileMentionPlugin({ workingFolder }: FileMentionPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [isActive, setIsActive] = useState(false);
  const [query, setQuery] = useState("");
  const atPositionRef = useRef<{ key: string; offset: number } | null>(null);

  // Use the file search hook for backend calls
  const fileSearch = useFileSearch(workingFolder);

  // Check for @ trigger and extract query
  const checkForTrigger = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
        setIsActive(false);
        return;
      }

      const anchor = selection.anchor;
      const anchorNode = anchor.getNode();

      if (!$isTextNode(anchorNode)) {
        setIsActive(false);
        return;
      }

      const textContent = anchorNode.getTextContent();
      const cursorOffset = anchor.offset;
      const textBeforeCursor = textContent.slice(0, cursorOffset);

      // Find the last @ before cursor
      const lastAtIndex = textBeforeCursor.lastIndexOf("@");

      if (lastAtIndex === -1) {
        setIsActive(false);
        return;
      }

      // Check if there's whitespace between @ and cursor
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      if (textAfterAt.includes(" ") || textAfterAt.includes("\n")) {
        setIsActive(false);
        return;
      }

      // We're in an active mention
      setIsActive(true);
      atPositionRef.current = {
        key: anchorNode.getKey(),
        offset: lastAtIndex,
      };
      setQuery(textAfterAt);

      // Trigger search via hook
      fileSearch.search(textAfterAt);
    });
  }, [editor, fileSearch]);

  // Insert file mention node
  const insertMention = useCallback(
    (index: number) => {
      const results = fileSearch.results;
      if (index < 0 || index >= results.length) return;

      const selectedFile = results[index];

      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        const anchor = selection.anchor;
        const anchorNode = anchor.getNode();

        if (!$isTextNode(anchorNode) || !atPositionRef.current) return;

        const textContent = anchorNode.getTextContent();
        const atOffset = atPositionRef.current.offset;
        const cursorOffset = anchor.offset;

        // Split the text: before @, and after cursor
        const textBefore = textContent.slice(0, atOffset);
        const textAfter = textContent.slice(cursorOffset);

        // Create the file mention node with absolute path
        const absolutePath = selectedFile.path.startsWith("/")
          ? selectedFile.path
          : `${workingFolder}/${selectedFile.path}`;
        const mentionNode = $createFileMentionNode(absolutePath);

        // Replace the text node content
        if (textBefore) {
          anchorNode.setTextContent(textBefore);
          anchorNode.insertAfter(mentionNode);
        } else {
          anchorNode.replace(mentionNode);
        }

        // Add space and remaining text after mention
        const spaceNode = $createTextNode(" " + textAfter);
        mentionNode.insertAfter(spaceNode);

        // Move cursor after the space
        spaceNode.select(1, 1);
      });

      setIsActive(false);
      fileSearch.clearResults();
      setQuery("");
    },
    [editor, fileSearch, workingFolder]
  );

  // Listen to text changes
  useEffect(() => {
    if (!workingFolder) return;

    return editor.registerUpdateListener(({ editorState, prevEditorState }) => {
      // Only check if the editor state actually changed
      if (editorState !== prevEditorState) {
        checkForTrigger();
      }
    });
  }, [editor, checkForTrigger, workingFolder]);

  // Register keyboard commands
  useEffect(() => {
    if (!isActive) return;

    return mergeRegister(
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          setIsActive(false);
          fileSearch.clearResults();
          return true;
        },
        COMMAND_PRIORITY_HIGH
      ),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        () => {
          if (fileSearch.results.length > 0) {
            fileSearch.selectNext();
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_HIGH
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        () => {
          if (fileSearch.results.length > 0) {
            fileSearch.selectPrevious();
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_HIGH
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (fileSearch.results.length > 0) {
            event?.preventDefault();
            insertMention(fileSearch.selectedIndex);
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_HIGH
      ),
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (event) => {
          if (fileSearch.results.length > 0) {
            event?.preventDefault();
            insertMention(fileSearch.selectedIndex);
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_HIGH
      )
    );
  }, [editor, isActive, fileSearch, insertMention]);

  // Handle selection from dropdown
  const handleSelect = useCallback(
    (index: number) => {
      insertMention(index);
    },
    [insertMention]
  );

  if (!isActive || !workingFolder) return null;

  return (
    <FileAutocomplete
      results={fileSearch.results}
      selectedIndex={fileSearch.selectedIndex}
      onSelect={handleSelect}
      query={query}
    />
  );
}
