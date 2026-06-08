import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";

import { ScrollArea } from "@/components/ui/scroll-area";
import { openSettingsWindow } from "@/core/bridge/tauri-commands";
import { UI_TEXT } from "@/core/locale";
import { filterTaskIds, parseNavFilter, type NavFilter } from "@/core/taskFilters";
import { useDownloadStore } from "@/core/store/useDownloadStore";
import DownloadToolbar from "./DownloadToolbar";
import NewTaskModal from "./NewTaskModal";
import TaskListHeader from "./TaskListHeader";
import TaskTableRow from "./TaskTableRow";

interface TaskListDashboardProps {
  activeFilter: NavFilter;
}

function getFilterLabel(
  activeFilter: NavFilter,
  categories: ReturnType<typeof useDownloadStore.getState>["categories"],
  tags: ReturnType<typeof useDownloadStore.getState>["tags"]
) {
  const parsed = parseNavFilter(activeFilter);

  if (parsed.type === "category") {
    return categories.find((category) => category.id === parsed.id)?.name ?? UI_TEXT.sidebar.all;
  }

  if (parsed.type === "tag") {
    const tag = tags.find((item) => item.id === parsed.id);
    if (!tag) return UI_TEXT.sidebar.all;

    const category = categories.find((item) => item.id === tag.categoryId);
    return category ? `${category.name} / ${tag.name}` : tag.name;
  }

  switch (parsed.value) {
    case "completed":
      return UI_TEXT.sidebar.completed;
    case "incomplete":
      return UI_TEXT.sidebar.incomplete;
    case "all":
    default:
      return UI_TEXT.sidebar.all;
  }
}

export default function TaskListDashboard({ activeFilter }: TaskListDashboardProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const tasks = useDownloadStore((state) => state.tasks);
  const categories = useDownloadStore((state) => state.categories);
  const tags = useDownloadStore((state) => state.tags);
  const clearCompleted = useDownloadStore((state) => state.clearCompleted);
  const filterContext = useMemo(() => ({ categories, tags }), [categories, tags]);

  const filteredGids = useMemo(
    () => filterTaskIds(tasks, activeFilter, filterContext),
    [tasks, activeFilter, filterContext]
  );
  const filterLabel = useMemo(
    () => getFilterLabel(activeFilter, categories, tags),
    [activeFilter, categories, tags]
  );
  const hasCompleted = filteredGids.some((gid) => tasks[gid].status === "Completed");

  return (
    <div className="flex flex-1 flex-col gap-5 p-6 select-none">
      <DownloadToolbar
        canClearCompleted={hasCompleted}
        onCreateTask={() => setModalOpen(true)}
        onClearCompleted={clearCompleted}
        onOpenSettings={() => openSettingsWindow().catch(console.error)}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 items-center justify-between">
          <span className="text-sm font-semibold leading-5 text-muted-foreground">
            {filterLabel} ({filteredGids.length})
          </span>
        </div>
        <ScrollArea
          className="flex-1"
          orientation="both"
          scrollbar="overlay"
          visibility="auto"
          gutter="none"
        >
          <div className="flex min-w-max flex-col gap-2 pb-2 pr-3">
            <TaskListHeader disabled={filteredGids.length === 0} />
            {filteredGids.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed border-[var(--border)] font-mono text-sm text-[var(--muted-foreground)]">
                <span className="text-lg">...</span>
                <span>
                  {activeFilter === "all"
                    ? UI_TEXT.dashboard.emptyTasks
                    : UI_TEXT.dashboard.emptyFilterTasks}
                </span>
                {activeFilter === "all" && (
                  <span className="text-xs opacity-60">{UI_TEXT.dashboard.emptyTip}</span>
                )}
              </div>
            ) : (
              <AnimatePresence>
                {filteredGids.map((gid) => (
                  <TaskTableRow key={gid} gid={gid} />
                ))}
              </AnimatePresence>
            )}
          </div>
        </ScrollArea>
      </div>

      <NewTaskModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}
