import type { Category, Tag } from "@/core/store/useDownloadStore"
import type { TorrentFileInspection } from "@/core/bridge/tauri-commands"
import { NewTaskAdvancedForm } from "./NewTaskAdvancedForm"
import { NewTaskBasicForm } from "./NewTaskBasicForm"
import { NewTaskBtForm } from "./NewTaskBtForm"
import { NewTaskSegmentedControl } from "./NewTaskSegmentedControl"
import type { NewTaskAdvancedDraft, NewTaskDetailsTab } from "./types"

interface NewTaskDetailsContentProps {
  detailsTab: NewTaskDetailsTab
  url: string
  filename: string
  savePath: string
  categoryId: number | null
  categories: Category[]
  selectedCategory: Category | null
  matchedTag: Tag | null
  ruleLabel: string
  totalSize: number | null
  metadataLoading: boolean
  loading: boolean
  advancedDraft: NewTaskAdvancedDraft
  defaultThreadCount: number
  globalUserAgent: string
  isTorrent: boolean
  torrentFiles: TorrentFileInspection[] | null
  selectedFiles: number[]
  sequential: boolean
  infoHash: string | null
  isPrivate: boolean | null
  onDetailsTabChange: (value: NewTaskDetailsTab) => void
  onUrlChange: (value: string) => void
  onFilenameChange: (value: string) => void
  onSavePathChange: (value: string) => void
  onCategoryChange: (value: number | null) => void
  onAdvancedDraftChange: (patch: Partial<NewTaskAdvancedDraft>) => void
  onPasteFromClipboard: () => void
  onPickSaveDirectory: () => void
  onSelectedFilesChange: (selected: number[]) => void
  onSequentialChange: (value: boolean) => void
}

export function NewTaskDetailsContent({
  detailsTab,
  url,
  filename,
  savePath,
  categoryId,
  categories,
  selectedCategory,
  matchedTag,
  ruleLabel,
  totalSize,
  metadataLoading,
  loading,
  advancedDraft,
  defaultThreadCount,
  globalUserAgent,
  isTorrent,
  torrentFiles,
  selectedFiles,
  sequential,
  infoHash,
  isPrivate,
  onDetailsTabChange,
  onUrlChange,
  onFilenameChange,
  onSavePathChange,
  onCategoryChange,
  onAdvancedDraftChange,
  onPasteFromClipboard,
  onPickSaveDirectory,
  onSelectedFilesChange,
  onSequentialChange,
}: NewTaskDetailsContentProps) {
  return (
    <div className="space-y-4">
      <NewTaskSegmentedControl value={detailsTab} onValueChange={onDetailsTabChange} />

      {detailsTab === "basic" ? (
        isTorrent ? (
          <NewTaskBtForm
            url={url}
            filename={filename}
            savePath={savePath}
            totalSize={totalSize}
            files={torrentFiles}
            loading={loading}
            selectedFiles={selectedFiles}
            onSelectedFilesChange={onSelectedFilesChange}
            sequential={sequential}
            onSequentialChange={onSequentialChange}
            onPickSaveDirectory={onPickSaveDirectory}
            categoryId={categoryId}
            categories={categories}
            onCategoryChange={onCategoryChange}
            onSavePathChange={onSavePathChange}
          />
        ) : (
          <NewTaskBasicForm
            url={url}
            filename={filename}
            savePath={savePath}
            categoryId={categoryId}
            categories={categories}
            selectedCategory={selectedCategory}
            matchedTag={matchedTag}
            ruleLabel={ruleLabel}
            totalSize={totalSize}
            metadataLoading={metadataLoading}
            loading={loading}
            onUrlChange={onUrlChange}
            onFilenameChange={onFilenameChange}
            onSavePathChange={onSavePathChange}
            onCategoryChange={onCategoryChange}
            onPasteFromClipboard={onPasteFromClipboard}
            onPickSaveDirectory={onPickSaveDirectory}
          />
        )
      ) : (
        <NewTaskAdvancedForm
          draft={advancedDraft}
          defaultThreadCount={defaultThreadCount}
          globalUserAgent={globalUserAgent}
          loading={loading}
          onDraftChange={onAdvancedDraftChange}
          isTorrent={isTorrent}
          infoHash={infoHash}
          isPrivate={isPrivate}
        />
      )}
    </div>
  )
}
