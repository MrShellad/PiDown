import { invoke } from "@tauri-apps/api/core";
import { downloadDir } from "@tauri-apps/api/path";

export interface TaskConfig {
  url: string;
  path?: string;
  filename?: string;
  categoryId?: number | null;
}

export interface TaskAdvancedOptions {
  maxDownloadSpeedKib?: number | null;
  maxUploadSpeedKib?: number | null;
  maxConnections?: number | null;
  userAgent?: string | null;
  referer?: string | null;
  cookies?: string[];
  autoVerify?: boolean;
  disableDhtPexLpd?: boolean;
  fileAllocation?: string;
}

export interface TorrentFileInspection {
  path: string;
  size: number;
}

export interface DownloadMetadata {
  filename: string | null;
  total_size: number | null;
  is_torrent: boolean;
  files: TorrentFileInspection[] | null;
  info_hash: string | null;
  is_private?: boolean;
}

export interface FileConflictCheck {
  exists: boolean;
  target_path: string;
  filename: string;
  suggested_filename: string;
  suggested_path: string;
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
  status: "Pending" | "Downloading" | "Seeding" | "Paused" | "Completed" | "Failed" | "Cancelled";
  speed: string;
  progress: number;
  eta: string;
  speed_bps: number;
  eta_seconds: number | null;
  downloaded_bytes: number;
  total_bytes: number;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  upload_speed: string;
  error_message: string | null;
  save_path: string;
  category_id: number | null;
  tags: DbTag[];
  protocol: string;
  max_download_speed_kib: number | null;
  max_upload_speed_kib: number | null;
}

export interface TaskClassificationPreview {
  category: DbCategory | null;
  tags: DbTag[];
  save_path: string;
}

export type CloseAction = "minimize" | "tray" | "exit";
export type FloatDisplayMode = "always" | "only_downloading" | "hidden";
export type SpeedDisplayUnit = "auto" | "kib" | "mib" | "mb";
export type FileChecksumAlgorithm = "MD5" | "SHA-1" | "SHA-256" | "SHA-512";

export interface TaskFileChecksum {
  name: string;
  algorithm: FileChecksumAlgorithm;
  checksum: string;
  saved_checksum: string | null;
}

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
    global_user_agent: string;
    browser_extension_integration_enabled: boolean;
    browser_extension_port: number;
    browser_extension_token: string;
    play_sound_on_complete: boolean;
    sound_effect_id: string;
  };
  transfer: {
    max_concurrent_downloads: number;
    task_thread_count: number;
    max_download_retries: number;
    ignore_ssl_certificate: boolean;
    download_speed_limit_kib: number | null;
    upload_speed_limit_kib: number | null;
    speed_display_unit: SpeedDisplayUnit;
    proxy_url: string | null;
  };
  interface: {
    close_action: CloseAction;
    minimize_on_close_with_tasks: boolean;
    float_display_mode: FloatDisplayMode;
    background_id: number | null;
    background_blur: number;
    background_mask_color: string;
    background_mask_opacity: number;
    background_opacity: number;
    hide_border_and_bg: boolean;
    disable_window_shadow: boolean;
    theme: string;
    color_mode: string;
    font_id: string;
    enable_notifications: boolean;
    language: string;
    datetime_format: string;
  };
  bt: {
    enable_dht: boolean;
    enable_pex: boolean;
    enable_lpd: boolean;
    listen_port_start: number;
    listen_port_end: number;
    encryption_policy: string;
    allocation_mode: string;
    seed_ratio_threshold: number;
    peer_loop_interval_ms: number;
    tracker_subscribe_url: string;
    tracker_list: string;
  };
}



export interface DbBackground {
  id: number;
  path: string;
  type: "image" | "video";
  is_online: boolean;
  created_at: number;
  thumbnail: string | null;
}



export async function createTask(
  url: string,
  path?: string,
  filename?: string,
  categoryId?: number | null,
  categoryOverride = false,
  totalSize?: number | null,
  overwrite = false,
  advancedOptions: TaskAdvancedOptions = {},
  selectedFiles?: number[] | null,
  sequential?: boolean
): Promise<string> {
  return invoke<string>("create_task", {
    url,
    path,
    filename,
    categoryId,
    categoryOverride,
    totalSize,
    overwrite,
    maxDownloadSpeedKib: advancedOptions.maxDownloadSpeedKib ?? null,
    maxUploadSpeedKib: advancedOptions.maxUploadSpeedKib ?? null,
    maxConnections: advancedOptions.maxConnections ?? null,
    userAgent: advancedOptions.userAgent ?? null,
    referer: advancedOptions.referer ?? null,
    cookies: advancedOptions.cookies ?? [],
    selectedFiles: selectedFiles ?? null,
    sequential: sequential ?? null,
    autoVerify: advancedOptions.autoVerify ?? null,
    disableDhtPexLpd: advancedOptions.disableDhtPexLpd ?? null,
    fileAllocation: advancedOptions.fileAllocation ?? null,
  });
}

export async function getDiskSpace(path: string): Promise<[number, number]> {
  return invoke<[number, number]>("get_disk_space", { path });
}

export async function checkFileConflict(
  path: string,
  filename: string
): Promise<FileConflictCheck> {
  return invoke<FileConflictCheck>("check_file_conflict", { path, filename });
}

export async function inspectDownloadMetadata(
  url: string,
  userAgent?: string | null,
  referer?: string | null,
  cookies?: string[]
): Promise<DownloadMetadata> {
  return invoke<DownloadMetadata>("inspect_download_metadata", {
    url,
    userAgent: userAgent ?? null,
    referer: referer ?? null,
    cookies: cookies ?? [],
  });
}

export async function readClipboardText(): Promise<string> {
  return invoke<string>("read_clipboard_text");
}

export async function writeClipboardText(text: string): Promise<void> {
  return invoke<void>("write_clipboard_text", { text });
}

export async function pickDownloadDirectory(defaultPath?: string): Promise<string | null> {
  return invoke<string | null>("pick_download_directory", { defaultPath });
}

export async function pickTorrentFile(): Promise<string | null> {
  return invoke<string | null>("pick_torrent_file");
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

export async function calculateTaskFileChecksum(
  gid: string,
  algorithm: FileChecksumAlgorithm
): Promise<TaskFileChecksum> {
  return invoke<TaskFileChecksum>("calculate_task_file_checksum", { gid, algorithm });
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

export async function openDirectory(path: string): Promise<void> {
  return invoke<void>("open_directory", { path });
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

export async function listSystemFonts(): Promise<string[]> {
  return invoke<string[]>("list_system_fonts");
}

export async function getDefaultAppSettings(): Promise<AppSettings> {
  return {
    download: {
      default_save_dir: await downloadDir(),
      auto_start_downloads: true,
      auto_categorize: true,
      global_user_agent: "",
      browser_extension_integration_enabled: true,
      browser_extension_port: 18388,
      browser_extension_token: "",
      play_sound_on_complete: true,
      sound_effect_id: "success",
    },
    transfer: {
      max_concurrent_downloads: 3,
      task_thread_count: 16,
      max_download_retries: 5,
      ignore_ssl_certificate: false,
      download_speed_limit_kib: null,
      upload_speed_limit_kib: null,
      speed_display_unit: "auto",
      proxy_url: null,
    },
    interface: {
      close_action: "minimize",
      minimize_on_close_with_tasks: false,
      float_display_mode: "always",
      background_id: null,
      background_blur: 0,
      background_mask_color: "#000000",
      background_mask_opacity: 0,
      background_opacity: 100,
      hide_border_and_bg: false,
      disable_window_shadow: false,
      theme: "modern",
      color_mode: "dark",
      font_id: "builtin:geist",
      enable_notifications: true,
      language: "auto",
      datetime_format: "YYYY-MM-DD HH:mm:ss",
    },
    bt: {
      enable_dht: true,
      enable_pex: true,
      enable_lpd: true,
      listen_port_start: 6881,
      listen_port_end: 6889,
      encryption_policy: "preferred",
      allocation_mode: "none",
      seed_ratio_threshold: 1.0,
      peer_loop_interval_ms: 100,
      tracker_subscribe_url: "",
      tracker_list: "",
    },
  };
}

export async function updateAppSettings(settings: AppSettings): Promise<AppSettings> {
  return invoke<AppSettings>("update_app_settings", { settings });
}

export async function saveThemeFont(
  themeId: string,
  fontFilename: string,
  fontDataBase64: string
): Promise<string> {
  return invoke<string>("save_theme_font", {
    themeId,
    fontFilename,
    fontDataBase64,
  });
}

export async function getBackgrounds(): Promise<DbBackground[]> {
  return invoke<DbBackground[]>("get_backgrounds");
}

export async function pickBackgroundFile(): Promise<string | null> {
  return invoke<string | null>("pick_background_file");
}

export async function importBackgroundFile(filePath: string): Promise<DbBackground> {
  return invoke<DbBackground>("import_background_file", { filePath });
}

export async function importBackgroundUrl(url: string): Promise<DbBackground> {
  return invoke<DbBackground>("import_background_url", { url });
}

export async function deleteBackground(id: number): Promise<void> {
  return invoke<void>("delete_background", { id });
}

export async function updateTrackersFromSubscription(): Promise<string> {
  return invoke<string>("update_trackers_from_subscription");
}

export interface BtPeerInfo {
  id: string | null;
  ip: string;
  port: number;
  client: string | null;
  download_speed: number;
  upload_speed: number;
  progress: number;
  am_choking: boolean;
  peer_choking: boolean;
}

export interface BtTorrentFile {
  index: number;
  path: string;
  size: number;
  selected: boolean;
  completed: number;
}

export interface BtTaskDetails {
  magnet_uri: string | null;
  trackers: string[];
  peers: BtPeerInfo[];
  files: BtTorrentFile[];
}

export async function getBtTaskDetails(gid: string): Promise<BtTaskDetails> {
  return invoke<BtTaskDetails>("get_bt_task_details", { gid });
}

export async function updateTaskTrackers(gid: string, trackers: string[]): Promise<void> {
  return invoke<void>("update_task_trackers", { gid, trackers });
}

export async function exitApp(): Promise<void> {
  return invoke<void>("exit_app");
}

export async function getCursorScreenPos(): Promise<[number, number]> {
  return invoke<[number, number]>("get_cursor_screen_pos");
}
