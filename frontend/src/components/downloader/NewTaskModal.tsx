import { Link2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { ExternalDownloadRequest } from "@/core/bridge/external-download"
import { UI_TEXT } from "@/core/locale"
import { NewTaskConflictDialog } from "./new-task/NewTaskConflictDialog"
import { NewTaskDetailsContent } from "./new-task/NewTaskDetailsContent"
import { NewTaskLinkStep } from "./new-task/NewTaskLinkStep"
import { useNewTaskModalState } from "./new-task/useNewTaskModalState"

interface NewTaskModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialRequest?: ExternalDownloadRequest | null
  onInitialRequestConsumed?: () => void
}

export default function NewTaskModal({
  open,
  onOpenChange,
  initialRequest,
  onInitialRequestConsumed,
}: NewTaskModalProps) {
  const { state, data, actions } = useNewTaskModalState({
    open,
    onOpenChange,
    initialRequest,
    onInitialRequestConsumed,
  })

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : actions.closeModal())}>
        <DialogContent
          variant="modal"
          className="border-border bg-card text-card-foreground sm:max-w-[46rem] max-h-[calc(100vh-4rem)] flex flex-col"
        >
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center justify-center gap-2 text-lg font-bold tracking-tight">
              <Link2 className="size-5 text-primary" />
              {UI_TEXT.newTask.title}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={actions.handleSubmit} className="flex flex-col min-h-0 flex-1">
            <ScrollArea className="flex-1 max-h-[calc(100vh-12rem)] min-h-0" scrollbar="overlay">
              <DialogBody className="px-5 py-5">
                {state.step === "link" ? (
                  <NewTaskLinkStep
                    url={state.url}
                    loading={state.loading}
                    onUrlChange={actions.setUrl}
                    onPasteFromClipboard={actions.pasteFromClipboard}
                    onPickTorrentFile={actions.pickTorrentFile}
                  />
                ) : (
                  <NewTaskDetailsContent
                    detailsTab={state.detailsTab}
                    url={state.url}
                    filename={state.filename}
                    savePath={state.savePath}
                    categoryId={state.categoryId}
                    categories={data.categories}
                    selectedCategory={data.selectedCategory}
                    matchedTag={data.matchedTag}
                    ruleLabel={data.ruleLabel}
                    totalSize={state.totalSize}
                    metadataLoading={state.metadataLoading}
                    loading={state.loading}
                    advancedDraft={state.advancedDraft}
                    defaultThreadCount={data.defaultThreadCount}
                    globalUserAgent={data.globalUserAgent}
                    isTorrent={state.isTorrent}
                    torrentFiles={state.torrentFiles}
                    selectedFiles={state.selectedFiles}
                    sequential={state.sequential}
                    infoHash={state.infoHash}
                    isPrivate={state.isPrivate}
                    freeSpaceText={state.freeSpaceText}
                    isDiskSpaceWarning={state.isDiskSpaceWarning}
                    formConflict={state.formConflict}
                    onDetailsTabChange={actions.setDetailsTab}
                    onUrlChange={actions.setUrl}
                    onFilenameChange={actions.setFilename}
                    onSavePathChange={actions.setSavePath}
                    onCategoryChange={actions.handleCategoryChange}
                    onAdvancedDraftChange={actions.updateAdvancedDraft}
                    onPasteFromClipboard={actions.pasteFromClipboard}
                    onPickSaveDirectory={actions.pickSaveDirectory}
                    onSelectedFilesChange={actions.setSelectedFiles}
                    onSequentialChange={actions.setSequential}
                    onRetryMetadata={actions.retryMetadataProbe}
                    savePathHistory={state.savePathHistory}
                  />
                )}
              </DialogBody>
            </ScrollArea>

            <DialogFooter className="shrink-0 justify-between px-5 sm:justify-between [&_[data-slot=button]]:w-auto sm:[&_[data-slot=button]]:w-auto">
              {state.step === "link" ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={actions.closeModal}
                    disabled={state.loading}
                  >
                    {UI_TEXT.newTask.cancel}
                  </Button>
                  <Button type="submit" disabled={state.loading || !state.url.trim()}>
                    下一步
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="submit"
                    disabled={state.loading}
                    loading={state.loading}
                    className="min-w-28 shadow-button-glow"
                  >
                    下载
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={actions.closeModal}
                    disabled={state.loading}
                    className="min-w-28"
                  >
                    {UI_TEXT.newTask.cancel}
                  </Button>
                </>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <NewTaskConflictDialog
        conflictCheck={state.conflictCheck}
        onRenameManually={actions.handleRenameManually}
        onUseSuggestedFilename={actions.handleUseSuggestedFilename}
        onOverwriteExistingFile={actions.handleOverwriteExistingFile}
      />
    </>
  )
}
