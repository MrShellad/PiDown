import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { FileConflictCheck } from "@/core/bridge/tauri-commands"

interface NewTaskConflictDialogProps {
  conflictCheck: FileConflictCheck | null
  onRenameManually: () => void
  onUseSuggestedFilename: () => void
  onOverwriteExistingFile: () => void
}

export function NewTaskConflictDialog({
  conflictCheck,
  onRenameManually,
  onUseSuggestedFilename,
  onOverwriteExistingFile,
}: NewTaskConflictDialogProps) {
  return (
    <Dialog
      open={Boolean(conflictCheck)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onRenameManually()
      }}
    >
      <DialogContent variant="alert" size="lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>文件已存在</DialogTitle>
        </DialogHeader>
        <DialogBody className="text-left">
          <p className="text-sm leading-6 text-muted-foreground">
            目标目录中已经存在同名文件，请选择处理方式后继续创建下载任务。
          </p>
          {conflictCheck ? (
            <div className="space-y-2 rounded-lg border border-border bg-background/70 p-3 font-mono text-xs leading-5 text-muted-foreground">
              <div className="truncate text-foreground">{conflictCheck.target_path}</div>
              <div className="truncate">建议：{conflictCheck.suggested_filename}</div>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter className="sm:[&_[data-slot=button]]:w-auto">
          <Button type="button" variant="outline" onClick={onRenameManually}>
            手动重命名
          </Button>
          <Button type="button" onClick={onUseSuggestedFilename}>
            添加数字后缀
          </Button>
          <Button type="button" variant="destructive" onClick={onOverwriteExistingFile}>
            覆盖
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
