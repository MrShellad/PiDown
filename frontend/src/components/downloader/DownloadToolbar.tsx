import { useEffect, useState } from "react"

import { PageHeaderToolbar } from "@/components/ui/toolbar"
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
    <PageHeaderToolbar
      className={className}
      aria-label="下载任务工具栏"
      leftActions={
        <DownloadToolbarActions
          selectedTaskCount={selectedTaskCount}
          selectedPauseCount={selectedPauseCount}
          selectedResumeCount={selectedResumeCount}
          onCreateTask={onCreateTask}
          onPauseSelected={onPauseSelected}
          onResumeSelected={onResumeSelected}
          onDeleteSelected={onDeleteSelected}
        />
      }
      searchQuery={searchQuery}
      onSearchQueryChange={onSearchQueryChange}
      searchPlaceholder="搜索任务..."
      rightActions={
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
      }
    />
  )
}

function formatSpeedLimitInput(value: number | null) {
  return value == null ? "" : String(value)
}
