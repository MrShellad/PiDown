import type { TaskTableColumnState } from "@/core/store/useTaskTableStore"

export const TASK_TABLE_SELECT_COLUMN_WIDTH = 72
export const TASK_LIST_EDGE_SAFE_PADDING = 12

export function getTaskTableWidth(columns: TaskTableColumnState[]) {
  return columns.reduce((total, column) => total + column.width, TASK_TABLE_SELECT_COLUMN_WIDTH)
}

export function getTaskTableShellMinWidth(columns: TaskTableColumnState[]) {
  return getTaskTableWidth(columns) + TASK_LIST_EDGE_SAFE_PADDING * 2
}
