import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  Cable,
  Download,
  FolderOpen,
  Gauge,
  Magnet,
  MonitorCog,
  Paintbrush,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { OptionDropdown } from "@/components/common";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  getDefaultAppSettings,
  listSystemFonts,
  type AppSettings,
  type SpeedDisplayUnit,
  getBackgrounds,
  pickBackgroundFile,
  importBackgroundFile,
  importBackgroundUrl,
  deleteBackground,
  type DbBackground,
  updateTrackersFromSubscription,
} from "@/core/bridge/tauri-commands";
import { convertFileSrc } from "@tauri-apps/api/core";

import { UI_TEXT } from "@/core/locale";
import { useAppSettingsStore, type SettingsSectionId } from "@/core/store/useAppSettingsStore";
import { useDownloadStore } from "@/core/store/useDownloadStore";
import {
  useThemeStore,
  getModernThemeStyles,
  parseThemeZip,
  type CustomTheme,
} from "@/core/store/useThemeStore";
import { useToastStore } from "@/core/store/useToastStore";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { parseNullableSpeedLimit } from "@/core/transfer";
import { UI_TOKENS } from "@/core/ui-tokens";
import { THEME_REGISTRY } from "@/themes/config";
import { createFontOptions, getThemeFontOption } from "@/themes/fonts";
import {
  SettingsInput,
  SettingsList,
  SettingsListItem,
  SettingsSectionCard,
  SettingsSectionHeader,
  SettingsTextarea,
} from "./SettingsPrimitives";
import DownloadRulesManager from "./DownloadRulesManager";

interface SettingsNavItem {
  id: SettingsSectionId;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: SettingsNavItem[] = [
  { id: "download", label: UI_TEXT.settings.navDownload, icon: <Download className="size-4" /> },
  { id: "transfer", label: UI_TEXT.settings.navTransfer, icon: <Gauge className="size-4" /> },
  { id: "magnet", label: "磁力设置", icon: <Magnet className="size-4" /> },
  { id: "integration", label: UI_TEXT.settings.navIntegration, icon: <MonitorCog className="size-4" /> },
  { id: "appearance", label: UI_TEXT.settings.navAppearance, icon: <Paintbrush className="size-4" /> },
];

const SPEED_DISPLAY_UNIT_OPTIONS: { value: SpeedDisplayUnit; label: string }[] = [
  { value: "auto", label: "自动 (B/s, KiB/s, MiB/s)" },
  { value: "kib", label: "KiB/s" },
  { value: "mib", label: "MiB/s" },
  { value: "mb", label: "MB/s" },
];

function FontDropdownSkeleton() {
  return (
    <div className="space-y-2 p-2">
      {[0, 1, 2, 3, 4].map((index) => (
        <motion.div
          key={index}
          className="h-8 overflow-hidden rounded-md bg-muted/70"
          initial={{ opacity: 0.45, x: -4 }}
          animate={{ opacity: [0.45, 0.9, 0.45], x: 0 }}
          transition={{
            duration: 1.1,
            repeat: Infinity,
            delay: index * 0.08,
            ease: "easeInOut",
          }}
        >
          <motion.div
            className="h-full w-1/2 bg-gradient-to-r from-transparent via-primary/18 to-transparent"
            initial={{ x: "-120%" }}
            animate={{ x: "240%" }}
            transition={{
              duration: 1.15,
              repeat: Infinity,
              delay: index * 0.08,
              ease: "easeInOut",
            }}
          />
        </motion.div>
      ))}
    </div>
  );
}

function SettingsWindowSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-transparent select-none">
      <aside
        className="flex min-h-0 shrink-0 flex-col bg-card/70 px-3 py-4 shadow-[var(--settings-sidebar-shadow)] backdrop-blur-xl"
        style={{ width: UI_TOKENS.settingsSidebarWidth, minWidth: UI_TOKENS.settingsSidebarWidth }}
      >
        <div className="space-y-2">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-lg border border-transparent px-3 py-3">
              <div className="size-9 rounded-md bg-secondary/80" />
              <div className="h-4 w-20 rounded-full bg-muted/70" />
            </div>
          ))}
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-6 pt-4 pb-6">
        <div className="mx-auto max-w-5xl rounded-xl border border-border bg-card/82 p-5 shadow-surface-raised backdrop-blur-xl">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="h-5 w-28 rounded-full bg-muted/75" />
              <div className="h-4 w-80 max-w-full rounded-full bg-muted/55" />
            </div>
            <div className="h-9 w-20 rounded-lg bg-muted/65" />
          </div>
          <div className="space-y-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="rounded-lg border border-border bg-secondary/40 p-4">
                <div className="h-4 w-32 rounded-full bg-muted/75" />
                <div className="mt-3 h-3 w-64 max-w-full rounded-full bg-muted/55" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function ResetSettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="destructive" onClick={onClick}>
      {UI_TEXT.settings.reset}
    </Button>
  );
}

export default function SettingsWindow() {
  const prefersReducedMotion = useReducedMotion();
  const {
    settings,
    loading,
    activeSection,
    setActiveSection,
    load,
    save,
    lastError,
  } = useAppSettingsStore();

  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const colorMode = useThemeStore((state) => state.colorMode);
  const setColorMode = useThemeStore((state) => state.setColorMode);
  const fontId = useThemeStore((state) => state.fontId);
  const setFontId = useThemeStore((state) => state.setFontId);
  const effectsEnabled = useThemeStore((state) => state.effectsEnabled);
  const setEffectsEnabled = useThemeStore((state) => state.setEffectsEnabled);
  const soundEnabled = useThemeStore((state) => state.soundEnabled);
  const setSoundEnabled = useThemeStore((state) => state.setSoundEnabled);
  const customThemes = useThemeStore((state) => state.customThemes);
  const importTheme = useThemeStore((state) => state.importTheme);
  const deleteTheme = useThemeStore((state) => state.deleteTheme);
  const fetchCategories = useDownloadStore((state) => state.fetchCategories);
  const fetchTags = useDownloadStore((state) => state.fetchTags);

  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [downloadLimitInput, setDownloadLimitInput] = useState("");
  const [uploadLimitInput, setUploadLimitInput] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [fontsLoading, setFontsLoading] = useState(false);
  const [fontLoadError, setFontLoadError] = useState<string | null>(null);
  const fontOptions = useMemo(() => createFontOptions(systemFonts), [systemFonts]);
  const selectedFont = getThemeFontOption(fontId, fontOptions);

  const [backgrounds, setBackgrounds] = useState<DbBackground[]>([]);
  const [onlineUrl, setOnlineUrl] = useState("");
  const [importingUrl, setImportingUrl] = useState(false);
  
  // Tracker updating states
  const [updatingTrackers, setUpdatingTrackers] = useState(false);

  const handleUpdateTrackers = async () => {
    if (!draft?.bt?.tracker_subscribe_url?.trim()) return;
    setUpdatingTrackers(true);
    try {
      useToastStore.getState().pushToast({
        title: "正在更新",
        description: "正在从订阅链接获取 Tracker 列表...",
      });
      const result = await updateTrackersFromSubscription();
      // Reload settings to get the updated tracker list
      await load();
      useToastStore.getState().pushToast({
        title: "更新成功",
        description: result,
        variant: "success",
      });
    } catch (err) {
      useToastStore.getState().pushToast({
        title: "更新失败",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setUpdatingTrackers(false);
    }
  };


  const allThemes = useMemo(() => {
    const { dark, light } = getModernThemeStyles();
    const modernMeta = THEME_REGISTRY.find((t) => t.id === "modern")!;

    const modernTheme: CustomTheme = {
      id: "modern",
      name: modernMeta.name,
      description: modernMeta.description,
      author: "PiDown Team",
      version: "1.0.0",
      created_at: "2026-06-10",
      updated_at: "2026-06-10",
      hasCanvasBg: modernMeta.hasCanvasBg,
      hasSpecialSound: modernMeta.hasSpecialSound,
      accent: modernMeta.accent,
      previewClassName: modernMeta.previewClassName,
      styles: { dark, light },
      font: {
        id: "builtin:geist",
        name: "Geist",
        stack: "'Geist Variable', 'Microsoft YaHei UI', 'PingFang SC', 'Noto Sans CJK SC', sans-serif",
      },
      sounds: {
        success: {
          type: "synth",
          oscillator: "sine",
          notes: [
            { freq: 659.25, duration: 0.15, delay: 0 },
            { freq: 880.0, duration: 0.25, delay: 0.15 },
          ],
          gain: 0.08,
          duration: 0.4,
        },
        warning: {
          type: "synth",
          oscillator: "sine",
          notes: [
            { freq: 600.0, duration: 0.05, delay: 0 },
            { freq: 400.0, duration: 0.01, delay: 0.05 },
          ],
          gain: 0.05,
          duration: 0.06,
        },
      },
    };

    return [modernTheme, ...customThemes];
  }, [customThemes]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  useEffect(() => {
    fetchCategories().catch(console.error);
    fetchTags().catch(console.error);
  }, [fetchCategories, fetchTags]);

  useEffect(() => {
    if (!settings) return;
    let cancelled = false;

    window.queueMicrotask(() => {
      if (cancelled) return;
      setDraft(settings);
      setDownloadLimitInput(
        settings.transfer.download_speed_limit_kib == null
          ? ""
          : String(settings.transfer.download_speed_limit_kib)
      );
      setUploadLimitInput(
        settings.transfer.upload_speed_limit_kib == null
          ? ""
          : String(settings.transfer.upload_speed_limit_kib)
      );
    });

    return () => {
      cancelled = true;
    };
  }, [settings]);

  const normalizedDraft = useMemo<AppSettings | null>(() => {
    if (!draft) return null;
    return {
      ...draft,
      transfer: {
        ...draft.transfer,
        download_speed_limit_kib: parseNullableSpeedLimit(downloadLimitInput),
        upload_speed_limit_kib: parseNullableSpeedLimit(uploadLimitInput),
      },
    };
  }, [draft, downloadLimitInput, uploadLimitInput]);

  const updateDraft = (updater: (prev: AppSettings) => AppSettings) => {
    setDraft((prev) => (prev ? updater(prev) : prev));
    setFeedback(null);
  };

  const ensureSystemFontsLoaded = () => {
    if (fontsLoaded || fontsLoading) return;

    setFontsLoading(true);
    listSystemFonts()
      .then((fonts) => {
        setSystemFonts(fonts);
        setFontsLoaded(true);
        setFontLoadError(null);
      })
      .catch((error) => {
        setFontLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => setFontsLoading(false));
  };

  const resetToDefaults = async () => {
    setResetting(true);
    try {
      const defaults = await getDefaultAppSettings();
      setDraft(defaults);
      setDownloadLimitInput("");
      setUploadLimitInput("");
      setFeedback(null);
      setResetOpen(false);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error));
    } finally {
      setResetting(false);
    }
  };

  const loadBackgrounds = () => {
    getBackgrounds()
      .then(setBackgrounds)
      .catch((err) => console.error("Failed to load backgrounds:", err));
  };

  useEffect(() => {
    loadBackgrounds();
  }, []);

  const handlePickAndImportFile = async () => {
    try {
      const selected = await pickBackgroundFile();
      if (!selected) return;

      useToastStore.getState().pushToast({
        title: "正在导入",
        description: "正在复制并缓存背景文件...",
      });

      const bg = await importBackgroundFile(selected);
      loadBackgrounds();

      updateDraft((prev) => ({
        ...prev,
        interface: {
          ...prev.interface,
          background_id: bg.id,
        },
      }));

      useToastStore.getState().pushToast({
        title: "导入成功",
        description: "已成功导入背景并应用",
        variant: "success",
      });
    } catch (err) {
      useToastStore.getState().pushToast({
        title: "导入失败",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  const handleImportUrl = async () => {
    if (!onlineUrl.trim()) return;
    setImportingUrl(true);
    try {
      useToastStore.getState().pushToast({
        title: "正在下载",
        description: "正在从链接下载背景文件并缓存...",
      });

      const bg = await importBackgroundUrl(onlineUrl.trim());
      loadBackgrounds();
      setOnlineUrl("");

      updateDraft((prev) => ({
        ...prev,
        interface: {
          ...prev.interface,
          background_id: bg.id,
        },
      }));

      useToastStore.getState().pushToast({
        title: "导入成功",
        description: "已成功下载背景并应用",
        variant: "success",
      });
    } catch (err) {
      useToastStore.getState().pushToast({
        title: "下载失败",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setImportingUrl(false);
    }
  };

  const handleDeleteBackground = async (bgId: number) => {
    try {
      await deleteBackground(bgId);

      if (draft?.interface?.background_id === bgId) {
        updateDraft((prev) => ({
          ...prev,
          interface: {
            ...prev.interface,
            background_id: null,
          },
        }));
      }

      loadBackgrounds();
      useToastStore.getState().pushToast({
        title: "删除成功",
        description: "已从数据库移除该背景",
        variant: "success",
      });
    } catch (err) {
      useToastStore.getState().pushToast({
        title: "删除失败",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };


  const exportThemeTemplate = (themeToExport: CustomTheme) => {
    try {
      const jsonStr = JSON.stringify(themeToExport, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `${themeToExport.id}-theme-template.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      useToastStore.getState().pushToast({
        title: "导出成功",
        description: `主题模板 "${themeToExport.name}" 已成功导出为 JSON 文件`,
        variant: "success",
      });
    } catch (error) {
      console.error(error);
      useToastStore.getState().pushToast({
        title: "导出失败",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  const triggerImportTheme = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.zip";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const isZip = file.name.endsWith(".zip");
      const reader = new FileReader();

      reader.onload = async (event) => {
        try {
          if (isZip) {
            const buffer = event.target?.result as ArrayBuffer;
            const themeObj = await parseThemeZip(buffer);
            importTheme(themeObj);
          } else {
            const content = event.target?.result as string;
            const parsed = JSON.parse(content) as CustomTheme;
            if (!parsed.id || !parsed.name || !parsed.styles) {
              throw new Error("无效的主题模板文件：缺少核心属性 (id, name, styles)");
            }
            importTheme(parsed);
          }

          useToastStore.getState().pushToast({
            title: "导入成功",
            description: `主题模板 "${file.name}" 已成功导入并可用`,
            variant: "success",
          });
        } catch (error) {
          console.error(error);
          useToastStore.getState().pushToast({
            title: "导入失败",
            description: error instanceof Error ? error.message : String(error),
            variant: "destructive",
          });
        }
      };

      if (isZip) {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsText(file);
      }
    };
    input.click();
  };

  useEffect(() => {
    if (!normalizedDraft || !settings) return;
    if (JSON.stringify(normalizedDraft) === JSON.stringify(settings)) return;

    const timer = window.setTimeout(() => {
      save(normalizedDraft)
        .then(async () => {
          await fetchCategories();
          setFeedback(UI_TEXT.settings.saved);
        })
        .catch((error) =>
          setFeedback(error instanceof Error ? error.message : String(error))
        );
    }, 450);

    return () => window.clearTimeout(timer);
  }, [fetchCategories, normalizedDraft, settings, save]);

  if (loading || !draft) {
    return (
      <motion.div
        className="flex h-full min-h-0 flex-1 overflow-hidden"
        initial={prefersReducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.12, ease: "easeOut" }}
        aria-label={UI_TEXT.settings.loading}
      >
        <SettingsWindowSkeleton />
      </motion.div>
    );
  }

  const visibleError =
    lastError || (feedback && feedback !== UI_TEXT.settings.saved ? feedback : null);
  const tabMotionTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.18, ease: "easeOut" as const };

  return (
    <motion.div
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-transparent select-none [user-select:none] [&_input]:select-text"
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
    >
      <div className="flex min-h-0 flex-1">
        <aside
          className="relative z-10 flex min-h-0 shrink-0 flex-col bg-card/70 px-2.5 py-4 shadow-[var(--settings-sidebar-shadow)] backdrop-blur-xl"
          style={{ width: UI_TOKENS.settingsSidebarWidth, minWidth: UI_TOKENS.settingsSidebarWidth }}
        >
          <ScrollArea className="flex-1" visibility="auto" scrollbar="overlay" viewportClassName="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = item.id === activeSection;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`group/settings-nav w-full rounded-lg px-2.5 py-3 text-left transition-colors ${
                    active
                      ? "bg-primary/12 text-foreground shadow-surface-inset"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex size-9 items-center justify-center rounded-md transition-colors ${
                        active
                          ? "bg-primary/14 text-primary"
                          : "bg-primary/8 text-primary/75 group-hover/settings-nav:text-primary"
                      }`}
                    >
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold leading-5">{item.label}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </ScrollArea>
        </aside>

        <main className="min-w-0 flex-1">
          <ScrollArea className="h-full" gutter="stable" safePadding viewportClassName="px-6 pt-4 pb-6">
            <div className="mx-auto flex max-w-5xl flex-col gap-6">
              {visibleError ? (
                <div className="rounded-md border border-border bg-secondary/60 px-3 py-2 text-sm leading-6 text-muted-foreground">
                  {visibleError}
                </div>
              ) : null}

              <AnimatePresence initial={false} mode="popLayout">
                <motion.div
                  key={activeSection}
                  className="w-full"
                  initial={prefersReducedMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={prefersReducedMotion ? undefined : { opacity: 0 }}
                  transition={tabMotionTransition}
                >
                  {activeSection === "download" ? (
                    <SettingsSectionCard>
                  <SettingsSectionHeader
                    icon={<FolderOpen className="size-5" />}
                    title={UI_TEXT.settings.navDownload}
                    description={UI_TEXT.settings.navDownloadDesc}
                    action={<ResetSettingsButton onClick={() => setResetOpen(true)} />}
                  />

                  <div className="mt-5">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      {UI_TEXT.settings.groupStorage}
                    </div>
                    <SettingsList>
                      <SettingsListItem
                        title={UI_TEXT.settings.defaultSaveDir}
                        description={UI_TEXT.settings.downloadStorageDesc}
                      >
                        <SettingsInput
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
                        />
                      </SettingsListItem>
                    </SettingsList>

                    <div className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      {UI_TEXT.settings.groupBehavior}
                    </div>
                    <SettingsList>
                      <SettingsListItem
                        title={UI_TEXT.settings.autoStart}
                        description={UI_TEXT.settings.autoStartDesc}
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
                        title={UI_TEXT.settings.autoCategory}
                        description={UI_TEXT.settings.autoCategoryDesc}
                        action={
                          <Switch
                            checked={draft.download.auto_categorize}
                            onCheckedChange={(checked) =>
                              updateDraft((prev) => ({
                                ...prev,
                                download: {
                                  ...prev.download,
                                  auto_categorize: checked,
                                },
                              }))
                            }
                          />
                        }
                      />
                      <SettingsListItem
                        title="浏览器扩展联动"
                        description="允许 Chrome/Chromium 扩展通过 HTTP 监听向下载器发起新建任务。关闭后，扩展将不再接管浏览器下载。"
                        action={
                          <Switch
                            checked={draft.download.browser_extension_integration_enabled}
                            onCheckedChange={(checked) =>
                              updateDraft((prev) => ({
                                ...prev,
                                download: {
                                  ...prev.download,
                                  browser_extension_integration_enabled: checked,
                                },
                              }))
                            }
                          />
                        }
                      />
                      {draft.download.browser_extension_integration_enabled && (
                        <SettingsListItem
                          title="服务端口与安全令牌"
                          description="应用与浏览器扩展进行 HTTP 通信的监听端口及身份凭证（修改端口需重启应用生效）。"
                        >
                          <div className="flex flex-col sm:flex-row gap-4 w-full mt-2">
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-muted-foreground whitespace-nowrap">端口</span>
                              <SettingsInput
                                type="number"
                                min={1024}
                                max={65535}
                                value={draft.download.browser_extension_port ?? 18388}
                                onChange={(event) => {
                                  const val = parseInt(event.target.value, 10);
                                  updateDraft((prev) => ({
                                    ...prev,
                                    download: {
                                      ...prev.download,
                                      browser_extension_port: isNaN(val) ? 18388 : val,
                                    },
                                  }));
                                }}
                                placeholder="18388"
                                className="w-24 font-mono text-center"
                              />
                            </div>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-xs text-muted-foreground whitespace-nowrap">安全令牌</span>
                              <SettingsInput
                                value={draft.download.browser_extension_token || ""}
                                onChange={(event) =>
                                  updateDraft((prev) => ({
                                    ...prev,
                                    download: {
                                      ...prev.download,
                                      browser_extension_token: event.target.value,
                                    },
                                  }))
                                }
                                placeholder="安全令牌"
                                className="font-mono flex-1 min-w-0"
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const newToken = crypto.randomUUID();
                                  updateDraft((prev) => ({
                                    ...prev,
                                    download: {
                                      ...prev.download,
                                      browser_extension_token: newToken,
                                    },
                                  }));
                                }}
                                className="shrink-0"
                              >
                                随机
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  navigator.clipboard.writeText(draft.download.browser_extension_token || "");
                                  useToastStore.getState().pushToast({
                                    title: "已复制",
                                    description: "安全令牌已复制到剪贴板",
                                    variant: "success",
                                  });
                                }}
                                className="shrink-0"
                              >
                                复制
                              </Button>
                            </div>
                          </div>
                        </SettingsListItem>
                      )}
                    </SettingsList>

                    <div className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      {UI_TEXT.settings.groupClassification}
                    </div>
                    <DownloadRulesManager />
                  </div>
                </SettingsSectionCard>
              ) : null}

              {activeSection === "transfer" ? (
                <SettingsSectionCard>
                  <SettingsSectionHeader
                    icon={<Cable className="size-5" />}
                    title={UI_TEXT.settings.navTransfer}
                    description={UI_TEXT.settings.navTransferDesc}
                    action={<ResetSettingsButton onClick={() => setResetOpen(true)} />}
                  />

                  <div className="mt-5">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      {UI_TEXT.settings.groupBandwidth}
                    </div>
                    <SettingsList>
                      <SettingsListItem
                        title={UI_TEXT.settings.transferConcurrency}
                        description={UI_TEXT.settings.transferConcurrencyDesc}
                      >
                        <Slider
                          min={1}
                          max={10}
                          value={draft.transfer.max_concurrent_downloads}
                          onValueChange={(value) =>
                            updateDraft((prev) => ({
                              ...prev,
                              transfer: {
                                ...prev.transfer,
                                max_concurrent_downloads: value,
                              },
                            }))
                          }
                          valueText={UI_TEXT.settings.concurrentDownloadsLabel.replace(
                            "{value}",
                            String(draft.transfer.max_concurrent_downloads)
                          )}
                        />
                      </SettingsListItem>
                      <SettingsListItem
                        title={UI_TEXT.settings.speedDisplayUnit}
                        description={UI_TEXT.settings.speedDisplayUnitDesc}
                      >
                        <OptionDropdown
                          value={draft.transfer.speed_display_unit}
                          options={SPEED_DISPLAY_UNIT_OPTIONS}
                          onValueChange={(nextUnit) =>
                            updateDraft((prev) => ({
                              ...prev,
                              transfer: {
                                ...prev.transfer,
                                speed_display_unit: nextUnit,
                              },
                            }))
                          }
                          ariaLabel={UI_TEXT.settings.speedDisplayUnit}
                        />
                      </SettingsListItem>
                      <SettingsListItem
                        title="单任务线程数"
                        description="新建 HTTP/HTTPS 任务时传给 gosh-dl 的 max_connections，用于分段并行下载。"
                      >
                        <Slider
                          min={1}
                          max={16}
                          value={draft.transfer.task_thread_count}
                          onValueChange={(value) =>
                            updateDraft((prev) => ({
                              ...prev,
                              transfer: {
                                ...prev.transfer,
                                task_thread_count: value,
                              },
                            }))
                          }
                          valueText={`每个任务最多 ${draft.transfer.task_thread_count} 条连接`}
                        />
                      </SettingsListItem>
                      <SettingsListItem
                        title="全局 User-Agent"
                        description="作为 HTTP/HTTPS 新建任务的默认 User-Agent；单个任务高级设置里填写的值会覆盖它。"
                        childrenSpan="full"
                      >
                        <SettingsInput
                          value={draft.download.global_user_agent}
                          onChange={(event) =>
                            updateDraft((prev) => ({
                              ...prev,
                              download: {
                                ...prev.download,
                                global_user_agent: event.target.value,
                              },
                            }))
                          }
                          placeholder="Mozilla/5.0"
                          className="font-mono"
                        />
                      </SettingsListItem>
                      <SettingsListItem
                        title="最大下载重试次数"
                        description="传给 gosh-dl 的 HTTP max_retries，网络波动或服务端临时错误时使用；该值会随设置保存，重启应用后由 gosh-dl HTTP 客户端完整读取。"
                      >
                        <Slider
                          min={0}
                          max={20}
                          value={draft.transfer.max_download_retries}
                          onValueChange={(value) =>
                            updateDraft((prev) => ({
                              ...prev,
                              transfer: {
                                ...prev.transfer,
                                max_download_retries: value,
                              },
                            }))
                          }
                          valueText={`最多重试 ${draft.transfer.max_download_retries} 次`}
                        />
                      </SettingsListItem>
                      <SettingsListItem
                        title="忽略 SSL 证书错误"
                        description="允许 gosh-dl 接受无效 HTTPS 证书；该开关会随设置保存，重启应用后由 gosh-dl HTTP 客户端完整读取。仅建议在可信内网、自签证书源或临时排障时开启。"
                        action={
                          <Switch
                            checked={draft.transfer.ignore_ssl_certificate}
                            onCheckedChange={(checked) =>
                              updateDraft((prev) => ({
                                ...prev,
                                transfer: {
                                  ...prev.transfer,
                                  ignore_ssl_certificate: checked,
                                },
                              }))
                            }
                          />
                        }
                      />
                      <SettingsListItem
                        title={UI_TEXT.settings.downloadSpeedLimit}
                        description={UI_TEXT.settings.downloadSpeedLimitDesc}
                      >
                        <div className="space-y-2">
                          <SettingsInput
                            value={downloadLimitInput}
                            onChange={(event) => setDownloadLimitInput(event.target.value)}
                            placeholder={UI_TEXT.settings.unlimitedPlaceholder}
                          />
                          <p className="text-sm leading-6 text-muted-foreground">
                            {UI_TEXT.settings.limitUnitHint}
                          </p>
                        </div>
                      </SettingsListItem>
                      <SettingsListItem
                        title={UI_TEXT.settings.uploadSpeedLimit}
                        description={UI_TEXT.settings.uploadSpeedLimitDesc}
                      >
                        <div className="space-y-2">
                          <SettingsInput
                            value={uploadLimitInput}
                            onChange={(event) => setUploadLimitInput(event.target.value)}
                            placeholder={UI_TEXT.settings.unlimitedPlaceholder}
                          />
                          <p className="text-sm leading-6 text-muted-foreground">
                            {UI_TEXT.settings.limitUnitHint}
                          </p>
                        </div>
                      </SettingsListItem>
                    </SettingsList>
                  </div>
                </SettingsSectionCard>
              ) : null}

              {activeSection === "integration" ? (
                <SettingsSectionCard>
                  <SettingsSectionHeader
                    icon={<MonitorCog className="size-5" />}
                    title={UI_TEXT.settings.navIntegration}
                    description={UI_TEXT.settings.navIntegrationDesc}
                    action={<ResetSettingsButton onClick={() => setResetOpen(true)} />}
                  />

                  <div className="mt-5">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      {UI_TEXT.settings.groupLifecycle}
                    </div>
                    <SettingsList>
                      {[
                        {
                          value: "float",
                          title: UI_TEXT.settings.closeActionFloat,
                          description: UI_TEXT.settings.closeActionFloatDesc,
                        },
                        {
                          value: "exit",
                          title: UI_TEXT.settings.closeActionExit,
                          description: UI_TEXT.settings.closeActionExitDesc,
                        },
                      ].map((option) => (
                        <SettingsListItem
                          key={option.value}
                          title={option.title}
                          description={option.description}
                          action={
                            <Button
                              variant={
                                draft.interface.close_action === option.value ? "default" : "outline"
                              }
                              size="sm"
                              onClick={() =>
                                updateDraft((prev) => ({
                                  ...prev,
                                  interface: {
                                    ...prev.interface,
                                    close_action: option.value as AppSettings["interface"]["close_action"],
                                  },
                                }))
                              }
                            >
                              {draft.interface.close_action === option.value
                                ? UI_TEXT.settings.active
                                : UI_TEXT.settings.select}
                            </Button>
                          }
                        />
                      ))}
                      <SettingsListItem
                        title={UI_TEXT.settings.minimizeOnCloseWithTasks}
                        description={UI_TEXT.settings.minimizeOnCloseWithTasksDesc}
                        action={
                          <Switch
                            checked={draft.interface.minimize_on_close_with_tasks}
                            onCheckedChange={(checked) =>
                              updateDraft((prev) => ({
                                ...prev,
                                interface: {
                                  ...prev.interface,
                                  minimize_on_close_with_tasks: checked,
                                },
                              }))
                            }
                          />
                        }
                      />
                    </SettingsList>

                    <div className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      {UI_TEXT.settings.integrationHintsTitle}
                    </div>
                    <SettingsList>
                      <SettingsListItem
                        title={UI_TEXT.settings.integrationHintsTitle}
                        description={`${UI_TEXT.settings.integrationHint1} ${UI_TEXT.settings.integrationHint2}`}
                      />
                    </SettingsList>
                  </div>
                </SettingsSectionCard>
              ) : null}

              {activeSection === "magnet" ? (
                <SettingsSectionCard>
                  <SettingsSectionHeader
                    icon={<Magnet className="size-5" />}
                    title="磁力与 BT 设置"
                    description="配置 BitTorrent 协议、端口监听、Peer 连接及网络发现策略。"
                    action={<ResetSettingsButton onClick={() => setResetOpen(true)} />}
                  />

                  <div className="mt-5">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      连接与发现
                    </div>
                    <SettingsList>
                      <SettingsListItem
                        title="启用 DHT 网络"
                        description="允许在不依赖 Tracker 服务器的情况下，通过无中心节点的分布式哈希表查找更多 Peer。"
                        action={
                          <Switch
                            checked={draft.bt.enable_dht}
                            onCheckedChange={(checked) =>
                              updateDraft((prev) => ({
                                ...prev,
                                bt: {
                                  ...prev.bt,
                                  enable_dht: checked,
                                },
                              }))
                            }
                          />
                        }
                      />
                      <SettingsListItem
                        title="启用 PEX (用户交换)"
                        description="允许 Peer 之间相互交换已知的用户列表，提高网络发现速度。"
                        action={
                          <Switch
                            checked={draft.bt.enable_pex}
                            onCheckedChange={(checked) =>
                              updateDraft((prev) => ({
                                ...prev,
                                bt: {
                                  ...prev.bt,
                                  enable_pex: checked,
                                },
                              }))
                            }
                          />
                        }
                      />
                      <SettingsListItem
                        title="启用 LPD (本地用户发现)"
                        description="在局域网内多播查找下载相同种子的用户，适合多机内网环境。"
                        action={
                          <Switch
                            checked={draft.bt.enable_lpd}
                            onCheckedChange={(checked) =>
                              updateDraft((prev) => ({
                                ...prev,
                                bt: {
                                  ...prev.bt,
                                  enable_lpd: checked,
                                },
                              }))
                            }
                          />
                        }
                      />
                    </SettingsList>

                    <div className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      网络配置
                    </div>
                    <SettingsList>
                      <SettingsListItem
                        title="传入连接端口"
                        description="BitTorrent 协议本地监听的 TCP/UDP 端口范围。"
                      >
                        <div className="flex items-center gap-2 mt-1">
                          <SettingsInput
                            type="number"
                            value={draft.bt.listen_port_start}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              updateDraft((prev) => ({
                                ...prev,
                                bt: {
                                  ...prev.bt,
                                  listen_port_start: isNaN(val) ? 6881 : val,
                                },
                              }));
                            }}
                            className="w-24 text-center font-mono"
                          />
                          <span className="text-muted-foreground">至</span>
                          <SettingsInput
                            type="number"
                            value={draft.bt.listen_port_end}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              updateDraft((prev) => ({
                                ...prev,
                                bt: {
                                  ...prev.bt,
                                  listen_port_end: isNaN(val) ? 6889 : val,
                                },
                              }));
                            }}
                            className="w-24 text-center font-mono"
                          />
                        </div>
                      </SettingsListItem>

                      <SettingsListItem
                        title="协议加密选项"
                        description="对 Peer 传出与传入连接的协议头加密级别要求。"
                      >
                        <OptionDropdown
                          value={draft.bt.encryption_policy}
                          options={[
                            { value: "preferred", label: "优先加密 (Preferred)" },
                            { value: "allowed", label: "允许加密 (Allowed)" },
                            { value: "required", label: "强制加密 (Required)" },
                            { value: "disabled", label: "禁用加密 (Disabled)" },
                          ]}
                          onValueChange={(nextPolicy) =>
                            updateDraft((prev) => ({
                              ...prev,
                              bt: {
                                ...prev.bt,
                                encryption_policy: nextPolicy,
                              },
                            }))
                          }
                          ariaLabel="协议加密选项"
                        />
                      </SettingsListItem>

                      <SettingsListItem
                        title="磁盘预分配模式"
                        description="新建 BT 任务时如何预先分配磁盘空间，避免文件碎片。"
                      >
                        <OptionDropdown
                          value={draft.bt.allocation_mode}
                          options={[
                            { value: "none", label: "不分配 (None)" },
                            { value: "sparse", label: "稀疏分配 (Sparse)" },
                            { value: "full", label: "完全预分配 (Full)" },
                          ]}
                          onValueChange={(nextMode) =>
                            updateDraft((prev) => ({
                              ...prev,
                              bt: {
                                ...prev.bt,
                                allocation_mode: nextMode,
                              },
                            }))
                          }
                          ariaLabel="磁盘预分配模式"
                        />
                      </SettingsListItem>

                      <SettingsListItem
                        title="做种比率阈值"
                        description="达到该分享率（上传字节数 / 下载字节数）后，任务将自动停止做种。"
                      >
                        <div className="flex items-center gap-2 mt-1">
                          <SettingsInput
                            type="number"
                            step="0.1"
                            min="0"
                            value={draft.bt.seed_ratio_threshold}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              updateDraft((prev) => ({
                                ...prev,
                                bt: {
                                  ...prev.bt,
                                  seed_ratio_threshold: isNaN(val) ? 1.0 : val,
                                },
                              }));
                            }}
                            className="w-24 text-center font-mono"
                          />
                          <span className="text-muted-foreground text-sm">倍 (0.0 表示不限制，持续做种)</span>
                        </div>
                      </SettingsListItem>

                      <SettingsListItem
                        title="Peer 循环间隔 (tick_interval_ms)"
                        description="BitTorrent 引擎与 Peer 进行网络循环、交换消息的时间间隔（越小越灵敏，但 CPU 开销越高）。"
                      >
                        <div className="flex items-center gap-2 mt-1">
                          <SettingsInput
                            type="number"
                            min="10"
                            max="5000"
                            value={draft.bt.peer_loop_interval_ms}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              updateDraft((prev) => ({
                                ...prev,
                                bt: {
                                  ...prev.bt,
                                  peer_loop_interval_ms: isNaN(val) ? 100 : val,
                                },
                              }));
                            }}
                            className="w-24 text-center font-mono"
                          />
                          <span className="text-muted-foreground text-sm">ms (默认 100ms)</span>
                        </div>
                      </SettingsListItem>
                    </SettingsList>

                    <div className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      Tracker 配置
                    </div>
                    <SettingsList>
                      <SettingsListItem
                        title="Tracker 订阅"
                        description="自动订阅的 Tracker 服务器列表文件 URL（例如 trackerslist.com）。支持通过右侧按钮手动更新拉取。"
                      >
                        <div className="flex gap-2 mt-1">
                          <SettingsInput
                            value={draft.bt.tracker_subscribe_url}
                            onChange={(e) =>
                              updateDraft((prev) => ({
                                ...prev,
                                bt: {
                                  ...prev.bt,
                                  tracker_subscribe_url: e.target.value,
                                },
                              }))
                            }
                            placeholder="https://cf.trackerslist.com/best.txt"
                            className="flex-1"
                          />
                          <Button
                            onClick={handleUpdateTrackers}
                            loading={updatingTrackers}
                            disabled={!draft.bt.tracker_subscribe_url.trim() || updatingTrackers}
                          >
                            立即更新
                          </Button>
                        </div>
                      </SettingsListItem>

                      <SettingsListItem
                        title="Tracker 列表"
                        description="添加新磁力链接或种子任务时将自动追加的 Tracker 服务器列表，每行一个。"
                        childrenSpan="full"
                      >
                        <SettingsTextarea
                          value={draft.bt.tracker_list}
                          onChange={(e) =>
                            updateDraft((prev) => ({
                              ...prev,
                              bt: {
                                ...prev.bt,
                                tracker_list: e.target.value,
                              },
                            }))
                          }
                          placeholder="udp://tracker.opentrackr.org:1337/announce&#10;http://tracker.ipv6tracker.ru:80/announce"
                          className="font-mono min-h-[120px]"
                        />
                      </SettingsListItem>
                    </SettingsList>
                  </div>
                </SettingsSectionCard>
              ) : null}

              {activeSection === "appearance" ? (
                <SettingsSectionCard>
                  <SettingsSectionHeader
                    icon={<Paintbrush className="size-5" />}
                    title={UI_TEXT.settings.navAppearance}
                    description={UI_TEXT.settings.navAppearanceDesc}
                    action={<ResetSettingsButton onClick={() => setResetOpen(true)} />}
                  />

                  <div className="mt-5">
                    <div className="mb-3 mt-5 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      <span>{UI_TEXT.settings.groupTheme}</span>
                      <Button
                        variant="outline"
                        size="xs"
                        leftIcon={<Plus className="size-3" />}
                        onClick={triggerImportTheme}
                        className="normal-case tracking-normal h-7 font-normal"
                      >
                        导入主题
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      {allThemes.map((item) => {
                        const active = theme === item.id;
                        const isCustom = item.id !== "modern";

                        return (
                          <article
                            key={item.id}
                            className={`group/theme-card flex h-96 w-72 shrink-0 flex-col overflow-hidden rounded-xl border bg-card/82 shadow-surface-raised transition-all ${
                              active
                                ? "border-primary ring-2 ring-primary/25"
                                : "border-border hover:border-primary/45 hover:bg-card"
                            }`}
                          >
                            <div className="relative h-28 overflow-hidden">
                              {item.previewImage ? (
                                <img
                                  src={item.previewImage}
                                  alt={item.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className={`h-full w-full ${item.previewClassName || "bg-gradient-to-br from-primary/30 to-accent/30"}`} />
                              )}
                              <div className="absolute inset-x-4 top-4 h-6 rounded-t-lg border border-primary-foreground/30 bg-primary/85 shadow-surface-raised" />
                              <div className="absolute inset-x-4 bottom-4 h-14 rounded-b-lg border border-border/70 bg-card/82 shadow-surface-strong backdrop-blur-sm" />
                              <div className="absolute bottom-6 left-7 h-2 w-16 rounded-full bg-primary/70" />
                              <div className="absolute bottom-6 right-7 h-2 w-8 rounded-full bg-accent/70" />
                              <div className="absolute right-4 top-3 rounded-full border border-primary-foreground/45 bg-card/78 px-2 py-1 text-[11px] font-semibold text-foreground shadow-surface-raised">
                                {item.accent || "自定义"}
                              </div>
                            </div>

                            <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-3">
                                  <h3 className="text-base font-bold leading-6 text-foreground">
                                    {item.name}
                                  </h3>
                                  {active ? (
                                    <span className="rounded-full bg-primary/12 px-2.5 py-1 text-xs font-semibold text-primary">
                                      {UI_TEXT.settings.active}
                                    </span>
                                  ) : null}
                                </div>
                                <p className="line-clamp-4 text-sm leading-6 text-muted-foreground">
                                  {item.description}
                                </p>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <span className="rounded-full border border-border bg-secondary/70 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                                  {item.hasCanvasBg ? "动态背景" : "静态背景"}
                                </span>
                                <span className="rounded-full border border-border bg-secondary/70 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                                  {item.hasSpecialSound ? "主题音效" : "默认音效"}
                                </span>
                                {item.font && (
                                  <span className="rounded-full border border-border bg-secondary/70 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                                    字体: {item.font.name}
                                  </span>
                                )}
                              </div>

                              <div className="mt-auto flex w-full gap-2">
                                <Button
                                  variant={active ? "default" : "outline"}
                                  size="sm"
                                  className="flex-1"
                                  onClick={() => setTheme(item.id)}
                                >
                                  {active ? UI_TEXT.settings.active : UI_TEXT.settings.select}
                                </Button>
                                
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      className="shrink-0 rounded-[min(var(--radius-md),12px)]"
                                      onClick={() => exportThemeTemplate(item)}
                                    >
                                      <Download className="size-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>导出主题模板</TooltipContent>
                                </Tooltip>

                                {isCustom && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="destructive"
                                        size="icon"
                                        className="shrink-0 rounded-[min(var(--radius-md),12px)]"
                                        onClick={() => deleteTheme(item.id)}
                                      >
                                        <Trash2 className="size-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>删除主题</TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    <div className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      {UI_TEXT.settings.groupColorMode}
                    </div>
                    <SettingsList>
                      <SettingsListItem
                        title={UI_TEXT.settings.lightModeToggle}
                        description={UI_TEXT.settings.lightModeToggleDesc}
                        action={
                          <Switch
                            checked={colorMode === "light"}
                            onCheckedChange={(checked) =>
                              setColorMode(checked ? "light" : "dark")
                            }
                          />
                        }
                      />
                    </SettingsList>

                    <div className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      {UI_TEXT.settings.groupTypography}
                    </div>
                    <SettingsList>
                      <SettingsListItem
                        title={UI_TEXT.settings.fontFamily}
                        description={UI_TEXT.settings.fontFamilyDesc}
                      >
                        <div className="space-y-2">
                          <OptionDropdown
                            value={fontId}
                            options={fontOptions.map((option) => ({
                              value: option.id,
                              label: option.label,
                            }))}
                            onValueChange={setFontId}
                            onOpenChange={(open) => {
                              if (open) ensureSystemFontsLoaded();
                            }}
                            contentFooter={fontsLoading ? <FontDropdownSkeleton /> : null}
                            ariaLabel={UI_TEXT.settings.fontFamily}
                          />
                          <p className="text-sm leading-6 text-muted-foreground">
                            {fontLoadError
                              ? `${selectedFont.description} ${UI_TEXT.settings.fontLoadFallback}`
                              : fontsLoading
                                ? UI_TEXT.settings.fontLoading
                                : fontsLoaded
                                  ? selectedFont.description
                                  : UI_TEXT.settings.fontLazyLoadHint}
                          </p>
                        </div>
                      </SettingsListItem>
                    </SettingsList>

                    <div className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      {UI_TEXT.settings.groupFeedback}
                    </div>
                    <SettingsList>
                      <SettingsListItem
                        title={UI_TEXT.settings.effectsToggle}
                        description={UI_TEXT.settings.effectsToggleDesc}
                        action={
                          <Switch
                            checked={effectsEnabled}
                            onCheckedChange={setEffectsEnabled}
                          />
                        }
                      />
                      <SettingsListItem
                        title={UI_TEXT.settings.soundToggle}
                        description={UI_TEXT.settings.soundToggleDesc}
                        action={
                          <Switch
                            checked={soundEnabled}
                            onCheckedChange={setSoundEnabled}
                          />
                        }
                      />
                      <SettingsListItem
                        title="无边框透明穿透模式"
                        description="隐藏顶部标题栏及背景图片/视频，将透明区域转化为可点击穿透的桌面视窗"
                        action={
                          <Switch
                            checked={draft.interface.hide_border_and_bg ?? false}
                            onCheckedChange={(checked) =>
                              updateDraft((prev) => ({
                                ...prev,
                                interface: {
                                  ...prev.interface,
                                  hide_border_and_bg: checked,
                                },
                              }))
                            }
                          />
                        }
                      />
                      <SettingsListItem
                        title="关闭窗口阴影"
                        description="调用 Win32 API 隐藏窗口的系统投影（常在启用无边框透明穿透模式时开启，以防止屏幕上出现透明窗口的投影痕迹）"
                        action={
                          <Switch
                            checked={draft.interface.disable_window_shadow ?? false}
                            onCheckedChange={(checked) =>
                              updateDraft((prev) => ({
                                ...prev,
                                interface: {
                                  ...prev.interface,
                                  disable_window_shadow: checked,
                                },
                              }))
                            }
                          />
                        }
                      />
                    </SettingsList>

                    <div className="mb-3 mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      背景修改与管理
                    </div>
                    <div className="space-y-6 rounded-xl border border-border/60 bg-secondary/15 p-4 shadow-inner">
                      {/* Control Panel: Add/Import Backgrounds */}
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <div className="flex-1">
                          <label className="block text-sm font-semibold leading-5 text-foreground mb-1.5">
                            在线背景链接
                          </label>
                          <div className="flex gap-2">
                            <SettingsInput
                              value={onlineUrl}
                              onChange={(e) => setOnlineUrl(e.target.value)}
                              placeholder="粘贴在线图片或视频的 URL 链接..."
                              className="flex-1 bg-card/60 border-border/80 focus:border-primary/50"
                              disabled={importingUrl}
                            />
                            <Button
                              onClick={handleImportUrl}
                              loading={importingUrl}
                              loadingText="正在下载"
                              disabled={!onlineUrl.trim() || importingUrl}
                            >
                              导入
                            </Button>
                          </div>
                        </div>

                        <div className="flex flex-col justify-end">
                          <label className="block text-sm font-semibold leading-5 text-foreground mb-1.5 sm:text-transparent select-none pointer-events-none">
                            本地导入
                          </label>
                          <Button
                            variant="outline"
                            leftIcon={<FolderOpen className="size-4" />}
                            onClick={handlePickAndImportFile}
                            className="w-full sm:w-auto"
                          >
                            导入本地文件
                          </Button>
                        </div>
                      </div>

                      {/* Config Options: Blur, Mask Color, Mask Opacity */}
                      <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-4">
                          <Slider
                            label="背景模糊"
                            description="调整背景的模糊半径以提升前台文本可读性"
                            value={draft.interface.background_blur ?? 0}
                            min={0}
                            max={40}
                            step={1}
                            valueText={`${draft.interface.background_blur ?? 0} px`}
                            onValueChange={(val) =>
                              updateDraft((prev) => ({
                                ...prev,
                                interface: {
                                  ...prev.interface,
                                  background_blur: val,
                                },
                              }))
                            }
                          />

                          <Slider
                            label="遮罩不透明度"
                            description="调整背景遮罩的不透明度"
                            value={draft.interface.background_mask_opacity ?? 0}
                            min={0}
                            max={100}
                            step={1}
                            valueText={`${draft.interface.background_mask_opacity ?? 0} %`}
                            onValueChange={(val) =>
                              updateDraft((prev) => ({
                                ...prev,
                                interface: {
                                  ...prev.interface,
                                  background_mask_opacity: val,
                                },
                              }))
                            }
                          />
                        </div>

                        <div className="space-y-4">
                          <div>
                            <span className="block text-sm font-semibold leading-5 text-foreground">
                              遮罩颜色
                            </span>
                            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                              设置背景上的叠加遮罩颜色
                            </p>
                            <div className="mt-3 flex items-center gap-3">
                              <div className="relative size-10 shrink-0 overflow-hidden rounded-lg border border-border shadow-sm">
                                <input
                                  type="color"
                                  value={draft.interface.background_mask_color || "#000000"}
                                  onChange={(e) =>
                                    updateDraft((prev) => ({
                                      ...prev,
                                      interface: {
                                        ...prev.interface,
                                        background_mask_color: e.target.value,
                                      },
                                    }))
                                  }
                                  className="absolute -inset-2 size-[150%] cursor-pointer border-0 bg-transparent p-0"
                                />
                              </div>
                              <SettingsInput
                                value={draft.interface.background_mask_color || "#000000"}
                                onChange={(e) =>
                                  updateDraft((prev) => ({
                                    ...prev,
                                    interface: {
                                      ...prev.interface,
                                      background_mask_color: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="#000000"
                                className="max-w-[120px] font-mono text-sm uppercase bg-card/60"
                              />
                            </div>
                          </div>

                          <div className="pt-2">
                            <Slider
                              label="整体背景不透明度"
                              description="调整整体背景不透明度以穿透显示桌面（需要系统窗口透明支持）"
                              value={draft.interface.background_opacity ?? 100}
                              min={0}
                              max={100}
                              step={1}
                              valueText={`${draft.interface.background_opacity ?? 100} %`}
                              onValueChange={(val) =>
                                updateDraft((prev) => ({
                                  ...prev,
                                  interface: {
                                    ...prev.interface,
                                    background_opacity: val,
                                  },
                                }))
                              }
                            />
                          </div>
                        </div>

                      </div>

                      {/* Background List Manager Grid */}
                      <div>
                        <span className="block text-sm font-semibold leading-5 text-foreground mb-3">
                          已导入的背景
                        </span>
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                          {/* Option A: Default (None) Background */}
                          <button
                            onClick={() =>
                              updateDraft((prev) => ({
                                ...prev,
                                interface: {
                                  ...prev.interface,
                                  background_id: null,
                                },
                              }))
                            }
                            className={`group relative aspect-video overflow-hidden rounded-xl border bg-card/60 shadow-sm text-left transition-all cursor-pointer ${
                              draft.interface.background_id === null
                                ? "border-primary ring-2 ring-primary/25"
                                : "border-border hover:border-primary/45 hover:bg-card"
                            }`}
                          >
                            <div className="flex h-full w-full flex-col items-center justify-center p-3 text-center">
                              <span className="text-sm font-bold text-foreground">无 / 默认背景</span>
                              <span className="mt-1 text-xs text-muted-foreground">使用主题自带特效</span>
                            </div>
                            {draft.interface.background_id === null && (
                              <div className="absolute right-2 top-2 rounded-full bg-primary/12 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                                使用中
                              </div>
                            )}
                          </button>

                          {/* Option B: Custom Backgrounds List */}
                          {backgrounds.map((bg) => {
                            const active = draft.interface.background_id === bg.id;
                            const assetUrl = bg.path ? convertFileSrc(bg.path) : "";
                            const thumbUrl = bg.thumbnail ? convertFileSrc(bg.thumbnail) : assetUrl;

                            return (
                              <div
                                key={bg.id}
                                className={`group relative aspect-video overflow-hidden rounded-xl border bg-card/60 shadow-sm transition-all ${
                                  active
                                    ? "border-primary ring-2 ring-primary/25"
                                    : "border-border hover:border-primary/45"
                                }`}
                              >
                                {/* Background thumbnail render */}
                                <button
                                  onClick={() =>
                                    updateDraft((prev) => ({
                                      ...prev,
                                      interface: {
                                        ...prev.interface,
                                        background_id: bg.id,
                                      },
                                    }))
                                  }
                                  className="h-full w-full focus:outline-none cursor-pointer"
                                >
                                  {bg.type === "video" ? (
                                    <video
                                      src={assetUrl}
                                      muted
                                      loop
                                      className="h-full w-full object-cover"
                                      onMouseEnter={(e) => {
                                        e.currentTarget.play().catch(() => {});
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.pause();
                                        e.currentTarget.currentTime = 0;
                                      }}
                                    />
                                  ) : (
                                    <img
                                      src={thumbUrl}
                                      alt="background"
                                      className="h-full w-full object-cover"
                                    />
                                  )}
                                </button>


                                {/* Badges */}
                                {active && (
                                  <div className="absolute left-2 top-2 rounded-full bg-primary/95 px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground shadow-sm z-10">
                                    已应用
                                  </div>
                                )}

                                {bg.is_online && (
                                  <div className="absolute right-2 top-2 rounded-full bg-accent/95 px-1.5 py-0.5 text-[10px] font-bold text-accent-foreground shadow-sm z-10">
                                    在线
                                  </div>
                                )}

                                {/* Delete Overlay / Button */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteBackground(bg.id);
                                  }}
                                  className="absolute bottom-2 right-2 flex size-7 items-center justify-center rounded-lg border border-destructive/20 bg-destructive/10 text-destructive opacity-0 hover:bg-destructive hover:text-white transition-opacity group-hover:opacity-100 shadow-sm z-20 cursor-pointer"
                                  title="删除背景记录"
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </SettingsSectionCard>

              ) : null}
                </motion.div>
              </AnimatePresence>
            </div>
          </ScrollArea>
        </main>
      </div>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent size="sm" variant="alert">
          <DialogHeader>
            <div className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <AlertTriangle className="size-5" />
            </div>
            <DialogTitle>恢复默认设置</DialogTitle>
          </DialogHeader>
          <DialogBody className="text-center">
            <DialogDescription>
              这会把当前设置恢复为默认值，并使用系统默认下载目录。确认后会自动保存。
            </DialogDescription>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)} disabled={resetting}>
              取消
            </Button>
            <Button
              variant="destructive"
              loading={resetting}
              loadingText="正在恢复"
              onClick={() => {
                resetToDefaults().catch(console.error);
              }}
            >
              确认恢复
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
