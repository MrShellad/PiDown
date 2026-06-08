import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  pauseTask,
  resumeTask,
  cancelTask,
  openTaskFile,
  openTaskFolder,
  restartTask,
  getActiveTasks,
  getCategories,
  getTags,
  createCategory,
  updateCategory as updateCategoryConfig,
  deleteCategory,
  updateTaskCategory,
  addTaskTag,
  removeTaskTag,
  createTag,
  updateTag as updateTagConfig,
  deleteTag,
  type CategoryInput,
  type MatchRules,
  type TagInput,
} from "../bridge/tauri-commands";
import { useToastStore } from "./useToastStore";

export interface Task {
  gid: string;
  name: string;
  url: string;
  status: "Downloading" | "Paused" | "Completed" | "Failed";
  speed: string;
  progress: number; // 0 to 100
  eta: string;
  downloadedBytes: number;
  totalBytes: number;
  createdAt?: number;
  categoryId?: number | null;
  tags?: { id: number; name: string; color?: string }[];
}

export interface Category {
  id: number;
  name: string;
  icon?: string | null;
  color?: string | null;
  sortOrder: number;
  rules: MatchRules;
  savePath?: string | null;
}

export interface Tag {
  id: number;
  categoryId?: number | null;
  name: string;
  icon?: string | null;
  color?: string | null;
  rules: MatchRules;
  savePath?: string | null;
}

export interface TaskProgressPayload {
  gid: string;
  speed: string;
  progress: number;
  eta: string;
  downloaded_bytes: number;
  total_bytes: number;
}

export interface DownloadSpeedPayload {
  global_speed: string;
  active_tasks_count: number;
  tasks: TaskProgressPayload[];
}

const normalizeRules = (rules?: Partial<MatchRules> | null): MatchRules => ({
  domains: Array.isArray(rules?.domains) ? rules.domains : [],
  extensions: Array.isArray(rules?.extensions) ? rules.extensions : [],
  name_keywords: Array.isArray(rules?.name_keywords) ? rules.name_keywords : [],
  min_size_bytes: rules?.min_size_bytes ?? null,
  max_size_bytes: rules?.max_size_bytes ?? null,
});

interface DownloadState {
  tasks: Record<string, Task>;
  categories: Category[];
  tags: Tag[];
  globalSpeed: string;
  activeTasksCount: number;
  
  // Actions
  addTask: (gid: string, url: string, name: string) => void;
  updateTasksFromPayload: (payload: DownloadSpeedPayload) => void;
  toggleTask: (gid: string) => Promise<void>;
  removeTask: (gid: string, deleteFiles?: boolean) => Promise<void>;
  openTaskFile: (gid: string) => Promise<void>;
  openTaskFolder: (gid: string) => Promise<void>;
  restartTask: (gid: string) => Promise<void>;
  clearCompleted: () => void;
  fetchTasks: () => Promise<void>;
  fetchCategories: () => Promise<void>;
  fetchTags: () => Promise<void>;
  createCategory: (input: CategoryInput) => Promise<void>;
  updateCategoryConfig: (categoryId: number, input: CategoryInput) => Promise<void>;
  deleteCategory: (categoryId: number) => Promise<void>;
  updateTaskCategory: (gid: string, categoryId: number | null) => Promise<void>;
  addTaskTag: (gid: string, tagId: number) => Promise<void>;
  removeTaskTag: (gid: string, tagId: number) => Promise<void>;
  createTag: (input: TagInput) => Promise<void>;
  updateTagConfig: (tagId: number, input: TagInput) => Promise<void>;
  deleteTag: (tagId: number) => Promise<void>;
}

export const useDownloadStore = create<DownloadState>()(
  persist(
    (set, get) => ({
      tasks: {},
      categories: [],
      tags: [],
      globalSpeed: "0 B/s",
      activeTasksCount: 0,

      addTask: (gid, url, name) => {
        set((state) => ({
          tasks: {
            ...state.tasks,
            [gid]: {
              gid,
              name,
              url,
              status: "Downloading",
              speed: "0 B/s",
              progress: 0,
              eta: "--:--:--",
              downloadedBytes: 0,
              totalBytes: 0,
              createdAt: Math.floor(Date.now() / 1000),
              categoryId: null,
              tags: [],
            },
          },
        }));
      },

      updateTasksFromPayload: (payload) => {
        set((state) => {
          const updatedTasks = { ...state.tasks };
          
          // Reset speeds for tasks that are no longer active
          Object.keys(updatedTasks).forEach((gid) => {
            if (updatedTasks[gid].status === "Downloading") {
              updatedTasks[gid].speed = "0 B/s";
              updatedTasks[gid].eta = "--:--:--";
            }
          });

          // Update active tasks
          payload.tasks.forEach((activeTask) => {
            const existing = updatedTasks[activeTask.gid];
            const progress = activeTask.progress;
            const status = progress >= 100 ? "Completed" as const : "Downloading" as const;
            
            updatedTasks[activeTask.gid] = {
              gid: activeTask.gid,
              name: existing ? existing.name : `Task_${activeTask.gid.substring(0, 8)}`,
              url: existing ? existing.url : "",
              status,
              speed: activeTask.speed,
              progress: progress,
              eta: activeTask.eta,
              downloadedBytes: activeTask.downloaded_bytes,
              totalBytes: activeTask.total_bytes,
              createdAt: existing ? existing.createdAt : undefined,
              categoryId: existing ? existing.categoryId : null,
              tags: existing ? existing.tags : [],
            };
          });

          return {
            tasks: updatedTasks,
            globalSpeed: payload.global_speed,
            activeTasksCount: payload.active_tasks_count,
          };
        });
      },

      toggleTask: async (gid) => {
        const task = get().tasks[gid];
        if (!task) return;

        if (task.status === "Downloading") {
          await pauseTask(gid);
          set((state) => ({
            tasks: {
              ...state.tasks,
              [gid]: {
                ...state.tasks[gid],
                status: "Paused",
                speed: "0 B/s",
              },
            },
          }));
        } else if (task.status === "Paused" || task.status === "Failed") {
          await resumeTask(gid);
          set((state) => ({
            tasks: {
              ...state.tasks,
              [gid]: {
                ...state.tasks[gid],
                status: "Downloading",
              },
            },
          }));
        }
      },

      removeTask: async (gid, deleteFiles = false) => {
        const task = get().tasks[gid];
        if (task && (task.status === "Downloading" || task.status === "Paused")) {
          try {
            await cancelTask(gid, deleteFiles);
          } catch (e) {
            console.error("Failed to cancel task in backend", e);
          }
        } else {
          try {
            await cancelTask(gid, deleteFiles);
          } catch (e) {
            console.error("Failed to remove task in backend", e);
          }
        }
        set((state) => {
          const updated = { ...state.tasks };
          delete updated[gid];
          return { tasks: updated };
        });
      },

      openTaskFile: async (gid) => {
        try {
          await openTaskFile(gid);
        } catch (e) {
          useToastStore.getState().pushToast({
            title: "无法打开文件",
            description: String(e),
            variant: "warning",
          });
        }
      },

      openTaskFolder: async (gid) => {
        try {
          await openTaskFolder(gid);
        } catch (e) {
          useToastStore.getState().pushToast({
            title: "无法打开文件夹",
            description: String(e),
            variant: "warning",
          });
        }
      },

      restartTask: async (gid) => {
        try {
          const nextGid = await restartTask(gid);
          const task = get().tasks[gid];

          set((state) => {
            const updated = { ...state.tasks };
            delete updated[gid];

            if (task) {
              updated[nextGid] = {
                ...task,
                gid: nextGid,
                status: "Downloading",
                speed: "0 B/s",
                progress: 0,
                eta: "--:--:--",
                downloadedBytes: 0,
                totalBytes: 0,
                createdAt: Math.floor(Date.now() / 1000),
              };
            }

            return { tasks: updated };
          });

          await get().fetchTasks();
        } catch (e) {
          useToastStore.getState().pushToast({
            title: "重新下载失败",
            description: String(e),
            variant: "warning",
          });
        }
      },

      clearCompleted: () => {
        set((state) => {
          const updated = { ...state.tasks };
          Object.keys(updated).forEach((gid) => {
            if (updated[gid].status === "Completed") {
              delete updated[gid];
            }
          });
          return { tasks: updated };
        });
      },

      fetchTasks: async () => {
        try {
          const backendTasks = await getActiveTasks();
          const mappedTasks: Record<string, Task> = {};
          backendTasks.forEach((t: any) => {
            mappedTasks[t.gid] = {
              gid: t.gid,
              name: t.name,
              url: t.url,
              status: t.status,
              speed: t.speed,
              progress: t.progress,
              eta: t.eta,
              downloadedBytes: t.downloaded_bytes,
              totalBytes: t.total_bytes,
              createdAt: t.created_at,
              categoryId: t.category_id,
              tags: t.tags ? t.tags.map((tag: any) => ({
                id: tag.id,
                name: tag.name,
                icon: tag.icon || undefined,
                color: tag.color || undefined,
              })) : [],
            };
          });
          set({ tasks: mappedTasks });
        } catch (e) {
          console.error("Failed to fetch tasks from backend", e);
        }
      },

      fetchCategories: async () => {
        try {
          const cats = await getCategories();
          set({
            categories: cats.map((c: any) => ({
              id: c.id,
              name: c.name,
              icon: c.icon,
              color: c.color,
              sortOrder: c.sort_order,
              rules: normalizeRules(c.rules),
              savePath: c.save_path,
            })),
          });
        } catch (e) {
          console.error("Failed to fetch categories", e);
        }
      },

      fetchTags: async () => {
        try {
          const tgs = await getTags();
          set({
            tags: tgs.map((t: any) => ({
              id: t.id,
              categoryId: t.category_id,
              name: t.name,
              icon: t.icon,
              color: t.color,
              rules: normalizeRules(t.rules),
              savePath: t.save_path,
            })),
          });
        } catch (e) {
          console.error("Failed to fetch tags", e);
        }
      },

      updateTaskCategory: async (gid, categoryId) => {
        try {
          await updateTaskCategory(gid, categoryId);
          set((state) => {
            const task = state.tasks[gid];
            if (!task) return {};
            return {
              tasks: {
                ...state.tasks,
                [gid]: {
                  ...task,
                  categoryId,
                },
              },
            };
          });
        } catch (e) {
          console.error("Failed to update task category", e);
        }
      },

      createCategory: async (input) => {
        try {
          await createCategory({ ...input, rules: normalizeRules(input.rules) });
          const store = get();
          await store.fetchCategories();
        } catch (e) {
          console.error("Failed to create category", e);
        }
      },

      updateCategoryConfig: async (categoryId, input) => {
        try {
          await updateCategoryConfig(categoryId, { ...input, rules: normalizeRules(input.rules) });
          const store = get();
          await store.fetchCategories();
          await store.fetchTasks();
        } catch (e) {
          console.error("Failed to update category", e);
        }
      },

      deleteCategory: async (categoryId) => {
        try {
          await deleteCategory(categoryId);
          const store = get();
          await store.fetchCategories();
          await store.fetchTags();
          await store.fetchTasks();
        } catch (e) {
          console.error("Failed to delete category", e);
        }
      },

      addTaskTag: async (gid, tagId) => {
        try {
          await addTaskTag(gid, tagId);
          const store = get();
          await store.fetchTasks();
        } catch (e) {
          console.error("Failed to add task tag", e);
        }
      },

      removeTaskTag: async (gid, tagId) => {
        try {
          await removeTaskTag(gid, tagId);
          const store = get();
          await store.fetchTasks();
        } catch (e) {
          console.error("Failed to remove task tag", e);
        }
      },

      createTag: async (input) => {
        try {
          await createTag({ ...input, rules: normalizeRules(input.rules) });
          const store = get();
          await store.fetchTags();
        } catch (e) {
          console.error("Failed to create tag", e);
        }
      },

      updateTagConfig: async (tagId, input) => {
        try {
          await updateTagConfig(tagId, { ...input, rules: normalizeRules(input.rules) });
          const store = get();
          await store.fetchTags();
          await store.fetchTasks();
        } catch (e) {
          console.error("Failed to update tag", e);
        }
      },

      deleteTag: async (tagId) => {
        try {
          await deleteTag(tagId);
          const store = get();
          await store.fetchTags();
          await store.fetchTasks();
        } catch (e) {
          console.error("Failed to delete tag", e);
        }
      },
    }),
    {
      name: "pidownloader-tasks",
    }
  )
);
