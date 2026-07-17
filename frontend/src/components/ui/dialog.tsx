"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useThemeStore } from "@/core/store/useThemeStore"

type DialogSurfaceVariant = "modal" | "alert"

const DialogSurfaceContext = React.createContext<DialogSurfaceVariant>("modal")
const DialogOpenContext = React.createContext<boolean | null>(null)

const dialogContentVariants = cva(
  "fixed top-1/2 left-1/2 z-[150] grid w-full max-w-[calc(100%-2rem)] overflow-hidden rounded-lg bg-popover text-sm text-popover-foreground shadow-2xl shadow-black/15 ring-1 ring-foreground/10 outline-none",
  {
    variants: {
      variant: {
        modal: "gap-0",
        alert: "gap-0",
      },
      size: {
        sm: "sm:max-w-sm",
        default: "sm:max-w-md",
        lg: "sm:max-w-lg",
        xl: "sm:max-w-xl",
        full: "h-[calc(100vh-2rem)] sm:max-w-[calc(100vw-2rem)]",
      },
    },
    defaultVariants: {
      variant: "modal",
      size: "default",
    },
  }
)

function Dialog({
  modal = true,
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const isControlled = open !== undefined
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen ?? false)
  const currentOpen = isControlled ? open : uncontrolledOpen

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) setUncontrolledOpen(nextOpen)
      onOpenChange?.(nextOpen)
    },
    [isControlled, onOpenChange]
  )

  return (
    <DialogOpenContext.Provider value={currentOpen}>
      <DialogPrimitive.Root
        data-slot="dialog"
        modal={modal}
        open={currentOpen}
        onOpenChange={handleOpenChange}
        {...props}
      />
    </DialogOpenContext.Provider>
  )
}

function DialogTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal(props: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <DialogPrimitive.Overlay
      asChild
      {...props}
    >
      <motion.div
        data-slot="dialog-overlay"
        className={cn(
          "fixed inset-0 isolate z-[150] bg-black/10 backdrop-blur-xs top-10",
          className
        )}
        style={{ willChange: "opacity" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.16, ease: "easeOut" }}
      />
    </DialogPrimitive.Overlay>
  )
}

function DialogContent({
  className,
  children,
  showCloseButton,
  closeLabel = "Close",
  size,
  variant,
  dismissible,
  overlayClassName,
  onEscapeKeyDown,
  onInteractOutside,
  onPointerDownOutside,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> &
  VariantProps<typeof dialogContentVariants> & {
    showCloseButton?: boolean
    closeLabel?: string
    dismissible?: boolean
    overlayClassName?: string
}) {
  const theme = useThemeStore((state) => state.theme)
  const surfaceVariant = variant ?? "modal"
  const shouldShowCloseButton = (showCloseButton ?? surfaceVariant === "modal") && theme !== "animal-crossing"
  const isDismissible = dismissible ?? surfaceVariant === "modal"
  const isOpen = React.useContext(DialogOpenContext)
  const shouldReduceMotion = useReducedMotion()
  const shouldRender = isOpen ?? true
  const isFullSize = size === "full"

  return (
    <DialogPortal forceMount>
      <AnimatePresence>
        {shouldRender ? (
          [
            <DialogOverlay key="dialog-overlay" forceMount className={overlayClassName} />
            ,
            <DialogPrimitive.Content
              key="dialog-content"
              asChild
              forceMount
              onEscapeKeyDown={(event) => {
                onEscapeKeyDown?.(event)
                if (!isDismissible) event.preventDefault()
              }}
              onInteractOutside={(event) => {
                onInteractOutside?.(event)
                if (event.target instanceof Element && event.target.closest(".window-frame")) {
                  event.preventDefault()
                } else if (!isDismissible) {
                  event.preventDefault()
                }
              }}
              onPointerDownOutside={(event) => {
                onPointerDownOutside?.(event)
                if (event.target instanceof Element && event.target.closest(".window-frame")) {
                  event.preventDefault()
                } else if (!isDismissible) {
                  event.preventDefault()
                }
              }}
              {...props}
            >
              <motion.div
                data-slot="dialog-content"
                data-variant={surfaceVariant}
                className={cn(dialogContentVariants({ size, variant: surfaceVariant, className }))}
                style={{ x: "-50%", y: "-50%", willChange: "opacity", ...props.style }}
                initial={{ opacity: 0, scale: shouldReduceMotion || isFullSize ? 1 : 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: shouldReduceMotion || isFullSize ? 1 : 0.98 }}
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : isFullSize
                      ? { duration: 0.14, ease: [0.16, 1, 0.3, 1] }
                      : { type: "spring", stiffness: 430, damping: 34, mass: 0.8 }
                }
              >
                <DialogSurfaceContext.Provider value={surfaceVariant}>
                  {children}
                  {shouldShowCloseButton ? (
                    <DialogPrimitive.Close data-slot="dialog-close" asChild>
                      <Button
                        variant="ghost"
                        className="absolute top-3 right-3 z-20"
                        size="icon-sm"
                      >
                        <XIcon />
                        <span className="sr-only">{closeLabel}</span>
                      </Button>
                    </DialogPrimitive.Close>
                  ) : null}
                </DialogSurfaceContext.Provider>
              </motion.div>
            </DialogPrimitive.Content>
          ]
        ) : null}
      </AnimatePresence>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  const variant = React.useContext(DialogSurfaceContext)

  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "relative z-10 flex flex-col items-center gap-2 border-b border-border/60 bg-popover-soft px-4 py-4 text-center shadow-dialog-header sm:px-5",
        variant === "alert" && "px-5 py-4",
        className
      )}
      {...props}
    />
  )
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  const variant = React.useContext(DialogSurfaceContext)

  return (
    <div
      data-slot="dialog-body"
      className={cn(
        "min-w-0 space-y-4 px-4 py-4 sm:px-5",
        variant === "alert" && "px-5 text-center",
        className
      )}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  closeLabel = "Close",
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
  closeLabel?: string
}) {
  const variant = React.useContext(DialogSurfaceContext)
  const theme = useThemeStore((state) => state.theme);

  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "relative z-10 flex flex-col-reverse items-center justify-center gap-2 border-t border-border/60 bg-muted-soft px-4 py-4 shadow-dialog-footer sm:flex-row sm:gap-3 sm:px-5",
        "[&_[data-slot=button]]:h-10 [&_[data-slot=button]]:w-full [&_[data-slot=button]]:px-4 sm:[&_[data-slot=button]]:w-28",
        variant === "alert" && "sm:[&_[data-slot=button]]:w-28",
        theme === "animal-crossing" && "pb-6 pt-4 overflow-visible [&_[data-slot=button]]:w-auto sm:[&_[data-slot=button]]:w-auto sm:[&_[data-slot=button]]:min-w-28",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton ? (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">{closeLabel}</Button>
        </DialogPrimitive.Close>
      ) : null}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading text-base leading-6 font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm leading-6 text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogBody,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  dialogContentVariants,
}
