import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"
import { CircleHelp, LoaderCircle, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { FileChecksumAlgorithm } from "@/core/bridge/tauri-commands"
import type { Task } from "@/core/store/useDownloadStore"
import { cn } from "@/lib/utils"
import {
  CHECKSUM_STATUS_LABELS,
  FILE_CHECKSUM_ALGORITHMS,
  type TaskChecksumRow,
} from "./types"
import { useTaskChecksumDialog } from "./useTaskChecksumDialog"

interface TaskChecksumDialogProps {
  open: boolean
  task: Task
  onOpenChange: (open: boolean) => void
}

type ChecksumColumnId = "name" | "status" | "algorithm" | "checksum" | "savedChecksum"

interface ChecksumColumnState {
  id: ChecksumColumnId
  label: string
  width: number
  minWidth: number
}

const DEFAULT_CHECKSUM_COLUMNS: ChecksumColumnState[] = [
  { id: "name", label: "名称", width: 188, minWidth: 140 },
  { id: "status", label: "状态", width: 126, minWidth: 96 },
  { id: "algorithm", label: "算法", width: 104, minWidth: 84 },
  { id: "checksum", label: "计算出的校验和", width: 344, minWidth: 220 },
  { id: "savedChecksum", label: "保存的校验和", width: 262, minWidth: 180 },
]

function clampColumnWidth(column: ChecksumColumnState, width: number) {
  return Math.max(column.minWidth, Math.min(560, width))
}

function ChecksumCell({
  children,
  className,
  title,
}: {
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center border-l border-border/70 px-5 first:border-l-0",
        className
      )}
      title={title}
    >
      {children}
    </div>
  )
}

function StatusValue({ row }: { row: TaskChecksumRow }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-2 truncate font-medium",
        row.status === "completed" && "text-status-success",
        row.status === "failed" && "text-status-danger",
        row.status === "running" && "text-primary"
      )}
      title={row.error}
    >
      {row.status === "running" ? <LoaderCircle className="size-4 animate-spin" /> : null}
      <span className="truncate">{CHECKSUM_STATUS_LABELS[row.status]}</span>
    </span>
  )
}

function TaskChecksumTable({ row }: { row: TaskChecksumRow }) {
  const savedChecksum = row.savedChecksum || "--"
  const [columns, setColumns] = useState(DEFAULT_CHECKSUM_COLUMNS)
  const resizeRef = useRef<{
    id: ChecksumColumnId
    startX: number
    startWidth: number
  } | null>(null)
  const gridTemplateColumns = useMemo(
    () => columns.map((column) => `${column.width}px`).join(" "),
    [columns]
  )
  const tableWidth = useMemo(
    () => columns.reduce((total, column) => total + column.width, 0),
    [columns]
  )

  const handleResizeStart = (
    event: ReactPointerEvent<HTMLButtonElement>,
    column: ChecksumColumnState
  ) => {
    event.preventDefault()
    event.stopPropagation()

    resizeRef.current = {
      id: column.id,
      startX: event.clientX,
      startWidth: column.width,
    }

    event.currentTarget.setPointerCapture(event.pointerId)

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const resize = resizeRef.current
      if (!resize) return

      setColumns((current) =>
        current.map((item) =>
          item.id === resize.id
            ? { ...item, width: clampColumnWidth(item, resize.startWidth + moveEvent.clientX - resize.startX) }
            : item
        )
      )
    }

    const handlePointerUp = () => {
      resizeRef.current = null
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
  }

  return (
    <ScrollArea
      className="min-h-0 min-w-0 max-w-full flex-1"
      orientation="both"
      scrollbar="overlay"
      visibility="auto"
      gutter="stable"
      viewportClassName="min-w-0"
    >
      <div style={{ minWidth: tableWidth, width: `max(100%, ${tableWidth}px)` }}>
        <div
          className="grid h-12 items-center border-b border-border/70 bg-muted/70 text-sm font-medium text-muted-foreground"
          style={{ gridTemplateColumns }}
        >
          {columns.map((column) => (
            <ChecksumCell key={column.id} className="relative pr-7">
              <span className="truncate">{column.label}</span>
              <button
                type="button"
                aria-label={`${column.label} 调整列宽`}
                className="absolute right-0 top-1/2 h-7 w-3 -translate-y-1/2 cursor-col-resize rounded-full outline-none transition-colors hover:bg-primary/20 focus-visible:bg-primary/25 focus-visible:ring-2 focus-visible:ring-ring/40"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => handleResizeStart(event, column)}
              />
            </ChecksumCell>
          ))}
        </div>
        <div
          className="grid min-h-14 items-center text-sm text-foreground"
          style={{ gridTemplateColumns }}
        >
          <ChecksumCell>
            <span className="truncate" title={row.name}>
              {row.name}
            </span>
          </ChecksumCell>
          <ChecksumCell>
            <StatusValue row={row} />
          </ChecksumCell>
          <ChecksumCell>
            <span className="truncate">{row.algorithm}</span>
          </ChecksumCell>
          <ChecksumCell title={row.checksum}>
            <span className="block truncate font-mono text-xs leading-5 text-muted-foreground">
              {row.checksum || "--"}
            </span>
          </ChecksumCell>
          <ChecksumCell title={savedChecksum}>
            <span className="block truncate font-mono text-xs leading-5 text-muted-foreground">
              {savedChecksum}
            </span>
          </ChecksumCell>
        </div>
      </div>
      {row.error ? (
        <div className="px-5 pt-3 text-sm leading-5 text-status-danger">{row.error}</div>
      ) : null}
    </ScrollArea>
  )
}

export default function TaskChecksumDialog({
  open,
  task,
  onOpenChange,
}: TaskChecksumDialogProps) {
  const { algorithm, row, running, setAlgorithm, start } = useTaskChecksumDialog(task, open)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="h-[28rem] max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-5xl"
      >
        <DialogHeader className="items-start px-5 py-3 text-left">
          <DialogTitle className="flex min-w-0 items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="size-5" />
            </span>
            <span className="truncate">文件校验和检查器</span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            计算当前下载任务文件的校验和，并与保存的校验和进行对照。
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex min-h-0 flex-col p-0 sm:p-0">
          <TaskChecksumTable row={row} />
        </DialogBody>
        <DialogFooter className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between [&_[data-slot=button]]:w-full sm:[&_[data-slot=button]]:w-28">
          <div className="flex w-full min-w-0 items-center gap-2 text-sm sm:w-auto">
            <span className="shrink-0 text-foreground">默认算法</span>
            <CircleHelp className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Select
              value={algorithm}
              onValueChange={(value) => setAlgorithm(value as FileChecksumAlgorithm)}
              disabled={running}
            >
              <SelectTrigger className="w-32" aria-label="默认算法">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILE_CHECKSUM_ALGORITHMS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
            <Button variant="default" loading={running} loadingText="计算中" onClick={start}>
              开始
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
