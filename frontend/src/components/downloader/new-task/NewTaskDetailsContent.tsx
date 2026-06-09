import type { Category, Tag } from "@/core/store/useDownloadStore"
import { NewTaskAdvancedForm } from "./NewTaskAdvancedForm"
import { NewTaskBasicForm } from "./NewTaskBasicForm"
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
  onDetailsTabChange: (value: NewTaskDetailsTab) => void
  onUrlChange: (value: string) => void
  onFilenameChange: (value: string) => void
  onSavePathChange: (value: string) => void
  onCategoryChange: (value: number | null) => void
  onAdvancedDraftChange: (patch: Partial<NewTaskAdvancedDraft>) => void
  onPasteFromClipboard: () => void
  onPickSaveDirectory: () => void
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
  onDetailsTabChange,
  onUrlChange,
  onFilenameChange,
  onSavePathChange,
  onCategoryChange,
  onAdvancedDraftChange,
  onPasteFromClipboard,
  onPickSaveDirectory,
}: NewTaskDetailsContentProps) {
  return (
    <div className="space-y-4">
      <NewTaskSegmentedControl value={detailsTab} onValueChange={onDetailsTabChange} />

      {detailsTab === "basic" ? (
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
      ) : (
        <NewTaskAdvancedForm
          draft={advancedDraft}
          defaultThreadCount={defaultThreadCount}
          globalUserAgent={globalUserAgent}
          loading={loading}
          onDraftChange={onAdvancedDraftChange}
        />
      )}
    </div>
  )
}
