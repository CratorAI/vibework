import React from "react";
import { resolveProvider } from "@/lib/modelProviders";
import { cn } from "@/lib/utils";

interface ProviderMarkProps {
  modelId: string;
  modelName?: string;
  size?: number;
  className?: string;
}

/** The company logo for a model, or a lettered tile when we have no logo for it. */
export const ProviderMark: React.FC<ProviderMarkProps> = ({ modelId, modelName, size = 18, className }) => {
  const provider = resolveProvider(modelId, modelName);
  if (!provider.iconSrc) {
    return (
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center rounded-[5px] bg-muted text-[10px] font-semibold text-muted-foreground",
          className,
        )}
        style={{ width: size, height: size }}
      >
        {provider.label.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={provider.iconSrc}
      alt=""
      aria-hidden
      draggable={false}
      className={cn("shrink-0 object-contain", provider.mono && "dark:invert", className)}
      style={{ width: size, height: size }}
    />
  );
};
