import { useEffect, useRef, useState } from "react";

/** Aim to drain any backlog in roughly this long: small backlogs trickle at a
 * readable pace, large ones catch up fast, so the display never lags far
 * behind what has arrived. */
const DRAIN_MS = 300;
/** Once the stream has ended, finish the remaining backlog this much faster
 * instead of dumping it in one frame. */
const SETTLE_DRAIN_MS = 120;
/** Backlogs above this snap instantly (switching back to a busy session, a
 * hidden window). */
const SNAP_THRESHOLD = 1500;

const reducedMotion =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

/** Leading whitespace length (history reloads come back trimmed). */
function leadingSpace(s: string): number {
  return s.length - s.trimStart().length;
}

/**
 * Paces streamed text for display.
 *
 * Deltas arrive in irregular bursts; rendering each burst as-is makes text
 * jump in chunks. This releases characters once per animation frame at a rate
 * proportional to the backlog, which turns the bursts into a steady reveal.
 * There is no per-word animation: the pacing alone reads as smooth typing.
 *
 * When `enabled` turns off (the turn ended) with characters still unrevealed,
 * they finish quickly rather than appearing all at once.
 * Text that was never being paced (history, a reopened conversation) shows in
 * full immediately, as does everything when the user prefers reduced motion,
 * when the backlog is huge, or when `text` was replaced rather than extended.
 */
export function useSmoothedText(text: string, enabled: boolean): string {
  // Reduced motion means no pacing at all; show the complete text.
  const reduce = Boolean(reducedMotion?.matches);
  const pacing = enabled && !reduce;
  const [length, setLength] = useState(() => text.length);
  const textRef = useRef(text);
  const lengthRef = useRef(text.length);
  // True while pacing, and after it until the backlog has drained.
  const revealingRef = useRef(pacing);
  if (pacing) revealingRef.current = true;

  // Track the latest text. A value that was replaced (not extended) or shrank
  // snaps to full, so a paced slice of unrelated text never renders; the same
  // text with its whitespace trimmed (the history copy) keeps its place.
  useEffect(() => {
    const prev = textRef.current;
    textRef.current = text;
    if (text.startsWith(prev) && lengthRef.current <= text.length) return;
    if (revealingRef.current && prev.trim() === text.trim()) {
      const shift = leadingSpace(prev) - leadingSpace(text);
      lengthRef.current = Math.max(
        0,
        Math.min(text.length, lengthRef.current - shift),
      );
    } else {
      lengthRef.current = text.length;
    }
    setLength(lengthRef.current);
  }, [text]);

  useEffect(() => {
    const finish = () => {
      revealingRef.current = false;
      lengthRef.current = textRef.current.length;
      setLength(lengthRef.current);
    };
    if (reduce || (!pacing && lengthRef.current >= textRef.current.length)) {
      finish();
      return;
    }

    let frame = 0;
    let last = performance.now();
    const drainMs = pacing ? DRAIN_MS : SETTLE_DRAIN_MS;

    const tick = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      const target = textRef.current.length;
      const backlog = target - lengthRef.current;

      if (backlog > 0) {
        const release =
          backlog > SNAP_THRESHOLD || document.hidden
            ? backlog
            : Math.max(1, Math.round((backlog * dt) / drainMs));
        lengthRef.current = Math.min(target, lengthRef.current + release);
        setLength(lengthRef.current);
      }
      if (!pacing && lengthRef.current >= target) {
        finish();
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [pacing, reduce]);

  if (!revealingRef.current) return text;
  return text.slice(0, Math.min(length, text.length));
}
