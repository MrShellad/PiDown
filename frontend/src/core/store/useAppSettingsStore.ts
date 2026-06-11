import { create } from "zustand";
import { emit, listen } from "@tauri-apps/api/event";
import {
  getAppSettings,
  updateAppSettings,
  type AppSettings,
} from "../bridge/tauri-commands";

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

if (typeof window !== "undefined") {
  listen(SETTINGS_SYNC_EVENT, () => {
    useAppSettingsStore.getState().load().catch(console.error);
  }).catch(() => {});
}

