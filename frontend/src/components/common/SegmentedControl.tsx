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
  const buttonHeightClass = size === "lg" ? "h-9 px-4 text-sm" : "h-7 px-3 py-1.5 text-xs";

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-lg bg-muted text-muted-foreground border border-border/40 shadow-inner",
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
              "inline-flex items-center justify-center rounded-md font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
              buttonHeightClass,
              isActive
                ? "bg-background text-foreground shadow-sm scale-102 font-semibold"
                : "hover:bg-background/40 hover:text-foreground"
            )}
            onClick={() => onValueChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
