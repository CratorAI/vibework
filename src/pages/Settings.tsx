import { invoke } from "@tauri-apps/api/core";
import { withChord } from "@/lib/shortcuts";
import { shortcutsSheet } from "@/stores/shortcutsSheet";
import { PermissionModePicker } from "@/components/PermissionModePicker";
import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { EASE_DRAWER, prefersReducedMotion } from "@/lib/motion";
import { useProviderKey } from "../hooks/useProviderKey";
import { useSettings } from "../hooks/useSettings";
import { useModels } from "../contexts/ModelsContext";
import { openFolderPicker, openUrl } from "../tauri/files";
import { OPENROUTER_KEYS_URL } from "../tauri/byok";
import { ModelPicker } from "@/components/ModelPicker";
import { RemoveKeyDialog } from "@/components/RemoveKeyDialog";
import { ProviderMark } from "@/components/ProviderMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import {
  BarChart,
  ExternalLink,
  FolderOpen,
  Globe,
  Plug,
  Settings as SettingsIcon,
  BookOpen,
  LucideIcon,
} from "@/lib/icons";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { SettingsLocationState, SettingsTab } from "@/lib/settingsNav";
import { UpdatesSettings } from "@/components/settings/UpdatesSettings";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { UsageSettings } from "@/components/settings/UsageSettings";
import { cn, errorMessage } from "@/lib/utils";
import { ConnectorsSettings } from "@/components/settings/ConnectorsSettings";
import { WebSettings } from "@/components/settings/WebSettings";
import { SkillsSettings } from "@/components/settings/SkillsSettings";
import {
  SettingsPageHeader,
  SettingsSectionHeading,
  settingsCardClass,
  settingsRowClass,
} from "@/components/settings/settingsUi";

const NAV_ITEMS: { id: SettingsTab; label: string; icon: LucideIcon }[] = [
  { id: "general", label: "General", icon: SettingsIcon },
  { id: "usage", label: "Usage", icon: BarChart },
  { id: "connectors", label: "Connectors", icon: Plug },
  { id: "web", label: "Web", icon: Globe },
  { id: "skills", label: "Skills", icon: BookOpen },
];

function isSettingsTab(value: string | null): value is SettingsTab {
  return NAV_ITEMS.some((item) => item.id === value);
}

/**
 * Settings: a large dialog over the app, opened at #/settings?tab=…
 * Escape, the close button and a click on the scrim close it, and focus goes
 * back to whatever opened it.
 */
export const Settings: React.FC = () => {
  const [defaultPermissionMode,setDefaultPermissionMode]=useState<string|null>(null);
  useEffect(()=>{invoke<string>("agent_get_permission_mode",{sessionId:null}).then(setDefaultPermissionMode).catch(()=>{});},[]);
  const changeDefaultPermissionMode=async(mode:string)=>{
    try {await invoke("agent_set_permission_mode",{sessionId:null,mode});setDefaultPermissionMode(mode);window.dispatchEvent(new Event("permission-default-changed"));}
    catch(error){toast.error(errorMessage(error,"Could not save default permission mode"));}
  };
  const navigate = useNavigate();
  const location = useLocation();
  // Whatever had focus when Settings opened gets it back on close
  const returnFocusRef = useRef<Element | null>(document.activeElement);
  // Closing lets the dialog play its (short) exit before the route changes
  const [open, setOpen] = useState(true);
  const close = () => {
    if (!open) return;
    setOpen(false);
    const leave = () => {
      if ((location.state as SettingsLocationState | null)?.settingsFromApp) navigate(-1);
      else navigate("/", { replace: true });
    };
    if (prefersReducedMotion()) leave();
    else window.setTimeout(leave, 130);
  };

  const { keyHint, connect } = useProviderKey();
  const { defaultModel, setDefaultModel } = useModels();
  const {
    notificationsEnabled,
    setNotificationsEnabled,
    defaultWorkingDirectory,
    setDefaultWorkingDirectory,
    appVersion,
  } = useSettings();
  // The tab lives in the URL (#/settings?tab=connectors) so other screens can link to it
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: SettingsTab = isSettingsTab(tabParam) ? tabParam : "general";
  const setActiveTab = (tab: SettingsTab) => {
    setSearchParams(tab === "general" ? {} : { tab }, { replace: true, state: location.state });
  };

  // Replace-key inline form
  const [isReplacing, setIsReplacing] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [isCheckingKey, setIsCheckingKey] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const closeReplaceForm = () => {
    setIsReplacing(false);
    setNewKey("");
    setKeyError(null);
  };

  const handleReplaceKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCheckingKey || !newKey.trim()) return;
    setKeyError(null);
    setIsCheckingKey(true);
    try {
      await connect(newKey);
      closeReplaceForm();
      toast.success("OpenRouter key replaced");
    } catch (err) {
      setKeyError(errorMessage(err, "Could not verify the key with OpenRouter."));
    } finally {
      setIsCheckingKey(false);
    }
  };

  const handleDefaultModel = async (modelId: string) => {
    try {
      await setDefaultModel(modelId);
    } catch (err) {
      toast.error(errorMessage(err, "Could not save the default model"));
    }
  };

  const handleSelectDirectory = async () => {
    const folder = await openFolderPicker();
    if (folder) {
      await setDefaultWorkingDirectory(folder);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent
        className="flex h-[min(760px,calc(100vh-48px))] w-[min(1040px,calc(100vw-48px))] max-w-none gap-0 p-0"
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => {
          // Start on the open tab in the nav, not the first button
          const current = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('nav [aria-current="page"]');
          if (current) {
            e.preventDefault();
            current.focus();
          }
        }}
        onEscapeKeyDown={(e) => {
          // Fields that use Escape themselves (clear a search, cancel a form) keep it
          const el = document.activeElement as HTMLElement | null;
          if (el?.closest('[data-dialog-escape="local"]')) e.preventDefault();
        }}
        onCloseAutoFocus={(e) => {
          const target = returnFocusRef.current;
          if (target instanceof HTMLElement && target.isConnected) {
            e.preventDefault();
            target.focus();
          }
        }}
      >
        {/* Settings nav */}
        <div className="flex w-[200px] shrink-0 flex-col border-r px-3 pt-5 pb-6">
          <nav className="flex flex-1 flex-col gap-0.5" aria-label="Settings sections">
            <DialogTitle className="px-2 pb-3 text-base font-semibold text-foreground">
              Settings
            </DialogTitle>
            <DialogDescription className="sr-only">Vibework settings</DialogDescription>

            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative w-full h-8 text-left px-2 rounded-md text-sm transition-colors flex items-center gap-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    isActive
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {/* The selected fill slides from section to section */}
                  {isActive && (
                    <motion.span
                      layoutId="settings-nav-fill"
                      className="absolute inset-0 rounded-md bg-muted"
                      style={{ borderRadius: 8 }}
                      transition={{ duration: 0.24, ease: EASE_DRAWER }}
                    />
                  )}
                  <Icon className={cn("relative size-4 shrink-0", isActive ? "text-foreground" : "text-muted-foreground")} />
                  <span className="relative truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content area */}
        <div className="min-w-0 flex-1 overflow-y-auto px-8 pt-5 pb-12" data-testid="settings-content">
          {/* Keyed by tab: the new section fades in rather than snapping */}
          <div key={activeTab} className="motion-fade-in mx-auto max-w-[720px]">
            {/* General Tab */}
            {activeTab === "general" && (
              <div className="space-y-8">
                <SettingsPageHeader title="General" />

                <AppearanceSettings />

                {/* Model Provider Section */}
                <section>
                  <SettingsSectionHeading title="Model provider" />

                  <div className={settingsCardClass}>
                      <div className={settingsRowClass}>
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <ProviderMark modelId="openrouter/auto" size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">OpenRouter</p>
                          <p className="font-mono text-xs leading-5 text-muted-foreground truncate" title="Stored in the system keychain">
                            {keyHint ?? "Key in the system keychain"}
                          </p>
                        </div>
                        {!isReplacing && (
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              onClick={() => setIsReplacing(true)}
                              variant="outline"
                              size="sm"
                            >
                              Replace key
                            </Button>
                            <Button
                              onClick={() => setConfirmRemove(true)}
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground hover:text-destructive"
                            >
                              Remove key
                            </Button>
                          </div>
                        )}
                      </div>

                      {isReplacing && (
                        <form onSubmit={handleReplaceKey} className="mt-3.5 ml-11 flex flex-col gap-2">
                          <label htmlFor="replace-openrouter-key" className="text-meta font-medium text-foreground">
                            New OpenRouter API key
                          </label>
                          <div className="flex items-center gap-2">
                            <Input
                              id="replace-openrouter-key"
                              type="password"
                              autoFocus
                              autoComplete="off"
                              spellCheck={false}
                              placeholder="sk-or-v1-…"
                              value={newKey}
                              disabled={isCheckingKey}
                              aria-invalid={keyError ? true : undefined}
                              onChange={(e) => {
                                setNewKey(e.target.value);
                                if (keyError) setKeyError(null);
                              }}
                              data-dialog-escape="local"
                              onKeyDown={(e) => {
                                if (e.key === "Escape" && !isCheckingKey) closeReplaceForm();
                              }}
                              className="flex-1 font-mono"
                            />
                            <Button type="submit" disabled={isCheckingKey || !newKey.trim()}>
                              {isCheckingKey ? (
                                <>
                                  <Spinner className="size-3.5" />
                                  Checking…
                                </>
                              ) : (
                                "Save"
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={closeReplaceForm}
                              disabled={isCheckingKey}
                            >
                              Cancel
                            </Button>
                          </div>
                          {keyError && (
                            <p role="alert" className="text-meta text-destructive">
                              {keyError}
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => openUrl(OPENROUTER_KEYS_URL).catch((err) => console.error("Failed to open URL:", err))}
                            className="self-start inline-flex items-center gap-1 text-meta text-muted-foreground hover:text-foreground hover:underline underline-offset-2 cursor-pointer rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            Get a key at openrouter.ai/keys
                            <ExternalLink className="size-3" />
                          </button>
                        </form>
                      )}
                    </div>

                    <div className={cn(settingsRowClass, "flex items-center justify-between gap-4")}>
                      <p className="flex-1 min-w-0 text-sm text-foreground" title="New conversations start with this model">
                        Default model
                      </p>
                      <ModelPicker
                        value={defaultModel}
                        onSelect={handleDefaultModel}
                        side="bottom"
                        align="end"
                        className="shrink-0 h-8 px-2.5 py-0 border border-input bg-transparent dark:bg-input/30 text-sm text-foreground hover:bg-muted aria-expanded:bg-muted"
                      />
                    </div>
                  </div>
                </section>

                {defaultPermissionMode !== null && (
                  <section>
                    <SettingsSectionHeading title="Permissions" />
                    <div className={settingsCardClass}>
                      <div className={cn(settingsRowClass, "flex items-center justify-between gap-4")}>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground">Default permission mode</p>
                          <p className="text-meta text-muted-foreground">
                            For new tasks; each task can change it. Auto is judged from the command text, not enforced by macOS.
                          </p>
                        </div>
                        <PermissionModePicker
                          value={defaultPermissionMode}
                          onChange={changeDefaultPermissionMode}
                          side="bottom"
                          className="shrink-0 border border-input px-2.5 text-foreground"
                        />
                      </div>
                    </div>
                  </section>
                )}

                {/* Notifications Section */}
                <section>
                  <SettingsSectionHeading title="Notifications" />

                  <div className={settingsCardClass}>
                    <div className={cn(settingsRowClass, "flex items-center justify-between gap-4")}>
                      <label htmlFor="notify-switch" className="flex-1 min-w-0 text-sm text-foreground">
                        Notify me when a task finishes or needs me
                      </label>
                      <Switch
                        id="notify-switch"
                        checked={notificationsEnabled}
                        onCheckedChange={setNotificationsEnabled}
                      />
                    </div>
                  </div>
                </section>

                {/* Default Working Directory */}
                <section>
                  <SettingsSectionHeading title="Default folder" />

                  <div className={settingsCardClass}>
                    <div className={cn(settingsRowClass, "flex items-center gap-3")}>
                      <div className="size-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                        <FolderOpen className="size-4" />
                      </div>
                      <p
                        className={cn(
                          "flex-1 min-w-0 truncate select-text",
                          defaultWorkingDirectory
                            ? "font-mono text-meta text-foreground"
                            : "text-sm text-muted-foreground",
                        )}
                        title={defaultWorkingDirectory || undefined}
                      >
                        {defaultWorkingDirectory || "No folder chosen"}
                      </p>
                      <Button
                        onClick={handleSelectDirectory}
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                      >
                        Change
                      </Button>
                    </div>
                  </div>
                </section>

                {/* Keyboard shortcuts */}
                <section>
                  <SettingsSectionHeading title="Keyboard" />
                  <div className={settingsCardClass}>
                    <div className={cn(settingsRowClass, "flex items-center justify-between gap-4")}>
                      <span className="text-sm text-foreground">Keyboard shortcuts</span>
                      <Button variant="outline" size="sm" className="shrink-0" onClick={() => shortcutsSheet.open()} title={withChord("Show keyboard shortcuts", "shortcuts")} data-testid="settings-shortcuts">
                        Show shortcuts
                      </Button>
                    </div>
                  </div>
                </section>

                <UpdatesSettings />

                {/* About */}
                <section>
                  <SettingsSectionHeading title="About" />
                  <div className={settingsCardClass}>
                    <div className={cn(settingsRowClass, "flex items-center justify-between gap-4")}>
                      <span className="text-sm text-foreground">Version</span>
                      <span className="text-meta font-mono text-muted-foreground select-text tabular-nums">
                        {appVersion || "–"}
                      </span>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {activeTab === "usage" && <UsageSettings />}
            {activeTab === "connectors" && <ConnectorsSettings />}
            {activeTab === "web" && <WebSettings />}
            {activeTab === "skills" && <SkillsSettings />}
          </div>
        </div>

        <RemoveKeyDialog open={confirmRemove} onOpenChange={setConfirmRemove} />
      </DialogContent>
    </Dialog>
  );
};
