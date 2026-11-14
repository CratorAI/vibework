import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { forwardRef } from "react"

function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
    />
  )
}

function CollapsibleContent({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      {...props}
    />
  )
}

interface AnimatedCollapsibleContentProps {
  isOpen: boolean
  children: React.ReactNode
  className?: string
}

const AnimatedCollapsibleContent = forwardRef<
  HTMLDivElement,
  AnimatedCollapsibleContentProps
>(({ isOpen, children, className }, ref) => {
  const reduceMotion = useReducedMotion()
  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          ref={ref}
          data-slot="animated-collapsible-content"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          style={{ overflow: "hidden" }}
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
})

AnimatedCollapsibleContent.displayName = "AnimatedCollapsibleContent"

export { Collapsible, CollapsibleTrigger, CollapsibleContent, AnimatedCollapsibleContent }
