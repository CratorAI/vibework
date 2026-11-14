import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { getThemePreference, setThemePreference, subscribeThemePreference, type ThemePreference } from "@/lib/theme";
import { SettingsSectionHeading, settingsCardClass, settingsRowClass } from "./settingsUi";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Match system" },
];

export function AppearanceSettings() {
  const preference = useSyncExternalStore(subscribeThemePreference, getThemePreference);
  return (
    <section aria-labelledby="appearance-heading">
      <SettingsSectionHeading title="Appearance" id="appearance-heading" />
      <div className={settingsCardClass}>
        <div className={cn(settingsRowClass, "flex items-center justify-between gap-4 flex-wrap")}>
          <span className="text-sm font-medium">Theme</span>
          <fieldset className="flex items-center gap-1 rounded-lg bg-muted p-1">
            <legend className="sr-only">Color theme</legend>
            {OPTIONS.map(({ value, label }) => (
              <label key={value} className="relative cursor-pointer">
                <input
                  type="radio"
                  name="appearance"
                  value={value}
                  checked={preference === value}
                  onChange={() => setThemePreference(value)}
                  className="peer sr-only"
                />
                <span className={cn(
                  "flex h-8 min-w-16 items-center justify-center rounded-md px-3 text-meta transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-muted",
                  preference === value ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground",
                )}>{label}</span>
              </label>
            ))}
          </fieldset>
        </div>
      </div>
    </section>
  );
}
