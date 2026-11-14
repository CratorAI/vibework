import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ setTheme: vi.fn(), label: "main" }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ label: native.label, setTheme: native.setTheme }),
}));

let storage: Map<string, string>;
let classes: Set<string>;
let pinned: string | null;
let darkSystem: boolean;
let media: EventTarget & { readonly matches: boolean };

beforeEach(() => {
  vi.resetModules();
  native.setTheme.mockReset();
  native.setTheme.mockRejectedValue(new Error("No native window in unit tests"));
  native.label = "main";
  storage = new Map();
  classes = new Set();
  pinned = null;
  darkSystem = false;
  media = Object.assign(new EventTarget(), { matches: false });
  Object.defineProperty(media, "matches", { get: () => darkSystem });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal("window", Object.assign(new EventTarget(), { matchMedia: () => media }));
  vi.stubGlobal("document", {
    documentElement: {
      getAttribute: () => pinned,
      classList: { toggle: (name: string, on: boolean) => on ? classes.add(name) : classes.delete(name) },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

function storageEvent(key: string | null) {
  const event = new Event("storage");
  Object.defineProperty(event, "key", { value: key });
  window.dispatchEvent(event);
}

describe("appearance preference", () => {
  it("starts light, then persists and broadcasts an explicit dark choice", async () => {
    const theme = await import("../theme");
    expect(theme.getThemePreference()).toBe("light");
    theme.followSystemTheme();
    const changed = vi.fn();
    const unsubscribe = theme.subscribeThemePreference(changed);
    theme.setThemePreference("dark");
    expect(classes.has("dark")).toBe(true);
    expect(storage.get(theme.THEME_STORAGE_KEY)).toBe("dark");
    expect(theme.getThemePreference()).toBe("dark");
    expect(changed).toHaveBeenCalledTimes(1);
    unsubscribe();
    theme.setThemePreference("light");
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("follows system changes only when System is selected", async () => {
    const theme = await import("../theme");
    theme.followSystemTheme();
    theme.setThemePreference("system");
    darkSystem = true;
    media.dispatchEvent(new Event("change"));
    expect(classes.has("dark")).toBe(true);
    theme.setThemePreference("light");
    media.dispatchEvent(new Event("change"));
    expect(classes.has("dark")).toBe(false);
  });

  it("keeps the notification light when the main preference changes", async () => {
    const theme = await import("../theme");
    native.label = "overlay";
    pinned = "light";
    theme.followSystemTheme();
    theme.setThemePreference("dark");
    expect(classes.has("dark")).toBe(false);
    expect(native.setTheme).not.toHaveBeenCalled();
  });

  it("syncs the selected control and CSS from another window or cleared storage", async () => {
    const theme = await import("../theme");
    theme.followSystemTheme();
    theme.setThemePreference("dark");
    const changed = vi.fn();
    theme.subscribeThemePreference(changed);
    storage.set(theme.THEME_STORAGE_KEY, "light");
    storageEvent(theme.THEME_STORAGE_KEY);
    expect(theme.getThemePreference()).toBe("light");
    expect(classes.has("dark")).toBe(false);
    storage.set(theme.THEME_STORAGE_KEY, "dark");
    storageEvent(theme.THEME_STORAGE_KEY);
    storage.clear();
    storageEvent(null);
    expect(theme.getThemePreference()).toBe("light");
    expect(classes.has("dark")).toBe(false);
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it("applies the current choice even if saving it is unavailable", async () => {
    const theme = await import("../theme");
    storage.set(theme.THEME_STORAGE_KEY, "light");
    localStorage.setItem = () => { throw new Error("storage unavailable"); };
    theme.setThemePreference("dark");
    expect(theme.getThemePreference()).toBe("dark");
    expect(classes.has("dark")).toBe(true);
  });
});
