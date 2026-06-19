import { useRef } from "react"
import { ArrowDown, ArrowUp, ChevronsUpDown, GripVertical, SlidersHorizontal } from "lucide-react"
import { motion } from "motion/react"
import type { Table } from "@tanstack/react-table"

import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Popover as PopoverPrimitive } from "radix-ui"
import { Separator } from "@/components/ui/separator"
import { UI_TEXT } from "@/core/locale"
import type { Task } from "@/core/store/useDownloadStore"
import {
  type TaskTableColumnId,
  type TaskTableColumnState,
  type TaskTableSortState,
  useTaskTableStore,
} from "@/core/store/useTaskTableStore"
import {
  getTaskTableWidth,
  TASK_TABLE_SELECT_COLUMN_WIDTH,
  TASK_TABLE_SETTINGS_COLUMN_WIDTH,
} from "@/core/taskTableLayout"
import { cn } from "@/lib/utils"

type TaskListHeaderChecked = React.ComponentProps<typeof Checkbox>["checked"]

interface TaskListHeaderProps {
  checked?: TaskListHeaderChecked
  className?: string
  disabled?: boolean
  embedded?: boolean
  onCheckedChange?: (checked: boolean) => void
  table: Table<Task>
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
  sort,
  showSeparator,
  onSort,
  onResizeStart,
}: {
  column: { id: TaskTableColumnId; width: number }
  meta: TaskListHeaderColumnMeta
  sort: TaskTableSortState | null
  showSeparator?: boolean
  onSort: (id: TaskTableColumnId) => void
  onResizeStart: (event: React.PointerEvent<HTMLButtonElement>, column: TaskTableColumnState) => void
}) {
  const activeSort = sort?.id === column.id ? sort.direction : null
  const SortIcon = activeSort === "asc" ? ArrowUp : activeSort === "desc" ? ArrowDown : ChevronsUpDown

  return (
    <div
      data-slot="task-list-header-cell"
      className={cn(
        "group/header-cell relative flex h-full shrink-0 select-none items-center px-4 text-sm font-semibold leading-5 text-foreground/85 transition-colors",
        column.id === "name" ? "justify-start" : "justify-center",
        "hover:bg-muted/35 hover:text-foreground"
      )}
      style={{ flexBasis: column.width, width: column.width, minWidth: meta.minWidth }}
      onClick={() => {
        if (meta.sortable) onSort(column.id)
      }}
    >
      {showSeparator ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-1/2 h-6 w-px -translate-y-1/2 bg-border/80 shadow-divider-glow"
        />
      ) : null}
      {meta.sortable ? (
        <SortIcon
          className={cn(
            "pointer-events-none mr-1 size-3.5 shrink-0 transition-opacity",
            activeSort ? "opacity-100 text-foreground" : "opacity-70"
          )}
        />
      ) : null}
      <span className="pointer-events-none truncate">{meta.label}</span>
      <button
        type="button"
        aria-label={`${meta.label} 调整列宽`}
        className="absolute right-0 top-1/2 h-7 w-3 -translate-y-1/2 cursor-col-resize rounded-full outline-none transition-colors hover:bg-primary/20 focus-visible:bg-primary/25 focus-visible:ring-2 focus-visible:ring-ring/40"
        draggable={false}
        onClick={(event) => event.stopPropagation()}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={(event) => onResizeStart(event, column as TaskTableColumnState)}
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
  table,
}: TaskListHeaderProps) {
  const columns = useTaskTableStore((state) => state.columns)
  const toggleColumnVisibility = useTaskTableStore((state) => state.toggleColumnVisibility)
  const resetColumns = useTaskTableStore((state) => state.resetColumns)
  
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
  const menuDragSourceIdRef = useRef<TaskTableColumnId | null>(null)

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

  const handleSort = (id: TaskTableColumnId) => {
    toggleSortColumn(id)
  }

  // Menu DnD handlers
  const handleMenuDragStart = (event: React.DragEvent<HTMLDivElement>, id: TaskTableColumnId) => {
    menuDragSourceIdRef.current = id
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", id)

    // Apply active/drag style to the row directly to avoid React re-render which cancels drag in WebView2.
    const dragRow = event.currentTarget.closest("[data-drag-row]")
    if (dragRow) {
      dragRow.classList.add("opacity-40", "bg-muted/30")
    }
  }

  const handleMenuDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
  }

  const handleMenuDrop = (event: React.DragEvent<HTMLDivElement>, targetId: TaskTableColumnId) => {
    event.preventDefault()
    event.stopPropagation()
    const sourceId = menuDragSourceIdRef.current

    if (sourceId && sourceId !== targetId) {
      moveColumn(sourceId, targetId)
    }
    menuDragSourceIdRef.current = null
  }

  const handleMenuDragEnd = (event: React.DragEvent<HTMLDivElement>) => {
    const dragRow = event.currentTarget.closest("[data-drag-row]")
    if (dragRow) {
      dragRow.classList.remove("opacity-40", "bg-muted/30")
    }
    window.setTimeout(() => {
      menuDragSourceIdRef.current = null
    }, 100)
  }

  const visibleLeafColumns = table.getVisibleLeafColumns()

  return (
    <div
      data-slot="task-list-header"
      className={cn(
        "flex h-13 shrink-0 items-center overflow-hidden",
        embedded ? "rounded-lg bg-card/95 backdrop-blur-md shadow-md border border-border/40" : "rounded-lg bg-card/95 shadow-surface-raised",
        className
      )}
      style={{ width: `${tableWidth}px` }}
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
        {visibleLeafColumns.map((col, index) => {
          const storeCol = columns.find((c) => c.id === col.id)
          const colState = { id: col.id as TaskTableColumnId, width: storeCol?.width || col.getSize() }
          return (
            <HeaderCell
              key={col.id}
              column={colState}
              meta={TASK_TABLE_COLUMN_META[col.id as TaskTableColumnId]}
              sort={sort}
              showSeparator={index > 0}
              onSort={handleSort}
              onResizeStart={handleResizeStart}
            />
          )
        })}
      </div>
      
      {/* Column settings button */}
      <div 
        className="flex h-full shrink-0 items-center justify-center border-l border-border/40 px-2.5"
        style={{ width: TASK_TABLE_SETTINGS_COLUMN_WIDTH }}
      >
        <PopoverPrimitive.Root modal={false}>
          <PopoverPrimitive.Trigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8.5 rounded-md hover:bg-muted/50 text-foreground/85 hover:text-foreground"
              aria-label="管理列"
            >
              <SlidersHorizontal className="size-4" />
            </Button>
          </PopoverPrimitive.Trigger>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content 
              align="end" 
              sideOffset={6}
              className="w-56 p-2 bg-popover/98 backdrop-blur-md border border-border/80 shadow-lg z-[200] rounded-lg outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
            >
              <div className="px-2 py-1.5 text-xs font-bold text-muted-foreground border-b border-border/40 mb-1 select-none">
                表头列管理
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {columns.map((col) => {
                  const meta = TASK_TABLE_COLUMN_META[col.id]

                  return (
                    <div
                      key={col.id}
                      data-drag-row={col.id}
                      onDragOver={handleMenuDragOver}
                      onDragEnter={(e) => e.preventDefault()}
                      onDrop={(e) => handleMenuDrop(e, col.id)}
                      className="flex items-center gap-2 px-1.5 py-1 rounded-md text-sm select-none transition-colors hover:bg-muted/40"
                    >
                      <div
                        draggable
                        onDragStart={(e) => handleMenuDragStart(e, col.id)}
                        onDragEnd={handleMenuDragEnd}
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-muted/60 rounded text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <GripVertical className="size-3.5" />
                      </div>
                      <Checkbox
                        checked={col.visible !== false}
                        disabled={col.id === "name"}
                        onCheckedChange={() => toggleColumnVisibility(col.id)}
                        className="size-4"
                      />
                      <span className="text-foreground/90 font-medium truncate flex-1">{meta.label}</span>
                    </div>
                  )
                })}
              </div>
              <Separator className="my-1.5" />
              <div className="px-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => resetColumns()}
                  className="w-full h-8 justify-start text-xs text-primary hover:bg-primary/10 hover:text-primary font-medium"
                >
                  重置列设置
                </Button>
              </div>
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
      </div>
    </div>
  )
}

export { TASK_TABLE_COLUMN_META }
