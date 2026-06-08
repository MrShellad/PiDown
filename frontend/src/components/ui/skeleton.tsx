import * as React from "react"

import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-[var(--radius-md)] bg-muted", className)}
      {...props}
    />
  )
}

function SkeletonText({
  className,
  lines = 3,
  ...props
}: React.ComponentProps<"div"> & {
  lines?: number
}) {
  return (
    <div data-slot="skeleton-text" className={cn("space-y-2", className)} {...props}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn("h-4", index === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  )
}

export { Skeleton, SkeletonText }
