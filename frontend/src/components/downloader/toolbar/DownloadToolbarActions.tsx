import {
  CloudDownload,
  Link,
  ListEnd,
  ListPlus,
  ListStart,
  Pause,
  Play,
  Square,
  Trash2,
} from "lucide-react"

import {
  ToolbarButton,
  ToolbarGroup,
  ToolbarPrimaryButton,
  ToolbarSeparator,
} from "@/components/ui/toolbar"
import { UI_TEXT } from "@/core/locale"

interface DownloadToolbarActionsProps {
  selectedTaskCount: number
  selectedPauseCount: number
  selectedResumeCount: number
  onCreateTask: () => void
  onPauseSelected?: () => void
  onResumeSelected?: () => void
  onDeleteSelected?: () => void
}

export function DownloadToolbarActions({
  selectedTaskCount,
  selectedPauseCount,
  selectedResumeCount,
  onCreateTask,
  onPauseSelected,
  onResumeSelected,
  onDeleteSelected,
}: DownloadToolbarActionsProps) {
  const canDeleteSelected = selectedTaskCount > 0 && Boolean(onDeleteSelected)
  const canPauseSelected = selectedPauseCount > 0 && Boolean(onPauseSelected)
  const canResumeSelected = selectedResumeCount > 0 && Boolean(onResumeSelected)

  return (
    <>
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
          {selectedTaskCount > 0
            ? `${UI_TEXT.dashboard.delete} (${selectedTaskCount})`
            : UI_TEXT.dashboard.delete}
        </ToolbarButton>
      </ToolbarGroup>
    </>
  )
}
