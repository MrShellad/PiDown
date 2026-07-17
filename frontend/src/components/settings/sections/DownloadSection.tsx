import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Download,
  FolderOpen,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { CompoundInput, CompoundInputButton } from "@/components/ui/input";
import { SegmentedControl } from "@/components/common";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  type AppSettings,
  type Aria2EngineStatus,
  getAria2EngineStatus,
  updateAria2Engine,
  pickDownloadDirectory,
  type FfmpegEngineStatus,
  getFfmpegEngineStatus,
  updateFfmpegEngine,
} from "@/core/bridge/tauri-commands";
import { UI_TEXT } from "@/core/locale";
import {
  SettingsList,
  SettingsListItem,
  SettingsSectionCard,
} from "../SettingsPrimitives";

interface DownloadSectionProps {
  draft: AppSettings;
  updateDraft: (updater: (prev: AppSettings) => AppSettings) => void;
}

export default function DownloadSection({ draft, updateDraft }: DownloadSectionProps) {
  const [aria2Status, setAria2Status] = useState<Aria2EngineStatus | null>(null);
  const [ffmpegStatus, setFfmpegStatus] = useState<FfmpegEngineStatus | null>(null);

  useEffect(() => {
    if (draft.download.backend !== "aria2") {
      setAria2Status(null);
      return;
    }

    const checkStatus = () => {
      getAria2EngineStatus()
        .then(setAria2Status)
        .catch((err) => console.error("Failed to query aria2 status:", err));
    };

    checkStatus();
    const timer = setInterval(checkStatus, 2000);
    return () => clearInterval(timer);
  }, [draft.download.backend]);

  useEffect(() => {
    const checkFfmpegStatus = () => {
      getFfmpegEngineStatus()
        .then(setFfmpegStatus)
        .catch((err) => console.error("Failed to query FFmpeg status:", err));
    };

    checkFfmpegStatus();
    const timer = setInterval(checkFfmpegStatus, 2000);
    return () => clearInterval(timer);
  }, []);

  const handleUpdateAria2 = async () => {
    try {
      await updateAria2Engine();
      setTimeout(() => {
        getAria2EngineStatus()
          .then(setAria2Status)
          .catch((err) => console.error(err));
      }, 500);
    } catch (err) {
      console.error("Failed to trigger aria2 engine update:", err);
    }
  };

  const handleUpdateFfmpeg = async () => {
    try {
      await updateFfmpegEngine();
      setTimeout(() => {
        getFfmpegEngineStatus()
          .then(setFfmpegStatus)
          .catch((err) => console.error(err));
      }, 500);
    } catch (err) {
      console.error("Failed to trigger FFmpeg engine update:", err);
    }
  };

  const handlePickDir = async () => {
    try {
      const selected = await pickDownloadDirectory(draft.download.default_save_dir || undefined);
      if (selected) {
        updateDraft((prev) => ({
          ...prev,
          download: {
            ...prev.download,
            default_save_dir: selected,
          },
        }));
      }
    } catch (err) {
      console.warn("Failed to pick download directory:", err);
    }
  };

  return (
    <SettingsSectionCard>
      <div className="mt-0">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {UI_TEXT.settings.groupEngine || "下载引擎"}
        </div>
        <SettingsList>
          {draft.download.backend === "aria2" && (
            <SettingsListItem
              title={UI_TEXT.settings.aria2StatusTitle || "Aria2 引擎状态"}
              description="本地 Aria2 Daemon 核心保活状态与下载内核版本"
              action={
                <div className="flex items-center gap-2">
                  {aria2Status?.status === "running" ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      <CheckCircle className="size-3.5 text-emerald-500 shrink-0" />
                      运行中 (v{aria2Status.version || "1.37.0"})
                    </span>
                  ) : aria2Status?.status === "ready" ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <CheckCircle className="size-3.5 text-emerald-500/80 shrink-0" />
                      已就绪 (v{aria2Status.version || "1.37.0"})
                    </span>
                  ) : aria2Status?.status === "downloading" ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                      <Loader2 className="size-3.5 text-blue-500 animate-spin shrink-0" />
                      下载核心中 ({aria2Status.progress.toFixed(1)}%)
                    </span>
                  ) : aria2Status?.status === "extracting" ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
                      <RefreshCw className="size-3.5 text-indigo-500 animate-spin shrink-0" />
                      解压组件中...
                    </span>
                  ) : aria2Status?.status === "not_installed" ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                      <Download className="size-3.5 text-amber-500 shrink-0" />
                      未安装本地内核
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                      <AlertTriangle className="size-3.5 text-rose-500 shrink-0" />
                      引擎未接通
                    </span>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    disabled={aria2Status?.status === "downloading" || aria2Status?.status === "extracting"}
                    onClick={handleUpdateAria2}
                  >
                    <RefreshCw className="size-3.5 mr-1" />
                    {aria2Status?.status === "not_installed" ? "安装 Aria2" : "更新内核"}
                  </Button>
                </div>
              }
            >
              {(aria2Status?.error_message || aria2Status?.status === "downloading" || aria2Status?.status === "extracting") && (
                <div className="mt-2 space-y-2">
                  {aria2Status?.error_message && (
                    <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                      {aria2Status.error_message}
                    </div>
                  )}
                  
                  {(aria2Status?.status === "downloading" || aria2Status?.status === "extracting") && (
                    <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-primary h-full transition-all duration-300"
                        style={{ width: `${aria2Status.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
            </SettingsListItem>
          )}
          <SettingsListItem
            title={UI_TEXT.settings.engineBackend || "下载引擎后端"}
            description={UI_TEXT.settings.engineBackendDesc || "选择默认的任务下载引擎"}
            action={
              <SegmentedControl
                value={draft.download.backend}
                options={[
                  { value: "aria2", label: "Aria2 (推荐)" },
                  { value: "gosh", label: "gosh-dl (备份)" },
                ]}
                onValueChange={(nextBackend) =>
                  updateDraft((prev) => ({
                    ...prev,
                    download: {
                      ...prev.download,
                      backend: nextBackend as "gosh" | "aria2",
                    },
                  }))
                }
                size="sm"
              />
            }
          />

          {draft.download.backend === "aria2" && (
            <>
              <SettingsListItem
                title={UI_TEXT.settings.aria2AutoUpdate || "自动更新 Aria2 引擎"}
                description={UI_TEXT.settings.aria2AutoUpdateDesc || "在启动或检查时自动拉取最新的 Aria2 依赖内核"}
                action={
                  <Switch
                    checked={draft.download.aria2_auto_update}
                    onCheckedChange={(checked) =>
                      updateDraft((prev) => ({
                        ...prev,
                        download: {
                          ...prev.download,
                          aria2_auto_update: checked,
                        },
                      }))
                    }
                  />
                }
              />
              <SettingsListItem
                title={UI_TEXT.settings.aria2Port || "Aria2 RPC 端口"}
                description={UI_TEXT.settings.aria2PortDesc || "本地 aria2c 服务的监听端口"}
              >
                <CompoundInput
                  type="number"
                  value={draft.download.aria2_port}
                  onChange={(event) =>
                    updateDraft((prev) => ({
                      ...prev,
                      download: {
                        ...prev.download,
                        aria2_port: parseInt(event.target.value) || 6800,
                      },
                    }))
                  }
                  placeholder={"6800"}
                />
              </SettingsListItem>

              <SettingsListItem
                title={UI_TEXT.settings.aria2Secret || "Aria2 RPC 密钥 (Token)"}
                description={UI_TEXT.settings.aria2SecretDesc || "用于 RPC 连接身份验证的安全密钥"}
              >
                <CompoundInput
                  value={draft.download.aria2_rpc_secret}
                  onChange={(event) =>
                    updateDraft((prev) => ({
                      ...prev,
                      download: {
                        ...prev.download,
                        aria2_rpc_secret: event.target.value,
                      },
                    }))
                  }
                  placeholder={"密钥"}
                  suffixActions={
                    <CompoundInputButton
                      type="button"
                      divider="left"
                      onClick={() => {
                        updateDraft((prev) => ({
                          ...prev,
                          download: {
                            ...prev.download,
                            aria2_rpc_secret: crypto.randomUUID(),
                          },
                        }));
                      }}
                      className="px-3"
                    >
                      重新生成
                    </CompoundInputButton>
                  }
                />
              </SettingsListItem>
            </>
          )}
        </SettingsList>

        <div className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          视频合并与转码 (FFmpeg)
        </div>
        <SettingsList>
          <SettingsListItem
            title="FFmpeg 状态"
            description="用于 HLS 流媒体的音频与视频轨道自动合并、无损重封装转码核心"
            action={
              <div className="flex items-center gap-2">
                {ffmpegStatus?.status === "ready" ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                    <CheckCircle className="size-3.5 text-emerald-500 shrink-0" />
                    {ffmpegStatus.version === "System PATH" ? "已接通系统环境变量" : `已就绪 (v${ffmpegStatus.version || "6.1"})`}
                  </span>
                ) : ffmpegStatus?.status === "downloading" ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                    <Loader2 className="size-3.5 text-blue-500 animate-spin shrink-0" />
                    下载核心中 ({ffmpegStatus.progress.toFixed(1)}%)
                  </span>
                ) : ffmpegStatus?.status === "extracting" ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
                    <RefreshCw className="size-3.5 text-indigo-500 animate-spin shrink-0" />
                    解压组件中...
                  </span>
                ) : ffmpegStatus?.status === "not_installed" ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                    <Download className="size-3.5 text-amber-500 shrink-0" />
                    未检测到 FFmpeg
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                    <AlertTriangle className="size-3.5 text-rose-500 shrink-0" />
                    初始化失败
                  </span>
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  disabled={ffmpegStatus?.status === "downloading" || ffmpegStatus?.status === "extracting"}
                  onClick={handleUpdateFfmpeg}
                >
                  <RefreshCw className="size-3.5 mr-1" />
                  {ffmpegStatus?.status === "not_installed" ? "一键下载 FFmpeg" : "更新核心"}
                </Button>
              </div>
            }
          >
            {(ffmpegStatus?.error_message || ffmpegStatus?.status === "downloading" || ffmpegStatus?.status === "extracting") && (
              <div className="mt-2 space-y-2">
                {ffmpegStatus?.error_message && (
                  <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                    {ffmpegStatus.error_message}
                  </div>
                )}
                
                {(ffmpegStatus?.status === "downloading" || ffmpegStatus?.status === "extracting") && (
                  <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-primary h-full transition-all duration-300"
                      style={{ width: `${ffmpegStatus.progress}%` }}
                    />
                  </div>
                )}
              </div>
            )}
          </SettingsListItem>
        </SettingsList>

        <div className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {UI_TEXT.settings.groupStorage}
        </div>
        <SettingsList>
          <SettingsListItem
            title={UI_TEXT.settings.defaultSaveDir}
            description={UI_TEXT.settings.downloadStorageDesc}
          >
            <CompoundInput
              value={draft.download.default_save_dir}
              onChange={(event) =>
                updateDraft((prev) => ({
                  ...prev,
                  download: {
                    ...prev.download,
                    default_save_dir: event.target.value,
                  },
                }))
              }
              placeholder={"H:\\Downloads\\PiDownloader"}
              suffixActions={
                <CompoundInputButton
                  type="button"
                  divider="left"
                  onClick={handlePickDir}
                  className="px-4"
                >
                  <FolderOpen className="size-4 mr-1.5" />
                  {UI_TEXT.settings.browse}
                </CompoundInputButton>
              }
            />
          </SettingsListItem>
        </SettingsList>

        <div className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {UI_TEXT.settings.groupBehavior || "行为设置"}
        </div>
        <SettingsList>
          <SettingsListItem
            title={UI_TEXT.settings.autoStart || "自动开始下载"}
            description={UI_TEXT.settings.autoStartDesc || "新建任务后立即开始下载"}
            action={
              <Switch
                checked={draft.download.auto_start_downloads}
                onCheckedChange={(checked) =>
                  updateDraft((prev) => ({
                    ...prev,
                    download: {
                      ...prev.download,
                      auto_start_downloads: checked,
                    },
                  }))
                }
              />
            }
          />
          <SettingsListItem
            title="添加任务时自动唤起主窗口"
            description="当从浏览器插件或外部接口接收到下载任务时，自动打开并聚焦主窗口"
            action={
              <Switch
                checked={draft.download.auto_focus_window_on_download}
                onCheckedChange={(checked) =>
                  updateDraft((prev) => ({
                    ...prev,
                    download: {
                      ...prev.download,
                      auto_focus_window_on_download: checked,
                    },
                  }))
                }
              />
            }
          />
          <SettingsListItem
            title={UI_TEXT.settings.autoRemoveOnFileDeleted}
            description={UI_TEXT.settings.autoRemoveOnFileDeletedDesc}
            action={
              <Switch
                checked={draft.download.auto_remove_on_file_deleted}
                onCheckedChange={(checked) =>
                  updateDraft((prev) => ({
                    ...prev,
                    download: {
                      ...prev.download,
                      auto_remove_on_file_deleted: checked,
                    },
                  }))
                }
              />
            }
          />
        </SettingsList>
      </div>
    </SettingsSectionCard>
  );
}
