import { useState } from "react"
import { Inbox, LogOut, Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAppSettingsStore } from "@/core/store/useAppSettingsStore"
import { UI_TEXT } from "@/core/locale"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { exitApp } from "@/core/bridge/tauri-commands"

interface CloseConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type AllowedCloseAction = "tray" | "exit"

export default function CloseConfirmDialog({
  open,
  onOpenChange,
}: CloseConfirmDialogProps) {
  const [selectedAction, setSelectedAction] = useState<AllowedCloseAction>("tray")
  const settings = useAppSettingsStore((state) => state.settings)
  const saveSettings = useAppSettingsStore((state) => state.save)

  const handleConfirm = async () => {
    if (!settings) return

    const updatedSettings = {
      ...settings,
      interface: {
        ...settings.interface,
        close_action: selectedAction,
        close_action_prompted: true,
      },
    }

    try {
      await saveSettings(updatedSettings)
      onOpenChange(false)
      if (selectedAction === "tray") {
        await getCurrentWindow().hide()
      } else {
        await exitApp()
      }
    } catch (err) {
      console.error("Failed to save close action preference:", err)
      // Fallback action if save fails
      onOpenChange(false)
      if (selectedAction === "tray") {
        getCurrentWindow().hide().catch(console.error)
      } else {
        exitApp().catch(console.error)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" variant="modal" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{UI_TEXT.settings.closePromptTitle}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <DialogDescription className="text-center text-foreground/80">
            {UI_TEXT.settings.closePromptDescription}
          </DialogDescription>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setSelectedAction("tray")}
              className={`relative flex flex-col items-center gap-3 rounded-xl border-2 p-5 text-center transition-all duration-200 outline-none hover:border-primary/50 hover:bg-primary/[0.02] ${
                selectedAction === "tray"
                  ? "border-primary bg-primary/[0.04] shadow-md shadow-primary/5"
                  : "border-border/60 bg-transparent"
              }`}
            >
              {selectedAction === "tray" && (
                <div className="absolute right-2.5 top-2.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3 stroke-[3]" />
                </div>
              )}
              <div
                className={`flex size-12 items-center justify-center rounded-xl transition-colors ${
                  selectedAction === "tray"
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Inbox className="size-6" />
              </div>
              <div className="space-y-1">
                <div className="font-semibold text-foreground text-sm">
                  {UI_TEXT.settings.closePromptTray}
                </div>
                <div className="text-xs text-muted-foreground leading-normal">
                  {UI_TEXT.settings.closePromptTrayDesc}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedAction("exit")}
              className={`relative flex flex-col items-center gap-3 rounded-xl border-2 p-5 text-center transition-all duration-200 outline-none hover:border-primary/50 hover:bg-primary/[0.02] ${
                selectedAction === "exit"
                  ? "border-primary bg-primary/[0.04] shadow-md shadow-primary/5"
                  : "border-border/60 bg-transparent"
              }`}
            >
              {selectedAction === "exit" && (
                <div className="absolute right-2.5 top-2.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3 stroke-[3]" />
                </div>
              )}
              <div
                className={`flex size-12 items-center justify-center rounded-xl transition-colors ${
                  selectedAction === "exit"
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <LogOut className="size-6" />
              </div>
              <div className="space-y-1">
                <div className="font-semibold text-foreground text-sm">
                  {UI_TEXT.settings.closePromptExit}
                </div>
                <div className="text-xs text-muted-foreground leading-normal">
                  {UI_TEXT.settings.closePromptExitDesc}
                </div>
              </div>
            </button>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {UI_TEXT.settings.closePromptCancel}
          </Button>
          <Button variant="primary" onClick={handleConfirm}>
            {UI_TEXT.settings.closePromptConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
