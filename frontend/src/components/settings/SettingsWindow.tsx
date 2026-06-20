import { useEffect, useMemo, useState, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  Cable,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderOpen,
  FolderTree,
  Gauge,
  Magnet,
  MonitorCog,
  Paintbrush,
  Plus,
  Settings,
  Trash2,
  Upload,
  FileCode,
  Sparkles,
  Pencil,
  Copy,
  Check,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompoundInput, CompoundInputButton } from "@/components/ui/input";
import { OptionDropdown, SegmentedControl, useCustomFileIcons, saveCustomFileIcons, preprocessSvg } from "@/components/common";
import type { CustomFileIcon } from "@/components/common";
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
  type FloatDisplayMode,
  getBackgrounds,
  pickBackgroundFile,
  importBackgroundFile,
  importBackgroundUrl,
  deleteBackground,
  type DbBackground,
  updateTrackersFromSubscription,
  pickDownloadDirectory,
} from "@/core/bridge/tauri-commands";
import { convertFileSrc } from "@tauri-apps/api/core";

import { UI_TEXT } from "@/core/locale";
import { SUPPORTED_LANGUAGES } from "@/core/i18n";
import { useAppSettingsStore, type SettingsSectionId } from "@/core/store/useAppSettingsStore";
import { useDownloadStore } from "@/core/store/useDownloadStore";
import {
  useThemeStore,
  getModernThemeStyles,
  getSurfaceThemeStyles,
  getUbuntuThemeStyles,
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
import { playSoundEffect } from "@/core/audio";



interface SettingsNavItem {
  id: SettingsSectionId;
  label: string;
  icon: React.ReactNode;
}

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
  const openCreateTheme = useThemeStore((state) => state.openCreateTheme);
  const openEditTheme = useThemeStore((state) => state.openEditTheme);
  const openDuplicateTheme = useThemeStore((state) => state.openDuplicateTheme);
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
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [fontsLoading, setFontsLoading] = useState(false);
  const [fontLoadError, setFontLoadError] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

   const themeScrollRef = useRef<HTMLDivElement>(null);
  const lastSyncedSettingsRef = useRef<AppSettings | null>(null);
  const normalizedDraftRef = useRef<AppSettings | null>(null);
  const [showLeftScroll, setShowLeftScroll] = useState(false);
  const [showRightScroll, setShowRightScroll] = useState(true);

  const updateThemeScrollButtons = () => {
    if (themeScrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = themeScrollRef.current;
      setShowLeftScroll(scrollLeft > 10);
      setShowRightScroll(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  const scrollThemes = (direction: "left" | "right") => {
    if (themeScrollRef.current) {
      const container = themeScrollRef.current;
      const cardWidth = 304; // w-72 (288px) + gap-4 (16px)
      const targetScroll = direction === "left" 
        ? container.scrollLeft - cardWidth 
        : container.scrollLeft + cardWidth;
      
      container.scrollTo({
        left: targetScroll,
        behavior: "smooth"
      });
    }
  };



  // File Format and Icon Manager States & Handlers
  const customFileIcons = useCustomFileIcons();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [addIconOpen, setAddIconOpen] = useState(false);
  const [formatsInput, setFormatsInput] = useState("");
  const [selectedIconData, setSelectedIconData] = useState<{
    type: "png" | "svg";
    data: string;
    fileName: string;
  } | null>(null);
  const [svgColor, setSvgColor] = useState("#3b82f6");

  const navItems = useMemo<SettingsNavItem[]>(() => [
    { id: "general", label: UI_TEXT.settings.navGeneral, icon: <Settings className="size-4" /> },
    { id: "transfer", label: UI_TEXT.settings.navTransfer, icon: <Gauge className="size-4" /> },
    { id: "category", label: UI_TEXT.settings.navCategory, icon: <FolderTree className="size-4" /> },
    { id: "extension", label: UI_TEXT.settings.navExtension, icon: <MonitorCog className="size-4" /> },
    { id: "magnet", label: UI_TEXT.settings.navMagnet, icon: <Magnet className="size-4" /> },
    { id: "appearance", label: UI_TEXT.settings.navAppearance, icon: <Paintbrush className="size-4" /> },
  ], [draft?.interface?.language]);

  const speedDisplayUnitOptions = useMemo<{ value: SpeedDisplayUnit; label: string }[]>(() => [
    { value: "auto", label: UI_TEXT.settings.speedDisplayUnitAuto },
    { value: "kib", label: "KB/s" },
    { value: "mib", label: "MB/s" },
    { value: "mb", label: "Mbps" },
  ], [draft?.interface?.language]);

  const floatDisplayModeOptions = useMemo<{ value: FloatDisplayMode; label: string }[]>(() => [
    { value: "always", label: UI_TEXT.settings.floatWindowAlways },
    { value: "only_downloading", label: UI_TEXT.settings.floatWindowOnlyDownloading },
    { value: "hidden", label: UI_TEXT.settings.floatWindowHidden },
  ], [draft?.interface?.language]);

  const proxyTypeOptions = useMemo(() => [
    { value: "none", label: UI_TEXT.settings.proxyTypeNone },
    { value: "http", label: UI_TEXT.settings.proxyTypeHttp },
    { value: "https", label: UI_TEXT.settings.proxyTypeHttps },
    { value: "socks5", label: UI_TEXT.settings.proxyTypeSocks5 },
  ], [draft?.interface?.language]);

  const handlePickIconFile = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ""; // clear previous choice
      fileInputRef.current.click();
    }
  };

  const handleIconFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const name = file.name;
    const isSvg = file.type === "image/svg+xml" || name.toLowerCase().endsWith(".svg");
    const isPng = file.type === "image/png" || name.toLowerCase().endsWith(".png");

    if (!isSvg && !isPng) {
      useToastStore.getState().pushToast({
        title: UI_TEXT.settings.errFileFormatNotSupported,
        description: UI_TEXT.settings.errFileFormatNotSupportedDesc,
        variant: "destructive",
      });
      return;
    }

    if (file.size > 200 * 1024) {
      useToastStore.getState().pushToast({
        title: UI_TEXT.settings.errFileSizeLimit,
        description: UI_TEXT.settings.errFileSizeLimitDesc,
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    if (isSvg) {
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const processed = preprocessSvg(text);
        setSelectedIconData({
          type: "svg",
          data: processed,
          fileName: name,
        });
      };
      reader.readAsText(file);
    } else {
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        
        // Validate PNG width/height
        const img = new Image();
        img.onload = () => {
          if (img.width > 512 || img.height > 512) {
            useToastStore.getState().pushToast({
              title: UI_TEXT.settings.errImageDimensionsLimit,
              description: UI_TEXT.settings.errImageDimensionsLimitDesc,
              variant: "destructive",
            });
            return;
          }
          setSelectedIconData({
            type: "png",
            data: dataUrl,
            fileName: name,
          });
        };
        img.onerror = () => {
          useToastStore.getState().pushToast({
            title: UI_TEXT.settings.errImageLoadFailed,
            description: UI_TEXT.settings.errImageLoadFailedDesc,
            variant: "destructive",
          });
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveIcon = () => {
    if (!formatsInput.trim()) {
      useToastStore.getState().pushToast({
        title: UI_TEXT.settings.errSaveFailed,
        description: UI_TEXT.settings.errEnterFileFormat,
        variant: "destructive",
      });
      return;
    }

    if (!selectedIconData) {
      useToastStore.getState().pushToast({
        title: UI_TEXT.settings.errSaveFailed,
        description: UI_TEXT.settings.errUploadIcon,
        variant: "destructive",
      });
      return;
    }

    const formats = formatsInput
      .split(/[,;\s]+/)
      .map((f) => f.trim().toLowerCase().replace(/^\./, ""))
      .filter(Boolean);

    if (formats.length === 0) {
      useToastStore.getState().pushToast({
        title: UI_TEXT.settings.errSaveFailed,
        description: UI_TEXT.settings.errEnterValidFileFormat,
        variant: "destructive",
      });
      return;
    }

    const newIcon: CustomFileIcon = {
      id: Date.now().toString(),
      extensions: formats,
      iconType: selectedIconData.type,
      iconData: selectedIconData.data,
      color: selectedIconData.type === "svg" ? svgColor : undefined,
    };

    saveCustomFileIcons([...customFileIcons, newIcon]);

    setFormatsInput("");
    setSelectedIconData(null);
    setSvgColor("#3b82f6");
    setAddIconOpen(false);

    useToastStore.getState().pushToast({
      title: UI_TEXT.settings.iconSaveSuccess,
      description: UI_TEXT.settings.iconSaveSuccessDesc,
      variant: "success",
    });
  };

  const handleDeleteIcon = (id: string) => {
    saveCustomFileIcons(customFileIcons.filter((item) => item.id !== id));
    useToastStore.getState().pushToast({
      title: UI_TEXT.settings.iconDeleteSuccess,
      description: UI_TEXT.settings.iconDeleteSuccessDesc,
      variant: "success",
    });
  };

  const handleUpdateIconColor = (id: string, color: string) => {
    saveCustomFileIcons(
      customFileIcons.map((item) => {
        if (item.id === id) {
          return { ...item, color };
        }
        return item;
      })
    );
  };
  const fontOptions = useMemo(() => {
    const opts = createFontOptions(systemFonts);
    const selected = getThemeFontOption(fontId, opts);
    if (!opts.some((o) => o.id === selected.id)) {
      opts.push(selected);
    }
    return opts;
  }, [systemFonts, fontId]);
  const selectedFont = useMemo(() => getThemeFontOption(fontId, fontOptions), [fontId, fontOptions]);

  const [backgrounds, setBackgrounds] = useState<DbBackground[]>([]);
  const [onlineUrl, setOnlineUrl] = useState("");
  const [importingUrl, setImportingUrl] = useState(false);
  
  // Tracker updating states
  const [updatingTrackers, setUpdatingTrackers] = useState(false);

  const [bgPage, setBgPage] = useState(0);

  useEffect(() => {
    const totalPages = Math.ceil((backgrounds.length + 1) / 4);
    if (bgPage >= totalPages && totalPages > 0) {
      setBgPage(totalPages - 1);
    }
  }, [backgrounds, bgPage]);

  const handleUpdateTrackers = async () => {
    if (!draft?.bt?.tracker_subscribe_url?.trim()) return;
    setUpdatingTrackers(true);
    try {
      useToastStore.getState().pushToast({
        title: UI_TEXT.settings.updating,
        description: UI_TEXT.settings.updatingDesc,
      });
      const result = await updateTrackersFromSubscription();
      // Reload settings to get the updated tracker list
      await load();
      useToastStore.getState().pushToast({
        title: UI_TEXT.settings.updateSuccess,
        description: result,
        variant: "success",
      });
    } catch (err) {
      useToastStore.getState().pushToast({
        title: UI_TEXT.settings.updateFailed,
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setUpdatingTrackers(false);
    }
  };


  const allThemes = useMemo(() => {
    const { dark: modernDark, light: modernLight } = getModernThemeStyles();
    const { dark: surfaceDark, light: surfaceLight } = getSurfaceThemeStyles();
    const { dark: ubuntuDark, light: ubuntuLight } = getUbuntuThemeStyles();
    const modernMeta = THEME_REGISTRY.find((t) => t.id === "modern")!;
    const surfaceMeta = THEME_REGISTRY.find((t) => t.id === "surface")!;
    const ubuntuMeta = THEME_REGISTRY.find((t) => t.id === "ubuntu")!;

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
      styles: { dark: modernDark, light: modernLight },
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

    const surfaceTheme: CustomTheme = {
      id: "surface",
      name: surfaceMeta.name,
      description: surfaceMeta.description,
      author: "PiDown Team",
      version: "1.0.0",
      created_at: "2026-06-18",
      updated_at: "2026-06-18",
      hasCanvasBg: surfaceMeta.hasCanvasBg,
      hasSpecialSound: surfaceMeta.hasSpecialSound,
      accent: surfaceMeta.accent,
      previewClassName: surfaceMeta.previewClassName,
      styles: { dark: surfaceDark, light: surfaceLight },
      font: {
        id: "builtin:geist",
        name: "Geist",
        stack: "'Geist Variable', 'Microsoft YaHei UI', 'PingFang SC', 'Noto Sans CJK SC', sans-serif",
      },
    };

    const ubuntuTheme: CustomTheme = {
      id: "ubuntu",
      name: ubuntuMeta.name,
      description: ubuntuMeta.description,
      author: "PiDown Team",
      version: "1.0.0",
      created_at: "2026-06-18",
      updated_at: "2026-06-18",
      hasCanvasBg: ubuntuMeta.hasCanvasBg,
      hasSpecialSound: ubuntuMeta.hasSpecialSound,
      accent: ubuntuMeta.accent,
      previewClassName: ubuntuMeta.previewClassName,
      styles: { dark: ubuntuDark, light: ubuntuLight },
      font: {
        id: "builtin:geist",
        name: "Geist",
        stack: "'Geist Variable', 'Microsoft YaHei UI', 'PingFang SC', 'Noto Sans CJK SC', sans-serif",
      },
    };

    return [modernTheme, surfaceTheme, ubuntuTheme, ...customThemes];
  }, [customThemes]);

  useEffect(() => {
    // Initial check after layout renders
    const timer = setTimeout(() => {
      updateThemeScrollButtons();
    }, 150);
    window.addEventListener("resize", updateThemeScrollButtons);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateThemeScrollButtons);
    };
  }, [allThemes, activeSection]);

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

  const handlePickDir = async () => {
    if (!draft) return;
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
        title: UI_TEXT.settings.bgImporting,
        description: UI_TEXT.settings.bgImportingDesc,
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
        title: UI_TEXT.settings.bgImportSuccess,
        description: UI_TEXT.settings.bgImportSuccessDesc,
        variant: "success",
      });
    } catch (err) {
      useToastStore.getState().pushToast({
        title: UI_TEXT.settings.bgImportFailed,
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
        title: UI_TEXT.settings.bgDownloading,
        description: UI_TEXT.settings.bgDownloadingDesc,
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
        title: UI_TEXT.settings.bgImportSuccess,
        description: UI_TEXT.settings.bgDownloadSuccessDesc,
        variant: "success",
      });
    } catch (err) {
      useToastStore.getState().pushToast({
        title: UI_TEXT.settings.bgDownloadFailed,
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
        title: UI_TEXT.settings.bgDeleteSuccess,
        description: UI_TEXT.settings.bgDeleteSuccessDesc,
        variant: "success",
      });
    } catch (err) {
      useToastStore.getState().pushToast({
        title: UI_TEXT.settings.bgDeleteFailed,
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
        title: UI_TEXT.settings.exportSuccess,
        description: UI_TEXT.settings.exportSuccessDesc.replace("{themeName}", themeToExport.name),
        variant: "success",
      });
    } catch (error) {
      console.error(error);
      useToastStore.getState().pushToast({
        title: UI_TEXT.settings.exportFailed,
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
              throw new Error(UI_TEXT.settings.errInvalidThemeTemplate);
            }
            importTheme(parsed);
          }

          useToastStore.getState().pushToast({
            title: UI_TEXT.settings.importSuccess,
            description: UI_TEXT.settings.importSuccessThemeDesc.replace("{fileName}", file.name),
            variant: "success",
          });
        } catch (error) {
          console.error(error);
          useToastStore.getState().pushToast({
            title: UI_TEXT.settings.importFailed,
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
            {navItems.map((item) => {
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
                  {activeSection === "general" ? (
                    <SettingsSectionCard>
                      <SettingsSectionHeader
                        icon={<Settings className="size-5" />}
                        title={UI_TEXT.settings.navGeneral}
                        description={UI_TEXT.settings.navGeneralDesc}
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
                          <SettingsListItem
                            title={UI_TEXT.settings.diskAllocation}
                            description={UI_TEXT.settings.diskAllocationDesc}
                          >
                            <div className="flex justify-center w-full mt-2">
                              <SegmentedControl
                                value={draft.bt.allocation_mode}
                                options={[
                                  { value: "none", label: UI_TEXT.settings.allocNone },
                                  { value: "sparse", label: UI_TEXT.settings.allocSparse },
                                  { value: "full", label: UI_TEXT.settings.allocFull },
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
                                size="lg"
                                className="w-full max-w-md"
                              />
                            </div>
                          </SettingsListItem>
                        </SettingsList>

                        <div className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                          {UI_TEXT.settings.groupBehavior}
                        </div>
                        <SettingsList>
                          <SettingsListItem
                            title={UI_TEXT.settings.autoStartOnBoot}
                            description={UI_TEXT.settings.autoStartOnBootDesc}
                            action={
                              <Switch
                                checked={draft.interface.auto_start_on_boot}
                                onCheckedChange={(checked) =>
                                  updateDraft((prev) => ({
                                    ...prev,
                                    interface: {
                                      ...prev.interface,
                                      auto_start_on_boot: checked,
                                    },
                                  }))
                                }
                              />
                            }
                          />
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
                        </SettingsList>

                        <div className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                          {UI_TEXT.settings.windowBehaviorTitle}
                        </div>
                        <SettingsList>
                          <SettingsListItem
                            title={UI_TEXT.settings.windowBehaviorTitle}
                            description={UI_TEXT.settings.windowBehaviorDesc}
                          >
                            <div className="mt-2 space-y-3">
                              <div className="flex justify-center w-full">
                                <div className="w-full max-w-md">
                                  <SegmentedControl
                                    value={draft.interface.close_action}
                                    options={[
                                      { value: "minimize", label: UI_TEXT.settings.closeActionMinimize },
                                      { value: "tray", label: UI_TEXT.settings.closeActionTray },
                                      { value: "exit", label: UI_TEXT.settings.closeActionExit },
                                    ]}
                                    onValueChange={(nextAction) =>
                                      updateDraft((prev) => ({
                                        ...prev,
                                        interface: {
                                          ...prev.interface,
                                          close_action: nextAction as AppSettings["interface"]["close_action"],
                                        },
                                      }))
                                    }
                                    size="lg"
                                    className="w-full"
                                  />
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground leading-normal text-center">
                                {draft.interface.close_action === "minimize" && UI_TEXT.settings.closeActionMinimizeDesc}
                                {draft.interface.close_action === "tray" && UI_TEXT.settings.closeActionTrayDesc}
                                {draft.interface.close_action === "exit" && UI_TEXT.settings.closeActionExitDesc}
                              </p>
                            </div>
                          </SettingsListItem>
                          <SettingsListItem
                            title={UI_TEXT.settings.floatWindowSettingsTitle}
                            description={UI_TEXT.settings.floatWindowSettingsDesc}
                          >
                            <OptionDropdown
                              value={draft.interface.float_display_mode}
                              options={floatDisplayModeOptions}
                              onValueChange={(nextMode) =>
                                updateDraft((prev) => ({
                                  ...prev,
                                  interface: {
                                    ...prev.interface,
                                    float_display_mode: nextMode as AppSettings["interface"]["float_display_mode"],
                                  },
                                }))
                              }
                              ariaLabel={UI_TEXT.settings.floatWindowSettingsTitle}
                            />
                          </SettingsListItem>
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
                          <SettingsListItem
                            title={UI_TEXT.settings.enableNotifications}
                            description={UI_TEXT.settings.enableNotificationsDesc}
                            action={
                              <Switch
                                checked={draft.interface.enable_notifications ?? true}
                                onCheckedChange={(checked) =>
                                  updateDraft((prev) => ({
                                    ...prev,
                                    interface: {
                                      ...prev.interface,
                                      enable_notifications: checked,
                                    },
                                  }))
                                }
                              />
                            }
                          />
                        </SettingsList>

                        <div className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                          {UI_TEXT.settings.groupLanguage}
                        </div>
                        <SettingsList>
                          <SettingsListItem
                            title={UI_TEXT.settings.languageSetting}
                            description={UI_TEXT.settings.languageSettingDesc}
                          >
                            <OptionDropdown
                              value={draft.interface.language ?? "auto"}
                              options={SUPPORTED_LANGUAGES.map((lang) => ({
                                value: lang.code,
                                label: lang.code === "auto" ? UI_TEXT.settings.languageAuto : lang.label,
                              }))}
                              onValueChange={(nextLang) =>
                                updateDraft((prev) => ({
                                  ...prev,
                                  interface: {
                                    ...prev.interface,
                                    language: nextLang,
                                  },
                                }))
                              }
                              ariaLabel={UI_TEXT.settings.languageSetting}
                            />
                          </SettingsListItem>
                          <SettingsListItem
                            title={UI_TEXT.settings.datetimeFormatSetting}
                            description={UI_TEXT.settings.datetimeFormatSettingDesc}
                          >
                            <OptionDropdown
                              value={draft.interface.datetime_format ?? "YYYY-MM-DD HH:mm:ss"}
                              options={[
                                { value: "YYYY-MM-DD HH:mm:ss", label: "YYYY-MM-DD HH:mm:ss" },
                                { value: "YYYY/MM/DD HH:mm:ss", label: "YYYY/MM/DD HH:mm:ss" },
                                { value: "YYYY年MM月DD日 HH:mm:ss", label: "YYYY年MM月DD日 HH:mm:ss" },
                              ]}
                              onValueChange={(nextFormat) =>
                                updateDraft((prev) => ({
                                  ...prev,
                                  interface: {
                                    ...prev.interface,
                                    datetime_format: nextFormat,
                                  },
                                }))
                              }
                              ariaLabel={UI_TEXT.settings.datetimeFormatSetting}
                            />
                          </SettingsListItem>
                        </SettingsList>
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
                        {/* Group 1: 并发与队列 */}
                        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                          {UI_TEXT.settings.groupConcurrency}
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
                                "{{value}}",
                                String(draft.transfer.max_concurrent_downloads)
                              )}
                            />
                          </SettingsListItem>
                          <SettingsListItem
                            title={UI_TEXT.settings.maxConnectionsPerTask}
                            description={UI_TEXT.settings.maxConnectionsPerTaskDesc}
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
                              valueText={UI_TEXT.settings.maxConnectionsPerTaskValueText.replace(
                                "{value}",
                                String(draft.transfer.task_thread_count)
                              )}
                            />
                          </SettingsListItem>
                        </SettingsList>

                        {/* Group 2: 速度限制 */}
                        <div className="mb-3 mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                          {UI_TEXT.settings.groupBandwidth}
                        </div>
                        <SettingsList>
                          <SettingsListItem
                            title={UI_TEXT.settings.globalSpeedLimit}
                            description={UI_TEXT.settings.globalSpeedLimitDesc}
                          >
                            <div className="flex flex-col sm:flex-row gap-4 w-full mt-2">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className="text-xs text-muted-foreground whitespace-nowrap w-8">{UI_TEXT.settings.speedLimitDownloadLabel}</span>
                                <SettingsInput
                                  value={downloadLimitInput}
                                  onChange={(event) => setDownloadLimitInput(event.target.value)}
                                  placeholder={UI_TEXT.settings.unlimitedPlaceholder}
                                  className="font-mono flex-1 min-w-0"
                                />
                                <span className="text-xs text-muted-foreground shrink-0 w-10">KB/s</span>
                              </div>
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className="text-xs text-muted-foreground whitespace-nowrap w-8">{UI_TEXT.settings.speedLimitUploadLabel}</span>
                                <SettingsInput
                                  value={uploadLimitInput}
                                  onChange={(event) => setUploadLimitInput(event.target.value)}
                                  placeholder={UI_TEXT.settings.unlimitedPlaceholder}
                                  className="font-mono flex-1 min-w-0"
                                />
                                <span className="text-xs text-muted-foreground shrink-0 w-10">KB/s</span>
                              </div>
                            </div>
                          </SettingsListItem>
                          <SettingsListItem
                            title={UI_TEXT.settings.speedDisplayUnit}
                            description={UI_TEXT.settings.speedDisplayUnitDesc}
                          >
                            <OptionDropdown
                              value={draft.transfer.speed_display_unit}
                              options={speedDisplayUnitOptions}
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
                        </SettingsList>

                        {/* Group 3: 网络与安全 */}
                        <div className="mb-3 mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                          {UI_TEXT.settings.groupNetworkAndSecurity}
                        </div>
                        <SettingsList>
                          <SettingsListItem
                            title={UI_TEXT.settings.globalProxy}
                            description={UI_TEXT.settings.globalProxyDesc}
                            childrenSpan="full"
                          >
                            <div className="flex flex-col sm:flex-row gap-3 mt-2 w-full">
                              <div className="w-32 shrink-0">
                                <OptionDropdown
                                  value={proxyType}
                                  options={proxyTypeOptions}
                                  onValueChange={(val) => setProxyType(val as any)}
                                  ariaLabel="Proxy Type"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <SettingsInput
                                  value={proxyType === "none" ? "" : proxyAddress}
                                  onChange={(event) => setProxyAddress(event.target.value)}
                                  disabled={proxyType === "none"}
                                  placeholder={UI_TEXT.settings.proxyAddressPlaceholder}
                                  className="font-mono w-full"
                                />
                              </div>
                            </div>
                          </SettingsListItem>
                          <SettingsListItem
                            title={UI_TEXT.settings.ignoreSslErrors}
                            description={UI_TEXT.settings.ignoreSslErrorsDesc}
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
                            title={UI_TEXT.settings.maxDownloadRetries}
                            description={UI_TEXT.settings.maxDownloadRetriesDesc}
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
                              valueText={UI_TEXT.settings.maxDownloadRetriesValueText.replace(
                                "{value}",
                                String(draft.transfer.max_download_retries)
                              )}
                            />
                          </SettingsListItem>
                          <SettingsListItem
                            title={UI_TEXT.settings.globalUserAgent}
                            description={UI_TEXT.settings.globalUserAgentDesc}
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
                        </SettingsList>
                      </div>
                    </SettingsSectionCard>
                  ) : null}

                  {activeSection === "category" ? (
                    <>
                      <SettingsSectionCard>
                        <SettingsSectionHeader
                          icon={<FolderTree className="size-5" />}
                          title={UI_TEXT.settings.navCategory}
                          description={UI_TEXT.settings.navCategoryDesc}
                          action={<ResetSettingsButton onClick={() => setResetOpen(true)} />}
                        />

                        <div className="mt-5">
                          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                            {UI_TEXT.settings.autoCategory}
                          </div>
                          <SettingsList>
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

                      <SettingsSectionCard className="mt-6">
                        <SettingsSectionHeader
                          icon={<FileCode className="size-5" />}
                          title={UI_TEXT.settings.fileIconManagement}
                          description={UI_TEXT.settings.fileIconManagementDesc}
                          action={
                            <Button
                              variant="outline"
                              size="sm"
                              leftIcon={<Plus className="size-4" />}
                              onClick={() => {
                                setFormatsInput("");
                                setSelectedIconData(null);
                                setSvgColor("#3b82f6");
                                setAddIconOpen(true);
                              }}
                              className="h-8 font-normal"
                            >
                              {UI_TEXT.settings.addMapping}
                            </Button>
                          }
                        />
                        
                        {/* Local stylesheet for SVG scale */}
                        <style>{`
                          .custom-file-icon-svg svg {
                            width: 100%;
                            height: 100%;
                            display: block;
                          }
                        `}</style>

                        <div className="mt-5 space-y-4">
                          {/* Hidden file input */}
                          <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleIconFileChange}
                            accept=".png,.svg"
                            className="hidden"
                          />

                          {/* Mappings List */}
                          <div className="space-y-3">
                            <span className="block text-sm font-semibold leading-5 text-foreground">
                              {UI_TEXT.settings.configuredFormatIcons.replace("{count}", String(customFileIcons.length))}
                            </span>
                            
                            {customFileIcons.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-10 rounded-xl border border-dashed border-border/40 bg-secondary/5 text-muted-foreground">
                                <Sparkles className="size-7 mb-2 opacity-50 text-muted-foreground" />
                                <span className="text-xs">{UI_TEXT.settings.noCustomIconMapping}</span>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {customFileIcons.map((icon) => (
                                  <div
                                    key={icon.id}
                                    className="flex items-center justify-between p-3 border border-border/60 rounded-xl bg-secondary/10 hover:bg-secondary/20 hover:border-border transition-all gap-4"
                                  >
                                    {/* Left: Icon preview */}
                                    <div className="size-10 shrink-0 flex items-center justify-center rounded-lg bg-card/60 border border-border/40 shadow-sm overflow-hidden">
                                      {icon.iconType === "png" ? (
                                        <img
                                          src={icon.iconData}
                                          alt="icon"
                                          className="size-7 object-contain"
                                        />
                                      ) : (
                                        <div
                                          className="size-7 flex items-center justify-center custom-file-icon-svg"
                                          style={icon.color ? { color: icon.color } : undefined}
                                          dangerouslySetInnerHTML={{ __html: icon.iconData }}
                                        />
                                      )}
                                    </div>

                                    {/* Middle: File extensions */}
                                    <div className="flex-1 min-w-0">
                                      <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        {UI_TEXT.settings.mappingFormat}
                                      </span>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {icon.extensions.map((ext) => (
                                          <span
                                            key={ext}
                                            className="px-1.5 py-0.5 text-[10px] font-semibold font-mono uppercase bg-card rounded border border-border/40 text-foreground/80"
                                          >
                                            .{ext}
                                          </span>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Right: Actions (Color Picker & Delete) */}
                                    <div className="flex items-center gap-2 shrink-0">
                                      {icon.iconType === "svg" && (
                                        <div
                                          className="relative size-6 shrink-0 rounded-full border border-border/80 overflow-hidden shadow-sm hover:scale-105 transition-transform"
                                          style={{ backgroundColor: icon.color || "#000000" }}
                                          title={UI_TEXT.settings.modifySvgColor}
                                        >
                                          <input
                                            type="color"
                                            value={icon.color || "#000000"}
                                            onChange={(e) => handleUpdateIconColor(icon.id, e.target.value)}
                                            className="absolute -inset-1 size-[150%] cursor-pointer border-0 bg-transparent p-0 opacity-0"
                                          />
                                        </div>
                                      )}
                                      
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleDeleteIcon(icon.id)}
                                        className="text-destructive hover:bg-destructive/10 hover:text-destructive size-8 rounded-lg cursor-pointer"
                                      >
                                        <Trash2 className="size-4" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </SettingsSectionCard>
                    </>
                  ) : null}

                  {activeSection === "extension" ? (
                    <SettingsSectionCard>
                      <SettingsSectionHeader
                        icon={<MonitorCog className="size-5" />}
                        title={UI_TEXT.settings.navExtension}
                        description={UI_TEXT.settings.navExtensionDesc}
                        action={<ResetSettingsButton onClick={() => setResetOpen(true)} />}
                      />

                      <div className="mt-5">
                        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                          {UI_TEXT.settings.groupBehavior}
                        </div>
                        <SettingsList>
                          <SettingsListItem
                            title={UI_TEXT.settings.browserExtIntegration}
                            description={UI_TEXT.settings.browserExtIntegrationDesc}
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
                              title={UI_TEXT.settings.portAndToken}
                              description={UI_TEXT.settings.portAndTokenDesc}
                            >
                              <div className="flex flex-col sm:flex-row gap-4 w-full mt-2">
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">{UI_TEXT.settings.port}</span>
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
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">{UI_TEXT.settings.token}</span>
                                  <CompoundInput
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
                                    placeholder={UI_TEXT.settings.token}
                                    className="font-mono flex-1 min-w-0"
                                    suffixActions={
                                      <>
                                        <CompoundInputButton
                                          type="button"
                                          divider="left"
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
                                          className="px-3"
                                          title={UI_TEXT.settings.tokenRandom}
                                        >
                                          <RefreshCw className="size-4" />
                                        </CompoundInputButton>
                                        <CompoundInputButton
                                          type="button"
                                          divider="left"
                                          onClick={() => {
                                            navigator.clipboard.writeText(draft.download.browser_extension_token || "");
                                            setTokenCopied(true);
                                            setTimeout(() => setTokenCopied(false), 2000);
                                            useToastStore.getState().pushToast({
                                              title: UI_TEXT.settings.copied,
                                              description: UI_TEXT.settings.tokenCopiedDesc,
                                              variant: "success",
                                            });
                                          }}
                                          className="px-3"
                                          title={UI_TEXT.settings.tokenCopy}
                                        >
                                          {tokenCopied ? (
                                            <Check className="size-4 text-green-500" />
                                          ) : (
                                            <Copy className="size-4" />
                                          )}
                                        </CompoundInputButton>
                                      </>
                                    }
                                  />
                                </div>
                              </div>
                            </SettingsListItem>
                          )}
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
                        title={UI_TEXT.settings.magnetTitle}
                        description={UI_TEXT.settings.magnetDesc}
                        action={<ResetSettingsButton onClick={() => setResetOpen(true)} />}
                      />

                      <div className="mt-5">
                        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                          {UI_TEXT.settings.magnetGroupConnection}
                        </div>
                        <SettingsList>
                          <SettingsListItem
                            title={UI_TEXT.settings.enableDht}
                            description={UI_TEXT.settings.enableDhtDesc}
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
                            title={UI_TEXT.settings.enablePex}
                            description={UI_TEXT.settings.enablePexDesc}
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
                            title={UI_TEXT.settings.enableLpd}
                            description={UI_TEXT.settings.enableLpdDesc}
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
                          {UI_TEXT.settings.magnetGroupNetwork}
                        </div>
                        <SettingsList>
                          <SettingsListItem
                            title={UI_TEXT.settings.listenPort}
                            description={UI_TEXT.settings.listenPortDesc}
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
                              <span className="text-muted-foreground">{UI_TEXT.settings.portTo}</span>
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
                            title={UI_TEXT.settings.encryptionPolicy}
                            description={UI_TEXT.settings.encryptionPolicyDesc}
                          >
                            <OptionDropdown
                              value={draft.bt.encryption_policy}
                              options={[
                                { value: "preferred", label: UI_TEXT.settings.encryptPreferred },
                                { value: "allowed", label: UI_TEXT.settings.encryptAllowed },
                                { value: "required", label: UI_TEXT.settings.encryptRequired },
                                { value: "disabled", label: UI_TEXT.settings.encryptDisabled },
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
                              ariaLabel={UI_TEXT.settings.encryptionPolicy}
                            />
                          </SettingsListItem>

                          <SettingsListItem
                            title={UI_TEXT.settings.seedRatioThreshold}
                            description={UI_TEXT.settings.seedRatioThresholdDesc}
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
                              <span className="text-muted-foreground text-sm">{UI_TEXT.settings.seedRatioUnit}</span>
                            </div>
                          </SettingsListItem>

                          <SettingsListItem
                            title={UI_TEXT.settings.peerLoopInterval}
                            description={UI_TEXT.settings.peerLoopIntervalDesc}
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
                              <span className="text-muted-foreground text-sm">{UI_TEXT.settings.msUnit}</span>
                            </div>
                          </SettingsListItem>
                        </SettingsList>

                        <div className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                          {UI_TEXT.settings.magnetGroupTracker}
                        </div>
                        <SettingsList>
                          <SettingsListItem
                            title={UI_TEXT.settings.trackerSubscribe}
                            description={UI_TEXT.settings.trackerSubscribeDesc}
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
                                {UI_TEXT.settings.updateNow}
                              </Button>
                            </div>
                          </SettingsListItem>

                          <SettingsListItem
                            title={UI_TEXT.settings.trackerList}
                            description={UI_TEXT.settings.trackerListDesc}
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
                    <>
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
                            <div className="flex gap-2">
                              {/* Temporarily hide theme editor entry points */}
                              {false && (
                                <Button
                                  variant="outline"
                                  size="xs"
                                  leftIcon={<Plus className="size-3" />}
                                  onClick={openCreateTheme}
                                  className="normal-case tracking-normal h-7 font-normal"
                                >
                                  {UI_TEXT.settings.createTheme}
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="xs"
                                leftIcon={<Upload className="size-3" />}
                                onClick={triggerImportTheme}
                                className="normal-case tracking-normal h-7 font-normal"
                              >
                                {UI_TEXT.settings.importTheme}
                              </Button>
                            </div>
                          </div>
                          <div className="relative flex items-center group/carousel">
                            {/* Left Scroll Button */}
                            {showLeftScroll && (
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => scrollThemes("left")}
                                className="absolute -left-4 z-20 size-9 rounded-full bg-card/90 shadow-md hover:bg-accent border-border cursor-pointer transition-transform active:scale-95"
                              >
                                <ChevronLeft className="size-5" />
                              </Button>
                            )}

                            {/* Left Blur Overlay */}
                            {showLeftScroll && (
                              <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-card to-transparent pointer-events-none z-10" />
                            )}

                            {/* Viewport for theme cards */}
                            <div
                              ref={themeScrollRef}
                              onScroll={updateThemeScrollButtons}
                              className="flex w-full flex-row gap-4 overflow-x-auto py-2 scroll-smooth scrollbar-none snap-x snap-mandatory"
                              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                            >
                              {allThemes.map((item) => {
                                const active = theme === item.id;
                                const isCustom = item.id !== "modern" && item.id !== "surface" && item.id !== "ubuntu";
                                const cardPrimaryColor = item.styles[colorMode]?.["--primary"] || "var(--primary)";
                                const cardAccentColor = item.styles[colorMode]?.["--accent"] || item.styles[colorMode]?.["--primary"] || "var(--accent)";

                                return (
                                  <article
                                    key={item.id}
                                    className={`group/theme-card flex h-96 w-72 shrink-0 flex-col overflow-hidden rounded-xl border bg-card/82 shadow-surface-raised transition-all snap-start ${
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
                                      <div 
                                        className="absolute inset-x-4 top-4 h-6 rounded-t-lg border border-primary-foreground/30 shadow-surface-raised" 
                                        style={{ backgroundColor: cardPrimaryColor, opacity: 0.85 }}
                                      />
                                      <div className="absolute inset-x-4 bottom-4 h-14 rounded-b-lg border border-border/70 bg-card/82 shadow-surface-strong backdrop-blur-sm" />
                                      <div 
                                        className="absolute bottom-6 left-7 h-2 w-16 rounded-full" 
                                        style={{ backgroundColor: cardPrimaryColor, opacity: 0.7 }}
                                      />
                                      <div 
                                        className="absolute bottom-6 right-7 h-2 w-8 rounded-full" 
                                        style={{ backgroundColor: cardAccentColor, opacity: 0.7 }}
                                      />
                                      <div className="absolute right-4 top-3 rounded-full border border-primary-foreground/45 bg-card/78 px-2 py-1 text-[11px] font-semibold text-foreground shadow-surface-raised">
                                        {item.accent || UI_TEXT.settings.customTheme}
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
                                          {item.hasCanvasBg ? UI_TEXT.settings.dynamicBg : UI_TEXT.settings.staticBg}
                                        </span>
                                        <span className="rounded-full border border-border bg-secondary/70 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                                          {item.hasSpecialSound ? UI_TEXT.settings.themeSound : UI_TEXT.settings.defaultSound}
                                        </span>
                                        {item.font && (
                                          <span className="rounded-full border border-border bg-secondary/70 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                                            {UI_TEXT.settings.fontPrefix}{item.font.name}
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
                                        
                                        {/* Temporarily hide theme editor edit/duplicate entry points */}
                                        {false && (isCustom ? (
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                variant="outline"
                                                size="icon"
                                                className="shrink-0 rounded-[min(var(--radius-md),12px)]"
                                                onClick={() => openEditTheme(item)}
                                              >
                                                <Pencil className="size-4" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>{UI_TEXT.settings.editTheme}</TooltipContent>
                                          </Tooltip>
                                        ) : (
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                variant="outline"
                                                size="icon"
                                                className="shrink-0 rounded-[min(var(--radius-md),12px)]"
                                                onClick={() => openDuplicateTheme(item)}
                                              >
                                                <Copy className="size-4" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>{UI_TEXT.settings.createTheme}</TooltipContent>
                                          </Tooltip>
                                        ))}

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
                                          <TooltipContent>{UI_TEXT.settings.exportTheme}</TooltipContent>
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
                                            <TooltipContent>{UI_TEXT.settings.deleteTheme}</TooltipContent>
                                          </Tooltip>
                                        )}
                                      </div>
                                    </div>
                                  </article>
                                );
                              })}
                            </div>

                            {/* Right Blur Overlay */}
                            {showRightScroll && (
                              <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-card to-transparent pointer-events-none z-10" />
                            )}

                            {/* Right Scroll Button */}
                            {showRightScroll && (
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => scrollThemes("right")}
                                className="absolute -right-4 z-20 size-9 rounded-full bg-card/90 shadow-md hover:bg-accent border-border cursor-pointer transition-transform active:scale-95"
                              >
                                <ChevronRight className="size-5" />
                              </Button>
                            )}
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
                              title={UI_TEXT.settings.borderlessClickThrough}
                              description={UI_TEXT.settings.borderlessClickThroughDesc}
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
                              title={UI_TEXT.settings.disableWindowShadow}
                              description={UI_TEXT.settings.disableWindowShadowDesc}
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
                            {UI_TEXT.settings.groupBackgroundManagement}
                          </div>
                          <div className="space-y-6 rounded-xl border border-border/60 bg-secondary/15 p-4 shadow-inner">
                            {/* Control Panel: Add/Import Backgrounds */}
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                              <div className="flex-1">
                                <label className="block text-sm font-semibold leading-5 text-foreground mb-1.5">
                                  {UI_TEXT.settings.onlineBgUrl}
                                </label>
                                <div className="flex gap-2">
                                  <SettingsInput
                                    value={onlineUrl}
                                    onChange={(e) => setOnlineUrl(e.target.value)}
                                    placeholder={UI_TEXT.settings.onlineBgUrlPlaceholder}
                                    className="flex-1 bg-card/60 border-border/80 focus:border-primary/50"
                                    disabled={importingUrl}
                                  />
                                  <Button
                                    onClick={handleImportUrl}
                                    loading={importingUrl}
                                    loadingText={UI_TEXT.settings.bgDownloading}
                                    disabled={!onlineUrl.trim() || importingUrl}
                                  >
                                    {UI_TEXT.settings.import}
                                  </Button>
                                </div>
                              </div>

                              <div className="flex flex-col justify-end">
                                <label className="block text-sm font-semibold leading-5 text-foreground mb-1.5 sm:text-transparent select-none pointer-events-none">
                                  {UI_TEXT.settings.localImport}
                                </label>
                                <Button
                                  variant="outline"
                                  leftIcon={<FolderOpen className="size-4" />}
                                  onClick={handlePickAndImportFile}
                                  className="w-full sm:w-auto"
                                >
                                  {UI_TEXT.settings.importLocalFile}
                                </Button>
                              </div>
                            </div>

                            {/* Background List Manager Grid (Paginated Row, 4 Columns) */}
                            <div className="space-y-3 border-t border-border/60 pt-5">
                              <span className="block text-sm font-semibold leading-5 text-foreground">
                                {UI_TEXT.settings.importedBackgrounds}
                              </span>
                              
                              <div className="flex items-center gap-3">
                                {/* Left Arrow Button */}
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => setBgPage((prev) => Math.max(0, prev - 1))}
                                  disabled={bgPage === 0}
                                  className="size-9 shrink-0 rounded-lg cursor-pointer"
                                >
                                  <ChevronLeft className="size-5" />
                                </Button>

                                {/* 4-Column Grid Row */}
                                <div className="flex-1 grid grid-cols-4 gap-4">
                                  {(() => {
                                    const allBgs = [null, ...backgrounds];
                                    const startIndex = bgPage * 4;
                                    const visibleBgs = allBgs.slice(startIndex, startIndex + 4);

                                    return (
                                      <>
                                        {visibleBgs.map((bg) => {
                                          if (bg === null) {
                                            return (
                                              <button
                                                key="default-bg"
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
                                                  <span className="text-sm font-bold text-foreground">{UI_TEXT.settings.noDefaultBg}</span>
                                                  <span className="mt-1 text-xs text-muted-foreground">{UI_TEXT.settings.useThemeBuiltinEffects}</span>
                                                </div>
                                                {draft.interface.background_id === null && (
                                                  <div className="absolute right-2 top-2 rounded-full bg-primary/12 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                                                    {UI_TEXT.settings.inUse}
                                                  </div>
                                                )}
                                              </button>
                                            );
                                          }

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
                                                  {UI_TEXT.settings.applied}
                                                </div>
                                              )}

                                              {bg.is_online && (
                                                <div className="absolute right-2 top-2 rounded-full bg-accent/95 px-1.5 py-0.5 text-[10px] font-bold text-accent-foreground shadow-sm z-10">
                                                  {UI_TEXT.settings.online}
                                                </div>
                                              )}

                                              {/* Delete Overlay / Button */}
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleDeleteBackground(bg.id);
                                                }}
                                                className="absolute bottom-2 right-2 flex size-7 items-center justify-center rounded-lg border border-destructive/20 bg-destructive/10 text-destructive opacity-0 hover:bg-destructive hover:text-white transition-opacity group-hover:opacity-100 shadow-sm z-20 cursor-pointer"
                                                title={UI_TEXT.settings.deleteBackgroundRecord}
                                              >
                                                <Trash2 className="size-4" />
                                              </button>
                                            </div>
                                          );
                                        })}

                                        {/* Empty placeholders to preserve grid layout and column widths */}
                                        {Array.from({ length: 4 - visibleBgs.length }).map((_, i) => (
                                          <div
                                            key={`placeholder-${i}`}
                                            className="aspect-video rounded-xl border border-dashed border-border/30 bg-secondary/5 opacity-40"
                                          />
                                        ))}
                                      </>
                                    );
                                  })()}
                                </div>

                                {/* Right Arrow Button */}
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => {
                                    const allBgs = [null, ...backgrounds];
                                    const totalPages = Math.ceil(allBgs.length / 4);
                                    setBgPage((prev) => Math.min(totalPages - 1, prev + 1));
                                  }}
                                  disabled={bgPage >= Math.ceil(([null, ...backgrounds].length) / 4) - 1}
                                  className="size-9 shrink-0 rounded-lg cursor-pointer"
                                >
                                  <ChevronRight className="size-5" />
                                </Button>
                              </div>
                            </div>

                            {/* Config Options: Blur -> Opacity -> Mask Color -> Mask Opacity */}
                            <div className="space-y-6 border-t border-border/60 pt-5">
                              <Slider
                                label={UI_TEXT.settings.backgroundBlur}
                                description={UI_TEXT.settings.backgroundBlurDesc}
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
                                label={UI_TEXT.settings.backgroundOpacity}
                                description={UI_TEXT.settings.backgroundOpacityDesc}
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

                              <div>
                                <span className="block text-sm font-semibold leading-5 text-foreground">
                                  {UI_TEXT.settings.backgroundMaskColor}
                                </span>
                                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                  {UI_TEXT.settings.backgroundMaskColorDesc}
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

                              <Slider
                                label={UI_TEXT.settings.backgroundMaskOpacity}
                                description={UI_TEXT.settings.backgroundMaskOpacityDesc}
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
                          </div>

                          <div className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                            {UI_TEXT.settings.soundChimeTitle}
                          </div>
                          <SettingsList>
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
                              title={UI_TEXT.settings.soundPlayComplete}
                              description={UI_TEXT.settings.soundPlayCompleteDesc}
                              action={
                                <Switch
                                  checked={draft.download.play_sound_on_complete ?? true}
                                  onCheckedChange={(checked) =>
                                    updateDraft((prev) => ({
                                      ...prev,
                                      download: {
                                        ...prev.download,
                                        play_sound_on_complete: checked,
                                      },
                                    }))
                                  }
                                />
                              }
                            />
                            {(draft.download.play_sound_on_complete ?? true) && (
                              <SettingsListItem
                                title={UI_TEXT.settings.soundSelect}
                                description={UI_TEXT.settings.soundSelectDesc}
                              >
                                <div className="flex items-center gap-3 mt-2">
                                  <div className="w-64 shrink-0">
                                    <OptionDropdown
                                      value={draft.download.sound_effect_id ?? "success"}
                                      options={[
                                        { value: "success", label: UI_TEXT.settings.soundSuccess },
                                        { value: "bell", label: UI_TEXT.settings.soundBell },
                                        { value: "digital", label: UI_TEXT.settings.soundDigital },
                                        { value: "glass", label: UI_TEXT.settings.soundGlass },
                                      ]}
                                      onValueChange={(value) =>
                                        updateDraft((prev) => ({
                                          ...prev,
                                          download: {
                                            ...prev.download,
                                            sound_effect_id: value,
                                          },
                                        }))
                                      }
                                    />
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => playSoundEffect(draft.download.sound_effect_id ?? "success")}
                                  >
                                    {UI_TEXT.settings.soundAudition}
                                  </Button>
                                </div>
                              </SettingsListItem>
                            )}
                          </SettingsList>
                        </div>
                      </SettingsSectionCard>
                    </>
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

      <Dialog open={addIconOpen} onOpenChange={setAddIconOpen}>
        <DialogContent size="default" variant="modal">
          <DialogHeader>
            <DialogTitle>{UI_TEXT.settings.addFileIconMapping}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {/* Associated file formats */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {UI_TEXT.settings.associatedFileFormats}
              </label>
              <SettingsInput
                value={formatsInput}
                onChange={(e) => setFormatsInput(e.target.value)}
                placeholder={UI_TEXT.settings.associatedFileFormatsPlaceholder}
                className="w-full bg-card border-border/80 focus:border-primary/50"
              />
              <p className="text-xs text-muted-foreground/80 leading-relaxed">
                {UI_TEXT.settings.associatedFileFormatsDesc}
              </p>
            </div>

            {/* Icon File Upload */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {UI_TEXT.settings.iconFile}
              </label>
              <button
                type="button"
                onClick={handlePickIconFile}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border/80 bg-card/40 p-3 text-sm text-muted-foreground hover:bg-card/75 hover:text-foreground transition-all cursor-pointer h-10 min-w-0"
              >
                <Upload className="size-4 shrink-0" />
                <span className="truncate max-w-[280px]">
                  {selectedIconData ? selectedIconData.fileName : UI_TEXT.settings.selectIconFile}
                </span>
              </button>
              <p className="text-xs text-muted-foreground/80 leading-relaxed">
                {UI_TEXT.settings.iconFileRequirement}
              </p>
            </div>

            {/* SVG Custom Color */}
            {selectedIconData?.type === "svg" && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {UI_TEXT.settings.iconColor}
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative size-10 shrink-0 overflow-hidden rounded-lg border border-border shadow-sm">
                    <input
                      type="color"
                      value={svgColor}
                      onChange={(e) => setSvgColor(e.target.value)}
                      className="absolute -inset-2 size-[150%] cursor-pointer border-0 bg-transparent p-0"
                    />
                  </div>
                  <SettingsInput
                    value={svgColor}
                    onChange={(e) => setSvgColor(e.target.value)}
                    placeholder="#3b82f6"
                    className="max-w-[120px] font-mono text-sm uppercase bg-card"
                  />
                </div>
              </div>
            )}

            {/* Icon Preview */}
            {selectedIconData && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-secondary/15">
                <span className="text-xs text-muted-foreground font-medium">{UI_TEXT.settings.preview}</span>
                <div className="size-8 flex items-center justify-center rounded bg-card border border-border/30 overflow-hidden shrink-0">
                  {selectedIconData.type === "png" ? (
                    <img
                      src={selectedIconData.data}
                      alt="preview"
                      className="size-6 object-contain"
                    />
                  ) : (
                    <div
                      className="size-6 flex items-center justify-center custom-file-icon-svg"
                      style={{ color: svgColor }}
                      dangerouslySetInnerHTML={{ __html: selectedIconData.data }}
                    />
                  )}
                </div>
                <span className="text-xs text-muted-foreground truncate flex-1 font-medium">
                  {selectedIconData.fileName}
                </span>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setSelectedIconData(null)}
                  className="h-7 text-xs font-normal"
                >
                  {UI_TEXT.settings.clear}
                </Button>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddIconOpen(false);
                setFormatsInput("");
                setSelectedIconData(null);
              }}
            >
              {UI_TEXT.settings.cancel}
            </Button>
            <Button
              type="button"
              onClick={handleSaveIcon}
              disabled={!formatsInput.trim() || !selectedIconData}
              leftIcon={<Plus className="size-4" />}
            >
              {UI_TEXT.settings.confirmAdd}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


    </motion.div>
  );
}
