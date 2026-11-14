"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  )
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

/*
 * Moving along a row of icons, the first tooltip fades in and the next ones
 * appear at once (each Tooltip has its own provider, so Radix's own
 * skip-delay can't tell): when one was showing a moment ago, the new one is
 * marked `data-instant` as its node mounts, before its first paint.
 */
const INSTANT_WITHIN_MS = 300
const tooltipsShowing = new Set<HTMLElement>()
const tooltipsDecided = new WeakSet<HTMLElement>()
let lastTooltipHidden = -Infinity

// Radix re-composes the content's ref, so this can run more than once for
// the same node: the decision is made once, on the node's first attach.
function trackTooltipNode(node: HTMLDivElement | null) {
  if (!node) return
  if (!tooltipsDecided.has(node)) {
    tooltipsDecided.add(node)
    if (tooltipsShowing.size > 0 || performance.now() - lastTooltipHidden < INSTANT_WITHIN_MS) {
      node.setAttribute("data-instant", "")
    }
  }
  tooltipsShowing.add(node)
  return () => {
    tooltipsShowing.delete(node)
    // Only a real removal counts as hidden (refs are also detached and
    // re-attached while the node stays)
    queueMicrotask(() => {
      if (!node.isConnected) lastTooltipHidden = performance.now()
    })
  }
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        ref={trackTooltipNode}
        sideOffset={sideOffset}
        className={cn(
          "bg-foreground text-background data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-97 data-[state=delayed-open]:animation-duration-120 data-instant:animate-none! ease-(--ease-out) data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:animation-duration-100 z-[70] w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md px-2 py-1 text-xs text-balance",
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="bg-foreground fill-foreground z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
