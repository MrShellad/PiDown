import { motion } from "motion/react"
import { Clipboard, File, Link2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ActionInput } from "@/components/ui/input"
import { UI_TEXT } from "@/core/locale"

interface NewTaskLinkStepProps {
  url: string
  loading: boolean
  onUrlChange: (value: string) => void
  onPasteFromClipboard: () => void
  onPickTorrentFile: () => void
}

export function NewTaskLinkStep({
  url,
  loading,
  onUrlChange,
  onPasteFromClipboard,
  onPickTorrentFile,
}: NewTaskLinkStepProps) {
  return (
    <motion.div
      className="mx-auto w-full"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
    >
      <div className="flex gap-2 items-center">
        <div className="flex-1">
          <ActionInput
            type="text"
            placeholder={UI_TEXT.newTask.placeholder}
            value={url}
            onChange={(event) => onUrlChange(event.target.value)}
            disabled={loading}
            leadingIcon={<Link2 />}
            actionIcon={<Clipboard />}
            actionLabel={UI_TEXT.newTask.pasteFromClipboard}
            onAction={onPasteFromClipboard}
            inputClassName="font-mono"
            required
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onPickTorrentFile}
          disabled={loading}
          className="h-12 px-4 flex gap-2 items-center shrink-0 border border-input bg-background/90"
        >
          <File className="size-5" />
          <span>{UI_TEXT.newTask.selectTorrent}</span>
        </Button>
      </div>
    </motion.div>
  )
}
