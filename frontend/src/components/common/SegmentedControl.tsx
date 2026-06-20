import * as React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface SegmentedControlOption<TValue extends string = string> {
  value: TValue;
  label: string;
}

interface SegmentedControlProps<TValue extends string = string> {
  value: TValue;
  options: SegmentedControlOption<TValue>[];
  onValueChange: (value: TValue) => void;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function SegmentedControl<TValue extends string = string>({
  value,
  options,
  onValueChange,
  className,
  size = "md",
}: SegmentedControlProps<TValue>) {
  const containerHeightClass = size === "lg" ? "h-12 p-1.5" : "h-9 p-1";
  const buttonHeightClass = size === "lg" ? "h-full px-4 text-sm" : "h-full px-3 py-1.5 text-xs";

  const layoutId = React.useId();

  return (
    <div
      className={cn(
        "inline-grid grid-flow-col auto-cols-fr relative items-center justify-center rounded-lg bg-muted text-muted-foreground border border-border/40 shadow-inner select-none",
        containerHeightClass,
        className
      )}
    >
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className={cn(
              "relative inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 z-10 w-full whitespace-nowrap cursor-pointer",
              buttonHeightClass,
              isActive
                ? "text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => onValueChange(option.value)}
          >
            {isActive && (
              <motion.div
                layoutId={layoutId}
                className="absolute inset-0 bg-background rounded-md shadow-sm -z-10"
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 28,
                }}
              />
            )}
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

