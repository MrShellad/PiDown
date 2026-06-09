import { Popover as PopoverPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { SettingsInput } from "@/components/settings/SettingsPrimitives"
import { UI_TEXT } from "@/core/locale"

interface SpeedLimitPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  downloadLimitInput: string
  uploadLimitInput: string
  onDownloadLimitInputChange: (value: string) => void
  onUploadLimitInputChange: (value: string) => void
  feedback: string | null
  saving: boolean
  canSave: boolean
  onSave: () => void | Promise<void>
  children: React.ReactNode
}

export function SpeedLimitPopover({
  open,
  onOpenChange,
  downloadLimitInput,
  uploadLimitInput,
  onDownloadLimitInputChange,
  onUploadLimitInputChange,
  feedback,
  saving,
  canSave,
  onSave,
  children,
}: SpeedLimitPopoverProps) {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>{children}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          side="bottom"
          sideOffset={10}
          collisionPadding={16}
          className="z-[80] w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border/70 bg-popover text-popover-foreground shadow-surface-strong outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
        >
          <div className="border-b border-border/60 bg-popover-soft px-4 py-3">
            <div className="text-sm font-semibold leading-5 text-foreground">
              {UI_TEXT.dashboard.speedLimitDialogTitle}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {UI_TEXT.dashboard.speedLimitDialogDesc}
            </p>
          </div>
          <div className="space-y-4 px-4 py-4">
            <label className="block space-y-2">
              <span className="text-sm font-semibold leading-5 text-foreground">
                {UI_TEXT.settings.downloadSpeedLimit}
              </span>
              <SettingsInput
                value={downloadLimitInput}
                onChange={(event) => onDownloadLimitInputChange(event.target.value)}
                placeholder={UI_TEXT.settings.unlimitedPlaceholder}
                inputMode="decimal"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-semibold leading-5 text-foreground">
                {UI_TEXT.settings.uploadSpeedLimit}
              </span>
              <SettingsInput
                value={uploadLimitInput}
                onChange={(event) => onUploadLimitInputChange(event.target.value)}
                placeholder={UI_TEXT.settings.unlimitedPlaceholder}
                inputMode="decimal"
              />
            </label>
            <p className="text-xs leading-5 text-muted-foreground">
              {UI_TEXT.settings.limitUnitHint}
            </p>
            {feedback ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm leading-6 text-destructive">
                {feedback}
              </p>
            ) : null}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-popover-soft px-4 py-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              {UI_TEXT.settings.cancel}
            </Button>
            <Button
              size="sm"
              onClick={() => void onSave()}
              disabled={!canSave || saving}
            >
              {saving ? UI_TEXT.settings.saving : UI_TEXT.settings.save}
            </Button>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
