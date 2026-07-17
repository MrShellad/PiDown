import { useEffect, useMemo, useRef, useState, useCallback, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { eventBus, useEvent } from "@/core/eventBus";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Plus, FolderOpen, FolderCheck, FolderDown, Upload, Inbox } from "lucide-react";

import { UI_TEXT } from "@/core/locale";
import { filterTaskIds, parseNavFilter, type NavFilter } from "@/core/taskFilters";
import { useDownloadStore } from "@/core/store/useDownloadStore";
import type { Task, Category, Tag } from "@/core/store/useDownloadStore";
import { useAppSettingsStore } from "@/core/store/useAppSettingsStore";
import type { TaskTableColumnId } from "@/core/store/useTaskTableStore";
import { useTaskTableStore } from "@/core/store/useTaskTableStore";
import { useThemeStore } from "@/core/store/useThemeStore";
import { useReactTable, getCoreRowModel, type ColumnDef } from "@tanstack/react-table";
import { useShallow } from "zustand/react/shallow";
import { IconPreview } from "@/components/ui/icon-picker";
import {
  getTaskTableWidth,
} from "@/core/taskTableLayout";
import DownloadToolbar from "./DownloadToolbar";

import TaskDeleteConfirmDialog from "./TaskDeleteConfirmDialog";
import TaskDetailsDrawer from "./TaskDetailsDrawer";
import TaskListHeader from "./TaskListHeader";
import TaskTableRow from "./TaskTableRow";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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

const WatermarkIcon = ({
  activeFilter,
  categories,
  tags,
  color,
}: {
  activeFilter: NavFilter;
  categories: Category[];
  tags: Tag[];
  color: string;
}) => {
  const parsed = parseNavFilter(activeFilter);
  if (parsed.type === "category") {
    const category = categories.find((c) => c.id === parsed.id);
    return (
      <IconPreview
        value={category?.icon}
        color={color}
        className="w-full h-full stroke-[1.2]"
      />
    );
  }
  if (parsed.type === "tag") {
    const tag = tags.find((t) => t.id === parsed.id);
    return (
      <IconPreview
        value={tag?.icon ?? "tags"}
        color={color}
        className="w-full h-full stroke-[1.2]"
      />
    );
  }

  const iconClass = "w-full h-full stroke-[1.2]";
  if (parsed.value === "completed") {
    return <FolderCheck className={iconClass} style={{ color }} />;
  }
  if (parsed.value === "incomplete") {
    return <FolderDown className={iconClass} style={{ color }} />;
  }
  if (parsed.value === "seeding") {
    return <Upload className={iconClass} style={{ color }} />;
  }
  // "all"
  return <FolderOpen className={iconClass} style={{ color }} />;
};

const Row = memo(({ index, style, data }: { index: number; style: React.CSSProperties; data: any }) => {
  const {
    renderedGids,
    animatedTaskIds,
    exitingTaskIds,
    exitingTaskSnapshots,
    selectedTaskIds,
    detailsOpen,
    primarySelectedGid,
    toggleTaskSelection,
    selectSingleTask,
    toggleTaskDetails,
    table,
    categories,
    toggleTask,
    removeTask,
    openTaskFile,
    openTaskFolder,
    restartTask,
    columns,
    tableWidth,
    datetimeFormat,
  } = data;

  const gid = renderedGids[index];
  if (!gid) return null;

  const shouldAnimate = animatedTaskIds.has(gid);
  const isExiting = exitingTaskIds.has(gid);

  return (
    <div
      style={{
        ...style,
        height: 60, // TASK_ROW_HEIGHT
        width: "100%",
        minWidth: `${tableWidth}px`,
        pointerEvents: isExiting ? "none" : "auto",
      }}
    >
      <TaskTableRow
        gid={gid}
        exitingTask={exitingTaskSnapshots[gid]}
        animateEntry={shouldAnimate}
        selected={!isExiting && selectedTaskIds.has(gid)}
        detailsOpen={detailsOpen && primarySelectedGid === gid}
        onSelect={isExiting ? undefined : toggleTaskSelection}
        onContextSelect={isExiting ? undefined : selectSingleTask}
        onOpenDetails={isExiting ? undefined : toggleTaskDetails}
        selectionMode={selectedTaskIds.size > 0}
        table={table}
        categories={categories}
        toggleTask={toggleTask}
        removeTask={removeTask}
        openTaskFile={openTaskFile}
        openTaskFolder={openTaskFolder}
        restartTask={restartTask}
        columns={columns}
        tableWidth={tableWidth}
        datetimeFormat={datetimeFormat}
      />
    </div>
  );
}, (prev, next) => {
  return prev.index === next.index &&
         prev.style.transform === next.style.transform &&
         prev.style.height === next.style.height &&
         prev.data === next.data;
});

interface TaskListDashboardProps {
  activeFilter: NavFilter;
}

const TASK_ROW_HEIGHT = 60;
const TASK_ROW_GAP = 4;
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
  Seeding: 1,
  Pending: 2,
  Paused: 3,
  Failed: 4,
  Completed: 5,
  Cancelled: 6,
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

interface Particle {
  x: number;
  y: number; // absolute Y coordinate relative to list start
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
}

export default function TaskListDashboard({ activeFilter }: TaskListDashboardProps) {
  const theme = useThemeStore((state) => state.theme);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [animatedTaskIds, setAnimatedTaskIds] = useState<Set<string>>(() => new Set());
  const [exitingTaskIds, setExitingTaskIds] = useState<Set<string>>(() => new Set());
  const [exitingTaskSnapshots, setExitingTaskSnapshots] = useState<Record<string, Task>>({});
  const [exitingTaskPositions, setExitingTaskPositions] = useState<Record<string, number>>({});
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(() => new Set());
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeDetailsGid, setActiveDetailsGid] = useState<string | null>(null);
  const rowViewportRef = useRef<HTMLDivElement | null>(null);
  const horizontalScrollRef = useRef<HTMLDivElement | null>(null);

  // Scroll ref for particles drawing
  const scrollTopRef = useRef(scrollTop);
  useEffect(() => {
    scrollTopRef.current = scrollTop;
  }, [scrollTop]);

  // Reset search query when activeFilter changes
  useEffect(() => {
    setSearchQuery("");
  }, [activeFilter]);

  // Reset page to 1 when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Particle manager setup
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameIdRef = useRef<number | null>(null);

  const spawnParticles = (previousIndex: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const computedStyle = getComputedStyle(document.documentElement);
    const primary = computedStyle.getPropertyValue('--primary').trim() || '#6366f1';
    const accent = computedStyle.getPropertyValue('--accent').trim() || '#10b981';
    const colors = [primary, accent, '#ffffff', primary];

    const width = canvas.clientWidth;
    const rowY = previousIndex * TASK_ROW_STRIDE;

    const numParticles = 45;
    const newParticles: Particle[] = [];
    const horizontalCenter = 12 + (width - 24) / 2;

    for (let i = 0; i < numParticles; i++) {
      const color = colors[Math.floor(Math.random() * colors.length)];
      const xPos = 12 + Math.random() * (width - 24);
      const pushDirection = xPos > horizontalCenter ? 1 : -1;

      newParticles.push({
        x: xPos,
        y: rowY + Math.random() * TASK_ROW_HEIGHT,
        vx: (Math.random() - 0.5) * 4.5 + pushDirection * (Math.random() * 2),
        vy: -1.2 - Math.random() * 4.8,
        size: 2.2 + Math.random() * 3.8,
        color,
        alpha: 1.0,
        decay: 0.015 + Math.random() * 0.015,
      });
    }

    particlesRef.current = [...particlesRef.current, ...newParticles];

    if (!animationFrameIdRef.current) {
      animate();
    }
  };

  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      animationFrameIdRef.current = null;
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      animationFrameIdRef.current = null;
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const particles = particlesRef.current;
    const currentScrollTop = scrollTopRef.current;
    const activeParticles: Particle[] = [];

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.16; // gravity
      p.alpha -= p.decay;

      if (p.alpha > 0) {
        const drawY = p.y - currentScrollTop;

        if (drawY >= -50 && drawY <= height + 50) {
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, drawY, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        activeParticles.push(p);
      }
    }

    particlesRef.current = activeParticles;

    if (activeParticles.length > 0) {
      animationFrameIdRef.current = requestAnimationFrame(animate);
    } else {
      animationFrameIdRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, []);
  const [scrollState, setScrollState] = useState({
    canScrollLeft: false,
    canScrollRight: false,
  });
  const previousGidsRef = useRef<string[]>([]);
  const previousTasksRef = useRef<Record<string, Task>>({});
  const previousFilteredGidsRef = useRef<string[]>([]);
  const animationTimeoutsRef = useRef<number[]>([]);

  const taskGids = useDownloadStore(useShallow((state) => Object.keys(state.tasks)));
  const taskFilterKeys = useDownloadStore(
    useShallow((state) =>
      Object.keys(state.tasks)
        .sort()
        .map((gid) => {
          const task = state.tasks[gid];
          return `${task.gid}_${task.status}_${task.categoryId}_${task.tags?.map((t) => t.id).join(",")}_${task.name}_${task.url}_${task.totalBytes}_${task.createdAt}`;
        })
    )
  );
  const categories = useDownloadStore((state) => state.categories);
  const tags = useDownloadStore((state) => state.tags);
  const toggleTask = useDownloadStore((state) => state.toggleTask);
  const removeTask = useDownloadStore((state) => state.removeTask);
  const openTaskFile = useDownloadStore((state) => state.openTaskFile);
  const openTaskFolder = useDownloadStore((state) => state.openTaskFolder);
  const restartTask = useDownloadStore((state) => state.restartTask);
  const columns = useTaskTableStore((state) => state.columns);
  const sort = useTaskTableStore((state) => state.sort);
  const pageSize = useTaskTableStore((state) => state.pageSize);
  const setPageSize = useTaskTableStore((state) => state.setPageSize);
  const datetimeFormat = useAppSettingsStore((state) => state.settings?.interface?.datetime_format);


  const filterContext = useMemo(() => ({ categories, tags }), [categories, tags]);

  const [currentPage, setCurrentPage] = useState(1);

  const filteredGids = useMemo(
    () => {
      const currentTasks = useDownloadStore.getState().tasks;
      let gids = filterTaskIds(currentTasks, activeFilter, filterContext);

      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        gids = gids.filter((gid) => {
          const task = currentTasks[gid];
          return task && (
            task.name.toLowerCase().includes(query) ||
            (task.url && task.url.toLowerCase().includes(query))
          );
        });
      }

      if (!sort) return gids;

      return gids
        .map((gid, index) => ({ gid, index }))
        .sort((a, b) => {
          const taskA = currentTasks[a.gid];
          const taskB = currentTasks[b.gid];
          if (!taskA || !taskB) return a.index - b.index;

          const result = compareTaskByColumn(taskA, taskB, sort.id);
          const directedResult = sort.direction === "asc" ? result : -result;
          return directedResult || a.index - b.index;
        })
        .map((item) => item.gid);
    },
    [taskFilterKeys, activeFilter, filterContext, sort, searchQuery]
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

  const columnsConfig = useMemo<ColumnDef<Task>[]>(() => [
    { id: "name", header: UI_TEXT.dashboard.columns.name },
    { id: "size", header: UI_TEXT.dashboard.columns.size },
    { id: "status", header: UI_TEXT.dashboard.columns.status },
    { id: "speed", header: UI_TEXT.dashboard.columns.speed },
    { id: "eta", header: UI_TEXT.dashboard.columns.eta },
    { id: "createdAt", header: UI_TEXT.dashboard.columns.createdAt },
    { id: "tags", header: UI_TEXT.dashboard.columns.tags },
  ], []);

  const tableData = useMemo(() => {
    const currentTasks = useDownloadStore.getState().tasks;
    return paginatedFilteredGids.map((gid) => currentTasks[gid]).filter((t): t is Task => Boolean(t));
  }, [paginatedFilteredGids]);

  const columnVisibility = useMemo(() => {
    const visibility: Record<string, boolean> = {};
    columns.forEach((col) => {
      visibility[col.id] = col.visible !== false;
    });
    return visibility;
  }, [columns]);

  const columnOrder = useMemo(() => {
    return columns.map((col) => col.id);
  }, [columns]);

  const table = useReactTable({
    data: tableData,
    columns: columnsConfig,
    state: {
      columnVisibility,
      columnOrder,
    },
    getCoreRowModel: getCoreRowModel(),
  });

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

  const activeFilterIconInfo = useMemo(() => {
    const parsed = parseNavFilter(activeFilter);
    if (parsed.type === "category") {
      const category = categories.find((c) => c.id === parsed.id);
      return {
        color: category?.color ?? "var(--primary)",
      };
    }
    if (parsed.type === "tag") {
      const tag = tags.find((t) => t.id === parsed.id);
      return {
        color: tag?.color ?? "var(--primary)",
      };
    }
    return {
      color: "var(--primary)",
    };
  }, [activeFilter, categories, tags]);
  const tableWidth = getTaskTableWidth(columns);

  const rowVirtualizer = useVirtualizer({
    count: renderedGids.length,
    getScrollElement: () => rowViewportRef.current,
    estimateSize: () => TASK_ROW_STRIDE,
    overscan: TASK_LIST_OVERSCAN,
  });

  const updateScrollState = useCallback(() => {
    const el = horizontalScrollRef.current;
    if (!el) return;
    const canScrollLeft = el.scrollLeft > 2;
    const canScrollRight = el.scrollLeft < el.scrollWidth - el.clientWidth - 2;
    setScrollState((prev) => {
      if (prev.canScrollLeft === canScrollLeft && prev.canScrollRight === canScrollRight) {
        return prev;
      }
      return { canScrollLeft, canScrollRight };
    });
  }, []);

  useEffect(() => {
    const el = horizontalScrollRef.current;
    if (!el) return;

    updateScrollState();

    const observer = new ResizeObserver(() => {
      updateScrollState();
    });
    observer.observe(el);

    const child = el.firstElementChild;
    if (child) {
      observer.observe(child);
    }

    return () => {
      observer.disconnect();
    };
  }, [updateScrollState, tableWidth, filteredGids.length]);

  const maskStyle = useMemo(() => {
    const { canScrollLeft, canScrollRight } = scrollState;
    if (!canScrollLeft && !canScrollRight) return {};

    const leftGradient = canScrollLeft
      ? "rgba(0,0,0,0) 0%, rgba(0,0,0,1) 24px"
      : "rgba(0,0,0,1) 0%";
    const rightGradient = canScrollRight
      ? "rgba(0,0,0,1) calc(100% - 24px), rgba(0,0,0,0) 100%"
      : "rgba(0,0,0,1) 100%";

    const val = `linear-gradient(to right, ${leftGradient}, ${rightGradient})`;
    return {
      WebkitMaskImage: val,
      maskImage: val,
    };
  }, [scrollState]);

  const selectedFilteredCount = paginatedFilteredGids.filter((gid) => selectedTaskIds.has(gid)).length;
  const allFilteredSelected =
    paginatedFilteredGids.length > 0 && selectedFilteredCount === paginatedFilteredGids.length;
  const headerChecked = allFilteredSelected
    ? true
    : selectedFilteredCount > 0
      ? "indeterminate"
      : false;
  const virtualHeight =
    renderedGids.length === 0
      ? 0
      : renderedGids.length * TASK_ROW_HEIGHT + Math.max(0, renderedGids.length - 1) * TASK_ROW_GAP;
  const primarySelectedGid = useMemo(() => {
    const currentTasks = useDownloadStore.getState().tasks;
    if (activeDetailsGid && currentTasks[activeDetailsGid]) return activeDetailsGid;
    for (const gid of selectedTaskIds) {
      if (currentTasks[gid]) return gid;
    }
    return filteredGids.find((gid) => currentTasks[gid]) ?? null;
  }, [filteredGids, selectedTaskIds, activeDetailsGid]);

  useEvent("task:focus-row", ({ gid }) => {
    const index = renderedGids.indexOf(gid);
    if (index !== -1) {
      setSelectedTaskIds(new Set([gid]));
      
      const targetScrollTop = Math.max(
        0,
        index * TASK_ROW_STRIDE - (viewportHeight - TASK_ROW_HEIGHT) / 2
      );

      if (rowViewportRef.current) {
        rowViewportRef.current.scrollTo({
          top: targetScrollTop,
          behavior: "smooth",
        });
      }
    }
  });



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
    const previousGids = previousGidsRef.current;
    const previousGidSet = new Set(previousGids);
    const nextGidSet = new Set(taskGids);
    const createdTaskIds = taskGids.filter((gid) => !previousGidSet.has(gid));
    const deletedTaskIds = previousGids.filter((gid) => !nextGidSet.has(gid));

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

      const currentTasks = useDownloadStore.getState().tasks;
      for (const gid of deletedTaskIds) {
        const snapshot = previousTasksRef.current[gid] || currentTasks[gid];
        const previousIndex = previousFilteredGids.indexOf(gid);
        if (!snapshot || previousIndex < 0) continue;

        nextSnapshots[gid] = snapshot;
        nextPositions[gid] = previousIndex;
      }

      const exitGids = Object.keys(nextSnapshots);

      if (exitGids.length > 0) {
        for (const gid of exitGids) {
          const prevIndex = nextPositions[gid];
          if (prevIndex !== undefined) {
            spawnParticles(prevIndex);
          }
        }

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

    previousGidsRef.current = taskGids;
    previousTasksRef.current = useDownloadStore.getState().tasks;
  }, [taskGids]);

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
    if (detailsOpen && activeDetailsGid === gid) {
      setDetailsOpen(false);
      setActiveDetailsGid(null);
      return;
    }

    setActiveDetailsGid(gid);
    setDetailsOpen(true);
  };

  const toggleAllFilteredTasks = (checked: boolean) => {
    setSelectedTaskIds(() => (checked ? new Set(paginatedFilteredGids) : new Set()));
  };

  const selectedTaskCount = selectedTaskIds.size;
  const singleTaskName = useMemo(() => {
    if (selectedTaskIds.size === 1) {
      const gid = [...selectedTaskIds][0];
      return useDownloadStore.getState().tasks[gid]?.name;
    }
    return undefined;
  }, [selectedTaskIds]);

  const selectedTasks = useMemo(() => {
    const currentTasks = useDownloadStore.getState().tasks;
    return [...selectedTaskIds]
      .map((gid) => currentTasks[gid])
      .filter((task): task is Task => Boolean(task));
  }, [selectedTaskIds, taskFilterKeys]);

  const selectedDownloadableGids = useMemo(() => {
    return selectedTasks
      .filter((task) => task.status === "Downloading" || task.status === "Seeding")
      .map((task) => task.gid);
  }, [selectedTasks]);

  const selectedResumableGids = useMemo(() => {
    return selectedTasks
      .filter((task) => task.status === "Paused" || task.status === "Failed")
      .map((task) => task.gid);
  }, [selectedTasks]);

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

  const itemData = useMemo(() => ({
    renderedGids,
    animatedTaskIds,
    exitingTaskIds,
    exitingTaskSnapshots,
    selectedTaskIds,
    detailsOpen,
    primarySelectedGid,
    toggleTaskSelection,
    selectSingleTask,
    toggleTaskDetails,
    table,
    categories,
    toggleTask,
    removeTask,
    openTaskFile,
    openTaskFolder,
    restartTask,
    columns,
    tableWidth,
    datetimeFormat,
  }), [
    renderedGids,
    animatedTaskIds,
    exitingTaskIds,
    exitingTaskSnapshots,
    selectedTaskIds,
    detailsOpen,
    primarySelectedGid,
    toggleTaskSelection,
    selectSingleTask,
    toggleTaskDetails,
    table,
    categories,
    toggleTask,
    removeTask,
    openTaskFile,
    openTaskFolder,
    restartTask,
    columns,
    tableWidth,
    datetimeFormat,
  ]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden pt-3 pb-6 px-6 select-none">
      {/* Background Category Watermark */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeFilter}
          initial={{ opacity: 0, scale: 0.8, rotate: -25 }}
          animate={{ opacity: 0.05, scale: 1, rotate: -15 }}
          exit={{ opacity: 0, scale: 0.8, rotate: -25 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="absolute right-[-60px] bottom-[-60px] w-[360px] h-[360px] pointer-events-none select-none z-0"
        >
          <WatermarkIcon
            activeFilter={activeFilter}
            categories={categories}
            tags={tags}
            color={activeFilterIconInfo.color}
          />
        </motion.div>
      </AnimatePresence>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-5 px-0 pt-0">
        <div className="shrink-0 px-3">
          <DownloadToolbar
            selectedTaskCount={selectedTaskCount}
            selectedPauseCount={selectedDownloadableGids.length}
            selectedResumeCount={selectedResumableGids.length}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            onCreateTask={(initialUrl) => {
              if (initialUrl && initialUrl.trim().length > 0) {
                eventBus.emit("task:open-modal", { url: initialUrl.trim() });
              } else {
                eventBus.emit("task:open-modal", null);
              }
            }}
            onPauseSelected={pauseSelectedTasks}
            onResumeSelected={resumeSelectedTasks}
            onDeleteSelected={() => setDeleteConfirmOpen(true)}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div
              ref={horizontalScrollRef}
              className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden rounded-lg [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              style={{
                overflowX: "auto" as React.CSSProperties["overflowX"],
                ...maskStyle,
              }}
              onScroll={updateScrollState}
            >
              <div
                className="flex min-h-0 flex-col overflow-visible relative"
                style={{
                  width: "100%",
                  minWidth: tableWidth + 24,
                  paddingLeft: 12,
                  paddingRight: 12,
                  height: "100%",
                }}
              >
                <div
                  className="absolute top-0 z-20"
                  style={{
                    left: 12,
                    right: 12,
                    minWidth: `${tableWidth}px`,
                  }}
                >
                  <TaskListHeader
                    checked={headerChecked}
                    disabled={filteredGids.length === 0}
                    embedded
                    onCheckedChange={toggleAllFilteredTasks}
                    table={table}
                  />
                </div>
                {filteredGids.length === 0 ? (
                  <ScrollArea
                    viewportRef={rowViewportRef}
                    scrollbar="overlay"
                    visibility="auto"
                    gutter="stable"
                    variant="ghost"
                    className="min-h-0 flex-1"
                    style={{
                      width: "100%",
                      minWidth: `${tableWidth + 12}px`,
                      marginBottom: 8,
                      clipPath: "inset(0px 0px 0px 0px round 0px 0px 8px 8px)",
                    }}
                    viewportClassName={`relative pb-[46px] pt-0 scroll-smooth rounded-b-lg flex flex-col`}
                    viewportStyle={{
                      paddingLeft: 0,
                      paddingRight: 12,
                      clipPath: theme === "animal-crossing" ? "inset(28px 0px 0px 0px)" : undefined,
                    }}
                  >
                    <div className="h-[52px] shrink-0" />
                    <div className="h-2 shrink-0" />
                    <motion.div
                      className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center"
                      style={{ width: `${tableWidth}px` }}
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                      <div className="flex flex-col items-center gap-2 max-w-sm">
                        <Inbox className="size-12 text-primary/80 stroke-[1.5]" />
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
                          onClick={() => eventBus.emit("task:open-modal", null)}
                          className="mt-2 flex items-center gap-1.5 bg-primary hover:bg-[color-mix(in_srgb,var(--primary),var(--foreground)_15%)] text-primary-foreground font-semibold px-5 py-2.5 h-10 rounded-lg shadow-md hover:shadow-lg active:scale-95 transition-all duration-150"
                        >
                          <Plus className="h-4 w-4" />
                          <span>新建下载任务</span>
                        </Button>
                      )}
                    </motion.div>
                  </ScrollArea>
                ) : (
                  <div
                    ref={rowViewportRef}
                    className={cn(
                      "min-h-0 flex-1 overscroll-contain pb-[46px] pt-0 scroll-smooth rounded-b-lg scrollbar-interactive scrollbar-overlay scrollbar-auto-hide",
                      "[overflow-y:overlay!important] overflow-x-hidden"
                    )}
                    style={{
                      height: `${viewportHeight || 500}px`,
                      width: "100%",
                      minWidth: `${tableWidth + 12}px`,
                      clipPath: theme === "animal-crossing" ? "inset(28px 0px 0px 0px)" : "inset(0px 0px 0px 0px round 0px 0px 8px 8px)",
                      marginBottom: 8,
                    }}
                    onScroll={(e) => {
                      setScrollTop(e.currentTarget.scrollTop);
                    }}
                  >
                    <div
                      style={{
                        position: "relative",
                        width: "100%",
                        minWidth: `${tableWidth}px`,
                        height: `${rowVirtualizer.getTotalSize() + 60 + 46}px`, // 60px top spacer + 46px bottom padding
                      }}
                    >
                      <div style={{ transform: "translateY(60px)" }}>
                        {rowVirtualizer.getVirtualItems().map((virtualRow) => (
                          <Row
                            key={virtualRow.key}
                            index={virtualRow.index}
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              height: `${TASK_ROW_HEIGHT}px`,
                              transform: `translateY(${virtualRow.start}px)`,
                            }}
                            data={itemData}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Pagination Controls */}
                <div
                  className="absolute z-20"
                  style={{
                    left: 12,
                    right: 12,
                    minWidth: `${tableWidth}px`,
                    bottom: 6,
                  }}
                >
                  <div className="flex h-12 items-center justify-between rounded-lg bg-toolbar backdrop-blur-md shadow-sm border border-border/40 px-4 text-xs text-muted-foreground select-none">
                    {/* Left: Range Info */}
                    <div className="flex flex-1 items-center gap-1.5 font-medium justify-start">
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
                    <div className="flex flex-1 items-center justify-center">
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
                                    className={`h-8 w-8 rounded-md text-xs transition-colors ${currentPage === page
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
                    </div>

                    {/* Right: Page Size Dropdown */}
                    <div className="flex flex-1 items-center gap-2 justify-end">
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
                {/* Canvas Overlay for Particle Explosion */}
                {filteredGids.length > 0 && (
                  <canvas
                    ref={canvasRef}
                    className="absolute pointer-events-none z-50"
                    style={{
                      left: 12,
                      right: 12,
                      top: 60,
                      minWidth: `${tableWidth}px`,
                      height: `${viewportHeight}px`,
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>


      <TaskDeleteConfirmDialog
        open={deleteConfirmOpen}
        taskCount={selectedTaskCount}
        taskName={singleTaskName}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={deleteSelectedTasks}
      />
      <TaskDetailsDrawer
        open={detailsOpen && Boolean(primarySelectedGid)}
        gid={primarySelectedGid}
        selectedTaskCount={selectedTaskCount}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) {
            setActiveDetailsGid(null);
          }
        }}
        onDeleteClick={(gid) => {
          setSelectedTaskIds(new Set([gid]));
          setDeleteConfirmOpen(true);
        }}
      />
    </div>
  );
}
