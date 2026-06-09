import type { TaskAdvancedOptions } from "@/core/bridge/tauri-commands"
import { parseNullableSpeedLimit } from "@/core/transfer"
import type { NewTaskAdvancedDraft } from "./types"

export const DEFAULT_TASK_THREAD_COUNT = 16
export const MAX_TASK_THREAD_COUNT = 16

export function inferFileName(url: string) {
  try {
    const urlObj = new URL(url)
    const lastSegment = urlObj.pathname.split("/").filter(Boolean).at(-1)
    return lastSegment ? decodeURIComponent(lastSegment) : "download"
  } catch {
    return "download"
  }
}

export function formatBytes(bytes: number | null) {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return "--"

  const units = ["B", "KiB", "MiB", "GiB", "TiB"]
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function parsePositiveInteger(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null

  const numeric = Number(trimmed)
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null
}

function parseCookieInput(value: string) {
  return value
    .split(/[\n;]+/)
    .map((cookie) => cookie.trim())
    .filter(Boolean)
}

function normalizeNullableText(value: string) {
  const trimmed = value.trim()
  return trimmed || null
}

export function buildAdvancedOptions(draft: NewTaskAdvancedDraft): TaskAdvancedOptions {
  const speedLimit = parseNullableSpeedLimit(draft.maxDownloadSpeedInput)
  const threadCount = parsePositiveInteger(draft.taskThreadCountInput)

  return {
    maxDownloadSpeedKib:
      speedLimit == null || speedLimit <= 0 ? null : Math.round(speedLimit),
    maxConnections:
      threadCount == null
        ? null
        : Math.min(MAX_TASK_THREAD_COUNT, Math.max(1, threadCount)),
    userAgent: normalizeNullableText(draft.userAgentInput),
    referer: normalizeNullableText(draft.refererInput),
    cookies: parseCookieInput(draft.cookiesInput),
  }
}
