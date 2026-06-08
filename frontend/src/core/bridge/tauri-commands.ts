import { invoke } from "@tauri-apps/api/core";
import { downloadDir } from "@tauri-apps/api/path";

export interface TaskConfig {
  url: string;
  path?: string;
  filename?: string;
  categoryId?: number | null;
}

export interface DownloadMetadata {
  filename: string | null;
  total_size: number | null;
}

export interface DbCategory {
  id: number;
  name: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
  rules: MatchRules;
  save_path: string | null;
}

export interface DbTag {
  id: number;
  category_id: number | null;
  name: string;
  icon: string | null;
  color: string | null;
  rules: MatchRules;
  save_path: string | null;
}

export interface TaskOverview {
  gid: string;
  url: string;
  name: string;
  status: "Pending" | "Downloading" | "Paused" | "Completed" | "Failed" | "Cancelled";
  speed: string;
  progress: number;
  eta: string;
  downloaded_bytes: number;
  total_bytes: number;
  created_at: number;
  category_id: number | null;
  tags: DbTag[];
}

export interface TaskClassificationPreview {
  category: DbCategory | null;
  tags: DbTag[];
  save_path: string;
}

export type CloseAction = "float" | "exit";
export type SpeedDisplayUnit = "auto" | "kib" | "mib" | "mb";

export interface MatchRules {
  domains: string[];
  extensions: string[];
  name_keywords: string[];
  min_size_bytes: number | null;
  max_size_bytes: number | null;
}

export interface CategoryInput {
  name: string;
  icon?: string | null;
  color?: string | null;
  sort_order: number;
  rules: MatchRules;
  save_path?: string | null;
}

export interface TagInput {
  category_id?: number | null;
  name: string;
  icon?: string | null;
  color?: string | null;
  rules: MatchRules;
  save_path?: string | null;
}

export interface AppSettings {
  download: {
    default_save_dir: string;
    auto_start_downloads: boolean;
    auto_categorize: boolean;
  };
  transfer: {
    max_concurrent_downloads: number;
    download_speed_limit_kib: number | null;
    upload_speed_limit_kib: number | null;
    speed_display_unit: SpeedDisplayUnit;
  };
  interface: {
    close_action: CloseAction;
  };
}

export async function createTask(
  url: string,
  path?: string,
  filename?: string,
  categoryId?: number | null,
  categoryOverride = false,
  totalSize?: number | null
): Promise<string> {
  return invoke<string>("create_task", {
    url,
    path,
    filename,
    categoryId,
    categoryOverride,
    totalSize,
  });
}

export async function inspectDownloadMetadata(url: string): Promise<DownloadMetadata> {
  return invoke<DownloadMetadata>("inspect_download_metadata", { url });
}

export async function previewTaskClassification(
  url: string,
  filename: string,
  totalSize?: number | null,
  categoryId?: number | null,
  categoryOverride = false
): Promise<TaskClassificationPreview> {
  return invoke<TaskClassificationPreview>("preview_task_classification", {
    url,
    filename,
    totalSize,
    categoryId,
    categoryOverride,
  });
}

export async function pauseTask(gid: string): Promise<void> {
  return invoke<void>("pause_task", { gid });
}

export async function resumeTask(gid: string): Promise<void> {
  return invoke<void>("resume_task", { gid });
}

export async function cancelTask(gid: string, deleteFiles = false): Promise<void> {
  return invoke<void>("cancel_task", { gid, deleteFiles });
}

export async function clearCompletedTasks(deleteFiles = false): Promise<number> {
  return invoke<number>("clear_completed_tasks", { deleteFiles });
}

export async function openTaskFile(gid: string): Promise<void> {
  return invoke<void>("open_task_file", { gid });
}

export async function openTaskFolder(gid: string): Promise<void> {
  return invoke<void>("open_task_folder", { gid });
}

export async function restartTask(gid: string): Promise<string> {
  return invoke<string>("restart_task", { gid });
}

export async function switchToFloat(): Promise<void> {
  return invoke<void>("switch_to_float");
}

export async function switchToMain(): Promise<void> {
  return invoke<void>("switch_to_main");
}

export async function openSettingsWindow(): Promise<void> {
  return invoke<void>("open_settings_window");
}

export async function closeSettingsWindow(): Promise<void> {
  return invoke<void>("close_settings_window");
}

export async function closeMainWindow(): Promise<void> {
  return invoke<void>("close_main_window");
}

export async function getActiveTasks(): Promise<TaskOverview[]> {
  return invoke<TaskOverview[]>("get_active_tasks");
}

export async function getCategories(): Promise<DbCategory[]> {
  return invoke<DbCategory[]>("get_categories");
}

export async function createCategory(input: CategoryInput): Promise<number> {
  return invoke<number>("create_category", { input });
}

export async function updateCategory(categoryId: number, input: CategoryInput): Promise<void> {
  return invoke<void>("update_category", { categoryId, input });
}

export async function deleteCategory(categoryId: number): Promise<void> {
  return invoke<void>("delete_category", { categoryId });
}

export async function getTags(): Promise<DbTag[]> {
  return invoke<DbTag[]>("get_tags");
}

export async function updateTaskCategory(gid: string, categoryId: number | null): Promise<void> {
  return invoke<void>("update_task_category", { gid, categoryId });
}

export async function addTaskTag(gid: string, tagId: number): Promise<void> {
  return invoke<void>("add_task_tag", { gid, tagId });
}

export async function removeTaskTag(gid: string, tagId: number): Promise<void> {
  return invoke<void>("remove_task_tag", { gid, tagId });
}

export async function createTag(input: TagInput): Promise<number> {
  return invoke<number>("create_tag", { input });
}

export async function updateTag(tagId: number, input: TagInput): Promise<void> {
  return invoke<void>("update_tag", { tagId, input });
}

export async function deleteTag(tagId: number): Promise<void> {
  return invoke<void>("delete_tag", { tagId });
}

export async function getAppSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("get_app_settings");
}

export async function getDefaultAppSettings(): Promise<AppSettings> {
  return {
    download: {
      default_save_dir: await downloadDir(),
      auto_start_downloads: true,
      auto_categorize: true,
    },
    transfer: {
      max_concurrent_downloads: 3,
      download_speed_limit_kib: null,
      upload_speed_limit_kib: null,
      speed_display_unit: "auto",
    },
    interface: {
      close_action: "float",
    },
  };
}

export async function updateAppSettings(settings: AppSettings): Promise<AppSettings> {
  return invoke<AppSettings>("update_app_settings", { settings });
}
