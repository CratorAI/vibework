import { invoke } from "@tauri-apps/api/core";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { modelsApi, type ModelInfo } from "../tauri/models";
import { useProviderKey } from "../hooks/useProviderKey";
import { errorMessage } from "@/lib/utils";

/**
 * Shared OpenRouter model catalogue and default model.
 * The list is fetched once per connected key and shared by every picker.
 */
export interface ModelsContextValue {
  models: ModelInfo[];
  /** id -> model, for quick lookups of the current selection */
  modelsById: ReadonlyMap<string, ModelInfo>;
  isLoading: boolean;
  error: string | null;
  /** Re-fetch the list; pass true to bypass the Rust-side cache */
  refresh: (forceRefresh?: boolean) => Promise<void>;
  /** Default model id for new conversations (null until loaded) */
  defaultModel: string | null;
  setDefaultModel: (modelId: string) => Promise<void>;
}

const ModelsContext = createContext<ModelsContextValue | undefined>(undefined);

export const ModelsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isConnected, keyHint } = useProviderKey();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [defaultModel, setDefaultModelState] = useState<string | null>(null);
  // Guards against out-of-order responses when the key changes mid-request
  const requestIdRef = useRef(0);

  const refresh = useCallback(async (forceRefresh?: boolean) => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const list = await modelsApi.listModels(forceRefresh);
      if (requestId !== requestIdRef.current) return;
      setModels([...list].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error("[Models] Failed to load models:", err);
      setError(errorMessage(err, "Could not load models from OpenRouter."));
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, []);

  // Load once per connected key; clear when the key is removed
  useEffect(() => {
    if (!isConnected) {
      requestIdRef.current++;
      setModels([]);
      setDefaultModelState(null);
      const requestId = requestIdRef.current;
      void invoke<ModelInfo[]>("agent_installed_agents").then(list => { if (requestIdRef.current === requestId) setDefaultModelState(list.find(a => !a.disabledReason)?.id ?? null); }).catch(() => {});
      setError(null);
      setIsLoading(false);
      return;
    }
    refresh();
    modelsApi
      .getDefaultModel()
      .then(setDefaultModelState)
      .catch((err) => console.error("[Models] Failed to load default model:", err));
  }, [isConnected, keyHint, refresh]);

  const setDefaultModel = useCallback(async (modelId: string) => {
    await modelsApi.setDefaultModel(modelId);
    setDefaultModelState(modelId);
  }, []);

  const modelsById = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);

  const value = useMemo<ModelsContextValue>(
    () => ({ models, modelsById, isLoading, error, refresh, defaultModel, setDefaultModel }),
    [models, modelsById, isLoading, error, refresh, defaultModel, setDefaultModel],
  );

  return <ModelsContext.Provider value={value}>{children}</ModelsContext.Provider>;
};

export function useModels(): ModelsContextValue {
  const context = useContext(ModelsContext);
  if (context === undefined) {
    throw new Error("useModels must be used within a ModelsProvider");
  }
  return context;
}
