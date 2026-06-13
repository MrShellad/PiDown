import { RefreshCw } from "lucide-react"

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

interface TaskRestartConfirmDialogProps {
  open: boolean
  taskName?: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export default function TaskRestartConfirmDialog({
  open,
  taskName,
  onOpenChange,
  onConfirm,
}: TaskRestartConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" variant="alert" showCloseButton={false}>
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <RefreshCw className="size-5" />
          </div>
          <DialogTitle className="text-primary">重新下载</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>
            确认重新下载任务“{taskName ?? "未命名任务"}”？
          </DialogDescription>
          <p className="text-sm leading-6 text-muted-foreground">
            重新下载将重置当前任务的下载进度并重新开始，已下载的临时分片文件将被清除。
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant="default"
            onClick={() => {
              onOpenChange(false)
              onConfirm()
            }}
          >
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
