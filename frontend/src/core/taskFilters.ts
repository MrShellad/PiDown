import type { Category, Tag, Task } from "@/core/store/useDownloadStore";

export type SystemNavFilter = "all" | "completed" | "incomplete";
export type CategoryNavFilter = `category:${number}`;
export type TagNavFilter = `tag:${number}`;
export type NavFilter = SystemNavFilter | CategoryNavFilter | TagNavFilter;

type ParsedNavFilter =
  | { type: "system"; value: SystemNavFilter }
  | { type: "category"; id: number }
  | { type: "tag"; id: number };

interface TaskFilterContext {
  categories?: Category[];
  tags?: Tag[];
}

const CATEGORY_FILTER_PREFIX = "category:";
const TAG_FILTER_PREFIX = "tag:";

export const createCategoryFilter = (categoryId: number): CategoryNavFilter =>
  `${CATEGORY_FILTER_PREFIX}${categoryId}` as CategoryNavFilter;

export const createTagFilter = (tagId: number): TagNavFilter =>
  `${TAG_FILTER_PREFIX}${tagId}` as TagNavFilter;

export function parseNavFilter(filter: NavFilter): ParsedNavFilter {
  if (filter.startsWith(CATEGORY_FILTER_PREFIX)) {
    return { type: "category", id: Number(filter.slice(CATEGORY_FILTER_PREFIX.length)) };
  }

  if (filter.startsWith(TAG_FILTER_PREFIX)) {
    return { type: "tag", id: Number(filter.slice(TAG_FILTER_PREFIX.length)) };
  }

  return { type: "system", value: filter as SystemNavFilter };
}

const normalizeRuleValues = (values?: string[]) =>
  (values ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

const hasRules = (rules?: Category["rules"] | Tag["rules"] | null) =>
  Boolean(
    rules &&
      (normalizeRuleValues(rules.domains).length ||
        normalizeRuleValues(rules.extensions).length ||
        normalizeRuleValues(rules.name_keywords).length ||
        rules.min_size_bytes != null ||
        rules.max_size_bytes != null)
  );

function taskMatchesRules(task: Task, rules?: Category["rules"] | Tag["rules"] | null) {
  if (!hasRules(rules) || !rules) return false;

  const url = task.url.toLowerCase();
  const filename = task.name.toLowerCase();
  const totalBytes = task.totalBytes > 0 ? task.totalBytes : null;
  const domains = normalizeRuleValues(rules.domains);
  const extensions = normalizeRuleValues(rules.extensions);
  const keywords = normalizeRuleValues(rules.name_keywords);

  if (domains.length && !domains.some((domain) => url.includes(domain))) return false;

  if (
    extensions.length &&
    !extensions.some((extension) => {
      const normalized = extension.startsWith(".") ? extension : `.${extension}`;
      return filename.endsWith(normalized);
    })
  ) {
    return false;
  }

  if (keywords.length && !keywords.some((keyword) => filename.includes(keyword))) return false;
  if (rules.min_size_bytes != null && (totalBytes == null || totalBytes < rules.min_size_bytes)) return false;
  if (rules.max_size_bytes != null && totalBytes != null && totalBytes > rules.max_size_bytes) return false;

  return true;
}

function taskHasTag(task: Task, tagId: number) {
  return Boolean(task.tags?.some((tag) => tag.id === tagId));
}

function taskMatchesCategory(task: Task, categoryId: number, context: TaskFilterContext) {
  if (task.categoryId === categoryId) return true;

  const childTags = context.tags?.filter((tag) => tag.categoryId === categoryId) ?? [];
  if (childTags.some((tag) => taskHasTag(task, tag.id))) return true;

  const category = context.categories?.find((item) => item.id === categoryId);
  return taskMatchesRules(task, category?.rules);
}

function taskMatchesTag(task: Task, tagId: number, context: TaskFilterContext) {
  if (taskHasTag(task, tagId)) return true;

  const tag = context.tags?.find((item) => item.id === tagId);
  if (!tag) return false;
  if (tag.categoryId != null && task.categoryId != null && task.categoryId !== tag.categoryId) return false;

  return taskMatchesRules(task, tag.rules);
}

export function taskMatchesFilter(task: Task, filter: NavFilter, context: TaskFilterContext = {}) {
  const parsed = parseNavFilter(filter);

  if (parsed.type === "category") return taskMatchesCategory(task, parsed.id, context);
  if (parsed.type === "tag") return taskMatchesTag(task, parsed.id, context);

  switch (parsed.value) {
    case "completed":
      return task.status === "Completed";
    case "incomplete":
      return task.status !== "Completed";
    case "all":
    default:
      return true;
  }
}

export function filterTaskIds(
  tasks: Record<string, Task>,
  filter: NavFilter,
  context: TaskFilterContext = {}
) {
  return Object.keys(tasks).filter((gid) => taskMatchesFilter(tasks[gid], filter, context));
}

export function countTasks(
  tasks: Record<string, Task>,
  filter: NavFilter,
  context: TaskFilterContext = {}
) {
  return filterTaskIds(tasks, filter, context).length;
}
