import { getCurrentWindow } from "@tauri-apps/api/window";
import { Lockup } from "@/components/brand/Lockup";
import { chord, withChord } from "@/lib/shortcuts";
import { getUsage, useAccountUsage } from "@/tauri/usage";
import { lowCredit, formatCost } from "@/utils/telemetry";
import React, { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { PanelLeft, Plus, Search, Settings, BarChart, Folder } from "@/lib/icons";
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TaskHistory } from "./TaskHistory";
import { SidebarResizeHandle } from "./SidebarResizeHandle";
import { useAgentSessionsContext } from "../../contexts/AgentSessionsContext";
import { openSettings, type SettingsTab } from "@/lib/settingsNav";
import { cn } from "@/lib/utils";
import { useWaitingSessions } from "@/hooks/useWaitingSessions";
import { searchWindow, useSearchWindow } from "@/stores/searchWindow";

const noDrag = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

/** A 32px icon button with a tooltip, for the search row and the footer. */
const IconAction = React.forwardRef<
  HTMLButtonElement,
  { label: string; hint?: string; onClick: () => void; children: React.ReactNode; className?: string; active?: boolean }
>(function IconAction({ label, hint, onClick, children, className, active }, ref) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={ref}
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-current={active ? "page" : undefined}
          className={cn(
            "pressable grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-[color,background-color,scale] outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring [&>svg]:size-4",
            active && "bg-sidebar-accent text-foreground",
            className,
          )}
          style={noDrag}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
        {hint && <span className="ml-1.5 opacity-60">{hint}</span>}
      </TooltipContent>
    </Tooltip>
  );
});

// Search's pressed state must not rerender hundreds of task rows.
function SearchButton() {
  const { open: searchOpen } = useSearchWindow();
  return <>
            {/* Opens the search window (⌘K anywhere); pressed while it is open */}
            <SidebarMenuButton
              size="nav"
              onClick={() => searchWindow.open()}
              tooltip={{ children: <>Search<span className="ml-1.5 opacity-60">{chord("search")}</span></> }}
              isActive={searchOpen}
              aria-haspopup="dialog"
              aria-expanded={searchOpen}
              aria-keyshortcuts="Meta+K"
              data-testid="sidebar-search"
              className="text-muted-foreground hover:bg-foreground/[0.035] data-[active=true]:bg-foreground/[0.055] data-[active=true]:font-normal data-[active=true]:text-foreground/80"
            >
              <Search />
              {/* The rail hides a button's last span only; this row has two */}
              <span className="flex-1 group-data-[collapsible=icon]:hidden">Search</span>
              <span className="kbd bg-transparent text-faint group-data-[collapsible=icon]:!hidden" aria-hidden>{chord("search")}</span>
            </SidebarMenuButton>
  </>;
}

export const Sidebar: React.FC = () => {
  const { clearActiveSession, openSession } = useAgentSessionsContext();
  const waiting = useWaitingSessions();
  const { toggleSidebar, state: sidebarState } = useSidebar();
  const navigate = useNavigate();
  const location = useLocation();

  const handleNewChat = () => {
    // Clear the active session to show the home view
    // A new session will be created when the user sends a message
    clearActiveSession();
    // Navigate to home if not already there
    if (location.pathname !== "/") {
      navigate("/");
    }
  };

  const creditRemaining = lowCredit(useAccountUsage());
  useEffect(() => { void getUsage().catch(() => {}); }, []);
  useEffect(() => {
    const window = getCurrentWindow();
    if (window.label === "main") void window.setBadgeCount(waiting.length || undefined).catch(() => {});
  }, [waiting.length]);

  const openFirstWaiting = () => {
    const first = waiting[0];
    if (!first) return;
    void openSession(first.sessionId);
    if (location.pathname !== "/") navigate("/");
  };

  const settingsTab = location.pathname === "/settings" ? new URLSearchParams(location.search).get("tab") ?? "general" : null;
  const goToSettings = (tab: SettingsTab) => openSettings(navigate, tab);

  return (
    <>
      {/* Sidebar toggle: sits in the titlebar strip just right of the traffic
          lights (which end at x≈79, centred 30px down, the middle of the 60px band), above the drag region. */}
      <button
        type="button"
        onClick={toggleSidebar}
        className="fixed top-[16px] left-[90px] z-[60] flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        style={noDrag}
        aria-label={sidebarState === "collapsed" ? "Show sidebar" : "Hide sidebar"}
        aria-keyshortcuts="Meta+B"
        title={withChord(sidebarState === "collapsed" ? "Show sidebar" : "Hide sidebar", "sidebar")}
      >
        <PanelLeft className="size-4" />
      </button>

      {/* The wordmark, in the titlebar strip right of the toggle, centred on the
          traffic lights' line (lights and toggle span y 19 to 33, the word 20 to 32); the strip stays a drag
          region, so it takes no pointer events */}
      {sidebarState !== "collapsed" && (
        <Lockup className="pointer-events-none fixed top-[23.5px] left-[129px] z-[60] h-[13px] w-auto text-foreground" />
      )}

    <ShadcnSidebar
      collapsible="offcanvas"
      className="bg-sidebar !border-r-0 pt-(--titlebar-height) !h-screen [&>[data-slot=sidebar-inner]]:bg-transparent"
    >

      {/* New task, then Search */}
      <SidebarHeader className="gap-0 px-3 pt-[2px] pb-0 group-data-[collapsible=icon]:px-[7px]" style={noDrag}>
        <SidebarMenu className="gap-[2px]">
          <SidebarMenuItem>
            <SidebarMenuButton
              size="nav"
              onClick={handleNewChat}
              tooltip={{ children: <>New task<span className="ml-1.5 opacity-60">{chord("newTask")}</span></> }}
              aria-keyshortcuts="Meta+N"
              className="pressable bg-foreground/[0.05] font-medium transition-[width,height,padding,background-color,scale] hover:bg-foreground/[0.08] active:bg-foreground/[0.11]"
            >
              <Plus />
              <span>New task</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SearchButton />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton size="nav" tooltip={{ children: <>Artifacts<span className="ml-1.5 opacity-60">{chord("artifacts")}</span></> }} aria-keyshortcuts="Meta+Shift+A" isActive={location.pathname === '/artifacts'} onClick={() => navigate('/artifacts')} className="text-muted-foreground hover:bg-foreground/[0.035]">
              <Folder /><span>Artifacts</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {/* Collapsed rail: how many tasks need the user, and a way to the first */}
          {waiting.length > 0 && (
            <SidebarMenuItem className="hidden group-data-[collapsible=icon]:block">
              <SidebarMenuButton
                size="nav"
                onClick={openFirstWaiting}
                tooltip={waiting.length === 1 ? "1 task needs you" : `${waiting.length} tasks need you`}
                aria-label={waiting.length === 1 ? "1 task needs you" : `${waiting.length} tasks need you`}
                className="justify-center"
                data-testid="rail-needs-you"
              >
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-warning text-xs font-semibold text-warning-foreground tabular-nums">
                  {waiting.length}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarHeader>

      {/* Tasks: active ones scroll; Settled is pinned at the bottom */}
      <SidebarContent className="gap-0 overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col pt-5 group-data-[collapsible=icon]:hidden" style={noDrag}>
          <TaskHistory />
        </div>
      </SidebarContent>

      {/* Settings and Usage */}
      <SidebarFooter
        className="shrink-0 flex-row items-center gap-0.5 px-3 pt-2 pb-3 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-[7px]"
        style={noDrag}
      >
        <IconAction label="Settings" hint={chord("settings")} onClick={() => goToSettings("general")} active={settingsTab !== null && settingsTab !== "usage"}>
          <Settings />
        </IconAction>
        <IconAction label={creditRemaining == null ? "Usage" : `Usage · ${formatCost(creditRemaining)} credit remaining`} onClick={() => goToSettings("usage")} active={settingsTab === "usage"}>
          {creditRemaining != null && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-warning" />}
          <BarChart />
        </IconAction>
      </SidebarFooter>

      <SidebarResizeHandle />

    </ShadcnSidebar>
    </>
  );
};
