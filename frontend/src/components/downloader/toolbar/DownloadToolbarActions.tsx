import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "motion/react"
import {
  CloudDownload,
  Link,
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
        className="relative flex h-full self-stretch items-stretch"
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
            "cursor-pointer transition-colors duration-200 z-30",
            isExpanded && "text-primary"
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
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="absolute left-full inset-y-0 z-40 flex items-center gap-3 bg-toolbar px-4 border-l border-border/40 overflow-hidden"
              style={{ whiteSpace: "nowrap" }}
            >
              {/* Custom integrated input box */}
              <div
                className={cn(
                  "group flex items-center overflow-hidden rounded-md border border-border/60 bg-background/80 text-foreground transition focus-within:ring-2 focus-within:border-primary/50 focus-within:ring-primary/20",
                  "h-8.5 w-[360px] shrink-0"
                )}
              >
                {/* Leading link icon */}
                <div className="grid w-8 shrink-0 place-items-center border-r border-border/50 text-muted-foreground transition-colors group-focus-within:text-primary [&_svg]:size-3.5">
                  <Link className="size-3.5" />
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
                  className="min-w-0 flex-1 bg-transparent px-2.5 text-xs outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed font-mono"
                  autoFocus
                />

                {/* Paste Clipboard button with Tooltip */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="从剪贴板粘贴"
                      onClick={handlePaste}
                      className="grid size-8 shrink-0 place-items-center border-l border-border/50 bg-muted/20 text-muted-foreground transition-colors hover:text-primary cursor-pointer [&_svg]:size-3.5"
                    >
                      <Clipboard className="size-3.5" />
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
                      className="grid size-8 shrink-0 place-items-center border-l border-border/50 bg-muted/20 text-muted-foreground transition-colors hover:text-primary cursor-pointer [&_svg]:size-3.5"
                    >
                      <Upload className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">选择种子文件</TooltipContent>
                </Tooltip>
              </div>

              {/* Next step button */}
              <Button
                type="button"
                size="sm"
                className="h-8.5 px-3 flex items-center justify-center gap-1.5 cursor-pointer shrink-0 rounded-md text-xs font-semibold"
                onClick={handleSubmit}
                disabled={!url.trim()}
              >
                <span>下一步</span>
                <ArrowRight className="size-3.5" />
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
