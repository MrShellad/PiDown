import * as React from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { UI_TEXT } from "@/core/locale"
import { cn } from "@/lib/utils"
import {
  SPEED_DISPLAY_ICON,
  SPEED_DISPLAY_LABEL,
  type SpeedDisplayMode,
} from "./speedDisplay"

interface DownloadSpeedDisplayProps extends React.ComponentPropsWithoutRef<"div"> {
  mode: SpeedDisplayMode
  value: string
  onModeClick: () => void
  onOpenLimits: () => void
}

export const DownloadSpeedDisplay = React.forwardRef<HTMLDivElement, DownloadSpeedDisplayProps>(
function DownloadSpeedDisplay({
  mode,
  value,
  onModeClick,
  onOpenLimits,
  className,
  onClick,
  onKeyDown,
  ...props
}, ref) {
  const SpeedIcon = SPEED_DISPLAY_ICON[mode]

  const handleRootClick = (event: React.MouseEvent<HTMLDivElement>) => {
    onOpenLimits()
    onClick?.(event)
  }

  const handleRootKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented || (event.key !== "Enter" && event.key !== " ")) return

    event.preventDefault()
    event.currentTarget.click()
  }

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      className={cn(
        "ml-auto flex items-stretch focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        className
      )}
      aria-label={UI_TEXT.dashboard.openSpeedLimitPopover}
      {...props}
      onClick={handleRootClick}
      onKeyDown={handleRootKeyDown}
    >
      <div
        className="group/speed-display flex h-full w-58 shrink-0 cursor-pointer items-center justify-end gap-3 overflow-hidden border-l border-border/30 bg-transparent px-4 text-right transition-colors"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary transition-all duration-200 hover:bg-primary/20 group-hover/speed-display:scale-105 group-hover/speed-display:bg-primary/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&_svg]:size-5"
              onClick={(event) => {
                event.stopPropagation()
                onModeClick()
              }}
              aria-label={`切换速度显示模式，当前为${SPEED_DISPLAY_LABEL[mode]}`}
            >
              <SpeedIcon />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{UI_TEXT.dashboard.switchSpeedDisplayMode}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex h-full min-w-0 max-w-34 flex-1 items-center justify-end truncate rounded-md text-right font-mono text-xl font-black leading-none tracking-tight text-foreground tabular-nums">
              <span className="min-w-0 truncate">{value}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">{UI_TEXT.dashboard.openSpeedLimitPopover}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
})
