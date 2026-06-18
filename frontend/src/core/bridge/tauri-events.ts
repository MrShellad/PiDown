import { listen } from "@tauri-apps/api/event";
import { useDownloadStore } from "../store/useDownloadStore";
import type { DownloadSpeedPayload } from "../store/useDownloadStore";
import { useThemeStore } from "../store/useThemeStore";
import { useAppSettingsStore } from "../store/useAppSettingsStore";
import { playSoundEffect } from "../audio";

interface TaskUpdatedPayload {
  gid: string;
}

const TASK_REFRESH_DEBOUNCE_MS = 120;
const TASK_REFRESH_FALLBACK_MS = 5_000;

export async function setupTauriEvents() {
  let refreshTimer: number | undefined;

  const refreshTasksSoon = () => {
    if (refreshTimer != null) {
      window.clearTimeout(refreshTimer);
    }

    refreshTimer = window.setTimeout(() => {
      refreshTimer = undefined;
      useDownloadStore.getState().fetchTasks().catch((err) => {
        console.error("Failed to refresh tasks after backend event", err);
      });
    }, TASK_REFRESH_DEBOUNCE_MS);
  };

  // 1. Listen for download speed and task progress updates
  const unlistenSpeed = await listen<DownloadSpeedPayload>(
    "download-cluster-status",
    (event) => {
      useDownloadStore.getState().updateTasksFromPayload(event.payload);
    }
  );

  // 2. Listen for task lifecycle changes. Final states leave the active ticker,
  // so this event pulls the database truth immediately.
  const unlistenTaskUpdated = await listen<TaskUpdatedPayload>(
    "download-task-updated",
    () => {
      refreshTasksSoon();
    }
  );

  // 3. Keep a low-frequency fallback in case an event is dropped or a window
  // subscribes after the backend already emitted the final state.
  const fallbackRefresh = window.setInterval(() => {
    useDownloadStore.getState().fetchTasks().catch((err) => {
      console.error("Failed to refresh tasks from fallback poll", err);
    });
  }, TASK_REFRESH_FALLBACK_MS);

  // 4. Listen for sound playing triggers from the backend
  const unlistenSound = await listen<string>("play-sound", (event) => {
    const { soundEnabled, theme } = useThemeStore.getState();
    if (!soundEnabled) return;

    const soundType = event.payload; // e.g., "success" | "warning" | "click"
    if (soundType === "success") {
      const settings = useAppSettingsStore.getState().settings;
      const playSoundOnComplete = settings?.download?.play_sound_on_complete ?? true;
      if (!playSoundOnComplete) return;

      const soundEffectId = settings?.download?.sound_effect_id ?? "success";
      if (soundEffectId === "success") {
        const customTheme = useThemeStore.getState().customThemes.find((t) => t.id === theme);
        if (customTheme && customTheme.sounds && customTheme.sounds.success) {
          playThemeSound(theme, "success");
        } else {
          playSoundEffect("success");
        }
      } else {
        playSoundEffect(soundEffectId);
      }
    } else {
      playThemeSound(theme, soundType);
    }
  });

  return () => {
    if (refreshTimer != null) {
      window.clearTimeout(refreshTimer);
    }
    window.clearInterval(fallbackRefresh);
    unlistenSpeed();
    unlistenTaskUpdated();
    unlistenSound();
  };
}

// Function to play sound according to the theme and event type
function playThemeSound(theme: string, type: string) {
  const { customThemes } = useThemeStore.getState();
  const customTheme = customThemes.find((t) => t.id === theme);

  if (customTheme && customTheme.sounds && customTheme.sounds[type]) {
    const soundDef = customTheme.sounds[type];

    if (soundDef.type === "audio" && soundDef.data) {
      try {
        const audio = new Audio(soundDef.data);
        audio.volume = soundDef.volume ?? 1.0;
        audio.play().catch((err) => console.error("Failed to play custom theme audio", err));
      } catch (e) {
        console.error("Error playing custom theme audio", e);
      }
      return;
    } else if (soundDef.type === "synth") {
      try {
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        const context = new AudioContextCtor();

        const gain = context.createGain();
        gain.connect(context.destination);
        gain.gain.setValueAtTime(soundDef.gain ?? 0.1, context.currentTime);

        const oscType = soundDef.oscillator || "sine";
        const duration = soundDef.duration || 0.5;

        if (soundDef.notes && soundDef.notes.length > 0) {
          soundDef.notes.forEach((note) => {
            const osc = context.createOscillator();
            osc.type = oscType;
            osc.connect(gain);

            const startTime = context.currentTime + (note.delay || 0);
            osc.frequency.setValueAtTime(note.freq, startTime);
            osc.start(startTime);
            osc.stop(startTime + note.duration);
          });
        }

        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      } catch (e) {
        console.error("Error playing custom theme synth", e);
      }
      return;
    }
  }

  // Fallback to built-in sound synthesis for "modern"
  try {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextCtor();
    const osc = context.createOscillator();
    const gain = context.createGain();

    osc.connect(gain);
    gain.connect(context.destination);

    osc.type = "sine";
    if (type === "success") {
      // Soft chime
      osc.frequency.setValueAtTime(659.25, context.currentTime); // E5
      osc.frequency.exponentialRampToValueAtTime(880, context.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.08, context.currentTime);
      gain.gain.linearRampToValueAtTime(0.001, context.currentTime + 0.4);
      osc.start();
      osc.stop(context.currentTime + 0.4);
    } else {
      // Subtle click
      osc.frequency.setValueAtTime(600, context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, context.currentTime + 0.05);
      gain.gain.setValueAtTime(0.05, context.currentTime);
      gain.gain.linearRampToValueAtTime(0.001, context.currentTime + 0.05);
      osc.start();
      osc.stop(context.currentTime + 0.06);
    }
  } catch (e) {
    console.error("Failed to play built-in theme sound", e);
  }
}
