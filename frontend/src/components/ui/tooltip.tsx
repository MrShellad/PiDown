import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import { UI_TOKENS } from "@/core/ui-tokens"
import { cn } from "@/lib/utils"

function TooltipProvider({
  delayDuration = UI_TOKENS.tooltip.delayDuration,
  skipDelayDuration = UI_TOKENS.tooltip.skipDelayDuration,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
      {...props}
    />
  )
}

function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger(props: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = UI_TOKENS.tooltip.sideOffset,
  collisionPadding = UI_TOKENS.tooltip.collisionPadding,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "z-[var(--tooltip-z-index)] max-w-[var(--tooltip-max-width)] overflow-hidden rounded-[var(--tooltip-radius)] bg-[var(--tooltip-background)] px-[var(--tooltip-padding-x)] py-[var(--tooltip-padding-y)] text-[length:var(--tooltip-font-size)] leading-[var(--tooltip-line-height)] text-[color:var(--tooltip-foreground)] shadow-[var(--tooltip-shadow)] ring-[length:var(--tooltip-ring-width)] ring-[color:var(--tooltip-ring-color)] outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
          className
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
