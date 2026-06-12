import type { Category, Tag } from "@/core/store/useDownloadStore"
import type { TorrentFileInspection, FileConflictCheck } from "@/core/bridge/tauri-commands"
import { NewTaskAdvancedForm } from "./NewTaskAdvancedForm"
import { NewTaskBasicForm } from "./NewTaskBasicForm"
import { NewTaskBtForm } from "./NewTaskBtForm"
import { NewTaskSegmentedControl } from "./NewTaskSegmentedControl"
import type { NewTaskAdvancedDraft, NewTaskDetailsTab } from "./types"
import { AnimatePresence, motion } from "motion/react"

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
  freeSpaceText?: string
  isDiskSpaceWarning?: boolean
  formConflict?: FileConflictCheck | null
  savePathHistory?: string[]
  overwrite: boolean
  onOverwriteChange: (value: boolean) => void
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
  onRetryMetadata?: () => void
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
  freeSpaceText,
  isDiskSpaceWarning,
  formConflict,
  savePathHistory,
  overwrite,
  onOverwriteChange,
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
  onRetryMetadata,
}: NewTaskDetailsContentProps) {
  return (
    <div className="space-y-4">
      <NewTaskSegmentedControl value={detailsTab} onValueChange={onDetailsTabChange} />

      <div className="relative">
        <AnimatePresence mode="popLayout">
          {detailsTab === "basic" ? (
            isTorrent ? (
              <motion.div
                key="torrent-form"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="w-full"
              >
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
                  freeSpaceText={freeSpaceText}
                  isDiskSpaceWarning={isDiskSpaceWarning}
                  formConflict={formConflict}
                  onFilenameChange={onFilenameChange}
                  savePathHistory={savePathHistory}
                  overwrite={overwrite}
                  onOverwriteChange={onOverwriteChange}
                />
              </motion.div>
            ) : (
              <motion.div
                key="basic-form"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="w-full"
              >
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
                  onRetryMetadata={onRetryMetadata}
                  freeSpaceText={freeSpaceText}
                  isDiskSpaceWarning={isDiskSpaceWarning}
                  formConflict={formConflict}
                  savePathHistory={savePathHistory}
                  overwrite={overwrite}
                  onOverwriteChange={onOverwriteChange}
                />
              </motion.div>
            )
          ) : (
            <motion.div
              key="advanced-form"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="w-full"
            >
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

