/**
 * Which files the agent created or changed in a task, for the Files tab's
 * quiet dot. Two sources, both from the task's own timeline:
 *
 * - the paths its write, edit and present-file steps named;
 * - files whose last change falls inside one of its turns (start to end, a
 *   little slack either side), which catches what its commands and scripts
 *   wrote (a spreadsheet made by a Python script, say).
 */

import { useMemo } from "react";
import { useAgentSessionsContext } from "@/contexts/AgentSessionsContext";
import type { ChatMessage } from "@/types/agent";

const FILE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "PresentFile"]);
const SLACK_MS = 1500;

/** Comparable form of a path: macOS spells /tmp and /var two ways */
export function pathKey(path: string): string {
  return path.replace(/^\/private(?=\/(tmp|var)\/)/, "").replace(/\/+$/, "");
}

export interface AgentTouched {
  /** pathKey()s of files named by the agent's file steps (absolute, or relative to the folder) */
  paths: string[];
  /** Turn windows, [start, end] in ms */
  windows: [number, number][];
}

function collect(messages: ChatMessage[], out: AgentTouched, now: number, running: boolean) {
  let lastUserAt: number | null = null;
  for (const message of messages) {
    if (message.role === "user") {
      lastUserAt = message.timestamp instanceof Date ? message.timestamp.getTime() : null;
      continue;
    }
    for (const block of message.blocks) {
      if (block.type !== "tool" || !FILE_TOOLS.has(block.call.name)) continue;
      const input = block.call.input as { file_path?: unknown } | null;
      if (input && typeof input.file_path === "string") out.paths.push(input.file_path);
    }
    const t = message.turnTiming;
    if (t) {
      const start = Date.parse(t.startedAt);
      if (!Number.isNaN(start)) out.windows.push([start, start + (t.durationMs ?? 0)]);
    }
  }
  // A turn still running has no record yet: from the message that started it until now
  if (running && lastUserAt !== null) out.windows.push([lastUserAt, now]);
}

export function useAgentTouched(sessionId: string, agentBusy: boolean): AgentTouched {
  const { activeSessions } = useAgentSessionsContext();
  const state = activeSessions.get(sessionId);
  return useMemo(() => {
    const out: AgentTouched = { paths: [], windows: [] };
    if (!state) return out;
    const now = Date.now();
    collect(state.historyMessages, out, now, false);
    collect(state.streamBuffer, out, now, agentBusy);
    return out;
  }, [state, agentBusy]);
}

/** Whether the agent touched `path` (absolute, canonical) in the task working in `root` */
export function touchedBy(touched: AgentTouched, root: string, path: string, modifiedMs: number): boolean {
  const key = pathKey(path);
  const rootKey = pathKey(root);
  for (const p of touched.paths) {
    const abs = p.startsWith("/") ? p : `${rootKey}/${p.replace(/^\.\//, "")}`;
    if (pathKey(abs) === key) return true;
  }
  return touched.windows.some(([start, end]) => modifiedMs >= start - SLACK_MS && modifiedMs <= end + SLACK_MS);
}

/** Whether a folder holds a file the agent's file steps named */
export function folderTouched(touched: AgentTouched, root: string, dir: string): boolean {
  const prefix = `${pathKey(dir)}/`;
  const rootKey = pathKey(root);
  return touched.paths.some((p) => pathKey(p.startsWith("/") ? p : `${rootKey}/${p.replace(/^\.\//, "")}`).startsWith(prefix));
}
