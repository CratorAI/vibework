/**
 * Browser API module
 * A native webview floated over a rectangle of the main window. It always
 * paints above the page's HTML, so the frontend must hide it whenever
 * something should be on top of it, and keep its bounds in sync.
 * Errors reject with a readable string.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Backend limit on browser views */
export const MAX_BROWSERS = 4;

/** Logical pixels from the top-left of the window's content (getBoundingClientRect values) */
export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserState {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

/** Create the view (or reuse the one with this id) and load `url` */
export async function browserOpen(id: string, url: string, bounds: BrowserBounds, restrictedOrigin?: string): Promise<{ id: string }> {
  return await invoke<{ id: string }>("browser_open", { id, url, bounds, restrictedOrigin });
}

export async function browserSetBounds(id: string, bounds: BrowserBounds): Promise<void> {
  await invoke("browser_set_bounds", { id, bounds });
}

export async function browserSetVisible(id: string, visible: boolean): Promise<void> {
  await invoke("browser_set_visible", { id, visible });
}

export async function browserNavigate(id: string, url: string): Promise<void> {
  await invoke("browser_navigate", { id, url });
}

export async function browserBack(id: string): Promise<void> {
  await invoke("browser_back", { id });
}

export async function browserForward(id: string): Promise<void> {
  await invoke("browser_forward", { id });
}

export async function browserReload(id: string): Promise<void> {
  await invoke("browser_reload", { id });
}

export async function browserStop(id: string): Promise<void> {
  await invoke("browser_stop", { id });
}

export async function browserClose(id: string): Promise<void> {
  await invoke("browser_close", { id });
}

/** Open the view's current page in the system browser */
export async function browserOpenExternal(id: string): Promise<void> {
  await invoke("browser_open_external", { id });
}

export async function browserState(id: string): Promise<BrowserState> {
  return await invoke<BrowserState>("browser_state", { id });
}

/** "localhost:3000" -> "http://localhost:3000/"; rejects with a readable message if not a URL */
export async function browserNormalizeUrl(input: string): Promise<string> {
  return await invoke<string>("browser_normalize_url", { input });
}

export async function onBrowserState(handler: (state: BrowserState) => void): Promise<UnlistenFn> {
  return await listen<BrowserState>("browser:state", (e) => handler(e.payload));
}

export async function onBrowserClosed(handler: (event: { id: string }) => void): Promise<UnlistenFn> {
  return await listen<{ id: string }>("browser:closed", (e) => handler(e.payload));
}

export const browserApi = {
  open: browserOpen,
  setBounds: browserSetBounds,
  setVisible: browserSetVisible,
  navigate: browserNavigate,
  back: browserBack,
  forward: browserForward,
  reload: browserReload,
  stop: browserStop,
  close: browserClose,
  openExternal: browserOpenExternal,
  state: browserState,
  normalizeUrl: browserNormalizeUrl,
  onState: onBrowserState,
  onClosed: onBrowserClosed,
} as const;
