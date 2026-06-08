import { useDownloadStore } from "../store/useDownloadStore";

export interface TaskSpeedInfo {
  speedStr: string;
  progress: number;
  etaStr: string;
  downloadedStr: string;
  totalStr: string;
}

export function useTaskSpeed(gid: string): TaskSpeedInfo {
  const task = useDownloadStore((state) => state.tasks[gid]);

  if (!task) {
    return {
      speedStr: "0 B/s",
      progress: 0,
      etaStr: "--:--:--",
      downloadedStr: "0 B",
      totalStr: "0 B",
    };
  }

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return {
    speedStr: task.speed || "0 B/s",
    progress: task.progress || 0,
    etaStr: task.eta || "--:--:--",
    downloadedStr: formatBytes(task.downloadedBytes || 0),
    totalStr: formatBytes(task.totalBytes || 0),
  };
}
