import { useRef, useState } from "react"
import { ChevronsUpDown, GripVertical } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { UI_TEXT } from "@/core/locale"
import {
  type TaskTableColumnId,
  type TaskTableColumnState,
  useTaskTableStore,
} from "@/core/store/useTaskTableStore"
import { cn } from "@/lib/utils"

export const TASK_TABLE_SELECT_COLUMN_WIDTH = 72

interface TaskListHeaderProps {
  checked?: boolean
  className?: string
  disabled?: boolean
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
  showSeparator,
  onResizeStart,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  column: TaskTableColumnState
  meta: TaskListHeaderColumnMeta
  activeDragId: TaskTableColumnId | null
  showSeparator?: boolean
  onResizeStart: (event: React.PointerEvent<HTMLButtonElement>, column: TaskTableColumnState) => void
  onDragStart: (event: React.DragEvent<HTMLDivElement>, id: TaskTableColumnId) => void
  onDragOver: (event: React.DragEvent<HTMLDivElement>, id: TaskTableColumnId) => void
  onDrop: (event: React.DragEvent<HTMLDivElement>, id: TaskTableColumnId) => void
  onDragEnd: () => void
}) {
  const isDragging = activeDragId === column.id

  return (
    <div
      data-slot="task-list-header-cell"
      draggable
      onDragStart={(event) => onDragStart(event, column.id)}
      onDragOver={(event) => onDragOver(event, column.id)}
      onDrop={(event) => onDrop(event, column.id)}
      onDragEnd={onDragEnd}
      className={cn(
        "relative flex h-full shrink-0 items-center justify-start px-4 text-sm font-medium leading-5 text-muted-foreground transition-colors",
        "hover:bg-muted/35 hover:text-foreground",
        isDragging && "bg-muted/50 opacity-70"
      )}
      style={{ width: column.width, minWidth: meta.minWidth }}
    >
      {showSeparator ? (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 h-6 w-px -translate-y-1/2 bg-border/80 shadow-[0_0_8px_rgba(255,255,255,0.08)]"
        />
      ) : null}
      <GripVertical className="mr-1 size-3.5 shrink-0 opacity-45" />
      {meta.sortable ? <ChevronsUpDown className="mr-1 size-3.5 shrink-0 opacity-70" /> : null}
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
  onCheckedChange,
}: TaskListHeaderProps) {
  const columns = useTaskTableStore((state) => state.columns)
  const tableWidth = columns.reduce(
    (total, column) => total + column.width,
    TASK_TABLE_SELECT_COLUMN_WIDTH
  )
  const resizeColumn = useTaskTableStore((state) => state.resizeColumn)
  const moveColumn = useTaskTableStore((state) => state.moveColumn)
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

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, id: TaskTableColumnId) => {
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
        "flex h-13 shrink-0 items-center overflow-hidden rounded-[var(--radius)] bg-card/95 shadow-[0_12px_28px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.05)]",
        className
      )}
      style={{ minWidth: tableWidth }}
    >
      <div
        className="flex h-full shrink-0 items-center justify-center"
        style={{ width: TASK_TABLE_SELECT_COLUMN_WIDTH }}
      >
        <Checkbox
          checked={checked}
          disabled={disabled}
          aria-label={UI_TEXT.dashboard.selectAllTasks}
          onCheckedChange={(value) => onCheckedChange?.(value === true)}
          className="size-5"
        />
      </div>
      <div className="flex min-w-0 flex-1 overflow-hidden">
        {columns.map((column, index) => (
          <HeaderCell
            key={column.id}
            column={column}
            meta={TASK_TABLE_COLUMN_META[column.id]}
            activeDragId={activeDragId}
            showSeparator={index > 0}
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
