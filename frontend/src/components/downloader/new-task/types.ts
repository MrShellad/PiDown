import type { TaskAdvancedOptions } from "@/core/bridge/tauri-commands"

export type NewTaskStep = "link" | "details"
export type NewTaskDetailsTab = "basic" | "advanced"

export interface PendingTaskCreate {
  url: string
  savePath: string
  filename: string
  categoryId: number | null
  categoryTouched: boolean
  totalSize: number | null
  advancedOptions: TaskAdvancedOptions
}

export interface NewTaskAdvancedDraft {
  maxDownloadSpeedInput: string
  taskThreadCountInput: string
  userAgentInput: string
  refererInput: string
  cookiesInput: string
}
