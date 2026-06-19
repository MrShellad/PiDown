import * as React from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  Archive,
  Binary,
  BookOpen,
  Bot,
  Box,
  Boxes,
  Brain,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudDownload,
  Code,
  Cpu,
  Database,
  Disc,
  Download,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileCog,
  FileImage,
  FileJson,
  FileLock,
  FileText,
  FileVideo,
  Film,
  Folder,
  FolderArchive,
  FolderCode,
  FolderDown,
  FolderOpen,
  Gamepad2,
  Globe,
  HardDrive,
  Heart,
  Image,
  Link,
  Music,
  Package,
  Palette,
  Settings,
  Shield,
  ShoppingCart,
  Sparkles,
  Star,
  Tags,
  Terminal,
  User,
  Wrench,
  Zap,
} from "lucide-react"
import { Popover as PopoverPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

const ICON_COLORS = [
  "#8c8c8c",
  "#3b82f6",
  "#4fb3c8",
  "#2dbb69",
  "#f59e0b",
  "#ef4444",
  "#ec5f8f",
  "#5b5ce2",
]

const ICON_ITEMS = [
  { id: "file", icon: File },
  { id: "file-text", icon: FileText },
  { id: "file-image", icon: FileImage },
  { id: "file-video", icon: FileVideo },
  { id: "file-audio", icon: FileAudio },
  { id: "file-archive", icon: FileArchive },
  { id: "file-code", icon: FileCode },
  { id: "file-json", icon: FileJson },
  { id: "file-settings", icon: FileCog },
  { id: "file-lock", icon: FileLock },
  { id: "folder", icon: Folder },
  { id: "folder-open", icon: FolderOpen },
  { id: "folder-archive", icon: FolderArchive },
  { id: "folder-code", icon: FolderCode },
  { id: "folder-download", icon: FolderDown },
  { id: "archive", icon: Archive },
  { id: "package", icon: Package },
  { id: "box", icon: Box },
  { id: "boxes", icon: Boxes },
  { id: "hard-drive", icon: HardDrive },
  { id: "database", icon: Database },
  { id: "cloud", icon: Cloud },
  { id: "cloud-download", icon: CloudDownload },
  { id: "download", icon: Download },
  { id: "link", icon: Link },
  { id: "globe", icon: Globe },
  { id: "image", icon: Image },
  { id: "film", icon: Film },
  { id: "music", icon: Music },
  { id: "book", icon: BookOpen },
  { id: "code", icon: Code },
  { id: "terminal", icon: Terminal },
  { id: "binary", icon: Binary },
  { id: "disc", icon: Disc },
  { id: "gamepad", icon: Gamepad2 },
  { id: "cpu", icon: Cpu },
  { id: "brain", icon: Brain },
  { id: "bot", icon: Bot },
  { id: "sparkles", icon: Sparkles },
  { id: "star", icon: Star },
  { id: "heart", icon: Heart },
  { id: "shield", icon: Shield },
  { id: "settings", icon: Settings },
  { id: "zap", icon: Zap },
  { id: "tags", icon: Tags },
  { id: "briefcase", icon: Briefcase },
  { id: "user", icon: User },
  { id: "shopping", icon: ShoppingCart },
  { id: "palette", icon: Palette },
  { id: "wrench", icon: Wrench },
]

const ICON_PICKER_PAGE_SIZE = 25
const ICON_GRID_SLOTS = Array.from({ length: ICON_PICKER_PAGE_SIZE }, (_, index) => index)

function IconPreview({ value, color, className }: { value?: string | null; color?: string | null; className?: string }) {
  const item = ICON_ITEMS.find((icon) => icon.id === value)

  if (item) {
    const Icon = item.icon
    return <Icon className={cn("size-5", className)} style={{ color: color ?? ICON_COLORS[0] }} />
  }

  return <Folder className={cn("size-5", className)} style={{ color: color ?? ICON_COLORS[0] }} />
}

function PickerItem({
  active,
  children,
  label,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      className={cn(
        "grid size-9 place-items-center justify-self-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
        active && "bg-muted text-foreground shadow-sm"
      )}
      whileHover={{ y: -3, scale: 1.08 }}
      whileTap={{ y: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 420, damping: 24 }}
      onClick={onClick}
    >
      {children}
    </motion.button>
  )
}

function IconPicker({
  value,
  color,
  onChange,
  className,
}: {
  value?: string | null
  color?: string | null
  onChange: (next: { icon: string; color: string }) => void
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [page, setPage] = React.useState(0)
  const selectedColor = color ?? ICON_COLORS[0]
  const selectedIcon = value?.startsWith("emoji:") ? "folder" : value ?? "folder"
  const itemCount = ICON_ITEMS.length
  const pageCount = Math.max(1, Math.ceil(itemCount / ICON_PICKER_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const pageStart = currentPage * ICON_PICKER_PAGE_SIZE
  const visibleIcons = ICON_ITEMS.slice(pageStart, pageStart + ICON_PICKER_PAGE_SIZE)
  const canGoPrev = currentPage > 0
  const canGoNext = currentPage < pageCount - 1

  const updateColor = (nextColor: string) => {
    onChange({ icon: selectedIcon, color: nextColor })
  }

  const selectIcon = (icon: string) => {
    onChange({ icon, color: selectedColor })
    setOpen(false)
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          data-slot="icon-picker-trigger"
          className={cn(
            "flex h-10 w-full items-center gap-3 rounded-lg border border-border bg-background/70 px-4 text-left text-sm leading-5 text-foreground outline-none transition hover:bg-muted/40 focus:border-primary focus:ring-2 focus:ring-primary/20",
            className
          )}
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted">
            <IconPreview value={selectedIcon} color={selectedColor} />
          </span>
          <span className="min-w-0 flex-1 truncate">选择图标</span>
          <span className="shrink-0 text-xs text-muted-foreground">Icon</span>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          data-slot="icon-picker"
          align="start"
          sideOffset={8}
          className="z-[200] w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-surface-strong outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <div className="px-4 pt-4 text-base font-semibold">
            <div className="inline-flex border-b-2 border-foreground pb-2 text-foreground">
              Icons
            </div>
          </div>

          <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
            {ICON_COLORS.map((item) => (
              <button
                key={item}
                type="button"
                aria-label={`Select ${item}`}
                className={cn(
                  "size-7 rounded-full ring-offset-2 ring-offset-popover transition",
                  selectedColor === item && "ring-2 ring-foreground/55"
                )}
                style={{ backgroundColor: item }}
                onClick={() => updateColor(item)}
              />
            ))}
          </div>

          <div className="grid grid-cols-[2rem_1fr_2rem] items-stretch">
            <button
              type="button"
              aria-label="上一页"
              disabled={!canGoPrev}
              className="flex items-center justify-center text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
              onClick={() => setPage((value) => Math.max(0, value - 1))}
            >
              <ChevronLeft className="size-5" />
            </button>
            <div className="flex justify-center py-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`icons-${currentPage}`}
                  className="grid w-fit grid-cols-5 grid-rows-5 place-items-center gap-1.5"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                >
                  {ICON_GRID_SLOTS.map((slot) => {
                    const item = visibleIcons[slot]
                    if (!item) return <span key={`empty-icon-${slot}`} className="size-9" aria-hidden="true" />

                    const Icon = item.icon
                    const active = selectedIcon === item.id
                    return (
                      <PickerItem
                        key={item.id}
                        active={active}
                        label={item.id}
                        onClick={() => selectIcon(item.id)}
                      >
                        <Icon className="size-4.5" style={{ color: active ? selectedColor : undefined }} />
                      </PickerItem>
                    )
                  })}
                </motion.div>
              </AnimatePresence>
            </div>
            <button
              type="button"
              aria-label="下一页"
              disabled={!canGoNext}
              className="flex items-center justify-center text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
              onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
          <div className="border-t border-border/60 px-6 py-3 text-center text-xs tabular-nums text-muted-foreground">
            {currentPage + 1} / {pageCount}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

export { IconPicker, IconPreview }
