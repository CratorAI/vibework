/**
 * Hook for managing the list of all agent sessions
 *
 * This hook provides session list management:
 * - List all sessions
 * - Create new sessions
 * - Resume existing sessions
 * - Delete sessions
 * - Track running sessions
 */

import { useState, useCallback, useEffect } from 'react';
import { agentApi } from '../tauri/agent';
import { generateSessionId } from '../utils/sessionIdGenerator';
import type { SessionInfo } from '../types/agent';

export interface UseAgentSessionsResult {
  /** List of all sessions */
  sessions: SessionInfo[];
  /** Whether sessions are being loaded */
  isLoading: boolean;
  /** List of currently running session IDs */
  runningSessions: string[];
  /** Create a new session */
  createSession: (name: string, description?: string) => Promise<string>;
  /** Resume an existing session (loads history and spawns agent) */
  resumeSession: (sessionId: string) => Promise<void>;
  /** Delete a session */
  deleteSession: (sessionId: string) => Promise<void>;
  /** Refresh the session list from disk */
  refreshSessions: () => Promise<void>;
  /** Refresh the list of running sessions */
  refreshRunningSessions: () => Promise<void>;
  /** Error message if any */
  error: string | null;
}

/**
 * Hook to manage the list of agent sessions
 *
 * @returns Session list state and management functions
 *
 * @example
 * ```tsx
 * const {
 *   sessions,
 *   createSession,
 *   deleteSession,
 *   resumeSession
 * } = useAgentSessions();
 *
 * // Create a new session
 * const sessionId = await createSession('New Chat');
 *
 * // Resume an existing session
 * await resumeSession(existingSessionId);
 * ```
 */
export function useAgentSessions(): UseAgentSessionsResult {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [runningSessions, setRunningSessions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load all sessions from disk
   */
  const refreshSessions = useCallback(async () => {
    try {
      const list = await agentApi.listSessions();
      setSessions(list);
      setError(null);
    } catch (err) {
      console.error('[useAgentSessions] Failed to list sessions:', err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  /**
   * Load list of running sessions
   */
  const refreshRunningSessions = useCallback(async () => {
    try {
      const running = await agentApi.listRunning();
      setRunningSessions(running);
      setError(null);
    } catch (err) {
      console.error('[useAgentSessions] Failed to list running sessions:', err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  /**
   * Load sessions on mount
   */
  useEffect(() => {
    Promise.all([
      refreshSessions(),
      refreshRunningSessions(),
    ]).finally(() => {
      setIsLoading(false);
    });
  }, [refreshSessions, refreshRunningSessions]);

  /**
   * Create a new session
   * @param name - Name for the session
   * @returns The created session ID
   */
  const createSession = useCallback(async (name: string): Promise<string> => {
    const sessionId = generateSessionId();

    try {
      // Create session on backend
      await agentApi.createSession(sessionId, name);

      // Refresh the session list
      await refreshSessions();
      await refreshRunningSessions();

      setError(null);
      return sessionId;
    } catch (err) {
      console.error('[useAgentSessions] Failed to create session:', err);
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [refreshSessions, refreshRunningSessions]);

  /**
   * Resume an existing session
   * This loads the session history and spawns the agent
   * @param sessionId - Session ID to resume
   */
  const resumeSession = useCallback(async (sessionId: string): Promise<void> => {
    try {
      // Resume session on backend (loads history and spawns agent)
      await agentApi.resumeSession(sessionId);

      // Refresh running sessions list
      await refreshRunningSessions();

      setError(null);
    } catch (err) {
      console.error('[useAgentSessions] Failed to resume session:', err);
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [refreshRunningSessions]);

  /**
   * Delete a session
   * @param sessionId - Session ID to delete
   */
  const deleteSession = useCallback(async (sessionId: string): Promise<void> => {
    try {
      // Delete session on backend
      await agentApi.deleteSession(sessionId);

      // Refresh the session list
      await refreshSessions();
      await refreshRunningSessions();

      setError(null);
    } catch (err) {
      console.error('[useAgentSessions] Failed to delete session:', err);
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [refreshSessions, refreshRunningSessions]);

  return {
    sessions,
    isLoading,
    runningSessions,
    createSession,
    resumeSession,
    deleteSession,
    refreshSessions,
    refreshRunningSessions,
    error,
  };
}
