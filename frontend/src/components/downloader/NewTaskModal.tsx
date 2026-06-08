import { useEffect, useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Clipboard, FolderOpen, Grid2X2Plus, Link2, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IconPreview } from "@/components/ui/icon-picker";
import { ActionInput, Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  createTask,
  inspectDownloadMetadata,
  type MatchRules,
} from "@/core/bridge/tauri-commands";
import { UI_TEXT } from "@/core/locale";
import { useAppSettingsStore } from "@/core/store/useAppSettingsStore";
import { useDownloadStore, type Category, type Tag } from "@/core/store/useDownloadStore";
import { useToastStore } from "@/core/store/useToastStore";

interface NewTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type NewTaskStep = "link" | "details";

const NO_CATEGORY_VALUE = "none";

function inferFileName(url: string) {
  try {
    const urlObj = new URL(url);
    const lastSegment = urlObj.pathname.split("/").filter(Boolean).at(-1);
    return lastSegment ? decodeURIComponent(lastSegment) : "download";
  } catch (_) {
    return "download";
  }
}

const normalizeRuleValues = (values?: string[]) =>
  (values ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

function rulesMatch(url: string, filename: string, rules?: MatchRules) {
  if (!rules) return false;

  const urlLower = url.toLowerCase();
  const filenameLower = filename.toLowerCase();
  const domains = normalizeRuleValues(rules.domains);
  const extensions = normalizeRuleValues(rules.extensions);
  const keywords = normalizeRuleValues(rules.name_keywords);

  if (domains.length && !domains.some((domain) => urlLower.includes(domain))) return false;
  if (
    extensions.length &&
    !extensions.some((extension) => {
      const normalized = extension.startsWith(".") ? extension : `.${extension}`;
      return filenameLower.endsWith(normalized);
    })
  ) {
    return false;
  }
  if (keywords.length && !keywords.some((keyword) => filenameLower.includes(keyword))) return false;

  return Boolean(domains.length || extensions.length || keywords.length);
}

function inferCategory(url: string, filename: string, categories: Category[]) {
  return categories.find((category) => rulesMatch(url, filename, category.rules)) ?? null;
}

function inferTag(url: string, filename: string, tags: Tag[], categoryId: number | null) {
  return (
    tags.find((tag) => {
      const categoryMatches = tag.categoryId == null || tag.categoryId === categoryId;
      return categoryMatches && rulesMatch(url, filename, tag.rules);
    }) ?? null
  );
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
  const [totalSize, setTotalSize] = useState<number | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [pathTouched, setPathTouched] = useState(false);
  const [loading, setLoading] = useState(false);

  const addTask = useDownloadStore((state) => state.addTask);
  const categories = useDownloadStore((state) => state.categories);
  const tags = useDownloadStore((state) => state.tags);
  const settings = useAppSettingsStore((state) => state.settings);
  const loadSettings = useAppSettingsStore((state) => state.load);
  const pushToast = useToastStore((state) => state.pushToast);
  const globalSaveDir = settings?.download.default_save_dir ?? "";

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === categoryId) ?? null,
    [categories, categoryId]
  );
  const matchedTag = useMemo(
    () => inferTag(url.trim(), filename.trim(), tags, categoryId),
    [url, filename, tags, categoryId]
  );
  const ruleLabel = matchedTag?.name ?? selectedCategory?.name ?? "未分类";

  const resolveDefaultSavePath = (
    category?: Category | null,
    tag?: Tag | null,
    options?: { notify?: boolean }
  ) => {
    const ruleSavePath = tag?.savePath?.trim() || category?.savePath?.trim();
    if (ruleSavePath) return ruleSavePath;

    if (options?.notify && category) {
      pushToast({
        title: "已使用全局下载目录",
        description: `${tag?.name ?? category.name} 未指定下载目录，已回填全局默认路径。`,
        variant: "warning",
      });
    }

    return globalSaveDir;
  };

  useEffect(() => {
    if (settings || !open) return;
    loadSettings().catch(console.error);
  }, [loadSettings, open, settings]);

  useEffect(() => {
    if (open) return;

    setStep("link");
    setUrl("");
    setFilename("");
    setSavePath("");
    setCategoryId(null);
    setTotalSize(null);
    setMetadataLoading(false);
    setPathTouched(false);
    setLoading(false);
  }, [open]);

  useEffect(() => {
    if (step !== "details" || pathTouched) return;
    setSavePath(resolveDefaultSavePath(selectedCategory, matchedTag));
  }, [step, pathTouched, selectedCategory, matchedTag, globalSaveDir]);

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
      const nextCategory = inferCategory(nextUrl, nextFilename, categories);
      const nextTag = inferTag(nextUrl, nextFilename, tags, nextCategory?.id ?? null);

      setFilename(nextFilename);
      setCategoryId(nextCategory?.id ?? null);
      setTotalSize(metadata.total_size ?? null);
      setSavePath(resolveDefaultSavePath(nextCategory, nextTag, { notify: Boolean(nextCategory) }));
      setPathTouched(false);
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
    const nextCategory = inferCategory(trimmedUrl, fallbackFilename, categories);
    const nextTag = inferTag(trimmedUrl, fallbackFilename, tags, nextCategory?.id ?? null);

    setFilename(fallbackFilename);
    setCategoryId(nextCategory?.id ?? null);
    setSavePath(resolveDefaultSavePath(nextCategory, nextTag, { notify: Boolean(nextCategory) }));
    setPathTouched(false);
    setStep("details");
    inspectMetadata(trimmedUrl, fallbackFilename).catch(console.error);
  };

  const handleCategoryChange = (value: string) => {
    const nextCategoryId = value === NO_CATEGORY_VALUE ? null : Number(value);
    const nextCategory = categories.find((category) => category.id === nextCategoryId) ?? null;
    const nextTag = inferTag(url.trim(), filename.trim(), tags, nextCategoryId);

    setCategoryId(nextCategoryId);
    setSavePath(resolveDefaultSavePath(nextCategory, nextTag, { notify: Boolean(nextCategory) }));
    setPathTouched(false);
  };

  const handleCreateTask = async () => {
    if (!url.trim()) return;

    setLoading(true);
    try {
      const finalSavePath = savePath.trim() || resolveDefaultSavePath(selectedCategory, matchedTag);
      const finalFilename = filename.trim() || inferFileName(url.trim());
      const gid = await createTask(
        url.trim(),
        finalSavePath || undefined,
        finalFilename,
        categoryId
      );

      addTask(gid, url.trim(), finalFilename);
      useDownloadStore.getState().fetchTasks().catch(console.error);

      setUrl("");
      onOpenChange(false);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="modal"
        className="border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] sm:max-w-[46rem]"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2 text-lg font-bold tracking-tight">
            <Link2 className="size-5 text-[var(--primary)]" />
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
                    <Select
                      value={categoryId == null ? NO_CATEGORY_VALUE : String(categoryId)}
                      onValueChange={handleCategoryChange}
                    >
                      <SelectTrigger className="bg-background/70">
                        <span className="flex min-w-0 items-center gap-2">
                          <RuleIconPreview category={selectedCategory} />
                          <span className="truncate">{selectedCategory?.name ?? "不分类"}</span>
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_CATEGORY_VALUE}>
                          <span className="flex min-w-0 items-center gap-2">
                            <FolderOpen className="size-4 text-muted-foreground" />
                            <span className="truncate">不分类</span>
                          </span>
                        </SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={String(category.id)}>
                            <span className="flex min-w-0 items-center gap-2">
                              <IconPreview value={category.icon} color={category.color} className="size-4" />
                              <span className="truncate">{category.name}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <ActionInput
                    type="text"
                    value={savePath}
                    onChange={(event) => {
                      setSavePath(event.target.value);
                      setPathTouched(true);
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
                    className="h-12 rounded-[var(--radius-lg)] bg-background/70 px-4 text-base"
                  />
                </div>

                <aside className="flex min-w-32 flex-col items-center justify-center gap-4 rounded-[var(--radius-lg)] bg-background/35 px-4 py-4 text-sm text-muted-foreground">
                  <div className="grid size-14 place-items-center rounded-[var(--radius-lg)] bg-muted/70">
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
                  onClick={() => onOpenChange(false)}
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
                  onClick={() => onOpenChange(false)}
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
