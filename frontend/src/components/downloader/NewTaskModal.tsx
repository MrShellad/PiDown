import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { Clipboard, FolderOpen, Grid2X2Plus, Link2, LoaderCircle, Radar } from "lucide-react";

import { CategoryDropdown } from "@/components/common/CategoryDropdown";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IconPreview } from "@/components/ui/icon-picker";
import { ActionInput, Input } from "@/components/ui/input";
import {
  checkFileConflict,
  createTask,
  inspectDownloadMetadata,
  previewTaskClassification,
  readClipboardText,
  type FileConflictCheck,
} from "@/core/bridge/tauri-commands";
import type { ExternalDownloadRequest } from "@/core/bridge/external-download";
import { UI_TEXT } from "@/core/locale";
import { useAppSettingsStore } from "@/core/store/useAppSettingsStore";
import { useDownloadStore, type Category, type Tag } from "@/core/store/useDownloadStore";
import { useToastStore } from "@/core/store/useToastStore";
import { cn } from "@/lib/utils";

interface NewTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRequest?: ExternalDownloadRequest | null;
  onInitialRequestConsumed?: () => void;
}

type NewTaskStep = "link" | "details";

interface PendingTaskCreate {
  url: string;
  savePath: string;
  filename: string;
  categoryId: number | null;
  categoryTouched: boolean;
  totalSize: number | null;
}

function inferFileName(url: string) {
  try {
    const urlObj = new URL(url);
    const lastSegment = urlObj.pathname.split("/").filter(Boolean).at(-1);
    return lastSegment ? decodeURIComponent(lastSegment) : "download";
  } catch {
    return "download";
  }
}

function formatBytes(bytes: number | null) {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return "--";

  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function RuleIconPreview({
  category,
  tag,
}: {
  category?: Category | null;
  tag?: Tag | null;
}) {
  if (tag) {
    return <IconPreview value={tag.icon} color={tag.color} className="size-7" />;
  }

  if (category) {
    return <IconPreview value={category.icon} color={category.color} className="size-7" />;
  }

  return <FolderOpen className="size-7 text-muted-foreground" />;
}

function MetadataProbeCard({
  loading,
  hasMetadata,
  className,
}: {
  loading: boolean;
  hasMetadata: boolean;
  className?: string;
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
  );
}

export default function NewTaskModal({
  open,
  onOpenChange,
  initialRequest,
  onInitialRequestConsumed,
}: NewTaskModalProps) {
  const [step, setStep] = useState<NewTaskStep>("link");
  const [url, setUrl] = useState("");
  const [filename, setFilename] = useState("");
  const [savePath, setSavePath] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [previewTagIds, setPreviewTagIds] = useState<number[]>([]);
  const [totalSize, setTotalSize] = useState<number | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [conflictCheck, setConflictCheck] = useState<FileConflictCheck | null>(null);
  const [pendingTaskCreate, setPendingTaskCreate] = useState<PendingTaskCreate | null>(null);

  const tags = useDownloadStore((state) => state.tags);
  const categories = useDownloadStore((state) => state.categories);
  const pushToast = useToastStore((state) => state.pushToast);
  const settings = useAppSettingsStore((state) => state.settings);
  const loadSettings = useAppSettingsStore((state) => state.load);
  const globalSaveDir = settings?.download.default_save_dir ?? "";

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === categoryId) ?? null,
    [categories, categoryId]
  );
  const matchedTag = useMemo(
    () => tags.find((tag) => previewTagIds.includes(tag.id)) ?? null,
    [previewTagIds, tags]
  );
  const ruleLabel = matchedTag?.name ?? selectedCategory?.name ?? "未分类";

  const applyClassificationPreview = useCallback(async (
    nextUrl: string,
    nextFilename: string,
    nextTotalSize: number | null,
    nextCategoryId: number | null,
    overrideCategory: boolean,
    options?: { touchPath?: boolean }
  ) => {
    const preview = await previewTaskClassification(
      nextUrl,
      nextFilename,
      nextTotalSize,
      nextCategoryId,
      overrideCategory
    );

    setCategoryId(preview.category?.id ?? null);
    setPreviewTagIds(preview.tags.map((tag) => tag.id));
    if (options?.touchPath !== false) {
      setSavePath(preview.save_path || globalSaveDir);
    }
  }, [globalSaveDir]);

  const resetForm = useCallback(() => {
    setStep("link");
    setUrl("");
    setFilename("");
    setSavePath("");
    setCategoryId(null);
    setCategoryTouched(false);
    setPreviewTagIds([]);
    setTotalSize(null);
    setMetadataLoading(false);
    setLoading(false);
    setConflictCheck(null);
    setPendingTaskCreate(null);
  }, []);

  const closeModal = useCallback(() => {
    resetForm();
    onOpenChange(false);
  }, [onOpenChange, resetForm]);

  useEffect(() => {
    if (settings || !open) return;
    loadSettings().catch(console.error);
  }, [loadSettings, open, settings]);

  const pasteFromClipboard = async () => {
    try {
      const text = await readClipboardText();
      if (text.trim()) setUrl(text.trim());
    } catch (err) {
      console.error("Failed to read clipboard:", err);
      pushToast({
        title: "读取剪贴板失败",
        description: String(err),
        variant: "warning",
      });
    }
  };

  const inspectMetadata = useCallback(async (nextUrl: string, fallbackFilename: string) => {
    setMetadataLoading(true);
    setTotalSize(null);

    try {
      const metadata = await inspectDownloadMetadata(nextUrl);
      const nextFilename = metadata.filename?.trim() || fallbackFilename;
      const nextTotalSize = metadata.total_size ?? null;

      setFilename(nextFilename);
      setTotalSize(nextTotalSize);
      await applyClassificationPreview(nextUrl, nextFilename, nextTotalSize, null, false);
    } catch (err) {
      console.warn("Failed to inspect download metadata:", err);
      setTotalSize(null);
    } finally {
      setMetadataLoading(false);
    }
  }, [applyClassificationPreview]);

  const openDetailsDraft = useCallback((
    nextUrl: string,
    fallbackFilename: string,
    nextTotalSize: number | null,
    options?: { inspectMetadata?: boolean }
  ) => {
    setUrl(nextUrl);
    setFilename(fallbackFilename);
    setTotalSize(nextTotalSize);
    setCategoryTouched(false);
    setMetadataLoading(false);
    setLoading(false);
    applyClassificationPreview(nextUrl, fallbackFilename, nextTotalSize, null, false).catch(console.error);
    setStep("details");

    if (options?.inspectMetadata !== false) {
      inspectMetadata(nextUrl, fallbackFilename).catch(console.error);
    }
  }, [applyClassificationPreview, inspectMetadata]);

  useEffect(() => {
    if (!open || !initialRequest) return;

    let cancelled = false;
    window.queueMicrotask(() => {
      if (cancelled) return;

      const nextUrl = initialRequest.url.trim();
      if (!nextUrl) {
        onInitialRequestConsumed?.();
        return;
      }

      const nextFilename = inferFileName(nextUrl);

      openDetailsDraft(nextUrl, nextFilename, null, {
        inspectMetadata: true,
      });
      onInitialRequestConsumed?.();
    });

    return () => {
      cancelled = true;
    };
  }, [initialRequest, onInitialRequestConsumed, open, openDetailsDraft]);

  const prepareDetails = () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    const fallbackFilename = inferFileName(trimmedUrl);

    openDetailsDraft(trimmedUrl, fallbackFilename, null);
  };

  const handleCategoryChange = (nextCategoryId: number | null) => {
    setCategoryId(nextCategoryId);
    setCategoryTouched(true);
    applyClassificationPreview(
      url.trim(),
      filename.trim() || inferFileName(url.trim()),
      totalSize,
      nextCategoryId,
      true
    ).catch(console.error);
  };

  const submitTaskCreate = useCallback(async (task: PendingTaskCreate, overwrite = false) => {
    setLoading(true);
    try {
      await createTask(
        task.url,
        task.savePath || undefined,
        task.filename,
        task.categoryId,
        task.categoryTouched,
        task.totalSize,
        overwrite
      );

      await useDownloadStore.getState().fetchTasks();

      closeModal();
    } catch (err) {
      console.error("Failed to create download task:", err);
      alert(UI_TEXT.newTask.errorAlert);
    } finally {
      setLoading(false);
    }
  }, [closeModal]);

  const handleCreateTask = async () => {
    if (!url.trim()) return;

    setLoading(true);
    try {
      const nextTask: PendingTaskCreate = {
        url: url.trim(),
        savePath: savePath.trim() || globalSaveDir,
        filename: filename.trim() || inferFileName(url.trim()),
        categoryId,
        categoryTouched,
        totalSize,
      };

      const conflict = await checkFileConflict(nextTask.savePath, nextTask.filename);
      if (conflict.exists) {
        setPendingTaskCreate(nextTask);
        setConflictCheck(conflict);
        setLoading(false);
        return;
      }

      await submitTaskCreate(nextTask);
    } catch (err) {
      console.error("Failed to create download task:", err);
      alert(UI_TEXT.newTask.errorAlert);
    } finally {
      setLoading(false);
    }
  };

  const handleUseSuggestedFilename = () => {
    if (!pendingTaskCreate || !conflictCheck) return;

    const nextTask = {
      ...pendingTaskCreate,
      filename: conflictCheck.suggested_filename,
    };

    setFilename(conflictCheck.suggested_filename);
    setConflictCheck(null);
    setPendingTaskCreate(null);
    submitTaskCreate(nextTask).catch(console.error);
  };

  const handleOverwriteExistingFile = () => {
    if (!pendingTaskCreate) return;

    const nextTask = pendingTaskCreate;
    setConflictCheck(null);
    setPendingTaskCreate(null);
    submitTaskCreate(nextTask, true).catch(console.error);
  };

  const handleRenameManually = () => {
    setConflictCheck(null);
    setPendingTaskCreate(null);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (step === "link") {
      prepareDetails();
      return;
    }

    handleCreateTask().catch(console.error);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : closeModal())}>
      <DialogContent
        variant="modal"
        className="border-border bg-card text-card-foreground sm:max-w-[46rem]"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2 text-lg font-bold tracking-tight">
            <Link2 className="size-5 text-primary" />
            {UI_TEXT.newTask.title}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody className="px-8 py-5">
            {step === "link" ? (
              <motion.div
                className="mx-auto w-full"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
              >
                <ActionInput
                  type="text"
                  placeholder={UI_TEXT.newTask.placeholder}
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  disabled={loading}
                  leadingIcon={<Link2 />}
                  actionIcon={<Clipboard />}
                  actionLabel={UI_TEXT.newTask.pasteFromClipboard}
                  onAction={pasteFromClipboard}
                  inputClassName="font-mono"
                  required
                />
              </motion.div>
            ) : (
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
                    onChange={(event) => setUrl(event.target.value)}
                    disabled={loading}
                    leadingIcon={<Link2 />}
                    actionIcon={<Clipboard />}
                    actionLabel={UI_TEXT.newTask.pasteFromClipboard}
                    onAction={pasteFromClipboard}
                    inputClassName="font-mono"
                    required
                  />

                  <div className="grid h-12 gap-3 md:grid-cols-[auto_1fr] md:items-center">
                    <label className="flex h-12 items-center text-sm font-medium text-foreground">
                      分类到
                    </label>
                    <CategoryDropdown
                      categories={categories}
                      value={categoryId}
                      onValueChange={handleCategoryChange}
                      disabled={loading}
                      noCategoryLabel="不分类"
                      triggerClassName="h-12 bg-background/70 px-4 text-base"
                    />
                  </div>

                  <ActionInput
                    type="text"
                    value={savePath}
                    onChange={(event) => {
                      setSavePath(event.target.value);
                    }}
                    disabled={loading}
                    leadingIcon={<FolderOpen />}
                    actionIcon={<FolderOpen />}
                    actionLabel="选择下载目录"
                    inputClassName="font-mono"
                  />

                  <Input
                    value={filename}
                    onChange={(event) => setFilename(event.target.value)}
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
            )}
          </DialogBody>

          <DialogFooter className="justify-between px-8 sm:justify-between [&_[data-slot=button]]:w-auto sm:[&_[data-slot=button]]:w-auto">
            {step === "link" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeModal}
                  disabled={loading}
                >
                  {UI_TEXT.newTask.cancel}
                </Button>
                <Button type="submit" disabled={loading || !url.trim()}>
                  下一步
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="submit"
                  disabled={loading}
                  loading={loading}
                  className="min-w-28"
                  style={{ boxShadow: "var(--button-glow)" }}
                >
                  下载
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeModal}
                  disabled={loading}
                  className="min-w-28"
                >
                  {UI_TEXT.newTask.cancel}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

      <Dialog
        open={Boolean(conflictCheck)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) handleRenameManually();
        }}
      >
        <DialogContent variant="alert" size="lg" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>文件已存在</DialogTitle>
          </DialogHeader>
          <DialogBody className="text-left">
            <p className="text-sm leading-6 text-muted-foreground">
              目标目录中已经存在同名文件，请选择处理方式后继续创建下载任务。
            </p>
            {conflictCheck ? (
              <div className="space-y-2 rounded-lg border border-border bg-background/70 p-3 font-mono text-xs leading-5 text-muted-foreground">
                <div className="truncate text-foreground">{conflictCheck.target_path}</div>
                <div className="truncate">建议：{conflictCheck.suggested_filename}</div>
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter className="sm:[&_[data-slot=button]]:w-auto">
            <Button type="button" variant="outline" onClick={handleRenameManually}>
              手动重命名
            </Button>
            <Button type="button" onClick={handleUseSuggestedFilename}>
              添加数字后缀
            </Button>
            <Button type="button" variant="destructive" onClick={handleOverwriteExistingFile}>
              覆盖
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
