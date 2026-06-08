import React, { useEffect } from "react";
import { useThemeStore } from "@/core/store/useThemeStore";
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

  // Sync theme attribute on document root
  useEffect(() => {
    const root = window.document.documentElement;
    root.setAttribute("data-theme", theme);
    
    // Toggle dark class depending on theme type
    if (theme === "modern" || theme === "cyberpunk") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

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

    // Fetch categories and tags from SQLite database
    useDownloadStore.getState().fetchCategories().catch(err => {
      console.error("Failed to initial fetch categories:", err);
    });
    useDownloadStore.getState().fetchTags().catch(err => {
      console.error("Failed to initial fetch tags:", err);
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
