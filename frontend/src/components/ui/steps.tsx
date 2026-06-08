import * as React from "react"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

type StepStatus = "wait" | "process" | "finish" | "error"

function Steps({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="steps"
      className={cn("grid gap-3 sm:grid-flow-col sm:auto-cols-fr", className)}
      {...props}
    />
  )
}

function Step({
  className,
  status = "wait",
  title,
  description,
  index,
  ...props
}: React.ComponentProps<"li"> & {
  status?: StepStatus
  title: React.ReactNode
  description?: React.ReactNode
  index?: number
}) {
  return (
    <li
      data-slot="step"
      data-status={status}
      className={cn("group flex gap-3", className)}
      {...props}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
          status === "finish" && "border-primary bg-primary text-primary-foreground",
          status === "process" && "border-primary text-primary",
          status === "error" && "border-destructive text-destructive",
          status === "wait" && "border-border text-muted-foreground"
        )}
      >
        {status === "finish" ? <Check className="size-4" /> : index}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-5 text-foreground">{title}</span>
        {description ? (
          <span className="mt-1 block text-sm leading-6 text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
    </li>
  )
}

export { Step, Steps, type StepStatus }
