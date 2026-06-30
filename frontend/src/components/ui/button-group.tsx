import * as React from "react"
import { cn } from "@/lib/utils"

export const ButtonGroupContext = React.createContext<boolean>(false)

export interface ButtonGroupProps extends React.HTMLAttributes<HTMLDivElement> {}

const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <ButtonGroupContext.Provider value={true}>
        <div
          ref={ref}
          className={cn(
            "inline-flex items-center -space-x-px rounded-md shadow-sm",
            "[&>button]:rounded-none [&>button:first-child]:rounded-l-md [&>button:last-child]:rounded-r-md",
            "[&>*:not(button)_button]:rounded-none [&>*:first-child_button]:rounded-l-md [&>*:last-child_button]:rounded-r-md",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </ButtonGroupContext.Provider>
    )
  }
)
ButtonGroup.displayName = "ButtonGroup"

export { ButtonGroup }
