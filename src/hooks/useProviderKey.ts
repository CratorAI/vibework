import { useContext } from "react";
import { ProviderKeyContext, type ProviderKeyContextValue } from "@/contexts/ProviderKeyContext";

export const useProviderKey = (): ProviderKeyContextValue => {
  const context = useContext(ProviderKeyContext);
  if (context === undefined) {
    throw new Error("useProviderKey must be used within a ProviderKeyProvider");
  }
  return context;
};
