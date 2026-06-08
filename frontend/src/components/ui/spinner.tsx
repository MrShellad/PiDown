import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { LoaderCircle } from "lucide-react"

import { cn } from "@/lib/utils"

const spinnerVariants = cva("animate-spin text-muted-foreground", {
  variants: {
    size: {
      sm: "size-4",
      default: "size-5",
      lg: "size-6",
    },
  },
  defaultVariants: {
    size: "default",
  },
})

function Spinner({
  className,
  size,
  label = "Loading",
  ...props
}: React.ComponentProps<"svg"> &
  VariantProps<typeof spinnerVariants> & {
    label?: string
  }) {
  return (
    <LoaderCircle
      data-slot="spinner"
      role="status"
      aria-label={label}
      className={cn(spinnerVariants({ size, className }))}
      {...props}
    />
  )
}

function LoadingOverlay({
  className,
  label = "Loading",
  ...props
}: React.ComponentProps<"div"> & {
  label?: string
}) {
  return (
    <div
      data-slot="loading-overlay"
      className={cn(
        "absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-background/60 backdrop-blur-sm",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground shadow-sm">
        <Spinner size="sm" label={label} />
        <span>{label}</span>
      </div>
    </div>
  )
}

export { LoadingOverlay, Spinner, spinnerVariants }
