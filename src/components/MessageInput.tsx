import { useTaskInbox, type QueuedMessage } from "@/hooks/useTaskInbox";
import { QueuedMessages } from "./QueuedMessages";
import { useExternalStatus } from "@/hooks/useExternalStatus";
import { invoke } from "@tauri-apps/api/core";
import { withChord } from "@/lib/shortcuts";
import { PermissionModePicker } from "./PermissionModePicker";
import React, { useState, useRef, useEffect } from "react";
import { Plus, Square, ArrowUp } from "@/lib/icons";
import { openFolderPicker } from "../tauri/files";
import { CHOOSE_TASK_FOLDER_EVENT } from "./workspace/files/events";
import { toast } from "sonner";
import { AttachmentList } from "./AttachmentChip";
import { TodoProgressRibbon } from "./TodoProgressRibbon";
import { FolderDisclaimerModal } from "./FolderDisclaimerModal";
import { ModelPicker } from "./ModelPicker";
import { useAttachments } from "../hooks/useAttachments";
import { useWorkingFolder } from "../hooks/useWorkingFolder";
import { MentionEditor, EditorHandle } from "./editor";
import type { AgentState, TodoItem } from "../types/agent";
import { switchModel, getModel } from "../tauri/agent";
import { useAgentSessionsContext } from "../contexts/AgentSessionsContext";
import { useModels } from "../contexts/ModelsContext";
import { cn, errorMessage } from "@/lib/utils";
import { foldersStore } from "@/stores/folders";
import { useArrival } from "@/lib/motion";

interface MessageInputProps {
  sessionId?: string;
  onSend: (text: string) => Promise<void>;
  onInterrupt: () => Promise<void>;
  isLoading: boolean;
  initialValue?: string;
  placeholder?: string;
  agentState?: AgentState;
  todos?: TodoItem[];
  bottomSlot?: React.ReactNode;
  /**
   * "home": home composer, with the model picker opening downward.
   * "docked": conversation composer: a one-line field that grows, with the
   * other controls on a quiet row beneath it.
   */
  layout?: "home" | "docked";
  /**
   * A permission prompt or a question that takes the message box's place
   * while it waits. The draft and attachments stay underneath, untouched,
   * and come back when it is answered. `key` changes per request.
   */
  prompt?: { key: string; node: React.ReactNode } | null;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  sessionId,
  onSend,
  onInterrupt,
  isLoading,
  initialValue,
  placeholder = "Reply, or ask for something new…",
  agentState,
  todos = [],
  bottomSlot,
  layout = "docked",
  prompt = null,
}) => {
  const { pendingPermissionMode, setPendingPermissionMode, pendingModel, setPendingModel, sessions, refreshSessions } = useAgentSessionsContext();
  const { defaultModel } = useModels();
  const [hasEditorContent, setHasEditorContent] = useState(false);
  // Model of the existing session (only used when sessionId is set)
  const [externalStatus, clearExternalStatus] = useExternalStatus(sessionId);
  const [sessionModel, setSessionModel] = useState<string | null>(null);
  const [permissionMode, setPermissionMode] = useState<string | null>(null);
  useEffect(()=>{
    let cancelled=false;
    const refresh=()=>invoke<string>("agent_get_permission_mode",{sessionId:sessionId??null}).then(mode=>{
      if(!cancelled) setPermissionMode((!sessionId&&pendingPermissionMode)||mode);
    }).catch(()=>{});
    void refresh();
    window.addEventListener("permission-default-changed",refresh);
    return ()=>{cancelled=true;window.removeEventListener("permission-default-changed",refresh);};
  },[sessionId,pendingPermissionMode]);
  const changePermissionMode=async(mode:string)=>{
    try {
      if(sessionId) await invoke("agent_set_permission_mode",{sessionId,mode});
      else setPendingPermissionMode(mode);
      setPermissionMode(mode);
    } catch(error){toast.error(errorMessage(error,"Could not change permission mode"));}
  };
  const editorRef = useRef<EditorHandle | null>(null);
  const inbox = useTaskInbox(sessionId);

  // Prefill editor when initialValue changes
  useEffect(() => {
    if (initialValue && editorRef.current) {
      editorRef.current.clear();
      editorRef.current.insertText(initialValue);
      editorRef.current.focus();
    }
  }, [initialValue]);

  // Load the session's model when the session changes
  useEffect(() => {
    if (!sessionId) {
      setSessionModel(null);
      return;
    }
    let cancelled = false;
    getModel(sessionId)
      .then((modelId) => {
        if (!cancelled) setSessionModel(modelId);
      })
      .catch((error) => {
        console.error("Failed to load session model:", error);
        if (!cancelled) setSessionModel(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, isLoading]);

  // Existing session: its own model. New conversation: the pending choice, else the default.
  const currentModel = sessionId ? sessionModel : pendingModel ?? defaultModel;

  // Working folder state. Home chooses its folder in the heading; in a task
  // the folder control sits on the row beneath the message box.
  const { workingFolder, confirmFolder } = useWorkingFolder(sessionId);
  // A task started without a folder works in the default location; it shows
  // "Work in a folder" and can still be given one
  const chosenFolder = sessionId
    ? (sessions.find((s) => s.sessionId === sessionId)?.workingFolder ?? null)
    : workingFolder;
  const [showFolderDisclaimer, setShowFolderDisclaimer] = useState(false);
  const [pendingFolderPath, setPendingFolderPath] = useState<string | null>(null);

  const handleFolderSelect = async () => {
    if (chosenFolder) {
      toast.info("You can only have one working folder per task to keep your files safe. Start a new task to work in a different folder.");
      return;
    }
    try {
      const path = await openFolderPicker();
      if (path) {
        setPendingFolderPath(path);
        setShowFolderDisclaimer(true);
      }
    } catch (error) {
      console.error("Failed to open folder picker:", error);
      toast.error("Couldn’t open the folder picker. Try again.");
    }
  };

  // The Files tab's "Choose a folder" runs this same flow for the task on screen
  const handleFolderSelectRef = useRef(handleFolderSelect);
  handleFolderSelectRef.current = handleFolderSelect;
  useEffect(() => {
    if (!sessionId) return;
    const onChoose = (e: Event) => {
      if ((e as CustomEvent<{ sessionId?: string }>).detail?.sessionId === sessionId) void handleFolderSelectRef.current();
    };
    window.addEventListener(CHOOSE_TASK_FOLDER_EVENT, onChoose);
    return () => window.removeEventListener(CHOOSE_TASK_FOLDER_EVENT, onChoose);
  }, [sessionId]);

  const handleFolderAcknowledge = async () => {
    if (pendingFolderPath) {
      await confirmFolder(pendingFolderPath);
      void foldersStore.noteUsed(pendingFolderPath);
      void refreshSessions();
    }
    setShowFolderDisclaimer(false);
    setPendingFolderPath(null);
  };

  const handleFolderCancel = () => {
    setShowFolderDisclaimer(false);
    setPendingFolderPath(null);
  };

  const {
    attachments,
    isDragging,
    addFiles,
    removeAttachment,
    clearAttachments,
    restoreAttachments,
  } = useAttachments();

  const handleSend = async (sendNow = false) => {
    if (sendNow && prompt) { toast.info("Answer the pending prompt first."); return; }
    const editorContent = editorRef.current?.getSerializedContent() || "";
    if (!editorContent.trim() && attachments.length === 0) return;

    // Build message with attachment tags
    let message = "";

    // Add attachment tags first
    for (const attachment of attachments) {
      message += `<vibe-work-attachment>${attachment.path}</vibe-work-attachment>\n`;
    }

    // Add the editor content (includes file mention tags)
    if (editorContent.trim()) {
      message += editorContent.trim();
    }

    // Cleared at once, so whatever is typed while the message goes out is
    // the next draft; put back if sending fails
    const snapshot = editorRef.current?.snapshot();
    const sentAttachments = attachments;
    editorRef.current?.clear();
    clearAttachments();
    setHasEditorContent(false);
    try {
      if (sessionId && (isLoading || prompt)) await inbox.enqueue(message, { snapshot, attachments: sentAttachments }, sendNow);
      else await onSend(message);
    } catch (error) {
      if (snapshot !== undefined && editorRef.current?.isEmpty()) editorRef.current.restore(snapshot);
      restoreAttachments(sentAttachments);
      console.warn("Message send failed", error);
      toast.error("Could not send the message. Your draft is still here.");
    }
  };

  const queueAction = async (item: QueuedMessage, action: 'send' | 'edit' | 'remove') => {
    if (action === 'edit' && (hasEditorContent || attachments.length)) { toast.info('Send or clear your draft before editing a queued message.'); return; }
    const original = await inbox.action(item.id, action);
    if (action === 'edit') {
      if (original.draft?.snapshot !== undefined) editorRef.current?.restore(original.draft.snapshot);
      else editorRef.current?.insertText(original.text);
      if (original.draft?.attachments) restoreAttachments(original.draft.attachments as typeof attachments);
      editorRef.current?.focus();
    }
  };

  // Handle model selection
  const handleModelSelect = async (modelId: string) => {
    if (!sessionId) {
      // No session yet - applies to the next new conversation
      setPendingModel(modelId);
      return;
    }
    const previous = sessionModel;
    setSessionModel(modelId);
    try {
      await switchModel(modelId, sessionId);
      await refreshSessions();
    } catch (error) {
      console.error("Failed to switch model:", error);
      setSessionModel(previous);
      toast.error(errorMessage(error, "Could not switch model"));
    }
  };

  const hasContent = hasEditorContent || attachments.length > 0;
  const isHome = layout === "home";
  const promptKey = prompt?.key ?? null;
  // The prompt rises in when it arrives while the user watches (not when the
  // task is opened on it); the next queued request swaps in the same way
  const promptArrived = useArrival(promptKey, sessionId ?? layout);
  // Answered: the message box comes back, and so does the caret if the
  // prompt had it
  const cardRef = useRef<HTMLDivElement>(null);
  const hadPrompt = useRef(false);
  useEffect(() => {
    if (promptKey) {
      hadPrompt.current = true;
      return;
    }
    if (!hadPrompt.current) return;
    hadPrompt.current = false;
    const active = document.activeElement;
    if (!active || active === document.body || cardRef.current?.contains(active)) {
      editorRef.current?.focus();
    }
  }, [promptKey]);
  // Send and stop morph into each other when the turn starts or ends here,
  // not when the composer first appears
  const sendIconMorphs = useArrival(isLoading ? "stop" : "send", sessionId ?? layout);

  const modelControl = (
    <ModelPicker
      value={currentModel}
      onSelect={handleModelSelect}
      disabled={isHome && (isLoading || !!prompt)}
      align="end"
      side={isHome ? "bottom" : "top"}
      className={isHome ? "font-medium" : undefined}
      answersSearch
    />
  );


  const modeControl = permissionMode !== null ? <PermissionModePicker value={permissionMode} onChange={changePermissionMode} side={isHome?"bottom":"top"}/> : null;

  const attachControl = (
    <button
      type="button"
      onClick={addFiles}
      disabled={isHome && (isLoading || !!prompt)}
      className="pressable flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[color,background-color,scale] outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
      title="Attach files"
      aria-label="Attach files"
    >
      <Plus className="size-[18px]" />
    </button>
  );

  const sendControl = (
    <button
      onClick={isLoading ? onInterrupt : () => void handleSend()}
      disabled={!isLoading && !hasContent}
      className={cn(
        "pressable flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-[color,background-color,scale] outline-none hover:bg-primary/85 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground",
        isHome && "ml-1.5",
      )}
      aria-label={isLoading ? "Stop" : "Send message"}
      title={isLoading ? withChord("Stop", "stop") : "Send"}
    >
      {isLoading ? (
        <Square key="stop" className={cn("size-3.5", sendIconMorphs && "motion-icon-swap")} fill="currentColor" />
      ) : (
        <ArrowUp key="send" strokeWidth={2.5} className={cn("size-4", sendIconMorphs && "motion-icon-swap")} />
      )}
    </button>
  );

  // Attachments sit above the text, inset like it (16px), with 12px
  // between the row and the text
  // Home: 64px tiles 12px from the top; the conversation's box: 56px, 16px
  const attachmentChips = attachments.length > 0 && (
    <AttachmentList
      attachments={attachments}
      onRemove={removeAttachment}
      size={isHome ? "lg" : "md"}
      className={cn("flex-shrink-0 overflow-y-auto px-4 scrollbar-hide", isHome ? "max-h-[152px] pt-3" : "max-h-[136px] pt-4")}
    />
  );

  const editor = (
    <MentionEditor
      workingFolder={workingFolder}
      placeholder={
        isDragging ? "Drop files here…" : !isHome && (isLoading || prompt) ? "Queue a message, or ⌘↵ to send now" : placeholder
      }
      onSubmit={handleSend}
      onContentChange={setHasEditorContent}
      editorRef={editorRef}
      compact={!isHome}
    />
  );

  const cardClass = cn(
    "relative z-8 flex flex-col rounded-[16px] bg-card shadow-lifted transition-[box-shadow,background-color] focus-within:ring-1 focus-within:ring-foreground/15",
    isDragging && "bg-info-muted outline-2 -outline-offset-2 outline-dashed outline-info",
  );

  // While a prompt waits it takes the box's place; the draft stays mounted
  // (hidden) so nothing typed or attached is lost
  const promptPane = prompt && (
    <div key={prompt.key} className={cn(promptArrived && "motion-arrive")} data-testid="docked-prompt">
      {prompt.node}
    </div>
  );

  return (
    <div className="@container max-w-full">
      {/* Plan progress and "Working"; the docked prompt speaks for itself */}
      {/* Queued messages sit above the ribbon, which tucks under the message box */}
      {!isHome && <QueuedMessages items={inbox.items} waiting={!!prompt} onAction={queueAction} />}
      {!prompt && <TodoProgressRibbon todos={todos} agentState={agentState} />}
      {externalStatus?.message && externalStatus.retry && <div role="status" className="px-3 py-2 text-meta text-muted-foreground">{externalStatus.message}{externalStatus.retry && <button className="ml-2 underline" onClick={() => {clearExternalStatus(); void invoke("agent_retry_external", {sessionId}).catch(e => toast.error(String(e)));}}>Retry</button>}</div>}
      {isHome ? (
        // Home: the composer is the focal element, roomy, with its controls inside
        <div ref={cardRef} className={cn(cardClass, "min-h-[128px] max-h-[360px]")} data-testid="composer">
          {promptPane}
          <div className={cn("flex min-h-[128px] flex-1 flex-col", prompt && "hidden")}>
          {attachmentChips}
          {/* Text sits 18px in, 16px down (12px under attachments) */}
          <div className={cn("min-h-0 flex-1 overflow-visible px-[18px]", attachments.length > 0 ? "pt-3" : "pt-4")}>{editor}</div>
          <div className="mt-auto flex min-h-11 flex-shrink-0 items-center justify-between gap-2 px-3 pt-3 pb-3">
            <div className="flex min-w-0 flex-1 items-center gap-0.5">
              {attachControl}
            </div>
            <div className="flex min-w-0 shrink items-center gap-0.5">
              {modelControl}
              {modeControl}
              {sendControl}
            </div>
          </div>
          </div>
        </div>
      ) : (
        // Conversation: a one-line field that grows with the draft, send/stop
        // inside it, and the other controls on a quiet row beneath
        <>
          <div ref={cardRef} className={cardClass} data-testid="composer">
            {promptPane}
            <div>
              {attachmentChips}
              <div className="flex items-end gap-2 py-2 pr-2 pl-4">
                <div className="min-w-0 flex-1 py-[4.5px]">{editor}</div>
                {sendControl}
              </div>
            </div>
          </div>
          <div className="mt-1 flex h-8 items-center justify-between gap-2" data-testid="composer-controls">
            {/* Narrow: the folder keeps its icon and the model's name truncates, never overlapping */}
            <div className="-ml-1 flex min-w-0 shrink-[3] items-center gap-0.5 overflow-hidden">
              {attachControl}
            </div>
            <div className="-mr-1 flex min-w-0 flex-1 items-center justify-end gap-0.5 overflow-hidden">
              {modelControl}
              {modeControl}
            </div>
          </div>
        </>
      )}

      {/* Bottom slot - optional content below the input */}
      {bottomSlot}

      {/* Folder disclaimer modal - only in render tree when needed */}
      {showFolderDisclaimer && pendingFolderPath && (
        <FolderDisclaimerModal
          folderPath={pendingFolderPath}
          onAcknowledge={handleFolderAcknowledge}
          onCancel={handleFolderCancel}
        />
      )}
    </div>
  );
};
