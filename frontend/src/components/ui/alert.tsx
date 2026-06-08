import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border px-4 py-3 text-sm leading-6",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-card-foreground",
        info: "border-primary/20 bg-primary/10 text-foreground",
        success: "border-primary/20 bg-primary/10 text-foreground",
        warning: "border-border bg-muted text-foreground",
        destructive: "border-destructive/30 bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function defaultAlertIcon(variant: VariantProps<typeof alertVariants>["variant"]) {
  if (variant === "destructive") return <AlertCircle className="size-4" />
  if (variant === "warning") return <TriangleAlert className="size-4" />
  if (variant === "success") return <CheckCircle2 className="size-4" />
  return <Info className="size-4" />
}

function Alert({
  className,
  variant,
  icon,
  children,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof alertVariants> & {
    icon?: React.ReactNode
  }) {
  return (
    <div
      data-slot="alert"
      role={variant === "destructive" ? "alert" : "status"}
      className={cn(alertVariants({ variant, className }))}
      {...props}
    >
      <div data-slot="alert-icon" className="mt-1">
        {icon ?? defaultAlertIcon(variant)}
      </div>
      <div data-slot="alert-content" className="min-w-0">
        {children}
      </div>
    </div>
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("font-semibold leading-5 text-foreground", className)}
      {...props}
    />
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("mt-1 text-sm leading-6 text-muted-foreground", className)}
      {...props}
    />
  )
}

export { Alert, AlertDescription, AlertTitle, alertVariants }
