import { PersonalSkillsNotice } from "./PersonalSkillsNotice";
import { useLocation, useNavigate } from "react-router-dom";
import React, { useState, useRef, useEffect } from "react";
import { useAgentSessionsContext } from "../../contexts/AgentSessionsContext";
import { MessageInput } from "../MessageInput";
import { FolderDisclaimerModal } from "../FolderDisclaimerModal";
import { FolderPicker, FolderPickerAnchor } from "./FolderPicker";
import { HomeField } from "./HomeField";
import { openFolderPicker } from "@/tauri/files";
import { foldersStore, useFolders } from "@/stores/folders";
import { cancelHomeSend, noteHomeSend } from "@/lib/motion";
import { cn, pathBaseName } from "@/lib/utils";
import { usePickerRequest } from "@/stores/searchWindow";

/*
 * Vertical rhythm. The ruling starts under the titlebar band and draws a 1px
 * line at the bottom of every 32px band. The composer's top is snapped onto a
 * line near where today's layout put it (max(80px, 32vh − 22px) above the
 * heading), and the heading block (60px) plus its 28px gap sit above it.
 */
const ABOVE_COMPOSER = 88;
const COMPOSER_TOP = `calc(round(nearest, max(80px, 32vh - 22px) + ${ABOVE_COMPOSER - 31}px, 32px) + 31px)`;

/** Home: a heading that names the folder, the composer (the focal element) on a ruled sheet. */
export const HomeView: React.FC = () => {
  const { startNewConversation, pendingWorkingFolder, setPendingWorkingFolder } = useAgentSessionsContext();
  const folders = useFolders();
  const [isLoading, setIsLoading] = useState(false);
  const [prefilledPrompt, setPrefilledPrompt] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  // A folder from the native dialog waits here for consent
  const [consentPath, setConsentPath] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const [starterKey, setStarterKey] = useState('default');
  useEffect(() => {
    const starter = location.state?.artifactStarter;
    if (typeof starter !== 'string' || !starter) return;
    setPrefilledPrompt(starter);
    setStarterKey(location.key);
    // Consume the hand-off so returning Home never reapplies an old starter.
    navigate('/', { replace: true, state: null });
  }, [location.key, location.state, navigate]);
  const inputRef = useRef<HTMLDivElement>(null);

  // Home starts in the folder last chosen here (none if the user started
  // without one); a new task clears the pending folder, so put it back
  useEffect(() => {
    if (folders.loaded && !pendingWorkingFolder && folders.homeFolder) setPendingWorkingFolder(folders.homeFolder);
  }, [folders.loaded, folders.homeFolder, pendingWorkingFolder, setPendingWorkingFolder]);
  const folder = pendingWorkingFolder;
  // The search window's "Change folder"
  usePickerRequest("home-folder-picker", () => setPickerOpen(true));

  const applyFolder = (path: string | null) => {
    setPendingWorkingFolder(path);
    void foldersStore.setHome(path);
    if (path) void foldersStore.noteUsed(path);
  };

  // A recent folder was allowed when it was first chosen; one from the
  // native dialog asks first
  const chooseOther = async () => {
    try {
      const path = await openFolderPicker();
      if (path) setConsentPath(path);
    } catch (error) {
      console.error("Failed to open folder picker:", error);
    }
  };

  const handleSend = async (text: string) => {
    // The conversation's composer travels from where this one sits
    noteHomeSend(inputRef.current);
    setIsLoading(true);
    setPrefilledPrompt("");
    const startedIn = folder;
    try {
      await startNewConversation(text);
      if (startedIn) void foldersStore.noteUsed(startedIn);
    } catch (error) {
      console.error("Failed to start new conversation:", error);
      cancelHomeSend();
      setIsLoading(false);
      throw error;
    }
  };

  // While the first message is on its way, everything but the composer steps
  // back, so the hand-off to the conversation reads as the composer leaving.
  const recede = cn(
    "transition-[opacity,translate] duration-150 ease-(--ease-out)",
    isLoading && "pointer-events-none -translate-y-1 opacity-0",
  );

  const handleInterrupt = async () => {
    // No-op for home view since there's no active session to interrupt
  };

  const quietLine =
    "rounded-sm text-sm leading-5 text-foreground-secondary transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 cursor-pointer";

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto" data-testid="home">
      {/* Behind the composer: a faint drifting field of characters. With
          "reduce motion" on, the still ruled sheet stands in for it. */}
      <HomeField className="pointer-events-none absolute inset-x-0 top-(--titlebar-height) h-[max(600px,calc(100%-var(--titlebar-height)))] w-full text-foreground motion-reduce:hidden" />
      <div
        aria-hidden
        className="home-ruling pointer-events-none absolute inset-x-0 top-(--titlebar-height) hidden h-[max(600px,calc(100%-var(--titlebar-height)))] motion-reduce:block"
        style={{ "--composer-top": COMPOSER_TOP } as React.CSSProperties}
        data-testid="home-ruling"
      />
      <div
        className="relative mx-auto w-full max-w-[768px] px-6 pb-16"
        style={{ paddingTop: `calc(var(--titlebar-height) + ${COMPOSER_TOP} - ${ABOVE_COMPOSER}px)` }}
      >
        <div className={cn("flex flex-col items-center gap-2 text-center", recede)}>
          <FolderPicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            current={folder}
            onChoose={applyFolder}
            onChooseOther={chooseOther}
            onChooseNew={setConsentPath}
            returnFocus={() => document.querySelector<HTMLElement>('[data-testid="home-folder"], [data-testid="home-folder-pick"]')}
          >
            {folder ? (
              <>
                <h1 className="text-[26px] leading-8 font-medium tracking-[-0.015em] text-foreground">
                  What should we get done in{" "}
                  <FolderPickerAnchor asChild>
                    <button
                      type="button"
                      onClick={() => setPickerOpen((o) => !o)}
                      aria-haspopup="listbox"
                      aria-expanded={pickerOpen}
                      title={folder}
                      data-testid="home-folder"
                      className={cn(
                        "cursor-pointer rounded-sm underline decoration-[1.5px] underline-offset-[5px] transition-[text-decoration-color] outline-none hover:decoration-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                        pickerOpen ? "decoration-foreground" : "decoration-faint",
                      )}
                    >
                      {pathBaseName(folder)}
                    </button>
                  </FolderPickerAnchor>
                  ?
                </h1>
                <button
                  type="button"
                  className={quietLine}
                  onClick={() => {
                    applyFolder(null);
                    // The line becomes "or pick a folder"; keep focus on it
                    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="home-folder-pick"]')?.focus());
                  }}
                  data-testid="home-folder-clear"
                >
                  or start without a folder
                </button>
              </>
            ) : (
              <>
                <h1 className="text-[26px] leading-8 font-medium tracking-[-0.015em] text-foreground">
                  What would you like to get done?
                </h1>
                <FolderPickerAnchor asChild>
                  <button
                    type="button"
                    className={cn(quietLine, pickerOpen && "text-foreground")}
                    onClick={() => setPickerOpen((o) => !o)}
                    aria-haspopup="listbox"
                    aria-expanded={pickerOpen}
                    data-testid="home-folder-pick"
                  >
                    or pick a folder
                  </button>
                </FolderPickerAnchor>
              </>
            )}
          </FolderPicker>
        </div>

        <div ref={inputRef} className="mt-7">
          <PersonalSkillsNotice />
        <MessageInput
            key={starterKey}
            layout="home"
            onSend={handleSend}
            onInterrupt={handleInterrupt}
            isLoading={isLoading}
            initialValue={prefilledPrompt}
            placeholder="Describe a task, or drop in files…"
          />
        </div>
      </div>

      {consentPath && (
        <FolderDisclaimerModal
          folderPath={consentPath}
          onAcknowledge={() => {
            applyFolder(consentPath);
            setConsentPath(null);
          }}
          onCancel={() => setConsentPath(null)}
        />
      )}
    </div>
  );
};
