import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion, Reorder } from "motion/react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { UI_TEXT } from "@/core/locale";
import type { ExternalDownloadRequest } from "@/core/bridge/external-download";
import { filterTaskIds, parseNavFilter, type NavFilter } from "@/core/taskFilters";
import { useDownloadStore } from "@/core/store/useDownloadStore";
import type { Task } from "@/core/store/useDownloadStore";
import type { TaskTableColumnId } from "@/core/store/useTaskTableStore";
import { useTaskTableStore } from "@/core/store/useTaskTableStore";
import {
  getTaskTableShellMinWidth,
  getTaskTableWidth,
  TASK_LIST_EDGE_SAFE_PADDING,
} from "@/core/taskTableLayout";
import DownloadToolbar from "./DownloadToolbar";
import NewTaskModal from "./NewTaskModal";
import TaskDeleteConfirmDialog from "./TaskDeleteConfirmDialog";
import TaskDetailsDrawer from "./TaskDetailsDrawer";
import TaskListHeader from "./TaskListHeader";
import TaskTableRow from "./TaskTableRow";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TaskListDashboardProps {
  activeFilter: NavFilter;
}

const TASK_ROW_HEIGHT = 68;
const TASK_ROW_GAP = 8;
const TASK_ROW_STRIDE = TASK_ROW_HEIGHT + TASK_ROW_GAP;
const TASK_LIST_OVERSCAN = 6;
const TASK_DELETE_EXIT_MS = 260;

const HEADER_HEIGHT = 52;
const HEADER_GAP = 8;
const HEADER_OFFSET = HEADER_HEIGHT + HEADER_GAP;

const PAGINATION_HEIGHT = 48;
const PAGINATION_GAP = 8;
const PAGINATION_OFFSET = PAGINATION_HEIGHT + PAGINATION_GAP;
const TOTAL_OFFSET = HEADER_OFFSET + PAGINATION_OFFSET;

const STATUS_SORT_WEIGHT: Record<Task["status"], number> = {
  Downloading: 0,
  Pending: 1,
  Paused: 2,
  Failed: 3,
  Completed: 4,
  Cancelled: 5,
};

function compareText(a: string, b: string) {
  return a.localeCompare(b, "zh-CN", { numeric: true, sensitivity: "base" });
}

function compareTaskByColumn(a: Task, b: Task, columnId: TaskTableColumnId) {
  switch (columnId) {
    case "name":
      return compareText(a.name, b.name);
    case "size":
      return (a.totalBytes || a.downloadedBytes) - (b.totalBytes || b.downloadedBytes);
    case "status":
      return STATUS_SORT_WEIGHT[a.status] - STATUS_SORT_WEIGHT[b.status];
    case "speed":
      return (a.speedBps ?? 0) - (b.speedBps ?? 0);
    case "eta":
      return (a.etaSeconds ?? Number.POSITIVE_INFINITY) - (b.etaSeconds ?? Number.POSITIVE_INFINITY);
    case "createdAt":
      return (a.createdAt ?? 0) - (b.createdAt ?? 0);
    case "tags":
      return compareText(
        a.tags?.map((tag) => tag.name).join(", ") ?? "",
        b.tags?.map((tag) => tag.name).join(", ") ?? ""
      );
    default:
      return 0;
  }
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [externalDownloadRequest, setExternalDownloadRequest] =
    useState<ExternalDownloadRequest | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [animatedTaskIds, setAnimatedTaskIds] = useState<Set<string>>(() => new Set());
  const [exitingTaskIds, setExitingTaskIds] = useState<Set<string>>(() => new Set());
  const [exitingTaskSnapshots, setExitingTaskSnapshots] = useState<Record<string, Task>>({});
  const [exitingTaskPositions, setExitingTaskPositions] = useState<Record<string, number>>({});
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(() => new Set());
  const [detailsOpen, setDetailsOpen] = useState(false);
  const rowViewportRef = useRef<HTMLDivElement | null>(null);
  const previousTasksRef = useRef<Record<string, Task>>({});
  const previousFilteredGidsRef = useRef<string[]>([]);
  const animationTimeoutsRef = useRef<number[]>([]);

  const tasks = useDownloadStore((state) => state.tasks);
  const categories = useDownloadStore((state) => state.categories);
  const tags = useDownloadStore((state) => state.tags);
  const toggleTask = useDownloadStore((state) => state.toggleTask);
  const removeTask = useDownloadStore((state) => state.removeTask);
  const columns = useTaskTableStore((state) => state.columns);
  const sort = useTaskTableStore((state) => state.sort);
  const pageSize = useTaskTableStore((state) => state.pageSize);
  const setPageSize = useTaskTableStore((state) => state.setPageSize);
  const filterContext = useMemo(() => ({ categories, tags }), [categories, tags]);

  const [currentPage, setCurrentPage] = useState(1);

  const filteredGids = useMemo(
    () => {
      const gids = filterTaskIds(tasks, activeFilter, filterContext);
      if (!sort) return gids;

      return gids
        .map((gid, index) => ({ gid, index }))
        .sort((a, b) => {
          const taskA = tasks[a.gid];
          const taskB = tasks[b.gid];
          if (!taskA || !taskB) return a.index - b.index;

          const result = compareTaskByColumn(taskA, taskB, sort.id);
          const directedResult = sort.direction === "asc" ? result : -result;
          return directedResult || a.index - b.index;
        })
        .map((item) => item.gid);
    },
    [tasks, activeFilter, filterContext, sort]
  );

  const totalPages = Math.max(1, Math.ceil(filteredGids.length / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [filteredGids.length, pageSize, totalPages, currentPage]);

  const paginatedFilteredGids = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredGids.slice(startIndex, endIndex);
  }, [filteredGids, currentPage, pageSize]);

  const renderedGids = useMemo(() => {
    if (exitingTaskIds.size === 0) return paginatedFilteredGids;

    const nextGids = [...paginatedFilteredGids];

    for (const gid of exitingTaskIds) {
      if (nextGids.includes(gid) || !exitingTaskSnapshots[gid]) continue;

      const preferredIndex = exitingTaskPositions[gid] ?? nextGids.length;
      nextGids.splice(Math.min(preferredIndex, nextGids.length), 0, gid);
    }

    return nextGids;
  }, [paginatedFilteredGids, exitingTaskIds, exitingTaskPositions, exitingTaskSnapshots]);

  const filterLabel = useMemo(
    () => getFilterLabel(activeFilter, categories, tags),
    [activeFilter, categories, tags]
  );
  const tableShellMinWidth = getTaskTableShellMinWidth(columns);
  const tableWidth = getTaskTableWidth(columns);
  const selectedFilteredCount = paginatedFilteredGids.filter((gid) => selectedTaskIds.has(gid)).length;
  const allFilteredSelected =
    paginatedFilteredGids.length > 0 && selectedFilteredCount === paginatedFilteredGids.length;
  const headerChecked = allFilteredSelected
    ? true
    : selectedFilteredCount > 0
      ? "indeterminate"
      : false;
  const visibleRange = useMemo(() => {
    if (renderedGids.length === 0) {
      return { startIndex: 0, endIndex: 0 };
    }

    const adjustedScrollTop = Math.max(0, scrollTop - HEADER_GAP);
    const startIndex = Math.max(0, Math.floor(adjustedScrollTop / TASK_ROW_STRIDE) - TASK_LIST_OVERSCAN);
    const visibleCount = Math.ceil(viewportHeight / TASK_ROW_STRIDE) + TASK_LIST_OVERSCAN * 2;
    const endIndex = Math.min(renderedGids.length, startIndex + visibleCount);

    return { startIndex, endIndex };
  }, [renderedGids.length, scrollTop, viewportHeight]);
  const visibleGids = renderedGids.slice(visibleRange.startIndex, visibleRange.endIndex);
  const virtualHeight =
    renderedGids.length === 0
      ? 0
      : renderedGids.length * TASK_ROW_HEIGHT + Math.max(0, renderedGids.length - 1) * TASK_ROW_GAP;
  const hasScrollbar = virtualHeight + HEADER_OFFSET > viewportHeight;
  const virtualTopSpacer = visibleRange.startIndex * TASK_ROW_STRIDE;
  const primarySelectedGid = useMemo(() => {
    for (const gid of selectedTaskIds) {
      if (tasks[gid]) return gid;
    }
    return filteredGids.find((gid) => tasks[gid]) ?? null;
  }, [filteredGids, selectedTaskIds, tasks]);
  const detailsTask = primarySelectedGid ? tasks[primarySelectedGid] : null;
  const detailsCategory =
    detailsTask?.categoryId == null
      ? null
      : categories.find((category) => category.id === detailsTask.categoryId) ?? null;

  useEffect(() => {
    let disposed = false;
    let unlistenExternalDownload: (() => void) | undefined;

    listen<ExternalDownloadRequest>("external-download-request", (event) => {
      setExternalDownloadRequest(event.payload);
      setModalOpen(true);
    })
      .then((unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }

        unlistenExternalDownload = unlisten;
      })
      .catch((error) => {
        console.error("Failed to listen external download requests:", error);
      });

    return () => {
      disposed = true;
      unlistenExternalDownload?.();
    };
  }, []);

  useEffect(() => {
    const viewport = rowViewportRef.current;
    if (!viewport) return;

    const updateViewportHeight = () => {
      setViewportHeight(viewport.clientHeight);
    };

    updateViewportHeight();
    const observer = new ResizeObserver(updateViewportHeight);
    observer.observe(viewport);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    window.queueMicrotask(() => {
      setScrollTop((current) => Math.min(current, Math.max(0, virtualHeight + TOTAL_OFFSET - viewportHeight)));
    });
  }, [virtualHeight, viewportHeight]);

  useEffect(() => {
    const previousTasks = previousTasksRef.current;
    const previousTaskIds = new Set(Object.keys(previousTasks));
    const nextTaskIds = new Set(Object.keys(tasks));
    const createdTaskIds = [...nextTaskIds].filter((gid) => !previousTaskIds.has(gid));
    const deletedTaskIds = [...previousTaskIds].filter((gid) => !nextTaskIds.has(gid));

    if (createdTaskIds.length > 0) {
      setAnimatedTaskIds((current) => {
        const next = new Set(current);
        for (const gid of createdTaskIds) next.add(gid);
        return next;
      });

      const timeoutId = window.setTimeout(() => {
        setAnimatedTaskIds((current) => {
          const next = new Set(current);
          for (const gid of createdTaskIds) next.delete(gid);
          return next;
        });
      }, 900);

      animationTimeoutsRef.current.push(timeoutId);
    }

    if (deletedTaskIds.length > 0) {
      const previousFilteredGids = previousFilteredGidsRef.current;
      const nextSnapshots: Record<string, Task> = {};
      const nextPositions: Record<string, number> = {};

      for (const gid of deletedTaskIds) {
        const snapshot = previousTasks[gid];
        const previousIndex = previousFilteredGids.indexOf(gid);
        if (!snapshot || previousIndex < 0) continue;

        nextSnapshots[gid] = snapshot;
        nextPositions[gid] = previousIndex;
      }

      const exitGids = Object.keys(nextSnapshots);

      if (exitGids.length > 0) {
        setExitingTaskSnapshots((current) => ({ ...current, ...nextSnapshots }));
        setExitingTaskPositions((current) => ({ ...current, ...nextPositions }));
        setExitingTaskIds((current) => {
          const next = new Set(current);
          for (const gid of exitGids) next.add(gid);
          return next;
        });

        const timeoutId = window.setTimeout(() => {
          setExitingTaskIds((current) => {
            const next = new Set(current);
            for (const gid of exitGids) next.delete(gid);
            return next;
          });
          setExitingTaskSnapshots((current) => {
            const next = { ...current };
            for (const gid of exitGids) delete next[gid];
            return next;
          });
          setExitingTaskPositions((current) => {
            const next = { ...current };
            for (const gid of exitGids) delete next[gid];
            return next;
          });
        }, TASK_DELETE_EXIT_MS);

        animationTimeoutsRef.current.push(timeoutId);
      }
    }

    previousTasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    previousFilteredGidsRef.current = filteredGids;
  }, [filteredGids]);

  useEffect(() => {
    const timeoutIds = animationTimeoutsRef.current;

    return () => {
      for (const timeoutId of timeoutIds) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  useEffect(() => {
    const visibleTaskIds = new Set(filteredGids);
    window.queueMicrotask(() => {
      setSelectedTaskIds((current) => {
        const next = new Set([...current].filter((gid) => visibleTaskIds.has(gid)));
        return next.size === current.size ? current : next;
      });
    });
  }, [filteredGids]);

  const toggleTaskSelection = (gid: string) => {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(gid)) {
        next.delete(gid);
      } else {
        next.add(gid);
      }
      return next;
    });
  };

  const selectSingleTask = (gid: string) => {
    setSelectedTaskIds(new Set([gid]));
  };

  const toggleTaskDetails = (gid: string) => {
    if (detailsOpen && primarySelectedGid === gid) {
      setDetailsOpen(false);
      return;
    }

    selectSingleTask(gid);
    setDetailsOpen(true);
  };

  const toggleAllFilteredTasks = (checked: boolean) => {
    setSelectedTaskIds(() => (checked ? new Set(paginatedFilteredGids) : new Set()));
  };

  const selectedTaskCount = selectedTaskIds.size;
  const singleTaskName = useMemo(() => {
    if (selectedTaskIds.size === 1) {
      const gid = [...selectedTaskIds][0];
      return tasks[gid]?.name;
    }
    return undefined;
  }, [selectedTaskIds, tasks]);
  const selectedTasks = [...selectedTaskIds]
    .map((gid) => tasks[gid])
    .filter((task): task is Task => Boolean(task));
  const selectedDownloadableGids = selectedTasks
    .filter((task) => task.status === "Downloading")
    .map((task) => task.gid);
  const selectedResumableGids = selectedTasks
    .filter((task) => task.status === "Paused" || task.status === "Failed")
    .map((task) => task.gid);

  const pauseSelectedTasks = () => {
    void Promise.all(selectedDownloadableGids.map((gid) => toggleTask(gid)));
  };

  const resumeSelectedTasks = () => {
    void Promise.all(selectedResumableGids.map((gid) => toggleTask(gid)));
  };

  const deleteSelectedTasks = (deleteLocalFiles: boolean) => {
    const gids = [...selectedTaskIds];
    setSelectedTaskIds(new Set());
    void Promise.all(gids.map((gid) => removeTask(gid, deleteLocalFiles)));
  };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-x-auto overflow-y-hidden pt-4 pb-4 pr-4 pl-4 select-none scrollbar-interactive scrollbar-overlay scrollbar-auto-hide"
      style={{ overflowX: "overlay" as React.CSSProperties["overflowX"] }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 px-0 pt-0" style={{ minWidth: tableShellMinWidth }}>
          <div className="shrink-0 px-3">
            <DownloadToolbar
              selectedTaskCount={selectedTaskCount}
              selectedPauseCount={selectedDownloadableGids.length}
              selectedResumeCount={selectedResumableGids.length}
              onCreateTask={() => setModalOpen(true)}
              onPauseSelected={pauseSelectedTasks}
              onResumeSelected={resumeSelectedTasks}
              onDeleteSelected={() => setDeleteConfirmOpen(true)}
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex shrink-0 items-center justify-between px-3">
              <span className="text-sm font-semibold leading-5 text-muted-foreground">
                {filterLabel} ({filteredGids.length})
              </span>
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div
                className="flex min-h-0 flex-1 flex-col overflow-visible rounded-lg relative"
                style={{
                  width: "100%",
                  minWidth: tableShellMinWidth,
                  paddingLeft: TASK_LIST_EDGE_SAFE_PADDING,
                  paddingRight: TASK_LIST_EDGE_SAFE_PADDING,
                }}
              >
                <div
                  className="absolute top-0 z-20"
                  style={{
                    width: `calc(100% - ${TASK_LIST_EDGE_SAFE_PADDING * 2}px)`,
                    left: `${TASK_LIST_EDGE_SAFE_PADDING}px`,
                  }}
                >
                  <TaskListHeader
                    checked={headerChecked}
                    disabled={filteredGids.length === 0}
                    embedded
                    onCheckedChange={toggleAllFilteredTasks}
                  />
                </div>
                <div
                  ref={rowViewportRef}
                  className={`relative mt-2 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-14 pt-0 scrollbar-interactive scrollbar-overlay scrollbar-auto-hide scroll-smooth ${
                    filteredGids.length === 0 ? "flex flex-col" : ""
                  }`}
                  style={{
                    marginLeft: -TASK_LIST_EDGE_SAFE_PADDING,
                    marginRight: -TASK_LIST_EDGE_SAFE_PADDING,
                    paddingLeft: TASK_LIST_EDGE_SAFE_PADDING,
                    paddingRight: TASK_LIST_EDGE_SAFE_PADDING,
                    overflowY: "overlay" as React.CSSProperties["overflowY"],
                    clipPath: `polygon(${TASK_LIST_EDGE_SAFE_PADDING + 10}px 0px, calc(100% - ${TASK_LIST_EDGE_SAFE_PADDING + 10}px) 0px, calc(100% - ${TASK_LIST_EDGE_SAFE_PADDING}px) 10px, 100% 10px, 100% calc(100% - 10px), calc(100% - ${TASK_LIST_EDGE_SAFE_PADDING}px) calc(100% - 10px), calc(100% - ${TASK_LIST_EDGE_SAFE_PADDING + 10}px) 100%, ${TASK_LIST_EDGE_SAFE_PADDING + 10}px 100%, ${TASK_LIST_EDGE_SAFE_PADDING}px calc(100% - 10px), 0px calc(100% - 10px), 0px 10px, ${TASK_LIST_EDGE_SAFE_PADDING}px 10px)`,
                  }}
                  onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
                >
                  <div className="h-[52px] shrink-0" />
                  <div className="h-2 shrink-0" />
                  {filteredGids.length === 0 ? (
                    <motion.div
                      className="flex flex-1 flex-col items-center justify-center gap-5 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-8 shadow-lg text-center"
                      style={{ width: "100%", minWidth: tableWidth }}
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                      <div className="flex flex-col items-center gap-2 max-w-sm">
                        <span className="text-4xl text-primary/80">📥</span>
                        <h3 className="text-base font-semibold text-foreground mt-2">
                          {activeFilter === "all"
                            ? UI_TEXT.dashboard.emptyTasks
                            : UI_TEXT.dashboard.emptyFilterTasks}
                        </h3>
                        {activeFilter === "all" && (
                          <p className="text-xs text-muted-foreground opacity-80 leading-normal">
                            {UI_TEXT.dashboard.emptyTip}
                          </p>
                        )}
                      </div>

                      {activeFilter === "all" && (
                        <Button
                          onClick={() => setModalOpen(true)}
                          className="mt-2 flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-5 py-2.5 h-10 rounded-lg shadow-md hover:shadow-lg active:scale-95 transition-all duration-150"
                        >
                          <Plus className="h-4 w-4" />
                          <span>新建下载任务</span>
                        </Button>
                      )}
                    </motion.div>
                  ) : (
                    <div className="relative" style={{ width: hasScrollbar ? "calc(100% + 0.375rem)" : "100%", minWidth: tableWidth, height: virtualHeight }}>
                      <div aria-hidden="true" style={{ height: virtualTopSpacer }} />
                      <Reorder.Group
                        as="div"
                        axis="y"
                        values={visibleGids}
                        onReorder={() => undefined}
                        className="flex flex-col gap-2"
                        style={{ width: "100%", minWidth: tableWidth }}
                      >
                        <AnimatePresence initial={false} mode="popLayout">
                           {visibleGids.map((gid) => {
                             const shouldAnimate = animatedTaskIds.has(gid);
                             const isExiting = exitingTaskIds.has(gid);
                             const taskSnapshot = exitingTaskSnapshots[gid];
 
                             return (
                               <Reorder.Item
                                 key={gid}
                                 as="div"
                                 value={gid}
                                 dragListener={false}
                               className="list-none overflow-hidden"
                                 style={{
                                   width: "100%",
                                   minWidth: tableWidth,
                                   pointerEvents: isExiting ? "none" : "auto",
                                 }}
                                layout="position"
                                initial={shouldAnimate ? { opacity: 0, height: TASK_ROW_HEIGHT, y: 12 } : false}
                                animate={{
                                  opacity: isExiting ? 0 : 1,
                                  height: isExiting ? 0 : TASK_ROW_HEIGHT,
                                  y: 0,
                                  x: isExiting ? 16 : 0,
                                  scale: isExiting ? 0.985 : 1,
                                }}
                                exit={{
                                  opacity: 0,
                                  height: 0,
                                  marginTop: 0,
                                  marginBottom: 0,
                                  scale: 0.985,
                                  x: 16,
                                }}
                                transition={{
                                  opacity: { duration: 0.16, ease: "easeOut" },
                                  x: { duration: 0.18, ease: "easeOut" },
                                  scale: { duration: 0.18, ease: "easeOut" },
                                  height: {
                                    duration: TASK_DELETE_EXIT_MS / 1000,
                                    ease: [0.22, 1, 0.36, 1],
                                  },
                                  layout: {
                                    type: "spring",
                                    stiffness: 420,
                                    damping: 34,
                                    mass: 0.55,
                                  },
                                }}
                              >
                                <TaskTableRow
                                  gid={gid}
                                  animateEntry={shouldAnimate}
                                  taskSnapshot={taskSnapshot}
                                  selected={!isExiting && selectedTaskIds.has(gid)}
                                  detailsOpen={detailsOpen && primarySelectedGid === gid}
                                  onSelect={isExiting ? undefined : toggleTaskSelection}
                                  onContextSelect={isExiting ? undefined : selectSingleTask}
                                  onOpenDetails={isExiting ? undefined : toggleTaskDetails}
                                />
                              </Reorder.Item>
                            );
                          })}
                        </AnimatePresence>
                      </Reorder.Group>
                    </div>
                  )}
                </div>

                {/* Pagination Controls */}
                <div
                  className="absolute bottom-0 z-20"
                  style={{
                    width: `calc(100% - ${TASK_LIST_EDGE_SAFE_PADDING * 2}px)`,
                    left: `${TASK_LIST_EDGE_SAFE_PADDING}px`,
                  }}
                >
                  <div className="flex h-12 items-center justify-between rounded-lg bg-card/80 backdrop-blur-md shadow-md border border-border/40 px-4 text-xs text-muted-foreground select-none">
                    {/* Left: Range Info */}
                    <div className="flex items-center gap-1.5 font-medium">
                      <span>显示</span>
                      <span className="font-semibold text-foreground">
                        {Math.min(filteredGids.length, (currentPage - 1) * pageSize + 1)}
                      </span>
                      <span>-</span>
                      <span className="font-semibold text-foreground">
                        {Math.min(filteredGids.length, currentPage * pageSize)}
                      </span>
                      <span>条，共</span>
                      <span className="font-semibold text-foreground">{filteredGids.length}</span>
                      <span>条</span>
                    </div>

                    {/* Middle: Page navigation buttons */}
                    {totalPages > 1 && (
                      <Pagination className="mx-0 w-auto">
                        <PaginationContent className="gap-1">
                          <PaginationItem>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-md hover:bg-muted"
                              disabled={currentPage === 1}
                              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                          </PaginationItem>

                          {/* Page Numbers */}
                          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                            const isNearCurrent = Math.abs(page - currentPage) <= 1;
                            const isEdge = page === 1 || page === totalPages;
                            if (totalPages > 7 && !isNearCurrent && !isEdge) {
                              if (page === 2 || page === totalPages - 1) {
                                return (
                                  <PaginationItem key={page}>
                                    <PaginationEllipsis className="h-8 w-8" />
                                  </PaginationItem>
                                );
                              }
                              return null;
                            }

                            return (
                              <PaginationItem key={page}>
                                <Button
                                  variant={currentPage === page ? "outline" : "ghost"}
                                  size="icon"
                                  className={`h-8 w-8 rounded-md text-xs transition-colors ${
                                    currentPage === page
                                      ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
                                      : "hover:bg-muted"
                                  }`}
                                  onClick={() => setCurrentPage(page)}
                                >
                                  {page}
                                </Button>
                              </PaginationItem>
                            );
                          })}

                          <PaginationItem>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-md hover:bg-muted"
                              disabled={currentPage === totalPages}
                              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    )}

                    {/* Right: Page Size Dropdown */}
                    <div className="flex items-center gap-2">
                      <span>单页显示</span>
                      <Select
                        value={String(pageSize)}
                        onValueChange={(val) => {
                          const size = parseInt(val, 10);
                          setPageSize(size);
                          setCurrentPage(1);
                        }}
                      >
                        <SelectTrigger className="h-8 w-[70px] rounded-md border-border/60 bg-background/50 px-2 text-xs font-semibold hover:bg-muted/50 transition-colors">
                          <SelectValue placeholder={String(pageSize)} />
                        </SelectTrigger>
                        <SelectContent className="min-w-[70px] border-border/80 bg-popover/95 backdrop-blur-md">
                          {[5, 10, 15, 20, 30, 40].map((size) => (
                            <SelectItem key={size} value={String(size)} className="text-xs">
                              {size}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
      </div>

      <NewTaskModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initialRequest={externalDownloadRequest}
        onInitialRequestConsumed={() => setExternalDownloadRequest(null)}
      />
      <TaskDeleteConfirmDialog
        open={deleteConfirmOpen}
        taskCount={selectedTaskCount}
        taskName={singleTaskName}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={deleteSelectedTasks}
      />
      <TaskDetailsDrawer
        open={detailsOpen && Boolean(detailsTask)}
        task={detailsTask}
        category={detailsCategory}
        selectedTaskCount={selectedTaskCount}
        onOpenChange={setDetailsOpen}
        onDeleteClick={(gid) => {
          setSelectedTaskIds(new Set([gid]));
          setDeleteConfirmOpen(true);
        }}
      />
    </div>
  );
}
