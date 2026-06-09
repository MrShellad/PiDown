import type { FileChecksumAlgorithm } from "@/core/bridge/tauri-commands"

export const FILE_CHECKSUM_ALGORITHMS = [
  "MD5",
  "SHA-1",
  "SHA-256",
  "SHA-512",
] as const satisfies readonly FileChecksumAlgorithm[]

export type ChecksumRowStatus = "waiting" | "running" | "completed" | "failed"

export interface TaskChecksumRow {
  name: string
  status: ChecksumRowStatus
  algorithm: FileChecksumAlgorithm
  checksum: string
  savedChecksum: string
  error?: string
}

export const CHECKSUM_STATUS_LABELS: Record<ChecksumRowStatus, string> = {
  waiting: "等待中 ...",
  running: "计算中 ...",
  completed: "完成",
  failed: "失败",
}
