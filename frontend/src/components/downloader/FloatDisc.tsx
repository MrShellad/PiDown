import { useState, useEffect, useCallback, useRef } from "react";
import { useDownloadStore } from "@/core/store/useDownloadStore";
import {
  switchToMain,
  createTask,
  pauseTask,
  resumeTask,
  exitApp,
  getCursorScreenPos,
  type FloatDisplayMode,
  type AppSettings,
} from "@/core/bridge/tauri-commands";
import { useAppSettingsStore } from "@/core/store/useAppSettingsStore";
import { Download, Plus, Play, Pause, Settings2, LogOut, EyeOff } from "lucide-react";
import { UI_TEXT } from "@/core/locale";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { getCurrentWindow, currentMonitor, LogicalSize, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";
import { emitTo, listen } from "@tauri-apps/api/event";
import NewTaskModal from "./NewTaskModal";
import type { ExternalDownloadRequest } from "@/core/bridge/external-download";

type TauriDroppedFile = File & { path?: string };
function getDroppedFilePath(file: File) {
  return (file as TauriDroppedFile).path || file.name;
}

export default function FloatDisc() {
  const globalSpeed = useDownloadStore((state) => state.globalSpeed);
  const tasks = useDownloadStore((state) => state.tasks);
  const addTask = useDownloadStore((state) => state.addTask);
  const fetchTasks = useDownloadStore((state) => state.fetchTasks);
  const settings = useAppSettingsStore((state) => state.settings);

  const [dragActive, setDragActive] = useState(false);
  const displayMode = settings?.interface.float_display_mode || "always";
  const [alwaysOnTop, setAlwaysOnTop] = useState(true); // float window defaults to always on top

  const [modalOpen, setModalOpen] = useState(false);
  const [externalDownloadRequest, setExternalDownloadRequest] = useState<ExternalDownloadRequest | null>(null);

  const originalPositionRef = useRef<PhysicalPosition | null>(null);
  const originalSizeRef = useRef<PhysicalSize | null>(null);
  const isModalOpenRef = useRef(false);

  useEffect(() => {
    isModalOpenRef.current = modalOpen;
  }, [modalOpen]);

  const handleOpenModal = useCallback(async (req: ExternalDownloadRequest) => {
    console.log("FloatDisc: handleOpenModal triggered with request:", req);
    try {
      const win = getCurrentWindow();
      await win.show();
      await win.unminimize();
      await win.setFocus();

      const size = await win.outerSize();
      const pos = await win.outerPosition();
      originalSizeRef.current = size;
      originalPositionRef.current = pos;
      console.log("FloatDisc: Saved original window position:", pos, "size:", size);

      await win.setIgnoreCursorEvents(false);
      await win.setResizable(true);
      await win.setSize(new LogicalSize(736, 420));
      await win.center();
      console.log("FloatDisc: Resized window to 736x420 and centered.");

      setExternalDownloadRequest(req);
      setModalOpen(true);
    } catch (e) {
      console.error("Failed to open task modal in float window:", e);
    }
  }, []);

  const handleCloseModal = useCallback(async () => {
    console.log("FloatDisc: handleCloseModal triggered");
    try {
      const win = getCurrentWindow();
      setModalOpen(false);
      setExternalDownloadRequest(null);

      if (originalSizeRef.current) {
        await win.setSize(originalSizeRef.current);
      } else {
        await win.setSize(new LogicalSize(500, 500));
      }

      await win.setResizable(false);

      if (originalPositionRef.current) {
        await win.setPosition(originalPositionRef.current);
      }
      console.log("FloatDisc: Restored window position and size.");
    } catch (e) {
      console.error("Failed to restore float window position/size:", e);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlistenExternalDownload: (() => void) | undefined;

    console.log("FloatDisc: Registering listener for external-download-request");
    listen<ExternalDownloadRequest>("external-download-request", (event) => {
      console.log("FloatDisc: Received external-download-request event:", event);
      handleOpenModal(event.payload).catch(console.error);
    })
      .then((unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }
        unlistenExternalDownload = unlisten;
        console.log("FloatDisc: Successfully registered event listener");
      })
      .catch((error) => {
        console.error("Failed to listen to external-download-request in float window:", error);
      });

    return () => {
      disposed = true;
      unlistenExternalDownload?.();
      console.log("FloatDisc: Unregistered event listener");
    };
  }, [handleOpenModal]);

  // Dynamically resize window to fit the DialogContent height when modal is open
  useEffect(() => {
    if (!modalOpen) return;

    let active = true;
    let observer: ResizeObserver | null = null;

    const resizeToFit = async () => {
      try {
        const el = document.querySelector('[data-slot="dialog-content"]') as HTMLElement;
        if (!el || !active) return;

        const win = getCurrentWindow();
        const height = el.offsetHeight;
        if (height > 0) {
          console.log("FloatDisc: Detected dialog height:", height);
          await win.setResizable(true);
          await win.setSize(new LogicalSize(736, height));
        }
      } catch (err) {
        console.error("FloatDisc: Failed to resize window to dialog height:", err);
      }
    };

    const run = () => {
      const el = document.querySelector('[data-slot="dialog-content"]');
      if (el) {
        observer = new ResizeObserver(() => {
          resizeToFit().catch(console.error);
        });
        observer.observe(el);
        resizeToFit().catch(console.error);
      } else {
        requestAnimationFrame(run);
      }
    };

    requestAnimationFrame(run);

    return () => {
      active = false;
      if (observer) {
        observer.disconnect();
      }
    };
  }, [modalOpen]);

  // Set html and body backgrounds to transparent for Tauri window transparency
  useEffect(() => {
    const originalBg = document.body.style.background;
    const originalHtmlBg = document.documentElement.style.background;

    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";

    return () => {
      document.body.style.background = originalBg;
      document.documentElement.style.background = originalHtmlBg;
    };
  }, []);

  const isMenuOpenRef = useRef(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    isMenuOpenRef.current = isMenuOpen;
  }, [isMenuOpen]);

  // Mouse pass-through toggler based on cursor distance from the float disc center
  useEffect(() => {
    let active = true;
    let isIgnore = false;

    const interval = setInterval(async () => {
      if (!active) return;
      try {
        const win = getCurrentWindow();
        const isVisible = await win.isVisible();
        if (!isVisible) return;

        // If the context menu or modal is open, always allow mouse events (do not ignore)
        if (isMenuOpenRef.current || isModalOpenRef.current) {
          if (isIgnore) {
            isIgnore = false;
            await win.setIgnoreCursorEvents(false);
          }
          return;
        }

        // Get cursor position in physical pixels
        const [cursorX, cursorY] = await getCursorScreenPos();

        // Get window position and size in physical pixels
        const position = await win.outerPosition();
        const size = await win.outerSize();

        // Calculate distance from center of window
        const centerX = position.x + size.width / 2;
        const centerY = position.y + size.height / 2;

        const dx = cursorX - centerX;
        const dy = cursorY - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Float disc radius is 80 / 2 = 40 CSS pixels. Convert to physical pixels with devicePixelRatio.
        const dpr = window.devicePixelRatio || 1;
        const threshold = (40 + 6) * dpr; // 40px radius + 6px buffer

        const shouldIgnore = distance > threshold;

        if (shouldIgnore !== isIgnore) {
          isIgnore = shouldIgnore;
          await win.setIgnoreCursorEvents(shouldIgnore);
        }
      } catch (err) {
        // Silent error
      }
    }, 100);

    return () => {
      active = false;
      clearInterval(interval);
      getCurrentWindow().setIgnoreCursorEvents(false).catch(console.error);
    };
  }, []);

  // Snap-to-edge logic
  const snapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const performSnap = useCallback(async () => {
    if (isModalOpenRef.current) return;

    try {
      const win = getCurrentWindow();
      const size = await win.outerSize();
      if (size.width > 550 || size.height > 550) return;

      const monitor = await currentMonitor();
      if (!monitor) return;

      const pos = await win.outerPosition();
      const dpr = window.devicePixelRatio || 1;
      const discRadius = 40 * dpr;

      const discCenterX = pos.x + size.width / 2;
      const discCenterY = pos.y + size.height / 2;

      const monitorLeft = monitor.position.x;
      const monitorRight = monitor.position.x + monitor.size.width;
      const monitorTop = monitor.position.y;
      const monitorBottom = monitor.position.y + monitor.size.height;

      const distLeft = discCenterX - monitorLeft;
      const distRight = monitorRight - discCenterX;
      const distTop = discCenterY - monitorTop;
      const distBottom = monitorBottom - discCenterY;

      const minDist = Math.min(distLeft, distRight, distTop, distBottom);

      let targetX = pos.x;
      let targetY = pos.y;
      const padding = 2 * dpr;

      if (minDist === distLeft) {
        targetX = Math.round(monitorLeft + padding + discRadius - size.width / 2);
      } else if (minDist === distRight) {
        targetX = Math.round(monitorRight - padding - discRadius - size.width / 2);
      } else if (minDist === distTop) {
        targetY = Math.round(monitorTop + padding + discRadius - size.height / 2);
      } else {
        targetY = Math.round(monitorBottom - padding - discRadius - size.height / 2);
      }

      if (minDist === distLeft || minDist === distRight) {
        const minY = monitorTop + padding + discRadius - size.height / 2;
        const maxY = monitorBottom - padding - discRadius - size.height / 2;
        targetY = Math.max(minY, Math.min(maxY, targetY));
      } else {
        const minX = monitorLeft + padding + discRadius - size.width / 2;
        const maxX = monitorRight - padding - discRadius - size.width / 2;
        targetX = Math.max(minX, Math.min(maxX, targetX));
      }

      if (Math.abs(pos.x - targetX) > 1 || Math.abs(pos.y - targetY) > 1) {
        await win.setPosition(new PhysicalPosition(targetX, targetY));
      }
    } catch (err) {
      console.error("Failed to perform snap to edge:", err);
    }
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      const win = getCurrentWindow();
      unlisten = await win.onMoved(() => {
        if (isModalOpenRef.current) return;

        if (snapTimeoutRef.current) {
          clearTimeout(snapTimeoutRef.current);
        }

        snapTimeoutRef.current = setTimeout(() => {
          performSnap();
        }, 150);
      });
    };

    setupListener().catch(console.error);

    return () => {
      if (unlisten) unlisten();
      if (snapTimeoutRef.current) clearTimeout(snapTimeoutRef.current);
    };
  }, [performSnap]);

  // Display mode: hide/show float window based on active tasks and settings
  const activeTasks = Object.values(tasks).filter((t) => t.status === "Downloading");

  useEffect(() => {
    if (!settings || modalOpen) return;
    const mode = settings.interface.float_display_mode;
    const win = getCurrentWindow();

    if (mode === "hidden") {
      win.hide().catch(console.error);
    } else if (mode === "always") {
      win.show().catch(console.error);
    } else if (mode === "only_downloading") {
      if (activeTasks.length === 0) {
        win.hide().catch(console.error);
      } else {
        win.show().catch(console.error);
      }
    }
  }, [settings, settings?.interface.float_display_mode, activeTasks.length, modalOpen]);

  // Persist display mode changes to settings store
  const changeDisplayMode = useCallback(async (mode: FloatDisplayMode) => {
    if (!settings) return;
    const nextSettings: AppSettings = {
      ...settings,
      interface: {
        ...settings.interface,
        float_display_mode: mode,
      },
    };
    try {
      await useAppSettingsStore.getState().save(nextSettings);
    } catch (e) {
      console.error("Failed to save float display mode", e);
    }
  }, [settings]);

  // Toggle always-on-top
  const handleToggleAlwaysOnTop = useCallback(() => {
    const newValue = !alwaysOnTop;
    setAlwaysOnTop(newValue);
    getCurrentWindow().setAlwaysOnTop(newValue).catch(console.error);
  }, [alwaysOnTop]);

  // Calculate average downloading progress
  const averageProgress =
    activeTasks.length > 0
      ? activeTasks.reduce((acc, curr) => acc + curr.progress, 0) / activeTasks.length
      : 0;

  const handleDoubleClick = async () => {
    try {
      await switchToMain();
    } catch (e) {
      console.error("Failed to call switch_to_main command", e);
    }
  };

  const [mouseDownInfo, setMouseDownInfo] = useState<{ x: number; y: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setMouseDownInfo({ x: e.screenX, y: e.screenY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (mouseDownInfo) {
      const deltaX = e.screenX - mouseDownInfo.x;
      const deltaY = e.screenY - mouseDownInfo.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      if (distance > 5) {
        setMouseDownInfo(null);
        getCurrentWindow().startDragging().catch(console.error);
      }
    }
  };

  const handleMouseUp = () => {
    setMouseDownInfo(null);
  };


  // Context menu handlers
  const handleNewTask = async () => {
    try {
      await switchToMain();
      // Give the main window a moment to show, then emit the event
      setTimeout(() => {
        emitTo("main", "open-new-task").catch(console.error);
      }, 200);
    } catch (e) {
      console.error("Failed to open new task from float", e);
    }
  };

  const handleStartAll = async () => {
    const allTasks = Object.values(tasks);
    for (const task of allTasks) {
      if (task.status === "Paused" || task.status === "Failed" || task.status === "Cancelled") {
        try {
          await resumeTask(task.gid);
        } catch (e) {
          console.error(`Failed to resume task ${task.gid}`, e);
        }
      }
    }
    await fetchTasks();
  };

  const handlePauseAll = async () => {
    const allTasks = Object.values(tasks);
    for (const task of allTasks) {
      if (task.status === "Downloading" || task.status === "Pending") {
        try {
          await pauseTask(task.gid);
        } catch (e) {
          console.error(`Failed to pause task ${task.gid}`, e);
        }
      }
    }
    await fetchTasks();
  };

  const handleExitApp = async () => {
    try {
      await exitApp();
    } catch (e) {
      console.error("Failed to exit app", e);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);

    // Check if dragging files
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        const filePath = getDroppedFilePath(file);
        console.log("Dropped file:", file.name, filePath);
        if (file.name.endsWith(".torrent") || file.name.startsWith("magnet:")) {
          try {
            const gid = await createTask(
              filePath,
              settings?.download.default_save_dir || undefined
            );
            addTask(gid, filePath, file.name);
            await fetchTasks();
          } catch (err) {
            console.error("Failed to parse dropped torrent", err);
          }
        }
      }
    } else {
      // Check for text (e.g. Magnet links or URLs)
      const data = e.dataTransfer.getData("text");
      if (
        data &&
        (data.startsWith("http://") || data.startsWith("https://") || data.startsWith("magnet:"))
      ) {
        try {
          const gid = await createTask(data, settings?.download.default_save_dir || undefined);
          let name = "Magnet Download";
          if (data.startsWith("http")) {
            name = data.split("/").pop() || "HTTP Link";
          }
          addTask(gid, data, name);
          await fetchTasks();
        } catch (err) {
          console.error("Failed to download dropped URL:", err);
        }
      }
    }
  };

  const cm = UI_TEXT.floatDisc.contextMenu;

  // Check if there are resumable or pausable tasks for enabling/disabling menu items
  const allTasksList = Object.values(tasks);
  const hasResumableTasks = allTasksList.some(
    (t) => t.status === "Paused" || t.status === "Failed" || t.status === "Cancelled"
  );
  const hasPausableTasks = allTasksList.some(
    (t) => t.status === "Downloading" || t.status === "Pending"
  );

  return (
    <div
      className="w-full h-full flex items-center justify-center select-none font-sans"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {!modalOpen && (
      <ContextMenu onOpenChange={setIsMenuOpen}>
        <ContextMenuTrigger asChild>
          <div className="flex items-center justify-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  onDoubleClick={handleDoubleClick}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  className="w-[80px] h-[80px] flex flex-col items-center justify-center relative transition-all duration-300 cursor-pointer group"
                >

                  {/* SVG Rounded Rectangle Background and Wave */}
                  <svg
                    viewBox="0 0 80 80"
                    className="absolute inset-0 w-full h-full group-hover:scale-105 transition-transform duration-300 pointer-events-none"
                  >
                    <defs>
                      {/* Rounded rectangle mask for clipping the wave progress */}
                      <mask id="rectMask">
                        <rect x="2" y="2" width="76" height="76" rx="16" fill="white" />
                      </mask>

                      {/* Background linear gradient */}
                      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style={{ stopColor: "var(--float-disc-bg-start)" }} />
                        <stop offset="100%" style={{ stopColor: "var(--float-disc-bg-end)" }} />
                      </linearGradient>

                      {/* Wave progress gradient */}
                      <linearGradient id="waveGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style={{ stopColor: "var(--float-disc-wave-accent, var(--primary))" }} stopOpacity="0.4" />
                        <stop offset="100%" style={{ stopColor: "color-mix(in oklch, var(--float-disc-wave-accent, var(--primary)), black 20%)" }} stopOpacity="0.6" />
                      </linearGradient>

                      {/* Top highlight gradient */}
                      <linearGradient id="topHighlightGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" style={{ stopColor: "var(--float-disc-highlight-color, white)" }} stopOpacity="0" />
                        <stop offset="15%" style={{ stopColor: "var(--float-disc-highlight-color, white)" }} stopOpacity="0" />
                        <stop offset="50%" style={{ stopColor: "var(--float-disc-highlight-color, white)" }} stopOpacity="0.65" />
                        <stop offset="85%" style={{ stopColor: "var(--float-disc-highlight-color, white)" }} stopOpacity="0" />
                        <stop offset="100%" style={{ stopColor: "var(--float-disc-highlight-color, white)" }} stopOpacity="0" />
                      </linearGradient>
                    </defs>

                    {/* Outer Rounded Rect Shape */}
                    <rect
                      x="2"
                      y="2"
                      width="76"
                      height="76"
                      rx="16"
                      fill="url(#bgGrad)"
                      stroke={dragActive ? "var(--primary)" : "var(--border)"}
                      strokeWidth={dragActive ? 3 : 1}
                      className="transition-all duration-300"
                    />

                    {/* Water wave filling when active */}
                    {activeTasks.length > 0 && (
                      <rect
                        x="0"
                        y={80 - averageProgress * 0.8}
                        width="80"
                        height="80"
                        fill="url(#waveGrad)"
                        mask="url(#rectMask)"
                        className="transition-all duration-500"
                      />
                    )}

                    {/* Inner border (glossy look) */}
                    <rect
                      x="5"
                      y="5"
                      width="70"
                      height="70"
                      rx="13"
                      fill="none"
                      stroke="color-mix(in oklch, var(--float-disc-color, currentColor), transparent 75%)"
                      strokeWidth="1.2"
                    />

                    {/* Top highlight reflection */}
                    <path
                      d="M 5 20 A 13 13 0 0 1 18 5 L 62 5 A 13 13 0 0 1 75 20"
                      fill="none"
                      stroke="url(#topHighlightGrad)"
                      strokeWidth="1.4"
                    />

                    {/* Download SVG Arrow (Idle state only) */}
                    {activeTasks.length === 0 && !dragActive && (
                      <g className="transition-all duration-300">
                        {/* Arrow Line */}
                        <path
                          d="M 40 20 L 40 46"
                          stroke="var(--float-disc-color, currentColor)"
                          strokeWidth="4"
                          strokeLinecap="round"
                        />
                        {/* Arrow Head */}
                        <path
                          d="M 31 37 L 40 46 L 49 37"
                          stroke="var(--float-disc-color, currentColor)"
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                        {/* Bracket/Tray */}
                        <path
                          d="M 26 50 L 26 54 A 2 2 0 0 0 28 56 L 52 56 A 2 2 0 0 0 54 54 L 54 50"
                          stroke="var(--float-disc-color, currentColor)"
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </g>
                    )}
                  </svg>

                  {/* Overlay Info Text (Active state or Drag state) */}
                  <div 
                    className="absolute inset-0 flex flex-col items-center justify-center text-center z-10 pointer-events-none p-2.5 font-sans select-none"
                    style={{ color: "var(--float-disc-color, currentColor)" }}
                  >
                    {dragActive ? (
                      <div className="flex flex-col items-center justify-center animate-bounce">
                        <Download className="w-7 h-7 text-current" />
                      </div>
                    ) : activeTasks.length > 0 ? (
                      <div className="flex flex-col items-center justify-center gap-0.5">
                        <span className="text-[10px] opacity-80 font-normal tracking-wider leading-none uppercase">
                          SPEED
                        </span>
                        <span className="text-[13px] font-normal tracking-tight leading-none max-w-[64px] truncate drop-shadow-xs">
                          {globalSpeed}
                        </span>
                        <span className="text-[11px] font-normal leading-none opacity-95">
                          {Math.round(averageProgress)}%
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">{UI_TEXT.floatDisc.title}</TooltipContent>
            </Tooltip>
          </div>
        </ContextMenuTrigger>


          <ContextMenuContent className="min-w-44 p-1">
          <ContextMenuItem onSelect={handleNewTask} className="h-8 gap-2 px-2.5 text-[13px]">
            <Plus className="size-4 text-muted-foreground" />
            {cm.newTask}
          </ContextMenuItem>
          <ContextMenuSeparator className="my-0.5" />
          <ContextMenuItem onSelect={handleStartAll} disabled={!hasResumableTasks} className="h-8 gap-2 px-2.5 text-[13px]">
            <Play className="size-4 text-muted-foreground" />
            {cm.startAll}
          </ContextMenuItem>
          <ContextMenuItem onSelect={handlePauseAll} disabled={!hasPausableTasks} className="h-8 gap-2 px-2.5 text-[13px]">
            <Pause className="size-4 text-muted-foreground" />
            {cm.pauseAll}
          </ContextMenuItem>
          <ContextMenuSeparator className="my-0.5" />
          <ContextMenuSub>
            <ContextMenuSubTrigger className="h-8 gap-2 px-2.5 text-[13px]">
              <Settings2 className="size-4 text-muted-foreground" />
              {cm.floatSettings}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="min-w-44 p-1">
              <ContextMenuRadioGroup
                value={displayMode}
                onValueChange={(v) => changeDisplayMode(v as FloatDisplayMode)}
              >
                <ContextMenuRadioItem value="always" className="h-8 pr-2.5 pl-8 text-[13px]">
                  {cm.alwaysShow}
                </ContextMenuRadioItem>
                <ContextMenuRadioItem value="only_downloading" className="h-8 pr-2.5 pl-8 text-[13px]">
                  {cm.onlyWhenDownloading}
                </ContextMenuRadioItem>
              </ContextMenuRadioGroup>
              <ContextMenuSeparator className="my-0.5" />
              <ContextMenuItem onSelect={() => changeDisplayMode("hidden")} className="h-8 gap-2 px-2.5 text-[13px]">
                <EyeOff className="size-4 text-muted-foreground" />
                {cm.closeFloat}
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator className="my-0.5" />
          <ContextMenuCheckboxItem
            checked={alwaysOnTop}
            onCheckedChange={handleToggleAlwaysOnTop}
            className="h-8 pr-2.5 pl-8 text-[13px]"
          >
            {cm.alwaysOnTop}
          </ContextMenuCheckboxItem>
          <ContextMenuSeparator className="my-0.5" />
          <ContextMenuItem onSelect={handleExitApp} variant="destructive" className="h-8 gap-2 px-2.5 text-[13px]">
            <LogOut className="size-4 text-muted-foreground" />
            {cm.exitApp}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      )}

      <NewTaskModal
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseModal().catch(console.error);
          }
        }}
        initialRequest={externalDownloadRequest}
        onInitialRequestConsumed={() => setExternalDownloadRequest(null)}
      />
    </div>
  );
}
