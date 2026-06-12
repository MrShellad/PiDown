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
  selectedFiles?: number[] | null
  sequential?: boolean
}

export interface NewTaskAdvancedDraft {
  maxDownloadSpeedInput: string
  maxUploadSpeedInput: string
  taskThreadCountInput: string
  userAgentInput: string
  refererInput: string
  cookiesInput: string
  autoVerify: boolean
  disableDhtPexLpd: boolean
  fileAllocation: string
}
