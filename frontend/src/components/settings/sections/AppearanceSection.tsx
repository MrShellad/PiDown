import { useEffect, useMemo, useState, useRef } from "react";
import { motion } from "motion/react";
import {
  Upload,
  ChevronLeft,
  ChevronRight,
  Download,
  Trash2,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { OptionDropdown } from "@/components/common";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  type CustomTheme,
  useThemeStore,
  getModernThemeStyles,
  getSurfaceThemeStyles,
  getUbuntuThemeStyles,
  getAnimalCrossingThemeStyles,
  parseThemeZip,
} from "@/core/store/useThemeStore";
import {
  type AppSettings,
  getBackgrounds,
  pickBackgroundFile,
  importBackgroundFile,
  importBackgroundUrl,
  deleteBackground,
  type DbBackground,
  listSystemFonts,
} from "@/core/bridge/tauri-commands";
import { convertFileSrc } from "@tauri-apps/api/core";
import { UI_TEXT } from "@/core/locale";
import { useToastStore } from "@/core/store/useToastStore";
import { playSoundEffect } from "@/core/audio";
import { THEME_REGISTRY } from "@/themes/config";
import { createFontOptions, getThemeFontOption } from "@/themes/fonts";
import {
  SettingsList,
  SettingsListItem,
  SettingsSectionCard,
  SettingsInput,
} from "../SettingsPrimitives";

interface AppearanceSectionProps {
  draft: AppSettings;
  updateDraft: (updater: (prev: AppSettings) => AppSettings) => void;
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

export default function AppearanceSection({ draft, updateDraft }: AppearanceSectionProps) {
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

  // Background Management Local State
  const [backgrounds, setBackgrounds] = useState<DbBackground[]>([]);
  const [onlineUrl, setOnlineUrl] = useState("");
  const [importingUrl, setImportingUrl] = useState(false);
  const [bgPage, setBgPage] = useState(0);

  // System Fonts Local State
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [fontsLoading, setFontsLoading] = useState(false);
  const [fontLoadError, setFontLoadError] = useState<string | null>(null);

  // Theme Carousel Scroll State
  const themeScrollRef = useRef<HTMLDivElement>(null);
  const [showLeftScroll, setShowLeftScroll] = useState(false);
  const [showRightScroll, setShowRightScroll] = useState(true);

  // Load Backgrounds on init
  const loadBackgrounds = () => {
    getBackgrounds()
      .then(setBackgrounds)
      .catch((err) => console.error("Failed to load backgrounds:", err));
  };

  useEffect(() => {
    loadBackgrounds();
  }, []);

  useEffect(() => {
    const totalPages = Math.ceil((backgrounds.length + 1) / 4);
    if (bgPage >= totalPages && totalPages > 0) {
      setBgPage(totalPages - 1);
    }
  }, [backgrounds, bgPage]);

  // Combine built-in & custom themes
  const allThemes = useMemo(() => {
    const { dark: modernDark, light: modernLight } = getModernThemeStyles();
    const { dark: surfaceDark, light: surfaceLight } = getSurfaceThemeStyles();
    const { dark: ubuntuDark, light: ubuntuLight } = getUbuntuThemeStyles();
    const { dark: animalCrossingDark, light: animalCrossingLight } = getAnimalCrossingThemeStyles();
    const modernMeta = THEME_REGISTRY.find((t) => t.id === "modern")!;
    const surfaceMeta = THEME_REGISTRY.find((t) => t.id === "surface")!;
    const ubuntuMeta = THEME_REGISTRY.find((t) => t.id === "ubuntu")!;
    const animalCrossingMeta = THEME_REGISTRY.find((t) => t.id === "animal-crossing")!;

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

    const animalCrossingTheme: CustomTheme = {
      id: "animal-crossing",
      name: animalCrossingMeta.name,
      description: animalCrossingMeta.description,
      author: "PiDown Team",
      version: "1.0.0",
      created_at: "2026-06-30",
      updated_at: "2026-06-30",
      hasCanvasBg: animalCrossingMeta.hasCanvasBg,
      hasSpecialSound: animalCrossingMeta.hasSpecialSound,
      accent: animalCrossingMeta.accent,
      previewClassName: animalCrossingMeta.previewClassName,
      styles: { dark: animalCrossingDark, light: animalCrossingLight },
      font: {
        id: "builtin:geist",
        name: "Nunito & Noto Sans SC",
        stack: "Nunito, 'Noto Sans SC', 'Microsoft YaHei UI', 'PingFang SC', sans-serif",
      },
    };

    return [modernTheme, surfaceTheme, ubuntuTheme, animalCrossingTheme, ...customThemes];
  }, [customThemes]);

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

  useEffect(() => {
    const timer = setTimeout(() => {
      updateThemeScrollButtons();
    }, 150);
    window.addEventListener("resize", updateThemeScrollButtons);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateThemeScrollButtons);
    };
  }, [allThemes]);

  // System Font options mapping
  const fontOptions = useMemo(() => {
    const opts = createFontOptions(systemFonts);
    const selected = getThemeFontOption(fontId, opts);
    if (!opts.some((o) => o.id === selected.id)) {
      opts.push(selected);
    }
    return opts;
  }, [systemFonts, fontId]);

  const selectedFont = useMemo(() => getThemeFontOption(fontId, fontOptions), [fontId, fontOptions]);

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
      .finally(() => {
        setFontsLoading(false);
      });
  };

  // Background Importers
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

      if (draft.interface.background_id === bgId) {
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

  // Theme Import/Export Actions
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

  return (
    <>
      <SettingsSectionCard>
        <div className="mt-0">
          <div className="mb-3 mt-5 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            <span>{UI_TEXT.settings.groupTheme}</span>
            <div className="flex gap-2">
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
                const isCustom = item.id !== "modern" && item.id !== "surface" && item.id !== "ubuntu" && item.id !== "animal-crossing";
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
                      <div className="absolute right-4 top-3 rounded-full border border-primary-foreground/45 bg-card/78 px-2 py-1 text-xs font-semibold text-foreground shadow-surface-raised">
                        {item.accent || UI_TEXT.settings.customTheme}
                      </div>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col p-4">
                      <div className="flex-1 min-h-0 space-y-1.5">
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
                        <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                          {item.description}
                        </p>
                      </div>

                      <div className="mt-auto pt-3 space-y-3">
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

                        <div className="flex w-full gap-2">
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
                                  <div className="absolute right-2 top-2 rounded-full bg-primary/12 px-1.5 py-0.5 text-xs font-bold text-primary">
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
                                <div className="absolute left-2 top-2 rounded-full bg-primary/95 px-1.5 py-0.5 text-xs font-bold text-primary-foreground shadow-sm z-10">
                                  {UI_TEXT.settings.applied}
                                </div>
                              )}

                              {bg.is_online && (
                                <div className="absolute right-2 top-2 rounded-full bg-accent/95 px-1.5 py-0.5 text-xs font-bold text-accent-foreground shadow-sm z-10">
                                  {UI_TEXT.settings.online}
                                </div>
                              )}

                              {/* Delete Button */}
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

                        {/* Empty placeholders to preserve grid layout */}
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

            {/* Config Options: Blur -> Mask Color -> Mask Opacity */}
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
  );
}
