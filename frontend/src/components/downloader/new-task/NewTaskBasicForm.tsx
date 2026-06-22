import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { motion } from "motion/react"
import { Clipboard, FolderOpen, Link2, LoaderCircle, Radar, HardDrive } from "lucide-react"

import { CategoryDropdown } from "@/components/common/CategoryDropdown"
import { IconPreview } from "@/components/ui/icon-picker"
import { ActionInput, Input, CompoundInput, CompoundInputButton } from "@/components/ui/input"
import { UI_TEXT } from "@/core/locale"
import type { Category, Tag } from "@/core/store/useDownloadStore"
import { cn } from "@/lib/utils"

interface NewTaskBasicFormProps {
  url: string
  filename: string
  savePath: string
  categoryId: number | null
  categories: Category[]
  loading: boolean
  onUrlChange: (value: string) => void
  onFilenameChange: (value: string) => void
  onSavePathChange: (value: string) => void
  onCategoryChange: (value: number | null) => void
  onPasteFromClipboard: () => void
  onPickSaveDirectory: () => void
  freeSpaceText?: string
  isDiskSpaceWarning?: boolean
  savePathHistory?: string[]
}

export function RuleIconPreview({
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

export function MetadataProbeCard({
  loading,
  hasMetadata,
  onRetry,
  className,
}: {
  loading: boolean
  hasMetadata: boolean
  onRetry?: () => void
  className?: string
}) {
  if (!loading && hasMetadata) {
    return null
  }

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
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold leading-4 text-foreground">
              {loading
                ? UI_TEXT.newTask.metadataProbeTitle
                : hasMetadata
                  ? UI_TEXT.newTask.metadataProbeDone
                  : UI_TEXT.newTask.metadataProbeFallbackTitle}
            </div>
            {!loading && !hasMetadata && onRetry && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onRetry()
                }}
                className="text-xs text-primary hover:underline font-medium focus:outline-none"
              >
                {UI_TEXT.newTask.retry || "重试"}
              </button>
            )}
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
  loading,
  onUrlChange,
  onFilenameChange,
  onSavePathChange,
  onCategoryChange,
  onPasteFromClipboard,
  onPickSaveDirectory,
  freeSpaceText,
  isDiskSpaceWarning,
  savePathHistory = [],
}: NewTaskBasicFormProps) {
  const [showHistory, setShowHistory] = useState(false)
  const savePathContainerRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 })

  const updateCoords = () => {
    if (savePathContainerRef.current) {
      const rect = savePathContainerRef.current.getBoundingClientRect()
      setCoords({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      })
    }
  }

  useEffect(() => {
    if (showHistory) {
      updateCoords()
      window.addEventListener("resize", updateCoords)
      const scrollEl = document.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollEl) {
        scrollEl.addEventListener("scroll", updateCoords)
      }
      return () => {
        window.removeEventListener("resize", updateCoords)
        if (scrollEl) {
          scrollEl.removeEventListener("scroll", updateCoords)
        }
      }
    }
  }, [showHistory])

  return (
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

      {/* Category Dropdown Selection */}
      <div className="space-y-2">
        <div className="flex items-center justify-between h-5">
          <label className="block text-xs font-semibold text-foreground/80">{UI_TEXT.newTask.categorizeTo}</label>
        </div>
        <CategoryDropdown
          categories={categories}
          value={categoryId}
          onValueChange={onCategoryChange}
          disabled={loading}
          noCategoryLabel={UI_TEXT.newTask.noCategory}
          triggerClassName="h-12 bg-background/70 px-4 text-base w-full"
        />
      </div>

      {/* Download Directory Selector */}
      <div className="space-y-2">
        <div className="flex items-center justify-between h-5">
          <label className="block text-xs font-semibold text-foreground/80">{UI_TEXT.newTask.downloadTo}</label>
          <span className={cn(
            "text-xs font-mono transition-colors duration-200",
            isDiskSpaceWarning
              ? "text-destructive font-semibold animate-pulse"
              : "text-muted-foreground/60"
          )}>
            {UI_TEXT.newTask.freeSpace.replace("{{size}}", freeSpaceText || "")} {isDiskSpaceWarning && UI_TEXT.newTask.diskSpaceWarning}
          </span>
        </div>
        <div ref={savePathContainerRef} className="relative">
          <CompoundInput
            type="text"
            size="lg"
            value={savePath}
            onChange={(event) => onSavePathChange(event.target.value)}
            onFocus={() => {
              updateCoords()
              setShowHistory(true)
            }}
            onClick={() => {
              updateCoords()
              setShowHistory(true)
            }}
            onBlur={() => setTimeout(() => setShowHistory(false), 200)}
            disabled={loading}
            inputClassName="font-mono"
            prefixActions={
              <div
                className="grid w-12 h-full place-items-center border-r border-border/70 text-muted-foreground transition-colors group-focus-within:text-primary [&_svg]:size-5"
                aria-hidden="true"
              >
                <HardDrive />
              </div>
            }
            suffixActions={
              <CompoundInputButton
                type="button"
                size="lg"
                divider="left"
                onClick={onPickSaveDirectory}
                disabled={loading}
                aria-label={UI_TEXT.newTask.bt.selectSaveDir}
              >
                <FolderOpen className="mr-1.5" />
                {UI_TEXT.settings.browse}
              </CompoundInputButton>
            }
          />
          {showHistory && savePathHistory && savePathHistory.length > 0 && createPortal(
            <div
              onMouseDown={(e) => {
                // Prevent input blur when clicking scrollbar or container background
                e.preventDefault()
              }}
              style={{
                position: "absolute",
                top: `${coords.top}px`,
                left: `${coords.left}px`,
                width: `${coords.width}px`,
              }}
              className="window-frame z-[9999] mt-1 max-h-36 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md font-sans"
            >
              {savePathHistory.map((path, idx) => (
                <button
                  key={idx}
                  type="button"
                  onMouseDown={(e) => {
                    // Select item and close dropdown immediately on mousedown to prevent focus trap conflicts
                    e.preventDefault()
                    onSavePathChange(path)
                    setShowHistory(false)
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground font-mono transition-colors"
                >
                  <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{path}</span>
                </button>
              ))}
            </div>,
            document.body
          )}
        </div>
      </div>

      {/* Filename Input */}
      <div className="space-y-2">
        <div className="flex items-center justify-between h-5">
          <label className="block text-xs font-semibold text-foreground/80">{UI_TEXT.newTask.filename}</label>
        </div>
        <Input
          value={filename}
          onChange={(event) => onFilenameChange(event.target.value)}
          disabled={loading}
          placeholder={UI_TEXT.newTask.filename}
          className="h-12 rounded-lg bg-background/70 px-4 text-base"
        />
      </div>
    </div>
  )
}
