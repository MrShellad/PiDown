import { useState, useEffect, useCallback } from "react";
import { useDownloadStore } from "@/core/store/useDownloadStore";
import {
  switchToMain,
  createTask,
  pauseTask,
  resumeTask,
  exitApp,
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
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emitTo } from "@tauri-apps/api/event";

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

  // Ensure the window is interactive and not ignoring mouse events
  useEffect(() => {
    getCurrentWindow().setIgnoreCursorEvents(false).catch(console.error);
  }, []);

  // Display mode: hide/show float window based on active tasks and settings
  const activeTasks = Object.values(tasks).filter((t) => t.status === "Downloading");

  useEffect(() => {
    if (!settings) return;
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
  }, [settings, settings?.interface.float_display_mode, activeTasks.length]);

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

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      e.stopPropagation();
      getCurrentWindow().startDragging().catch(console.error);
    }
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
      <ContextMenu>
        <Tooltip>
          <ContextMenuTrigger asChild>
            <TooltipTrigger asChild>
              <div
                onDoubleClick={handleDoubleClick}
                onMouseDown={handleMouseDown}
                className="w-[68px] h-[68px] flex flex-col items-center justify-center relative transition-all duration-300 cursor-pointer group"
                data-tauri-drag-region="true"
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
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#1d4ed8" />
                      </linearGradient>

                      {/* Wave progress gradient */}
                      <linearGradient id="waveGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.55" />
                        <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.75" />
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
                      stroke={dragActive ? "var(--primary)" : "rgba(255, 255, 255, 0.15)"}
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
                      stroke="rgba(255, 255, 255, 0.3)"
                      strokeWidth="1.2"
                    />

                    {/* Download SVG Arrow (Idle state only) */}
                    {activeTasks.length === 0 && !dragActive && (
                      <g className="transition-all duration-300">
                        {/* Arrow Line */}
                        <path
                          d="M 40 20 L 40 46"
                          stroke="white"
                          strokeWidth="4"
                          strokeLinecap="round"
                        />
                        {/* Arrow Head */}
                        <path
                          d="M 31 37 L 40 46 L 49 37"
                          stroke="white"
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                        {/* Bracket/Tray */}
                        <path
                          d="M 26 50 L 26 54 A 2 2 0 0 0 28 56 L 52 56 A 2 2 0 0 0 54 54 L 54 50"
                          stroke="white"
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </g>
                    )}
                  </svg>

                  {/* Overlay Info Text (Active state or Drag state) */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white z-10 pointer-events-none p-2 font-sans select-none">
                    {dragActive ? (
                      <div className="flex flex-col items-center justify-center animate-bounce">
                        <Download className="w-6 h-6 text-white" />
                      </div>
                    ) : activeTasks.length > 0 ? (
                      <div className="flex flex-col items-center justify-center">
                        <span className="text-[10px] text-white/70 font-medium tracking-wide leading-none uppercase mb-0.5">
                          SPEED
                        </span>
                        <span className="text-[11px] font-extrabold tracking-tight leading-none my-0.5 max-w-[56px] truncate">
                          {globalSpeed}
                        </span>
                        <span className="text-[10px] text-[#93c5fd] font-bold leading-none mt-0.5">
                          {Math.round(averageProgress)}%
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </TooltipTrigger>
            </ContextMenuTrigger>
            <TooltipContent side="top">{UI_TEXT.floatDisc.title}</TooltipContent>
          </Tooltip>

          <ContextMenuContent>
          <ContextMenuItem onSelect={handleNewTask}>
            <Plus className="size-4 text-muted-foreground" />
            {cm.newTask}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={handleStartAll} disabled={!hasResumableTasks}>
            <Play className="size-4 text-muted-foreground" />
            {cm.startAll}
          </ContextMenuItem>
          <ContextMenuItem onSelect={handlePauseAll} disabled={!hasPausableTasks}>
            <Pause className="size-4 text-muted-foreground" />
            {cm.pauseAll}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Settings2 className="size-4 text-muted-foreground" />
              {cm.floatSettings}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuRadioGroup
                value={displayMode}
                onValueChange={(v) => changeDisplayMode(v as FloatDisplayMode)}
              >
                <ContextMenuRadioItem value="always">{cm.alwaysShow}</ContextMenuRadioItem>
                <ContextMenuRadioItem value="only_downloading">
                  {cm.onlyWhenDownloading}
                </ContextMenuRadioItem>
              </ContextMenuRadioGroup>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => changeDisplayMode("hidden")}>
                <EyeOff className="size-4 text-muted-foreground" />
                {cm.closeFloat}
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuCheckboxItem
            checked={alwaysOnTop}
            onCheckedChange={handleToggleAlwaysOnTop}
          >
            {cm.alwaysOnTop}
          </ContextMenuCheckboxItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={handleExitApp} variant="destructive">
            <LogOut className="size-4 text-muted-foreground" />
            {cm.exitApp}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
