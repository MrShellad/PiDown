import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, Reorder, useDragControls } from "motion/react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FolderCheck,
  FolderDown,
  FolderOpen,
  Tags,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  Settings,
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
import { useDownloadStore, type Category, type Tag, type Task } from "@/core/store/useDownloadStore";
import { openDirectory } from "@/core/bridge/tauri-commands";
import { useAppSettingsStore } from "@/core/store/useAppSettingsStore";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CategoryEditDialog } from "@/components/common";

export type { NavFilter } from "@/core/taskFilters";

interface CategoryNavBranchProps {
  category: Category;
  categoryTags: Tag[];
  activeFilter: NavFilter;
  onFilterChange: (filter: NavFilter) => void;
  isCollapsed: boolean;
  onToggle: () => void;
  filterContext: { categories: Category[]; tags: Tag[] };
  tasks: Record<string, Task>;
  onEdit: () => void;
  onOpenFolder: () => void;
  onDelete: () => void;
  onAddCategory: () => void;
  renderItem: (args: {
    id: NavFilter;
    label: string;
    icon: React.ReactNode;
    kind: "system" | "category" | "tag";
    depth?: number;
    expandable?: boolean;
    collapsed?: boolean;
    onToggle?: () => void;
  }) => React.ReactNode;
  renderAnimatedBranch: (key: string, children: React.ReactNode) => React.ReactNode;
}

function CategoryNavBranch({
  category,
  categoryTags,
  activeFilter,
  onFilterChange,
  isCollapsed,
  onToggle,
  filterContext,
  tasks,
  onEdit,
  onOpenFolder,
  onDelete,
  onAddCategory,
  renderItem,
  renderAnimatedBranch,
}: CategoryNavBranchProps) {
  const dragControls = useDragControls();
  const categoryFilter = createCategoryFilter(category.id);
  const count = countTasks(tasks, categoryFilter, filterContext);
  const isActive = activeFilter === categoryFilter;
  const expandable = categoryTags.length > 0;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Reorder.Item
          value={category}
          dragListener={false}
          dragControls={dragControls}
          className="list-none overflow-visible flex flex-col space-y-0.5"
        >
          <div className="group relative flex items-center">
            {/* Hover-only drag handle */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="absolute left-[6px] cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20 flex size-5 items-center justify-center"
            >
              <GripVertical className="size-4" />
            </div>

            <button
              type="button"
              onClick={() => {
                onFilterChange(categoryFilter);
              }}
              className={`flex w-full items-center gap-3 rounded-lg py-2 pr-3 pl-7 text-sm transition-all duration-150 font-bold text-foreground`}
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
                  color: isActive ? "var(--primary-foreground)" : "var(--primary)",
                }}
              >
                <IconPreview value={category.icon} color={category.color} className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1 truncate text-left">{category.name}</span>

              {expandable ? (
                <span
                  className="opacity-50 transition-opacity hover:opacity-90 p-0.5"
                  style={{ color: isActive ? "var(--primary-foreground)" : "var(--muted-foreground)" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle();
                  }}
                >
                  {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
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
          </div>

          {renderAnimatedBranch(
            `category:${category.id}-children`,
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
        </Reorder.Item>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem onSelect={onEdit}>
          <Pencil className="size-4" />
          <span>编辑分类</span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={onOpenFolder}>
          <FolderOpen className="size-4" />
          <span>打开分类文件夹</span>
        </ContextMenuItem>
        <ContextMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 className="size-4" />
          <span>删除分类</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onAddCategory}>
          <Plus className="size-4" />
          <span>添加新分类</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

interface NavSidebarProps {
  activeFilter: NavFilter;
  onFilterChange: (filter: NavFilter) => void;
  onOpenSettings?: () => void;
}

type NavItemKind = "system" | "category" | "tag";
export default function NavSidebar({ activeFilter, onFilterChange, onOpenSettings }: NavSidebarProps) {
  const tasks = useDownloadStore((state) => state.tasks);
  const categories = useDownloadStore((state) => state.categories);
  const tags = useDownloadStore((state) => state.tags);
  const fetchCategoryTree = useDownloadStore((state) => state.fetchCategoryTree);
  const reorderCategories = useDownloadStore((state) => state.reorderCategories);
  const deleteCategory = useDownloadStore((state) => state.deleteCategory);

  const settings = useAppSettingsStore((state) => state.settings);
  const hideBorderAndBg = settings?.interface?.hide_border_and_bg ?? false;


  // Editor Modal State
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Delete Confirmation State
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);

  const handleRequestDelete = (category: Category) => {
    setCategoryToDelete(category);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (categoryToDelete) {
      await deleteCategory(categoryToDelete.id);
      setDeleteConfirmOpen(false);
      setCategoryToDelete(null);
    }
  };

  const handleOpenEdit = (category: Category) => {
    setEditingCategory(category);
    setEditorOpen(true);
  };

  const handleOpenCreate = () => {
    setEditingCategory(null);
    setEditorOpen(true);
  };

  const handleOpenFolder = async (category: Category) => {
    const defaultSaveDir = useAppSettingsStore.getState().settings?.download.default_save_dir;
    const pathToOpen = category.savePath || defaultSaveDir;
    if (pathToOpen) {
      try {
        await openDirectory(pathToOpen);
      } catch (err) {
        console.error("Failed to open category directory", err);
      }
    }
  };

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
    const paddingLeft = depth === 0 ? "pl-3" : depth === 1 ? "pl-6" : "pl-9";
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
      data-tauri-drag-region
      className="flex h-full min-h-0 flex-col bg-transparent pt-4 pb-4 pl-4 pr-0 select-none cursor-default"
      style={{ width: UI_TOKENS.sidebarWidth, minWidth: UI_TOKENS.sidebarWidth }}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-card text-card-foreground shadow-toolbar-glow">
        <ScrollArea
          className="flex-1 px-2 pt-4 pb-6"
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
                  <Reorder.Group
                    as="div"
                    axis="y"
                    values={sortedCategories}
                    onReorder={reorderCategories}
                    className="flex flex-col space-y-0.5"
                  >
                    {sortedCategories.map((category) => {
                      const categoryTags = tagsByCategory.get(category.id) ?? [];
                      const groupId = `category:${category.id}`;
                      const isCollapsed = collapsed[groupId] ?? false;

                      return (
                        <CategoryNavBranch
                          key={category.id}
                          category={category}
                          categoryTags={categoryTags}
                          activeFilter={activeFilter}
                          onFilterChange={onFilterChange}
                          isCollapsed={isCollapsed}
                          onToggle={() => toggleGroup(groupId)}
                          filterContext={filterContext}
                          tasks={tasks}
                          onEdit={() => handleOpenEdit(category)}
                          onOpenFolder={() => handleOpenFolder(category)}
                          onDelete={() => handleRequestDelete(category)}
                          onAddCategory={handleOpenCreate}
                          renderItem={renderItem}
                          renderAnimatedBranch={renderAnimatedBranch}
                        />
                      );
                    })}
                  </Reorder.Group>
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
        {hideBorderAndBg && (
          <div className="mt-auto shrink-0 border-t border-border/50 bg-secondary/20 p-2 flex justify-between items-center z-10">
            <span className="text-[11px] text-muted-foreground pl-2 font-mono tracking-wider">PiDownloader</span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onOpenSettings}
              className="text-muted-foreground hover:text-foreground cursor-pointer"
              title="打开设置"
            >
              <Settings className="size-4" />
            </Button>
          </div>
        )}
      </div>

      <CategoryEditDialog
        key={editingCategory?.id ?? "new"}
        open={editorOpen}
        category={editingCategory}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditingCategory(null);
        }}
      />

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent variant="alert" size="sm" showCloseButton={false}>
          <DialogHeader>
            <div className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <AlertTriangle className="size-5" />
            </div>
            <DialogTitle className="text-destructive">删除分类</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <DialogDescription>
              确定要删除分类“{categoryToDelete?.name}”吗？此操作无法撤销。
            </DialogDescription>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteConfirmOpen(false);
                setCategoryToDelete(null);
              }}
            >
              取消
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </nav>
  );
}
