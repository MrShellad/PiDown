import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeType = "modern" | "cyberpunk" | "retro";

interface ThemeState {
  theme: ThemeType;
  effectsEnabled: boolean;
  soundEnabled: boolean;
  
  // Actions
  setTheme: (theme: ThemeType) => void;
  setEffectsEnabled: (enabled: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "modern",
      effectsEnabled: true,
      soundEnabled: true,

      setTheme: (theme) => set({ theme }),
      setEffectsEnabled: (effectsEnabled) => set({ effectsEnabled }),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
    }),
    {
      name: "pidownloader-theme-config",
    }
  )
);
