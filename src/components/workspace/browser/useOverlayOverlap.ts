/**
 * Whether a menu, popover or dialog is open over an element. The native
 * browser view paints above all HTML, so it hides while this is true.
 *
 * Radix portals mount as direct children of <body>, so watching body's
 * children (not the whole tree) is enough and stays cheap while a reply
 * streams. Popovers settle their position over a few frames, so each change
 * is re-checked for a short while. Tooltips and toasts are ignored.
 */

import { useEffect, useState, type RefObject } from "react";

const MODAL_SELECTOR = '[role="dialog"], [role="alertdialog"]';
const POPPER_SELECTOR = "[data-radix-popper-content-wrapper]";
const RECHECK_FRAMES = 20;

function intersects(a: DOMRect, b: DOMRect): boolean {
  return a.width > 0 && a.height > 0 && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function overlapping(target: HTMLElement): boolean {
  const rect = target.getBoundingClientRect();
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(MODAL_SELECTOR))) {
    if (target.contains(el)) continue;
    if (el.getClientRects().length > 0) return true;
  }
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(POPPER_SELECTOR))) {
    if (el.querySelector('[role="tooltip"], [data-slot="tooltip-content"]')) continue;
    if (intersects(el.getBoundingClientRect(), rect)) return true;
  }
  return false;
}

export function useOverlayOverlap(ref: RefObject<HTMLElement | null>): boolean {
  const [overlap, setOverlap] = useState(false);

  useEffect(() => {
    let frame = 0;
    let remaining = 0;
    const check = () => {
      const el = ref.current;
      setOverlap(el ? overlapping(el) : false);
    };
    const tick = () => {
      check();
      if (--remaining > 0) frame = requestAnimationFrame(tick);
    };
    const schedule = () => {
      remaining = RECHECK_FRAMES;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true });
    check();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [ref]);

  return overlap;
}
