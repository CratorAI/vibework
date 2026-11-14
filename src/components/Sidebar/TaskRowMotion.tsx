import { forwardRef, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { EASE_DRAWER, EASE_OUT } from "@/lib/motion";

/**
 * A task row's movement in the sidebar list (inside an AnimatePresence with
 * initial={false}, so rows already there when the list first shows stay
 * still):
 * - a new row (a task just started, moved back from Settled, restored by
 *   Undo) opens its slot and fades in; a leaving row (settled, deleted)
 *   fades and closes its slot, so the rows below follow it up;
 * - when the order changes (a task that needs the user goes to the top),
 *   rows slide to their new places on the drawer curve.
 *
 * `layoutKey` changes only when the list's order or row heights change, so
 * the positions are measured then and not on every render (the list
 * re-renders on every stream flush while a task works).
 */
export const TaskRowMotion = forwardRef<HTMLDivElement, { layoutKey: string; children: ReactNode }>(
  function TaskRowMotion({ layoutKey, children }, ref) {
    // Reduced motion: rows fade; nothing opens, closes or slides
    const reduce = useReducedMotion();
    return (
      <motion.div
        ref={ref}
        // Contains the row's margin, so the slot is the same height while
        // animating (overflow hidden) and at rest
        className="flow-root"
        layout={reduce ? false : "position"}
        layoutDependency={layoutKey}
        initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0, overflow: "hidden" }}
        animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
        exit={{
          height: reduce ? "auto" : 0,
          opacity: 0,
          overflow: "hidden",
          transition: { height: { duration: 0.2, ease: EASE_OUT }, opacity: { duration: 0.12, ease: EASE_OUT } },
        }}
        transition={{
          layout: { duration: 0.28, ease: EASE_DRAWER },
          height: { duration: 0.22, ease: EASE_OUT },
          opacity: { duration: 0.18, ease: EASE_OUT, delay: 0.04 },
        }}
      >
        {children}
      </motion.div>
    );
  },
);
