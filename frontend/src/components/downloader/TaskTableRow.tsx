import { useState, memo } from "react"
import { ArrowDown, ArrowUp, FileText, FolderOpen, Pause, Play, RefreshCw, ShieldCheck, Trash2 } from "lucide-react"
import { motion } from "motion/react"

import { Checkbox } from "@/components/ui/checkbox"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { IconPreview } from "@/components/ui/icon-picker"
import { formatDateTime } from "@/core/datetime"
import { useTaskSpeed } from "@/core/hooks/useTaskSpeed"
import { UI_TEXT } from "@/core/locale"
import { useDownloadStore, type Category, type Task } from "@/core/store/useDownloadStore"
import {
  type TaskTableColumnId,
  type TaskTableColumnState,
} from "@/core/store/useTaskTableStore"
import {
  TASK_TABLE_SELECT_COLUMN_WIDTH,
  TASK_TABLE_SETTINGS_COLUMN_WIDTH,
} from "@/core/taskTableLayout"
import type { Table } from "@tanstack/react-table"
import { cn } from "@/lib/utils"
import TaskChecksumDialog from "./checksum/TaskChecksumDialog"
import TaskDeleteConfirmDialog from "./TaskDeleteConfirmDialog"
import TaskRestartConfirmDialog from "./TaskRestartConfirmDialog"

interface TaskTableRowProps {
  gid: string
  exitingTask?: Task | null
  animateEntry?: boolean
  selected?: boolean
  detailsOpen?: boolean
  onSelect?: (gid: string) => void
  onContextSelect?: (gid: string) => void
  onOpenDetails?: (gid: string) => void
  selectionMode?: boolean
  table: Table<Task>
  categories: Category[]
  toggleTask: (gid: string) => Promise<void>
  removeTask: (gid: string, deleteFiles?: boolean) => Promise<void>
  openTaskFile: (gid: string) => Promise<void>
  openTaskFolder: (gid: string) => Promise<void>
  restartTask: (gid: string) => Promise<void>
  columns: TaskTableColumnState[]
  tableWidth: number
  datetimeFormat?: string
}

function statusText(status: Task["status"]) {
  switch (status) {
    case "Completed":
      return UI_TEXT.taskCard.completed
    case "Failed":
      return UI_TEXT.taskCard.failed
    case "Paused":
      return UI_TEXT.taskCard.paused
    case "Seeding":
      return UI_TEXT.taskCard.seeding
    case "Downloading":
    default:
      return UI_TEXT.taskCard.downloading
  }
}

function DownloadingStatusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4 shrink-0 stroke-primary">
      <motion.path
        d="M2 12C5 9 7 15 10 12C13 9 15 15 18 12C20 10 21 11 22 12"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        animate={{
          d: [
            "M2 12C5 8.5 7 15.5 10 12C13 8.5 15 15.5 18 12C20 9.5 21 11 22 12",
            "M2 12C5 15.5 7 8.5 10 12C13 15.5 15 8.5 18 12C20 14.5 21 13 22 12",
            "M2 12C5 8.5 7 15.5 10 12C13 8.5 15 15.5 18 12C20 9.5 21 11 22 12",
          ],
        }}
        transition={{
          duration: 1.6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </svg>
  )
}

function SvgTaskProgressWave({
  progressTint,
  isDownloading,
}: {
  progressTint: string
  isDownloading: boolean
}) {
  return (
    <div className="pointer-events-none relative h-full w-10 overflow-hidden flex items-center justify-center">
      <svg
        viewBox="0 0 40 100"
        preserveAspectRatio="none"
        className="h-full w-full opacity-90"
      >
        <motion.path
          fill="color-mix(in srgb, var(--task-progress-tint) 65%, transparent)"
          style={{ ["--task-progress-tint" as string]: progressTint }}
          animate={
            isDownloading
              ? {
                  d: [
                    "M 0,0 Q 20,25 0,50 T 0,100 L 40,100 L 40,0 Z",
                    "M 0,0 Q -20,25 0,50 T 0,100 L 40,100 L 40,0 Z",
                    "M 0,0 Q 20,25 0,50 T 0,100 L 40,100 L 40,0 Z",
                  ],
                }
              : { d: "M 0,0 Q 0,25 0,50 T 0,100 L 40,100 L 40,0 Z" }
          }
          transition={
            isDownloading
              ? {
                  duration: 2.2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }
              : { duration: 0.3 }
          }
        />
        <motion.path
          fill="var(--task-progress-tint)"
          style={{ ["--task-progress-tint" as string]: progressTint }}
          opacity={0.8}
          animate={
            isDownloading
              ? {
                  d: [
                    "M 0,0 Q -15,25 0,50 T 0,100 L 40,100 L 40,0 Z",
                    "M 0,0 Q 15,25 0,50 T 0,100 L 40,100 L 40,0 Z",
                    "M 0,0 Q -15,25 0,50 T 0,100 L 40,100 L 40,0 Z",
                  ],
                }
              : { d: "M 0,0 Q 0,25 0,50 T 0,100 L 40,100 L 40,0 Z" }
          }
          transition={
            isDownloading
              ? {
                  duration: 1.6,
                  repeat: Infinity,
                  ease: "easeInOut",
                }
              : { duration: 0.3 }
          }
        />
      </svg>
    </div>
  )
}

function PreparingStatus() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex min-w-0 items-center gap-2 truncate font-medium text-primary cursor-help">
          <motion.span
            aria-hidden="true"
            className="size-2 rounded-full bg-primary"
            animate={{ scale: [0.85, 1.25, 0.85], opacity: [0.45, 1, 0.45] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
          />
          <span className="truncate">{UI_TEXT.taskCard.preparing}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{UI_TEXT.taskCard.preparingHint}</TooltipContent>
    </Tooltip>
  )
}

function formatCreatedAt(timestamp?: number, formatPattern?: string) {
  return formatDateTime(timestamp, formatPattern || "YYYY-MM-DD HH:mm:ss")
}

function TaskContextMenuTitle({ name }: { name: string }) {
  const shouldScroll = name.length > 28

  return (
    <div className="mx-1 mb-1 rounded-md bg-muted/45 px-3 py-2.5 shadow-surface-inset">
      <span className="mb-1 block text-xs font-medium leading-4 text-muted-foreground">
        选中任务
      </span>
      <div className="relative overflow-hidden">
        {shouldScroll ? (
          <motion.div
            className="flex w-max gap-8 whitespace-nowrap text-sm font-medium leading-5 text-foreground"
            animate={{ x: ["0%", "-50%"] }}
            transition={{
              duration: Math.min(18, Math.max(7, name.length * 0.22)),
              ease: "linear",
              repeat: Infinity,
            }}
          >
            <span>{name}</span>
            <span aria-hidden="true">{name}</span>
          </motion.div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block truncate text-sm font-medium leading-5 text-foreground">
                {name}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs break-all">{name}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

function NameCell({
  task,
  category,
  detailsOpen = false,
  selectionMode = false,
  onSelect,
  onOpenDetails,
}: {
  task: Task
  category?: Category
  detailsOpen?: boolean
  selectionMode?: boolean
  onSelect?: () => void
  onOpenDetails?: () => void
}) {
  const [isHovered, setIsHovered] = useState(false)
  const categoryColor = category?.color ?? "var(--muted-foreground)"
  const stopRowSelection = (event: React.SyntheticEvent) => {
    event.stopPropagation()
  }

  const iconColor = isHovered || detailsOpen ? "var(--primary)" : categoryColor

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="flex size-5 shrink-0 items-center justify-center border-0 bg-transparent p-0 outline-none transition-colors duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring/45 rounded-sm"
            aria-controls="task-details-sheet"
            aria-expanded={detailsOpen}
            aria-label={`查看任务详情：${task.name}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onPointerDown={stopRowSelection}
            onMouseDown={stopRowSelection}
            onDoubleClick={stopRowSelection}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.stopPropagation()
              }
            }}
            onClick={(event) => {
              event.stopPropagation()
              if (selectionMode) {
                onSelect?.()
              } else {
                onOpenDetails?.()
              }
            }}
          >
            <IconPreview value={category?.icon ?? "folder"} color={iconColor} className="size-5 transition-colors duration-200" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{`查看任务详情：${category?.name ?? "未分类"}`}</TooltipContent>
      </Tooltip>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium leading-5 text-foreground">
          {task.name}
        </span>
      </div>
    </div>
  )
}

function TagsCell({ task }: { task: Task }) {
  if (!task.tags?.length) {
    return <span className="truncate text-foreground/60 font-medium">--</span>
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {task.tags.slice(0, 2).map((tag) => (
        <Tooltip key={tag.id}>
          <TooltipTrigger asChild>
            <span className="max-w-24 truncate rounded-full bg-muted/80 px-2 py-0.5 text-xs font-semibold leading-4 text-foreground/85">
              {tag.name}
            </span>
          </TooltipTrigger>
          <TooltipContent>{tag.name}</TooltipContent>
        </Tooltip>
      ))}
      {task.tags.length > 2 ? (
        <span className="shrink-0 text-xs font-semibold leading-4 text-foreground/70">
          +{task.tags.length - 2}
        </span>
      ) : null}
    </div>
  )
}

function Cell({
  id,
  task,
  speedStr,
  etaStr,
  downloadedStr,
  totalStr,
  preparing,
  datetimeFormat,
}: {
  id: TaskTableColumnId
  task: Task
  speedStr: string
  etaStr: string
  downloadedStr: string
  totalStr: string
  preparing: boolean
  datetimeFormat?: string
}) {
  switch (id) {
    case "size":
      return (
        <span className="truncate tabular-nums text-foreground/80 font-medium">
          {task.status === "Completed" || task.status === "Seeding" ? totalStr : `${downloadedStr} / ${totalStr}`}
        </span>
      )
    case "status":
      if (preparing) return <PreparingStatus />

      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 truncate font-semibold",
            task.status === "Downloading" && "text-primary",
            task.status === "Seeding" && "text-status-success",
            task.status === "Paused" && "text-status-warning",
            task.status === "Completed" && "text-status-success",
            task.status === "Failed" && "text-status-danger"
          )}
        >
          {task.status === "Downloading" && <DownloadingStatusIcon />}
          <span>{statusText(task.status)}</span>
        </span>
      )
    case "speed": {
      if (preparing) {
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="truncate tabular-nums text-foreground/70 font-medium cursor-help">
                {UI_TEXT.taskCard.preparing}
              </span>
            </TooltipTrigger>
            <TooltipContent>{UI_TEXT.taskCard.preparingHint}</TooltipContent>
          </Tooltip>
        )
      }
      
      const hasDownLimit = !!task.maxDownloadSpeedKib && task.maxDownloadSpeedKib > 0
      const hasUpLimit = !!task.maxUploadSpeedKib && task.maxUploadSpeedKib > 0

      return (
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate tabular-nums text-foreground/80 font-medium">
            {speedStr}
          </span>
          {(hasDownLimit || hasUpLimit) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center text-status-danger shrink-0 select-none">
                  {hasDownLimit && <ArrowDown className="size-3.5 stroke-[2.5]" />}
                  {hasUpLimit && <ArrowUp className="size-3.5 stroke-[2.5]" />}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {hasDownLimit && hasUpLimit
                  ? `限速: 下载 ${task.maxDownloadSpeedKib} KB/s, 上传 ${task.maxUploadSpeedKib} KB/s`
                  : hasDownLimit
                    ? `限速: 下载 ${task.maxDownloadSpeedKib} KB/s`
                    : `限速: 上传 ${task.maxUploadSpeedKib} KB/s`}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )
    }
    case "eta":
      return <span className="truncate tabular-nums text-foreground/80 font-medium">{etaStr}</span>
    case "createdAt":
      return (
        <span className="truncate tabular-nums text-foreground/80 font-medium">
          {formatCreatedAt(task.createdAt, datetimeFormat)}
        </span>
      )
    case "tags":
      return <TagsCell task={task} />
    case "name":
    default:
      return null
  }
}

const TaskTableRow = memo(function TaskTableRow({
  gid,
  exitingTask = null,
  animateEntry = false,
  selected = false,
  detailsOpen = false,
  onSelect,
  onContextSelect,
  onOpenDetails,
  selectionMode = false,
  table,
  categories,
  toggleTask,
  removeTask,
  openTaskFile,
  openTaskFolder,
  restartTask,
  columns,
  tableWidth,
  datetimeFormat,
}: TaskTableRowProps) {
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [checksumOpen, setChecksumOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false)
  
  const storeTask = useDownloadStore((state) => state.tasks[gid])
  const task = storeTask ?? exitingTask
  const { speedStr, progress, etaStr, downloadedStr, totalStr } = useTaskSpeed(gid)

  if (!task) return null

  const category = categories.find((item) => item.id === task.categoryId)
  const isPreparing =
    task.status === "Downloading" &&
    task.downloadedBytes === 0 &&
    speedStr === "0 B/s"
  const safeProgress = Math.min(100, Math.max(0, progress))
  const showProgressOverlay = task.status !== "Completed" && task.status !== "Seeding"
  const progressTint =
    task.status === "Failed"
        ? "var(--task-progress-failed)"
        : task.status === "Paused"
          ? "var(--task-progress-paused)"
          : "var(--task-progress-active)"
  const requestDelete = () => {
    setDeleteConfirmOpen(true)
  }

  return (
    <>
      <ContextMenu open={contextMenuOpen} onOpenChange={setContextMenuOpen}>
        <ContextMenuTrigger asChild>
          <motion.div
      layout={animateEntry}
      initial={animateEntry ? { opacity: 0, y: 10, scale: 0.985 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={animateEntry ? { opacity: 0, scale: 0.98 } : undefined}
          transition={{ duration: 0.18, ease: "easeOut" }}
          data-slot="task-table-row"
          role="row"
          aria-selected={selected}
          onClick={() => {
            if (selectionMode) {
              onSelect?.(gid)
            } else {
              onOpenDetails?.(gid)
            }
          }}
          onContextMenu={() => {
            setTimeout(() => {
              onContextSelect?.(gid)
            }, 0)
          }}
          className={cn(
            "group/task-row relative flex min-h-[60px] cursor-pointer items-center overflow-hidden rounded-lg bg-task-row text-sm leading-5 transition-colors hover:bg-task-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
            contextMenuOpen && "bg-primary/8 ring-1.5 ring-primary/30 z-20"
          )}
          style={{ width: "100%", minWidth: `${tableWidth}px` }}
        >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 origin-left"
        style={{
          background:
            "linear-gradient(90deg, var(--task-progress-tint), color-mix(in oklab, var(--task-progress-tint) 55%, transparent))",
          width: "100%",
          ["--task-progress-tint" as string]: progressTint,
        }}
        initial={false}
        animate={{ scaleX: showProgressOverlay ? safeProgress / 100 : 0 }}
        transition={{ type: "spring", stiffness: 150, damping: 24, mass: 0.7 }}
      />
      {showProgressOverlay && safeProgress > 0 && safeProgress < 100 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 z-10 transition-all duration-300 ease-out"
          style={{ left: `${safeProgress}%`, transform: "translateX(-50%)" }}
        >
          <SvgTaskProgressWave
            progressTint={progressTint}
            isDownloading={task.status === "Downloading"}
          />
        </div>
      )}
          <motion.div
            aria-hidden="true"
            className="task-selection-overlay pointer-events-none absolute inset-0"
            initial={false}
            animate={{ opacity: selected ? 1 : 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          />
          <motion.div
            aria-hidden="true"
            className="task-selection-ring pointer-events-none absolute inset-0 rounded-lg"
            initial={false}
            animate={{ opacity: selected ? 1 : 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          />
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent"
            initial={false}
            animate={{
              opacity: isPreparing ? [0.18, 0.42, 0.18] : 0,
              x: isPreparing ? ["-45%", "45%"] : "0%",
            }}
            transition={
              isPreparing
                ? { duration: 1.65, repeat: Infinity, ease: "easeInOut" }
                : { duration: 0.16, ease: "easeOut" }
            }
          />
          <motion.div
            aria-hidden="true"
            className="task-selection-indicator pointer-events-none absolute left-0 top-1/2 h-9 w-1 origin-center -translate-y-1/2 rounded-r-full"
            initial={false}
            animate={{
              opacity: selected ? 1 : 0,
              scaleY: selected ? 1 : 0.35,
            }}
            transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.45 }}
          />
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-r from-primary/12 via-primary/[0.03] to-transparent shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--primary),transparent_82%)] transition-opacity duration-200",
              contextMenuOpen ? "opacity-100" : "opacity-0 group-hover/task-row:opacity-100"
            )}
          />
      <div
        className="relative z-10 flex min-h-[60px] shrink-0 items-center justify-center"
        style={{ width: TASK_TABLE_SELECT_COLUMN_WIDTH }}
        onClick={(event) => {
          event.stopPropagation()
          onSelect?.(gid)
        }}
      >
        <motion.div
          className="relative grid size-9 place-items-center"
          initial={false}
          animate={{ scale: selected ? 1.08 : 1 }}
          transition={{ type: "spring", stiffness: 520, damping: 26, mass: 0.35 }}
        >
          <motion.span
            aria-hidden="true"
            className="task-selection-control-halo pointer-events-none absolute inset-0 rounded-full"
            initial={false}
            animate={{
              opacity: selected ? 1 : 0,
              scale: selected ? 1 : 0.7,
            }}
            transition={{ type: "spring", stiffness: 480, damping: 28, mass: 0.35 }}
          />
        <Checkbox
          checked={selected}
          aria-label={`选择任务 ${task.name}`}
          className="relative z-10 size-5"
          onClick={(event) => event.stopPropagation()}
          onCheckedChange={() => onSelect?.(gid)}
        />
        </motion.div>
      </div>

      <div className="relative z-10 flex min-w-0 flex-1 overflow-hidden">
        {table.getVisibleLeafColumns().map((col, index) => {
          const colId = col.id as TaskTableColumnId
          const storeCol = columns.find((c) => c.id === colId)
          const width = storeCol?.width || col.getSize()

          return (
            <div
              key={colId}
              data-slot="task-table-cell"
              className={cn(
                "relative flex min-h-[60px] shrink-0 items-center",
                colId === "name" ? "justify-start pl-2.5 pr-4" : "justify-center px-4"
              )}
              style={{
                flexBasis: width,
                width: width,
                flexGrow: colId === "name" ? 1 : 0,
              }}
            >
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-1/2 h-6 w-px -translate-y-1/2 bg-border/50"
                />
              ) : null}
              {colId === "name" ? (
                <NameCell
                  task={task}
                  category={category}
                  detailsOpen={detailsOpen}
                  selectionMode={selectionMode}
                  onSelect={() => onSelect?.(gid)}
                  onOpenDetails={onOpenDetails ? () => onOpenDetails(gid) : undefined}
                />
              ) : (
                <Cell
                  id={colId}
                  task={task}
                  speedStr={speedStr}
                  etaStr={etaStr}
                  downloadedStr={downloadedStr}
                  totalStr={totalStr}
                  preparing={isPreparing}
                  datetimeFormat={datetimeFormat}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Settings column alignment spacer */}
      <div
        className="relative z-10 h-full shrink-0"
        style={{ width: TASK_TABLE_SETTINGS_COLUMN_WIDTH }}
      />
          </motion.div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-72">
          <TaskContextMenuTitle name={task.name} />
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => openTaskFile(gid)}>
            <FileText className="size-5" />
            <span>打开</span>
            <ContextMenuShortcut>Ctrl+O</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => openTaskFolder(gid)}>
            <FolderOpen className="size-5" />
            <span>打开文件夹</span>
            <ContextMenuShortcut>Ctrl+F</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setChecksumOpen(true)}>
            <ShieldCheck className="size-5" />
            <span>文件校验</span>
          </ContextMenuItem>
          <ContextMenuItem
            disabled={task.status === "Downloading" || task.status === "Seeding" || task.status === "Completed"}
            onSelect={() => toggleTask(gid)}
          >
            <Play className="size-5" />
            <span>恢复</span>
            <ContextMenuShortcut>Ctrl+R</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem disabled={task.status !== "Downloading" && task.status !== "Seeding"} onSelect={() => toggleTask(gid)}>
            <Pause className="size-5" />
            <span>暂停</span>
            <ContextMenuShortcut>Ctrl+P</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onSelect={requestDelete}
          >
            <Trash2 className="size-5" />
            <span>删除</span>
            <ContextMenuShortcut>Delete</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setRestartConfirmOpen(true)}>
            <RefreshCw className="size-5" />
            <span>重新下载</span>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <TaskDeleteConfirmDialog
        open={deleteConfirmOpen}
        taskCount={1}
        taskName={task.name}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={(deleteLocalFiles) => removeTask(gid, deleteLocalFiles)}
      />
      <TaskChecksumDialog open={checksumOpen} task={task} onOpenChange={setChecksumOpen} />
      <TaskRestartConfirmDialog
        open={restartConfirmOpen}
        taskName={task.name}
        onOpenChange={setRestartConfirmOpen}
        onConfirm={() => restartTask(gid)}
      />
    </>
  )
})

export default TaskTableRow
