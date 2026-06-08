import { create } from "zustand";
import { persist } from "zustand/middleware";
import { emit, listen } from "@tauri-apps/api/event";
import { DEFAULT_THEME_FONT_ID, normalizeThemeFontId, type ThemeFontId } from "@/themes/fonts";

export type ThemeType = "modern";
export type ThemeColorMode = "dark" | "light";

const THEME_STORAGE_KEY = "pidownloader-theme-config";
const THEME_SYNC_EVENT = "pidownloader-theme-sync";

interface ThemeState {
  theme: ThemeType;
  colorMode: ThemeColorMode;
  fontId: ThemeFontId;
  effectsEnabled: boolean;
  soundEnabled: boolean;
  
  // Actions
  setTheme: (theme: ThemeType) => void;
  setColorMode: (colorMode: ThemeColorMode) => void;
  setFontId: (fontId: ThemeFontId) => void;
  setEffectsEnabled: (enabled: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
}

type PersistedThemeState = Partial<Pick<ThemeState, "theme" | "colorMode" | "fontId" | "effectsEnabled" | "soundEnabled">>;

function normalizeTheme(theme: unknown): ThemeType {
  void theme;
  return "modern";
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

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "modern",
      colorMode: "dark",
      fontId: DEFAULT_THEME_FONT_ID,
      effectsEnabled: true,
      soundEnabled: true,

      setTheme: (theme) => {
        set({ theme });
        window.queueMicrotask(broadcastThemeSync);
      },
      setColorMode: (colorMode) => {
        set({ colorMode });
        window.queueMicrotask(broadcastThemeSync);
      },
      setFontId: (fontId) => {
        set({ fontId });
        window.queueMicrotask(broadcastThemeSync);
      },
      setEffectsEnabled: (effectsEnabled) => {
        set({ effectsEnabled });
        window.queueMicrotask(broadcastThemeSync);
      },
      setSoundEnabled: (soundEnabled) => {
        set({ soundEnabled });
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
        };
      },
    }
  )
);

if (typeof window !== "undefined") {
  const syncFromStorage = () => {
    const state = readPersistedThemeState();
    if (!state) return;

    useThemeStore.setState({
      theme: normalizeTheme(state.theme),
      colorMode: normalizeColorMode(state.colorMode),
      fontId: normalizeThemeFontId(state.fontId),
      effectsEnabled: state.effectsEnabled ?? true,
      soundEnabled: state.soundEnabled ?? true,
    });
  };

  window.addEventListener("storage", (event) => {
    if (event.key === THEME_STORAGE_KEY) syncFromStorage();
  });
  window.addEventListener(THEME_SYNC_EVENT, syncFromStorage);

  listen(THEME_SYNC_EVENT, syncFromStorage).catch(() => {
    // Browser preview does not provide the Tauri event bridge.
  });
}
