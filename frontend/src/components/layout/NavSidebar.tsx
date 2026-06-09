import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronDown,
  ChevronRight,
  FolderCheck,
  FolderDown,
  FolderOpen,
  Tags,
} from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { IconPreview } from "@/components/ui/icon-picker";
import { UI_TEXT } from "@/core/locale";
import { MOTION_TOKENS } from "@/core/motion";
import {
  countTasks,
  createCategoryFilter,
  createTagFilter,
  type NavFilter,
} from "@/core/taskFilters";
import { UI_TOKENS } from "@/core/ui-tokens";
import { useDownloadStore } from "@/core/store/useDownloadStore";

export type { NavFilter } from "@/core/taskFilters";

interface NavSidebarProps {
  activeFilter: NavFilter;
  onFilterChange: (filter: NavFilter) => void;
}

type NavItemKind = "system" | "category" | "tag";
export default function NavSidebar({ activeFilter, onFilterChange }: NavSidebarProps) {
  const tasks = useDownloadStore((state) => state.tasks);
  const categories = useDownloadStore((state) => state.categories);
  const tags = useDownloadStore((state) => state.tags);
  const fetchCategoryTree = useDownloadStore((state) => state.fetchCategoryTree);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    all: false,
  });

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [categories]
  );

  const tagsByCategory = useMemo(() => {
    const grouped = new Map<number | null, typeof tags>();

    tags.forEach((tag) => {
      const key = tag.categoryId ?? null;
      grouped.set(key, [...(grouped.get(key) ?? []), tag]);
    });

    grouped.forEach((items, key) => {
      grouped.set(key, [...items].sort((a, b) => a.name.localeCompare(b.name)));
    });

    return grouped;
  }, [tags]);

  const unboundTags = tagsByCategory.get(null) ?? [];
  const filterContext = useMemo(() => ({ categories, tags }), [categories, tags]);

  useEffect(() => {
    fetchCategoryTree().catch((error) => {
      console.error("Failed to load navigation tree:", error);
    });
  }, [fetchCategoryTree]);

  const toggleGroup = (groupId: string) => {
    if ((groupId === "all" || groupId.startsWith("category:")) && categories.length === 0) {
      fetchCategoryTree(true).catch((error) => {
        console.error("Failed to refresh navigation tree:", error);
      });
    }

    setCollapsed((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const renderItem = ({
    id,
    label,
    icon,
    kind,
    depth = 0,
    expandable = false,
    collapsed: itemCollapsed = false,
    onToggle,
  }: {
    id: NavFilter;
    label: string;
    icon: React.ReactNode;
    kind: NavItemKind;
    depth?: number;
    expandable?: boolean;
    collapsed?: boolean;
    onToggle?: () => void;
  }) => {
    const isActive = activeFilter === id;
    const count = countTasks(tasks, id, filterContext);
    const paddingLeft = depth === 0 ? "pl-3" : depth === 1 ? "pl-8" : "pl-12";
    const activeWeight = "font-semibold";
    const inactiveWeight =
      kind === "tag" ? "font-normal text-muted-foreground" : "font-bold text-foreground";

    return (
      <button
        key={id}
        type="button"
        onClick={() => {
          onFilterChange(id);
          onToggle?.();
        }}
        className={`flex w-full items-center gap-3 rounded-lg py-2 pr-3 text-sm transition-all duration-150 ${paddingLeft} ${
          isActive ? activeWeight : inactiveWeight
        }`}
        style={{
          background: isActive ? "var(--primary)" : "transparent",
          color: isActive ? "var(--primary-foreground)" : undefined,
        }}
        onMouseEnter={(event) => {
          if (!isActive) event.currentTarget.style.background = "var(--secondary)";
        }}
        onMouseLeave={(event) => {
          if (!isActive) event.currentTarget.style.background = "transparent";
        }}
      >
        <span
          className="grid size-[18px] shrink-0 place-items-center"
          style={{
            color: isActive
              ? "var(--primary-foreground)"
              : kind === "tag"
                ? "var(--muted-foreground)"
                : "var(--primary)",
          }}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>

        {expandable ? (
          <span
            className="opacity-50 transition-opacity hover:opacity-90"
            style={{ color: isActive ? "var(--primary-foreground)" : "var(--muted-foreground)" }}
          >
            {itemCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
          </span>
        ) : null}

        <span
          className="ml-1 rounded-full px-1.5 py-0.5 font-mono text-xs tabular-nums"
          style={{
            background: isActive ? "rgba(255,255,255,0.2)" : "var(--secondary)",
            color: isActive ? "var(--primary-foreground)" : "var(--muted-foreground)",
          }}
        >
          {count}
        </span>
      </button>
    );
  };

  const renderAnimatedBranch = (key: string, children: React.ReactNode) => (
    <AnimatePresence initial={false}>
      {children ? (
        <motion.div
          key={key}
          initial="collapsed"
          animate="open"
          exit="collapsed"
          variants={MOTION_TOKENS.collapseVariants}
          transition={MOTION_TOKENS.layoutSpring}
          className="flex flex-col space-y-0.5"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return (
    <nav
      className="flex h-full min-h-0 flex-col border-r border-border bg-card pt-4 select-none"
      style={{ width: UI_TOKENS.sidebarWidth, minWidth: UI_TOKENS.sidebarWidth }}
    >
      <ScrollArea
        className="flex-1 px-2 pb-6"
        scrollbar="overlay"
        visibility="auto"
        viewportClassName="space-y-6"
      >
        <div className="flex flex-col space-y-0.5">
          {renderItem({
            id: "all",
            label: UI_TEXT.sidebar.all,
            icon: <FolderOpen className="size-[18px] shrink-0" />,
            kind: "system",
            expandable: sortedCategories.length > 0 || unboundTags.length > 0,
            collapsed: collapsed.all,
            onToggle: () => toggleGroup("all"),
          })}
          {renderAnimatedBranch(
            "all-children",
            !collapsed.all ? (
              <>
                {sortedCategories.map((category) => {
                  const categoryFilter = createCategoryFilter(category.id);
                  const categoryTags = tagsByCategory.get(category.id) ?? [];
                  const groupId = `category:${category.id}`;
                  const isCollapsed = collapsed[groupId] ?? false;

                  return (
                    <div key={category.id} className="flex flex-col space-y-0.5">
                      {renderItem({
                        id: categoryFilter,
                        label: category.name,
                        icon: <IconPreview value={category.icon} color={category.color} className="size-[18px]" />,
                        kind: "category",
                        depth: 1,
                        expandable: categoryTags.length > 0,
                        collapsed: isCollapsed,
                        onToggle: categoryTags.length > 0 ? () => toggleGroup(groupId) : undefined,
                      })}
                      {renderAnimatedBranch(
                        `${groupId}-children`,
                        categoryTags.length > 0 && !isCollapsed ? (
                          <>
                            {categoryTags.map((tag) =>
                              renderItem({
                                id: createTagFilter(tag.id),
                                label: tag.name,
                                icon: <IconPreview value={tag.icon} color={tag.color} className="size-[18px]" />,
                                kind: "tag",
                                depth: 2,
                              })
                            )}
                          </>
                        ) : null
                      )}
                    </div>
                  );
                })}
                {unboundTags.map((tag) =>
                  renderItem({
                    id: createTagFilter(tag.id),
                    label: tag.name,
                    icon: tag.icon ? (
                      <IconPreview value={tag.icon} color={tag.color} className="size-[18px]" />
                    ) : (
                      <Tags className="size-[18px] shrink-0" />
                    ),
                    kind: "tag",
                    depth: 1,
                  })
                )}
              </>
            ) : null
          )}
        </div>

        <div className="flex flex-col space-y-0.5">
          {renderItem({
            id: "completed",
            label: UI_TEXT.sidebar.completed,
            icon: <FolderCheck className="size-[18px] shrink-0" />,
            kind: "system",
          })}
        </div>

        <div className="flex flex-col space-y-0.5">
          {renderItem({
            id: "incomplete",
            label: UI_TEXT.sidebar.incomplete,
            icon: <FolderDown className="size-[18px] shrink-0" />,
            kind: "system",
          })}
        </div>
      </ScrollArea>
    </nav>
  );
}
