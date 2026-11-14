import React, { useState } from "react";
import { ChevronRight, Pause, Check } from "@/lib/icons";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Collapsible,
  AnimatedCollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { TodoItem, AgentState } from "../types/agent";

interface TodoProgressRibbonProps {
  todos: TodoItem[];
  agentState?: AgentState;
}

// Helper to get display info for agent state
function getAgentStateDisplay(state: AgentState | undefined): {
  show: boolean;
  text: string;
  isPaused: boolean;
} {
  if (!state) return { show: false, text: "", isPaused: false };

  // Processing states
  if (state === "Processing") return { show: true, text: "Working", isPaused: false };
  if (typeof state === "object") {
    if ("ExecutingTool" in state) return { show: true, text: "Working", isPaused: false };
  }

  // Waiting for permission
  if (state === "WaitingForPermission") return { show: true, text: "Waiting for you", isPaused: true };

  // Idle, Done, Error - don't show state text
  return { show: false, text: "", isPaused: false };
}

export const TodoProgressRibbon: React.FC<TodoProgressRibbonProps> = ({
  todos,
  agentState,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  const hasTodos = todos && todos.length > 0;
  const completedCount = hasTodos ? todos.filter((t) => t.status === "completed").length : 0;
  const totalCount = hasTodos ? todos.length : 0;
  const stateDisplay = getAgentStateDisplay(agentState);
  // The step in progress, else the next one to do, else the last one done
  const current = hasTodos
    ? todos.find((t) => t.status === "in_progress") ??
      todos.find((t) => t.status === "pending") ??
      todos[todos.length - 1]
    : null;
  const currentLabel = current
    ? current.status === "in_progress" && current.activeForm
      ? current.activeForm
      : current.content
    : "";

  const shouldShow = hasTodos || stateDisplay.show;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <div className="-z-10 translate-y-4 rounded-t-[16px] border border-border bg-muted/40">
              {/* Header row */}
              <CollapsibleTrigger asChild disabled={!hasTodos}>
                <button
                  className={`group/ribbon flex h-[48px] w-full items-center justify-between gap-4 rounded-t-2xl px-4 pb-4 text-meta text-muted-foreground outline-none transition-colors ${isOpen ? "py-2" : ""} ${hasTodos ? "hover:text-foreground focus-visible:text-foreground" : "cursor-default"}`}
                  aria-label={hasTodos ? `Plan: ${completedCount} of ${totalCount} done` : undefined}
                >
                  {hasTodos ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 font-medium text-foreground tabular-nums">
                        {completedCount} of {totalCount}
                      </span>
                      <span className="truncate" title={currentLabel}>{currentLabel}</span>
                      <ChevronRight
                        className={`size-3.5 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
                      />
                    </span>
                  ) : (
                    <span />
                  )}
                  <span className="flex shrink-0 items-center gap-2">
                    {stateDisplay.show && (
                      <span
                        className="flex items-center gap-1.5 text-meta text-muted-foreground"
                        aria-live="polite"
                        data-testid="ribbon-state"
                      >
                        {stateDisplay.isPaused ? (
                          <Pause className="size-3.5 text-warning" />
                        ) : (
                          <span className="loader" aria-hidden></span>
                        )}
                        {stateDisplay.text}
                      </span>
                    )}
                  </span>
                </button>
              </CollapsibleTrigger>

              {/* Expanded content - only when there are todos */}
              {hasTodos && (
                <AnimatedCollapsibleContent isOpen={isOpen} className="mx-[7px] rounded-[10px] bg-muted">
                  <div className="max-h-[200px] overflow-y-auto px-[10px] py-[10px] pb-4 space-y-1.5">
                    {todos.map((todo, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <span className="mt-px grid size-4 shrink-0 place-items-center" aria-hidden>
                          {todo.status === "completed" ? (
                            <Check className="size-3.5 text-muted-foreground" />
                          ) : todo.status === "in_progress" ? (
                            <span className="loader" />
                          ) : (
                            <span className="size-3 rounded-full border-[1.5px] border-muted-foreground/50" />
                          )}
                        </span>
                        <span
                          className={`text-meta ${
                            todo.status === "completed"
                              ? "text-muted-foreground line-through"
                              : todo.status === "in_progress"
                              ? "text-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          {todo.status === "in_progress" && todo.activeForm
                            ? todo.activeForm
                            : todo.content}
                        </span>
                      </div>
                    ))}
                  </div>
                </AnimatedCollapsibleContent>
              )}
            </div>
          </Collapsible>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
