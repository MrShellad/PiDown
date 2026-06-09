import { useState } from "react"
import { AlertTriangle, FileText, FolderOpen, Pause, Play, RefreshCw, Trash2 } from "lucide-react"
import { motion } from "motion/react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { IconPreview } from "@/components/ui/icon-picker"
import { useTaskSpeed } from "@/core/hooks/useTaskSpeed"
import { UI_TEXT } from "@/core/locale"
import { useDownloadStore, type Category, type Task } from "@/core/store/useDownloadStore"
import {
  type TaskTableColumnId,
  useTaskTableStore,
} from "@/core/store/useTaskTableStore"
import { getTaskTableWidth, TASK_TABLE_SELECT_COLUMN_WIDTH } from "@/core/taskTableLayout"
import { cn } from "@/lib/utils"

interface TaskTableRowProps {
  gid: string
  animateEntry?: boolean
  selected?: boolean
  onSelect?: (gid: string) => void
  onContextSelect?: (gid: string) => void
}

function statusText(status: Task["status"]) {
  switch (status) {
    case "Completed":
      return UI_TEXT.taskCard.completed
    case "Failed":
      return UI_TEXT.taskCard.failed
    case "Paused":
      return UI_TEXT.taskCard.paused
    case "Downloading":
    default:
      return UI_TEXT.taskCard.downloading
  }
}

function formatCreatedAt(timestamp?: number) {
  if (!timestamp) return "--"

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000))
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
          <span className="block truncate text-sm font-medium leading-5 text-foreground" title={name}>
            {name}
          </span>
        )}
      </div>
    </div>
  )
}

function NameCell({
  task,
  category,
}: {
  task: Task
  category?: Category
}) {
  const categoryColor = category?.color ?? "var(--muted-foreground)"

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <motion.span
        layout
        className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-border/60 bg-background/55"
        style={{ color: categoryColor }}
        whileHover={{ y: -1, scale: 1.04 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        title={category?.name ?? "未分类"}
      >
        <IconPreview value={category?.icon ?? "folder"} color={categoryColor} className="size-5" />
      </motion.span>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold leading-5 text-foreground">
          {task.name}
        </span>
      </div>
    </div>
  )
}

function TagsCell({ task }: { task: Task }) {
  if (!task.tags?.length) {
    return <span className="truncate text-muted-foreground">--</span>
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {task.tags.slice(0, 2).map((tag) => (
        <span
          key={tag.id}
          className="max-w-24 truncate rounded-full bg-muted/80 px-2 py-0.5 text-xs font-medium leading-4 text-muted-foreground"
          title={tag.name}
        >
          {tag.name}
        </span>
      ))}
      {task.tags.length > 2 ? (
        <span className="shrink-0 text-xs leading-4 text-muted-foreground">
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
}: {
  id: TaskTableColumnId
  task: Task
  speedStr: string
  etaStr: string
  downloadedStr: string
  totalStr: string
}) {
  switch (id) {
    case "size":
      return (
        <span className="truncate tabular-nums text-muted-foreground">
          {task.status === "Completed" ? totalStr : `${downloadedStr} / ${totalStr}`}
        </span>
      )
    case "status":
      return (
        <span
          className={cn(
            "truncate font-medium",
            task.status === "Downloading" && "text-primary",
            task.status === "Paused" && "text-status-warning",
            task.status === "Completed" && "text-status-success",
            task.status === "Failed" && "text-status-danger"
          )}
        >
          {statusText(task.status)}
        </span>
      )
    case "speed":
      return <span className="truncate tabular-nums text-muted-foreground">{speedStr}</span>
    case "eta":
      return <span className="truncate tabular-nums text-muted-foreground">{etaStr}</span>
    case "createdAt":
      return (
        <span className="truncate tabular-nums text-muted-foreground">
          {formatCreatedAt(task.createdAt)}
        </span>
      )
    case "tags":
      return <TagsCell task={task} />
    case "name":
    default:
      return null
  }
}

export default function TaskTableRow({
  gid,
  animateEntry = false,
  selected = false,
  onSelect,
  onContextSelect,
}: TaskTableRowProps) {
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteLocalFiles, setDeleteLocalFiles] = useState(false)
  const task = useDownloadStore((state) => state.tasks[gid])
  const categories = useDownloadStore((state) => state.categories)
  const toggleTask = useDownloadStore((state) => state.toggleTask)
  const removeTask = useDownloadStore((state) => state.removeTask)
  const openTaskFile = useDownloadStore((state) => state.openTaskFile)
  const openTaskFolder = useDownloadStore((state) => state.openTaskFolder)
  const restartTask = useDownloadStore((state) => state.restartTask)
  const columns = useTaskTableStore((state) => state.columns)
  const { speedStr, progress, etaStr, downloadedStr, totalStr } = useTaskSpeed(gid)
  const tableWidth = getTaskTableWidth(columns)

  if (!task) return null

  const category = categories.find((item) => item.id === task.categoryId)
  const safeProgress = Math.min(100, Math.max(0, progress))
  const showProgressOverlay = task.status !== "Completed"
  const progressTint =
    task.status === "Failed"
        ? "var(--task-progress-failed)"
        : task.status === "Paused"
          ? "var(--task-progress-paused)"
          : "var(--task-progress-active)"
  const requestDelete = () => {
    setDeleteLocalFiles(false)
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
          onClick={() => onSelect?.(gid)}
          onContextMenu={() => onContextSelect?.(gid)}
          className={cn(
            "group/task-row relative flex min-h-17 cursor-pointer items-center overflow-hidden rounded-lg bg-card/80 text-sm leading-5 transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
            contextMenuOpen && "bg-card"
          )}
          style={{ minWidth: tableWidth }}
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
              "pointer-events-none absolute inset-0 bg-gradient-to-r from-white/[0.025] via-transparent to-black/5 transition-opacity duration-200",
              contextMenuOpen ? "opacity-100" : "opacity-0 group-hover/task-row:opacity-100"
            )}
          />
      <div
        className="relative z-10 flex min-h-17 shrink-0 items-center justify-center"
        style={{ width: TASK_TABLE_SELECT_COLUMN_WIDTH }}
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
        {columns.map((column, index) => (
          <div
            key={column.id}
            data-slot="task-table-cell"
            className="relative flex min-h-17 shrink-0 items-center px-4"
            style={{ width: column.width }}
          >
            {index > 0 ? (
              <span
                aria-hidden="true"
                className="absolute left-0 top-1/2 h-6 w-px -translate-y-1/2 bg-border/50"
              />
            ) : null}
            {column.id === "name" ? (
              <NameCell
                task={task}
                category={category}
              />
            ) : (
              <Cell
                id={column.id}
                task={task}
                speedStr={speedStr}
                etaStr={etaStr}
                downloadedStr={downloadedStr}
                totalStr={totalStr}
              />
            )}
          </div>
        ))}
      </div>
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
          <ContextMenuItem
            disabled={task.status === "Downloading" || task.status === "Completed"}
            onSelect={() => toggleTask(gid)}
          >
            <Play className="size-5" />
            <span>恢复</span>
            <ContextMenuShortcut>Ctrl+R</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem disabled={task.status !== "Downloading"} onSelect={() => toggleTask(gid)}>
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
          <ContextMenuItem onSelect={() => restartTask(gid)}>
            <RefreshCw className="size-5" />
            <span>重新下载</span>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent size="sm" variant="alert" showCloseButton={false}>
          <DialogHeader>
            <div className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <AlertTriangle className="size-5" />
            </div>
            <DialogTitle className="text-destructive">删除任务</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <DialogDescription>
              确认删除任务“{task.name}”？这个操作会从任务列表中移除该记录。
            </DialogDescription>
            <p className="text-sm leading-6 text-muted-foreground">
              勾选后会同时尝试删除已下载文件和临时分片文件，请确认不再需要本地文件。
            </p>
            <label className="mx-auto flex max-w-80 cursor-pointer items-center justify-center gap-3 rounded-md bg-muted/50 px-4 py-3 text-sm leading-5 text-foreground">
              <Checkbox
                checked={deleteLocalFiles}
                onCheckedChange={(checked) => setDeleteLocalFiles(checked === true)}
              />
              <span>同时删除本地文件</span>
            </label>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDeleteConfirmOpen(false)
                removeTask(gid, deleteLocalFiles)
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
