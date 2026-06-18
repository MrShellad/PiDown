import { create } from "zustand";
import {
  pauseTask,
  resumeTask,
  cancelTask,
  clearCompletedTasks,
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
  type DbCategory,
  type DbTag,
  type TaskOverview,
  type CategoryInput,
  type MatchRules,
  type TagInput,
} from "../bridge/tauri-commands";
import { useToastStore } from "./useToastStore";
import { useAppSettingsStore } from "./useAppSettingsStore";
import { sendNativeNotification } from "../notification";

export interface Task {
  gid: string;
  name: string;
  url: string;
  status: "Pending" | "Downloading" | "Seeding" | "Paused" | "Completed" | "Failed" | "Cancelled";
  speed: string;
  progress: number; // 0 to 100
  eta: string;
  speedBps: number;
  etaSeconds: number | null;
  downloadedBytes: number;
  totalBytes: number;
  createdAt?: number;
  startedAt?: number | null;
  completedAt?: number | null;
  uploadSpeed?: string;
  errorMessage?: string | null;
  savePath?: string;
  connections?: number;
  categoryId?: number | null;
  tags?: { id: number; name: string; icon?: string; color?: string }[];
  protocol?: string;
  maxDownloadSpeedKib?: number | null;
  maxUploadSpeedKib?: number | null;
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
  connections?: number;
  speed_bps?: number;
  eta_seconds?: number | null;
  upload_speed: string;
  max_download_speed_kib?: number | null;
  max_upload_speed_kib?: number | null;
  status: "Pending" | "Downloading" | "Seeding" | "Paused" | "Completed" | "Failed" | "Cancelled";
}

export interface DownloadSpeedPayload {
  global_speed: string;
  global_download_speed?: string;
  global_upload_speed?: string;
  global_transfer_speed?: string;
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
  activeDownloadingGids: Set<string>;
  globalSpeed: string;
  globalDownloadSpeed: string;
  globalUploadSpeed: string;
  globalTransferSpeed: string;
  activeTasksCount: number;
  categoryTreeLoaded: boolean;
  categoryTreeLoading: boolean;
  
  // Actions
  addTask: (gid: string, url: string, name: string) => void;
  updateTasksFromPayload: (payload: DownloadSpeedPayload) => void;
  toggleTask: (gid: string) => Promise<void>;
  removeTask: (gid: string, deleteFiles?: boolean) => Promise<void>;
  openTaskFile: (gid: string) => Promise<void>;
  openTaskFolder: (gid: string) => Promise<void>;
  restartTask: (gid: string) => Promise<void>;
  clearCompleted: () => Promise<void>;
  fetchTasks: () => Promise<void>;
  fetchCategories: () => Promise<void>;
  fetchTags: () => Promise<void>;
  fetchCategoryTree: (force?: boolean) => Promise<void>;
  createCategory: (input: CategoryInput) => Promise<void>;
  updateCategoryConfig: (categoryId: number, input: CategoryInput) => Promise<void>;
  deleteCategory: (categoryId: number) => Promise<void>;
  reorderCategories: (newCategories: Category[]) => Promise<void>;
  updateTaskCategory: (gid: string, categoryId: number | null) => Promise<void>;
  addTaskTag: (gid: string, tagId: number) => Promise<void>;
  removeTaskTag: (gid: string, tagId: number) => Promise<void>;
  createTag: (input: TagInput) => Promise<void>;
  updateTagConfig: (tagId: number, input: TagInput) => Promise<void>;
  deleteTag: (tagId: number) => Promise<void>;
}

const mapTag = (tag: DbTag): Tag => ({
  id: tag.id,
  categoryId: tag.category_id,
  name: tag.name,
  icon: tag.icon,
  color: tag.color,
  rules: normalizeRules(tag.rules),
  savePath: tag.save_path,
});

const mapCategory = (category: DbCategory): Category => ({
  id: category.id,
  name: category.name,
  icon: category.icon,
  color: category.color,
  sortOrder: category.sort_order,
  rules: normalizeRules(category.rules),
  savePath: category.save_path,
});

const mapTask = (task: TaskOverview): Task => ({
  gid: task.gid,
  name: task.name,
  url: task.url,
  status: task.status,
  speed: task.speed,
  progress: task.progress,
  eta: task.eta,
  speedBps: task.speed_bps,
  etaSeconds: task.eta_seconds,
  downloadedBytes: task.downloaded_bytes,
  totalBytes: task.total_bytes,
  createdAt: task.created_at,
  startedAt: task.started_at,
  completedAt: task.completed_at,
  uploadSpeed: task.upload_speed,
  errorMessage: task.error_message,
  savePath: task.save_path,
  connections: 0,
  categoryId: task.category_id,
  tags: task.tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    icon: tag.icon || undefined,
    color: tag.color || undefined,
  })),
  protocol: task.protocol,
  maxDownloadSpeedKib: task.max_download_speed_kib,
  maxUploadSpeedKib: task.max_upload_speed_kib,
});

export const useDownloadStore = create<DownloadState>()((set, get) => ({
      tasks: {},
      categories: [],
      tags: [],
      activeDownloadingGids: new Set<string>(),
      globalSpeed: "0 B/s",
      globalDownloadSpeed: "0 B/s",
      globalUploadSpeed: "0 B/s",
      globalTransferSpeed: "0 B/s",
      activeTasksCount: 0,
      categoryTreeLoaded: false,
      categoryTreeLoading: false,

      addTask: (gid, url, name) => {
        set((state) => {
          const nextActive = new Set(state.activeDownloadingGids);
          nextActive.add(gid);
          return {
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
                speedBps: 0,
                etaSeconds: null,
                downloadedBytes: 0,
                totalBytes: 0,
                createdAt: Math.floor(Date.now() / 1000),
                savePath: "",
                connections: 0,
                categoryId: null,
                tags: [],
              },
            },
            activeDownloadingGids: nextActive,
          };
        });
      },

      updateTasksFromPayload: (payload) => {
        set((state) => {
          const updatedTasks = { ...state.tasks };
          const newActiveGids = new Set<string>();
          
          // Reset speeds for tasks that are no longer active, using activeDownloadingGids
          const payloadActiveGids = new Set(payload.tasks.map((t) => t.gid));
          state.activeDownloadingGids.forEach((gid) => {
            if (!payloadActiveGids.has(gid) && updatedTasks[gid]) {
              updatedTasks[gid] = {
                ...updatedTasks[gid],
                speed: "0 B/s",
                speedBps: 0,
                eta: "--:--:--",
                etaSeconds: null,
                connections: 0,
              };
            }
          });

          // Update active tasks
          payload.tasks.forEach((activeTask) => {
            const existing = updatedTasks[activeTask.gid];
            const progress = activeTask.progress;
            const status = activeTask.status;
            
            if (status === "Downloading" || status === "Seeding") {
              newActiveGids.add(activeTask.gid);
            }

            // Play sound/notification if task completes or fails (transition from active)
            const wasActiveBefore = existing && (existing.status === "Downloading" || existing.status === "Pending");
            const isCompletedNow = status === "Completed" || status === "Seeding";
            const wasCompletedBefore = existing && (existing.status === "Completed" || existing.status === "Seeding");
            const isFailedNow = status === "Failed";
            const wasFailedBefore = existing && (existing.status === "Failed");

            if (isCompletedNow && !wasCompletedBefore && wasActiveBefore) {
              const settings = useAppSettingsStore.getState().settings;
              if (settings) {
                if (settings.interface.enable_notifications ?? true) {
                  const taskName = existing?.name || `Task_${activeTask.gid.substring(0, 8)}`;
                  sendNativeNotification("下载已完成", `文件 "${taskName}" 下载成功。`);
                }
              }
            } else if (isFailedNow && !wasFailedBefore && wasActiveBefore) {
              const settings = useAppSettingsStore.getState().settings;
              if (settings && (settings.interface.enable_notifications ?? true)) {
                const taskName = existing?.name || `Task_${activeTask.gid.substring(0, 8)}`;
                sendNativeNotification("下载失败", `文件 "${taskName}" 下载失败，请检查网络或链接。`);
              }
            }

            let startedAt = existing ? existing.startedAt : undefined;
            let completedAt = existing ? existing.completedAt : undefined;
            if ((status === "Downloading" || status === "Seeding") && !startedAt) {
              startedAt = Math.floor(Date.now() / 1000);
            }
            if ((status === "Completed" || status === "Seeding") && !completedAt) {
              completedAt = Math.floor(Date.now() / 1000);
            }

            updatedTasks[activeTask.gid] = {
              gid: activeTask.gid,
              name: existing ? existing.name : `Task_${activeTask.gid.substring(0, 8)}`,
              url: existing ? existing.url : "",
              status,
              speed: activeTask.speed,
              progress: progress,
              eta: activeTask.eta,
              speedBps: activeTask.speed_bps ?? 0,
              etaSeconds: activeTask.eta_seconds ?? null,
              downloadedBytes: activeTask.downloaded_bytes,
              totalBytes: activeTask.total_bytes,
              createdAt: existing ? existing.createdAt : undefined,
              startedAt,
              completedAt,
              uploadSpeed: activeTask.upload_speed,
              errorMessage: existing ? existing.errorMessage : null,
              savePath: existing ? existing.savePath : "",
              connections: activeTask.connections ?? existing?.connections ?? 0,
              categoryId: existing ? existing.categoryId : null,
              tags: existing ? existing.tags : [],
              protocol: existing ? existing.protocol : undefined,
              maxDownloadSpeedKib: existing ? existing.maxDownloadSpeedKib : undefined,
              maxUploadSpeedKib: existing ? existing.maxUploadSpeedKib : undefined,
            };
          });

          return {
            tasks: updatedTasks,
            activeDownloadingGids: newActiveGids,
            globalSpeed: payload.global_speed,
            globalDownloadSpeed: payload.global_download_speed ?? payload.global_speed,
            globalUploadSpeed: payload.global_upload_speed ?? "0 B/s",
            globalTransferSpeed: payload.global_transfer_speed ?? payload.global_speed,
            activeTasksCount: payload.active_tasks_count,
          };
        });
      },

      toggleTask: async (gid) => {
        const task = get().tasks[gid];
        if (!task) return;

        if (task.status === "Downloading") {
          await pauseTask(gid);
          set((state) => {
            const nextActive = new Set(state.activeDownloadingGids);
            nextActive.delete(gid);
            return {
              tasks: {
                ...state.tasks,
                [gid]: {
                  ...state.tasks[gid],
                  status: "Paused",
                  speed: "0 B/s",
                  speedBps: 0,
                },
              },
              activeDownloadingGids: nextActive,
            };
          });
        } else if (task.status === "Paused" || task.status === "Failed") {
          await resumeTask(gid);
          set((state) => {
            const nextActive = new Set(state.activeDownloadingGids);
            nextActive.add(gid);
            return {
              tasks: {
                ...state.tasks,
                [gid]: {
                  ...state.tasks[gid],
                  status: "Downloading",
                },
              },
              activeDownloadingGids: nextActive,
            };
          });
        }
      },

      removeTask: async (gid, deleteFiles = false) => {
        try {
          await cancelTask(gid, deleteFiles);
        } catch (e) {
          useToastStore.getState().pushToast({
            title: "删除任务失败",
            description: String(e),
            variant: "warning",
          });
          return;
        }

        set((state) => {
          const updated = { ...state.tasks };
          delete updated[gid];
          const nextActive = new Set(state.activeDownloadingGids);
          nextActive.delete(gid);
          return { tasks: updated, activeDownloadingGids: nextActive };
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
            const nextActive = new Set(state.activeDownloadingGids);
            nextActive.delete(gid);

            if (task) {
              nextActive.add(nextGid);
              updated[nextGid] = {
                ...task,
                gid: nextGid,
                status: "Downloading",
                speed: "0 B/s",
                progress: 0,
                eta: "--:--:--",
                speedBps: 0,
                etaSeconds: null,
                downloadedBytes: 0,
                totalBytes: 0,
                createdAt: Math.floor(Date.now() / 1000),
                connections: 0,
              };
            }

            return { tasks: updated, activeDownloadingGids: nextActive };
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

      clearCompleted: async () => {
        try {
          await clearCompletedTasks(false);
          await get().fetchTasks();
        } catch (e) {
          useToastStore.getState().pushToast({
            title: "清空已完成失败",
            description: String(e),
            variant: "warning",
          });
        }
      },

      fetchTasks: async () => {
        try {
          const backendTasks = await getActiveTasks();
          const mappedTasks: Record<string, Task> = {};
          const newActiveGids = new Set<string>();
          backendTasks.forEach((task) => {
            mappedTasks[task.gid] = mapTask(task);
            if (task.status === "Downloading") {
              newActiveGids.add(task.gid);
            }
          });
          set({ tasks: mappedTasks, activeDownloadingGids: newActiveGids });
        } catch (e) {
          console.error("Failed to fetch tasks from backend", e);
        }
      },

      fetchCategories: async () => {
        try {
          const cats = await getCategories();
          set({ categories: cats.map(mapCategory) });
        } catch (e) {
          console.error("Failed to fetch categories", e);
          throw e;
        }
      },

      fetchTags: async () => {
        try {
          const tgs = await getTags();
          set({ tags: tgs.map(mapTag) });
        } catch (e) {
          console.error("Failed to fetch tags", e);
          throw e;
        }
      },

      fetchCategoryTree: async (force = false) => {
        const state = get();
        if (state.categoryTreeLoading) return;
        if (!force && state.categoryTreeLoaded) return;

        set({ categoryTreeLoading: true });
        try {
          await Promise.all([state.fetchCategories(), state.fetchTags()]);
          set({ categoryTreeLoaded: true });
        } finally {
          set({ categoryTreeLoading: false });
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
          await store.fetchCategoryTree(true);
        } catch (e) {
          console.error("Failed to create category", e);
        }
      },

      updateCategoryConfig: async (categoryId, input) => {
        try {
          await updateCategoryConfig(categoryId, { ...input, rules: normalizeRules(input.rules) });
          const store = get();
          await store.fetchCategoryTree(true);
          await store.fetchTasks();
        } catch (e) {
          console.error("Failed to update category", e);
        }
      },

      deleteCategory: async (categoryId) => {
        try {
          await deleteCategory(categoryId);
          const store = get();
          await store.fetchCategoryTree(true);
          await store.fetchTasks();
        } catch (e) {
          console.error("Failed to delete category", e);
        }
      },

      reorderCategories: async (newCategories) => {
        const updated = newCategories.map((c, index) => ({
          ...c,
          sortOrder: index + 1,
        }));

        const catMap = new Map(updated.map((c) => [c.id, c]));
        const nextCategories = get().categories.map((c) => {
          const match = catMap.get(c.id);
          return match ? { ...c, sortOrder: match.sortOrder } : c;
        });

        nextCategories.sort((a, b) => a.sortOrder - b.sortOrder);
        set({ categories: nextCategories });

        try {
          await Promise.all(
            updated.map((c) => {
              const input: CategoryInput = {
                name: c.name,
                icon: c.icon,
                color: c.color,
                sort_order: c.sortOrder,
                rules: c.rules,
                save_path: c.savePath,
              };
              return updateCategoryConfig(c.id, input);
            })
          );
          await get().fetchCategoryTree(true);
        } catch (e) {
          console.error("Failed to persist reordered categories", e);
          await get().fetchCategoryTree(true);
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
          await store.fetchCategoryTree(true);
        } catch (e) {
          console.error("Failed to create tag", e);
        }
      },

      updateTagConfig: async (tagId, input) => {
        try {
          await updateTagConfig(tagId, { ...input, rules: normalizeRules(input.rules) });
          const store = get();
          await store.fetchCategoryTree(true);
          await store.fetchTasks();
        } catch (e) {
          console.error("Failed to update tag", e);
        }
      },

      deleteTag: async (tagId) => {
        try {
          await deleteTag(tagId);
          const store = get();
          await store.fetchCategoryTree(true);
          await store.fetchTasks();
        } catch (e) {
          console.error("Failed to delete tag", e);
        }
      },
    }));
