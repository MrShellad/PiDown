import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  type LucideIcon,
} from "lucide-react"

export type SpeedDisplayMode = "download" | "upload" | "transfer"

const SPEED_DISPLAY_MODES: SpeedDisplayMode[] = ["download", "upload", "transfer"]

export const SPEED_DISPLAY_LABEL: Record<SpeedDisplayMode, string> = {
  download: "下载",
  upload: "上传",
  transfer: "总计",
}

export const SPEED_DISPLAY_ICON: Record<SpeedDisplayMode, LucideIcon> = {
  download: ArrowDown,
  upload: ArrowUp,
  transfer: ChevronsUpDown,
}

export function getNextSpeedDisplayMode(current: SpeedDisplayMode) {
  const currentIndex = SPEED_DISPLAY_MODES.indexOf(current)
  return SPEED_DISPLAY_MODES[(currentIndex + 1) % SPEED_DISPLAY_MODES.length]
}
