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
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SettingsInput } from "@/components/settings/SettingsPrimitives"
import {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarPrimaryButton,
  ToolbarSeparator,
} from "@/components/ui/toolbar"
import { UI_TEXT } from "@/core/locale"
import { useAppSettingsStore } from "@/core/store/useAppSettingsStore"
import { useDownloadStore } from "@/core/store/useDownloadStore"
import { parseNullableSpeedLimit } from "@/core/transfer"

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

const SPEED_CLICK_DELAY_MS = 260

interface DownloadToolbarProps {
  className?: string
  selectedTaskCount?: number
  selectedPauseCount?: number
  selectedResumeCount?: number
  onCreateTask: () => void
  onPauseSelected?: () => void
  onResumeSelected?: () => void
  onDeleteSelected?: () => void
}

export default function DownloadToolbar({
  className,
  selectedTaskCount = 0,
  selectedPauseCount = 0,
  selectedResumeCount = 0,
  onCreateTask,
  onPauseSelected,
  onResumeSelected,
  onDeleteSelected,
}: DownloadToolbarProps) {
  const [speedMode, setSpeedMode] = useState<SpeedDisplayMode>("download")
  const [limitDialogOpen, setLimitDialogOpen] = useState(false)
  const [downloadLimitInput, setDownloadLimitInput] = useState("")
  const [uploadLimitInput, setUploadLimitInput] = useState("")
  const [limitFeedback, setLimitFeedback] = useState<string | null>(null)
  const speedClickTimerRef = useRef<number | null>(null)
  const globalDownloadSpeed = useDownloadStore((state) => state.globalDownloadSpeed)
  const globalUploadSpeed = useDownloadStore((state) => state.globalUploadSpeed)
  const globalTransferSpeed = useDownloadStore((state) => state.globalTransferSpeed)
  const settings = useAppSettingsStore((state) => state.settings)
  const loadSettings = useAppSettingsStore((state) => state.load)
  const saveSettings = useAppSettingsStore((state) => state.save)
  const savingSettings = useAppSettingsStore((state) => state.saving)

  const speedValue =
    speedMode === "download"
      ? globalDownloadSpeed
      : speedMode === "upload"
        ? globalUploadSpeed
        : globalTransferSpeed
  const SpeedIcon = SPEED_DISPLAY_ICON[speedMode]
  const canDeleteSelected = selectedTaskCount > 0 && Boolean(onDeleteSelected)
  const canPauseSelected = selectedPauseCount > 0 && Boolean(onPauseSelected)
  const canResumeSelected = selectedResumeCount > 0 && Boolean(onResumeSelected)

  const cycleSpeedMode = () => {
    setSpeedMode((current) => {
      const currentIndex = SPEED_DISPLAY_MODES.indexOf(current)
      return SPEED_DISPLAY_MODES[(currentIndex + 1) % SPEED_DISPLAY_MODES.length]
    })
  }

  useEffect(() => {
    loadSettings().catch(console.error)
  }, [loadSettings])

  useEffect(() => {
    return () => {
      if (speedClickTimerRef.current != null) {
        window.clearTimeout(speedClickTimerRef.current)
      }
    }
  }, [])

  const handleSpeedClick = () => {
    if (speedClickTimerRef.current != null) {
      window.clearTimeout(speedClickTimerRef.current)
    }

    speedClickTimerRef.current = window.setTimeout(() => {
      cycleSpeedMode()
      speedClickTimerRef.current = null
    }, SPEED_CLICK_DELAY_MS)
  }

  const openSpeedLimitDialog = () => {
    if (speedClickTimerRef.current != null) {
      window.clearTimeout(speedClickTimerRef.current)
      speedClickTimerRef.current = null
    }
    setLimitFeedback(null)
    if (settings) {
      setDownloadLimitInput(
        settings.transfer.download_speed_limit_kib == null
          ? ""
          : String(settings.transfer.download_speed_limit_kib)
      )
      setUploadLimitInput(
        settings.transfer.upload_speed_limit_kib == null
          ? ""
          : String(settings.transfer.upload_speed_limit_kib)
      )
    }
    setLimitDialogOpen(true)
  }

  const saveSpeedLimits = async () => {
    if (!settings) return

    try {
      await saveSettings({
        ...settings,
        transfer: {
          ...settings.transfer,
          download_speed_limit_kib: parseNullableSpeedLimit(downloadLimitInput),
          upload_speed_limit_kib: parseNullableSpeedLimit(uploadLimitInput),
        },
      })
      setLimitDialogOpen(false)
    } catch (error) {
      setLimitFeedback(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <>
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
        <ToolbarButton
          icon={<Play />}
          onClick={onResumeSelected}
          disabled={!canResumeSelected}
        >
          {selectedResumeCount > 0
            ? `${UI_TEXT.dashboard.resume} (${selectedResumeCount})`
            : UI_TEXT.dashboard.resume}
        </ToolbarButton>
        <ToolbarButton
          icon={<Pause />}
          onClick={onPauseSelected}
          disabled={!canPauseSelected}
        >
          {selectedPauseCount > 0
            ? `${UI_TEXT.dashboard.pause} (${selectedPauseCount})`
            : UI_TEXT.dashboard.pause}
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
          onClick={onDeleteSelected}
          disabled={!canDeleteSelected}
          className="text-destructive hover:text-destructive focus-visible:ring-destructive/30 disabled:text-muted-foreground [&_[data-slot=toolbar-button-icon]]:text-current [&_[data-slot=toolbar-button-icon]]:group-hover/toolbar-button:text-current"
        >
          {selectedTaskCount > 0 ? `${UI_TEXT.dashboard.delete} (${selectedTaskCount})` : UI_TEXT.dashboard.delete}
        </ToolbarButton>
      </ToolbarGroup>

      <div className="ml-auto flex items-stretch">
        <button
          type="button"
          className="group/speed-display flex h-full w-58 shrink-0 items-center justify-end gap-3 overflow-hidden border-l border-border/80 bg-background/35 px-4 text-right transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          onClick={handleSpeedClick}
          onDoubleClick={openSpeedLimitDialog}
          aria-label={`切换全局速度显示，当前为${SPEED_DISPLAY_LABEL[speedMode]}`}
          title="点击切换速度显示，双击打开限速设置"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary transition-colors group-hover/speed-display:bg-primary/15 [&_svg]:size-5">
            <SpeedIcon />
          </span>
          <span className="min-w-0 max-w-34 flex-1 truncate font-mono text-xl font-black leading-none tracking-tight text-foreground tabular-nums">
            {speedValue}
          </span>
        </button>
      </div>
    </Toolbar>
    <Dialog open={limitDialogOpen} onOpenChange={setLimitDialogOpen}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{UI_TEXT.dashboard.speedLimitDialogTitle}</DialogTitle>
          <DialogDescription>
            {UI_TEXT.dashboard.speedLimitDialogDesc}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-semibold leading-5 text-foreground">
                {UI_TEXT.settings.downloadSpeedLimit}
              </span>
              <SettingsInput
                value={downloadLimitInput}
                onChange={(event) => setDownloadLimitInput(event.target.value)}
                placeholder={UI_TEXT.settings.unlimitedPlaceholder}
                inputMode="decimal"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-semibold leading-5 text-foreground">
                {UI_TEXT.settings.uploadSpeedLimit}
              </span>
              <SettingsInput
                value={uploadLimitInput}
                onChange={(event) => setUploadLimitInput(event.target.value)}
                placeholder={UI_TEXT.settings.unlimitedPlaceholder}
                inputMode="decimal"
              />
            </label>
            <p className="text-sm leading-6 text-muted-foreground">
              {UI_TEXT.settings.limitUnitHint}
            </p>
            {limitFeedback ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm leading-6 text-destructive">
                {limitFeedback}
              </p>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter showCloseButton closeLabel={UI_TEXT.settings.cancel}>
          <Button onClick={saveSpeedLimits} disabled={!settings || savingSettings}>
            {savingSettings ? UI_TEXT.settings.saving : UI_TEXT.settings.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
