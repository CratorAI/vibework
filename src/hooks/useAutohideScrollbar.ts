import { useCallback, useEffect, useRef, type UIEvent } from "react";

/**
 * Shows an element's scrollbar only while it scrolls (and briefly after), as
 * macOS does. Pair the returned onScroll handler with the
 * `scrollbar-autohide` class.
 */
export function useAutohideScrollbar(hideAfterMs = 900): (e: UIEvent<HTMLElement>) => void {
  const timers = useRef(new Map<HTMLElement, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => clearTimeout(t));
  }, []);

  return useCallback(
    (e: UIEvent<HTMLElement>) => {
      const el = e.currentTarget;
      el.dataset.scrolling = "true";
      const previous = timers.current.get(el);
      if (previous) clearTimeout(previous);
      timers.current.set(
        el,
        setTimeout(() => {
          delete el.dataset.scrolling;
          timers.current.delete(el);
        }, hideAfterMs),
      );
    },
    [hideAfterMs],
  );
}
