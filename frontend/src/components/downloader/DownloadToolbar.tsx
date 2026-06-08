import {
  CloudDownload,
  ListEnd,
  ListPlus,
  ListStart,
  Pause,
  Play,
  Settings,
  Square,
  Trash2,
  Link,
} from "lucide-react"

import {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarPrimaryButton,
  ToolbarSeparator,
} from "@/components/ui/toolbar"
import { UI_TEXT } from "@/core/locale"

interface DownloadToolbarProps {
  canClearCompleted?: boolean
  onCreateTask: () => void
  onClearCompleted?: () => void
  onOpenSettings?: () => void
}

export default function DownloadToolbar({
  canClearCompleted,
  onCreateTask,
  onClearCompleted,
  onOpenSettings,
}: DownloadToolbarProps) {
  return (
    <Toolbar aria-label="下载任务工具栏">
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

      <ToolbarSeparator />

      <ToolbarGroup>
        <ToolbarButton icon={<Settings />} onClick={onOpenSettings} disabled={!onOpenSettings}>
          {UI_TEXT.dashboard.settings}
        </ToolbarButton>
      </ToolbarGroup>
    </Toolbar>
  )
}
