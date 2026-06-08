import { useDownloadStore } from "../store/useDownloadStore";
import type { Task } from "../store/useDownloadStore";
import { useMemo } from "react";

export function useActiveTasks(): Task[] {
  const tasks = useDownloadStore((state) => state.tasks);

  return useMemo(() => {
    return Object.values(tasks).filter(
      (task) => task.status === "Downloading"
    );
  }, [tasks]);
}
