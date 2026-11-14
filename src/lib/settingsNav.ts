/**
 * Opening and closing Settings, which is a dialog over the app at
 * `#/settings?tab=…` (so other screens can deep-link to a tab).
 */

import type { NavigateFunction } from "react-router-dom";

export type SettingsTab = "general" | "usage" | "connectors" | "web" | "skills";

/** History state marking a Settings entry pushed from inside the app (closing goes back) */
export interface SettingsLocationState {
  settingsFromApp?: boolean;
}

/** Open Settings, on a tab. Pushes an entry so closing returns to where the user was. */
export function openSettings(navigate: NavigateFunction, tab: SettingsTab = "general"): void {
  const search = tab === "general" ? "" : `?tab=${tab}`;
  navigate(`/settings${search}`, { state: { settingsFromApp: true } satisfies SettingsLocationState });
}
