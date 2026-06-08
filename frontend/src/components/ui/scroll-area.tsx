import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const scrollAreaVariants = cva("relative min-h-0 overflow-hidden", {
  variants: {
    variant: {
      default: "rounded-[var(--radius-lg)]",
      inset: "rounded-[var(--radius-lg)] border border-border bg-secondary/20",
      ghost: "rounded-none",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

const viewportVariants = cva(
  "h-full min-h-0 overscroll-contain",
  {
    variants: {
      scrollbar: {
        auto: "",
        thin:
          "scrollbar-interactive scrollbar-thin",
        overlay:
          "scrollbar-interactive scrollbar-overlay",
        hidden:
          "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
      },
      orientation: {
        vertical: "overflow-x-hidden overflow-y-auto",
        horizontal: "overflow-x-auto overflow-y-hidden",
        both: "overflow-auto",
      },
      visibility: {
        always: "",
        auto: "scrollbar-auto-hide",
      },
      gutter: {
        stable: "[scrollbar-gutter:stable]",
        both: "[scrollbar-gutter:stable_both-edges]",
        none: "[scrollbar-gutter:auto]",
      },
    },
    defaultVariants: {
      scrollbar: "thin",
      orientation: "vertical",
      visibility: "always",
      gutter: "none",
    },
  }
);

interface ScrollAreaProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof scrollAreaVariants>,
    VariantProps<typeof viewportVariants> {
  viewportClassName?: string;
  safePadding?: boolean;
}

export function ScrollArea({
  className,
  viewportClassName,
  variant,
  scrollbar,
  orientation,
  visibility,
  gutter,
  safePadding = false,
  children,
  ...props
}: ScrollAreaProps) {
  return (
    <div
      data-slot="scroll-area"
      className={cn(scrollAreaVariants({ variant, className }))}
      {...props}
    >
      <div
        data-slot="scroll-area-viewport"
        className={cn(
          viewportVariants({ scrollbar, orientation, visibility, gutter }),
          safePadding && scrollbar !== "hidden" && orientation !== "horizontal" && "pr-2",
          viewportClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}

export { scrollAreaVariants };
