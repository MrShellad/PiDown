import type { ReactNode } from "react"
import { motion } from "motion/react"
import { Cookie, Cpu, ExternalLink, Gauge, UserRound, Fingerprint, HardDrive } from "lucide-react"

import { SegmentedControl } from "@/components/common"
import { Input, Textarea } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { UI_TEXT } from "@/core/locale"
import { MAX_TASK_THREAD_COUNT } from "./data"
import type { NewTaskAdvancedDraft } from "./types"

interface NewTaskAdvancedFormProps {
  draft: NewTaskAdvancedDraft
  defaultThreadCount: number
  globalUserAgent: string
  loading: boolean
  onDraftChange: (patch: Partial<NewTaskAdvancedDraft>) => void
  isTorrent?: boolean
  infoHash?: string | null
  isPrivate?: boolean | null
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
  isTorrent = false,
  infoHash = null,
  isPrivate = null,
}: NewTaskAdvancedFormProps) {
  return (
    <div
      className="grid gap-4 md:grid-cols-2"
    >
      {/* Torrent Infohash Block */}
      {isTorrent && infoHash && (
        <div className="md:col-span-2">
          <AdvancedField icon={<Fingerprint />} label={UI_TEXT.newTask.advanced.infoHash}>
            <div className="flex h-11 items-center justify-between rounded-lg bg-secondary/25 border border-border/80 px-4 font-mono text-xs text-foreground/90 select-all">
              <span className="truncate">{infoHash}</span>
            </div>
          </AdvancedField>
        </div>
      )}

      {/* Speed Limits / Thread count */}
      <AdvancedField icon={<Gauge />} label={UI_TEXT.newTask.advanced.downloadSpeedLimit}>
        <Input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={draft.maxDownloadSpeedInput}
          onChange={(event) => onDraftChange({ maxDownloadSpeedInput: event.target.value })}
          disabled={loading}
          placeholder={UI_TEXT.newTask.advanced.speedLimitPlaceholder}
          className="h-12 rounded-lg bg-background/70 px-4 text-base"
        />
      </AdvancedField>

      {isTorrent ? (
        <AdvancedField icon={<Gauge />} label={UI_TEXT.newTask.advanced.uploadSpeedLimit}>
          <Input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={draft.maxUploadSpeedInput}
            onChange={(event) => onDraftChange({ maxUploadSpeedInput: event.target.value })}
            disabled={loading}
            placeholder={UI_TEXT.newTask.advanced.speedLimitPlaceholder}
            className="h-12 rounded-lg bg-background/70 px-4 text-base"
          />
        </AdvancedField>
      ) : (
        <AdvancedField icon={<Cpu />} label={UI_TEXT.newTask.advanced.threadCount}>
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
      )}

      <div className="md:col-span-2">
        <AdvancedField icon={<HardDrive />} label={UI_TEXT.newTask.advanced.diskAllocation}>
          <div className="flex items-center justify-center h-12">
            <SegmentedControl
              value={draft.fileAllocation}
              options={[
                { value: "default", label: UI_TEXT.newTask.advanced.allocDefault },
                { value: "none", label: UI_TEXT.newTask.advanced.allocNone },
                { value: "sparse", label: UI_TEXT.newTask.advanced.allocSparse },
                { value: "full", label: UI_TEXT.newTask.advanced.allocFull },
              ]}
              onValueChange={(val) => onDraftChange({ fileAllocation: val })}
              size="lg"
            />
          </div>
        </AdvancedField>
      </div>

      {/* Switches for Torrent Options */}
      {isTorrent && (
        <div className="md:col-span-2 grid gap-4 md:grid-cols-2 bg-secondary/15 p-4 rounded-xl border border-border/60">
          <div className="flex items-center">
            <Switch
              checked={draft.autoVerify}
              onCheckedChange={(checked) => onDraftChange({ autoVerify: checked })}
              disabled={loading}
              label={UI_TEXT.newTask.advanced.autoVerify}
              description={UI_TEXT.newTask.advanced.autoVerifyDesc}
            />
          </div>
          <div className="flex items-center">
            <Switch
              checked={draft.disableDhtPexLpd || isPrivate === true}
              onCheckedChange={(checked) => onDraftChange({ disableDhtPexLpd: checked })}
              disabled={loading || isPrivate === true}
              label={UI_TEXT.newTask.advanced.disableDht}
              description={
                isPrivate === true
                  ? UI_TEXT.newTask.advanced.privateTorrentForce
                  : UI_TEXT.newTask.advanced.privateTorrentTip
              }
            />
          </div>
        </div>
      )}

      {!isTorrent && (
        <AdvancedField icon={<UserRound />} label={UI_TEXT.newTask.advanced.userAgent}>
          <div className="space-y-2">
            <Input
              value={draft.userAgentInput}
              onChange={(event) => onDraftChange({ userAgentInput: event.target.value })}
              disabled={loading}
              placeholder={globalUserAgent || UI_TEXT.newTask.advanced.uaPlaceholder}
              className="h-12 rounded-lg bg-background/70 px-4 font-mono text-base"
            />
            <p className="text-xs leading-5 text-muted-foreground">
              {globalUserAgent
                ? UI_TEXT.newTask.advanced.uaDescWithGlobal.replace("{{ua}}", globalUserAgent)
                : UI_TEXT.newTask.advanced.uaDescFallback}
            </p>
          </div>
        </AdvancedField>
      )}

      {!isTorrent && (
        <AdvancedField icon={<ExternalLink />} label={UI_TEXT.newTask.advanced.referer}>
          <Input
            value={draft.refererInput}
            onChange={(event) => onDraftChange({ refererInput: event.target.value })}
            disabled={loading}
            placeholder="https://example.com/page"
            className="h-12 rounded-lg bg-background/70 px-4 font-mono text-base"
          />
        </AdvancedField>
      )}

      {!isTorrent && (
        <div className="md:col-span-2">
          <AdvancedField icon={<Cookie />} label={UI_TEXT.newTask.advanced.cookies}>
            <Textarea
              value={draft.cookiesInput}
              onChange={(event) => onDraftChange({ cookiesInput: event.target.value })}
              disabled={loading}
              placeholder="session=abc; token=xyz"
              className="min-h-28 resize-none rounded-lg bg-background/70 px-4 py-3 font-mono text-sm leading-5"
            />
          </AdvancedField>
        </div>
      )}
    </div>
  )
}
