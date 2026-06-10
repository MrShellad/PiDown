import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  Copy,
  FolderOpen,
  Link2,
  X,
  Trash2,
  RefreshCw,
  FileText,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { IconPreview } from "@/components/ui/icon-picker"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { writeClipboardText } from "@/core/bridge/tauri-commands"
import { UI_TEXT } from "@/core/locale"
import type { Category, Task } from "@/core/store/useDownloadStore"
import { useDownloadStore } from "@/core/store/useDownloadStore"
import { useToastStore } from "@/core/store/useToastStore"
import { cn } from "@/lib/utils"

interface TaskDetailsDrawerProps {
  open: boolean
  task?: Task | null
  category?: Category | null
  selectedTaskCount?: number
  onOpenChange: (open: boolean) => void
  onDeleteClick?: (gid: string) => void
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

function formatUpdatedAt(task: Task) {
  if (task.status === "Downloading") {
    return formatCreatedAt(Math.floor(Date.now() / 1000));
  }
  const ts = task.completedAt || task.startedAt || task.createdAt;
  return formatCreatedAt(ts ?? undefined);
}

function formatBytes(bytes: number | null | undefined) {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return "--"

  const units = ["B", "KiB", "MiB", "GiB", "TiB"]
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
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

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start py-1.5 min-h-[36px]">
      <span className="w-[100px] shrink-0 text-muted-foreground text-sm font-semibold select-none leading-6">
        {label}
      </span>
      <div className="flex-1 min-w-0 text-foreground text-sm font-medium flex items-center gap-1.5 flex-wrap min-h-6 break-all">
        {children}
      </div>
    </div>
  )
}

export default function TaskDetailsDrawer({
  open,
  task,
  category,
  selectedTaskCount = 0,
  onOpenChange,
  onDeleteClick,
}: TaskDetailsDrawerProps) {
  const [activeTab, setActiveTab] = useState(0)

  const tags = task?.tags ?? []
  
  const openTaskFolder = useDownloadStore((state) => state.openTaskFolder)
  const openTaskFile = useDownloadStore((state) => state.openTaskFile)
  const restartTask = useDownloadStore((state) => state.restartTask)
  const pushToast = useToastStore((state) => state.pushToast)

  const tabs = ["基本", "网络", "分类", "文件", "线程", "其它"]

  const copyUrl = async () => {
    if (!task?.url) return

    try {
      await writeClipboardText(task.url)
      pushToast({
        title: "链接已复制",
        description: "下载链接已复制到剪贴板。",
        variant: "success",
      })
    } catch (error) {
      pushToast({
        title: "复制链接失败",
        description: String(error),
        variant: "warning",
      })
    }
  }

  const openFolder = () => {
    if (!task) return
    void openTaskFolder(task.gid)
  }

  return (
    <>
      <AnimatePresence>
        {open && task ? (
          <>
            {/* Background Overlay */}
            <motion.div
              className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-[1px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => onOpenChange(false)}
            />

            {/* Sidebar Container */}
            <motion.aside
              id="task-details-sheet"
              className="fixed right-0 z-[120] w-[500px] sm:w-[560px] border-l border-border bg-popover/95 backdrop-blur-md text-popover-foreground shadow-2xl flex flex-col subpixel-antialiased"
              style={{
                top: 0,
                height: "100vh",
              }}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 30,
              }}
              role="dialog"
              aria-modal={true}
              aria-label="任务详情"
            >
              {/* Header: Title Bar & Tabs */}
              <div className="flex flex-col border-b border-border/60 bg-popover-soft px-6 pt-5 pb-0">
                {/* Title Bar */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-background/60"
                      style={{ color: category?.color ?? "var(--muted-foreground)" }}
                    >
                      <IconPreview value={category?.icon ?? "folder"} color={category?.color} className="size-4.5" />
                    </div>
                    <div className="min-w-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <h2 className="text-base font-bold leading-6 text-foreground truncate max-w-[280px]">
                            {task.name}
                          </h2>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md break-all">{task.name}</TooltipContent>
                      </Tooltip>
                      <p className="font-mono text-xs leading-5 text-muted-foreground truncate max-w-[280px]">
                        {task.gid}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {selectedTaskCount > 1 && (
                      <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        已选 {selectedTaskCount} 项
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onOpenChange(false)}
                      className="rounded-lg hover:bg-muted"
                    >
                      <X className="size-4" />
                      <span className="sr-only">关闭</span>
                    </Button>
                  </div>
                </div>

                {/* Tab Navigation */}
                <div className="relative mt-4 flex border-b border-border/30">
                  {tabs.map((tab, idx) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(idx)}
                      className={cn(
                        "relative px-4 py-2 text-xs font-semibold tracking-wide transition-colors focus:outline-none pb-2.5",
                        activeTab === idx
                          ? "text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {tab}
                      {activeTab === idx && (
                        <motion.div
                          layoutId="activeTabIndicator"
                          className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary"
                          transition={{ type: "spring", stiffness: 380, damping: 30 }}
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Body Section */}
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {/* Content Area: Key-Value Grid */}
                <div className="flex-1 min-h-0 overflow-y-auto space-y-1 px-6 py-6 scrollbar-interactive scrollbar-overlay">
                  {activeTab === 0 && (
                    <div className="flex flex-col">
                      {/* 1. 下载地址 */}
                      <InfoRow label="下载地址">
                        <div className="flex items-center justify-between w-full gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="font-mono text-xs truncate select-all flex-1 text-foreground/90 leading-6">
                                {task.url || "--"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-md break-all">{task.url}</TooltipContent>
                          </Tooltip>
                          <Button variant="ghost" size="icon-sm" onClick={copyUrl} className="h-7 w-7 rounded-md shrink-0" disabled={!task.url}>
                            <Copy className="size-3.5" />
                          </Button>
                        </div>
                      </InfoRow>

                      {/* 2. 分类 */}
                      <InfoRow label="分类">
                        <div className="flex items-center gap-2">
                          <IconPreview value={category?.icon ?? "folder"} color={category?.color} className="size-4" />
                          <span className="text-foreground/90 font-medium leading-6">{category?.name ?? "未分类"}</span>
                        </div>
                      </InfoRow>

                      {/* 3. 状态 */}
                      <InfoRow label="状态">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/15 text-primary border border-primary/25">
                          {statusText(task.status)}
                        </span>
                      </InfoRow>

                      {/* 4. 错误信息 */}
                      <InfoRow label="错误信息">
                        <span className={cn("font-medium leading-6 break-all", task.errorMessage ? "text-destructive" : "text-foreground/90")}>
                          {task.errorMessage || "--"}
                        </span>
                      </InfoRow>

                      {/* 5. 创建时间 */}
                      <InfoRow label="创建时间">
                        <span className="tabular-nums text-foreground/90 font-medium leading-6">{formatCreatedAt(task.createdAt)}</span>
                      </InfoRow>

                      {/* 6. 更新时间 */}
                      <InfoRow label="更新时间">
                        <span className="tabular-nums text-foreground/90 font-medium leading-6">{formatUpdatedAt(task)}</span>
                      </InfoRow>

                      {/* 7. 保存目录 */}
                      <InfoRow label="保存目录">
                        <div className="flex items-center justify-between w-full gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="font-mono text-xs truncate flex-1 text-foreground/90 leading-6">{task.savePath || "--"}</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-md break-all">{task.savePath || "--"}</TooltipContent>
                          </Tooltip>
                          <Button variant="ghost" size="icon-sm" onClick={openFolder} className="h-7 w-7 rounded-md shrink-0" disabled={!task.savePath}>
                            <FolderOpen className="size-3.5" />
                          </Button>
                        </div>
                      </InfoRow>

                      {/* 8. 文件总大小 */}
                      <InfoRow label="文件总大小">
                        <span className="tabular-nums text-foreground/90 font-medium leading-6">
                          {task.status === "Completed"
                            ? formatBytes(task.totalBytes)
                            : `${formatBytes(task.downloadedBytes)} / ${formatBytes(task.totalBytes)}`}
                        </span>
                      </InfoRow>

                      {/* 9. 进度 */}
                      <InfoRow label="进度">
                        <span className="font-semibold text-sm text-foreground tabular-nums leading-6">
                          {task.progress.toFixed(1)}%
                        </span>
                      </InfoRow>

                      {/* 10. 下载速度 */}
                      <InfoRow label="下载速度">
                        <span className="tabular-nums text-foreground/90 font-medium leading-6">{task.speed || "0 B/s"}</span>
                      </InfoRow>

                      {/* 11. 上传速度 */}
                      {!(task.url?.startsWith("http://") || task.url?.startsWith("https://")) && (
                        <InfoRow label="上传速度">
                          <span className="tabular-nums text-foreground/90 font-medium leading-6">{task.uploadSpeed || "0 B/s"}</span>
                        </InfoRow>
                      )}

                      {/* 12. 剩余时间 */}
                      <InfoRow label="剩余时间">
                        <span className="tabular-nums text-foreground/90 font-medium leading-6">{task.eta || "--"}</span>
                      </InfoRow>
                    </div>
                  )}

                  {activeTab === 1 && (
                    <div className="flex flex-col">
                      <InfoRow label="活动连接">
                        <span className="tabular-nums text-foreground/90 font-medium">{task.connections ?? 0}</span>
                      </InfoRow>

                      <InfoRow label="下载链接">
                        <div className="flex items-center justify-between w-full gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="font-mono text-xs truncate select-all flex-1 text-foreground/90 leading-5">
                                {task.url || "--"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-md break-all">{task.url}</TooltipContent>
                          </Tooltip>
                          <Button variant="ghost" size="icon-sm" onClick={copyUrl} className="h-7 w-7 rounded-md shrink-0" disabled={!task.url}>
                            <Copy className="size-3.5" />
                          </Button>
                        </div>
                      </InfoRow>
                    </div>
                  )}

                  {activeTab === 2 && (
                    <div className="flex flex-col">
                      <InfoRow label="常规分类">
                        <div className="flex items-center gap-2">
                          <IconPreview value={category?.icon ?? "folder"} color={category?.color} className="size-4" />
                          <span>{category?.name ?? "未分类"}</span>
                        </div>
                      </InfoRow>

                      <InfoRow label="归属标签">
                        {tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {tags.map((tag) => (
                              <span
                                key={tag.id}
                                className="px-2 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border/80"
                              >
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs font-normal">暂无标签</span>
                        )}
                      </InfoRow>
                    </div>
                  )}

                  {activeTab === 3 && (
                    <div className="flex flex-col">
                      <InfoRow label="文件名">
                        <div className="flex items-center justify-between w-full gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="truncate flex-1 font-semibold text-foreground/90">{task.name}</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-md break-all">{task.name}</TooltipContent>
                          </Tooltip>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="h-7 w-7 rounded-md shrink-0"
                            onClick={async () => {
                              try {
                                await writeClipboardText(task.name);
                                pushToast({
                                  title: "文件名已复制",
                                  description: "任务文件名已成功复制到剪贴板。",
                                  variant: "success",
                                });
                              } catch (e) {
                                // error
                              }
                            }}
                          >
                            <Copy className="size-3.5" />
                          </Button>
                        </div>
                      </InfoRow>

                      <InfoRow label="存储路径">
                        <div className="flex items-center justify-between w-full gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="font-mono text-xs truncate flex-1 text-foreground/90">{task.savePath || "--"}</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-md break-all">{task.savePath || "--"}</TooltipContent>
                          </Tooltip>
                          <Button variant="ghost" size="icon-sm" onClick={openFolder} className="h-7 w-7 rounded-md shrink-0" disabled={!task.savePath}>
                            <FolderOpen className="size-3.5" />
                          </Button>
                        </div>
                      </InfoRow>
                    </div>
                  )}

                  {activeTab === 4 && (
                    <div className="flex flex-col">
                      <InfoRow label="分块连接">
                        <span className="tabular-nums text-foreground/90 font-medium">{task.connections ?? 0} 个活动连接线程</span>
                      </InfoRow>

                      <InfoRow label="多线程机制">
                        <span className="text-xs text-muted-foreground leading-relaxed font-normal">
                          分块多线程下载已启用。该任务已自动划分多个网络连接片段，通过并发连接提升大文件检索速度，降低服务器侧单点连接限速的影响。
                        </span>
                      </InfoRow>
                    </div>
                  )}

                  {activeTab === 5 && (
                    <div className="flex flex-col">
                      <InfoRow label="任务 GID">
                        <div className="flex items-center justify-between w-full gap-2">
                          <span className="font-mono text-xs select-all truncate flex-1 text-foreground/90">{task.gid}</span>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="h-7 w-7 rounded-md shrink-0"
                            onClick={async () => {
                              try {
                                await writeClipboardText(task.gid);
                                pushToast({
                                  title: "任务 GID 已复制",
                                  description: "任务 GID 标志码已成功复制到剪贴板。",
                                  variant: "success",
                                });
                              } catch (e) {
                                // error
                              }
                            }}
                          >
                            <Copy className="size-3.5" />
                          </Button>
                        </div>
                      </InfoRow>

                      <InfoRow label="创建日期">
                        <span className="tabular-nums text-foreground/90 font-medium">{formatCreatedAt(task.createdAt)}</span>
                      </InfoRow>
                    </div>
                  )}
                </div>

                {/* Footer Action Bar */}
                <div className="shrink-0 border-t border-border/30 bg-popover-soft px-6 py-4 flex items-center justify-between gap-4 select-none">
                  {/* Left Side: Delete */}
                  <div>
                    <Button
                      variant="ghost"
                      className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors"
                      onClick={() => onDeleteClick?.(task.gid)}
                    >
                      <Trash2 className="size-4" />
                      <span>删除任务</span>
                    </Button>
                  </div>

                  {/* Right Side: Other Actions */}
                  <ButtonGroup>
                    {(task.status === "Completed" || task.status === "Failed" || task.status === "Cancelled") && (
                      <Button
                        variant="outline"
                        className="flex items-center gap-1.5 h-9 px-3 text-xs font-semibold"
                        onClick={() => restartTask(task.gid)}
                      >
                        <RefreshCw className="size-4 shrink-0" />
                        <span>重新开始</span>
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      className="flex items-center gap-1.5 h-9 px-3 text-xs font-semibold"
                      onClick={copyUrl}
                      disabled={!task.url}
                    >
                      <Link2 className="size-4 shrink-0" />
                      <span>复制链接</span>
                    </Button>

                    <Button
                      variant="outline"
                      className="flex items-center gap-1.5 h-9 px-3 text-xs font-semibold"
                      onClick={openFolder}
                      disabled={!task.savePath}
                    >
                      <FolderOpen className="size-4 shrink-0" />
                      <span>打开目录</span>
                    </Button>

                    {task.status === "Completed" && (
                      <Button
                        variant="outline"
                        className="flex items-center gap-1.5 h-9 px-3 text-xs font-semibold"
                        onClick={() => openTaskFile(task.gid)}
                      >
                        <FileText className="size-4 shrink-0" />
                        <span>打开文件</span>
                      </Button>
                    )}
                  </ButtonGroup>
                </div>
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  )
}
