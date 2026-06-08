import * as React from "react"
import { Inbox } from "lucide-react"

import { cn } from "@/lib/utils"

function Empty({
  className,
  icon,
  title,
  description,
  action,
  ...props
}: React.ComponentProps<"div"> & {
  icon?: React.ReactNode
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div
      data-slot="empty"
      className={cn(
        "flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/40 p-6 text-center",
        className
      )}
      {...props}
    >
      <div
        data-slot="empty-icon"
        className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        {icon ?? <Inbox className="size-5" />}
      </div>
      <div className="space-y-1">
        {title ? (
          <div data-slot="empty-title" className="text-sm font-semibold leading-5">
            {title}
          </div>
        ) : null}
        {description ? (
          <div data-slot="empty-description" className="text-sm leading-6 text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
      {action ? <div data-slot="empty-action">{action}</div> : null}
    </div>
  )
}

export { Empty }
