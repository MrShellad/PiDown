import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { FileConflictCheck } from "@/core/bridge/tauri-commands"
import { UI_TEXT } from "@/core/locale"

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
          <DialogTitle>{UI_TEXT.newTask.conflict.dialogTitle}</DialogTitle>
        </DialogHeader>
        <DialogBody className="text-left">
          <p className="text-sm leading-6 text-muted-foreground">
            {UI_TEXT.newTask.conflict.dialogDesc}
          </p>
          {conflictCheck ? (
            <div className="space-y-2 rounded-lg border border-border bg-background/70 p-3 font-mono text-xs leading-5 text-muted-foreground">
              <div className="truncate text-foreground">{conflictCheck.target_path}</div>
              <div className="truncate">
                {UI_TEXT.newTask.conflict.suggestedName}
                {conflictCheck.suggested_filename}
              </div>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter className="sm:[&_[data-slot=button]]:w-auto">
          <Button type="button" variant="outline" onClick={onRenameManually}>
            {UI_TEXT.newTask.conflict.manualRename}
          </Button>
          <Button type="button" onClick={onUseSuggestedFilename}>
            {UI_TEXT.newTask.conflict.addSuffix}
          </Button>
          <Button type="button" variant="destructive" onClick={onOverwriteExistingFile}>
            {UI_TEXT.newTask.conflict.overwrite}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
