import type { ReactNode } from "react"
import { motion } from "motion/react"
import { Cookie, Cpu, ExternalLink, Gauge, UserRound } from "lucide-react"

import { Input, Textarea } from "@/components/ui/input"
import { MAX_TASK_THREAD_COUNT } from "./data"
import type { NewTaskAdvancedDraft } from "./types"

interface NewTaskAdvancedFormProps {
  draft: NewTaskAdvancedDraft
  defaultThreadCount: number
  globalUserAgent: string
  loading: boolean
  onDraftChange: (patch: Partial<NewTaskAdvancedDraft>) => void
}

function AdvancedField({
  icon,
  label,
  children,
}: {
  icon: ReactNode
  label: string
  children: ReactNode
}) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <span className="grid size-5 place-items-center text-primary [&_svg]:size-4">
          {icon}
        </span>
        {label}
      </span>
      {children}
    </label>
  )
}

export function NewTaskAdvancedForm({
  draft,
  defaultThreadCount,
  globalUserAgent,
  loading,
  onDraftChange,
}: NewTaskAdvancedFormProps) {
  return (
    <motion.div
      className="grid gap-4 md:grid-cols-2"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
    >
      <AdvancedField icon={<Gauge />} label="下载限速">
        <Input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={draft.maxDownloadSpeedInput}
          onChange={(event) => onDraftChange({ maxDownloadSpeedInput: event.target.value })}
          disabled={loading}
          placeholder="KiB/s"
          className="h-12 rounded-lg bg-background/70 px-4 text-base"
        />
      </AdvancedField>

      <AdvancedField icon={<Cpu />} label="任务线程数">
        <Input
          type="number"
          min={1}
          max={MAX_TASK_THREAD_COUNT}
          step={1}
          inputMode="numeric"
          value={draft.taskThreadCountInput}
          onChange={(event) => onDraftChange({ taskThreadCountInput: event.target.value })}
          disabled={loading}
          placeholder={`${defaultThreadCount}`}
          className="h-12 rounded-lg bg-background/70 px-4 text-base"
        />
      </AdvancedField>

      <AdvancedField icon={<UserRound />} label="User-Agent">
        <div className="space-y-2">
          <Input
            value={draft.userAgentInput}
            onChange={(event) => onDraftChange({ userAgentInput: event.target.value })}
            disabled={loading}
            placeholder={globalUserAgent || "留空继承全局 UA"}
            className="h-12 rounded-lg bg-background/70 px-4 font-mono text-base"
          />
          <p className="text-xs leading-5 text-muted-foreground">
            {globalUserAgent ? `留空时继承全局 UA: ${globalUserAgent}` : "留空时使用下载引擎默认 UA"}
          </p>
        </div>
      </AdvancedField>

      <AdvancedField icon={<ExternalLink />} label="Referer">
        <Input
          value={draft.refererInput}
          onChange={(event) => onDraftChange({ refererInput: event.target.value })}
          disabled={loading}
          placeholder="https://example.com/page"
          className="h-12 rounded-lg bg-background/70 px-4 font-mono text-base"
        />
      </AdvancedField>

      <div className="md:col-span-2">
        <AdvancedField icon={<Cookie />} label="Cookies">
          <Textarea
            value={draft.cookiesInput}
            onChange={(event) => onDraftChange({ cookiesInput: event.target.value })}
            disabled={loading}
            placeholder="session=abc; token=xyz"
            className="min-h-28 resize-none rounded-lg bg-background/70 px-4 py-3 font-mono text-sm leading-5"
          />
        </AdvancedField>
      </div>
    </motion.div>
  )
}
