import { useRef, useState } from "react"
import { ArrowDown, ArrowUp, ChevronsUpDown, GripVertical } from "lucide-react"
import { motion } from "motion/react"

import { Checkbox } from "@/components/ui/checkbox"
import { UI_TEXT } from "@/core/locale"
import {
  type TaskTableColumnId,
  type TaskTableColumnState,
  type TaskTableSortState,
  useTaskTableStore,
} from "@/core/store/useTaskTableStore"
import { getTaskTableWidth, TASK_TABLE_SELECT_COLUMN_WIDTH } from "@/core/taskTableLayout"
import { cn } from "@/lib/utils"

type TaskListHeaderChecked = React.ComponentProps<typeof Checkbox>["checked"]

interface TaskListHeaderProps {
  checked?: TaskListHeaderChecked
  className?: string
  disabled?: boolean
  embedded?: boolean
  onCheckedChange?: (checked: boolean) => void
}

interface TaskListHeaderColumnMeta {
  id: TaskTableColumnId
  label: string
  minWidth: number
  sortable?: boolean
}

const TASK_TABLE_COLUMN_META: Record<TaskTableColumnId, TaskListHeaderColumnMeta> = {
  name: {
    id: "name",
    label: UI_TEXT.dashboard.columns.name,
    minWidth: 180,
    sortable: true,
  },
  size: {
    id: "size",
    label: UI_TEXT.dashboard.columns.size,
    minWidth: 88,
    sortable: true,
  },
  status: {
    id: "status",
    label: UI_TEXT.dashboard.columns.status,
    minWidth: 88,
    sortable: true,
  },
  speed: {
    id: "speed",
    label: UI_TEXT.dashboard.columns.speed,
    minWidth: 88,
    sortable: true,
  },
  eta: {
    id: "eta",
    label: UI_TEXT.dashboard.columns.eta,
    minWidth: 112,
    sortable: true,
  },
  createdAt: {
    id: "createdAt",
    label: UI_TEXT.dashboard.columns.createdAt,
    minWidth: 112,
    sortable: true,
  },
  tags: {
    id: "tags",
    label: UI_TEXT.dashboard.columns.tags,
    minWidth: 96,
    sortable: true,
  },
}

function HeaderCell({
  column,
  meta,
  activeDragId,
  sort,
  showSeparator,
  onSort,
  onResizeStart,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  column: TaskTableColumnState
  meta: TaskListHeaderColumnMeta
  activeDragId: TaskTableColumnId | null
  sort: TaskTableSortState | null
  showSeparator?: boolean
  onSort: (id: TaskTableColumnId) => void
  onResizeStart: (event: React.PointerEvent<HTMLButtonElement>, column: TaskTableColumnState) => void
  onDragStart: (event: React.DragEvent<HTMLButtonElement>, id: TaskTableColumnId) => void
  onDragOver: (event: React.DragEvent<HTMLDivElement>, id: TaskTableColumnId) => void
  onDrop: (event: React.DragEvent<HTMLDivElement>, id: TaskTableColumnId) => void
  onDragEnd: () => void
}) {
  const isDragging = activeDragId === column.id
  const activeSort = sort?.id === column.id ? sort.direction : null
  const SortIcon = activeSort === "asc" ? ArrowUp : activeSort === "desc" ? ArrowDown : ChevronsUpDown

  return (
    <div
      data-slot="task-list-header-cell"
      onDragOver={(event) => onDragOver(event, column.id)}
      onDrop={(event) => onDrop(event, column.id)}
      className={cn(
        "relative flex h-full shrink-0 items-center justify-start px-4 text-sm font-medium leading-5 text-muted-foreground transition-colors",
        "hover:bg-muted/35 hover:text-foreground",
        meta.sortable && "cursor-pointer",
        isDragging && "bg-muted/50 opacity-70"
      )}
      style={{ width: column.width, minWidth: meta.minWidth }}
      onClick={() => {
        if (meta.sortable) onSort(column.id)
      }}
    >
      {showSeparator ? (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 h-6 w-px -translate-y-1/2 bg-border/80 shadow-divider-glow"
        />
      ) : null}
      <button
        type="button"
        draggable
        aria-label={`${meta.label} 拖拽调整列顺序`}
        className="mr-1 flex size-5 shrink-0 cursor-grab items-center justify-center rounded-sm opacity-45 transition-opacity hover:opacity-80 active:cursor-grabbing"
        onClick={(event) => event.stopPropagation()}
        onDragStart={(event) => onDragStart(event, column.id)}
        onDragEnd={onDragEnd}
      >
        <GripVertical className="size-3.5" />
      </button>
      {meta.sortable ? (
        <SortIcon
          className={cn(
            "mr-1 size-3.5 shrink-0 transition-opacity",
            activeSort ? "opacity-100 text-foreground" : "opacity-70"
          )}
        />
      ) : null}
      <span className="truncate">{meta.label}</span>
      <button
        type="button"
        aria-label={`${meta.label} 调整列宽`}
        className="absolute right-0 top-1/2 h-7 w-3 -translate-y-1/2 cursor-col-resize rounded-full outline-none transition-colors hover:bg-primary/20 focus-visible:bg-primary/25 focus-visible:ring-2 focus-visible:ring-ring/40"
        onPointerDown={(event) => onResizeStart(event, column)}
      />
    </div>
  )
}

export default function TaskListHeader({
  checked,
  className,
  disabled,
  embedded = false,
  onCheckedChange,
}: TaskListHeaderProps) {
  const columns = useTaskTableStore((state) => state.columns)
  const tableWidth = getTaskTableWidth(columns)
  const sort = useTaskTableStore((state) => state.sort)
  const resizeColumn = useTaskTableStore((state) => state.resizeColumn)
  const moveColumn = useTaskTableStore((state) => state.moveColumn)
  const toggleSortColumn = useTaskTableStore((state) => state.toggleSortColumn)
  const checkedActive = checked === true || checked === "indeterminate"
  const resizeRef = useRef<{
    id: TaskTableColumnId
    startX: number
    startWidth: number
  } | null>(null)
  const [activeDragId, setActiveDragId] = useState<TaskTableColumnId | null>(null)

  const handleResizeStart = (
    event: React.PointerEvent<HTMLButtonElement>,
    column: TaskTableColumnState
  ) => {
    event.preventDefault()
    event.stopPropagation()

    resizeRef.current = {
      id: column.id,
      startX: event.clientX,
      startWidth: column.width,
    }

    event.currentTarget.setPointerCapture(event.pointerId)

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const resize = resizeRef.current
      if (!resize) return

      resizeColumn(resize.id, resize.startWidth + moveEvent.clientX - resize.startX)
    }

    const handlePointerUp = () => {
      resizeRef.current = null
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
  }

  const handleDragStart = (event: React.DragEvent<HTMLButtonElement>, id: TaskTableColumnId) => {
    if (resizeRef.current) {
      event.preventDefault()
      return
    }

    setActiveDragId(id)
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", id)
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>, targetId: TaskTableColumnId) => {
    event.preventDefault()
    const sourceId = event.dataTransfer.getData("text/plain") as TaskTableColumnId

    if (sourceId) moveColumn(sourceId, targetId)
    setActiveDragId(null)
  }

  return (
    <div
      data-slot="task-list-header"
      className={cn(
        "flex h-13 shrink-0 items-center overflow-hidden",
        embedded ? "rounded-lg bg-card/95 shadow-none" : "rounded-lg bg-card/95 shadow-surface-raised",
        className
      )}
      style={{ width: tableWidth, minWidth: tableWidth }}
    >
      <div
        className="flex h-full shrink-0 items-center justify-center"
        style={{ width: TASK_TABLE_SELECT_COLUMN_WIDTH }}
      >
        <motion.div
          className="relative grid size-9 place-items-center"
          initial={false}
          animate={{ scale: checkedActive ? 1.08 : 1 }}
          transition={{ type: "spring", stiffness: 520, damping: 26, mass: 0.35 }}
        >
          <motion.span
            aria-hidden="true"
            className="task-selection-control-halo pointer-events-none absolute inset-0 rounded-full"
            initial={false}
            animate={{
              opacity: checkedActive ? 1 : 0,
              scale: checkedActive ? 1 : 0.7,
            }}
            transition={{ type: "spring", stiffness: 480, damping: 28, mass: 0.35 }}
          />
          <Checkbox
            checked={checked}
            disabled={disabled}
            aria-label={UI_TEXT.dashboard.selectAllTasks}
            onCheckedChange={(value) => onCheckedChange?.(value === true)}
            className="relative z-10 size-5"
          />
        </motion.div>
      </div>
      <div className="flex min-w-0 flex-1 overflow-hidden">
        {columns.map((column, index) => (
          <HeaderCell
            key={column.id}
            column={column}
            meta={TASK_TABLE_COLUMN_META[column.id]}
            activeDragId={activeDragId}
            sort={sort}
            showSeparator={index > 0}
            onSort={toggleSortColumn}
            onResizeStart={handleResizeStart}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={() => setActiveDragId(null)}
          />
        ))}
      </div>
    </div>
  )
}

export { TASK_TABLE_COLUMN_META }
