import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "motion/react"
import {
  CloudDownload,
  Link,
  ListEnd,
  ListPlus,
  ListStart,
  Pause,
  Play,
  Square,
  Trash2,
  Clipboard,
  Upload,
  ArrowRight,
} from "lucide-react"

import {
  ToolbarButton,
  ToolbarGroup,
  ToolbarPrimaryButton,
  ToolbarSeparator,
} from "@/components/ui/toolbar"
import { UI_TEXT } from "@/core/locale"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { readClipboardText, pickTorrentFile } from "@/core/bridge/tauri-commands"
import { useToastStore } from "@/core/store/useToastStore"
import { cn } from "@/lib/utils"

interface DownloadToolbarActionsProps {
  selectedTaskCount: number
  selectedPauseCount: number
  selectedResumeCount: number
  onCreateTask: (initialUrl?: string) => void
  onPauseSelected?: () => void
  onResumeSelected?: () => void
  onDeleteSelected?: () => void
}

const slideVariants = {
  hidden: {
    width: 0,
    opacity: 0,
  },
  visible: {
    width: "auto",
    opacity: 1,
  },
}

export function DownloadToolbarActions({
  selectedTaskCount,
  selectedPauseCount,
  selectedResumeCount,
  onCreateTask,
  onPauseSelected,
  onResumeSelected,
  onDeleteSelected,
}: DownloadToolbarActionsProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [url, setUrl] = useState("")
  const pushToast = useToastStore((state) => state.pushToast)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isExpanded) return

    const handlePointerDown = (e: PointerEvent | MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsExpanded(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
    }
  }, [isExpanded])

  const canDeleteSelected = selectedTaskCount > 0 && Boolean(onDeleteSelected)
  const canPauseSelected = selectedPauseCount > 0 && Boolean(onPauseSelected)
  const canResumeSelected = selectedResumeCount > 0 && Boolean(onResumeSelected)

  const handlePaste = async () => {
    try {
      const text = await readClipboardText()
      if (text.trim()) {
        setUrl(text.trim())
      }
    } catch (err) {
      console.error("Failed to read clipboard:", err)
      pushToast({
        title: "读取剪贴板失败",
        description: String(err),
        variant: "warning",
      })
    }
  }

  const handlePickTorrent = async () => {
    try {
      const file = await pickTorrentFile()
      if (file) {
        setIsExpanded(false)
        setUrl("")
        onCreateTask(file)
      }
    } catch (err) {
      console.error("Failed to pick torrent file:", err)
      pushToast({
        title: "选择种子文件失败",
        description: String(err),
        variant: "warning",
      })
    }
  }

  const handleSubmit = () => {
    const trimmed = url.trim()
    if (trimmed) {
      setIsExpanded(false)
      setUrl("")
      onCreateTask(trimmed)
    }
  }

  return (
    <>
      <div
        ref={containerRef}
        className="relative flex items-stretch"
        onBlur={(e) => {
          if (
            isExpanded &&
            containerRef.current &&
            !containerRef.current.contains(e.relatedTarget as Node)
          ) {
            setIsExpanded(false)
          }
        }}
      >
        <ToolbarPrimaryButton
          onClick={() => setIsExpanded((prev) => !prev)}
          icon={<Link />}
          actionIcon={<CloudDownload />}
          aria-label={UI_TEXT.dashboard.newDownload}
          className={cn(
            "cursor-pointer transition-all duration-200 z-30",
            isExpanded && "bg-muted/80 ring-1 ring-primary/30"
          )}
        >
          {UI_TEXT.dashboard.newDownload}
        </ToolbarPrimaryButton>

        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={slideVariants}
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
              className="absolute left-full top-0 bottom-0 z-20 flex items-center gap-3 bg-card pl-3 pr-5 overflow-hidden border-l border-r border-border/50 rounded-r-lg shadow-lg"
              style={{ whiteSpace: "nowrap" }}
            >
              {/* Custom integrated input box */}
              <div
                className={cn(
                  "group flex items-stretch overflow-hidden rounded-lg border bg-background/90 text-foreground shadow-surface-inset transition focus-within:ring-2 focus-within:border-ring focus-within:ring-ring/30",
                  "h-10 border-input w-[380px] shrink-0"
                )}
              >
                {/* Leading link icon */}
                <div className="grid w-10 shrink-0 place-items-center border-r border-border/70 text-muted-foreground transition-colors group-focus-within:text-primary [&_svg]:size-4">
                  <Link className="size-4" />
                </div>

                {/* Input control */}
                <input
                  type="text"
                  placeholder="输入下载链接 (URL) 或磁力链接..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSubmit()
                    } else if (e.key === "Escape") {
                      setIsExpanded(false)
                    }
                  }}
                  className="min-w-0 flex-1 bg-transparent px-3 text-xs outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed font-mono"
                  autoFocus
                />

                {/* Paste Clipboard button with Tooltip */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="从剪贴板粘贴"
                      onClick={handlePaste}
                      className="grid w-10 shrink-0 place-items-center border-l border-border/70 bg-muted/35 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 cursor-pointer [&_svg]:size-4"
                    >
                      <Clipboard className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">粘贴链接</TooltipContent>
                </Tooltip>

                {/* Upload Torrent file button with Tooltip */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="上传种子"
                      onClick={handlePickTorrent}
                      className="grid w-10 shrink-0 place-items-center border-l border-border/70 bg-muted/35 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 cursor-pointer [&_svg]:size-4"
                    >
                      <Upload className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">选择种子文件</TooltipContent>
                </Tooltip>
              </div>

              {/* Next step button */}
              <Button
                type="button"
                size="sm"
                className="h-10 px-4 flex items-center justify-center gap-1.5 cursor-pointer shadow-button-glow shrink-0 rounded-lg text-xs font-semibold"
                onClick={handleSubmit}
                disabled={!url.trim()}
              >
                <ArrowRight className="size-4" />
                <span>下一步</span>
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ToolbarSeparator />

      <ToolbarGroup>
        <ToolbarButton
          icon={<Play />}
          onClick={onResumeSelected}
          disabled={!canResumeSelected}
        >
          {UI_TEXT.dashboard.resume}
        </ToolbarButton>
        <ToolbarButton
          icon={<Pause />}
          onClick={onPauseSelected}
          disabled={!canPauseSelected}
        >
          {UI_TEXT.dashboard.pause}
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <ToolbarButton icon={<ListStart />} disabled>
          {UI_TEXT.dashboard.startQueue}
        </ToolbarButton>
        <ToolbarButton icon={<ListEnd />} disabled>
          {UI_TEXT.dashboard.stopQueue}
        </ToolbarButton>
        <ToolbarButton icon={<ListPlus />} disabled>
          {UI_TEXT.dashboard.queue}
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <ToolbarButton icon={<Square />} disabled>
          {UI_TEXT.dashboard.stopAll}
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <ToolbarButton
          icon={<Trash2 />}
          onClick={onDeleteSelected}
          disabled={!canDeleteSelected}
          className="text-destructive hover:text-destructive focus-visible:ring-destructive/30 disabled:text-muted-foreground [&_[data-slot=toolbar-button-icon]]:text-current [&_[data-slot=toolbar-button-icon]]:group-hover/toolbar-button:text-current w-28 justify-center"
        >
          {selectedTaskCount > 0
            ? `${UI_TEXT.dashboard.delete} (${selectedTaskCount})`
            : UI_TEXT.dashboard.delete}
        </ToolbarButton>
      </ToolbarGroup>
    </>
  )
}
