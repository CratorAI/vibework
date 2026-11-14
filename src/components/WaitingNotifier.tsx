import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAgentSessionsContext } from "@/contexts/AgentSessionsContext";
import { useWaitingSessions } from "@/hooks/useWaitingSessions";

/**
 * When a task other than the one on screen starts waiting for the user, a
 * toast names it and jumps to it. One toast per task (a new request replaces
 * it); it goes away once the task is answered or opened.
 */
export function WaitingNotifier() {
  const waiting = useWaitingSessions();
  const { activeSessionId, sessions, openSession } = useAgentSessionsContext();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const unlisten = listen<string>("overlay:open-task", async ({ payload }) => {
      try {
        await openSession(payload);
        navigate("/");
      } catch {
        toast.error("Couldn’t open that task. Try opening it from Recents.");
      }
    });
    return () => { void unlisten.then(fn => fn()); };
  }, [openSession, navigate]);

  // sessionId -> request key already announced
  const announced = useRef(new Map<string, string>());

  useEffect(() => {
    const live = new Set(waiting.map((w) => w.sessionId));
    for (const w of waiting) {
      const id = `needs-you-${w.sessionId}`;
      if (w.sessionId === activeSessionId) {
        // On screen: the card itself asks
        toast.dismiss(id);
        announced.current.set(w.sessionId, w.requestKey);
        continue;
      }
      if (announced.current.get(w.sessionId) === w.requestKey) continue;
      announced.current.set(w.sessionId, w.requestKey);
      const session = sessions.find((s) => s.sessionId === w.sessionId);
      const name = session?.conversationName || session?.name || "A task";
      toast(`“${name}” needs you`, {
        id,
        description: w.kind === "permission" ? "It’s waiting for your approval." : "It’s waiting for your answer.",
        duration: Infinity,
        closeButton: true,
        action: {
          label: "Open task",
          onClick: () => {
            void openSession(w.sessionId);
            if (location.pathname !== "/") navigate("/");
          },
        },
      });
    }
    // Answered, stopped or gone: drop its toast
    for (const sessionId of [...announced.current.keys()]) {
      if (!live.has(sessionId)) {
        announced.current.delete(sessionId);
        toast.dismiss(`needs-you-${sessionId}`);
      }
    }
  }, [waiting, activeSessionId, sessions, openSession, navigate, location.pathname]);

  return null;
}
