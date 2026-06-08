import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

import { useToastStore, type ToastItem } from "@/core/store/useToastStore";
import { cn } from "@/lib/utils";

function ToastIcon({ toast }: { toast: ToastItem }) {
  if (toast.variant === "success") return <CheckCircle2 className="size-4" />;
  if (toast.variant === "warning") return <TriangleAlert className="size-4" />;
  if (toast.variant === "destructive") return <AlertCircle className="size-4" />;
  return <Info className="size-4" />;
}

function ToastCard({ toast }: { toast: ToastItem }) {
  const dismissToast = useToastStore((state) => state.dismissToast);

  useEffect(() => {
    const timer = window.setTimeout(() => dismissToast(toast.id), toast.duration);
    return () => window.clearTimeout(timer);
  }, [dismissToast, toast.duration, toast.id]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 460, damping: 34 }}
      className={cn(
        "pointer-events-auto flex w-[min(24rem,calc(100vw-2rem))] items-start gap-3 rounded-[var(--radius-lg)] bg-popover px-4 py-3 text-popover-foreground shadow-[0_16px_38px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-border/70",
        toast.variant === "success" && "text-primary",
        toast.variant === "warning" && "text-amber-400",
        toast.variant === "destructive" && "text-destructive"
      )}
      role="status"
    >
      <div className="mt-0.5 shrink-0">
        <ToastIcon toast={toast} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold leading-5 text-foreground">{toast.title}</div>
        {toast.description ? (
          <div className="mt-0.5 text-sm leading-5 text-muted-foreground">{toast.description}</div>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="关闭提示"
        className="grid size-6 shrink-0 place-items-center rounded-[var(--radius-sm)] text-muted-foreground transition hover:bg-muted hover:text-foreground"
        onClick={() => dismissToast(toast.id)}
      >
        <X className="size-3.5" />
      </button>
    </motion.div>
  );
}

function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[120] flex flex-col items-end gap-3">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} />
        ))}
      </AnimatePresence>
    </div>
  );
}

export { ToastViewport };
