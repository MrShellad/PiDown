import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

const progressVariants = cva(
  "relative flex w-full items-center overflow-hidden rounded-full bg-muted",
  {
    variants: {
      size: {
        sm: "h-1",
        default: "h-2",
        lg: "h-3",
      },
      variant: {
        default: "[&>[data-slot=progress-indicator]]:bg-primary",
        secondary: "[&>[data-slot=progress-indicator]]:bg-muted-foreground",
        destructive: "[&>[data-slot=progress-indicator]]:bg-destructive",
      },
    },
    defaultVariants: {
      size: "sm",
      variant: "default",
    },
  }
)

function Progress({
  className,
  value,
  max = 100,
  size,
  variant,
  showValue = false,
  valueLabel,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> &
  VariantProps<typeof progressVariants> & {
    showValue?: boolean
    valueLabel?: string
  }) {
  const safeMax = typeof max === "number" && max > 0 ? max : 100
  const numericValue = typeof value === "number" ? value : 0
  const percentage = Math.min(100, Math.max(0, (numericValue / safeMax) * 100))

  return (
    <div data-slot="progress-wrapper" className="flex items-center gap-3">
      <ProgressPrimitive.Root
        data-slot="progress"
        value={value}
        max={max}
        className={cn(progressVariants({ size, variant, className }))}
        {...props}
      >
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className="size-full flex-1 transition-transform duration-200 ease-out"
          style={{ transform: `translateX(-${100 - percentage}%)` }}
        />
      </ProgressPrimitive.Root>
      {showValue ? (
        <span className="min-w-10 text-right text-xs tabular-nums text-muted-foreground">
          {valueLabel ?? `${Math.round(percentage)}%`}
        </span>
      ) : null}
    </div>
  )
}

export { Progress, progressVariants }
