import { listen } from "@tauri-apps/api/event";
import { useDownloadStore } from "../store/useDownloadStore";
import type { DownloadSpeedPayload } from "../store/useDownloadStore";
import { useThemeStore } from "../store/useThemeStore";

export async function setupTauriEvents() {
  // 1. Listen for download speed and task progress updates
  const unlistenSpeed = await listen<DownloadSpeedPayload>(
    "download-cluster-status",
    (event) => {
      useDownloadStore.getState().updateTasksFromPayload(event.payload);
    }
  );

  // 2. Listen for sound playing triggers from the backend
  const unlistenSound = await listen<string>("play-sound", (event) => {
    const { soundEnabled, theme } = useThemeStore.getState();
    if (!soundEnabled) return;

    const soundType = event.payload; // e.g., "success" | "warning" | "click"
    playThemeSound(theme, soundType);
  });

  return () => {
    unlistenSpeed();
    unlistenSound();
  };
}

// Function to play sound according to the theme and event type
function playThemeSound(theme: string, type: string) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextCtor();
  
  // We will generate simple synth frequencies dynamically to avoid loading missing audio assets 
  // and ensuring we have zero asset loading errors. This gives a very cool retro/synth vibe!
  const osc = context.createOscillator();
  const gain = context.createGain();
  
  osc.connect(gain);
  gain.connect(context.destination);

  if (theme === "cyberpunk") {
    if (type === "warning" || type === "error") {
      // Harsh warning sound (low frequency alert)
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(150, context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, context.currentTime + 0.3);
      gain.gain.setValueAtTime(0.15, context.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, context.currentTime + 0.3);
      osc.start();
      osc.stop(context.currentTime + 0.35);
    } else {
      // Futuristic click / beep
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, context.currentTime + 0.08);
      gain.gain.setValueAtTime(0.1, context.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, context.currentTime + 0.08);
      osc.start();
      osc.stop(context.currentTime + 0.1);
    }
  } else if (theme === "retro") {
    // 8-bit sound
    osc.type = "square";
    if (type === "success") {
      // Arpeggio up
      osc.frequency.setValueAtTime(523.25, context.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, context.currentTime + 0.1); // E5
      osc.frequency.setValueAtTime(783.99, context.currentTime + 0.2); // G5
      osc.frequency.setValueAtTime(1046.50, context.currentTime + 0.3); // C6
      gain.gain.setValueAtTime(0.1, context.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, context.currentTime + 0.4);
      osc.start();
      osc.stop(context.currentTime + 0.45);
    } else {
      // 8-bit coin click
      osc.frequency.setValueAtTime(987.77, context.currentTime); // B5
      osc.frequency.setValueAtTime(1318.51, context.currentTime + 0.08); // E6
      gain.gain.setValueAtTime(0.1, context.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, context.currentTime + 0.15);
      osc.start();
      osc.stop(context.currentTime + 0.2);
    }
  } else {
    // Modern fluid - clean subtle sound
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
  }
}
