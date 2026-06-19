import { useState } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"

import { CategoryDropdown, CategoryEditDialog } from "@/components/common"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { IconPicker, IconPreview } from "@/components/ui/icon-picker"
import { UI_TEXT } from "@/core/locale"
import type { MatchRules, TagInput } from "@/core/bridge/tauri-commands"
import {
  type Category,
  type Tag,
  useDownloadStore,
} from "@/core/store/useDownloadStore"
import { cn } from "@/lib/utils"
import { SettingsField, SettingsInput, SettingsList, SettingsListItem } from "./SettingsPrimitives"

type TagDraft = TagInput

const emptyRules = (): MatchRules => ({
  domains: [],
  extensions: [],
  name_keywords: [],
  min_size_bytes: null,
  max_size_bytes: null,
})

const emptyTagDraft = (categoryId?: number): TagDraft => ({
  category_id: categoryId ?? null,
  name: "",
  icon: "tag",
  color: null,
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



function normalizeTag(tag: Tag): TagInput {
  return {
    category_id: tag.categoryId ?? null,
    name: tag.name,
    icon: tag.icon ?? null,
    color: tag.color ?? null,
    rules: tag.rules ?? emptyRules(),
    save_path: tag.savePath ?? null,
  }
}

function getRuleSummary(rules: MatchRules) {
  const parts = [
    rules.domains.length ? `${UI_TEXT.settings.matchDomains}: ${toCsv(rules.domains)}` : "",
    rules.extensions.length ? `${UI_TEXT.settings.matchExtensions}: ${toCsv(rules.extensions)}` : "",
    rules.name_keywords.length ? `${UI_TEXT.settings.matchNames}: ${toCsv(rules.name_keywords)}` : "",
    rules.min_size_bytes != null ? `${UI_TEXT.settings.matchMinSize}: ${bytesToMb(rules.min_size_bytes)}` : "",
    rules.max_size_bytes != null ? `${UI_TEXT.settings.matchMaxSize}: ${bytesToMb(rules.max_size_bytes)}` : "",
  ].filter(Boolean)

  return parts.length ? parts.join(" / ") : UI_TEXT.settings.ruleSummaryEmpty
}

function RuleFields({
  value,
  onChange,
}: {
  value: MatchRules
  onChange: (rules: MatchRules) => void
}) {
  const update = (patch: Partial<MatchRules>) => onChange({ ...value, ...patch })

  return (
    <div className="space-y-4">
      <SettingsField label={UI_TEXT.settings.matchDomains}>
        <SettingsInput
          value={toCsv(value.domains)}
          onChange={(event) => update({ domains: fromCsv(event.target.value) })}
          placeholder={UI_TEXT.settings.matchDomainsPlaceholder}
          aria-label={UI_TEXT.settings.matchDomains}
        />
      </SettingsField>
      <SettingsField label={UI_TEXT.settings.matchExtensions}>
        <SettingsInput
          value={toCsv(value.extensions)}
          onChange={(event) => update({ extensions: fromCsv(event.target.value) })}
          placeholder={UI_TEXT.settings.matchExtensionsPlaceholder}
          aria-label={UI_TEXT.settings.matchExtensions}
        />
      </SettingsField>
      <SettingsField label={UI_TEXT.settings.matchNames}>
        <SettingsInput
          value={toCsv(value.name_keywords)}
          onChange={(event) => update({ name_keywords: fromCsv(event.target.value) })}
          placeholder={UI_TEXT.settings.matchNamesPlaceholder}
          aria-label={UI_TEXT.settings.matchNames}
        />
      </SettingsField>
      <SettingsField label={UI_TEXT.settings.matchMinSize}>
        <SettingsInput
          type="number"
          min={0}
          value={bytesToMb(value.min_size_bytes)}
          onChange={(event) => update({ min_size_bytes: mbToBytes(event.target.value) })}
          placeholder={UI_TEXT.settings.matchMinSize}
          aria-label={UI_TEXT.settings.matchMinSize}
        />
      </SettingsField>
      <SettingsField label={UI_TEXT.settings.matchMaxSize}>
        <SettingsInput
          type="number"
          min={0}
          value={bytesToMb(value.max_size_bytes)}
          onChange={(event) => update({ max_size_bytes: mbToBytes(event.target.value) })}
          placeholder={UI_TEXT.settings.matchMaxSize}
          aria-label={UI_TEXT.settings.matchMaxSize}
        />
      </SettingsField>
    </div>
  )
}

function RuleListRow({
  icon,
  title,
  subtitle,
  savePath,
  onEdit,
  onDelete,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  savePath?: string | null
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold leading-5 text-foreground">{title}</div>
        <div className="mt-1 truncate text-xs leading-5 text-muted-foreground">{subtitle}</div>
        {savePath ? (
          <div className="mt-1 truncate text-xs leading-5 text-muted-foreground/80">
            {UI_TEXT.settings.ruleSavePath}: {savePath}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" variant="outline" leftIcon={<Pencil />} onClick={onEdit}>
          {UI_TEXT.settings.editRule}
        </Button>
        <Button size="sm" variant="destructive" leftIcon={<Trash2 />} onClick={onDelete}>
          {UI_TEXT.settings.deleteRule}
        </Button>
      </div>
    </div>
  )
}



function TagForm({
  value,
  categories,
  onChange,
}: {
  value: TagDraft
  categories: Category[]
  onChange: (value: TagDraft) => void
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-[minmax(0,14rem)_1fr]">
        <SettingsField label={UI_TEXT.settings.tagIcon}>
          <IconPicker
            value={value.icon}
            color={value.color}
            onChange={(next) => onChange({ ...value, icon: next.icon, color: next.color })}
          />
        </SettingsField>
        <SettingsField label={UI_TEXT.settings.tagName}>
          <SettingsInput
            value={value.name}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
            placeholder={UI_TEXT.settings.tagName}
            aria-label={UI_TEXT.settings.tagName}
          />
        </SettingsField>
      </div>
      <SettingsField label={UI_TEXT.settings.tagCategory}>
        <CategoryDropdown
          categories={categories}
          value={value.category_id ?? null}
          onValueChange={(categoryId) => onChange({ ...value, category_id: categoryId })}
          noCategoryLabel={UI_TEXT.settings.noCategory}
          triggerClassName="bg-background/70"
        />
      </SettingsField>
      <RuleFields value={value.rules} onChange={(rules) => onChange({ ...value, rules })} />
      <SettingsField label={UI_TEXT.settings.ruleSavePath}>
        <SettingsInput
          value={value.save_path ?? ""}
          onChange={(event) => onChange({ ...value, save_path: event.target.value || null })}
          placeholder={UI_TEXT.settings.ruleSavePathPlaceholder}
          aria-label={UI_TEXT.settings.ruleSavePath}
        />
      </SettingsField>
    </div>
  )
}

export default function DownloadRulesManager() {
  const categories = useDownloadStore((state) => state.categories)
  const tags = useDownloadStore((state) => state.tags)
  const deleteCategory = useDownloadStore((state) => state.deleteCategory)
  const createTag = useDownloadStore((state) => state.createTag)
  const updateTag = useDownloadStore((state) => state.updateTagConfig)
  const deleteTag = useDownloadStore((state) => state.deleteTag)

  // Category Editor State
  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)

  // Tag Editor State
  const [tagEditorOpen, setTagEditorOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [tagDraft, setTagDraft] = useState<TagDraft>(() => emptyTagDraft(categories[0]?.id))



  const openCreateCategory = () => {
    setEditingCategory(null)
    setCategoryEditorOpen(true)
  }

  const openCreateTag = () => {
    setEditingTag(null)
    setTagDraft(emptyTagDraft(categories[0]?.id))
    setTagEditorOpen(true)
  }

  const saveTag = async () => {
    const finalDraft = {
      ...tagDraft,
      name: tagDraft.name.trim() || (editingTag ? editingTag.name : `${UI_TEXT.settings.addTag} ${tags.length + 1}`),
    }
    if (editingTag) {
      await updateTag(editingTag.id, finalDraft)
    } else {
      await createTag(finalDraft)
    }
    setTagEditorOpen(false)
  }

  return (
    <div className="space-y-5">
      <SettingsList>
        <SettingsListItem
          title={UI_TEXT.settings.categoryManager}
          description={UI_TEXT.settings.categoryManagerDesc}
          childrenSpan="full"
          action={
            <Button size="sm" leftIcon={<Plus />} onClick={openCreateCategory}>
              {UI_TEXT.settings.addCategory}
            </Button>
          }
        >
          <div className={cn("overflow-hidden rounded-lg bg-background/45 shadow-surface-inset")}>
            {categories.length ? (
              categories.map((category, index) => (
                <div key={category.id} className={cn(index > 0 && "border-t border-border/60")}>
                  <RuleListRow
                    icon={<IconPreview value={category.icon} color={category.color} />}
                    title={category.name}
                    subtitle={getRuleSummary(category.rules)}
                    savePath={category.savePath}
                    onEdit={() => {
                      setEditingCategory(category)
                      setCategoryEditorOpen(true)
                    }}
                    onDelete={() => deleteCategory(category.id)}
                  />
                </div>
              ))
            ) : (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                {UI_TEXT.settings.categoryEmpty}
              </div>
            )}
          </div>
        </SettingsListItem>
      </SettingsList>

      <SettingsList>
        <SettingsListItem
          title={UI_TEXT.settings.tagManager}
          description={UI_TEXT.settings.tagManagerDesc}
          childrenSpan="full"
          action={
            <Button size="sm" leftIcon={<Plus />} onClick={openCreateTag}>
              {UI_TEXT.settings.addTag}
            </Button>
          }
        >
          <div className="overflow-hidden rounded-lg bg-background/45 shadow-surface-inset">
            {tags.length ? (
              tags.map((tag, index) => {
                const category = categories.find((item) => item.id === tag.categoryId)

                return (
                  <div key={tag.id} className={cn(index > 0 && "border-t border-border/60")}>
                    <RuleListRow
                      icon={<IconPreview value={tag.icon} color={tag.color} />}
                      title={category ? `${category.name} / ${tag.name}` : tag.name}
                      subtitle={getRuleSummary(tag.rules)}
                      savePath={tag.savePath}
                      onEdit={() => {
                        setEditingTag(tag)
                        setTagDraft(normalizeTag(tag))
                        setTagEditorOpen(true)
                      }}
                      onDelete={() => deleteTag(tag.id)}
                    />
                  </div>
                )
              })
            ) : (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                {UI_TEXT.settings.tagEmpty}
              </div>
            )}
          </div>
        </SettingsListItem>
      </SettingsList>

      <CategoryEditDialog
        key={editingCategory?.id ?? "new"}
        open={categoryEditorOpen}
        category={editingCategory}
        onOpenChange={(open) => {
          setCategoryEditorOpen(open)
          if (!open) setEditingCategory(null)
        }}
      />

      <Dialog
        open={tagEditorOpen}
        onOpenChange={(open) => {
          setTagEditorOpen(open)
          if (!open) setEditingTag(null)
        }}
      >
        <DialogContent variant="modal" size="lg" key={editingTag?.id ?? "new"}>
          <DialogHeader>
            <DialogTitle>
              {editingTag ? "编辑标签" : "添加标签"}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="p-0">
            <ScrollArea
              scrollbar="overlay"
              visibility="auto"
              viewportClassName="space-y-4 px-4 py-4 sm:px-5 max-h-[65vh]"
            >
            <TagForm
              value={tagDraft}
              categories={categories}
              onChange={setTagDraft}
            />
            </ScrollArea>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagEditorOpen(false)}>
              {UI_TEXT.settings.cancel}
            </Button>
            <Button onClick={() => saveTag().catch(console.error)}>
              {UI_TEXT.settings.saveRule}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
