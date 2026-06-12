import React, { useEffect, useLayoutEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { applyThemeToDocument, useThemeStore } from "@/core/store/useThemeStore";
import { useDownloadStore } from "@/core/store/useDownloadStore";
import { useAppSettingsStore } from "@/core/store/useAppSettingsStore";
import { setupTauriEvents } from "@/core/bridge/tauri-events";
import { ToastViewport } from "@/components/ui/toast";
import { motion } from "motion/react";

interface ThemeProviderProps {
  children: React.ReactNode;
  taskRuntime?: boolean;
}

export default function ThemeProvider({ children, taskRuntime = false }: ThemeProviderProps) {
  const theme = useThemeStore((state) => state.theme);
  const colorMode = useThemeStore((state) => state.colorMode);
  const fontId = useThemeStore((state) => state.fontId);
  const effectsEnabled = useThemeStore((state) => state.effectsEnabled);

  const prevColorModeRef = useRef(colorMode);

  // Apply before paint so secondary windows don't flash with default theme tokens.
  useLayoutEffect(() => {
    if (prevColorModeRef.current !== colorMode) {
      if (effectsEnabled) {
        document.documentElement.classList.add("theme-transitioning");
      }
      prevColorModeRef.current = colorMode;
    }

    applyThemeToDocument({ theme, colorMode, fontId });

    if (effectsEnabled) {
      const timer = setTimeout(() => {
        document.documentElement.classList.remove("theme-transitioning");
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [colorMode, fontId, theme, effectsEnabled]);

  // Hook up Tauri event listeners and fetch initial states
  useEffect(() => {
    // 1. Initial settings load
    useAppSettingsStore.getState().load().catch(err => {
      console.error("Failed to initial fetch app settings:", err);
    });

    let isSubscribed = true;
    let unlistenTheme: (() => void) | undefined;
    let unlistenSettings: (() => void) | undefined;
    let runtimeCleanup: (() => void) | undefined;

    const setupSync = async () => {
      try {
        if (!isSubscribed) return;

        // Settings Sync
        unlistenSettings = await listen("pidownloader-settings-sync", () => {
          useAppSettingsStore.getState().load().catch(console.error);
        });

        if (!isSubscribed) return;

        // Theme Sync
        unlistenTheme = await listen("pidownloader-theme-sync", (event: any) => {
          let nextState: any = null;
          if (event && event.payload) {
            nextState = event.payload;
          } else {
            try {
              const raw = window.localStorage.getItem("pidownloader-theme-config");
              if (raw) {
                const parsed = JSON.parse(raw);
                nextState = parsed.state;
              }
            } catch (e) {
              console.error("Failed to parse theme config from storage:", e);
            }
          }

          if (nextState) {
            const normalizedState = {
              theme: nextState.theme || "modern",
              colorMode: nextState.colorMode || "dark",
              fontId: nextState.fontId || "builtin:geist",
              effectsEnabled: nextState.effectsEnabled ?? true,
              soundEnabled: nextState.soundEnabled ?? true,
              customThemes: nextState.customThemes ?? [],
            };
            useThemeStore.setState(normalizedState);
            applyThemeToDocument(normalizedState);
          }
        });
      } catch (err) {
        console.warn("Tauri events API not available or failed to register sync listeners:", err);
      }
    };

    setupSync();

    if (taskRuntime) {
      setupTauriEvents().then((fn) => {
        if (!isSubscribed) {
          fn();
          return;
        }
        runtimeCleanup = fn;
      }).catch(err => {
        console.warn("Tauri API is not available (running in browser mode):", err);
      });

      // Fetch initial task list from SQLite database
      useDownloadStore.getState().fetchTasks().catch(err => {
        console.error("Failed to initial fetch tasks:", err);
      });

      // Fetch category navigation tree from SQLite database
      useDownloadStore.getState().fetchCategoryTree().catch(err => {
        console.error("Failed to initial fetch category tree:", err);
      });
    }

    return () => {
      isSubscribed = false;
      if (unlistenTheme) unlistenTheme();
      if (unlistenSettings) unlistenSettings();
      if (runtimeCleanup) runtimeCleanup();
    };
  }, [taskRuntime]);

  return (
    <>
      <motion.div
        initial={effectsEnabled ? { opacity: 0.95 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, ease: "easeInOut" }}
        className="h-full w-full"
      >
        {children}
      </motion.div>
      <ToastViewport />
    </>
  );
}

