import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { Clipboard, FolderOpen, Grid2X2Plus, Link2, LoaderCircle } from "lucide-react";

import { CategoryDropdown } from "@/components/common/CategoryDropdown";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IconPreview } from "@/components/ui/icon-picker";
import { ActionInput, Input } from "@/components/ui/input";
import {
  createTask,
  inspectDownloadMetadata,
  previewTaskClassification,
} from "@/core/bridge/tauri-commands";
import { UI_TEXT } from "@/core/locale";
import { useAppSettingsStore } from "@/core/store/useAppSettingsStore";
import { useDownloadStore, type Category, type Tag } from "@/core/store/useDownloadStore";

interface NewTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type NewTaskStep = "link" | "details";

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

export default function NewTaskModal({ open, onOpenChange }: NewTaskModalProps) {
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

  const tags = useDownloadStore((state) => state.tags);
  const categories = useDownloadStore((state) => state.categories);
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
    if (!navigator.clipboard) return;

    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) setUrl(text.trim());
    } catch (err) {
      console.error("Failed to read clipboard:", err);
    }
  };

  const inspectMetadata = async (nextUrl: string, fallbackFilename: string) => {
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
  };

  const prepareDetails = () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    const fallbackFilename = inferFileName(trimmedUrl);

    setFilename(fallbackFilename);
    setCategoryTouched(false);
    applyClassificationPreview(trimmedUrl, fallbackFilename, null, null, false).catch(console.error);
    setStep("details");
    inspectMetadata(trimmedUrl, fallbackFilename).catch(console.error);
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

  const handleCreateTask = async () => {
    if (!url.trim()) return;

    setLoading(true);
    try {
      const finalSavePath = savePath.trim() || globalSaveDir;
      const finalFilename = filename.trim() || inferFileName(url.trim());
      await createTask(
        url.trim(),
        finalSavePath || undefined,
        finalFilename,
        categoryId,
        categoryTouched,
        totalSize
      );

      await useDownloadStore.getState().fetchTasks();

      closeModal();
    } catch (err) {
      console.error("Failed to create download task:", err);
      alert(UI_TEXT.newTask.errorAlert);
    } finally {
      setLoading(false);
    }
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
          <DialogBody className="px-8 py-6">
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
                className="grid gap-5 md:grid-cols-[1fr_8rem]"
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

                  <div className="grid gap-3 md:grid-cols-[auto_1fr] md:items-center">
                    <label className="flex h-10 items-center text-sm font-medium text-foreground">
                      分类到
                    </label>
                    <CategoryDropdown
                      categories={categories}
                      value={categoryId}
                      onValueChange={handleCategoryChange}
                      disabled={loading}
                      noCategoryLabel="不分类"
                      triggerClassName="bg-background/70"
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

                <aside className="flex min-w-32 flex-col items-center justify-center gap-4 rounded-lg bg-background/35 px-4 py-4 text-sm text-muted-foreground">
                  <div className="grid size-14 place-items-center rounded-lg bg-muted/70">
                    <RuleIconPreview category={selectedCategory} tag={matchedTag} />
                  </div>
                  <div className="max-w-28 truncate text-center text-sm font-medium text-foreground">
                    {ruleLabel}
                  </div>
                  <div className="h-px w-full bg-border/70" />
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-2">
                      <Grid2X2Plus className="size-4" />
                      <span className="text-xs">文件大小</span>
                    </div>
                    <span className="flex items-center gap-1 font-mono text-sm text-foreground">
                      {metadataLoading ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                      {metadataLoading ? "识别中" : formatBytes(totalSize)}
                    </span>
                  </div>
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
  );
}
