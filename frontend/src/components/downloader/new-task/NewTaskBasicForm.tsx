import { motion } from "motion/react"
import { Clipboard, FolderOpen, Grid2X2Plus, Link2, LoaderCircle, Radar } from "lucide-react"

import { CategoryDropdown } from "@/components/common/CategoryDropdown"
import { IconPreview } from "@/components/ui/icon-picker"
import { ActionInput, Input } from "@/components/ui/input"
import { UI_TEXT } from "@/core/locale"
import type { Category, Tag } from "@/core/store/useDownloadStore"
import { cn } from "@/lib/utils"
import { formatBytes } from "./data"

interface NewTaskBasicFormProps {
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
  onUrlChange: (value: string) => void
  onFilenameChange: (value: string) => void
  onSavePathChange: (value: string) => void
  onCategoryChange: (value: number | null) => void
  onPasteFromClipboard: () => void
  onPickSaveDirectory: () => void
}

function RuleIconPreview({
  category,
  tag,
}: {
  category?: Category | null
  tag?: Tag | null
}) {
  if (tag) {
    return <IconPreview value={tag.icon} color={tag.color} className="size-7" />
  }

  if (category) {
    return <IconPreview value={category.icon} color={category.color} className="size-7" />
  }

  return <FolderOpen className="size-7 text-muted-foreground" />
}

function MetadataProbeCard({
  loading,
  hasMetadata,
  className,
}: {
  loading: boolean
  hasMetadata: boolean
  className?: string
}) {
  return (
    <motion.div
      className={cn("relative overflow-hidden rounded-lg border border-border bg-secondary/25 px-3 py-2.5 text-sm", className)}
      initial={false}
      animate={{
        borderColor: loading ? "color-mix(in oklab, var(--primary) 42%, var(--border))" : "var(--border)",
      }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {loading ? (
        <motion.div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-primary/10 to-transparent"
          animate={{ x: ["-100%", "240%"] }}
          transition={{ duration: 1.35, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : null}
      <div className="relative flex gap-2.5">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Radar className="size-4" />}
        </span>
        <div className="min-w-0">
          <div className="text-xs font-semibold leading-4 text-foreground">
            {loading
              ? UI_TEXT.newTask.metadataProbeTitle
              : hasMetadata
                ? UI_TEXT.newTask.metadataProbeDone
                : UI_TEXT.newTask.metadataProbeFallbackTitle}
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-muted-foreground">
            {loading
              ? UI_TEXT.newTask.metadataProbeDesc
              : hasMetadata
                ? UI_TEXT.newTask.metadataProbeDone
                : UI_TEXT.newTask.metadataProbeFallback}
          </p>
        </div>
      </div>
    </motion.div>
  )
}

export function NewTaskBasicForm({
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
  onUrlChange,
  onFilenameChange,
  onSavePathChange,
  onCategoryChange,
  onPasteFromClipboard,
  onPickSaveDirectory,
}: NewTaskBasicFormProps) {
  return (
    <motion.div
      className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_13.5rem]"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
    >
      <div className="space-y-3">
        <ActionInput
          type="text"
          value={url}
          onChange={(event) => onUrlChange(event.target.value)}
          disabled={loading}
          leadingIcon={<Link2 />}
          actionIcon={<Clipboard />}
          actionLabel={UI_TEXT.newTask.pasteFromClipboard}
          onAction={onPasteFromClipboard}
          inputClassName="font-mono"
          required
        />

        <div className="grid h-auto md:h-12 gap-3 md:grid-cols-[auto_1fr] md:items-center">
          <label className="flex h-12 items-center text-sm font-medium text-foreground">
            分类到
          </label>
          <CategoryDropdown
            categories={categories}
            value={categoryId}
            onValueChange={onCategoryChange}
            disabled={loading}
            noCategoryLabel="不分类"
            triggerClassName="h-12 bg-background/70 px-4 text-base"
          />
        </div>

        <ActionInput
          type="text"
          value={savePath}
          onChange={(event) => onSavePathChange(event.target.value)}
          disabled={loading}
          leadingIcon={<FolderOpen />}
          actionIcon={<FolderOpen />}
          actionLabel="选择下载目录"
          onAction={onPickSaveDirectory}
          inputClassName="font-mono"
        />

        <Input
          value={filename}
          onChange={(event) => onFilenameChange(event.target.value)}
          disabled={loading}
          placeholder="文件名"
          className="h-12 rounded-lg bg-background/70 px-4 text-base"
        />
      </div>

      <aside className="flex h-[228px] min-w-0 flex-col gap-3 rounded-lg bg-background/35 px-3.5 py-3 text-sm text-muted-foreground">
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
            <span className="text-xs">文件大小</span>
          </div>
          <span className="flex shrink-0 items-center gap-1 font-mono text-sm text-foreground">
            {metadataLoading ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
            {metadataLoading ? "识别中" : formatBytes(totalSize)}
          </span>
        </div>
        <MetadataProbeCard
          loading={metadataLoading}
          hasMetadata={Boolean(totalSize)}
          className="w-full text-left"
        />
      </aside>
    </motion.div>
  )
}
