import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { AlertCircle } from "lucide-react"

import { cn } from "@/lib/utils"

const inputVariants = cva(
  "w-full border border-input bg-background text-foreground outline-none transition placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20",
  {
    variants: {
      size: {
        sm: "h-8 rounded-md px-3 text-xs",
        default: "h-10 rounded-lg px-3 text-sm",
        lg: "h-11 rounded-lg px-4 text-base",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

const actionInputVariants = cva(
  "group flex w-full items-stretch overflow-hidden rounded-lg border bg-background/90 text-foreground shadow-surface-inset transition focus-within:ring-2 disabled:pointer-events-none data-[disabled=true]:opacity-60 data-[invalid=true]:border-destructive data-[invalid=true]:ring-2 data-[invalid=true]:ring-destructive/20",
  {
    variants: {
      size: {
        default: "h-11",
        lg: "h-12",
      },
      tone: {
        default: "border-input focus-within:border-ring focus-within:ring-ring/30",
        accent: "border-primary/70 focus-within:border-primary focus-within:ring-primary/25",
      },
    },
    defaultVariants: {
      size: "lg",
      tone: "accent",
    },
  }
)

interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode
  description?: React.ReactNode
  error?: React.ReactNode
  required?: boolean
  htmlFor?: string
}

function Field({
  className,
  label,
  description,
  error,
  required,
  htmlFor,
  children,
  ...props
}: FieldProps) {
  return (
    <div className={cn("space-y-2", className)} {...props}>
      {label ? (
        <label
          htmlFor={htmlFor}
          className="block text-sm font-medium leading-5 text-foreground"
        >
          {required ? <span className="mr-1 text-destructive">*</span> : null}
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="flex items-start gap-2 text-sm leading-6 text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : description ? (
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}

function Input({
  className,
  size,
  type = "text",
  ...props
}: React.ComponentProps<"input"> & VariantProps<typeof inputVariants>) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(inputVariants({ size, className }))}
      {...props}
    />
  )
}

function ActionInput({
  className,
  inputClassName,
  actionClassName,
  leadingIcon,
  actionIcon,
  actionLabel,
  onAction,
  actionDisabled,
  size,
  tone,
  type = "text",
  disabled,
  "aria-invalid": ariaInvalid,
  ...props
}: Omit<React.ComponentProps<"input">, "size"> &
  VariantProps<typeof actionInputVariants> & {
    inputClassName?: string
    actionClassName?: string
    leadingIcon?: React.ReactNode
    actionIcon?: React.ReactNode
    actionLabel?: string
    onAction?: () => void
    actionDisabled?: boolean
  }) {
  const invalid = Boolean(ariaInvalid && ariaInvalid !== "false")

  return (
    <div
      data-slot="action-input"
      data-disabled={disabled ? true : undefined}
      data-invalid={invalid ? true : undefined}
      className={cn(actionInputVariants({ size, tone, className }))}
    >
      {leadingIcon ? (
        <div
          data-slot="action-input-leading"
          className="grid w-12 shrink-0 place-items-center border-r border-border/70 text-muted-foreground transition-colors group-focus-within:text-primary [&_svg]:size-5"
          aria-hidden="true"
        >
          {leadingIcon}
        </div>
      ) : null}
      <input
        data-slot="action-input-control"
        type={type}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        className={cn(
          "min-w-0 flex-1 bg-transparent px-4 text-base outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed",
          inputClassName
        )}
        {...props}
      />
      {actionIcon ? (
        <button
          data-slot="action-input-action"
          type="button"
          aria-label={actionLabel}
          disabled={disabled || actionDisabled}
          onClick={onAction}
          className={cn(
            "grid w-12 shrink-0 place-items-center border-l border-border/70 bg-muted/35 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-5",
            actionClassName
          )}
        >
          {actionIcon}
        </button>
      ) : null}
    </div>
  )
}

function Textarea({
  className,
  size,
  ...props
}: React.ComponentProps<"textarea"> & VariantProps<typeof inputVariants>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        inputVariants({ size }),
        "min-h-24 resize-y py-2 leading-6",
        className
      )}
      {...props}
    />
  )
}

export { ActionInput, Field, Input, Textarea, actionInputVariants, inputVariants }
