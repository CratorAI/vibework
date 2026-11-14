import { useSyncExternalStore } from "react";

/** Whether the app is in dark mode (`.dark` on <html>, toggled by src/lib/theme.ts) */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function getSnapshot(): boolean {
  return document.documentElement.classList.contains("dark");
}

export function useIsDark(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
