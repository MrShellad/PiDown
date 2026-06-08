import * as React from "react"

import { cn } from "@/lib/utils"

function Toolbar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="toolbar"
      role="toolbar"
      className={cn(
        "flex min-h-17 w-full shrink-0 items-stretch overflow-hidden rounded-[var(--radius)] bg-card text-card-foreground shadow-[0_14px_32px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.05)]",
        className
      )}
      {...props}
    />
  )
}

function ToolbarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="toolbar-group"
      className={cn("flex items-stretch", className)}
      {...props}
    />
  )
}

function ToolbarSeparator({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="toolbar-separator"
      aria-hidden="true"
      className={cn("flex w-px items-center self-stretch py-3 before:block before:h-full before:w-px before:bg-border/80 before:shadow-[0_0_8px_rgba(255,255,255,0.08)]", className)}
      {...props}
    />
  )
}

function ToolbarButton({
  className,
  icon,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: React.ReactNode
}) {
  return (
    <button
      data-slot="toolbar-button"
      type="button"
      className={cn(
        "group/toolbar-button flex min-w-22 items-center justify-center gap-2 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-40",
        className
      )}
      {...props}
    >
      {icon ? (
        <span
          data-slot="toolbar-button-icon"
          className="flex size-5 items-center justify-center text-muted-foreground transition-colors group-hover/toolbar-button:text-foreground [&_svg]:size-5"
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
      <span data-slot="toolbar-button-label" className="whitespace-nowrap leading-5">
        {children}
      </span>
    </button>
  )
}

function ToolbarPrimaryButton({
  className,
  icon,
  actionIcon,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: React.ReactNode
  actionIcon?: React.ReactNode
}) {
  return (
    <button
      data-slot="toolbar-primary-button"
      type="button"
      className={cn(
        "flex min-w-44 items-center justify-between gap-3 bg-muted/55 px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    >
      <span className="flex min-w-0 items-center gap-3">
        {icon ? (
          <span
            data-slot="toolbar-primary-icon"
            className="grid size-8 shrink-0 place-items-center text-foreground [&_svg]:size-5"
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
        <span data-slot="toolbar-primary-label" className="truncate leading-5">
          {children}
        </span>
      </span>
      {actionIcon ? (
        <span
          data-slot="toolbar-primary-action"
          className="grid size-8 shrink-0 place-items-center rounded-[var(--radius)] bg-primary text-primary-foreground shadow-[var(--button-glow)] [&_svg]:size-4"
          aria-hidden="true"
        >
          {actionIcon}
        </span>
      ) : null}
    </button>
  )
}

export { Toolbar, ToolbarButton, ToolbarGroup, ToolbarPrimaryButton, ToolbarSeparator }
