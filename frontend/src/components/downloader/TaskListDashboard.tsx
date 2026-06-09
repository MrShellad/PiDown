import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion, Reorder } from "motion/react";

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

interface TaskListDashboardProps {
  activeFilter: NavFilter;
}

const TASK_ROW_HEIGHT = 68;
const TASK_ROW_GAP = 8;
const TASK_ROW_STRIDE = TASK_ROW_HEIGHT + TASK_ROW_GAP;
const TASK_LIST_OVERSCAN = 6;
const TASK_DELETE_EXIT_MS = 260;

const STATUS_SORT_WEIGHT: Record<Task["status"], number> = {
  Downloading: 0,
  Pending: 1,
  Paused: 2,
  Failed: 3,
  Completed: 4,
  Cancelled: 5,
};

function parseSpeedBytesPerSecond(value: string) {
  const match = value.trim().match(/^([\d.]+)\s*([KMGT]?i?B)?\/s$/i);
  if (!match) return 0;

  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) return 0;

  const unit = (match[2] ?? "B").toLowerCase();
  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1000,
    mb: 1000 ** 2,
    gb: 1000 ** 3,
    tb: 1000 ** 4,
    kib: 1024,
    mib: 1024 ** 2,
    gib: 1024 ** 3,
    tib: 1024 ** 4,
  };

  return amount * (multipliers[unit] ?? 1);
}

function parseEtaSeconds(value: string) {
  const parts = value.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => !Number.isFinite(part))) return Number.POSITIVE_INFINITY;

  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number.POSITIVE_INFINITY;
}

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
      return parseSpeedBytesPerSecond(a.speed) - parseSpeedBytesPerSecond(b.speed);
    case "eta":
      return parseEtaSeconds(a.eta) - parseEtaSeconds(b.eta);
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
  const filterContext = useMemo(() => ({ categories, tags }), [categories, tags]);

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
  const renderedGids = useMemo(() => {
    if (exitingTaskIds.size === 0) return filteredGids;

    const nextGids = [...filteredGids];

    for (const gid of exitingTaskIds) {
      if (nextGids.includes(gid) || !exitingTaskSnapshots[gid]) continue;

      const preferredIndex = exitingTaskPositions[gid] ?? nextGids.length;
      nextGids.splice(Math.min(preferredIndex, nextGids.length), 0, gid);
    }

    return nextGids;
  }, [filteredGids, exitingTaskIds, exitingTaskPositions, exitingTaskSnapshots]);
  const filterLabel = useMemo(
    () => getFilterLabel(activeFilter, categories, tags),
    [activeFilter, categories, tags]
  );
  const tableShellMinWidth = getTaskTableShellMinWidth(columns);
  const tableWidth = getTaskTableWidth(columns);
  const selectedFilteredCount = filteredGids.filter((gid) => selectedTaskIds.has(gid)).length;
  const allFilteredSelected =
    filteredGids.length > 0 && selectedFilteredCount === filteredGids.length;
  const headerChecked = allFilteredSelected
    ? true
    : selectedFilteredCount > 0
      ? "indeterminate"
      : false;
  const visibleRange = useMemo(() => {
    if (renderedGids.length === 0) {
      return { startIndex: 0, endIndex: 0 };
    }

    const startIndex = Math.max(0, Math.floor(scrollTop / TASK_ROW_STRIDE) - TASK_LIST_OVERSCAN);
    const visibleCount = Math.ceil(viewportHeight / TASK_ROW_STRIDE) + TASK_LIST_OVERSCAN * 2;
    const endIndex = Math.min(renderedGids.length, startIndex + visibleCount);

    return { startIndex, endIndex };
  }, [renderedGids.length, scrollTop, viewportHeight]);
  const visibleGids = renderedGids.slice(visibleRange.startIndex, visibleRange.endIndex);
  const virtualHeight =
    renderedGids.length === 0
      ? 0
      : renderedGids.length * TASK_ROW_HEIGHT + Math.max(0, renderedGids.length - 1) * TASK_ROW_GAP;
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
      setScrollTop((current) => Math.min(current, Math.max(0, virtualHeight - viewportHeight)));
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
    setSelectedTaskIds(() => (checked ? new Set(filteredGids) : new Set()));
  };

  const selectedTaskCount = selectedTaskIds.size;
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
    <div className="flex min-h-0 flex-1 flex-col overflow-x-auto overflow-y-hidden p-4 select-none scrollbar-interactive scrollbar-overlay scrollbar-auto-hide">
      <div className="flex min-h-0 flex-1 flex-col gap-5 px-2 pt-2" style={{ minWidth: tableShellMinWidth }}>
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

            <div className="flex min-h-0 min-w-max flex-1 flex-col">
              <div
                className="flex min-h-0 flex-1 flex-col overflow-visible rounded-lg"
                style={{
                  width: tableShellMinWidth,
                  paddingLeft: TASK_LIST_EDGE_SAFE_PADDING,
                  paddingRight: TASK_LIST_EDGE_SAFE_PADDING,
                }}
              >
                <TaskListHeader
                  checked={headerChecked}
                  disabled={filteredGids.length === 0}
                  embedded
                  onCheckedChange={toggleAllFilteredTasks}
                />
                <div
                  ref={rowViewportRef}
                  className="relative mt-2 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-4 pt-1 scrollbar-interactive scrollbar-overlay scrollbar-auto-hide"
                  style={{
                    marginLeft: -TASK_LIST_EDGE_SAFE_PADDING,
                    marginRight: -TASK_LIST_EDGE_SAFE_PADDING,
                    paddingLeft: TASK_LIST_EDGE_SAFE_PADDING,
                    paddingRight: TASK_LIST_EDGE_SAFE_PADDING,
                  }}
                  onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
                >
                  {filteredGids.length === 0 ? (
                    <motion.div
                      className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border font-mono text-sm text-muted-foreground"
                      style={{ width: tableWidth }}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                    >
                      <span className="text-lg">...</span>
                      <span>
                        {activeFilter === "all"
                          ? UI_TEXT.dashboard.emptyTasks
                          : UI_TEXT.dashboard.emptyFilterTasks}
                      </span>
                      {activeFilter === "all" && (
                        <span className="text-xs opacity-60">{UI_TEXT.dashboard.emptyTip}</span>
                      )}
                    </motion.div>
                  ) : (
                    <div className="relative" style={{ width: tableWidth, height: virtualHeight }}>
                      <div aria-hidden="true" style={{ height: virtualTopSpacer }} />
                      <Reorder.Group
                        as="div"
                        axis="y"
                        values={visibleGids}
                        onReorder={() => undefined}
                        className="flex flex-col gap-2"
                        style={{ width: tableWidth }}
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
                                  width: tableWidth,
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
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={deleteSelectedTasks}
      />
      <TaskDetailsDrawer
        open={detailsOpen && Boolean(detailsTask)}
        task={detailsTask}
        category={detailsCategory}
        selectedTaskCount={selectedTaskCount}
        onOpenChange={setDetailsOpen}
      />
    </div>
  );
}
