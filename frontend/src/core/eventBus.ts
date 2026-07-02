import { useEffect } from "react";
import type { ExternalDownloadRequest } from "@/core/bridge/external-download";

export interface EventMap {
  // Triggered to open the new task modal with an optional pre-filled request
  "task:open-modal": ExternalDownloadRequest | null;
  // Triggered to scroll to and focus a download task row
  "task:focus-row": { gid: string };
  // Triggered when close action is requested from backend
  "app:request-close": void;
  // Triggered when settings are synchronized from another window
  "app:settings-sync": void;
  // Triggered when theme is synchronized from another window
  "app:theme-sync": any;
  // Triggered for WebDAV download speed streaming updates
  "webdav:stream-speed": { speed_bps: number };
  // Triggered when a browser pairing request is received
  "browser:pairing-request": { pairingId: string; deviceName: string };
  // Triggered to display a toast notification
  "ui:toast": { title: string; description?: string; variant?: "info" | "success" | "warning" | "destructive"; duration?: number };
  // Triggered to play sound effect
  "ui:play-sound": string;
}

type EventKey = keyof EventMap;
type EventCallback<T extends EventKey> = (payload: EventMap[T]) => void;

class EventBus {
  private listeners: { [key in EventKey]?: Set<EventCallback<any>> } = {};

  on<T extends EventKey>(event: T, callback: EventCallback<T>): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set();
    }
    this.listeners[event]!.add(callback);
    return () => this.off(event, callback);
  }

  off<T extends EventKey>(event: T, callback: EventCallback<T>): void {
    this.listeners[event]?.delete(callback);
  }

  emit<T extends EventKey>(event: T, payload: EventMap[T]): void {
    const list = this.listeners[event];
    if (list) {
      list.forEach((callback) => {
        try {
          callback(payload);
        } catch (e) {
          console.error(`Error in event listener for event "${event}":`, e);
        }
      });
    }
  }
}

export const eventBus = new EventBus();

export function useEvent<T extends EventKey>(event: T, callback: EventCallback<T>) {
  useEffect(() => {
    return eventBus.on(event, callback);
  }, [event, callback]);
}
