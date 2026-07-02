import { useState, useEffect } from "react";
import { eventBus } from "@/core/eventBus";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MediaPlayer, MediaProvider } from "@vidstack/react";
import { DefaultVideoLayout, defaultLayoutIcons } from "@vidstack/react/player/layouts/default";
import { useAppSettingsStore } from "@/core/store/useAppSettingsStore";
import { setVideoPlayerDuration } from "@/core/bridge/tauri-commands";

// Vidstack CSS imports
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";

interface WebDavVideoPlayerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoUrl: string;
  videoTitle: string;
}

export const ZH_CN_TRANSLATIONS = {
  'Agent': '代理',
  'Accessibility': '辅助功能',
  'AirPlay': 'AirPlay',
  'All': '全部',
  'Audio': '音频',
  'Auto': '自动',
  'Background': '背景',
  'Captions': '字幕',
  'Chapters': '章节',
  'Color': '颜色',
  'Connected': '已连接',
  'Connecting': '正在连接',
  'Default': '默认',
  'Disabled': '已禁用',
  'Disconnect': '断开连接',
  'Disconnected': '已断开连接',
  'Download': '下载',
  'Family': '字体族',
  'Font': '字体',
  'Fullscreen': '全屏',
  'Google Cast': 'Google Cast',
  'Keyboard': '键盘快捷键',
  'Live': '直播',
  'Normal': '正常',
  'Off': '关闭',
  'Opacity': '不透明度',
  'Pause': '暂停',
  'Play': '播放',
  'Playback': '播放进度',
  'Quality': '画质',
  'Reset': '重置',
  'Seek': '定位',
  'Settings': '设置',
  'Size': '大小',
  'Speed': '速度',
  'Shadow': '阴影',
  'Text': '文本',
  'Track': '音轨',
  'Volume': '音量',
  'Mute': '静音',
  'Unmute': '取消静音',
  'Enter Fullscreen': '全屏',
  'Exit Fullscreen': '退出全屏',
  'Enter PiP': '画中画',
  'Exit PiP': '退出画中画',
  'Closed-Captions On': '开启字幕',
  'Closed-Captions Off': '关闭字幕',
  'Caption Styles': '字幕样式',
  'Captions look like this': '字幕显示效果如下',
  'Text Opacity': '文本不透明度',
  'Background Opacity': '背景不透明度',
  'Border': '边框',
  'Text Shadow': '文本阴影',
  'None': '无',
  'Drop Shadow': '投影',
  'Raised': '浮雕',
  'Depressed': '下沉',
  'Outline': '描边',
  'Reset Styles': '重置样式',
  'Announcements': '公告',
  'Keyboard Shortcuts': '键盘快捷键',
  'Seek Forward': '快进',
  'Seek Backward': '快退',
  'Increase Volume': '增大音量',
  'Decrease Volume': '减小音量',
  'Toggle Mute': '切换静音',
  'Toggle Fullscreen': '切换全屏',
  'Toggle PiP': '切换画中画',
  'Toggle Captions': '切换字幕',
};

export default function WebDavVideoPlayerDialog({
  open,
  onOpenChange,
  videoUrl,
  videoTitle,
}: WebDavVideoPlayerDialogProps) {
  const settings = useAppSettingsStore((state) => state.settings);
  const autoPlay = settings?.player?.auto_play ?? true;
  const defaultMuted = settings?.player?.muted ?? false;
  const defaultVolume = settings?.player?.default_volume ?? 1.0;

  const [speed, setSpeed] = useState<number>(0);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let timer: NodeJS.Timeout | null = null;

    if (open) {
      unsubscribe = eventBus.on("webdav-stream-speed", (payload) => {
        if (payload) {
          setSpeed(payload.speed_bps);

          // Watchdog timer: reset to 0 after 2 seconds of silence
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            setSpeed(0);
          }, 2000);
        }
      });
    } else {
      setSpeed(0);
    }

    return () => {
      if (unsubscribe) unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [open]);

  const formatSpeed = (bytesPerSecond: number) => {
    if (bytesPerSecond <= 0) return "";
    const kb = bytesPerSecond / 1024;
    if (kb < 1024) {
      return `${kb.toFixed(1)} KB/s`;
    }
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB/s`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        size="xl" 
        showCloseButton={true}
        className="p-0 border-none bg-black overflow-hidden sm:max-w-4xl rounded-xl aspect-video w-full"
      >
        <DialogTitle className="absolute top-0 left-0 right-0 z-10 h-14 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between px-5 text-white text-sm font-medium pointer-events-none select-none">
          <span className="pointer-events-auto truncate max-w-[60%]">{videoTitle}</span>
          {speed > 0 && (
            <span className="pointer-events-auto text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full mr-8 flex items-center gap-1.5 font-mono animate-pulse">
              <span className="size-1.5 rounded-full bg-emerald-400"></span>
              {formatSpeed(speed)}
            </span>
          )}
        </DialogTitle>
        <DialogDescription className="sr-only">WebDAV 视频播放器</DialogDescription>
        {open && (
          <MediaPlayer
            src={videoUrl}
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
                try {
                  const tempUrl = new URL(videoUrl.replace(/^webdav:\/\//, "http://"));
                  const devId = tempUrl.searchParams.get("device_id");
                  const videoPath = tempUrl.searchParams.get("path");
                  if (devId && videoPath) {
                    setVideoPlayerDuration(devId, videoPath, duration).catch(console.error);
                  }
                } catch (err) {
                  console.error("Failed to parse videoUrl or set duration:", err);
                }
              }
            }}
          >
            <MediaProvider />
            <DefaultVideoLayout 
              icons={defaultLayoutIcons} 
              translations={ZH_CN_TRANSLATIONS}
            />
          </MediaPlayer>
        )}
      </DialogContent>
    </Dialog>
  );
}
