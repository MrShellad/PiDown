import * as React from "react"
import { Search, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

type ToolbarTooltipProps = {
  tooltip?: React.ReactNode
  tooltipSide?: React.ComponentProps<typeof TooltipContent>["side"]
}

function ToolbarTooltip({
  content,
  disabled,
  side = "bottom",
  children,
}: {
  content?: React.ReactNode
  disabled?: boolean
  side?: React.ComponentProps<typeof TooltipContent>["side"]
  children: React.ReactElement
}) {
  if (!content) return children

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {disabled ? (
          <span data-slot="toolbar-tooltip-trigger" className="flex items-stretch self-stretch">
            {children}
          </span>
        ) : (
          children
        )}
      </TooltipTrigger>
      <TooltipContent side={side}>{content}</TooltipContent>
    </Tooltip>
  )
}

function Toolbar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="toolbar"
      role="toolbar"
      className={cn(
        "flex min-h-17 w-full shrink-0 items-stretch overflow-hidden rounded-lg bg-toolbar text-card-foreground shadow-toolbar-glow",
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
      className={cn("flex w-px items-center self-stretch py-3 before:block before:h-full before:w-px before:bg-border/80 before:shadow-divider-glow", className)}
      {...props}
    />
  )
}

function ToolbarButton({
  className,
  icon,
  tooltip,
  tooltipSide,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: React.ReactNode
} & ToolbarTooltipProps) {
  const button = (
    <button
      data-slot="toolbar-button"
      type="button"
      disabled={disabled}
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

  return (
    <ToolbarTooltip content={tooltip} disabled={disabled} side={tooltipSide}>
      {button}
    </ToolbarTooltip>
  )
}

function ToolbarPrimaryButton({
  className,
  icon,
  actionIcon,
  tooltip,
  tooltipSide,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: React.ReactNode
  actionIcon?: React.ReactNode
} & ToolbarTooltipProps) {
  const button = (
    <button
      data-slot="toolbar-primary-button"
      type="button"
      disabled={disabled}
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
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground [&_svg]:size-4"
          aria-hidden="true"
        >
          {actionIcon}
        </span>
      ) : null}
    </button>
  )

  return (
    <ToolbarTooltip content={tooltip} disabled={disabled} side={tooltipSide}>
      {button}
    </ToolbarTooltip>
  )
}

export interface PageHeaderToolbarProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode
  description?: React.ReactNode
  leftActions?: React.ReactNode
  searchQuery?: string
  onSearchQueryChange?: (query: string) => void
  searchPlaceholder?: string
  rightActions?: React.ReactNode
  expandedSearchClassName?: string
}

function PageHeaderToolbar({
  className,
  title,
  description,
  leftActions,
  searchQuery,
  onSearchQueryChange,
  searchPlaceholder = "搜索...",
  rightActions,
  expandedSearchClassName,
  children,
  ...props
}: PageHeaderToolbarProps) {
  const [isSearchFocused, setIsSearchFocused] = React.useState(false)
  const isExpanded = isSearchFocused || !!searchQuery

  return (
    <div
      data-slot="page-header-toolbar"
      role="toolbar"
      className={cn(
        "flex min-h-17 w-full shrink-0 items-stretch overflow-hidden rounded-lg bg-toolbar text-card-foreground shadow-toolbar-glow border border-border/30 relative",
        className
      )}
      {...props}
    >
      {/* Left section */}
      <div className="flex items-stretch min-w-0">
        {title && (
          <div className={cn(
            "flex flex-col justify-center px-5 py-2 min-w-0 shrink-0",
            leftActions && "border-r border-border/40"
          )}>
            {typeof title === "string" ? (
              <h2 className="text-sm font-bold text-foreground tracking-wide truncate leading-5">{title}</h2>
            ) : (
              title
            )}
            {description && (
              <p className="text-2xs text-muted-foreground truncate leading-4 mt-0.5">{description}</p>
            )}
          </div>
        )}
        {leftActions}
      </div>

      {/* Middle section: Search Input */}
      {onSearchQueryChange !== undefined && (
        <div
          className={cn(
            "transition-all duration-300 self-stretch",
            isExpanded
              ? cn("absolute inset-y-0 left-0 bg-toolbar px-5 z-20 flex items-center justify-end", expandedSearchClassName || "right-0")
              : "relative w-36 ml-auto flex items-center justify-end px-3"
          )}
        >
          <div className={cn(
            "relative w-full flex items-center group transition-all duration-300",
            isExpanded ? "max-w-md" : "max-w-[144px]"
          )}>
            <Search className="absolute left-3 size-4 text-muted-foreground/60 group-focus-within:text-primary transition-colors pointer-events-none" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchQuery || ""}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="w-full h-9 pl-9 pr-8 rounded-md border border-border/80 bg-background/50 hover:bg-background/80 focus:bg-background focus:border-primary/50 focus:ring-2 focus:ring-primary/20 text-xs outline-none transition placeholder:text-muted-foreground/60 text-foreground"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchQueryChange("")}
                className="absolute right-2.5 p-0.5 rounded hover:bg-muted text-muted-foreground/80 hover:text-foreground transition-colors cursor-pointer"
                aria-label="清空搜索"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Right section */}
      {rightActions}
      {children}
    </div>
  )
}

export { Toolbar, ToolbarButton, ToolbarGroup, ToolbarPrimaryButton, ToolbarSeparator, PageHeaderToolbar }
