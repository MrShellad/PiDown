import { AnimatePresence, motion } from "motion/react"
import {
  CalendarClock,
  Check,
  Copy,
  FolderOpen,
  Hash,
  Link2,
  Network,
  Tags,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { IconPreview } from "@/components/ui/icon-picker"
import { UI_TEXT } from "@/core/locale"
import type { Category, Task } from "@/core/store/useDownloadStore"
import { useDownloadStore } from "@/core/store/useDownloadStore"
import { useToastStore } from "@/core/store/useToastStore"
import { cn } from "@/lib/utils"

const SHEET_TRANSITION = {
  type: "spring" as const,
  stiffness: 380,
  damping: 34,
  mass: 0.82,
}

interface TaskDetailsDrawerProps {
  open: boolean
  task?: Task | null
  category?: Category | null
  selectedTaskCount?: number
  onOpenChange: (open: boolean) => void
}

function formatCreatedAt(timestamp?: number) {
  if (!timestamp) return "--"

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp * 1000))
}

function statusText(status?: Task["status"]) {
  switch (status) {
    case "Completed":
      return UI_TEXT.taskCard.completed
    case "Failed":
      return UI_TEXT.taskCard.failed
    case "Paused":
      return UI_TEXT.taskCard.paused
    case "Pending":
      return UI_TEXT.taskCard.preparing
    case "Downloading":
      return UI_TEXT.taskCard.downloading
    case "Cancelled":
      return "已取消"
    default:
      return "--"
  }
}

function DetailItem({
  icon,
  label,
  children,
  className,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("min-w-0 rounded-lg border border-border bg-secondary/20 p-3", className)}>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <span className="grid size-5 place-items-center text-primary [&_svg]:size-4">
          {icon}
        </span>
        {label}
      </div>
      <div className="min-w-0 text-sm leading-6 text-foreground">{children}</div>
    </div>
  )
}

export default function TaskDetailsDrawer({
  open,
  task,
  category,
  selectedTaskCount = 0,
  onOpenChange,
}: TaskDetailsDrawerProps) {
  const isActive = task?.status === "Downloading" || task?.status === "Pending"
  const tags = task?.tags ?? []
  const openTaskFolder = useDownloadStore((state) => state.openTaskFolder)
  const pushToast = useToastStore((state) => state.pushToast)

  const copyUrl = async () => {
    if (!task?.url) return

    try {
      await navigator.clipboard.writeText(task.url)
      pushToast({
        title: "链接已复制",
        description: "下载链接已复制到剪贴板。",
        variant: "success",
      })
    } catch {
      window.prompt("复制下载链接", task.url)
      pushToast({
        title: "请手动复制链接",
        description: "当前环境无法直接写入剪贴板。",
        variant: "warning",
      })
    }
  }

  const openFolder = () => {
    if (!task) return
    void openTaskFolder(task.gid)
  }

  return (
    <AnimatePresence initial={false}>
      {open && task ? (
        <motion.aside
          id="task-details-sheet"
          className="fixed bottom-4 right-6 z-50 w-[min(62rem,calc(100vw-3rem))] max-h-[48vh] origin-bottom-right overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl shadow-popover/30 will-change-transform"
          initial={{ opacity: 0, x: 28, y: 36, scale: 0.985 }}
          animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
          exit={{ opacity: 0, x: 28, y: 36, scale: 0.985 }}
          transition={{
            x: SHEET_TRANSITION,
            y: SHEET_TRANSITION,
            scale: SHEET_TRANSITION,
            opacity: { duration: 0.16, ease: "easeOut" },
          }}
          role="dialog"
          aria-modal={false}
          aria-label="任务详情"
        >
          <div className="flex justify-center bg-popover-soft pt-2">
            <span className="mb-2 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden="true" />
          </div>

          <div className="flex items-start gap-4 border-b border-border/70 bg-popover-soft px-5 pb-4">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-background/60"
                  style={{ color: category?.color ?? "var(--muted-foreground)" }}
                >
                  <IconPreview value={category?.icon ?? "folder"} color={category?.color} className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-bold leading-6 text-foreground" title={task.name}>
                    {task.name}
                  </h2>
                  <p className="truncate font-mono text-xs leading-5 text-muted-foreground">
                    {task.gid}
                  </p>
                </div>
              </div>
              {selectedTaskCount > 1 ? (
                <span className="mt-2 inline-flex w-fit rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  已选 {selectedTaskCount} 项
                </span>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onOpenChange(false)}
              className="shrink-0"
            >
              <X />
              <span className="sr-only">关闭</span>
            </Button>
          </div>

          <div className="max-h-[calc(48vh-5.5rem)] overflow-y-auto p-5">
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 xl:grid-cols-[repeat(3,minmax(0,1fr))]">
              <DetailItem icon={<Check />} label="状态" className="col-span-2 xl:col-span-1 xl:min-w-72">
                <span className="inline-block min-w-16 font-semibold">{statusText(task.status)}</span>
                {isActive ? (
                  <span className="ml-2 inline-block min-w-32 text-muted-foreground tabular-nums">
                    {task.speed} · {task.progress.toFixed(1)}%
                  </span>
                ) : null}
              </DetailItem>

              <DetailItem icon={<CalendarClock />} label="创建时间">
                <span className="tabular-nums">{formatCreatedAt(task.createdAt)}</span>
              </DetailItem>

              <DetailItem icon={<Hash />} label="分类">
                <span>{category?.name ?? "未分类"}</span>
              </DetailItem>

              <DetailItem icon={<FolderOpen />} label="下载位置" className="col-span-2">
                <button
                  type="button"
                  className="block w-full truncate rounded-sm text-left font-mono text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
                  title={task.savePath || "--"}
                  onClick={openFolder}
                  disabled={!task.savePath}
                >
                  {task.savePath || "--"}
                </button>
              </DetailItem>

              <DetailItem icon={<Tags />} label="标签">
                {tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="max-w-24 truncate rounded-full bg-muted/70 px-2.5 py-1 text-xs font-medium text-muted-foreground"
                        title={tag.name}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">--</span>
                )}
              </DetailItem>

              {isActive ? (
                <DetailItem icon={<Network />} label="线程信息">
                  <span className="tabular-nums">当前连接 {task.connections ?? 0} 条</span>
                </DetailItem>
              ) : null}

              <DetailItem icon={<Link2 />} label="下载链接" className={cn("col-span-2", !isActive && "xl:col-span-3")}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="min-w-0 flex-1 truncate font-mono" title={task.url}>
                    {task.url || "--"}
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={copyUrl} disabled={!task.url}>
                    <Copy />
                    复制
                  </Button>
                </div>
              </DetailItem>
            </div>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  )
}
