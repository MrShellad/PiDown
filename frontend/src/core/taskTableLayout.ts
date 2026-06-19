import type { TaskTableColumnState } from "@/core/store/useTaskTableStore"

export const TASK_TABLE_SELECT_COLUMN_WIDTH = 72
export const TASK_TABLE_SETTINGS_COLUMN_WIDTH = 44
export const TASK_LIST_EDGE_SAFE_PADDING = 12

export function getTaskTableWidth(columns: TaskTableColumnState[]) {
  return columns
    .filter((column) => column.visible !== false)
    .reduce((total, column) => total + column.width, TASK_TABLE_SELECT_COLUMN_WIDTH + TASK_TABLE_SETTINGS_COLUMN_WIDTH)
}

export function getTaskTableShellMinWidth(columns: TaskTableColumnState[]) {
  return getTaskTableWidth(columns) + TASK_LIST_EDGE_SAFE_PADDING * 2
}
