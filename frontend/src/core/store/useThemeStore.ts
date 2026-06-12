import { create } from "zustand";
import { persist } from "zustand/middleware";
import { emit, listen } from "@tauri-apps/api/event";
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
  
  // Actions
  setTheme: (theme: ThemeType) => void;
  setColorMode: (colorMode: ThemeColorMode) => void;
  setFontId: (fontId: ThemeFontId) => void;
  setEffectsEnabled: (enabled: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  importTheme: (theme: CustomTheme) => void;
  deleteTheme: (themeId: string) => void;
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
  window.dispatchEvent(new CustomEvent(THEME_SYNC_EVENT));
  emit(THEME_SYNC_EVENT).catch(() => {
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
    const darkVars = parseCssVariables(themeCssTemplate, /\[data-theme="modern"\]\s*\{([\s\S]+?)\}/);
    const lightVars = parseCssVariables(themeCssTemplate, /\[data-theme="modern"\]\[data-color-mode="light"\]\s*\{([\s\S]+?)\}/);
    return { dark: darkVars, light: lightVars };
  } catch (e) {
    console.error("Failed to parse built-in theme variables", e);
    return { dark: {}, light: {} };
  }
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
  customThemes = [],
}: {
  theme: string;
  colorMode: ThemeColorMode;
  fontId: string;
  customThemes?: CustomTheme[];
}) {
  const root = window.document.documentElement;
  
  const customTheme = customThemes.find((t) => t.id === theme);
  
  if (customTheme) {
    root.setAttribute("data-theme", customTheme.id);
    root.setAttribute("data-color-mode", colorMode);
    
    const fontStack = customTheme.font?.stack || "'Microsoft YaHei UI', sans-serif";
    root.style.setProperty("--font-ui", fontStack);
    root.style.setProperty("--font-heading", fontStack);
    
    let styleEl = document.getElementById("pidownloader-custom-theme-style");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "pidownloader-custom-theme-style";
      document.head.appendChild(styleEl);
    }
    
    const themeStyles = customTheme.styles[colorMode] || {};
    const stylesString = Object.entries(themeStyles)
      .map(([key, value]) => `${key}: ${value} !important;`)
      .join("\n");
      
    // Dynamically resolve absolute path to localhost asset URL using convertFileSrc
    const fontFaceString = customTheme.font?.path
      ? `@font-face {
          font-family: '${customTheme.font.name}';
          src: url('${convertFileSrc(customTheme.font.path)}') format('${customTheme.font.path.split(".").pop() || "woff2"}');
          font-weight: normal;
          font-style: normal;
          font-display: swap;
        }`
      : customTheme.font?.fontFace || "";
    
    styleEl.textContent = `
      ${fontFaceString}
      :root {
        ${stylesString}
      }
    `;
  } else {
    root.setAttribute("data-theme", theme);
    root.setAttribute("data-color-mode", colorMode);
    
    const font = getThemeFontOption(fontId);
    root.setAttribute("data-font", font.id);
    root.style.setProperty("--font-ui", font.stack);
    root.style.setProperty("--font-heading", font.stack);
    
    const styleEl = document.getElementById("pidownloader-custom-theme-style");
    if (styleEl) {
      styleEl.textContent = "";
    }
  }
  
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
    (set) => ({
      theme: "modern",
      colorMode: "dark",
      fontId: DEFAULT_THEME_FONT_ID,
      effectsEnabled: true,
      soundEnabled: true,
      customThemes: [],

      setTheme: (theme) => {
        set({ theme });
        window.queueMicrotask(broadcastThemeSync);
        saveThemeSettingsToBackend({ theme });
      },
      setColorMode: (colorMode) => {
        set({ colorMode });
        window.queueMicrotask(broadcastThemeSync);
        saveThemeSettingsToBackend({ colorMode });
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
    }),
    {
      name: THEME_STORAGE_KEY,
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

  listen(THEME_SYNC_EVENT, syncFromStorage).catch(() => {
    // Browser preview does not provide the Tauri event bridge.
  });
}
