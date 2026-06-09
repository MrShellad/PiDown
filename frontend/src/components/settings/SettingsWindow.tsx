import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  Cable,
  Download,
  FolderOpen,
  Gauge,
  MonitorCog,
  Paintbrush,
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
} from "@/core/bridge/tauri-commands";
import { UI_TEXT } from "@/core/locale";
import { useAppSettingsStore, type SettingsSectionId } from "@/core/store/useAppSettingsStore";
import { useDownloadStore } from "@/core/store/useDownloadStore";
import { useThemeStore } from "@/core/store/useThemeStore";
import { UI_TOKENS } from "@/core/ui-tokens";
import { THEME_REGISTRY } from "@/themes/config";
import { createFontOptions, getThemeFontOption } from "@/themes/fonts";
import {
  SettingsInput,
  SettingsList,
  SettingsListItem,
  SettingsSectionCard,
  SettingsSectionHeader,
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
  { id: "integration", label: UI_TEXT.settings.navIntegration, icon: <MonitorCog className="size-4" /> },
  { id: "appearance", label: UI_TEXT.settings.navAppearance, icon: <Paintbrush className="size-4" /> },
];

function parseNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

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
    <div className="flex min-h-0 flex-1 overflow-hidden bg-transparent select-none">
      <aside
        className="flex min-h-0 shrink-0 flex-col border-r border-border bg-card/70 px-3 py-4 backdrop-blur-xl"
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
        download_speed_limit_kib: parseNullableNumber(downloadLimitInput),
        upload_speed_limit_kib: parseNullableNumber(uploadLimitInput),
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
        className="flex min-h-0 flex-1 overflow-hidden"
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
    : { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <motion.div
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent select-none [user-select:none] [&_input]:select-text"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex min-h-0 flex-1">
        <aside
          className="flex min-h-0 shrink-0 flex-col border-r border-border bg-card/70 px-3 py-4 backdrop-blur-xl"
          style={{ width: UI_TOKENS.settingsSidebarWidth, minWidth: UI_TOKENS.settingsSidebarWidth }}
        >
          <ScrollArea className="flex-1" visibility="auto" scrollbar="overlay" viewportClassName="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = item.id === activeSection;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                    active
                      ? "border-primary/50 bg-primary/12 text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border hover:bg-secondary/60 hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-md bg-secondary/80 text-foreground">
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

              <AnimatePresence initial={false}>
                <motion.div
                  key={activeSection}
                  layout="position"
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
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

              {activeSection === "appearance" ? (
                <SettingsSectionCard>
                  <SettingsSectionHeader
                    icon={<Paintbrush className="size-5" />}
                    title={UI_TEXT.settings.navAppearance}
                    description={UI_TEXT.settings.navAppearanceDesc}
                    action={<ResetSettingsButton onClick={() => setResetOpen(true)} />}
                  />

                  <div className="mt-5">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      {UI_TEXT.settings.groupTheme}
                    </div>
                    <div className="flex flex-wrap gap-4">
                      {THEME_REGISTRY.map((item) => {
                        const active = theme === item.id;

                        return (
                          <article
                            key={item.id}
                            className={`group/theme-card flex h-96 w-72 shrink-0 flex-col overflow-hidden rounded-xl border bg-card/82 shadow-surface-raised transition-all ${
                              active
                                ? "border-primary ring-2 ring-primary/25"
                                : "border-border hover:border-primary/45 hover:bg-card"
                            }`}
                          >
                            <div className={`relative h-28 overflow-hidden ${item.previewClassName}`}>
                              <div className="absolute inset-x-4 top-4 h-6 rounded-t-lg border border-primary-foreground/30 bg-primary/85 shadow-surface-raised" />
                              <div className="absolute inset-x-4 bottom-4 h-14 rounded-b-lg border border-border/70 bg-card/82 shadow-surface-strong backdrop-blur-sm" />
                              <div className="absolute bottom-6 left-7 h-2 w-16 rounded-full bg-primary/70" />
                              <div className="absolute bottom-6 right-7 h-2 w-8 rounded-full bg-accent/70" />
                              <div className="absolute right-4 top-3 rounded-full border border-primary-foreground/45 bg-card/78 px-2 py-1 text-[11px] font-semibold text-foreground shadow-surface-raised">
                                {item.accent}
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
                              </div>

                              <Button
                                variant={active ? "default" : "outline"}
                                size="sm"
                                className="mt-auto w-full"
                                onClick={() => setTheme(item.id)}
                              >
                                {active ? UI_TEXT.settings.active : UI_TEXT.settings.select}
                              </Button>
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
                    </SettingsList>
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
