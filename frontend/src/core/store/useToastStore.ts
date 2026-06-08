import { create } from "zustand";

export type ToastVariant = "info" | "success" | "warning" | "destructive";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastState {
  toasts: ToastItem[];
  pushToast: (toast: ToastInput) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

const createToastId = () => `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  pushToast: (toast) => {
    const id = createToastId();
    set((state) => ({
      toasts: [
        ...state.toasts,
        {
          id,
          title: toast.title,
          description: toast.description,
          variant: toast.variant ?? "info",
          duration: toast.duration ?? 3600,
        },
      ].slice(-4),
    }));
    return id;
  },
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
  clearToasts: () => set({ toasts: [] }),
}));
