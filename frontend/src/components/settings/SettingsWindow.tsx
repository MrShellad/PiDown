import { useEffect, useMemo, useState, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  Cable,
  Download,
  FolderTree,
  Gauge,
  Magnet,
  MonitorCog,
  Paintbrush,
  Settings,
  Info,
  PlayCircle,
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
import {
  getDefaultAppSettings,
  type AppSettings,
} from "@/core/bridge/tauri-commands";
import { UI_TEXT } from "@/core/locale";
import { useAppSettingsStore, type SettingsSectionId } from "@/core/store/useAppSettingsStore";
import { useDownloadStore } from "@/core/store/useDownloadStore";
import { useThemeStore } from "@/core/store/useThemeStore";
import { Icon as AnimalIcon } from "animal-island-ui";
import iconDiy from "@/assets/icons/icon-diy.svg?url";
import iconHelicopter from "@/assets/icons/icon-helicopter.svg?url";
import iconMap from "@/assets/icons/icon-map.svg?url";
import iconDesign from "@/assets/icons/icon-design.svg?url";
import iconShopping from "@/assets/icons/icon-shopping.svg?url";
import iconCamera from "@/assets/icons/icon-camera.svg?url";
import iconChat from "@/assets/icons/icon-chat.svg?url";
import iconMiles from "@/assets/icons/icon-miles.svg?url";
import { parseNullableSpeedLimit } from "@/core/transfer";
import { UI_TOKENS } from "@/core/ui-tokens";
import { SettingsSectionHeader } from "./SettingsPrimitives";

// Section Component Imports
import GeneralSection from "./sections/GeneralSection";
import DownloadSection from "./sections/DownloadSection";
import TransferSection from "./sections/TransferSection";
import CategorySection from "./sections/CategorySection";
import ExtensionSection from "./sections/ExtensionSection";
import MagnetSection from "./sections/MagnetSection";
import AppearanceSection from "./sections/AppearanceSection";
import PlayerSection from "./sections/PlayerSection";
import AboutSection from "./sections/AboutSection";

interface SettingsNavItem {
  id: SettingsSectionId;
  label: string;
  icon: React.ReactNode;
}

function SettingsWindowSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-transparent select-none">
      <aside
        className="flex min-h-0 shrink-0 flex-col bg-[color-mix(in_oklab,var(--background),#000_4%)] dark:bg-[color-mix(in_oklab,var(--background),#000_15%)] px-3 py-4 border-r border-border/40 shadow-[var(--settings-sidebar-shadow)]"
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
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="h-5 w-28 rounded-full bg-muted/75" />
              <div className="h-4 w-80 max-w-full rounded-full bg-muted/55" />
            </div>
            <div className="h-9 w-20 rounded-lg bg-muted/65" />
          </div>
          <div className="space-y-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="rounded-lg border border-border/40 bg-secondary/20 p-4">
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

function ResetSettingsButton({ onClick, onClose }: { onClick: () => void; onClose?: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="destructive" size="sm" onClick={onClick}>
        {UI_TEXT.settings.reset}
      </Button>
      {onClose && (
        <Button variant="outline" size="sm" onClick={onClose}>
          关闭
        </Button>
      )}
    </div>
  );
}

export default function SettingsWindow({ onClose }: { onClose?: () => void }) {
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
  const fetchCategories = useDownloadStore((state) => state.fetchCategories);
  const fetchTags = useDownloadStore((state) => state.fetchTags);

  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [downloadLimitInput, setDownloadLimitInput] = useState("");
  const [uploadLimitInput, setUploadLimitInput] = useState("");
  const [proxyType, setProxyType] = useState<"none" | "http" | "https" | "socks5">("none");
  const [proxyAddress, setProxyAddress] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const lastSyncedSettingsRef = useRef<AppSettings | null>(null);
  const normalizedDraftRef = useRef<AppSettings | null>(null);

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

      const isInitial = lastSyncedSettingsRef.current === null;
      let hasUnsavedChanges = false;
      if (!isInitial && lastSyncedSettingsRef.current) {
        hasUnsavedChanges =
          JSON.stringify(normalizedDraftRef.current) !==
          JSON.stringify(lastSyncedSettingsRef.current);
      }

      if (isInitial || !hasUnsavedChanges) {
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

        const proxyUrl = settings.transfer.proxy_url || "";
        if (!proxyUrl) {
          setProxyType("none");
          setProxyAddress("");
        } else {
          const protocols = ["http://", "https://", "socks5://"];
          let matched = false;
          for (const proto of protocols) {
            if (proxyUrl.startsWith(proto)) {
              setProxyType(proto.replace("://", "") as any);
              setProxyAddress(proxyUrl.substring(proto.length));
              matched = true;
              break;
            }
          }
          if (!matched) {
            setProxyType("http");
            setProxyAddress(proxyUrl);
          }
        }
      }

      lastSyncedSettingsRef.current = settings;
    });

    return () => {
      cancelled = true;
    };
  }, [settings]);

  const normalizedDraft = useMemo<AppSettings | null>(() => {
    if (!draft) return null;
    let computedProxyUrl: string | null = null;
    if (proxyType !== "none" && proxyAddress.trim()) {
      computedProxyUrl = `${proxyType}://${proxyAddress.trim()}`;
    }
    return {
      ...draft,
      transfer: {
        ...draft.transfer,
        download_speed_limit_kib: parseNullableSpeedLimit(downloadLimitInput),
        upload_speed_limit_kib: parseNullableSpeedLimit(uploadLimitInput),
        proxy_url: computedProxyUrl,
      },
    };
  }, [draft, downloadLimitInput, uploadLimitInput, proxyType, proxyAddress]);

  normalizedDraftRef.current = normalizedDraft;

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
      setProxyType("none");
      setProxyAddress("");
      setFeedback(null);
      setResetOpen(false);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error));
    } finally {
      setResetting(false);
    }
  };

  // Auto-save debounce effect
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

  const navItems = useMemo<SettingsNavItem[]>(() => {
    const isAnimalCrossing = theme === "animal-crossing";
    return [
      {
        id: "general",
        label: UI_TEXT.settings.navGeneral,
        icon: isAnimalCrossing ? <AnimalIcon src={iconDiy} size="22px" /> : <Settings className="size-5" />,
      },
      {
        id: "download",
        label: UI_TEXT.settings.navDownload || "下载",
        icon: isAnimalCrossing ? <AnimalIcon src={iconDiy} size="22px" /> : <Download className="size-5" />,
      },
      {
        id: "transfer",
        label: UI_TEXT.settings.navTransfer,
        icon: isAnimalCrossing ? <AnimalIcon src={iconHelicopter} size="22px" /> : <Gauge className="size-5" />,
      },
      {
        id: "category",
        label: UI_TEXT.settings.navCategory,
        icon: isAnimalCrossing ? <AnimalIcon src={iconMap} size="22px" /> : <FolderTree className="size-5" />,
      },
      {
        id: "extension",
        label: UI_TEXT.settings.navExtension,
        icon: isAnimalCrossing ? <AnimalIcon src={iconDesign} size="22px" /> : <MonitorCog className="size-5" />,
      },
      {
        id: "magnet",
        label: UI_TEXT.settings.navMagnet,
        icon: isAnimalCrossing ? <AnimalIcon src={iconShopping} size="22px" /> : <Magnet className="size-5" />,
      },
      {
        id: "appearance",
        label: UI_TEXT.settings.navAppearance,
        icon: isAnimalCrossing ? <AnimalIcon src={iconCamera} size="22px" /> : <Paintbrush className="size-5" />,
      },
      {
        id: "player",
        label: UI_TEXT.settings.navPlayer || "播放器",
        icon: isAnimalCrossing ? <AnimalIcon src={iconChat} size="22px" /> : <PlayCircle className="size-5" />,
      },
      {
        id: "about",
        label: "关于",
        icon: isAnimalCrossing ? <AnimalIcon src={iconMiles} size="22px" /> : <Info className="size-5" />,
      },
    ];
  }, [theme, draft?.interface?.language]);

  const sectionHeaderInfo = useMemo(() => {
    if (!draft) return null;
    switch (activeSection) {
      case "general":
        return {
          icon: <Settings className="size-5" />,
          title: UI_TEXT.settings.navGeneral,
          description: UI_TEXT.settings.navGeneralDesc,
          action: <ResetSettingsButton onClick={() => setResetOpen(true)} onClose={onClose} />,
        };
      case "download":
        return {
          icon: <Download className="size-5" />,
          title: UI_TEXT.settings.navDownload || "下载",
          description: UI_TEXT.settings.navDownloadDesc || "下载引擎切换、路径保存与下载行为偏好。",
          action: <ResetSettingsButton onClick={() => setResetOpen(true)} onClose={onClose} />,
        };
      case "transfer":
        return {
          icon: <Cable className="size-5" />,
          title: UI_TEXT.settings.navTransfer,
          description: UI_TEXT.settings.navTransferDesc,
          action: <ResetSettingsButton onClick={() => setResetOpen(true)} onClose={onClose} />,
        };
      case "category":
        return {
          icon: <FolderTree className="size-5" />,
          title: UI_TEXT.settings.navCategory,
          description: UI_TEXT.settings.navCategoryDesc,
          action: <ResetSettingsButton onClick={() => setResetOpen(true)} onClose={onClose} />,
        };
      case "extension":
        return {
          icon: <MonitorCog className="size-5" />,
          title: UI_TEXT.settings.navExtension,
          description: UI_TEXT.settings.navExtensionDesc,
          action: <ResetSettingsButton onClick={() => setResetOpen(true)} onClose={onClose} />,
        };
      case "magnet":
        return {
          icon: <Magnet className="size-5" />,
          title: UI_TEXT.settings.magnetTitle,
          description: UI_TEXT.settings.magnetDesc,
          action: <ResetSettingsButton onClick={() => setResetOpen(true)} onClose={onClose} />,
        };
      case "appearance":
        return {
          icon: <Paintbrush className="size-5" />,
          title: UI_TEXT.settings.navAppearance,
          description: UI_TEXT.settings.navAppearanceDesc,
          action: <ResetSettingsButton onClick={() => setResetOpen(true)} onClose={onClose} />,
        };
      case "player":
        return {
          icon: <PlayCircle className="size-5" />,
          title: "播放器设置",
          description: "关于 WebDAV 视频预览播放器的默认设置",
          action: <ResetSettingsButton onClick={() => setResetOpen(true)} onClose={onClose} />,
        };
      case "about":
        return {
          icon: <Info className="size-5" />,
          title: "关于",
          description: "关于 PiDownloader 桌面下载器",
          action: onClose && (
            <Button variant="outline" size="sm" onClick={onClose}>
              关闭
            </Button>
          ),
        };
      default:
        return null;
    }
  }, [activeSection, draft?.interface?.language, onClose]);

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
          className="relative z-10 flex min-h-0 shrink-0 flex-col bg-[color-mix(in_oklab,var(--background),#000_4%)] dark:bg-[color-mix(in_oklab,var(--background),#000_15%)] px-2.5 py-4 border-r border-border/40 shadow-[var(--settings-sidebar-shadow)]"
          style={{ width: UI_TOKENS.settingsSidebarWidth, minWidth: UI_TOKENS.settingsSidebarWidth }}
        >
          <ScrollArea className="flex-1" visibility="auto" scrollbar="overlay" viewportClassName="space-y-2.5">
            {navItems.map((item) => {
              const active = item.id === activeSection;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`group/settings-nav w-full rounded-lg px-3.5 py-3.5 text-left transition-colors ${
                    active
                      ? "bg-primary/12 text-foreground shadow-surface-inset"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-4.5">
                    <div
                      className={`flex size-6 items-center justify-center transition-all duration-200 ${
                        active
                          ? "text-primary scale-[1.15]"
                          : "text-primary/75 group-hover/settings-nav:text-primary group-hover/settings-nav:scale-105"
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

        <main className="min-w-0 flex-1 flex flex-col h-full overflow-hidden">
          {sectionHeaderInfo && (
            <div className="shrink-0 px-6 pt-4 pb-4 border-b border-border/40 bg-card/65 backdrop-blur-md">
              <SettingsSectionHeader
                icon={sectionHeaderInfo.icon}
                title={sectionHeaderInfo.title}
                description={sectionHeaderInfo.description}
                action={sectionHeaderInfo.action}
              />
            </div>
          )}

          <ScrollArea className="flex-1 min-h-0" gutter="stable" safePadding viewportClassName="px-6 pt-0 pb-6">
            <div className="flex flex-col gap-6">
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
                  {activeSection === "general" && (
                    <GeneralSection draft={draft} updateDraft={updateDraft} />
                  )}

                  {activeSection === "download" && (
                    <DownloadSection draft={draft} updateDraft={updateDraft} />
                  )}

                  {activeSection === "transfer" && (
                    <TransferSection
                      draft={draft}
                      updateDraft={updateDraft}
                      downloadLimitInput={downloadLimitInput}
                      setDownloadLimitInput={setDownloadLimitInput}
                      uploadLimitInput={uploadLimitInput}
                      setUploadLimitInput={setUploadLimitInput}
                      proxyType={proxyType}
                      setProxyType={setProxyType}
                      proxyAddress={proxyAddress}
                      setProxyAddress={setProxyAddress}
                    />
                  )}

                  {activeSection === "category" && (
                    <CategorySection draft={draft} updateDraft={updateDraft} />
                  )}

                  {activeSection === "extension" && (
                    <ExtensionSection draft={draft} updateDraft={updateDraft} />
                  )}

                  {activeSection === "magnet" && (
                    <MagnetSection draft={draft} updateDraft={updateDraft} />
                  )}

                  {activeSection === "appearance" && (
                    <AppearanceSection draft={draft} updateDraft={updateDraft} />
                  )}

                  {activeSection === "player" && (
                    <PlayerSection draft={draft} updateDraft={updateDraft} />
                  )}

                  {activeSection === "about" && (
                    <AboutSection />
                  )}
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
            <DialogTitle>{UI_TEXT.settings.resetTitle}</DialogTitle>
          </DialogHeader>
          <DialogBody className="text-center">
            <DialogDescription>
              {UI_TEXT.settings.resetDesc}
            </DialogDescription>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)} disabled={resetting}>
              {UI_TEXT.settings.cancel}
            </Button>
            <Button
              variant="destructive"
              loading={resetting}
              loadingText={UI_TEXT.settings.resettingText}
              onClick={() => {
                resetToDefaults().catch(console.error);
              }}
            >
              {UI_TEXT.settings.resetConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
