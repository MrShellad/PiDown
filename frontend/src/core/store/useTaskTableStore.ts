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

export type TaskTableSortDirection = "asc" | "desc"

export interface TaskTableSortState {
  id: TaskTableColumnId
  direction: TaskTableSortDirection
}

export interface TaskTableColumnState {
  id: TaskTableColumnId
  width: number
  visible?: boolean
}

const MIN_COLUMN_WIDTH = 88
const MAX_COLUMN_WIDTH = 360

export const DEFAULT_TASK_TABLE_COLUMNS: TaskTableColumnState[] = [
  { id: "name", width: 360, visible: true },
  { id: "size", width: 112, visible: true },
  { id: "status", width: 112, visible: true },
  { id: "speed", width: 112, visible: true },
  { id: "eta", width: 144, visible: true },
  { id: "createdAt", width: 144, visible: true },
  { id: "tags", width: 128, visible: true },
]

interface TaskTableState {
  columns: TaskTableColumnState[]
  sort: TaskTableSortState | null
  pageSize: number
  resizeColumn: (id: TaskTableColumnId, width: number) => void
  moveColumn: (sourceId: TaskTableColumnId, targetId: TaskTableColumnId) => void
  toggleSortColumn: (id: TaskTableColumnId) => void
  toggleColumnVisibility: (id: TaskTableColumnId) => void
  resetColumns: () => void
  setPageSize: (size: number) => void
}

function clampWidth(width: number) {
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)))
}

function normalizeColumns(columns: TaskTableColumnState[]): TaskTableColumnState[] {
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
      visible: column.visible !== false,
    })
  })

  DEFAULT_TASK_TABLE_COLUMNS.forEach((column) => {
    if (!seen.has(column.id)) {
      normalized.push({
        ...column,
        visible: true,
      })
    }
  })

  return normalized
}

function normalizeSortState(sort: TaskTableSortState | null | undefined): TaskTableSortState | null {
  if (!sort) return null

  const validColumn = DEFAULT_TASK_TABLE_COLUMNS.some((column) => column.id === sort.id)
  const validDirection = sort.direction === "asc" || sort.direction === "desc"

  return validColumn && validDirection ? sort : null
}

export const useTaskTableStore = create<TaskTableState>()(
  persist(
    (set) => ({
      columns: DEFAULT_TASK_TABLE_COLUMNS,
      sort: null,
      pageSize: 10,

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

      toggleSortColumn: (id) => {
        set((state) => {
          if (state.sort?.id !== id) return { sort: { id, direction: "asc" } }
          if (state.sort.direction === "asc") return { sort: { id, direction: "desc" } }
          return { sort: null }
        })
      },

      toggleColumnVisibility: (id) => {
        if (id === "name") return
        set((state) => ({
          columns: normalizeColumns(
            state.columns.map((column) =>
              column.id === id ? { ...column, visible: column.visible === false } : column
            )
          ),
        }))
      },

      resetColumns: () => set({ columns: DEFAULT_TASK_TABLE_COLUMNS }),

      setPageSize: (size) => set({ pageSize: size }),
    }),
    {
      name: "pidownloader-task-table",
      partialize: (state) => ({
        columns: normalizeColumns(state.columns),
        sort: normalizeSortState(state.sort),
        pageSize: state.pageSize,
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<TaskTableState> | undefined
        return {
          ...current,
          columns: normalizeColumns(persistedState?.columns ?? current.columns),
          sort: normalizeSortState(persistedState?.sort ?? current.sort),
          pageSize: persistedState?.pageSize ?? current.pageSize ?? 10,
        }
      },
    }
  )
)
