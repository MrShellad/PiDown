import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const scrollAreaVariants = cva("relative min-h-0 overflow-hidden", {
  variants: {
    variant: {
      default: "rounded-lg",
      inset: "rounded-lg border border-border bg-secondary/20",
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
  viewportStyle?: React.CSSProperties;
  safePadding?: boolean;
  viewportRef?: React.Ref<HTMLDivElement>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
}

export const ScrollArea = React.forwardRef<
  HTMLDivElement,
  ScrollAreaProps
>(({
  className,
  viewportClassName,
  viewportStyle,
  variant,
  scrollbar,
  orientation,
  visibility,
  gutter,
  safePadding = false,
  viewportRef,
  onScroll,
  children,
  ...props
}, ref) => {
  return (
    <div
      ref={ref}
      data-slot="scroll-area"
      className={cn(scrollAreaVariants({ variant, className }))}
      {...props}
    >
      <div
        ref={viewportRef}
        data-slot="scroll-area-viewport"
        className={cn(
          viewportVariants({ scrollbar, orientation, visibility, gutter }),
          safePadding && scrollbar !== "hidden" && orientation !== "horizontal" && "pr-2",
          viewportClassName
        )}
        style={viewportStyle}
        onScroll={onScroll}
      >
        {children}
      </div>
    </div>
  );
});

ScrollArea.displayName = "ScrollArea";

export { scrollAreaVariants };
