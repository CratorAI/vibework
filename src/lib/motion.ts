/**
 * Motion helpers shared across the app (see DESIGN.md › Motion).
 *
 * - The two curves, for framer-motion and WAAPI (CSS has them as
 *   --ease-out / --ease-drawer in index.css).
 * - `useArrival`: tells "this arrived while the user was watching" apart
 *   from "this was already there when the conversation was opened", so only
 *   the former animates.
 * - The home → conversation hand-off: the home composer leaves its position
 *   behind when the first message is sent, and the docked composer travels
 *   from there.
 */

import { useRef } from "react";

export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;
export const EASE_OUT_CSS = "cubic-bezier(0.23, 1, 0.32, 1)";
export const EASE_DRAWER_CSS = "cubic-bezier(0.32, 0.72, 0, 1)";

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * The latest key that appeared (or changed) while `scope` (the open
 * conversation) stayed the same. A key already present when the scope is
 * entered never counts, unless `arrivedOnEntry` says the scope itself was
 * just created by the user (the first message sent from home). Going back to
 * null keeps the last arrival, so a class driven by it is never removed
 * mid-animation, and a class is never re-added to an element that has it.
 */
export function useArrivedKey(key: string | null, scope: string | null, arrivedOnEntry = false): string | null {
  const ref = useRef<{ scope: string | null; key: string | null; arrived: string | null } | null>(null);
  if (ref.current === null || ref.current.scope !== scope) {
    ref.current = { scope, key, arrived: arrivedOnEntry ? key : null };
  } else if (ref.current.key !== key) {
    ref.current.key = key;
    if (key !== null) ref.current.arrived = key;
  }
  return ref.current.arrived;
}

/** Whether `key` (when present) arrived while the user was watching; see useArrivedKey. */
export function useArrival(key: string | null, scope: string | null, arrivedOnEntry = false): boolean {
  const arrived = useArrivedKey(key, scope, arrivedOnEntry);
  return key !== null && arrived === key;
}

// ── Home → conversation hand-off ──────────────────────────────────────────

/** How long after the send the conversation may still pick up the hand-off */
const HANDOFF_TTL_MS = 4000;
let homeHandoff: { top: number; at: number } | null = null;

/** Home: the first message is being sent; remember where the composer sat. */
export function noteHomeSend(composer: HTMLElement | null): void {
  if (!composer) return;
  homeHandoff = { top: composer.getBoundingClientRect().top, at: performance.now() };
}

/** Home: the send failed and home stays; forget the hand-off. */
export function cancelHomeSend(): void {
  homeHandoff = null;
}

/**
 * Conversation: take the hand-off once, if a send from home just happened.
 * Returns the home composer's top edge (viewport px), or null.
 */
export function takeHomeHandoff(): number | null {
  const h = homeHandoff;
  homeHandoff = null;
  if (!h || performance.now() - h.at > HANDOFF_TTL_MS) return null;
  return h.top;
}

/**
 * Per conversation, whether it was opened by the hand-off (read once when
 * the conversation first renders, stable across re-renders of the same one).
 */
export function useHomeHandoff(scope: string | null): number | null {
  const ref = useRef<{ scope: string | null; top: number | null } | null>(null);
  if (ref.current === null || ref.current.scope !== scope) {
    ref.current = { scope, top: scope ? takeHomeHandoff() : null };
  }
  return ref.current.top;
}

/**
 * Slide an element from a previous vertical position into its own (FLIP),
 * on the compositor. Returns the animation so callers can cancel it.
 */
export function slideFrom(el: HTMLElement, fromTop: number, durationMs: number): Animation | null {
  if (prefersReducedMotion()) return null;
  const dy = fromTop - el.getBoundingClientRect().top;
  if (Math.abs(dy) < 2) return null;
  return el.animate(
    [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
    { duration: durationMs, easing: EASE_DRAWER_CSS },
  );
}
