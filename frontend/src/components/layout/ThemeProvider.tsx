import React, { useEffect, useLayoutEffect, useRef } from "react";
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

  // Hook up Tauri event listener and fetch initial task list
  useEffect(() => {
    useAppSettingsStore.getState().load().catch(err => {
      console.error("Failed to initial fetch app settings:", err);
    });

    if (!taskRuntime) return;

    let cleanup: (() => void) | undefined;
    
    setupTauriEvents().then((fn) => {
      cleanup = fn;
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

    return () => {
      if (cleanup) cleanup();
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

