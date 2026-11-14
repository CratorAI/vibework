import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Navigate } from "react-router-dom";
import { useProviderKey } from "../hooks/useProviderKey";
import { Spinner } from "@/components/ui/spinner";
import { wasWelcomed } from "@/lib/welcome";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Renders children when an OpenRouter key is connected, or when a coding agent
 * is signed in and the person has already seen the welcome; otherwise sends
 * them to the welcome screen.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isConnected, isLoading } = useProviderKey();

  const [agentReady, setAgentReady] = useState<boolean | null>(null);
  useEffect(() => { void invoke<Array<{disabledReason?: string | null}>>("agent_installed_agents").then(list => setAgentReady(list.some(a => !a.disabledReason))).catch(() => setAgentReady(false)); }, []);

  if (isLoading || (!isConnected && agentReady === null)) {
    return (
      <div className="h-screen w-screen flex flex-col gap-3 items-center justify-center bg-background">
        <Spinner className="h-8 w-8" />
        <p role="status" className="text-sm text-muted-foreground">Connecting to your saved key. If macOS asks, allow Vibework access to Keychain.</p>
      </div>
    );
  }

  if (!isConnected && !(agentReady && wasWelcomed())) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};
