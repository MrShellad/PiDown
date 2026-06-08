import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, useReducedMotion } from "motion/react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

const switchTrackVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer items-center overflow-hidden rounded-full border border-transparent bg-muted",
  {
    variants: {
      size: {
        sm: "h-5 w-9",
        default: "h-6 w-11",
        lg: "h-7 w-12",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

const switchThumbVariants = cva(
  "pointer-events-none relative z-10 block rounded-full bg-switch-thumb shadow-sm",
  {
    variants: {
      size: {
        sm: "size-4",
        default: "size-5",
        lg: "size-6",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

const switchMotionMetrics = {
  sm: { offX: 2, onX: 18, thumb: 16, pressed: 20 },
  default: { offX: 2, onX: 22, thumb: 20, pressed: 24 },
  lg: { offX: 2, onX: 22, thumb: 24, pressed: 28 },
} as const;

interface SwitchProps
  extends Omit<React.ComponentProps<typeof SwitchPrimitive.Root>, "onChange">,
    VariantProps<typeof switchTrackVariants> {
  label?: string;
  description?: string;
}

export function Switch({
  checked,
  defaultChecked,
  onCheckedChange,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  className,
  disabled,
  label,
  description,
  size,
  ...props
}: SwitchProps) {
  const prefersReducedMotion = useReducedMotion();
  const [pressed, setPressed] = React.useState(false);
  const [internalChecked, setInternalChecked] = React.useState(Boolean(defaultChecked));
  const isControlled = checked !== undefined;
  const resolvedChecked = isControlled ? Boolean(checked) : internalChecked;
  const state = resolvedChecked ? "checked" : "unchecked";
  const resolvedSize = size ?? "default";
  const metrics = switchMotionMetrics[resolvedSize];
  const thumbX =
    resolvedChecked && pressed
      ? metrics.onX - (metrics.pressed - metrics.thumb)
      : resolvedChecked
        ? metrics.onX
        : metrics.offX;
  const springTransition = prefersReducedMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 520, damping: 32, mass: 0.75 };
  const colorTransition = prefersReducedMotion ? { duration: 0 } : { duration: 0.16 };
  const trackColor = resolvedChecked ? "var(--switch-track-on)" : "var(--switch-track-off)";
  const hoverTrackColor = resolvedChecked
    ? "var(--switch-track-on-hover)"
    : "var(--switch-track-off-hover)";
  const pressRing = "0 0 0 4px var(--switch-press-ring)";
  const hoverRing = "0 0 0 3px var(--switch-press-ring)";
  const thumbShadow = resolvedChecked
    ? "var(--switch-thumb-shadow-on)"
    : "var(--switch-thumb-shadow-off)";

  const handleCheckedChange = (nextChecked: boolean) => {
    if (!isControlled) {
      setInternalChecked(nextChecked);
    }
    onCheckedChange?.(nextChecked);
  };

  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-state={state}
      aria-label={label}
      checked={resolvedChecked}
      defaultChecked={defaultChecked}
      disabled={disabled}
      onCheckedChange={handleCheckedChange}
      onPointerDown={(event) => {
        setPressed(true);
        onPointerDown?.(event);
      }}
      onPointerUp={(event) => {
        setPressed(false);
        onPointerUp?.(event);
      }}
      onPointerCancel={(event) => {
        setPressed(false);
        onPointerCancel?.(event);
      }}
      onPointerLeave={(event) => {
        setPressed(false);
        onPointerLeave?.(event);
      }}
      className={cn(
        "group/switch inline-flex items-center gap-3 rounded-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-45",
        className
      )}
      {...props}
    >
      <motion.span
        aria-hidden="true"
        data-slot="switch-track"
        data-state={state}
        className={cn(switchTrackVariants({ size }))}
        initial={false}
        animate={{
          backgroundColor: trackColor,
          boxShadow:
            !disabled && pressed
              ? pressRing
              : "0 0 0 0 transparent",
        }}
        whileHover={
          disabled
            ? undefined
            : {
                backgroundColor: hoverTrackColor,
                boxShadow: hoverRing,
              }
        }
        whileTap={disabled || prefersReducedMotion ? undefined : { scale: 0.98 }}
        transition={colorTransition}
      >
        <motion.span
          className="pointer-events-none absolute left-1.5 text-[10px] font-bold leading-none text-primary-foreground/90"
          initial={false}
          animate={{ opacity: resolvedChecked ? 1 : 0, scale: resolvedChecked ? 1 : 0.85 }}
          transition={springTransition}
        >
          |
        </motion.span>
        <motion.span
          className="pointer-events-none absolute right-1.5 text-[10px] font-bold leading-none text-switch-icon-off/80"
          initial={false}
          animate={{ opacity: resolvedChecked ? 0 : 1, scale: resolvedChecked ? 0.85 : 1 }}
          transition={springTransition}
        >
          {"\u25CB"}
        </motion.span>
        <SwitchPrimitive.Thumb asChild>
          <motion.span
            data-slot="switch-thumb"
            data-state={state}
            className={cn(switchThumbVariants({ size }))}
            initial={false}
            animate={{
              x: thumbX,
              width: pressed ? metrics.pressed : metrics.thumb,
              boxShadow: thumbShadow,
            }}
            transition={springTransition}
          />
        </SwitchPrimitive.Thumb>
      </motion.span>
      {(label || description) && (
        <span className="flex min-w-0 flex-col">
          {label && <span className="text-sm font-semibold leading-5 text-foreground">{label}</span>}
          {description && (
            <span className="text-sm leading-6 text-muted-foreground">{description}</span>
          )}
        </span>
      )}
    </SwitchPrimitive.Root>
  );
}

export { switchTrackVariants };
