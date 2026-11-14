/**
 * Theme selection. The app is light by default.
 *
 * A stored preference ("light" | "dark" | "system" under THEME_STORAGE_KEY) or a
 * `data-theme="light" | "dark"` attribute on <html> overrides the default.
 * Tokens for both themes live in src/index.css.
 *
 * The exported name is kept from when the app followed the system appearance.
 */
export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "vibework.theme";
const DEFAULT_THEME: ThemePreference = "light";
const THEME_CHANGED_EVENT = "vibework:theme-changed";
// Keep the current choice usable when storage is unavailable/full.
let sessionPreference: ThemePreference | undefined;
let firstWindowTheme = true;

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function getThemePreference(): ThemePreference {
  if (sessionPreference) return sessionPreference;
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(stored)) return stored;
  } catch {
    // Storage unavailable: fall through to the default
  }
  return DEFAULT_THEME;
}

/**
 * Keep the native window's appearance in step with the app's theme. On macOS this
 * picks the light or dark window material that shows through the sidebar, and makes
 * system-drawn parts (scrollbars, menus, toasts that follow the OS) match.
 * "system" hands control back to the OS. Main window only.
 */
function syncWindowTheme(preference: ThemePreference): void {
  import("@tauri-apps/api/window")
    .then(async ({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      if (win.label !== "main") return;
      await win.setTheme(preference === "system" ? null : preference);
      if (firstWindowTheme) {
        firstWindowTheme = false;
        // Paint the chosen appearance before revealing the native material.
        // A hidden WKWebView may suspend animation frames. Yield one task
        // instead, then flush styles before revealing it.
        setTimeout(() => {
          getComputedStyle(document.documentElement).color;
          void win.show().catch(() => {});
        }, 0);
      }
    })
    .catch(() => {
      // Not running inside the app window, or the permission is missing: CSS still applies
    });
}

function applyTheme(mql: MediaQueryList): void {
  const root = document.documentElement;
  const pinned = root.getAttribute("data-theme");
  if (pinned) {
    root.classList.toggle("dark", pinned === "dark");
    return;
  }
  const preference = getThemePreference();
  root.classList.toggle("dark", preference === "system" ? mql.matches : preference === "dark");
  syncWindowTheme(preference);
}

export function setThemePreference(preference: ThemePreference): void {
  sessionPreference = preference;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Applies for this session only
  }
  applyTheme(window.matchMedia("(prefers-color-scheme: dark)"));
  window.dispatchEvent(new Event(THEME_CHANGED_EVENT));
}

/** Subscribe to both same-window choices and changes from another window. */
export function subscribeThemePreference(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
    sessionPreference = undefined;
    listener();
  };
  window.addEventListener(THEME_CHANGED_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_CHANGED_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function followSystemTheme(): void {
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  applyTheme(mql);
  mql.addEventListener("change", () => applyTheme(mql));
  // Keep other windows (overlay, loading) in step when the preference changes
  window.addEventListener("storage", (e) => {
    if (e.key === null || e.key === THEME_STORAGE_KEY) {
      sessionPreference = undefined;
      applyTheme(mql);
    }
  });
}
