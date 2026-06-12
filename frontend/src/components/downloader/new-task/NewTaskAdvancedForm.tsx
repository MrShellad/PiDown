import type { ReactNode } from "react"
import { motion } from "motion/react"
import { Cookie, Cpu, ExternalLink, Gauge, UserRound, Fingerprint, HardDrive } from "lucide-react"

import { SegmentedControl } from "@/components/common"
import { Input, Textarea } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
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
    <motion.div
      className="grid gap-4 md:grid-cols-2"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
    >
      {/* Torrent Infohash Block */}
      {isTorrent && infoHash && (
        <div className="md:col-span-2">
          <AdvancedField icon={<Fingerprint />} label="种子 Hash 值">
            <div className="flex h-11 items-center justify-between rounded-lg bg-secondary/25 border border-border/80 px-4 font-mono text-xs text-foreground/90 select-all">
              <span className="truncate">{infoHash}</span>
            </div>
          </AdvancedField>
        </div>
      )}

      {/* Speed Limits / Thread count */}
      <AdvancedField icon={<Gauge />} label="下载限速">
        <Input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={draft.maxDownloadSpeedInput}
          onChange={(event) => onDraftChange({ maxDownloadSpeedInput: event.target.value })}
          disabled={loading}
          placeholder="KiB/s (留空不限速)"
          className="h-12 rounded-lg bg-background/70 px-4 text-base"
        />
      </AdvancedField>

      {isTorrent ? (
        <AdvancedField icon={<Gauge />} label="上传限速">
          <Input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={draft.maxUploadSpeedInput}
            onChange={(event) => onDraftChange({ maxUploadSpeedInput: event.target.value })}
            disabled={loading}
            placeholder="KiB/s (留空不限速)"
            className="h-12 rounded-lg bg-background/70 px-4 text-base"
          />
        </AdvancedField>
      ) : (
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
      )}

      <div className="md:col-span-2">
        <AdvancedField icon={<HardDrive />} label="磁盘预分配">
          <div className="flex items-center justify-center h-12">
            <SegmentedControl
              value={draft.fileAllocation}
              options={[
                { value: "default", label: "继承全局" },
                { value: "none", label: "不分配" },
                { value: "sparse", label: "稀疏分配" },
                { value: "full", label: "完全分配" },
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
              label="下载完毕自动校验"
              description="下载完成后对文件完整性进行哈希检验"
            />
          </div>
          <div className="flex items-center">
            <Switch
              checked={draft.disableDhtPexLpd || isPrivate === true}
              onCheckedChange={(checked) => onDraftChange({ disableDhtPexLpd: checked })}
              disabled={loading || isPrivate === true}
              label="禁用 DHT / PEX / LPD"
              description={
                isPrivate === true
                  ? "检测为私有种子，强制禁用以保护隐私"
                  : "私有种子建议开启此项以保护隐私"
              }
            />
          </div>
        </div>
      )}

      {!isTorrent && (
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
      )}

      {!isTorrent && (
        <AdvancedField icon={<ExternalLink />} label="Referer">
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
      )}
    </motion.div>
  )
}
