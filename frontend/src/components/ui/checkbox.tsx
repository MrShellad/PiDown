import * as React from "react"
import { Check } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-5 shrink-0 rounded-sm border border-input bg-background outline-none transition focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current"
      >
        <Check className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

function CheckboxField({
  className,
  label,
  description,
  children,
  ...props
}: React.ComponentProps<"label"> & {
  label?: React.ReactNode
  description?: React.ReactNode
}) {
  return (
    <label
      data-slot="checkbox-field"
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg text-left has-disabled:cursor-not-allowed has-disabled:opacity-60",
        className
      )}
      {...props}
    >
      {children}
      <span className="min-w-0">
        {label ? <span className="block text-sm font-medium leading-5">{label}</span> : null}
        {description ? (
          <span className="mt-1 block text-sm leading-6 text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  )
}

export { Checkbox, CheckboxField }
