import React, { useCallback, useEffect } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  EditorState,
  COMMAND_PRIORITY_LOW,
  KEY_ENTER_COMMAND,
  CLEAR_EDITOR_COMMAND,
  $isElementNode,
} from "lexical";
import { ClearEditorPlugin } from "@lexical/react/LexicalClearEditorPlugin";
import {
  FileMentionNode,
  $isFileMentionNode,
} from "./FileMentionNode";
import { FileMentionPlugin } from "./FileMentionPlugin";
import { SkillNode, $isSkillNode } from "./SkillNode";
import { SkillCommandPlugin } from "./SkillCommandPlugin";
import { cn } from "@/lib/utils";
import { restoreEditorDraft } from "./draft";

interface MentionEditorProps {
  workingFolder: string | null;
  placeholder?: string;
  disabled?: boolean;
  onSubmit: (sendNow?: boolean) => void;
  onContentChange: (hasContent: boolean) => void;
  editorRef?: React.MutableRefObject<EditorHandle | null>;
  /**
   * One line tall when empty, growing with its content up to a cap and then
   * scrolling (the conversation composer). Default: the roomier home editor.
   */
  compact?: boolean;
}

export interface EditorHandle {
  clear: () => void;
  getSerializedContent: () => string;
  focus: () => void;
  insertText: (text: string) => void;
  /** The draft as it stands (opaque), to put back if sending it fails */
  snapshot: () => unknown;
  restore: (snapshot: unknown) => void;
  isEmpty: () => boolean;
}

const theme = {
  paragraph: "mb-0",
  text: {
    base: "",
  },
};

function onError(error: Error) {
  console.error("Lexical error:", error);
}

// Plugin to handle Enter key for submit
function SubmitOnEnterPlugin({
  onSubmit,
  disabled,
}: {
  onSubmit: (sendNow?: boolean) => void;
  disabled?: boolean;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event: KeyboardEvent | null) => {
        if (disabled) return false;

        // Allow shift+enter for newlines
        if (event?.shiftKey) {
          return false;
        }

        event?.preventDefault();
        onSubmit(!!(event?.metaKey || event?.ctrlKey));
        return true;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor, onSubmit, disabled]);

  return null;
}

// Plugin to expose editor handle to parent
function EditorHandlePlugin({
  editorRef,
}: {
  editorRef?: React.MutableRefObject<EditorHandle | null>;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editorRef) return;

    editorRef.current = {
      clear: () => {
        editor.dispatchCommand(CLEAR_EDITOR_COMMAND, undefined);
      },
      getSerializedContent: () => {
        let content = "";
        editor.getEditorState().read(() => {
          const root = $getRoot();
          const children = root.getChildren();

          for (const paragraph of children) {
            if ($isElementNode(paragraph)) {
              const paragraphChildren = paragraph.getChildren();
              for (const node of paragraphChildren) {
                if ($isFileMentionNode(node)) {
                  content += `<vibe-work-file>${node.getFilePath()}</vibe-work-file>`;
                } else if ($isSkillNode(node)) {
                  content += `<vibe-work-skill>${node.getSkillId()}</vibe-work-skill>`;
                } else {
                  content += node.getTextContent();
                }
              }
            } else {
              content += paragraph.getTextContent();
            }
            // Add newline between paragraphs (except last one)
            if (paragraph !== children[children.length - 1]) {
              content += "\n";
            }
          }
        });
        return content;
      },
      focus: () => {
        editor.focus();
      },
      snapshot: () => editor.getEditorState().toJSON(),
      restore: (snapshot) => {
        restoreEditorDraft(editor, snapshot);
      },
      isEmpty: () => editor.getEditorState().read(() => $getRoot().getTextContent().trim() === ""),
      insertText: (text: string) => {
        editor.update(() => {
          const root = $getRoot();
          const selection = $getSelection();

          if ($isRangeSelection(selection)) {
            // Insert at current selection/cursor
            selection.insertText(text);
          } else {
            // Append to end if no selection
            const lastChild = root.getLastChild();
            if (lastChild && $isElementNode(lastChild)) {
              lastChild.selectEnd();
              const newSelection = $getSelection();
              if ($isRangeSelection(newSelection)) {
                newSelection.insertText(text);
              }
            }
          }
        });
        editor.focus();
      },
    };
  }, [editor, editorRef]);

  return null;
}

// Plugin to track content changes
function ContentChangePlugin({
  onContentChange,
}: {
  onContentChange: (hasContent: boolean) => void;
}) {
  const onChange = useCallback(
    (editorState: EditorState) => {
      editorState.read(() => {
        const root = $getRoot();
        const textContent = root.getTextContent().trim();
        onContentChange(textContent.length > 0);
      });
    },
    [onContentChange]
  );

  return <OnChangePlugin onChange={onChange} />;
}

// Custom placeholder component
function Placeholder({ text, faint }: { text: string; faint?: boolean }) {
  return (
    <div className={cn("pointer-events-none absolute inset-x-0 top-0 truncate select-none", faint ? "text-faint" : "text-muted-foreground")}>
      {text}
    </div>
  );
}

export function MentionEditor({
  workingFolder,
  placeholder = "How can I help you today?",
  disabled = false,
  onSubmit,
  onContentChange,
  editorRef,
  compact = false,
}: MentionEditorProps) {
  const initialConfig = {
    namespace: "MentionEditor",
    theme,
    onError,
    nodes: [FileMentionNode, SkillNode],
    editable: !disabled,
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      {/* Home (not compact): 15/24 type, as the design's home composer */}
      <div className={cn("relative w-full", compact ? "min-h-0 text-sm leading-relaxed" : "min-h-12 text-prose leading-6")}>
        <PlainTextPlugin
          contentEditable={
            <ContentEditable
              aria-label={placeholder}
              className={cn(
                "w-full resize-none border-0 bg-transparent text-foreground focus:outline-none focus:ring-0 overflow-y-auto",
                compact ? "max-h-[200px] min-h-[22px]" : "min-h-[24px] max-h-[220px]",
              )}
              style={{ outline: "none" }}
            />
          }
          placeholder={<Placeholder text={placeholder} faint={!compact} />}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <ClearEditorPlugin />
        <FileMentionPlugin workingFolder={workingFolder} />
        <SkillCommandPlugin side={compact ? "top" : "bottom"} />
        <SubmitOnEnterPlugin onSubmit={onSubmit} disabled={disabled} />
        <EditorHandlePlugin editorRef={editorRef} />
        <ContentChangePlugin onContentChange={onContentChange} />
        <DisabledPlugin disabled={disabled} />
      </div>
    </LexicalComposer>
  );
}

// Plugin to handle disabled state
function DisabledPlugin({ disabled }: { disabled: boolean }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  return null;
}
