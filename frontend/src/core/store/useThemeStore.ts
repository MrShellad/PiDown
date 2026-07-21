import { create } from "zustand";
import { persist } from "zustand/middleware";
import { emit } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import JSZip from "jszip";
import {
  DEFAULT_THEME_FONT_ID,
  getThemeFontOption,
  normalizeThemeFontId,
  type ThemeFontId,
} from "@/themes/fonts";
import { saveThemeFont } from "../bridge/tauri-commands";
import themeCssTemplate from "@/themes/skins/modern-fluid/variables.css?raw";
import { useAppSettingsStore } from "./useAppSettingsStore";

const DEFAULT_HEX_DARK = {
  "--background": "#0c0f1d",
  "--foreground": "#f5f6f9",
  "--card": "#13182b",
  "--primary": "#8b5cf6",
  "--muted": "#1f293d",
  "--muted-foreground": "#9ca3af",
  "--border": "#374151",
  "--accent": "#8b5cf626",
};

const DEFAULT_HEX_LIGHT = {
  "--background": "#fafafb",
  "--foreground": "#1e293b",
  "--card": "#ffffff",
  "--primary": "#6366f1",
  "--muted": "#f1f5f9",
  "--muted-foreground": "#64748b",
  "--border": "#e2e8f0",
  "--accent": "#6366f126",
};

function colorToHex6(colorStr: string, fallback: string = "#ffffff"): string {
  if (!colorStr) return fallback;
  const trimmed = colorStr.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-fA-F]{8}$/.test(trimmed)) return trimmed.slice(0, 7);
  
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = colorStr;
      const resolved = ctx.fillStyle;
      if (resolved.startsWith("#")) return resolved;
      const match = resolved.match(/\d+/g);
      if (match && match.length >= 3) {
        const r = parseInt(match[0]).toString(16).padStart(2, "0");
        const g = parseInt(match[1]).toString(16).padStart(2, "0");
        const b = parseInt(match[2]).toString(16).padStart(2, "0");
        return `#${r}${g}${b}`;
      }
    }
  } catch (e) {
    // ignore
  }
  return fallback;
}

const mapMinorVariables = (vars: Record<string, string>, mode: "dark" | "light") => {
  const fg = vars["--foreground"] || (mode === "dark" ? "#f5f6f9" : "#1e293b");
  const card = vars["--card"] || (mode === "dark" ? "#13182b" : "#ffffff");
  const primary = vars["--primary"] || (mode === "dark" ? "#8b5cf6" : "#6366f1");
  const muted = vars["--muted"] || (mode === "dark" ? "#1f293d" : "#f1f5f9");
  const mutedFg = vars["--muted-foreground"] || (mode === "dark" ? "#9ca3af" : "#64748b");
  const border = vars["--border"] || (mode === "dark" ? "#374151" : "#e2e8f0");
  
  return {
    ...vars,
    "--card-foreground": fg,
    "--popover": card,
    "--popover-foreground": fg,
    "--secondary": muted,
    "--secondary-foreground": mutedFg,
    "--accent-foreground": primary,
    "--destructive": mode === "dark" ? "oklch(0.6 0.21 20)" : "oklch(0.58 0.21 25)",
    "--destructive-foreground": mode === "dark" ? "oklch(0.98 0.01 20)" : "oklch(0.99 0.01 25)",
    "--input": border,
    "--ring": primary,
  };
};

export type ThemeType = string;
export type ThemeColorMode = "dark" | "light";

export interface CustomThemeNote {
  freq: number;
  duration: number;
  delay?: number;
}

export interface CustomThemeSoundDef {
  type: "synth" | "audio";
  oscillator?: OscillatorType;
  notes?: CustomThemeNote[];
  gain?: number;
  duration?: number;
  data?: string; // base64 audio URI
  volume?: number;
}

export interface CustomTheme {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  created_at: string;
  updated_at: string;
  hasCanvasBg: boolean;
  hasSpecialSound: boolean;
  accent: string;
  previewClassName: string;
  styles: {
    dark?: Record<string, string>;
    light?: Record<string, string>;
  };
  font?: {
    id: string;
    name: string;
    stack: string;
    fontFace?: string; // e.g. base64 fallback or custom styles
    path?: string; // stable absolute path under user's app data directory
  };
  sounds?: {
    success?: CustomThemeSoundDef;
    warning?: CustomThemeSoundDef;
    [key: string]: CustomThemeSoundDef | undefined;
  };
  previewImage?: string; // base64 image data URI
}

const THEME_STORAGE_KEY = "pidownloader-theme-config";
const THEME_SYNC_EVENT = "pidownloader-theme-sync";

interface ThemeState {
  theme: ThemeType;
  colorMode: ThemeColorMode;
  fontId: ThemeFontId;
  effectsEnabled: boolean;
  soundEnabled: boolean;
  customThemes: CustomTheme[];
  
  // Theme Editor State
  themeEditorOpen: boolean;
  editingTheme: CustomTheme | null;
  editingColorMode: ThemeColorMode;
  initialThemeState: CustomTheme[];
  initialActiveThemeId: string;
  dragOffset: { x: number; y: number };

  // Theme Transition State
  themeTransitionActive: boolean;
  themeTransitionStage: "idle" | "intro" | "morph" | "outro";
  targetColorMode: ThemeColorMode;
  targetTheme: ThemeType;

  // Actions
  setTheme: (theme: ThemeType) => void;
  setColorMode: (colorMode: ThemeColorMode) => void;
  setFontId: (fontId: ThemeFontId) => void;
  setEffectsEnabled: (enabled: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  importTheme: (theme: CustomTheme) => void;
  deleteTheme: (themeId: string) => void;

  // Theme Editor Actions
  openCreateTheme: () => void;
  openEditTheme: (theme: CustomTheme) => void;
  openDuplicateTheme: (theme: CustomTheme) => void;
  updateEditingTheme: (updates: Partial<CustomTheme>) => void;
  updateEditingStyle: (key: string, val: string) => void;
  setEditingColorMode: (mode: ThemeColorMode) => void;
  setDragOffset: (offset: { x: number; y: number }) => void;
  cancelThemeEdit: () => void;
  saveThemeEdit: () => void;
}

type PersistedThemeState = Partial<
  Pick<ThemeState, "theme" | "colorMode" | "fontId" | "effectsEnabled" | "soundEnabled" | "customThemes">
>;

function normalizeTheme(theme: unknown): ThemeType {
  return typeof theme === "string" && theme.trim() ? theme.trim() : "modern";
}

function normalizeColorMode(colorMode: unknown): ThemeColorMode {
  return colorMode === "light" ? "light" : "dark";
}

function readPersistedThemeState(): PersistedThemeState | null {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: PersistedThemeState };
    return parsed.state ?? null;
  } catch {
    return null;
  }
}

function broadcastThemeSync() {
  const state = useThemeStore.getState();
  const payload = {
    theme: state.theme,
    colorMode: state.colorMode,
    fontId: state.fontId,
    effectsEnabled: state.effectsEnabled,
    soundEnabled: state.soundEnabled,
    customThemes: state.customThemes,
  };
  window.dispatchEvent(new CustomEvent(THEME_SYNC_EVENT, { detail: payload }));
  emit(THEME_SYNC_EVENT, payload).catch(() => {
    // Browser preview does not provide the Tauri event bridge.
  });
}

function parseCssVariables(css: string, selectorRegex: RegExp): Record<string, string> {
  const variables: Record<string, string> = {};
  const match = css.match(selectorRegex);
  if (match && match[1]) {
    const block = match[1];
    const lines = block.split(";");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("/*")) continue;
      
      const parts = trimmed.split(":");
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join(":").trim();
        
        if (key.startsWith("--")) {
          const cleanValue = value.replace(/\/\*[\s\S]*?\*\//g, "").trim();
          variables[key] = cleanValue;
        }
      }
    }
  }
  return variables;
}

export function getModernThemeStyles(): { dark: Record<string, string>; light: Record<string, string> } {
  try {
    const darkVars = parseCssVariables(themeCssTemplate, /\[data-theme=["']?modern["']?\]\s*\{([\s\S]+?)\}/);
    const lightVars = parseCssVariables(themeCssTemplate, /\[data-theme=["']?modern["']?\]\[data-color-mode=["']?light["']?\]\s*\{([\s\S]+?)\}/);
    return { dark: darkVars, light: lightVars };
  } catch (e) {
    console.error("Failed to parse built-in theme variables", e);
    return { dark: {}, light: {} };
  }
}

export function getSurfaceThemeStyles(): { dark: Record<string, string>; light: Record<string, string> } {
  try {
    const darkVars = parseCssVariables(themeCssTemplate, /\[data-theme=["']?surface["']?\]\s*\{([\s\S]+?)\}/);
    const lightVars = parseCssVariables(themeCssTemplate, /\[data-theme=["']?surface["']?\]\[data-color-mode=["']?light["']?\]\s*\{([\s\S]+?)\}/);
    return { dark: darkVars, light: lightVars };
  } catch (e) {
    console.error("Failed to parse surface theme variables", e);
    return { dark: {}, light: {} };
  }
}

export function getUbuntuThemeStyles(): { dark: Record<string, string>; light: Record<string, string> } {
  try {
    const darkVars = parseCssVariables(themeCssTemplate, /\[data-theme=["']?ubuntu["']?\]\s*\{([\s\S]+?)\}/);
    const lightVars = parseCssVariables(themeCssTemplate, /\[data-theme=["']?ubuntu["']?\]\[data-color-mode=["']?light["']?\]\s*\{([\s\S]+?)\}/);
    return { dark: darkVars, light: lightVars };
  } catch (e) {
    console.error("Failed to parse ubuntu theme variables", e);
    return { dark: {}, light: {} };
  }
}

export function getAnimalCrossingThemeStyles(): { dark: Record<string, string>; light: Record<string, string> } {
  try {
    const darkVars = parseCssVariables(themeCssTemplate, /\[data-theme=["']?animal-crossing["']?\]\s*\{([\s\S]+?)\}/);
    const lightVars = parseCssVariables(themeCssTemplate, /\[data-theme=["']?animal-crossing["']?\]\[data-color-mode=["']?light["']?\]\s*\{([\s\S]+?)\}/);
    return { dark: darkVars, light: lightVars };
  } catch (e) {
    console.error("Failed to parse animal-crossing theme variables", e);
    return { dark: {}, light: {} };
  }
}

export function getBuiltInThemeStyles(themeId: string): { dark: Record<string, string>; light: Record<string, string> } {
  if (themeId === "modern") return getModernThemeStyles();
  if (themeId === "surface") return getSurfaceThemeStyles();
  if (themeId === "ubuntu") return getUbuntuThemeStyles();
  if (themeId === "animal-crossing") return getAnimalCrossingThemeStyles();
  return { dark: {}, light: {} };
}



// Helpers for ZIP Parsing
function hasExtension(filename: string, extensions: string[]): boolean {
  const lower = filename.toLowerCase();
  return extensions.some((ext) => lower.endsWith(ext));
}

function getFontMimeType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".woff2")) return "font/woff2";
  if (lower.endsWith(".woff")) return "font/woff";
  if (lower.endsWith(".ttf")) return "font/ttf";
  if (lower.endsWith(".otf")) return "font/otf";
  return "application/octet-stream";
}

function getAudioMimeType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".mp3")) return "audio/mp3";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  return "audio/mpeg";
}

function getImageMimeType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

export async function parseThemeZip(arrayBuffer: ArrayBuffer): Promise<CustomTheme> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  // 1. Locate config/metadata json
  let themeJsonFile = zip.file("theme.json") || zip.file("config.json");
  if (!themeJsonFile) {
    const jsonFiles = Object.keys(zip.files).filter(
      (name) => name.endsWith(".json") && !name.includes("__MACOSX")
    );
    if (jsonFiles.length > 0) {
      themeJsonFile = zip.file(jsonFiles[0]);
    }
  }
  
  if (!themeJsonFile) {
    throw new Error("主题压缩包中缺少 theme.json 配置文件");
  }
  
  const themeJsonText = await themeJsonFile.async("text");
  const themeMeta = JSON.parse(themeJsonText);
  
  // Validate that the JSON contains all required metadata fields
  const requiredFields = ["id", "name", "description", "author", "version", "created_at", "updated_at"];
  const missing = requiredFields.filter((field) => !themeMeta[field]);
  
  const fontName = themeMeta.fontName || themeMeta.font?.name;
  if (!fontName) {
    missing.push("fontName");
  }
  
  if (missing.length > 0) {
    throw new Error(`主题配置文件 theme.json 缺少必要属性: ${missing.join(", ")}`);
  }
  
  // 2. Locate css variables stylesheet
  let cssFile = zip.file("variables.css") || zip.file("style.css");
  if (!cssFile) {
    const cssFiles = Object.keys(zip.files).filter(
      (name) => name.endsWith(".css") && !name.includes("__MACOSX")
    );
    if (cssFiles.length > 0) {
      cssFile = zip.file(cssFiles[0]);
    }
  }
  
  const styles = themeMeta.styles || { dark: {}, light: {} };
  
  if (cssFile) {
    const cssContent = await cssFile.async("text");
    const themeId = themeMeta.id;
    
    // Parse theme ID blocks or generic blocks
    const darkRegex = new RegExp(`\\[data-theme=["']?${themeId}["']?\\]\\s*\\{([\\s\\S]+?)\\}`, "m");
    const lightRegex = new RegExp(`\\[data-theme=["']?${themeId}["']?\\]\\[data-color-mode=["']?light["']?\\]\\s*\\{([\\s\\S]+?)\\}`, "m");
    const fallbackDarkRegex = /\[data-theme=["']?modern["']?\]\s*\{([\s\S]+?)\}/m;
    const fallbackLightRegex = /\[data-theme=["']?modern["']?\]\[data-color-mode=["']?light["']?\]\s*\{([\s\S]+?)\}/m;
    const rootRegex = /:root\s*\{([\s\S]+?)\}/m;
    
    const darkVars = parseCssVariables(cssContent, darkRegex) || 
                       parseCssVariables(cssContent, fallbackDarkRegex) ||
                       parseCssVariables(cssContent, rootRegex);
                       
    const lightVars = parseCssVariables(cssContent, lightRegex) ||
                        parseCssVariables(cssContent, fallbackLightRegex);
                        
    if (Object.keys(darkVars).length > 0) {
      styles.dark = { ...styles.dark, ...darkVars };
    }
    if (Object.keys(lightVars).length > 0) {
      styles.light = { ...styles.light, ...lightVars };
    }
  }
  
  if (!styles.dark || Object.keys(styles.dark).length === 0) {
    throw new Error("主题中未定义暗色模式样式，或解析 variables.css 失败");
  }
  
  // 3. Extract custom fonts if any exist and save them to the user data directory
  const fontFileNames = Object.keys(zip.files).filter((name) => 
    hasExtension(name, [".woff2", ".woff", ".ttf", ".otf"]) && !name.includes("__MACOSX")
  );
  
  let fontConfig = themeMeta.font || { name: fontName };
  if (fontFileNames.length > 0) {
    const fontFile = zip.file(fontFileNames[0])!;
    const fontDataBase64 = await fontFile.async("base64");
    const fontFilename = fontFileNames[0].split("/").pop() || "font.woff2";
    const fontId = `custom:${themeMeta.id}`;
    
    // Save to <app_data_dir>/theme/<theme_id>/<font_filename>
    let absolutePath = "";
    try {
      absolutePath = await saveThemeFont(themeMeta.id, fontFilename, fontDataBase64);
    } catch (err) {
      console.error("Failed to save theme font via Tauri backend", err);
    }
    
    // If saving succeeded, use convertFileSrc URL, otherwise fallback to base64 Data URI
    const srcUrl = absolutePath 
      ? convertFileSrc(absolutePath)
      : `data:${getFontMimeType(fontFileNames[0])};base64,${fontDataBase64}`;
      
    const mimeType = getFontMimeType(fontFileNames[0]);
    const formatName = mimeType.split("/")[1];
    
    const fontFace = `@font-face {
      font-family: '${fontName}';
      src: url('${srcUrl}') format('${formatName}');
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }`;
    
    fontConfig = {
      id: fontId,
      name: fontName,
      stack: `'${fontName}', 'Microsoft YaHei UI', 'PingFang SC', sans-serif`,
      fontFace,
      path: absolutePath || undefined,
    };
  }
  
  // 4. Extract sounds if they exist
  const successAudioFiles = Object.keys(zip.files).filter((name) => 
    name.toLowerCase().includes("success") && 
    hasExtension(name, [".mp3", ".wav", ".ogg", ".m4a"]) && 
    !name.includes("__MACOSX")
  );
  
  const warningAudioFiles = Object.keys(zip.files).filter((name) => 
    (name.toLowerCase().includes("warning") || name.toLowerCase().includes("fail") || name.toLowerCase().includes("error")) && 
    hasExtension(name, [".mp3", ".wav", ".ogg", ".m4a"]) && 
    !name.includes("__MACOSX")
  );
  
  const sounds = themeMeta.sounds || {};
  
  if (successAudioFiles.length > 0) {
    const file = zip.file(successAudioFiles[0])!;
    const base64Data = await file.async("base64");
    const mime = getAudioMimeType(successAudioFiles[0]);
    sounds.success = {
      type: "audio",
      data: `data:${mime};base64,${base64Data}`,
      volume: themeMeta.sounds?.success?.volume || 1.0,
    };
  }
  
  if (warningAudioFiles.length > 0) {
    const file = zip.file(warningAudioFiles[0])!;
    const base64Data = await file.async("base64");
    const mime = getAudioMimeType(warningAudioFiles[0]);
    sounds.warning = {
      type: "audio",
      data: `data:${mime};base64,${base64Data}`,
      volume: themeMeta.sounds?.warning?.volume || 1.0,
    };
  }
  
  // 5. Extract preview image
  const previewImageFiles = Object.keys(zip.files).filter((name) => 
    name.toLowerCase().includes("preview") && 
    hasExtension(name, [".png", ".jpg", ".jpeg", ".svg", ".webp"]) && 
    !name.includes("__MACOSX")
  );
  
  let previewImage = themeMeta.previewImage;
  if (previewImageFiles.length > 0) {
    const file = zip.file(previewImageFiles[0])!;
    const base64Data = await file.async("base64");
    const mime = getImageMimeType(previewImageFiles[0]);
    previewImage = `data:${mime};base64,${base64Data}`;
  }
  
  return {
    id: themeMeta.id,
    name: themeMeta.name,
    description: themeMeta.description,
    author: themeMeta.author,
    version: themeMeta.version,
    created_at: themeMeta.created_at,
    updated_at: themeMeta.updated_at,
    hasCanvasBg: themeMeta.hasCanvasBg ?? false,
    hasSpecialSound: themeMeta.hasSpecialSound ?? (successAudioFiles.length > 0),
    accent: themeMeta.accent || "自定义",
    previewClassName: themeMeta.previewClassName || "",
    styles,
    font: fontConfig,
    sounds: Object.keys(sounds).length > 0 ? sounds : undefined,
    previewImage,
  };
}

export function applyThemeToDocument({
  theme,
  colorMode,
  fontId,
  customThemes,
}: {
  theme: string;
  colorMode: ThemeColorMode;
  fontId: string;
  customThemes?: CustomTheme[];
}) {
  const root = window.document.documentElement;
  
  const resolvedThemes = customThemes || (typeof useThemeStore !== "undefined" ? useThemeStore.getState().customThemes : []) || [];
  const customTheme = resolvedThemes.find((t) => t.id === theme);
  
  root.setAttribute("data-theme", theme);
  root.setAttribute("data-color-mode", colorMode);
  
  let fontStack = "'Microsoft YaHei UI', sans-serif";
  let fontFaceString = "";
  let themeStyles: Record<string, string> = {};
  
  if (customTheme) {
    fontStack = customTheme.font?.stack || fontStack;
    fontFaceString = customTheme.font?.path
      ? `@font-face {
          font-family: '${customTheme.font.name}';
          src: url('${convertFileSrc(customTheme.font.path)}') format('${customTheme.font.path.split(".").pop() || "woff2"}');
          font-weight: normal;
          font-style: normal;
          font-display: swap;
        }`
      : customTheme.font?.fontFace || "";
    themeStyles = customTheme.styles[colorMode] || {};
  } else {
    const font = getThemeFontOption(fontId);
    root.setAttribute("data-font", font.id);
    fontStack = font.stack;
    
    // Unify built-in theme loading by dynamically extracting styles and injecting them into :root
    const builtIn = getBuiltInThemeStyles(theme);
    themeStyles = builtIn[colorMode] || {};
  }
  
  root.style.setProperty("--font-ui", fontStack);
  root.style.setProperty("--font-heading", fontStack);
  
  let styleEl = document.getElementById("pidownloader-custom-theme-style");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "pidownloader-custom-theme-style";
    document.head.appendChild(styleEl);
  }
  
  const stylesString = Object.entries(themeStyles)
    .map(([key, value]) => `${key}: ${value} !important;`)
    .join("\n");
  
  styleEl.textContent = `
    ${fontFaceString}
    :root {
      ${stylesString}
    }
  `;
  
  if (colorMode === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function applyPersistedThemeToDocument() {
  const state = readPersistedThemeState();
  applyThemeToDocument({
    theme: normalizeTheme(state?.theme),
    colorMode: normalizeColorMode(state?.colorMode),
    fontId: normalizeThemeFontId(state?.fontId),
    customThemes: state?.customThemes ?? [],
  });
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "modern",
      colorMode: "dark",
      fontId: DEFAULT_THEME_FONT_ID,
      effectsEnabled: true,
      soundEnabled: true,
      customThemes: [],

      // Theme Transition State Initializers
      themeTransitionActive: false,
      themeTransitionStage: "idle",
      targetColorMode: "dark",
      targetTheme: "modern",

      // Theme Editor State Initializers
      themeEditorOpen: false,
      editingTheme: null,
      editingColorMode: "dark",
      initialThemeState: [],
      initialActiveThemeId: "",
      dragOffset: { x: 0, y: 0 },

      setTheme: (newTheme) => {
        const { theme, effectsEnabled } = get();
        if (newTheme === theme) return;

        if (!effectsEnabled) {
          set({ theme: newTheme });
          window.queueMicrotask(broadcastThemeSync);
          saveThemeSettingsToBackend({ theme: newTheme });
          return;
        }

        // 1. Start transition
        set({
          themeTransitionActive: true,
          themeTransitionStage: "intro",
          targetTheme: newTheme,
          targetColorMode: get().colorMode,
        });

        // 2. Wait for overlay to fade in (180ms)
        setTimeout(() => {
          set({
            theme: newTheme,
            themeTransitionStage: "morph",
          });
          window.queueMicrotask(broadcastThemeSync);
          saveThemeSettingsToBackend({ theme: newTheme });

          // 3. Play Sun/Moon morph animation (360ms)
          setTimeout(() => {
            set({ themeTransitionStage: "outro" });

            // 4. Fade out overlay (60ms)
            setTimeout(() => {
              set({
                themeTransitionActive: false,
                themeTransitionStage: "idle",
              });
            }, 60);
          }, 360);
        }, 180);
      },
      setColorMode: (newColorMode) => {
        const { colorMode, effectsEnabled } = get();
        if (newColorMode === colorMode) return;

        if (!effectsEnabled) {
          set({ colorMode: newColorMode });
          window.queueMicrotask(broadcastThemeSync);
          saveThemeSettingsToBackend({ colorMode: newColorMode });
          return;
        }

        // 1. Start transition
        set({
          themeTransitionActive: true,
          themeTransitionStage: "intro",
          targetColorMode: newColorMode,
          targetTheme: get().theme,
        });

        // 2. Wait for overlay to fade in (180ms)
        setTimeout(() => {
          set({
            colorMode: newColorMode,
            themeTransitionStage: "morph",
          });
          window.queueMicrotask(broadcastThemeSync);
          saveThemeSettingsToBackend({ colorMode: newColorMode });

          // 3. Play Sun/Moon morph animation (360ms)
          setTimeout(() => {
            set({ themeTransitionStage: "outro" });

            // 4. Fade out overlay (60ms)
            setTimeout(() => {
              set({
                themeTransitionActive: false,
                themeTransitionStage: "idle",
              });
            }, 60);
          }, 360);
        }, 180);
      },
      setFontId: (fontId) => {
        set({ fontId });
        window.queueMicrotask(broadcastThemeSync);
        saveThemeSettingsToBackend({ fontId });
      },
      setEffectsEnabled: (effectsEnabled) => {
        set({ effectsEnabled });
        window.queueMicrotask(broadcastThemeSync);
      },
      setSoundEnabled: (soundEnabled) => {
        set({ soundEnabled });
        window.queueMicrotask(broadcastThemeSync);
      },
      importTheme: (theme) => {
        set((state) => {
          const exists = state.customThemes.some((t) => t.id === theme.id);
          const nextCustomThemes = exists
            ? state.customThemes.map((t) => (t.id === theme.id ? theme : t))
            : [...state.customThemes, theme];
          return { customThemes: nextCustomThemes };
        });
        window.queueMicrotask(broadcastThemeSync);
      },
      deleteTheme: (themeId) => {
        set((state) => {
          const nextCustomThemes = state.customThemes.filter((t) => t.id !== themeId);
          const nextTheme = state.theme === themeId ? "modern" : state.theme;
          return { customThemes: nextCustomThemes, theme: nextTheme };
        });
        window.queueMicrotask(broadcastThemeSync);
      },

      // Theme Editor Actions Implementation
      openCreateTheme: () => {
        const { customThemes, theme, colorMode, fontId } = get();
        const newId = `custom-theme-${Date.now()}`;
        const newTheme: CustomTheme = {
          id: newId,
          name: "",
          description: "",
          author: "",
          version: "1.0.0",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          hasCanvasBg: false,
          hasSpecialSound: false,
          accent: "",
          previewClassName: "",
          styles: {
            dark: { ...DEFAULT_HEX_DARK },
            light: { ...DEFAULT_HEX_LIGHT },
          },
        };

        newTheme.styles.dark = mapMinorVariables(newTheme.styles.dark!, "dark");
        newTheme.styles.light = mapMinorVariables(newTheme.styles.light!, "light");

        set({
          initialThemeState: JSON.parse(JSON.stringify(customThemes)),
          initialActiveThemeId: theme,
          editingTheme: newTheme,
          editingColorMode: colorMode,
          dragOffset: { x: 0, y: 0 },
          themeEditorOpen: true,
        });

        applyThemeToDocument({
          theme: newTheme.id,
          colorMode,
          fontId,
          customThemes: [newTheme],
        });
      },

      openEditTheme: (item) => {
        const { customThemes, theme, colorMode, fontId } = get();
        const themeCopy = JSON.parse(JSON.stringify(item)) as CustomTheme;
        if (!themeCopy.styles) themeCopy.styles = {};
        if (!themeCopy.styles.dark) themeCopy.styles.dark = { ...DEFAULT_HEX_DARK };
        if (!themeCopy.styles.light) themeCopy.styles.light = { ...DEFAULT_HEX_LIGHT };

        const darkStyles: Record<string, string> = {};
        const lightStyles: Record<string, string> = {};
        const coreKeys = ["--background", "--foreground", "--card", "--primary", "--border", "--muted", "--muted-foreground", "--accent"];

        coreKeys.forEach((key) => {
          const darkVal = themeCopy.styles.dark?.[key];
          darkStyles[key] = darkVal ? colorToHex6(darkVal, DEFAULT_HEX_DARK[key as keyof typeof DEFAULT_HEX_DARK]) : DEFAULT_HEX_DARK[key as keyof typeof DEFAULT_HEX_DARK];

          const lightVal = themeCopy.styles.light?.[key];
          lightStyles[key] = lightVal ? colorToHex6(lightVal, DEFAULT_HEX_LIGHT[key as keyof typeof DEFAULT_HEX_LIGHT]) : DEFAULT_HEX_LIGHT[key as keyof typeof DEFAULT_HEX_LIGHT];
        });

        themeCopy.styles.dark = mapMinorVariables(darkStyles, "dark");
        themeCopy.styles.light = mapMinorVariables(lightStyles, "light");

        set({
          initialThemeState: JSON.parse(JSON.stringify(customThemes)),
          initialActiveThemeId: theme,
          editingTheme: themeCopy,
          editingColorMode: colorMode,
          dragOffset: { x: 0, y: 0 },
          themeEditorOpen: true,
        });

        applyThemeToDocument({
          theme: themeCopy.id,
          colorMode,
          fontId,
          customThemes: [themeCopy],
        });
      },

      openDuplicateTheme: (item) => {
        const { customThemes, theme, colorMode, fontId } = get();
        const themeCopy = JSON.parse(JSON.stringify(item)) as CustomTheme;
        themeCopy.id = `custom-theme-${Date.now()}`;
        themeCopy.name = `${themeCopy.name} (Copy)`;
        themeCopy.created_at = new Date().toISOString();
        themeCopy.updated_at = new Date().toISOString();

        const darkStyles: Record<string, string> = {};
        const lightStyles: Record<string, string> = {};
        const coreKeys = ["--background", "--foreground", "--card", "--primary", "--border", "--muted", "--muted-foreground", "--accent"];

        coreKeys.forEach((key) => {
          const darkVal = themeCopy.styles.dark?.[key];
          darkStyles[key] = darkVal ? colorToHex6(darkVal, DEFAULT_HEX_DARK[key as keyof typeof DEFAULT_HEX_DARK]) : DEFAULT_HEX_DARK[key as keyof typeof DEFAULT_HEX_DARK];

          const lightVal = themeCopy.styles.light?.[key];
          lightStyles[key] = lightVal ? colorToHex6(lightVal, DEFAULT_HEX_LIGHT[key as keyof typeof DEFAULT_HEX_LIGHT]) : DEFAULT_HEX_LIGHT[key as keyof typeof DEFAULT_HEX_LIGHT];
        });

        themeCopy.styles.dark = mapMinorVariables(darkStyles, "dark");
        themeCopy.styles.light = mapMinorVariables(lightStyles, "light");

        set({
          initialThemeState: JSON.parse(JSON.stringify(customThemes)),
          initialActiveThemeId: theme,
          editingTheme: themeCopy,
          editingColorMode: colorMode,
          dragOffset: { x: 0, y: 0 },
          themeEditorOpen: true,
        });

        applyThemeToDocument({
          theme: themeCopy.id,
          colorMode,
          fontId,
          customThemes: [themeCopy],
        });
      },

      updateEditingTheme: (updates) => {
        const { editingTheme, colorMode, fontId } = get();
        if (!editingTheme) return;
        const updated = {
          ...editingTheme,
          ...updates,
          updated_at: new Date().toISOString(),
        };
        set({ editingTheme: updated });

        applyThemeToDocument({
          theme: updated.id,
          colorMode,
          fontId,
          customThemes: [updated],
        });
      },

      updateEditingStyle: (key, val) => {
        const { editingTheme, editingColorMode, colorMode, fontId } = get();
        if (!editingTheme) return;

        const mode = editingColorMode;
        const currentStyles = { ...(editingTheme.styles[mode] || {}) };
        if (key === "--accent") {
          currentStyles[key] = val.startsWith("#") ? `${val}26` : val;
        } else {
          currentStyles[key] = val;
        }
        const mappedStyles = mapMinorVariables(currentStyles, mode);

        const updated = {
          ...editingTheme,
          styles: {
            ...editingTheme.styles,
            [mode]: mappedStyles,
          },
          updated_at: new Date().toISOString(),
        };
        set({ editingTheme: updated });

        applyThemeToDocument({
          theme: updated.id,
          colorMode,
          fontId,
          customThemes: [updated],
        });
      },

      setEditingColorMode: (editingColorMode) => {
        set({ editingColorMode });
      },

      setDragOffset: (dragOffset) => {
        set({ dragOffset });
      },

      cancelThemeEdit: () => {
        const { initialThemeState, initialActiveThemeId, colorMode, fontId } = get();

        set({
          customThemes: initialThemeState,
          theme: initialActiveThemeId,
          themeEditorOpen: false,
          editingTheme: null,
        });

        applyThemeToDocument({
          theme: initialActiveThemeId,
          colorMode,
          fontId,
          customThemes: initialThemeState,
        });

        window.queueMicrotask(broadcastThemeSync);
      },

      saveThemeEdit: () => {
        const { editingTheme, importTheme, setTheme } = get();
        if (!editingTheme) return;
        const finalTheme = {
          ...editingTheme,
          name: editingTheme.name.trim() || `Custom Theme ${new Date().toLocaleDateString()}`,
        };

        set({
          themeEditorOpen: false,
          editingTheme: null,
        });

        importTheme(finalTheme);
        setTheme(finalTheme.id);
      },
    }),
    {
      name: THEME_STORAGE_KEY,
      partialize: (state) => ({
        theme: state.theme,
        colorMode: state.colorMode,
        fontId: state.fontId,
        effectsEnabled: state.effectsEnabled,
        soundEnabled: state.soundEnabled,
        customThemes: state.customThemes,
      }),
      migrate: (persistedState) => {
        const state = persistedState as PersistedThemeState | undefined;
        return {
          theme: normalizeTheme(state?.theme),
          colorMode: normalizeColorMode(state?.colorMode),
          fontId: normalizeThemeFontId(state?.fontId),
          effectsEnabled: state?.effectsEnabled ?? true,
          soundEnabled: state?.soundEnabled ?? true,
          customThemes: state?.customThemes ?? [],
        };
      },
      merge: (persistedState, currentState) => {
        const state = persistedState as PersistedThemeState | undefined;
        return {
          ...currentState,
          ...state,
          theme: normalizeTheme(state?.theme),
          colorMode: normalizeColorMode(state?.colorMode),
          fontId: normalizeThemeFontId(state?.fontId),
          customThemes: state?.customThemes ?? [],
        };
      },
    }
  )
);

function saveThemeSettingsToBackend(updates: { theme?: string; colorMode?: string; fontId?: string }) {
  const store = useAppSettingsStore.getState();
  if (!store.settings) return;

  const nextSettings = {
    ...store.settings,
    interface: {
      ...store.settings.interface,
      theme: updates.theme ?? store.settings.interface.theme ?? "modern",
      color_mode: updates.colorMode ?? store.settings.interface.color_mode ?? "dark",
      font_id: updates.fontId ?? store.settings.interface.font_id ?? "builtin:geist",
    },
  };

  store.save(nextSettings).catch((err) => {
    console.error("Failed to save theme settings to backend settings.json:", err);
  });
}

if (typeof window !== "undefined") {
  const syncFromStorage = () => {
    const state = readPersistedThemeState();
    if (!state) return;

    const nextState = {
      theme: normalizeTheme(state.theme),
      colorMode: normalizeColorMode(state.colorMode),
      fontId: normalizeThemeFontId(state.fontId),
      effectsEnabled: state.effectsEnabled ?? true,
      soundEnabled: state.soundEnabled ?? true,
      customThemes: state.customThemes ?? [],
    };
    
    useThemeStore.setState(nextState);
    applyThemeToDocument(nextState);
  };

  syncFromStorage();

  window.addEventListener("storage", (event) => {
    if (event.key === THEME_STORAGE_KEY) syncFromStorage();
  });
  window.addEventListener(THEME_SYNC_EVENT, syncFromStorage);
}
