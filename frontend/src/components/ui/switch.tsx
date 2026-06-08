import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

const switchTrackVariants = cva(
  "group inline-flex shrink-0 cursor-pointer items-center rounded-full border outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary/70 data-[state=checked]:bg-primary/90 data-[state=unchecked]:border-border data-[state=unchecked]:bg-secondary/70",
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
  "pointer-events-none block rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[calc(100%-0.125rem)] data-[state=unchecked]:translate-x-0.5",
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

interface SwitchProps
  extends Omit<React.ComponentProps<typeof SwitchPrimitive.Root>, "onChange">,
    VariantProps<typeof switchTrackVariants> {
  label?: string;
  description?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  className,
  disabled,
  label,
  description,
  size,
  ...props
}: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      className={cn(
        "inline-flex items-center gap-3 rounded-[var(--radius-lg)] text-left",
        className
      )}
      {...props}
    >
      <span aria-hidden="true" className={cn(switchTrackVariants({ size }))}>
        <SwitchPrimitive.Thumb
          data-slot="switch-thumb"
          className={cn(switchThumbVariants({ size }))}
        />
      </span>
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
