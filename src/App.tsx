import { lazy, Suspense, useEffect } from "react";
import { MotionConfig } from "framer-motion";
import { HashRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { ProviderKeyProvider } from "./contexts/ProviderKeyContext";
import { ModelsProvider } from "./contexts/ModelsContext";
import { AgentSessionsProvider } from "./contexts/AgentSessionsContext";
import {
  SidebarProvider,
  SidebarInset,
} from "@/components/ui/sidebar";
import { Sidebar } from "./components/Sidebar";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Login } from "./pages/Login";
const Gallery = lazy(() => import("./components/gallery/Gallery").then((m) => ({ default: m.Gallery })));
import { Index } from "./pages/Index";
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));
import { Toaster } from "./components/ui/sonner";
import { Titlebar } from "./components/Titlebar";
import { WaitingNotifier } from "./components/WaitingNotifier";
import { WINDOW_SIZES } from "./constants/windowSizes";
import { appApi } from "./tauri";
import { useSidebarWidth } from "./components/Sidebar/sidebarWidth";
import { SearchWindow } from "./components/search/SearchWindow";
import { AppShortcuts } from "./components/shortcuts/AppShortcuts";
import { ShortcutsSheet } from "./components/shortcuts/ShortcutsSheet";

// Layout component that includes the sidebar
function AppLayout({ children }: { children: React.ReactNode }) {
  const sidebarWidth = useSidebarWidth();

  useEffect(() => {
    const setupMainWindow = async () => {
      await appApi.setWindowSize(WINDOW_SIZES.MAIN.width, WINDOW_SIZES.MAIN.height, true);
      await appApi.setMinWindowSize(WINDOW_SIZES.MIN.width, WINDOW_SIZES.MIN.height);
    };
    setupMainWindow();
  }, []);

  return (
    <>
      {/* Custom titlebar for macOS - spans entire width */}
      <Titlebar />
      <WaitingNotifier />
      <SearchWindow />
      <ShortcutsSheet />

      <SidebarProvider
        className="min-h-0! h-full"
        style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
      >
        {/* Every app-wide keyboard shortcut (see lib/shortcuts) */}
        <AppShortcuts />
        <Sidebar />
        <SidebarInset className="relative h-full overflow-hidden text-ui text-foreground">
          {children}
        </SidebarInset>
      </SidebarProvider>
    </>
  );
}

function App() {
  return (
    // Reduced motion: framer-motion keeps opacity and drops movement
    <MotionConfig reducedMotion="user">
    <ProviderKeyProvider>
      <ModelsProvider>
        <Toaster position="bottom-right" />
        <HashRouter>
          <AgentSessionsProvider>
            <Routes>
              {/* OpenRouter key entry (no sidebar) */}
              <Route path="/login" element={<Login />} />

              {/* Protected routes with sidebar. One layout route keeps the
                  conversation mounted; Settings is a dialog over it. */}
              <Route
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <Index />
                      <Suspense fallback={null}><Outlet /></Suspense>
                    </AppLayout>
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={null} />
                <Route path="/artifacts" element={<Gallery />} />
                <Route path="/settings" element={<Settings />} />
              </Route>

              {/* Redirect any unknown routes to home */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AgentSessionsProvider>
        </HashRouter>
      </ModelsProvider>
    </ProviderKeyProvider>
    </MotionConfig>
  );
}

export default App;
