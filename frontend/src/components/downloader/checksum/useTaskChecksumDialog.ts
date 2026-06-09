import { useCallback, useEffect, useState } from "react"

import {
  calculateTaskFileChecksum,
  type FileChecksumAlgorithm,
} from "@/core/bridge/tauri-commands"
import type { Task } from "@/core/store/useDownloadStore"
import type { TaskChecksumRow } from "./types"

const DEFAULT_ALGORITHM: FileChecksumAlgorithm = "MD5"
const ERROR_MESSAGES: Record<string, string> = {
  "File does not exist yet": "文件还不存在，无法校验。",
  "Task not found": "未找到该下载任务。",
  "Task path is not a file": "任务路径不是可校验的文件。",
  "Unsupported checksum algorithm": "不支持该校验算法。",
}

function createInitialRow(task: Task, algorithm: FileChecksumAlgorithm): TaskChecksumRow {
  return {
    name: task.name,
    status: "waiting",
    algorithm,
    checksum: "",
    savedChecksum: "",
  }
}

function getErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return ERROR_MESSAGES[message] ?? message
}

export function useTaskChecksumDialog(task: Task, open: boolean) {
  const taskGid = task.gid
  const taskName = task.name
  const [algorithm, setAlgorithmState] = useState<FileChecksumAlgorithm>(DEFAULT_ALGORITHM)
  const [row, setRow] = useState<TaskChecksumRow>(() => createInitialRow(task, DEFAULT_ALGORITHM))

  const resetRow = useCallback(
    (nextAlgorithm: FileChecksumAlgorithm) => {
      setRow({
        name: taskName,
        status: "waiting",
        algorithm: nextAlgorithm,
        checksum: "",
        savedChecksum: "",
      })
    },
    [taskName]
  )

  const setAlgorithm = useCallback(
    (nextAlgorithm: FileChecksumAlgorithm) => {
      setAlgorithmState(nextAlgorithm)
      resetRow(nextAlgorithm)
    },
    [resetRow]
  )

  useEffect(() => {
    if (open) {
      resetRow(algorithm)
    }
  }, [algorithm, open, resetRow, taskGid])

  const start = useCallback(async () => {
    setRow((current) => ({
      ...current,
      status: "running",
      checksum: "",
      savedChecksum: "",
      error: undefined,
    }))

    try {
      const result = await calculateTaskFileChecksum(taskGid, algorithm)
      setRow({
        name: result.name || taskName,
        status: "completed",
        algorithm: result.algorithm,
        checksum: result.checksum,
        savedChecksum: result.saved_checksum ?? "",
      })
    } catch (error) {
      setRow((current) => ({
        ...current,
        status: "failed",
        error: getErrorMessage(error),
      }))
    }
  }, [algorithm, taskGid, taskName])

  return {
    algorithm,
    row,
    running: row.status === "running",
    setAlgorithm,
    start,
  }
}
