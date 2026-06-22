import type { Category, Tag } from "@/core/store/useDownloadStore"
import type { TorrentFileInspection, FileConflictCheck } from "@/core/bridge/tauri-commands"
import { NewTaskAdvancedForm } from "./NewTaskAdvancedForm"
import { NewTaskBasicForm, RuleIconPreview, MetadataProbeCard } from "./NewTaskBasicForm"
import { NewTaskBtForm } from "./NewTaskBtForm"
import { SegmentedControl } from "@/components/common"
import type { NewTaskAdvancedDraft, NewTaskDetailsTab } from "./types"
import { UI_TEXT } from "@/core/locale"
import { AnimatePresence, motion } from "motion/react"
import { Checkbox } from "@/components/ui/checkbox"
import { Grid2X2Plus, LoaderCircle } from "lucide-react"
import { formatBytes } from "./data"

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
  if (isTorrent) {
    return (
      <div className="space-y-4">
        <div className="flex h-10 w-full items-center justify-center">
          <SegmentedControl
            value={detailsTab}
            options={[
              { value: "basic", label: UI_TEXT.newTask.tabs.basic },
              { value: "advanced", label: UI_TEXT.newTask.tabs.advanced },
            ]}
            onValueChange={onDetailsTabChange}
            className="w-60 h-10 p-1"
          />
        </div>

        <div className="relative">
          <AnimatePresence mode="popLayout">
            {detailsTab === "basic" ? (
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

  return (
    <div className="grid items-start gap-5 sm:grid-cols-[minmax(0,1fr)_13.5rem]">
      {/* Left Column: SegmentedControl and Tab Content */}
      <div className="space-y-4 min-w-0">
        <div className="flex h-10 w-full items-center justify-start">
          <SegmentedControl
            value={detailsTab}
            options={[
              { value: "basic", label: UI_TEXT.newTask.tabs.basic },
              { value: "advanced", label: UI_TEXT.newTask.tabs.advanced },
            ]}
            onValueChange={onDetailsTabChange}
            className="w-60 h-10 p-1"
          />
        </div>

        <div className="relative">
          <AnimatePresence mode="popLayout">
            {detailsTab === "basic" ? (
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
                  loading={loading}
                  onUrlChange={onUrlChange}
                  onFilenameChange={onFilenameChange}
                  onSavePathChange={onSavePathChange}
                  onCategoryChange={onCategoryChange}
                  onPasteFromClipboard={onPasteFromClipboard}
                  onPickSaveDirectory={onPickSaveDirectory}
                  freeSpaceText={freeSpaceText}
                  isDiskSpaceWarning={isDiskSpaceWarning}
                  savePathHistory={savePathHistory}
                />
              </motion.div>
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

      {/* Right Column: File Info Card and Same-Name Warning */}
      <div className="space-y-3 w-full">
        <aside className="flex h-fit min-w-0 flex-col gap-3 rounded-lg bg-background/35 px-3.5 py-3 text-sm text-muted-foreground">
          <div className="mx-auto grid size-12 place-items-center rounded-lg bg-muted/70">
            <RuleIconPreview category={selectedCategory} tag={matchedTag} />
          </div>
          <div className="max-w-full truncate text-center text-sm font-medium text-foreground">
            {ruleLabel}
          </div>
          <div className="h-px w-full bg-border/60" />
          <div className="flex items-center justify-between gap-3 rounded-lg bg-secondary/20 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <Grid2X2Plus className="size-4" />
              <span className="text-xs">{UI_TEXT.newTask.fileSize}</span>
            </div>
            <span className="flex shrink-0 items-center gap-1 font-mono text-sm text-foreground">
              {metadataLoading ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
              {metadataLoading ? UI_TEXT.newTask.identifying : formatBytes(totalSize)}
            </span>
          </div>
          <MetadataProbeCard
            loading={metadataLoading}
            hasMetadata={Boolean(totalSize)}
            onRetry={onRetryMetadata}
            className="w-full text-left"
          />
        </aside>

        {formConflict && formConflict.exists && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive flex flex-col gap-2">
            <div className="flex items-center gap-1.5 font-semibold">
              <span>{UI_TEXT.newTask.conflict.warning}</span>
            </div>
            <div className="font-mono break-all text-muted-foreground/80">
              {UI_TEXT.newTask.conflict.suggestedName}<span className="text-foreground font-semibold">{formConflict.suggested_filename}</span>
            </div>
            <div className="flex flex-col gap-2 mt-1">
              <button
                type="button"
                className="w-full py-1.5 rounded bg-destructive/10 hover:bg-destructive/20 text-destructive font-semibold transition-colors text-center"
                onClick={() => onFilenameChange(formConflict.suggested_filename)}
              >
                {UI_TEXT.newTask.conflict.useSuggested}
              </button>
              <label className="flex items-center gap-1.5 text-xs text-destructive cursor-pointer select-none font-semibold">
                <Checkbox
                  checked={overwrite}
                  onCheckedChange={(checked) => onOverwriteChange(checked === true)}
                />
                <span>{UI_TEXT.newTask.conflict.overwriteCheckbox}</span>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

