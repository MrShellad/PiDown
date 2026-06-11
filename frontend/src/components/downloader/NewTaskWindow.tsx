import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/core/locale";
import { NewTaskConflictDialog } from "./new-task/NewTaskConflictDialog";
import { NewTaskDetailsContent } from "./new-task/NewTaskDetailsContent";
import { NewTaskLinkStep } from "./new-task/NewTaskLinkStep";
import { useNewTaskModalState } from "./new-task/useNewTaskModalState";
import type { ExternalDownloadRequest } from "@/core/bridge/external-download";
import WindowFrame from "../layout/WindowFrame";

function parseQueryParams(): ExternalDownloadRequest | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const url = params.get("url");
    if (!url) return null;

    const cookiesStr = params.get("cookies") || "";
    const cookies = cookiesStr ? cookiesStr.split(";") : [];

    const totalSizeStr = params.get("totalSize");
    const totalSize = totalSizeStr ? parseInt(totalSizeStr, 10) : null;
    const finalTotalSize = totalSize === null || isNaN(totalSize) || totalSize <= 0 ? null : totalSize;

    return {
      url,
      filename: params.get("filename") || undefined,
      userAgent: params.get("userAgent") || undefined,
      referer: params.get("referer") || undefined,
      cookies,
      totalSize: finalTotalSize,
    };
  } catch (e) {
    console.error("Failed to parse query params:", e);
    return null;
  }
}

export default function NewTaskWindow() {
  const [initialRequest] = useState(() => parseQueryParams());

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      getCurrentWindow().close().catch(console.error);
    }
  };

  const { state, data, actions } = useNewTaskModalState({
    open: true,
    onOpenChange: handleOpenChange,
    initialRequest,
  });

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <WindowFrame
        title="新建下载任务"
        showMenu={false}
        showSettingsButton={false}
        onClose={() => getCurrentWindow().close().catch(console.error)}
      />
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6">
        <form onSubmit={actions.handleSubmit} className="flex flex-col h-full justify-between">
          <div className="flex-1 min-h-0">
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
              />
            )}
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border shrink-0">
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
                  className="min-w-28 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                  style={{ boxShadow: "var(--button-glow)" }}
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
          </div>
        </form>
      </div>

      <NewTaskConflictDialog
        conflictCheck={state.conflictCheck}
        onRenameManually={actions.handleRenameManually}
        onUseSuggestedFilename={actions.handleUseSuggestedFilename}
        onOverwriteExistingFile={actions.handleOverwriteExistingFile}
      />
    </div>
  );
}
