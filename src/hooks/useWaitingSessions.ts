import { useMemo } from "react";
import { useAgentSessionsContext } from "@/contexts/AgentSessionsContext";

export interface WaitingSession {
  sessionId: string;
  /** What the task is waiting on */
  kind: "permission" | "question";
  /** Identifies this particular request (a new one gets a new key) */
  requestKey: string;
}

/** Tasks blocked on the user (a permission prompt or a question), in task order. */
export function useWaitingSessions(): WaitingSession[] {
  const { activeSessions } = useAgentSessionsContext();
  return useMemo(() => {
    const waiting: WaitingSession[] = [];
    for (const [sessionId, state] of activeSessions.entries()) {
      if (state.permissionRequest) {
        const p = state.permissionRequest;
        waiting.push({ sessionId, kind: "permission", requestKey: `p:${p.toolName}:${p.action}:${p.input}` });
      } else if (state.questionRequest) {
        waiting.push({ sessionId, kind: "question", requestKey: `q:${state.questionRequest.requestId}` });
      }
    }
    return waiting;
  }, [activeSessions]);
}
