import { motion } from "motion/react"
import { Clipboard, Link2 } from "lucide-react"

import { ActionInput } from "@/components/ui/input"
import { UI_TEXT } from "@/core/locale"

interface NewTaskLinkStepProps {
  url: string
  loading: boolean
  onUrlChange: (value: string) => void
  onPasteFromClipboard: () => void
}

export function NewTaskLinkStep({
  url,
  loading,
  onUrlChange,
  onPasteFromClipboard,
}: NewTaskLinkStepProps) {
  return (
    <motion.div
      className="mx-auto w-full"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
    >
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
    </motion.div>
  )
}
