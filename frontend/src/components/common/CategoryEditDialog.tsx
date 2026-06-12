import { useMemo, useState } from "react"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input, Field, CompoundInput, CompoundInputButton } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { IconPicker } from "@/components/ui/icon-picker"
import { pickDownloadDirectory, type CategoryInput, type MatchRules } from "@/core/bridge/tauri-commands"
import { useDownloadStore, type Category } from "@/core/store/useDownloadStore"

interface CategoryEditDialogProps {
  open: boolean
  category: Category | null // null means "Create Category"
  onOpenChange: (open: boolean) => void
}

const emptyRules = (): MatchRules => ({
  domains: [],
  extensions: [],
  name_keywords: [],
  min_size_bytes: null,
  max_size_bytes: null,
})

const emptyCategoryDraft = (sortOrder: number): CategoryInput => ({
  name: "",
  icon: "folder",
  color: "#8c8c8c",
  sort_order: sortOrder,
  rules: emptyRules(),
  save_path: null,
})

const toCsv = (values: string[]) => values.join(", ")

const fromCsv = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

const bytesToMb = (value?: number | null) =>
  value == null ? "" : String(Math.round(value / 1024 / 1024))

const mbToBytes = (value: string) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric * 1024 * 1024) : null
}

function normalizeCategory(category: Category): CategoryInput {
  return {
    name: category.name,
    icon: category.icon ?? null,
    color: category.color ?? null,
    sort_order: category.sortOrder,
    rules: category.rules ?? emptyRules(),
    save_path: category.savePath ?? null,
  }
}

export function CategoryEditDialog({
  open,
  category,
  onOpenChange,
}: CategoryEditDialogProps) {
  const categories = useDownloadStore((state) => state.categories)
  const createCategory = useDownloadStore((state) => state.createCategory)
  const updateCategoryConfig = useDownloadStore((state) => state.updateCategoryConfig)

  const nextSortOrder = useMemo(
    () => Math.max(0, ...categories.map((c) => c.sortOrder)) + 1,
    [categories]
  )

  const [draft, setDraft] = useState<CategoryInput>(() =>
    category ? normalizeCategory(category) : emptyCategoryDraft(nextSortOrder)
  )


  const updateRules = (patch: Partial<MatchRules>) => {
    setDraft((prev) => ({
      ...prev,
      rules: { ...prev.rules, ...patch },
    }))
  }

  const handleBrowseFolder = async () => {
    try {
      const selected = await pickDownloadDirectory(draft.save_path || undefined)
      if (selected) {
        setDraft((prev) => ({ ...prev, save_path: selected }))
      }
    } catch (err) {
      console.error("Failed to pick directory", err)
    }
  }

  const handleSave = async () => {
    const finalDraft = {
      ...draft,
      name: draft.name.trim() || (category ? category.name : `分类 ${categories.length + 1}`),
    }

    if (category) {
      await updateCategoryConfig(category.id, finalDraft)
    } else {
      await createCategory(finalDraft)
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="modal" size="lg" className="w-[520px] max-w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>
            {category ? "编辑分类" : "添加新分类"}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          {/* Icon & Name Row */}
          <div className="grid gap-4 grid-cols-[auto_1fr] items-start">
            <Field label="图标与颜色">
              <IconPicker
                value={draft.icon || "folder"}
                color={draft.color || "#8c8c8c"}
                onChange={(next) =>
                  setDraft((prev) => ({
                    ...prev,
                    icon: next.icon || "folder",
                    color: next.color || "#8c8c8c",
                  }))
                }
              />
            </Field>
            <Field label="分类名称" required className="flex-1">
              <Input
                value={draft.name}
                onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="请输入分类名称"
                required
              />
            </Field>
          </div>

          {/* Save Path Row */}
          <Field label="存储路径（选填）">
            <CompoundInput
              value={draft.save_path || ""}
              onChange={(e) => setDraft((prev) => ({ ...prev, save_path: e.target.value || null }))}
              placeholder="默认使用全局下载目录"
              suffixActions={
                <CompoundInputButton
                  type="button"
                  divider="left"
                  onClick={handleBrowseFolder}
                  className="px-4 text-xs"
                >
                  浏览...
                </CompoundInputButton>
              }
            />
          </Field>

          <div className="border-t border-border/50 my-2" />

          {/* Rule Match Fields */}
          <div className="space-y-4">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest block">自动分类匹配规则（选填）</span>
            
            <Field label="匹配域名">
              <Input
                value={toCsv(draft.rules.domains)}
                onChange={(e) => updateRules({ domains: fromCsv(e.target.value) })}
                placeholder="例如: example.com, test.org (英文逗号分隔)"
              />
            </Field>

            <Field label="匹配扩展名">
              <Input
                value={toCsv(draft.rules.extensions)}
                onChange={(e) => updateRules({ extensions: fromCsv(e.target.value) })}
                placeholder="例如: mp4, zip, pdf (英文逗号分隔)"
              />
            </Field>

            <Field label="匹配文件名关键字">
              <Input
                value={toCsv(draft.rules.name_keywords)}
                onChange={(e) => updateRules({ name_keywords: fromCsv(e.target.value) })}
                placeholder="匹配文件名包含的词 (英文逗号分隔)"
              />
            </Field>

            <div className="grid gap-4 grid-cols-2">
              <Field label="最小文件大小 (MB)">
                <Input
                  type="number"
                  min={0}
                  value={bytesToMb(draft.rules.min_size_bytes)}
                  onChange={(e) => updateRules({ min_size_bytes: mbToBytes(e.target.value) })}
                  placeholder="不限"
                />
              </Field>
              <Field label="最大文件大小 (MB)">
                <Input
                  type="number"
                  min={0}
                  value={bytesToMb(draft.rules.max_size_bytes)}
                  onChange={(e) => updateRules({ max_size_bytes: mbToBytes(e.target.value) })}
                  placeholder="不限"
                />
              </Field>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={!draft.name.trim()} onClick={handleSave}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
