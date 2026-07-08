import React, { useEffect, useLayoutEffect, useRef } from "react";
import { applyThemeToDocument, useThemeStore } from "@/core/store/useThemeStore";
import { useDownloadStore } from "@/core/store/useDownloadStore";
import { useToastStore } from "@/core/store/useToastStore";
import { useEvent } from "@/core/eventBus";
import { useAppSettingsStore } from "@/core/store/useAppSettingsStore";
import { setupTauriEvents } from "@/core/bridge/tauri-events";
import { ToastViewport } from "@/components/ui/toast";
import { AnimatePresence, motion } from "motion/react";

interface ThemeProviderProps {
  children: React.ReactNode;
  taskRuntime?: boolean;
}

interface SunMoonAnimationProps {
  targetIsDark: boolean;
  stage: "idle" | "intro" | "morph" | "outro";
}

function SunMoonAnimation({ targetIsDark, stage }: SunMoonAnimationProps) {
  // If in intro stage, show the starting color mode (the opposite of targetIsDark).
  // When stage shifts to morph/outro, animate to targetIsDark.
  const isDarkState = stage === "intro" ? !targetIsDark : targetIsDark;

  return (
    <svg width="160" height="160" viewBox="0 0 160 160" className="drop-shadow-lg select-none pointer-events-none">
      <defs>
        {/* Day sky gradient */}
        <linearGradient id="daySky" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        {/* Night sky gradient */}
        <linearGradient id="nightSky" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1e1b4b" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        {/* Subtractive mask for creating a crescent moon shape */}
        <mask id="moonMask">
          <rect x="0" y="0" width="160" height="160" fill="white" />
          <motion.circle
            animate={{
              cx: isDarkState ? 98 : 130,
              cy: isDarkState ? 68 : 30,
              r: isDarkState ? 26 : 0,
            }}
            transition={{ duration: 0.55, ease: "easeInOut" }}
            fill="black"
          />
        </mask>
      </defs>

      {/* Sky circle base (Day) */}
      <circle cx="80" cy="80" r="70" fill="url(#daySky)" />

      {/* Sky circle overlay (Night) */}
      <motion.circle
        cx="80"
        cy="80"
        r="70"
        fill="url(#nightSky)"
        animate={{ opacity: isDarkState ? 1 : 0 }}
        transition={{ duration: 0.55, ease: "easeInOut" }}
      />

      {/* Twinkling Stars (Night Only) */}
      <motion.g
        animate={{ opacity: isDarkState ? 1 : 0, scale: isDarkState ? 1 : 0.8 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <circle cx="45" cy="55" r="1.5" fill="white" className="animate-pulse" style={{ animationDuration: "1.5s" }} />
        <circle cx="115" cy="45" r="2" fill="white" className="animate-pulse" style={{ animationDuration: "2s" }} />
        <circle cx="65" cy="35" r="1" fill="white" className="animate-pulse" style={{ animationDuration: "1.8s" }} />
        <circle cx="105" cy="115" r="1.5" fill="white" className="animate-pulse" style={{ animationDuration: "2.2s" }} />
        <circle cx="50" cy="105" r="2" fill="white" className="animate-pulse" style={{ animationDuration: "1.7s" }} />
      </motion.g>

      {/* Radiating Sun Rays (Day Only) */}
      <motion.g
        animate={{
          opacity: isDarkState ? 0 : 1,
          rotate: isDarkState ? 45 : 0,
          scale: isDarkState ? 0.5 : 1,
        }}
        transition={{ duration: 0.55, ease: "easeInOut" }}
        style={{ originX: "80px", originY: "80px" }}
      >
        {[...Array(8)].map((_, i) => {
          const angle = (i * 45 * Math.PI) / 180;
          const x1 = 80 + 34 * Math.cos(angle);
          const y1 = 80 + 34 * Math.sin(angle);
          const x2 = 80 + 44 * Math.cos(angle);
          const y2 = 80 + 44 * Math.sin(angle);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#f59e0b"
              strokeWidth="4"
              strokeLinecap="round"
            />
          );
        })}
      </motion.g>

      {/* Main Celestial Body (Sun/Moon Circle) */}
      <motion.circle
        cx="80"
        cy="80"
        r="26"
        mask="url(#moonMask)"
        animate={{ fill: isDarkState ? "#f1f5f9" : "#f59e0b" }}
        transition={{ duration: 0.55, ease: "easeInOut" }}
      />
    </svg>
  );
}

export default function ThemeProvider({ children, taskRuntime = false }: ThemeProviderProps) {
  const theme = useThemeStore((state) => state.theme);
  const colorMode = useThemeStore((state) => state.colorMode);
  const fontId = useThemeStore((state) => state.fontId);
  const effectsEnabled = useThemeStore((state) => state.effectsEnabled);

  const transitionActive = useThemeStore((state) => state.themeTransitionActive);
  const animateStage = useThemeStore((state) => state.themeTransitionStage);
  const targetColorMode = useThemeStore((state) => state.targetColorMode);

  const prevColorModeRef = useRef(colorMode);

  useEvent("ui:toast", (payload) => {
    useToastStore.getState().pushToast(payload);
  });

  // Apply the theme to the document before painting
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
    let runtimeCleanup: (() => void) | undefined;

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
      <AnimatePresence>
        {transitionActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center pointer-events-auto"
            style={{
              backgroundColor: "var(--background)",
            }}
          >
            <SunMoonAnimation targetIsDark={targetColorMode === "dark"} stage={animateStage} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
