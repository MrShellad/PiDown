import * as React from "react"
import { TrendingDown, TrendingUp } from "lucide-react"

import { cn } from "@/lib/utils"

function Statistic({
  className,
  label,
  value,
  suffix,
  description,
  trend,
  ...props
}: React.ComponentProps<"div"> & {
  label: React.ReactNode
  value: React.ReactNode
  suffix?: React.ReactNode
  description?: React.ReactNode
  trend?: "up" | "down" | "neutral"
}) {
  return (
    <div
      data-slot="statistic"
      className={cn("rounded-lg border border-border bg-card p-4", className)}
      {...props}
    >
      <div className="text-sm leading-5 text-muted-foreground">{label}</div>
      <div className="mt-2 flex items-end gap-2">
        <div className="text-2xl font-semibold leading-none tabular-nums text-foreground">
          {value}
        </div>
        {suffix ? <div className="text-sm text-muted-foreground">{suffix}</div> : null}
        {trend === "up" ? <TrendingUp className="mb-0.5 size-4 text-primary" /> : null}
        {trend === "down" ? <TrendingDown className="mb-0.5 size-4 text-destructive" /> : null}
      </div>
      {description ? (
        <div className="mt-2 text-sm leading-6 text-muted-foreground">{description}</div>
      ) : null}
    </div>
  )
}

export { Statistic }
