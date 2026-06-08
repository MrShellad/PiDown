import { useState } from "react";
import { useDownloadStore } from "@/core/store/useDownloadStore";
import { useThemeStore } from "@/core/store/useThemeStore";
import { switchToMain, createTask } from "@/core/bridge/tauri-commands";
import { useAppSettingsStore } from "@/core/store/useAppSettingsStore";
import { Download } from "lucide-react";
import { UI_TEXT } from "@/core/locale";

type TauriDroppedFile = File & { path?: string };

function getDroppedFilePath(file: File) {
  return (file as TauriDroppedFile).path || file.name;
}

export default function FloatDisc() {
  const globalSpeed = useDownloadStore((state) => state.globalSpeed);
  const tasks = useDownloadStore((state) => state.tasks);
  const addTask = useDownloadStore((state) => state.addTask);
  const theme = useThemeStore((state) => state.theme);
  const settings = useAppSettingsStore((state) => state.settings);
  
  const [dragActive, setDragActive] = useState(false);

  // Calculate average downloading progress
  const activeTasks = Object.values(tasks).filter(t => t.status === "Downloading");
  const averageProgress = activeTasks.length > 0
    ? activeTasks.reduce((acc, curr) => acc + curr.progress, 0) / activeTasks.length
    : 0;

  const handleDoubleClick = async () => {
    try {
      await switchToMain();
    } catch (e) {
      console.error("Failed to call switch_to_main command", e);
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
      // For simplicity, download the file link or parse torrent
      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        const filePath = getDroppedFilePath(file);
        console.log("Dropped file:", file.name, filePath);
        // If it's a file, we can use its local file path (Tauri supports path access)
        // For security or simplicity, treat as download url if it matches or just pass the path
        if (file.name.endsWith(".torrent") || file.name.startsWith("magnet:")) {
          try {
            const gid = await createTask(
              filePath,
              settings?.download.default_save_dir || undefined
            );
            addTask(gid, filePath, file.name);
          } catch (err) {
            console.error("Failed to parse dropped torrent", err);
          }
        }
      }
    } else {
      // Check for text (e.g. Magnet links or URLs)
      const data = e.dataTransfer.getData("text");
      if (data && (data.startsWith("http://") || data.startsWith("https://") || data.startsWith("magnet:"))) {
        try {
          const gid = await createTask(data, settings?.download.default_save_dir || undefined);
          let name = "Magnet Download";
          if (data.startsWith("http")) {
            name = data.split("/").pop() || "HTTP Link";
          }
          addTask(gid, data, name);
        } catch (err) {
          console.error("Failed to download dropped URL:", err);
        }
      }
    }
  };

  // Determine styles depending on the theme
  const getDiscStyles = () => {
    if (theme === "retro") {
      return {
        background: "#c0c0c0",
        border: "3px double #ffffff",
        boxShadow: "inset -1px -1px 1px #000, inset 1px 1px 1px #fff",
        color: "#000000",
      };
    }
    if (theme === "cyberpunk") {
      return {
        background: "#03001e",
        border: `2px solid ${dragActive ? "#ff007f" : "#00f0ff"}`,
        boxShadow: dragActive ? "0 0 15px #ff007f" : "0 0 15px rgba(0, 240, 255, 0.4)",
        color: "#00f0ff",
      };
    }
    // Modern Fluid
    return {
      background: "rgba(18, 14, 32, 0.75)",
      backdropFilter: "blur(12px)",
      border: "1px solid rgba(170, 59, 255, 0.3)",
      boxShadow: "0 8px 32px 0 rgba(170, 59, 255, 0.2)",
      color: "#ffffff",
    };
  };

  return (
    <div 
      className="w-full h-full flex items-center justify-center select-none font-mono"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        onDoubleClick={handleDoubleClick}
        className="w-32 h-32 rounded-full flex flex-col items-center justify-center p-2 relative overflow-hidden transition-all duration-300 cursor-pointer"
        style={getDiscStyles()}
        data-tauri-drag-region="true"
        title={UI_TEXT.floatDisc.title}
      >
        
        {/* Dynamic Water Wave Progress backdrop for Modern Fluid */}
        {theme === "modern" && activeTasks.length > 0 && (
          <div 
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[var(--primary)] to-cyan-500/20 opacity-30 transition-all duration-500 pointer-events-none"
            style={{ height: `${averageProgress}%` }}
          />
        )}

        {/* Dynamic Scanline scanning effect for Cyberpunk */}
        {theme === "cyberpunk" && (
          <div className="absolute top-0 left-0 w-full h-[2px] bg-pink-500/30 opacity-50 animate-bounce pointer-events-none" />
        )}

        {/* Info contents */}
        {dragActive ? (
          <div className="flex flex-col items-center justify-center gap-1 text-base font-bold text-center pointer-events-none animate-bounce">
            <Download className="w-5 h-5" />
            <span>{UI_TEXT.floatDisc.releaseToDownload}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center pointer-events-none z-10">
            <span className="text-base text-[var(--muted-foreground)] font-bold uppercase tracking-wider">
              {activeTasks.length > 0 ? "SPEED" : "IDLE"}
            </span>
            <span className="text-base font-black tracking-tighter my-0.5">
              {globalSpeed}
            </span>
            {activeTasks.length > 0 && (
              <span className="text-base text-[var(--primary)] font-bold">
                {Math.round(averageProgress)}%
              </span>
            )}
          </div>
        )}

        {/* Ring outline speed indicator */}
        {activeTasks.length > 0 && theme !== "retro" && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="60"
              fill="transparent"
              stroke={theme === "cyberpunk" ? "rgba(0, 240, 255, 0.1)" : "rgba(170, 59, 255, 0.1)"}
              strokeWidth="2"
            />
            <circle
              cx="64"
              cy="64"
              r="60"
              fill="transparent"
              stroke={theme === "cyberpunk" ? "#ff007f" : "var(--primary)"}
              strokeWidth="3"
              strokeDasharray={2 * Math.PI * 60}
              strokeDashoffset={2 * Math.PI * 60 * (1 - averageProgress / 100)}
              className="transition-all duration-500"
            />
          </svg>
        )}
      </div>
    </div>
  );
}
