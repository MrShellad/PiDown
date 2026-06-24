import { useMemo } from "react";
import { MediaPlayer, MediaProvider } from "@vidstack/react";
import { DefaultVideoLayout, defaultLayoutIcons } from "@vidstack/react/player/layouts/default";
import { ChevronLeft, FileVideo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ZH_CN_TRANSLATIONS } from "./WebDavVideoPlayerDialog";
import { useAppSettingsStore } from "@/core/store/useAppSettingsStore";
import { setVideoPlayerDuration } from "@/core/bridge/tauri-commands";
import type { WebDavFile, WebDavDevice } from "@/core/bridge/tauri-commands";
import { cn } from "@/lib/utils";

interface WebDavVideoPreviewProps {
  device: WebDavDevice;
  currentPlayingFile: WebDavFile;
  setCurrentPlayingFile: (file: WebDavFile | null) => void;
  setPreviewMode: (mode: "none" | "dialog" | "page") => void;
  videoFiles: WebDavFile[];
  speed: number;
  getPlayUrl: (file: WebDavFile) => string;
  formatFileSize: (bytes: number) => string;
  formatSpeed: (bytesPerSecond: number) => string;
}

export default function WebDavVideoPreview({
  device,
  currentPlayingFile,
  setCurrentPlayingFile,
  setPreviewMode,
  videoFiles,
  speed,
  getPlayUrl,
  formatFileSize,
  formatSpeed,
}: WebDavVideoPreviewProps) {
  // Video player settings from global app store
  const settings = useAppSettingsStore((state) => state.settings);
  const autoPlay = settings?.player?.auto_play ?? true;
  const defaultMuted = settings?.player?.muted ?? false;
  const defaultVolume = settings?.player?.default_volume ?? 1.0;

  const currentVideoUrl = useMemo(() => getPlayUrl(currentPlayingFile), [currentPlayingFile, getPlayUrl]);

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
