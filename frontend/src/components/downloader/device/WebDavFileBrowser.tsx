import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Menu,
  MenuContent,
  MenuTrigger,
  MenuCheckboxItem,
  MenuSeparator,
} from "@/components/ui/menu";
import {
  Folder,
  File,
  FileVideo,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  RefreshCw,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  HardDriveUpload,
  SlidersHorizontal,
  Download,
  ExternalLink,
  Play,
  Pencil,
  Trash2,
  Copy,
  Scissors,
  Check,
  AlertTriangle,
  X,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import WebDavVideoPlayerDialog, { ZH_CN_TRANSLATIONS } from "./WebDavVideoPlayerDialog";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Checkbox } from "@/components/ui/checkbox";
import { listWebDavFiles, setVideoPlayerDuration, getWebDavDownloadUrl, renameWebDavItem, deleteWebDavItems, copyWebDavItem, moveWebDavItem } from "@/core/bridge/tauri-commands";
import type { WebDavFile, WebDavDevice } from "@/core/bridge/tauri-commands";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import NewTaskModal from "../NewTaskModal";
import type { ExternalDownloadRequest } from "@/core/bridge/external-download";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useToastStore } from "@/core/store/useToastStore";
import { useAppSettingsStore } from "@/core/store/useAppSettingsStore";
import { formatDateTime } from "@/core/datetime";
import { MediaPlayer, MediaProvider } from "@vidstack/react";
import { DefaultVideoLayout, defaultLayoutIcons } from "@vidstack/react/player/layouts/default";
import { listen } from "@tauri-apps/api/event";
import { motion } from "motion/react";

interface WebDavFileBrowserProps {
  device: WebDavDevice;
  onBack: () => void;
}

type ViewMode = "grid" | "list";

interface ClipboardItem {
  name: string;
  path: string;
  is_dir: boolean;
  operation: "copy" | "move";
  deviceId: string;
  status: "idle" | "pasting" | "success" | "error";
  progress: number;
  errorMsg?: string;
}

const columnHelper = createColumnHelper<WebDavFile>();

function WebDavContextMenuTitle({ name, isDir }: { name: string; isDir: boolean }) {
  const shouldScroll = name.length > 20;

  return (
    <div className="mx-1 mb-1 rounded-md bg-muted/80 px-3 py-2 shadow-surface-inset select-none">
      <span className="mb-0.5 block text-[10px] font-bold tracking-wide text-muted-foreground">
        {isDir ? "当前文件夹" : "当前文件"}
      </span>
      <div className="relative overflow-hidden w-full">
        {shouldScroll ? (
          <motion.div
            className="flex w-max gap-8 whitespace-nowrap text-xs font-semibold leading-5 text-foreground"
            animate={{ x: ["0%", "-50%"] }}
            transition={{
              duration: Math.min(15, Math.max(6, name.length * 0.22)),
              ease: "linear",
              repeat: Infinity,
            }}
          >
            <span>{name}</span>
            <span aria-hidden="true">{name}</span>
          </motion.div>
        ) : (
          <span className="block truncate text-xs font-semibold leading-5 text-foreground">
            {name}
          </span>
        )}
      </div>
    </div>
  );
}

function formatWebDavDate(isoString: string, formatPattern: string): string {
  if (!isoString || isoString === "——") return "——";
  const ms = Date.parse(isoString);
  if (isNaN(ms)) return isoString;
  return formatDateTime(Math.floor(ms / 1000), formatPattern);
}

export default function WebDavFileBrowser({ device, onBack }: WebDavFileBrowserProps) {
  const baseSubpath = useMemo(() => {
    try {
      const url = new URL(device.server_url);
      return url.pathname.replace(/\/+$/, "");
    } catch (e) {
      return "";
    }
  }, [device.server_url]);

  const initialPath = baseSubpath || "/";

  const [currentPath, setCurrentPath] = useState(initialPath);
  const [files, setFiles] = useState<WebDavFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Navigation History State
  const [history, setHistory] = useState<string[]>([initialPath]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // View Mode State
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // Sorting and Visibility States
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [foldersFirst, setFoldersFirst] = useState(true);
  const datetimeFormat = useAppSettingsStore((state) => state.settings?.interface?.datetime_format) || "YYYY-MM-DD HH:mm:ss";

  // Selection State
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  // File operation states
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameItem, setRenameItem] = useState<WebDavFile | null>(null);
  const [renameNewName, setRenameNewName] = useState("");

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteItems, setDeleteItems] = useState<WebDavFile[]>([]);

  const [clipboardItems, setClipboardItems] = useState<ClipboardItem[]>([]);
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const [isPasting, setIsPasting] = useState(false);

  // Download modal state
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [downloadRequest, setDownloadRequest] = useState<ExternalDownloadRequest | null>(null);

  // Video player settings
  const settings = useAppSettingsStore((state) => state.settings);
  const autoPlay = settings?.player?.auto_play ?? true;
  const defaultMuted = settings?.player?.muted ?? false;
  const defaultVolume = settings?.player?.default_volume ?? 1.0;

  // Video player state
  const [playOpen, setPlayOpen] = useState(false);
  const [playUrl, setPlayUrl] = useState("");
  const [contextMenuPath, setContextMenuPath] = useState<string | null>(null);
  const [playTitle, setPlayTitle] = useState("");
  const [previewMode, setPreviewMode] = useState<"none" | "dialog" | "page">("none");
  const [currentPlayingFile, setCurrentPlayingFile] = useState<WebDavFile | null>(null);
  const [speed, setSpeed] = useState<number>(0);

  const isVideoFile = useCallback((filename: string): boolean => {
    const videoExtensions = [".mp4", ".mkv", ".avi", ".mov", ".webm", ".flv", ".wmv", ".ts", ".m3u8"];
    const lower = filename.toLowerCase();
    return videoExtensions.some((ext) => lower.endsWith(ext));
  }, []);

  const getPlayUrl = useCallback((file: WebDavFile) => {
    const isWindows = navigator.userAgent.toLowerCase().includes("windows");
    return isWindows
      ? `http://webdav.localhost/stream?device_id=${device.id}&path=${encodeURIComponent(file.path)}`
      : `webdav://localhost/stream?device_id=${device.id}&path=${encodeURIComponent(file.path)}`;
  }, [device.id]);

  const handlePlayVideo = useCallback((file: WebDavFile, mode: "dialog" | "page" = "dialog") => {
    const url = getPlayUrl(file);
    setCurrentPlayingFile(file);
    setPreviewMode(mode);
    if (mode === "dialog") {
      setPlayUrl(url);
      setPlayTitle(file.name);
      setPlayOpen(true);
    }
  }, [getPlayUrl]);

  const handleDownloadFile = useCallback(async (file: WebDavFile) => {
    try {
      const downloadUrl = await getWebDavDownloadUrl(device.id, file.path);
      setDownloadRequest({
        url: downloadUrl,
        filename: file.name,
        totalSize: file.size,
      });
      setDownloadModalOpen(true);
    } catch (e) {
      console.error(e);
      useToastStore.getState().pushToast({
        title: "获取下载链接失败",
        description: typeof e === "string" ? e : "无法获取下载链接，请重试。",
        variant: "destructive",
      });
    }
  }, [device.id]);

  // Playlist memo
  const videoFiles = useMemo(() => {
    return files.filter(f => !f.is_dir && isVideoFile(f.name));
  }, [files, isVideoFile]);

  // Stream speed listener for new page mode
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let timer: NodeJS.Timeout | null = null;

    const setup = async () => {
      unlisten = await listen("webdav-stream-speed", (event: { payload: { speed_bps: number } }) => {
        if (event && event.payload) {
          setSpeed(event.payload.speed_bps);

          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            setSpeed(0);
          }, 2000);
        }
      });
    };

    if (previewMode === "page") {
      setup().catch(console.error);
    } else {
      setSpeed(0);
    }

    return () => {
      if (unlisten) unlisten();
      if (timer) clearTimeout(timer);
    };
  }, [previewMode]);

  const formatSpeed = (bytesPerSecond: number) => {
    if (bytesPerSecond <= 0) return "";
    const kb = bytesPerSecond / 1024;
    if (kb < 1024) {
      return `${kb.toFixed(1)} KB/s`;
    }
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB/s`;
  };

  // Reset selection when files list changes
  useEffect(() => {
    setSelectedPaths(new Set());
  }, [files]);

  const isAllSelected = useMemo(() => {
    return files.length > 0 && files.every((f) => selectedPaths.has(f.path));
  }, [files, selectedPaths]);

  const isSomeSelected = useMemo(() => {
    return files.length > 0 && files.some((f) => selectedPaths.has(f.path)) && !isAllSelected;
  }, [files, selectedPaths, isAllSelected]);

  const toggleSelectAll = useCallback((checked: boolean) => {
    if (!checked) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(files.map((f) => f.path)));
    }
  }, [files]);

  const toggleSelectFile = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const foldersFirstSortFn = useCallback((rowA: any, rowB: any, columnId: string) => {
    if (foldersFirst) {
      const isDirA = rowA.original.is_dir;
      const isDirB = rowB.original.is_dir;
      if (isDirA !== isDirB) {
        const isDesc = sorting.find((s) => s.id === columnId)?.desc ?? false;
        return isDirA ? (isDesc ? 1 : -1) : (isDesc ? -1 : 1);
      }
    }

    if (columnId === "size") {
      const valA = rowA.getValue(columnId) as number;
      const valB = rowB.getValue(columnId) as number;
      return valA - valB;
    }

    const valA = (rowA.getValue(columnId) || "").toString().toLowerCase();
    const valB = (rowB.getValue(columnId) || "").toString().toLowerCase();
    return valA.localeCompare(valB);
  }, [foldersFirst, sorting]);

  // TanStack Table Column Definitions (Large Font, Centered Header & Cells, Sorting Support)
  const columns = useMemo(() => [
    columnHelper.accessor("name", {
      sortingFn: foldersFirstSortFn,
      header: ({ column }) => {
        const sorted = column.getIsSorted();
        return (
          <div className="flex items-center gap-3.5 justify-start pl-1 w-full" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={isSomeSelected ? "indeterminate" : isAllSelected}
              onCheckedChange={(checked) => {
                toggleSelectAll(checked === true);
              }}
              onClick={(e) => e.stopPropagation()}
              className="size-5 shrink-0"
            />
            <button
              type="button"
              onClick={() => column.toggleSorting(sorted === "asc")}
              className="flex items-center gap-1.5 hover:text-foreground cursor-pointer font-bold text-base select-none"
            >
              <span>文件名</span>
              {sorted === "asc" ? (
                <ArrowUp className="size-4 text-primary" />
              ) : sorted === "desc" ? (
                <ArrowDown className="size-4 text-primary" />
              ) : (
                <ArrowUpDown className="size-4 opacity-60" />
              )}
            </button>
          </div>
        );
      },
      cell: (info) => {
        const file = info.row.original;
        const isSelected = selectedPaths.has(file.path);
        return (
          <div className="flex items-center justify-start gap-3.5 min-w-0 pl-1 w-full">
            <Checkbox
                checked={isSelected}
                onCheckedChange={() => toggleSelectFile(file.path)}
                onClick={(e) => e.stopPropagation()}
                className="size-5 shrink-0"
              />
              {file.is_dir ? (
                <Folder className="size-5 text-primary/70 fill-primary/30 shrink-0" />
              ) : isVideoFile(file.name) ? (
                <FileVideo className="size-5 text-indigo-500 shrink-0" />
              ) : (
                <File className="size-5 text-muted-foreground/60 shrink-0" />
              )}
              <span className="truncate text-[17px] select-none">{file.name}</span>
          </div>
        );
      },
    }),
    columnHelper.accessor("size", {
      sortingFn: foldersFirstSortFn,
      header: ({ column }) => {
        const sorted = column.getIsSorted();
        return (
          <button
            type="button"
            onClick={() => column.toggleSorting(sorted === "asc")}
            className="flex items-center gap-1.5 hover:text-foreground mx-auto cursor-pointer font-bold text-base"
          >
            <span>大小</span>
            {sorted === "asc" ? (
              <ArrowUp className="size-4 text-primary" />
            ) : sorted === "desc" ? (
              <ArrowDown className="size-4 text-primary" />
            ) : (
              <ArrowUpDown className="size-4 opacity-60" />
            )}
          </button>
        );
      },
      cell: (info) => (
        <div className="text-center font-mono text-base font-semibold text-muted-foreground">
          {formatFileSize(info.getValue())}
        </div>
      ),
    }),
    columnHelper.accessor("last_modified", {
      sortingFn: foldersFirstSortFn,
      header: ({ column }) => {
        const sorted = column.getIsSorted();
        return (
          <button
            type="button"
            onClick={() => column.toggleSorting(sorted === "asc")}
            className="flex items-center gap-1.5 hover:text-foreground mx-auto cursor-pointer font-bold text-base"
          >
            <span>修改时间</span>
            {sorted === "asc" ? (
              <ArrowUp className="size-4 text-primary" />
            ) : sorted === "desc" ? (
              <ArrowDown className="size-4 text-primary" />
            ) : (
              <ArrowUpDown className="size-4 opacity-60" />
            )}
          </button>
        );
      },
      cell: (info) => (
        <div className="text-center text-base text-muted-foreground truncate">
          {formatWebDavDate(info.getValue(), datetimeFormat)}
        </div>
      ),
    }),
  ], [files, selectedPaths, isAllSelected, isSomeSelected, toggleSelectAll, toggleSelectFile, foldersFirstSortFn, datetimeFormat]);

  const table = useReactTable({
    data: files,
    columns,
    state: {
      sorting,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: table.getRowModel().rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 48,
    overscan: 5,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? totalSize - virtualRows[virtualRows.length - 1].end
      : 0;

  const directoryCache = useRef<Map<string, WebDavFile[]>>(new Map());

  // Fetch Directory Files
  const fetchFiles = useCallback(async (path: string, forceRefresh = false) => {
    setError(null);

    const cachedData = directoryCache.current.get(path);
    if (cachedData && !forceRefresh) {
      setFiles(cachedData);
      setLoading(false);
    } else {
      setFiles([]);
      setLoading(true);
    }

    try {
      const data = await listWebDavFiles(device.id, path);
      const currentList = directoryCache.current.get(path) || [];
      const hasChanged = currentList.length !== data.length ||
        JSON.stringify(currentList) !== JSON.stringify(data);

      if (hasChanged || !cachedData || forceRefresh) {
        directoryCache.current.set(path, data);
        setFiles(data);
      }
    } catch (err) {
      console.error("获取文件列表失败:", err);
      if (!cachedData) {
        setError(typeof err === "string" ? err : String(err) || "获取目录文件列表失败");
      }
    } finally {
      setLoading(false);
    }
  }, [device.id]);

  // Initial load and load on path change
  useEffect(() => {
    fetchFiles(currentPath);
  }, [currentPath, fetchFiles]);

  // Navigate to path and update history
  const navigateTo = useCallback((targetPath: string) => {
    // Normalize targetPath: must start with /
    let normalized = targetPath;
    if (!normalized.startsWith("/")) {
      normalized = "/" + normalized;
    }

    // Clean double slashes
    normalized = normalized.replace(/\/+/g, "/");

    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(normalized);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setCurrentPath(normalized);
  }, [history, historyIndex]);

  // Navigation commands
  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

  const handleGoBack = useCallback(() => {
    if (canGoBack) {
      const nextIdx = historyIndex - 1;
      setHistoryIndex(nextIdx);
      setCurrentPath(history[nextIdx]);
    }
  }, [canGoBack, historyIndex, history]);

  const handleGoForward = useCallback(() => {
    if (canGoForward) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      setCurrentPath(history[nextIdx]);
    }
  }, [canGoForward, historyIndex, history]);

  const handleGoUp = useCallback(() => {
    const limitPath = baseSubpath || "/";
    if (currentPath === limitPath) return;
    const segments = currentPath.split("/").filter(Boolean);
    segments.pop();
    const parentPath = "/" + segments.join("/");
    navigateTo(parentPath);
  }, [currentPath, baseSubpath, navigateTo]);

  const handleRefresh = useCallback(() => {
    fetchFiles(currentPath, true);
  }, [currentPath, fetchFiles]);

  const handleRename = useCallback((item: WebDavFile) => {
    setRenameItem(item);
    setRenameNewName(item.name);
    setRenameOpen(true);
  }, []);

  const submitRename = useCallback(async () => {
    if (!renameItem || !renameNewName.trim() || renameNewName === renameItem.name) return;
    try {
      const lastSlash = renameItem.path.lastIndexOf('/');
      const parentPath = lastSlash >= 0 ? renameItem.path.substring(0, lastSlash) : "";
      const targetPath = `${parentPath}/${renameNewName}`.replace(/\/+/g, "/");

      await renameWebDavItem(device.id, renameItem.path, targetPath, renameItem.is_dir);

      useToastStore.getState().pushToast({
        title: "重命名成功",
        description: `已成功重命名为“${renameNewName}”`,
        variant: "success",
      });

      setRenameOpen(false);
      handleRefresh();
    } catch (e) {
      console.error(e);
      useToastStore.getState().pushToast({
        title: "重命名失败",
        description: typeof e === "string" ? e : "无法重命名项目，请重试。",
        variant: "destructive",
      });
    }
  }, [renameItem, renameNewName, device.id, handleRefresh]);

  const handleDelete = useCallback((itemsToDelete: WebDavFile[]) => {
    setDeleteItems(itemsToDelete);
    setDeleteConfirmOpen(true);
  }, []);

  const submitDelete = useCallback(async () => {
    if (deleteItems.length === 0) return;
    try {
      await deleteWebDavItems(
        device.id,
        deleteItems.map(item => [item.path, item.is_dir])
      );

      useToastStore.getState().pushToast({
        title: "删除成功",
        description: `已成功删除 ${deleteItems.length} 个项目`,
        variant: "success",
      });

      setDeleteConfirmOpen(false);
      setDeleteItems([]);
      setSelectedPaths(new Set());
      handleRefresh();
    } catch (e) {
      console.error(e);
      useToastStore.getState().pushToast({
        title: "删除失败",
        description: typeof e === "string" ? e : "无法删除选中的项目，请重试。",
        variant: "destructive",
      });
    }
  }, [deleteItems, device.id, handleRefresh]);

  const handleCopyItems = useCallback((items: WebDavFile[]) => {
    const newItems: ClipboardItem[] = items.map(item => ({
      name: item.name,
      path: item.path,
      is_dir: item.is_dir,
      operation: 'copy',
      deviceId: device.id,
      status: 'idle',
      progress: 0
    }));

    setClipboardItems(prev => {
      const existingPaths = new Set(prev.map(i => i.path));
      const filtered = newItems.filter(i => !existingPaths.has(i.path));
      return [...prev, ...filtered];
    });
    setDrawerExpanded(true);
    setSelectedPaths(new Set());
    useToastStore.getState().pushToast({
      title: "已添加到剪贴板",
      description: `已添加 ${newItems.length} 个项目用于复制`,
    });
  }, [device.id]);

  const handleMoveItems = useCallback((items: WebDavFile[]) => {
    const newItems: ClipboardItem[] = items.map(item => ({
      name: item.name,
      path: item.path,
      is_dir: item.is_dir,
      operation: 'move',
      deviceId: device.id,
      status: 'idle',
      progress: 0
    }));

    setClipboardItems(prev => {
      const existingPaths = new Set(prev.map(i => i.path));
      const filtered = newItems.filter(i => !existingPaths.has(i.path));
      return [...prev, ...filtered];
    });
    setDrawerExpanded(true);
    setSelectedPaths(new Set());
    useToastStore.getState().pushToast({
      title: "已添加到剪贴板",
      description: `已添加 ${newItems.length} 个项目用于移动`,
    });
  }, [device.id]);

  const executePasteForItem = useCallback(async (item: ClipboardItem, index: number) => {
    // Update state to pasting
    setClipboardItems(prev => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], status: 'pasting', progress: 0 };
      }
      return updated;
    });

    // Start progress simulation
    let currentProgress = 0;
    const timer = setInterval(() => {
      currentProgress = Math.min(90, currentProgress + Math.floor(Math.random() * 8) + 4);
      setClipboardItems(prev => {
        const updated = [...prev];
        if (updated[index] && updated[index].status === 'pasting') {
          updated[index] = { ...updated[index], progress: currentProgress };
        }
        return updated;
      });
    }, 100);

    try {
      // Determine target name and path
      let targetName = item.name;
      const lastSlash = item.path.lastIndexOf('/');
      const itemParent = lastSlash >= 0 ? item.path.substring(0, lastSlash) : "";
      const isSameFolder = itemParent === currentPath;

      if (isSameFolder && item.operation === 'copy') {
        const dotIdx = item.name.lastIndexOf('.');
        if (dotIdx > 0 && !item.is_dir) {
          targetName = `${item.name.substring(0, dotIdx)}_copy${item.name.substring(dotIdx)}`;
        } else {
          targetName = `${item.name}_copy`;
        }
      }

      const cleanCurrentPath = currentPath.replace(/\/+$/, "");
      const targetPath = `${cleanCurrentPath}/${targetName}`;

      if (isSameFolder && item.operation === 'move') {
        // Move to same folder is a no-op
        clearInterval(timer);
        setClipboardItems(prev => {
          const updated = [...prev];
          if (updated[index]) {
            updated[index] = { ...updated[index], status: 'success', progress: 100 };
          }
          return updated;
        });
        return;
      }

      // Call backend API
      if (item.operation === 'copy') {
        await copyWebDavItem(device.id, item.path, targetPath, item.is_dir);
      } else {
        await moveWebDavItem(device.id, item.path, targetPath, item.is_dir);
      }

      // Success!
      clearInterval(timer);
      setClipboardItems(prev => {
        const updated = [...prev];
        if (updated[index]) {
          updated[index] = { ...updated[index], status: 'success', progress: 100 };
        }
        return updated;
      });
    } catch (err) {
      clearInterval(timer);
      const errorMsg = typeof err === 'string' ? err : String(err) || '操作失败';
      setClipboardItems(prev => {
        const updated = [...prev];
        if (updated[index]) {
          updated[index] = { ...updated[index], status: 'error', progress: 0, errorMsg };
        }
        return updated;
      });
      throw err;
    }
  }, [currentPath, device.id]);

  const handlePaste = useCallback(async () => {
    if (clipboardItems.length === 0 || isPasting) return;
    setIsPasting(true);
    
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < clipboardItems.length; i++) {
      const item = clipboardItems[i];
      if (item.status === 'success') {
        successCount++;
        continue;
      }
      
      try {
        await executePasteForItem(item, i);
        successCount++;
      } catch (e) {
        failCount++;
      }
    }

    setIsPasting(false);
    handleRefresh();

    if (failCount > 0) {
      useToastStore.getState().pushToast({
        title: "粘贴完成",
        description: `成功 ${successCount} 个，失败 ${failCount} 个`,
        variant: "destructive"
      });
    } else {
      useToastStore.getState().pushToast({
        title: "粘贴成功",
        description: `已成功粘贴 ${successCount} 个项目到当前目录。`,
        variant: "success"
      });
    }
  }, [clipboardItems, isPasting, executePasteForItem, handleRefresh]);

  const getTargetItems = useCallback((targetItem: WebDavFile): WebDavFile[] => {
    if (selectedPaths.has(targetItem.path) && selectedPaths.size > 1) {
      return files.filter(f => selectedPaths.has(f.path));
    }
    return [targetItem];
  }, [selectedPaths, files]);

  // Format File Size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "——";
    const kb = 1024;
    const mb = kb * 1024;
    const gb = mb * 1024;
    if (bytes >= gb) return (bytes / gb).toFixed(2) + " GB";
    if (bytes >= mb) return (bytes / mb).toFixed(1) + " MB";
    if (bytes >= kb) return (bytes / kb).toFixed(0) + " KB";
    return bytes + " B";
  };

  // Render Breadcrumbs
  const renderBreadcrumbs = () => {
    let relativePath = currentPath;
    if (baseSubpath && currentPath.startsWith(baseSubpath)) {
      relativePath = currentPath.slice(baseSubpath.length);
    }
    
    const segments = relativePath.split("/").filter(Boolean);
    const crumbs = [{ name: "根目录", path: initialPath }];
    
    let runningPath = baseSubpath;
    segments.forEach((seg) => {
      runningPath += "/" + seg;
      crumbs.push({ name: seg, path: runningPath });
    });

    return (
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1 text-sm font-medium text-muted-foreground select-none">
        {crumbs.map((crumb, idx) => {
          const isLast = idx === crumbs.length - 1;
          return (
            <div key={crumb.path} className="flex items-center shrink-0">
              {idx > 0 && <ChevronRight className="size-3.5 mx-1 opacity-60 shrink-0" />}
              <button
                type="button"
                onClick={() => !isLast && navigateTo(crumb.path)}
                className={cn(
                  "hover:text-foreground hover:bg-muted px-1.5 py-0.5 rounded transition-colors truncate max-w-[120px] cursor-pointer",
                  isLast ? "text-foreground font-bold bg-secondary" : ""
                )}
                disabled={isLast}
              >
                {crumb.name}
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  // Render Skeleton for List View
  const renderListSkeleton = () => {
    const isNameVisible = table.getColumn("name")?.getIsVisible() !== false;
    const isSizeVisible = table.getColumn("size")?.getIsVisible() !== false;
    const isModifiedVisible = table.getColumn("last_modified")?.getIsVisible() !== false;

    return (
      <table className="w-full caption-bottom text-sm border-collapse">
        <TableHeader className="sticky top-0 z-10 bg-secondary shadow-sm">
          <TableRow className="hover:bg-transparent border-b border-border bg-secondary">
            {isNameVisible && (
              <TableHead className="text-base font-bold select-none h-12 px-3 pl-6 text-left w-auto text-muted-foreground/80">
                <div className="flex items-center gap-3.5 justify-start pl-1 w-full">
                  <Checkbox checked={false} disabled className="size-5 shrink-0 opacity-45" />
                  <span>文件名</span>
                </div>
              </TableHead>
            )}
            {isSizeVisible && (
              <TableHead className="text-base font-bold select-none h-12 px-3 text-center w-32 border-r border-border/30 text-muted-foreground/80">
                <span>大小</span>
              </TableHead>
            )}
            {isModifiedVisible && (
              <TableHead className="text-base font-bold select-none h-12 px-3 text-center w-48 border-r border-border/30 text-muted-foreground/80">
                <span>修改时间</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }).map((_, idx) => (
            <TableRow key={idx} className="border-b border-border/40 last:border-b-0 h-12">
              {isNameVisible && (
                <TableCell className="py-3 px-3 pl-6 w-auto text-left">
                  <div className="flex items-center justify-start gap-3.5 min-w-0 pl-1 w-full">
                    <div className="size-5 rounded bg-muted/30 animate-pulse shrink-0" />
                    <div className="size-8 rounded-lg bg-muted/30 animate-pulse shrink-0" />
                    <div 
                      className="h-5 rounded bg-muted/30 animate-pulse" 
                      style={{ width: `${Math.floor(Math.random() * 30) + 30}%` }}
                    />
                  </div>
                </TableCell>
              )}
              {isSizeVisible && (
                <TableCell className="py-3 px-3 w-32 text-center border-r border-border/20">
                  <div className="h-4 w-12 rounded bg-muted/20 animate-pulse mx-auto" />
                </TableCell>
              )}
              {isModifiedVisible && (
                <TableCell className="py-3 px-3 w-48 text-center border-r border-border/20">
                  <div className="h-4 w-28 rounded bg-muted/20 animate-pulse mx-auto" />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </table>
    );
  };

  // Render Skeleton for Grid View
  const renderGridSkeleton = () => {
    return (
      <div className="flex flex-wrap gap-4 justify-start p-4 w-full">
        {Array.from({ length: 12 }).map((_, idx) => (
          <div
            key={idx}
            className="flex flex-col items-center justify-center p-3 rounded-xl border border-border/60 bg-background/50 w-24 h-24 select-none"
          >
            <div className="size-8 rounded-lg bg-muted/30 animate-pulse mb-3" />
            <div className="h-3 w-16 rounded bg-muted/20 animate-pulse mb-1.5" />
            <div className="h-3 w-10 rounded bg-muted/20 animate-pulse" />
          </div>
        ))}
      </div>
    );
  };

  if (previewMode === "page" && currentPlayingFile) {
    const currentVideoUrl = getPlayUrl(currentPlayingFile);
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col gap-5 p-6 relative select-none">
        {/* Combined Solid Toolbar */}
        <div className="shrink-0 bg-toolbar border border-border rounded-xl p-2.5 flex items-center justify-between gap-4 mx-3 shadow-sm">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Button
              variant="secondary"
              size="default"
              onClick={() => {
                setPreviewMode("none");
                setCurrentPlayingFile(null);
              }}
              className="gap-1 font-bold border border-border px-3 shrink-0 h-9 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <ChevronLeft className="size-4.5" />
              返回文件
            </Button>
            <div className="h-5 w-px bg-border shrink-0 mx-0.5" />
            <span className="text-sm font-semibold truncate text-foreground flex-1">
              正在播放：{currentPlayingFile.name}
            </span>
          </div>
          {/* Speed Indicator */}
          {speed > 0 && (
            <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 font-mono animate-pulse shrink-0">
              <span className="size-1.5 rounded-full bg-emerald-400"></span>
              {formatSpeed(speed)}
            </span>
          )}
        </div>

        {/* Content Pane */}
        <div className="flex-1 min-h-0 mx-3 flex gap-4">
          {/* Player Container */}
          <div className="flex-1 bg-black rounded-xl overflow-hidden relative border border-border flex items-center justify-center">
            <MediaPlayer
              src={currentVideoUrl}
              viewType="video"
              streamType="on-demand"
              logLevel="warn"
              crossOrigin
              playsInline
              autoplay={autoPlay}
              muted={defaultMuted}
              volume={defaultVolume}
              className="w-full h-full object-contain"
              onDurationChange={(duration) => {
                if (duration && duration > 0) {
                  setVideoPlayerDuration(device.id, currentPlayingFile.path, duration).catch(console.error);
                }
              }}
            >
              <MediaProvider />
              <DefaultVideoLayout 
                icons={defaultLayoutIcons} 
                translations={ZH_CN_TRANSLATIONS}
              />
            </MediaPlayer>
          </div>

          {/* Playlist Sidebar */}
          <div className="w-80 shrink-0 bg-card border border-border rounded-xl flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border bg-secondary/30 shrink-0">
              <h3 className="text-sm font-bold text-foreground">同目录下视频</h3>
              <p className="text-xs text-muted-foreground mt-0.5">播放列表 ({videoFiles.length})</p>
            </div>
            <div className="flex-1 overflow-auto p-2 space-y-1.5">
              {videoFiles.map((file) => {
                const isCurrent = file.path === currentPlayingFile.path;
                return (
                  <div
                    key={file.path}
                    onClick={() => setCurrentPlayingFile(file)}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted transition-all select-none group",
                      isCurrent
                        ? "bg-primary/5 border-primary/20 text-primary"
                        : "bg-background/40 border-border/50 text-foreground"
                    )}
                  >
                    <FileVideo className={cn("size-4.5 shrink-0 mt-0.5", isCurrent ? "text-primary" : "text-muted-foreground group-hover:text-primary")} />
                    <div className="min-w-0 flex-1">
                      <div className={cn("text-xs leading-relaxed break-all line-clamp-2", isCurrent ? "font-bold" : "font-medium")}>
                        {file.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {formatFileSize(file.size)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-5 p-6 relative select-none">
      {/* Combined Solid Toolbar */}
      <div className="shrink-0 bg-toolbar border border-border rounded-xl p-2.5 flex items-center justify-between gap-4 mx-3 shadow-sm">
        <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* 1. Back to device list */}
            <Button
              variant="secondary"
              size="default"
              onClick={onBack}
              className="gap-1 font-bold border border-border px-3 shrink-0 h-9 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <ChevronLeft className="size-4.5" />
              返回
            </Button>

            {/* 2. Navigation Controls */}
            <ButtonGroup>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-lg"
                    onClick={handleGoBack}
                    disabled={!canGoBack}
                    className="bg-secondary dark:bg-secondary border border-border text-muted-foreground hover:text-foreground hover:bg-background dark:hover:bg-background disabled:opacity-35 cursor-pointer size-9"
                  >
                    <ArrowLeft className="size-4.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">后退</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-lg"
                    onClick={handleGoForward}
                    disabled={!canGoForward}
                    className="bg-secondary dark:bg-secondary border border-border text-muted-foreground hover:text-foreground hover:bg-background dark:hover:bg-background disabled:opacity-35 cursor-pointer size-9"
                  >
                    <ArrowRight className="size-4.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">前进</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-lg"
                    onClick={handleGoUp}
                    disabled={currentPath === initialPath}
                    className="bg-secondary dark:bg-secondary border border-border text-muted-foreground hover:text-foreground hover:bg-background dark:hover:bg-background disabled:opacity-35 cursor-pointer size-9"
                  >
                    <ArrowUp className="size-4.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">返回上级目录</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-lg"
                    onClick={handleRefresh}
                    disabled={loading}
                    className="bg-secondary dark:bg-secondary border border-border text-muted-foreground hover:text-foreground hover:bg-background dark:hover:bg-background disabled:opacity-35 cursor-pointer size-9"
                  >
                    <RefreshCw className={cn("size-4.5", loading ? "animate-spin" : "")} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">刷新</TooltipContent>
              </Tooltip>
            </ButtonGroup>

            {selectedPaths.size > 0 && (
              <>
                <div className="h-5 w-px bg-border shrink-0 mx-0.5" />
                <ButtonGroup>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon-lg"
                        onClick={() => {
                          const selectedFiles = files.filter(f => selectedPaths.has(f.path));
                          handleCopyItems(selectedFiles);
                        }}
                        className="bg-secondary border border-border text-emerald-500 hover:text-emerald-600 hover:bg-background cursor-pointer size-9"
                      >
                        <Copy className="size-4.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">复制选中项</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon-lg"
                        onClick={() => {
                          const selectedFiles = files.filter(f => selectedPaths.has(f.path));
                          handleMoveItems(selectedFiles);
                        }}
                        className="bg-secondary border border-border text-indigo-500 hover:text-indigo-600 hover:bg-background cursor-pointer size-9"
                      >
                        <Scissors className="size-4.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">移动选中项</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon-lg"
                        onClick={() => {
                          const selectedFiles = files.filter(f => selectedPaths.has(f.path));
                          handleDelete(selectedFiles);
                        }}
                        className="bg-secondary border border-border text-rose-500 hover:text-rose-600 hover:bg-background cursor-pointer size-9"
                      >
                        <Trash2 className="size-4.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">删除选中项</TooltipContent>
                  </Tooltip>
                </ButtonGroup>
              </>
            )}

            {clipboardItems.length > 0 && (
              <>
                <div className="h-5 w-px bg-border shrink-0 mx-0.5" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon-lg"
                      onClick={handlePaste}
                      disabled={isPasting}
                      className="bg-secondary border border-border text-blue-500 hover:text-blue-600 hover:bg-background cursor-pointer size-9"
                    >
                      <HardDriveUpload className={cn("size-4.5", isPasting ? "animate-pulse" : "")} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">粘贴到当前目录</TooltipContent>
                </Tooltip>
              </>
            )}

            <div className="h-5 w-px bg-border shrink-0 mx-0.5" />

            {/* 3. Breadcrumbs */}
            <div className="min-w-0 flex-1 overflow-hidden">
              {renderBreadcrumbs()}
            </div>
          </div>

          {/* 4. Column Management & View Switcher */}
          <div className="flex items-center gap-2 select-none shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block">
                  <Menu>
                    <MenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon-lg"
                        className="bg-secondary border border-border text-muted-foreground hover:text-foreground hover:bg-background dark:hover:bg-background cursor-pointer size-9 rounded-lg"
                      >
                        <SlidersHorizontal className="size-4.5" />
                      </Button>
                    </MenuTrigger>
                    <MenuContent align="end" className="w-40">
                      {table.getAllLeafColumns().map((column) => {
                        const isVisible = column.getIsVisible();
                        const label =
                          column.id === "name"
                            ? "文件名"
                            : column.id === "size"
                            ? "大小"
                            : column.id === "last_modified"
                            ? "修改时间"
                            : column.id;
                        return (
                          <MenuCheckboxItem
                            key={column.id}
                            checked={isVisible}
                            onCheckedChange={(checked) => {
                              column.toggleVisibility(!!checked);
                            }}
                            onSelect={(e) => {
                              e.preventDefault();
                            }}
                            className="cursor-pointer font-semibold text-xs py-2"
                          >
                            {label}
                          </MenuCheckboxItem>
                        );
                      })}
                      <MenuSeparator />
                      <MenuCheckboxItem
                        checked={foldersFirst}
                        onCheckedChange={(checked) => setFoldersFirst(!!checked)}
                        onSelect={(e) => e.preventDefault()}
                        className="cursor-pointer font-semibold text-xs py-2"
                      >
                        文件夹优先
                      </MenuCheckboxItem>
                    </MenuContent>
                  </Menu>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">列管理</TooltipContent>
            </Tooltip>

            <ButtonGroup>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-lg"
                    onClick={() => setViewMode("list")}
                    className={cn(
                      "size-9 border border-border cursor-pointer bg-secondary dark:bg-secondary hover:bg-background dark:hover:bg-background",
                      viewMode === "list"
                        ? "bg-background dark:bg-background text-primary font-bold shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <List className="size-4.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">列表视图</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-lg"
                    onClick={() => setViewMode("grid")}
                    className={cn(
                      "size-9 border border-border cursor-pointer bg-secondary dark:bg-secondary hover:bg-background dark:hover:bg-background",
                      viewMode === "grid"
                        ? "bg-background dark:bg-background text-primary font-bold shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <LayoutGrid className="size-4.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">图标网格视图</TooltipContent>
              </Tooltip>
            </ButtonGroup>
          </div>
        </div>

      {/* Main Folder Content list area */}
      <div className="flex-1 min-h-0 bg-card rounded-xl border border-border overflow-hidden flex flex-col mx-3">
        {error ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center p-8 max-w-md mx-auto">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 mb-4">
              <HardDriveUpload className="size-7" />
            </div>
            <h3 className="text-sm font-bold text-foreground mb-1.5">读取目录失败</h3>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">{error}</p>
            <Button size="sm" onClick={handleRefresh} className="font-semibold cursor-pointer">
              重试加载
            </Button>
          </div>
        ) : loading && files.length === 0 ? (
            <div className="flex-1 overflow-auto">
              {viewMode === "list" ? renderListSkeleton() : renderGridSkeleton()}
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center p-8 text-muted-foreground text-sm select-none">
              <Folder className="size-10 opacity-35 mb-3" />
              <span>空文件夹</span>
            </div>
          ) : (
            <div className="flex-1 overflow-auto" ref={scrollRef}>
              {viewMode === "list" ? (
                <table className="w-full caption-bottom text-sm border-collapse">
                  <TableHeader className="sticky top-0 z-10 bg-secondary shadow-sm">
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id} className="hover:bg-transparent border-b border-border bg-secondary">
                        {headerGroup.headers.map((header) => {
                          const isName = header.column.id === "name";
                          const isSize = header.column.id === "size";
                          return (
                            <TableHead
                              key={header.id}
                              className={cn(
                                "text-base font-bold select-none h-12 px-3 border-r border-border/30 last:border-r-0",
                                isName ? "w-auto text-left pl-6" : "text-center",
                                isName ? "" : isSize ? "w-32" : "w-48"
                              )}
                            >
                              {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                            </TableHead>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {paddingTop > 0 && (
                      <tr>
                        <td colSpan={table.getVisibleFlatColumns().length} style={{ height: `${paddingTop}px` }} className="p-0 border-0" />
                      </tr>
                    )}
                    {virtualRows.map((virtualRow) => {
                      const row = table.getRowModel().rows[virtualRow.index];
                      if (!row) return null;
                      const isSelected = selectedPaths.has(row.original.path);
                      return (
                        <ContextMenu key={row.id} onOpenChange={(open) => setContextMenuPath(open ? row.original.path : null)}>
                          <ContextMenuTrigger asChild>
                            <TableRow
                              className={cn(
                                "hover:bg-muted/70 cursor-default transition-colors border-b border-border/40 last:border-b-0 h-12 relative z-0",
                                (row.original.is_dir || isVideoFile(row.original.name)) ? "cursor-pointer text-foreground hover:text-primary" : "",
                                contextMenuPath === row.original.path && "bg-primary/10 text-primary border-y border-primary/25 z-10 relative"
                              )}
                              onClick={() => {
                                if (row.original.is_dir) {
                                  navigateTo(row.original.path);
                                } else if (isVideoFile(row.original.name)) {
                                  handlePlayVideo(row.original, "dialog");
                                }
                              }}
                            >
                              {row.getVisibleCells().map((cell) => {
                                const isName = cell.column.id === "name";
                                const isSize = cell.column.id === "size";
                                return (
                                  <TableCell
                                    key={cell.id}
                                    className={cn(
                                      "py-3 px-3 border-r border-border/35 last:border-r-0 transition-colors",
                                      isName ? "w-auto text-left pl-6" : "text-center",
                                      isName ? "" : isSize ? "w-32" : "w-48",
                                      isSelected && contextMenuPath !== row.original.path ? "bg-primary/8 text-primary font-medium" : ""
                                    )}
                                  >
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          </ContextMenuTrigger>
                          <ContextMenuContent className="w-52 select-none">
                            <WebDavContextMenuTitle name={row.original.name} isDir={row.original.is_dir} />
                            <ContextMenuSeparator />
                            {!row.original.is_dir && (
                              <ContextMenuItem
                                onSelect={() => handleDownloadFile(row.original)}
                                className="cursor-pointer gap-3.5 flex items-center"
                              >
                                <Download className="size-4.5 text-sky-500 shrink-0" />
                                <span>下载文件</span>
                              </ContextMenuItem>
                            )}
                            {isVideoFile(row.original.name) && (
                              <>
                                <ContextMenuItem
                                  onSelect={() => handlePlayVideo(row.original, "dialog")}
                                  className="cursor-pointer gap-3.5 flex items-center"
                                >
                                  <Play className="size-4.5 text-pink-500 shrink-0" />
                                  <span>弹窗预览</span>
                                </ContextMenuItem>
                                <ContextMenuItem
                                  onSelect={() => handlePlayVideo(row.original, "page")}
                                  className="cursor-pointer gap-3.5 flex items-center"
                                >
                                  <ExternalLink className="size-4.5 text-violet-500 shrink-0" />
                                  <span>新页面预览</span>
                                </ContextMenuItem>
                              </>
                            )}
                            <ContextMenuSeparator />
                            {(!selectedPaths.has(row.original.path) || selectedPaths.size <= 1) && (
                              <ContextMenuItem
                                onSelect={() => handleRename(row.original)}
                                className="cursor-pointer gap-3.5 flex items-center"
                              >
                                <Pencil className="size-4.5 text-amber-500 shrink-0" />
                                <span>重命名</span>
                              </ContextMenuItem>
                            )}
                            <ContextMenuItem
                              onSelect={() => handleCopyItems(getTargetItems(row.original))}
                              className="cursor-pointer gap-3.5 flex items-center"
                            >
                              <Copy className="size-4.5 text-emerald-500 shrink-0" />
                              <span>复制</span>
                            </ContextMenuItem>
                            <ContextMenuItem
                              onSelect={() => handleMoveItems(getTargetItems(row.original))}
                              className="cursor-pointer gap-3.5 flex items-center"
                            >
                              <Scissors className="size-4.5 text-indigo-500 shrink-0" />
                              <span>移动</span>
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              onSelect={() => handleDelete(getTargetItems(row.original))}
                              className="cursor-pointer gap-2.5 flex items-center text-rose-500 focus:text-rose-500 focus:bg-rose-500/10"
                            >
                              <Trash2 className="size-4 text-rose-500 shrink-0" />
                              <span>删除</span>
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      );
                    })}
                    {paddingBottom > 0 && (
                      <tr>
                        <td colSpan={table.getVisibleFlatColumns().length} style={{ height: `${paddingBottom}px` }} className="p-0 border-0" />
                      </tr>
                    )}
                  </TableBody>
                </table>
              ) : (
                <div className="flex flex-wrap gap-4 justify-start p-4">
                  {table.getRowModel().rows.map((row) => {
                    const file = row.original;
                    return (
                      <ContextMenu key={file.path} onOpenChange={(open) => setContextMenuPath(open ? file.path : null)}>
                        <ContextMenuTrigger asChild>
                          <div
                            onClick={() => {
                              if (file.is_dir) {
                                navigateTo(file.path);
                              } else if (isVideoFile(file.name)) {
                                handlePlayVideo(file, "dialog");
                              }
                            }}
                            className={cn(
                              "flex flex-col items-center justify-center p-3 rounded-xl border border-border bg-background w-24 h-24 hover:border-primary hover:bg-muted transition-all select-none text-center cursor-default group",
                              (file.is_dir || isVideoFile(file.name)) ? "cursor-pointer hover:text-primary" : "",
                              contextMenuPath === file.path && "bg-primary/10 border-primary text-primary shadow-sm scale-[1.01]"
                            )}
                          >
                            <div className="mb-2 shrink-0">
                              {file.is_dir ? (
                                <Folder className="size-8 text-primary/70 fill-primary/30 group-hover:scale-105 transition-transform" />
                              ) : isVideoFile(file.name) ? (
                                <FileVideo className="size-8 text-indigo-500 group-hover:scale-105 transition-transform" />
                              ) : (
                                <File className="size-8 text-muted-foreground/60" />
                              )}
                            </div>
                            <span className="text-xs line-clamp-2 w-full break-all px-0.5 leading-tight font-medium">
                              {file.name}
                            </span>
                          </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-52 select-none">
                          <WebDavContextMenuTitle name={file.name} isDir={file.is_dir} />
                          <ContextMenuSeparator />
                          {!file.is_dir && (
                            <ContextMenuItem
                              onSelect={() => handleDownloadFile(file)}
                              className="cursor-pointer gap-3.5 flex items-center"
                            >
                              <Download className="size-4.5 text-sky-500 shrink-0" />
                              <span>下载文件</span>
                            </ContextMenuItem>
                          )}
                          {isVideoFile(file.name) && (
                            <>
                              <ContextMenuItem
                                    onSelect={() => handlePlayVideo(file, "dialog")}
                                className="cursor-pointer gap-3.5 flex items-center"
                              >
                                <Play className="size-4.5 text-pink-500 shrink-0" />
                                <span>弹窗预览</span>
                              </ContextMenuItem>
                              <ContextMenuItem
                                    onSelect={() => handlePlayVideo(file, "page")}
                                className="cursor-pointer gap-3.5 flex items-center"
                              >
                                <ExternalLink className="size-4.5 text-violet-500 shrink-0" />
                                <span>新页面预览</span>
                              </ContextMenuItem>
                            </>
                          )}
                          <ContextMenuSeparator />
                          {(!selectedPaths.has(file.path) || selectedPaths.size <= 1) && (
                            <ContextMenuItem
                              onSelect={() => handleRename(file)}
                              className="cursor-pointer gap-3.5 flex items-center"
                            >
                              <Pencil className="size-4.5 text-amber-500 shrink-0" />
                              <span>重命名</span>
                            </ContextMenuItem>
                          )}
                          <ContextMenuItem
                            onSelect={() => handleCopyItems(getTargetItems(file))}
                            className="cursor-pointer gap-3.5 flex items-center"
                          >
                            <Copy className="size-4.5 text-emerald-500 shrink-0" />
                            <span>复制</span>
                          </ContextMenuItem>
                          <ContextMenuItem
                            onSelect={() => handleMoveItems(getTargetItems(file))}
                            className="cursor-pointer gap-3.5 flex items-center"
                          >
                            <Scissors className="size-4.5 text-indigo-500 shrink-0" />
                            <span>移动</span>
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            onSelect={() => handleDelete(getTargetItems(file))}
                            className="cursor-pointer gap-3.5 flex items-center text-rose-500 focus:text-rose-500 focus:bg-rose-500/10"
                          >
                            <Trash2 className="size-4.5 text-rose-500 shrink-0" />
                            <span>删除</span>
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      <WebDavVideoPlayerDialog
        open={playOpen && previewMode === "dialog"}
        onOpenChange={(open) => {
          setPlayOpen(open);
          if (!open) {
            setPreviewMode("none");
            setCurrentPlayingFile(null);
          }
        }}
        videoUrl={playUrl}
        videoTitle={playTitle}
      />
      <NewTaskModal
        open={downloadModalOpen}
        onOpenChange={setDownloadModalOpen}
        initialRequest={downloadRequest}
        onInitialRequestConsumed={() => setDownloadRequest(null)}
      />

      {/* Clipboard Drawer */}
      {clipboardItems.length > 0 && (
        <div className="absolute right-4 bottom-4 z-45 flex flex-col items-end">
          {!drawerExpanded ? (
            <Button
              onClick={() => setDrawerExpanded(true)}
              className="shadow-lg rounded-full h-12 px-5 bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 cursor-pointer transition-all duration-300 transform hover:scale-105"
            >
              <HardDriveUpload className="size-5 animate-bounce" />
              <span className="font-bold text-sm">剪贴板 ({clipboardItems.length})</span>
            </Button>
          ) : (
            <div className="w-80 max-h-96 bg-background border border-border shadow-2xl rounded-xl flex flex-col overflow-hidden transition-all duration-300">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-secondary/80 border-b border-border select-none">
                <div className="flex items-center gap-2">
                  <HardDriveUpload className="size-4 text-primary" />
                  <span className="font-bold text-sm text-foreground">剪贴板收纳柜</span>
                  <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold">
                    {clipboardItems.length}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setDrawerExpanded(false)}
                  className="size-7 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="size-4" />
                </Button>
              </div>

              {/* Items List */}
              <div className="flex-1 overflow-auto p-3 space-y-2.5 max-h-60 animate-in fade-in-50 slide-in-from-bottom-5 duration-200">
                {clipboardItems.map((item) => {
                  const isCopy = item.operation === 'copy';
                  const isPastingItem = item.status === 'pasting';
                  const isSuccessItem = item.status === 'success';
                  const isErrorItem = item.status === 'error';

                  return (
                    <div key={item.path} className="flex items-center justify-between gap-3 p-2 bg-muted/30 border border-border/40 hover:border-border/80 rounded-lg transition-colors group">
                      <div className="relative size-8 shrink-0 flex items-center justify-center bg-background border border-border/50 rounded-lg">
                        {item.is_dir ? (
                          <Folder className="size-4 text-primary/70 fill-primary/30" />
                        ) : (
                          <File className="size-4 text-muted-foreground/60" />
                        )}

                        {/* Circular Progress Overlay */}
                        {isPastingItem && (
                          <div className="absolute inset-0 flex items-center justify-center bg-background/90 rounded-lg">
                            <svg className="w-8 h-8 transform -rotate-90">
                              <circle
                                cx="16"
                                cy="16"
                                r="12"
                                className="stroke-muted"
                                strokeWidth="2"
                                fill="transparent"
                              />
                              <circle
                                cx="16"
                                cy="16"
                                r="12"
                                className="stroke-primary transition-all duration-300"
                                strokeWidth="2"
                                fill="transparent"
                                strokeDasharray={2 * Math.PI * 12}
                                strokeDashoffset={2 * Math.PI * 12 - (item.progress / 100) * (2 * Math.PI * 12)}
                                strokeLinecap="round"
                              />
                            </svg>
                            <span className="absolute text-[8px] font-bold">{Math.round(item.progress)}%</span>
                          </div>
                        )}

                        {/* Success Overlay */}
                        {isSuccessItem && (
                          <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500 rounded-lg animate-in fade-in-50 zoom-in-75">
                            <Check className="size-4 text-emerald-500 font-bold" />
                          </div>
                        )}

                        {/* Error Overlay */}
                        {isErrorItem && (
                          <div className="absolute inset-0 flex items-center justify-center bg-rose-500/10 dark:bg-rose-500/20 border border-rose-500 rounded-lg">
                            <X className="size-4 text-rose-500 font-bold" />
                          </div>
                        )}
                      </div>

                      {/* File Name & Path */}
                      <div className="flex-1 min-w-0 flex flex-col">
                        <span className="text-xs font-semibold text-foreground truncate">{item.name}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-[9px] text-muted-foreground/75 truncate mt-0.5 cursor-help">
                              {item.path}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="text-[10px] break-all max-w-[240px]" side="left">
                            {item.path}
                          </TooltipContent>
                        </Tooltip>
                      </div>

                      {/* Badge / Action */}
                      <div className="flex items-center gap-1.5 shrink-0 select-none">
                        <span className={cn(
                          "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase",
                          isCopy ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/10" : "bg-indigo-500/15 text-indigo-500 border border-indigo-500/10"
                        )}>
                          {isCopy ? "复制" : "移动"}
                        </span>
                        
                        {!isPasting && !isSuccessItem && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => {
                              setClipboardItems(prev => prev.filter(i => i.path !== item.path));
                            }}
                            className="size-6 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded-md cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="size-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer Actions */}
              <div className="px-4 py-3 bg-secondary/30 border-t border-border flex items-center justify-between gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setClipboardItems([])}
                  disabled={isPasting}
                  className="text-xs font-semibold cursor-pointer py-1.5 h-8 bg-transparent"
                >
                  清空
                </Button>
                <Button
                  size="sm"
                  onClick={handlePaste}
                  disabled={isPasting || clipboardItems.every(i => i.status === 'success')}
                  className="text-xs font-semibold cursor-pointer py-1.5 h-8 gap-1.5 flex-1 shadow-md font-bold"
                >
                  {isPasting ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>粘贴中...</span>
                    </>
                  ) : (
                    <>
                      <HardDriveUpload className="size-3.5" />
                      <span>开始粘贴</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rename Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <div className="flex size-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <Pencil className="size-5" />
            </div>
            <DialogTitle>重命名项目</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-muted-foreground mb-3">
              请输入新的名称：
            </p>
            <Input
              value={renameNewName}
              onChange={(e) => setRenameNewName(e.target.value)}
              placeholder="请输入名称"
              className="w-full text-foreground bg-background"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renameNewName.trim() && renameNewName !== renameItem?.name) {
                  submitRename();
                }
              }}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              取消
            </Button>
            <Button
              onClick={submitRename}
              disabled={!renameNewName.trim() || renameNewName === renameItem?.name}
            >
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent size="sm" variant="alert">
          <DialogHeader>
            <div className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <AlertTriangle className="size-5" />
            </div>
            <DialogTitle className="text-destructive">确认删除</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <DialogDescription>
              {deleteItems.length === 1
                ? `确认删除项目“${deleteItems[0].name}”？`
                : `确认删除选中的 ${deleteItems.length} 个项目？`}
            </DialogDescription>
            <p className="text-sm leading-6 text-muted-foreground mt-2">
              此操作将永久删除 WebDAV 服务器上的文件或文件夹，且无法恢复。
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={submitDelete}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
