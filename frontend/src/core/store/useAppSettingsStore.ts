import { create } from "zustand";
import { emit } from "@tauri-apps/api/event";
import {
  getAppSettings,
  updateAppSettings,
  type AppSettings,
} from "../bridge/tauri-commands";
import { useThemeStore, applyThemeToDocument } from "./useThemeStore";
import { applyLanguage } from "../i18n";

export type SettingsSectionId =
  | "download"
  | "transfer"
  | "integration"
  | "appearance"
  | "magnet";

interface AppSettingsState {
  settings: AppSettings | null;
  loading: boolean;
  saving: boolean;
  activeSection: SettingsSectionId;
  lastError: string | null;
  lastSavedAt: number | null;
  load: () => Promise<void>;
  save: (settings: AppSettings) => Promise<void>;
  setActiveSection: (section: SettingsSectionId) => void;
}

const SETTINGS_SYNC_EVENT = "pidownloader-settings-sync";

export function broadcastSettingsSync() {
  emit(SETTINGS_SYNC_EVENT).catch(() => {});
}

export const useAppSettingsStore = create<AppSettingsState>((set) => ({
  settings: null,
  loading: false,
  saving: false,
  activeSection: "download",
  lastError: null,
  lastSavedAt: null,

  load: async () => {
    set((state) => ({
      loading: !state.settings,
      lastError: null,
    }));
    try {
      const settings = await getAppSettings();
      set({ settings, loading: false });

      if (settings?.interface) {
        const { theme, color_mode: colorMode, font_id: fontId } = settings.interface;
        const themeStore = useThemeStore.getState();
        const updates: any = {};

        if (theme && theme !== themeStore.theme) updates.theme = theme;
        if (colorMode && colorMode !== themeStore.colorMode) updates.colorMode = colorMode;
        if (fontId && fontId !== themeStore.fontId) updates.fontId = fontId;

        if (Object.keys(updates).length > 0) {
          useThemeStore.setState(updates);
          applyThemeToDocument({
            theme: updates.theme ?? themeStore.theme,
            colorMode: updates.colorMode ?? themeStore.colorMode,
            fontId: updates.fontId ?? themeStore.fontId,
            customThemes: themeStore.customThemes,
          });
        }

        // Apply language from settings
        if (settings.interface.language) {
          applyLanguage(settings.interface.language);
        }
      }
    } catch (error) {
      set({
        loading: false,
        lastError: error instanceof Error ? error.message : String(error),
      });
    }
  },

  save: async (settings) => {
    set({ saving: true, lastError: null });
    try {
      const next = await updateAppSettings(settings);
      set({ settings: next, saving: false, lastSavedAt: Date.now() });
      broadcastSettingsSync();

      // Apply language immediately on save
      if (next?.interface?.language) {
        applyLanguage(next.interface.language);
      }
    } catch (error) {
      set({
        saving: false,
        lastError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  setActiveSection: (activeSection) => set({ activeSection }),
}));


