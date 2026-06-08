import { FolderOpen } from "lucide-react";

import { IconPreview } from "@/components/ui/icon-picker";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import type { Category } from "@/core/store/useDownloadStore";

const NO_CATEGORY_VALUE = "none";

interface CategoryDropdownProps {
  categories: Category[];
  value: number | null;
  onValueChange: (categoryId: number | null) => void;
  noCategoryLabel?: string;
  triggerClassName?: string;
  disabled?: boolean;
}

function CategoryOptionIcon({ category, className }: { category?: Category | null; className: string }) {
  if (category) {
    return <IconPreview value={category.icon} color={category.color} className={className} />;
  }

  return <FolderOpen className={`${className} text-muted-foreground`} />;
}

function toSelectValue(categoryId: number | null) {
  return categoryId == null ? NO_CATEGORY_VALUE : String(categoryId);
}

function fromSelectValue(value: string) {
  return value === NO_CATEGORY_VALUE ? null : Number(value);
}

export function CategoryDropdown({
  categories,
  value,
  onValueChange,
  noCategoryLabel = "不分类",
  triggerClassName,
  disabled,
}: CategoryDropdownProps) {
  const selectedCategory = categories.find((category) => category.id === value) ?? null;

  return (
    <Select
      value={toSelectValue(value)}
      onValueChange={(nextValue) => onValueChange(fromSelectValue(nextValue))}
      disabled={disabled}
    >
      <SelectTrigger className={triggerClassName}>
        <span className="flex min-w-0 items-center gap-2">
          <CategoryOptionIcon category={selectedCategory} className="size-7" />
          <span className="truncate">{selectedCategory?.name ?? noCategoryLabel}</span>
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_CATEGORY_VALUE}>
          <span className="flex min-w-0 items-center gap-2">
            <CategoryOptionIcon className="size-4" />
            <span className="truncate">{noCategoryLabel}</span>
          </span>
        </SelectItem>
        {categories.map((category) => (
          <SelectItem key={category.id} value={String(category.id)}>
            <span className="flex min-w-0 items-center gap-2">
              <CategoryOptionIcon category={category} className="size-4" />
              <span className="truncate">{category.name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

