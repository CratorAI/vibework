/**
 * Browser tab: chrome (address bar, back/forward, reload/stop, open in the
 * system browser) around a native webview the backend floats over the
 * viewport rectangle below it.
 *
 * The native view paints above every HTML element, so this component keeps
 * it in step with the page:
 * - bounds follow the viewport element (ResizeObserver + window resize),
 *   throttled to one update per animation frame and only sent when changed;
 * - it is visible only while this tab is mounted (panel open, the Browser
 *   the active tab, this conversation active), the dock says the layout is settled
 *   (not mid open/close transition, not while the window is being resized),
 *   and no menu/popover/dialog overlaps it; it is hidden on unmount.
 * One view per conversation, created on first navigation.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, Globe, RotateCw, X } from "@/lib/icons";
import {
  MAX_BROWSERS,
  browserBack,
  browserClose,
  browserForward,
  browserNavigate,
  browserNormalizeUrl,
  browserOpen,
  browserOpenExternal,
  browserReload,
  browserSetBounds,
  browserSetVisible,
  browserStop,
  type BrowserBounds,
} from "@/tauri/browser";
import { interrupt } from "@/tauri/agent";
import { useAgentBrowserActive, useAgentBrowserRequest } from "./agentEvents";
import { Spinner } from "@/components/ui/spinner";
import { cn, errorMessage } from "@/lib/utils";
import { browserViewId } from "../actions";
import { useConversationWorkspace, workspaceStore } from "../store";
import { IconButton } from "../IconButton";
import {
  browsersByAge,
  forgetBrowser,
  onBrowserViewClosed,
  touchBrowser,
  useBrowserState,
} from "./browserStates";
import { useOverlayOverlap } from "./useOverlayOverlap";

const SHORTCUTS = ["localhost:3000", "localhost:5173", "localhost:8000"];

/** Agent browser requests already opened (a Browser tab reopened later starts blank) */
const openedRequests = new WeakSet<object>();

function boundsOf(el: HTMLElement): BrowserBounds {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
}

const sameBounds = (a: BrowserBounds | null, b: BrowserBounds) =>
  !!a && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/** Close the oldest other views so a new one fits under the backend limit */
async function makeRoomFor(id: string) {
  const others = browsersByAge().filter((x) => x !== id);
  const sessions = workspaceStore.sessionsWithBrowser();
  let count = Math.max(others.length, sessions.length);
  for (const victim of others) {
    if (count < MAX_BROWSERS) break;
    await browserClose(victim).catch(() => {});
    forgetBrowser(victim);
    const session = sessions.find((s) => browserViewId(s) === victim);
    if (session) workspaceStore.setBrowserCreated(session, false);
    count--;
  }
}

export function BrowserTab({
  sessionId,
  allowNative,
  pendingUrl,
  onPendingUrlHandled,
}: {
  sessionId: string;
  /** The dock's layout is settled: the native view may be shown */
  allowNative: boolean;
  /** A URL another part of the panel asked to open (e.g. a terminal link) */
  pendingUrl: string | null;
  onPendingUrlHandled: () => void;
}) {
  const agentActive = useAgentBrowserActive(sessionId);
  const agentRequest = useAgentBrowserRequest(sessionId);
  const id = browserViewId(sessionId);
  const workspace = useConversationWorkspace(sessionId);
  const state = useBrowserState(id);
  const created = workspace.browserCreated;
  const viewport = useRef<HTMLDivElement>(null);
  const overlap = useOverlayOverlap(viewport);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const show = created && allowNative && !overlap;
  const lastBounds = useRef<BrowserBounds | null>(null);
  const shownRef = useRef(false);

  // The backend closed the view (limit, crash): forget it
  useEffect(
    () =>
      onBrowserViewClosed((closedId) => {
        if (closedId === id) workspaceStore.setBrowserCreated(sessionId, false);
      }),
    [id, sessionId],
  );

  const syncBounds = useCallback(() => {
    const el = viewport.current;
    if (!el || !created) return;
    const b = boundsOf(el);
    if (b.width <= 0 || b.height <= 0 || sameBounds(lastBounds.current, b)) return;
    lastBounds.current = b;
    browserSetBounds(id, b).catch(() => {});
  }, [id, created]);

  // Show/hide. Bounds are refreshed before showing so it never flashes at a stale rect.
  useLayoutEffect(() => {
    if (!created) return;
    if (show) {
      lastBounds.current = null;
      syncBounds();
      browserSetVisible(id, true).catch(() => {});
      shownRef.current = true;
      touchBrowser(id);
    } else if (shownRef.current) {
      browserSetVisible(id, false).catch(() => {});
      shownRef.current = false;
    }
  }, [show, created, id, syncBounds]);

  // Hide when this tab goes away (tab switch, panel close, conversation switch, leaving the page)
  useEffect(
    () => () => {
      if (shownRef.current) browserSetVisible(id, false).catch(() => {});
      shownRef.current = false;
    },
    [id],
  );

  // Keep bounds in sync while shown: viewport size changes and window resizes, one update per frame
  useEffect(() => {
    const el = viewport.current;
    if (!el || !show) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncBounds);
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    window.addEventListener("resize", schedule);
    // Position can change without a size change (e.g. the sidebar sliding); poll briefly after showing
    let polls = 30;
    const poll = () => {
      syncBounds();
      if (--polls > 0) frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [show, syncBounds]);

  const go = useCallback(
    async (input: string) => {
      const text = input.trim();
      if (!text) return;
      setError(null);
      let url: string;
      try {
        url = await browserNormalizeUrl(text);
      } catch (err) {
        setError(errorMessage(err, "That is not a web address."));
        return;
      }
      setDraft(null);
      inputRef.current?.blur();
      try {
        if (created) {
          await browserNavigate(id, url);
        } else {
          const el = viewport.current;
          if (!el) return;
          setOpening(true);
          await makeRoomFor(id);
          const bounds = boundsOf(el);
          lastBounds.current = bounds;
          await browserOpen(id, url, bounds);
          shownRef.current = true;
          touchBrowser(id);
          workspaceStore.setBrowserCreated(sessionId, true);
        }
      } catch (err) {
        setError(errorMessage(err, "Could not open that page."));
      } finally {
        setOpening(false);
      }
    },
    [created, id, sessionId],
  );

  useEffect(() => {
    if (!pendingUrl) return;
    onPendingUrlHandled();
    go(pendingUrl);
  }, [pendingUrl, go, onPendingUrlHandled]);

  useEffect(() => {
    if (!agentRequest || openedRequests.has(agentRequest) || created || opening || !allowNative) return;
    openedRequests.add(agentRequest);
    void go(agentRequest.url);
  }, [agentRequest, created, opening, allowNative, go]);

  const loading = opening || !!state?.loading;
  const shownUrl = draft ?? state?.url ?? "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
        <IconButton label="Back" disabled={!created || !state?.canGoBack} onClick={() => browserBack(id).catch(() => {})}>
          <ArrowLeft />
        </IconButton>
        <IconButton label="Forward" disabled={!created || !state?.canGoForward} onClick={() => browserForward(id).catch(() => {})}>
          <ArrowRight />
        </IconButton>
        {loading && created ? (
          <IconButton label="Stop" onClick={() => browserStop(id).catch(() => {})}>
            <X />
          </IconButton>
        ) : (
          <IconButton label="Reload" disabled={!created} onClick={() => browserReload(id).catch(() => {})}>
            <RotateCw />
          </IconButton>
        )}
        {agentActive && (
          <span
            role="status"
            className="flex h-7 shrink-0 items-center gap-0.5 rounded-md bg-muted pr-0.5 pl-2 text-meta text-foreground"
          >
            <span className="text-shimmer">Agent browsing</span>
            <button
              type="button"
              onClick={() => interrupt(sessionId).catch(console.error)}
              className="h-6 rounded px-1.5 text-muted-foreground transition-colors outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              Stop
            </button>
          </span>
        )}
        <form
          className="relative min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            go(shownUrl);
          }}
        >
          <div className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground">
            {loading ? <Spinner className="size-3.5" /> : <Globe className="size-3.5" />}
          </div>
          <input
            ref={inputRef}
            value={shownUrl}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={() => setDraft((d) => (d !== null && d.trim() === "" ? null : d))}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setDraft(null);
                setError(null);
                e.currentTarget.blur();
              }
            }}
            placeholder="Enter a URL or localhost:port"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label="Address"
            aria-invalid={error ? true : undefined}
            className={cn(
              "h-7 w-full rounded-md border border-transparent bg-muted pr-2.5 pl-8 text-meta text-foreground transition-colors placeholder:text-muted-foreground focus:border-border focus:bg-background focus:outline-none",
              error && "border-destructive/50",
            )}
          />
        </form>
        <IconButton label="Open in browser" disabled={!created || !state?.url} onClick={() => browserOpenExternal(id).catch(() => {})}>
          <ExternalLink />
        </IconButton>
      </div>
      {error && <div className="shrink-0 border-b bg-destructive-muted px-3 py-1.5 text-meta text-destructive select-text">{error}</div>}

      {/* The native view is placed over this rectangle */}
      <div ref={viewport} className="relative min-h-0 flex-1 bg-background" data-browser-viewport>
        {!created && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <Globe className="size-5 text-muted-foreground" />
            <p className="max-w-xs text-sm text-muted-foreground">
              Open a page or a local server next to the conversation.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {SHORTCUTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => go(s)}
                  className="h-7 rounded-md border px-2.5 font-mono text-xs text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
