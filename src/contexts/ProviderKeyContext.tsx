import React, { createContext, useCallback, useEffect, useMemo, useState, ReactNode } from "react";
import { byokApi, type ByokStatus } from "../tauri/byok";
import { errorMessage } from "@/lib/utils";

/**
 * The OpenRouter key is the only thing standing between the user and the app:
 * no accounts, no sign-in. This context reports whether a key is stored and
 * lets the UI connect a new one or remove it.
 */
export interface ProviderKeyContextValue {
  /** True when an OpenRouter key is stored in the keychain */
  isConnected: boolean;
  /** Non-secret hint of the stored key (e.g. "sk-or-…a1b2"), or null */
  keyHint: string | null;
  /** True until the first status check has finished */
  isLoading: boolean;
  /** Validates and stores a key. Throws an Error with a readable message on failure. */
  connect: (key: string) => Promise<void>;
  /** Removes the stored key. Throws an Error with a readable message on failure. */
  disconnect: () => Promise<void>;
}

export const ProviderKeyContext = createContext<ProviderKeyContextValue | undefined>(undefined);

export const ProviderKeyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<ByokStatus>({ active: false, keyHint: null });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    byokApi
      .getStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch((err) => {
        console.error("[ProviderKey] Failed to read key status:", err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async (key: string) => {
    const trimmed = key.trim();
    if (!trimmed) throw new Error("Paste your OpenRouter API key.");
    try {
      setStatus(await byokApi.setOpenRouterKey(trimmed));
    } catch (err) {
      throw new Error(errorMessage(err, "Could not verify the key with OpenRouter."));
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      setStatus(await byokApi.clearOpenRouterKey());
    } catch (err) {
      throw new Error(errorMessage(err, "Could not remove the key."));
    }
  }, []);

  const value = useMemo<ProviderKeyContextValue>(
    () => ({
      isConnected: status.active,
      keyHint: status.keyHint,
      isLoading,
      connect,
      disconnect,
    }),
    [status, isLoading, connect, disconnect],
  );

  return <ProviderKeyContext.Provider value={value}>{children}</ProviderKeyContext.Provider>;
};
