import type {
  DbCategory,
  DbTag,
  TaskOverview,
  CategoryInput,
  TagInput,
} from "../bridge/tauri-commands";

export interface DownloadApiService {
  pauseTask(gid: string): Promise<void>;
  resumeTask(gid: string): Promise<void>;
  cancelTask(gid: string, deleteFiles?: boolean): Promise<void>;
  clearCompletedTasks(deleteFiles?: boolean): Promise<number>;
  openTaskFile(gid: string): Promise<void>;
  openTaskFolder(gid: string): Promise<void>;
  restartTask(gid: string): Promise<string>;
  getActiveTasks(): Promise<TaskOverview[]>;
  getCategories(): Promise<DbCategory[]>;
  getTags(): Promise<DbTag[]>;
  createCategory(input: CategoryInput): Promise<number>;
  updateCategory(categoryId: number, input: CategoryInput): Promise<void>;
  deleteCategory(categoryId: number): Promise<void>;
  updateTaskCategory(gid: string, categoryId: number | null): Promise<void>;
  addTaskTag(gid: string, tagId: number): Promise<void>;
  removeTaskTag(gid: string, tagId: number): Promise<void>;
  createTag(input: TagInput): Promise<number>;
  updateTag(tagId: number, input: TagInput): Promise<void>;
  deleteTag(tagId: number): Promise<void>;
}
