import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Cable,
  Download,
  FolderOpen,
  Gauge,
  MonitorCog,
  Paintbrush,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  closeSettingsWindow,
  getDefaultAppSettings,
  type AppSettings,
} from "@/core/bridge/tauri-commands";
import { UI_TEXT } from "@/core/locale";
import { useAppSettingsStore, type SettingsSectionId } from "@/core/store/useAppSettingsStore";
import { useDownloadStore } from "@/core/store/useDownloadStore";
import { useThemeStore } from "@/core/store/useThemeStore";
import { UI_TOKENS } from "@/core/ui-tokens";
import { THEME_REGISTRY } from "@/themes/config";
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

function ResetSettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="destructive" onClick={onClick}>
      {UI_TEXT.settings.reset}
    </Button>
  );
}

export default function SettingsWindow() {
  const {
    settings,
    loading,
    saving,
    activeSection,
    setActiveSection,
    load,
    save,
    lastError,
    lastSavedAt,
  } = useAppSettingsStore();

  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
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

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  useEffect(() => {
    fetchCategories().catch(console.error);
    fetchTags().catch(console.error);
  }, [fetchCategories, fetchTags]);

  useEffect(() => {
    if (!settings) return;
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
        .then(() => setFeedback(UI_TEXT.settings.saved))
        .catch((error) =>
          setFeedback(error instanceof Error ? error.message : String(error))
        );
    }, 450);

    return () => window.clearTimeout(timer);
  }, [normalizedDraft, settings, save]);

  if (loading || !draft) {
    return (
      <div className="flex h-screen items-center justify-center bg-transparent text-foreground select-none">
        <div className="rounded-[var(--radius-xl)] border border-border bg-card/90 px-6 py-5 text-sm font-medium shadow-[var(--glow-effect)] backdrop-blur-xl">
          {UI_TEXT.settings.loading}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-transparent select-none [user-select:none] [&_input]:select-text">
      <div
        data-tauri-drag-region="true"
        className="flex h-11 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur-xl"
        style={{ cursor: "move" }}
      >
        <div className="flex items-center gap-2">
          <div className="size-2.5 rounded-full bg-primary" />
          <span className="text-sm font-semibold tracking-tight leading-none">
            {UI_TEXT.settings.title}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => closeSettingsWindow().catch(console.error)}
          className="text-muted-foreground hover:text-foreground"
          data-tauri-drag-region={false as unknown as undefined}
        >
          <X className="size-4" />
        </Button>
      </div>

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
                  className={`w-full rounded-[var(--radius-lg)] border px-3 py-3 text-left transition-colors ${
                    active
                      ? "border-primary/50 bg-primary/12 text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border hover:bg-secondary/60 hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-[var(--radius-md)] bg-secondary/80 text-foreground">
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
          <ScrollArea className="h-full" gutter="stable" safePadding viewportClassName="px-6 py-6">
            <div className="mx-auto flex max-w-5xl flex-col gap-6">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                <span>
                  {saving
                    ? UI_TEXT.settings.saving
                    : feedback || (lastSavedAt ? UI_TEXT.settings.autosaveIdle : "")}
                </span>
                {lastSavedAt ? (
                  <span className="text-xs tabular-nums">
                    {new Date(lastSavedAt).toLocaleTimeString()}
                  </span>
                ) : null}
              </div>

              {lastError && !saving ? (
                <div className="rounded-[var(--radius-md)] border border-border bg-secondary/60 px-3 py-2 text-sm leading-6 text-muted-foreground">
                  {lastError}
                </div>
              ) : null}

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
                    <SettingsList>
                      {THEME_REGISTRY.map((item) => (
                        <SettingsListItem
                          key={item.id}
                          title={item.name}
                          description={item.description}
                          action={
                            <Button
                              variant={theme === item.id ? "default" : "outline"}
                              size="sm"
                              onClick={() => setTheme(item.id)}
                            >
                              {theme === item.id ? UI_TEXT.settings.active : UI_TEXT.settings.select}
                            </Button>
                          }
                        />
                      ))}
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
            </div>
          </ScrollArea>
        </main>
      </div>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent size="sm" variant="alert">
          <DialogHeader>
            <div className="flex size-10 items-center justify-center rounded-[var(--radius-lg)] bg-destructive/10 text-destructive">
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
    </div>
  );
}
