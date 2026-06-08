import { create } from "zustand"
import { persist } from "zustand/middleware"

export type TaskTableColumnId =
  | "name"
  | "size"
  | "status"
  | "speed"
  | "eta"
  | "createdAt"
  | "tags"

export interface TaskTableColumnState {
  id: TaskTableColumnId
  width: number
}

const MIN_COLUMN_WIDTH = 88
const MAX_COLUMN_WIDTH = 360

export const DEFAULT_TASK_TABLE_COLUMNS: TaskTableColumnState[] = [
  { id: "name", width: 360 },
  { id: "size", width: 112 },
  { id: "status", width: 112 },
  { id: "speed", width: 112 },
  { id: "eta", width: 144 },
  { id: "createdAt", width: 144 },
  { id: "tags", width: 128 },
]

interface TaskTableState {
  columns: TaskTableColumnState[]
  resizeColumn: (id: TaskTableColumnId, width: number) => void
  moveColumn: (sourceId: TaskTableColumnId, targetId: TaskTableColumnId) => void
  resetColumns: () => void
}

function clampWidth(width: number) {
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)))
}

function normalizeColumns(columns: TaskTableColumnState[]) {
  const defaultsById = new Map(DEFAULT_TASK_TABLE_COLUMNS.map((column) => [column.id, column]))
  const seen = new Set<TaskTableColumnId>()
  const normalized: TaskTableColumnState[] = []

  columns.forEach((column) => {
    const fallback = defaultsById.get(column.id)
    if (!fallback || seen.has(column.id)) return

    seen.add(column.id)
    normalized.push({
      id: column.id,
      width: clampWidth(Number.isFinite(column.width) ? column.width : fallback.width),
    })
  })

  DEFAULT_TASK_TABLE_COLUMNS.forEach((column) => {
    if (!seen.has(column.id)) normalized.push(column)
  })

  return normalized
}

export const useTaskTableStore = create<TaskTableState>()(
  persist(
    (set) => ({
      columns: DEFAULT_TASK_TABLE_COLUMNS,

      resizeColumn: (id, width) => {
        set((state) => ({
          columns: normalizeColumns(
            state.columns.map((column) =>
              column.id === id ? { ...column, width: clampWidth(width) } : column
            )
          ),
        }))
      },

      moveColumn: (sourceId, targetId) => {
        if (sourceId === targetId) return

        set((state) => {
          const columns = normalizeColumns(state.columns)
          const sourceIndex = columns.findIndex((column) => column.id === sourceId)
          const targetIndex = columns.findIndex((column) => column.id === targetId)

          if (sourceIndex < 0 || targetIndex < 0) return state

          const nextColumns = [...columns]
          const [source] = nextColumns.splice(sourceIndex, 1)
          nextColumns.splice(targetIndex, 0, source)

          return { columns: nextColumns }
        })
      },

      resetColumns: () => set({ columns: DEFAULT_TASK_TABLE_COLUMNS }),
    }),
    {
      name: "pidownloader-task-table",
      partialize: (state) => ({ columns: normalizeColumns(state.columns) }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<TaskTableState> | undefined
        return {
          ...current,
          columns: normalizeColumns(persistedState?.columns ?? current.columns),
        }
      },
    }
  )
)
