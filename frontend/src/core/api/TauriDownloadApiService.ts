import type { DownloadApiService } from "./DownloadApiService";
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
  updateCategory as tauriUpdateCategory,
  deleteCategory as tauriDeleteCategory,
  updateTaskCategory as tauriUpdateTaskCategory,
  addTaskTag as tauriAddTaskTag,
  removeTaskTag as tauriRemoveTaskTag,
  createTag as tauriCreateTag,
  updateTag as tauriUpdateTag,
  deleteTag as tauriDeleteTag,
  type DbCategory,
  type DbTag,
  type TaskOverview,
  type CategoryInput,
  type TagInput,
} from "../bridge/tauri-commands";

export class TauriDownloadApiService implements DownloadApiService {
  async pauseTask(gid: string): Promise<void> {
    return pauseTask(gid);
  }
  async resumeTask(gid: string): Promise<void> {
    return resumeTask(gid);
  }
  async cancelTask(gid: string, deleteFiles?: boolean): Promise<void> {
    return cancelTask(gid, deleteFiles);
  }
  async clearCompletedTasks(deleteFiles?: boolean): Promise<number> {
    return clearCompletedTasks(deleteFiles);
  }
  async openTaskFile(gid: string): Promise<void> {
    return openTaskFile(gid);
  }
  async openTaskFolder(gid: string): Promise<void> {
    return openTaskFolder(gid);
  }
  async restartTask(gid: string): Promise<string> {
    return restartTask(gid);
  }
  async getActiveTasks(): Promise<TaskOverview[]> {
    return getActiveTasks();
  }
  async getCategories(): Promise<DbCategory[]> {
    return getCategories();
  }
  async getTags(): Promise<DbTag[]> {
    return getTags();
  }
  async createCategory(input: CategoryInput): Promise<number> {
    return createCategory(input);
  }
  async updateCategory(categoryId: number, input: CategoryInput): Promise<void> {
    return tauriUpdateCategory(categoryId, input);
  }
  async deleteCategory(categoryId: number): Promise<void> {
    return tauriDeleteCategory(categoryId);
  }
  async updateTaskCategory(gid: string, categoryId: number | null): Promise<void> {
    return tauriUpdateTaskCategory(gid, categoryId);
  }
  async addTaskTag(gid: string, tagId: number): Promise<void> {
    return tauriAddTaskTag(gid, tagId);
  }
  async removeTaskTag(gid: string, tagId: number): Promise<void> {
    return tauriRemoveTaskTag(gid, tagId);
  }
  async createTag(input: TagInput): Promise<number> {
    return tauriCreateTag(input);
  }
  async updateTag(tagId: number, input: TagInput): Promise<void> {
    return tauriUpdateTag(tagId, input);
  }
  async deleteTag(tagId: number): Promise<void> {
    return tauriDeleteTag(tagId);
  }
}

export const tauriDownloadApiService = new TauriDownloadApiService();
