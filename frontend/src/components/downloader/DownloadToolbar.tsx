import { useEffect, useState } from "react"

import { Toolbar } from "@/components/ui/toolbar"
import { Search, X } from "lucide-react"
import { useAppSettingsStore } from "@/core/store/useAppSettingsStore"
import { useDownloadStore } from "@/core/store/useDownloadStore"
import { parseNullableSpeedLimit } from "@/core/transfer"
import { DownloadToolbarActions } from "./toolbar/DownloadToolbarActions"
import { DownloadSpeedDisplay } from "./toolbar/DownloadSpeedDisplay"
import { SpeedLimitPopover } from "./toolbar/SpeedLimitPopover"
import {
  getNextSpeedDisplayMode,
  type SpeedDisplayMode,
} from "./toolbar/speedDisplay"

interface DownloadToolbarProps {
  className?: string
  selectedTaskCount?: number
  selectedPauseCount?: number
  selectedResumeCount?: number
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  onCreateTask: (initialUrl?: string) => void
  onPauseSelected?: () => void
  onResumeSelected?: () => void
  onDeleteSelected?: () => void
}

export default function DownloadToolbar({
  className,
  selectedTaskCount = 0,
  selectedPauseCount = 0,
  selectedResumeCount = 0,
  searchQuery,
  onSearchQueryChange,
  onCreateTask,
  onPauseSelected,
  onResumeSelected,
  onDeleteSelected,
}: DownloadToolbarProps) {
  const [speedMode, setSpeedMode] = useState<SpeedDisplayMode>("download")
  const [limitPopoverOpen, setLimitPopoverOpen] = useState(false)
  const [downloadLimitInput, setDownloadLimitInput] = useState("")
  const [uploadLimitInput, setUploadLimitInput] = useState("")
  const [limitFeedback, setLimitFeedback] = useState<string | null>(null)
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

  const cycleSpeedMode = () => {
    setSpeedMode((current) => getNextSpeedDisplayMode(current))
  }

  useEffect(() => {
    loadSettings().catch(console.error)
  }, [loadSettings])

  const prepareSpeedLimitPopover = () => {
    setLimitFeedback(null)
    if (settings) {
      setDownloadLimitInput(
        formatSpeedLimitInput(settings.transfer.download_speed_limit_kib)
      )
      setUploadLimitInput(
        formatSpeedLimitInput(settings.transfer.upload_speed_limit_kib)
      )
    }
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
      setLimitPopoverOpen(false)
    } catch (error) {
      setLimitFeedback(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <>
      <Toolbar className={className} aria-label="下载任务工具栏">
        <DownloadToolbarActions
          selectedTaskCount={selectedTaskCount}
          selectedPauseCount={selectedPauseCount}
          selectedResumeCount={selectedResumeCount}
          onCreateTask={onCreateTask}
          onPauseSelected={onPauseSelected}
          onResumeSelected={onResumeSelected}
          onDeleteSelected={onDeleteSelected}
        />
        
        {/* Adaptive search input */}
        <div className="flex-grow flex justify-end px-4 min-w-[120px] max-w-sm ml-auto">
          <div className="relative w-full flex items-center group">
            <Search className="absolute left-3 size-4 text-muted-foreground/60 group-focus-within:text-primary transition-colors pointer-events-none" />
            <input
              type="text"
              placeholder="搜索任务..."
              value={searchQuery}
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
        <SpeedLimitPopover
          open={limitPopoverOpen}
          onOpenChange={setLimitPopoverOpen}
          downloadLimitInput={downloadLimitInput}
          uploadLimitInput={uploadLimitInput}
          onDownloadLimitInputChange={setDownloadLimitInput}
          onUploadLimitInputChange={setUploadLimitInput}
          feedback={limitFeedback}
          saving={savingSettings}
          canSave={Boolean(settings)}
          onSave={saveSpeedLimits}
        >
          <DownloadSpeedDisplay
            mode={speedMode}
            value={speedValue}
            onModeClick={cycleSpeedMode}
            onOpenLimits={prepareSpeedLimitPopover}
          />
        </SpeedLimitPopover>
      </Toolbar>
    </>
  )
}

function formatSpeedLimitInput(value: number | null) {
  return value == null ? "" : String(value)
}
