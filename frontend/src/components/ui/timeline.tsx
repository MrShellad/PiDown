import * as React from "react"

import { cn } from "@/lib/utils"

function Timeline({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol data-slot="timeline" className={cn("space-y-4", className)} {...props} />
  )
}

function TimelineItem({
  className,
  marker,
  title,
  time,
  children,
  ...props
}: React.ComponentProps<"li"> & {
  marker?: React.ReactNode
  title?: React.ReactNode
  time?: React.ReactNode
}) {
  return (
    <li data-slot="timeline-item" className={cn("relative pl-7", className)} {...props}>
      <span className="absolute left-0 top-1 flex size-4 items-center justify-center rounded-full border border-primary bg-background text-primary">
        {marker}
      </span>
      <span className="absolute bottom-[-1rem] left-[0.4375rem] top-5 w-px bg-border" />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {title ? <div className="text-sm font-medium leading-5">{title}</div> : null}
        {time ? <time className="text-xs text-muted-foreground">{time}</time> : null}
      </div>
      {children ? <div className="mt-1 text-sm leading-6 text-muted-foreground">{children}</div> : null}
    </li>
  )
}

export { Timeline, TimelineItem }
