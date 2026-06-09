import React, { useEffect, useLayoutEffect } from "react";
import { applyThemeToDocument, useThemeStore } from "@/core/store/useThemeStore";
import { useDownloadStore } from "@/core/store/useDownloadStore";
import { useAppSettingsStore } from "@/core/store/useAppSettingsStore";
import { setupTauriEvents } from "@/core/bridge/tauri-events";
import { ToastViewport } from "@/components/ui/toast";

interface ThemeProviderProps {
  children: React.ReactNode;
  taskRuntime?: boolean;
}

export default function ThemeProvider({ children, taskRuntime = false }: ThemeProviderProps) {
  const theme = useThemeStore((state) => state.theme);
  const colorMode = useThemeStore((state) => state.colorMode);
  const fontId = useThemeStore((state) => state.fontId);

  // Apply before paint so secondary windows don't flash with default theme tokens.
  useLayoutEffect(() => {
    applyThemeToDocument({ theme, colorMode, fontId });
  }, [colorMode, fontId, theme]);

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
      {children}
      <ToastViewport />
    </>
  );
}
