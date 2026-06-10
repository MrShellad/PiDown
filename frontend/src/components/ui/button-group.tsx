import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonGroupProps extends React.HTMLAttributes<HTMLDivElement> {}

const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center -space-x-px rounded-md shadow-sm",
          "[&>button]:rounded-none [&>button:first-child]:rounded-l-md [&>button:last-child]:rounded-r-md",
          "[&>*:not(button)_button]:rounded-none [&>*:first-child_button]:rounded-l-md [&>*:last-child_button]:rounded-r-md",
          className
        )}
        {...props}
      />
    )
  }
)
ButtonGroup.displayName = "ButtonGroup"

export { ButtonGroup }
