import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slider as SliderPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

const sliderTrackVariants = cva(
  "relative grow overflow-hidden rounded-full bg-secondary/80",
  {
    variants: {
      size: {
        sm: "h-1.5",
        default: "h-2",
        lg: "h-2.5",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

const sliderThumbVariants = cva(
  "block rounded-full border border-primary/50 bg-white shadow-sm outline-none transition focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
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

interface SliderProps
  extends Omit<
      React.ComponentProps<typeof SliderPrimitive.Root>,
      "value" | "defaultValue" | "onValueChange"
    >,
    VariantProps<typeof sliderTrackVariants> {
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (value: number) => void;
  label?: string;
  description?: string;
  valueText?: string;
  showValue?: boolean;
  trackClassName?: string;
  rangeClassName?: string;
  thumbClassName?: string;
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onValueChange,
  className,
  disabled,
  label,
  description,
  valueText,
  showValue = Boolean(valueText),
  size,
  trackClassName,
  rangeClassName,
  thumbClassName,
  "aria-label": ariaLabel,
  ...props
}: SliderProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {(label || showValue) && (
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            {label && <div className="text-sm font-semibold leading-5 text-foreground">{label}</div>}
            {description && (
              <div className="mt-1 text-sm leading-6 text-muted-foreground">{description}</div>
            )}
          </div>
          {showValue && (
            <div className="shrink-0 text-sm font-medium tabular-nums text-primary">
              {valueText ?? value}
            </div>
          )}
        </div>
      )}
      <SliderPrimitive.Root
        data-slot="slider"
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(next) => onValueChange(next[0] ?? min)}
        aria-label={ariaLabel ?? label}
        className="relative flex h-6 w-full touch-none select-none items-center disabled:opacity-50"
        {...props}
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className={cn(sliderTrackVariants({ size }), trackClassName)}
        >
          <SliderPrimitive.Range
            data-slot="slider-range"
            className={cn("absolute h-full bg-primary", rangeClassName)}
          />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          className={cn(sliderThumbVariants({ size }), thumbClassName)}
        />
      </SliderPrimitive.Root>
      <input
        type="hidden"
        min={min}
        max={max}
        step={step}
        value={value}
        readOnly
      />
    </div>
  );
}

export { sliderTrackVariants };
