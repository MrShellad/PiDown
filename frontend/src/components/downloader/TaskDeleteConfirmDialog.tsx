import { useState } from "react"
import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface TaskDeleteConfirmDialogProps {
  open: boolean
  taskCount: number
  taskName?: string
  onOpenChange: (open: boolean) => void
  onConfirm: (deleteLocalFiles: boolean) => void
}

export default function TaskDeleteConfirmDialog({
  open,
  taskCount,
  taskName,
  onOpenChange,
  onConfirm,
}: TaskDeleteConfirmDialogProps) {
  const [deleteLocalFiles, setDeleteLocalFiles] = useState(false)
  const isBatch = taskCount > 1

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setDeleteLocalFiles(false)
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent size="sm" variant="alert" showCloseButton={false}>
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </div>
          <DialogTitle className="text-destructive">删除任务</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>
            {isBatch
              ? `确认删除选中的 ${taskCount} 个任务？这个操作会从任务列表中移除这些记录。`
              : `确认删除任务“${taskName ?? "未命名任务"}”？这个操作会从任务列表中移除该记录。`}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onOpenChange(false)
              onConfirm(deleteLocalFiles)
            }}
          >
            删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
