import {
  CloudDownload,
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  ListEnd,
  ListPlus,
  ListStart,
  Pause,
  Play,
  Square,
  Trash2,
  Link,
} from "lucide-react"
import { useState } from "react"

import {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarPrimaryButton,
  ToolbarSeparator,
} from "@/components/ui/toolbar"
import { UI_TEXT } from "@/core/locale"
import { useDownloadStore } from "@/core/store/useDownloadStore"

type SpeedDisplayMode = "download" | "upload" | "transfer"

const SPEED_DISPLAY_MODES: SpeedDisplayMode[] = ["download", "upload", "transfer"]

const SPEED_DISPLAY_LABEL: Record<SpeedDisplayMode, string> = {
  download: "下载",
  upload: "上传",
  transfer: "总计",
}

const SPEED_DISPLAY_ICON: Record<SpeedDisplayMode, typeof ArrowDown> = {
  download: ArrowDown,
  upload: ArrowUp,
  transfer: ChevronsUpDown,
}

interface DownloadToolbarProps {
  canClearCompleted?: boolean
  className?: string
  onCreateTask: () => void
  onClearCompleted?: () => void
}

export default function DownloadToolbar({
  canClearCompleted,
  className,
  onCreateTask,
  onClearCompleted,
}: DownloadToolbarProps) {
  const [speedMode, setSpeedMode] = useState<SpeedDisplayMode>("download")
  const globalDownloadSpeed = useDownloadStore((state) => state.globalDownloadSpeed)
  const globalUploadSpeed = useDownloadStore((state) => state.globalUploadSpeed)
  const globalTransferSpeed = useDownloadStore((state) => state.globalTransferSpeed)

  const speedValue =
    speedMode === "download"
      ? globalDownloadSpeed
      : speedMode === "upload"
        ? globalUploadSpeed
        : globalTransferSpeed
  const SpeedIcon = SPEED_DISPLAY_ICON[speedMode]

  const cycleSpeedMode = () => {
    setSpeedMode((current) => {
      const currentIndex = SPEED_DISPLAY_MODES.indexOf(current)
      return SPEED_DISPLAY_MODES[(currentIndex + 1) % SPEED_DISPLAY_MODES.length]
    })
  }

  return (
    <Toolbar className={className} aria-label="下载任务工具栏">
      <ToolbarPrimaryButton
        onClick={onCreateTask}
        icon={<Link />}
        actionIcon={<CloudDownload />}
        aria-label={UI_TEXT.dashboard.newDownload}
      >
        {UI_TEXT.dashboard.newDownload}
      </ToolbarPrimaryButton>

      <ToolbarSeparator />

      <ToolbarGroup>
        <ToolbarButton icon={<Play />} disabled>
          {UI_TEXT.dashboard.resume}
        </ToolbarButton>
        <ToolbarButton icon={<Pause />} disabled>
          {UI_TEXT.dashboard.pause}
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <ToolbarButton icon={<ListStart />} disabled>
          {UI_TEXT.dashboard.startQueue}
        </ToolbarButton>
        <ToolbarButton icon={<ListEnd />} disabled>
          {UI_TEXT.dashboard.stopQueue}
        </ToolbarButton>
        <ToolbarButton icon={<ListPlus />} disabled>
          {UI_TEXT.dashboard.queue}
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <ToolbarButton icon={<Square />} disabled>
          {UI_TEXT.dashboard.stopAll}
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <ToolbarButton
          icon={<Trash2 />}
          onClick={onClearCompleted}
          disabled={!canClearCompleted || !onClearCompleted}
        >
          {UI_TEXT.dashboard.delete}
        </ToolbarButton>
      </ToolbarGroup>

      <div className="ml-auto flex items-stretch">
        <button
          type="button"
          className="group/speed-display flex h-full min-w-46 items-center justify-end gap-3 border-l border-border/80 bg-background/35 px-4 text-right transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          onClick={cycleSpeedMode}
          aria-label={`切换全局速度显示，当前为${SPEED_DISPLAY_LABEL[speedMode]}`}
          title="点击切换下载、上传、总计速度"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary transition-colors group-hover/speed-display:bg-primary/15 [&_svg]:size-5">
            <SpeedIcon />
          </span>
          <span className="min-w-26 truncate font-mono text-xl font-black leading-none tracking-tight text-foreground tabular-nums">
            {speedValue}
          </span>
        </button>
      </div>
    </Toolbar>
  )
}
