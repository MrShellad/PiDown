import * as React from "react"
import { Circle } from "lucide-react"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid gap-2", className)}
      {...props}
    />
  )
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "aspect-square size-5 shrink-0 rounded-full border border-input bg-background outline-none transition focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:text-primary",
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex items-center justify-center"
      >
        <Circle className="size-2.5 fill-current text-current" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
}

function RadioField({
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
      data-slot="radio-field"
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-[var(--radius-lg)] text-left has-disabled:cursor-not-allowed has-disabled:opacity-60",
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

export { RadioField, RadioGroup, RadioGroupItem }
