import { useMemo } from "react";
import { OptionDropdown } from "@/components/common";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { SettingsInput } from "../SettingsPrimitives";
import {
  type AppSettings,
  type SpeedDisplayUnit,
} from "@/core/bridge/tauri-commands";
import { UI_TEXT } from "@/core/locale";
import {
  SettingsList,
  SettingsListItem,
  SettingsSectionCard,
} from "../SettingsPrimitives";

interface TransferSectionProps {
  draft: AppSettings;
  updateDraft: (updater: (prev: AppSettings) => AppSettings) => void;
  downloadLimitInput: string;
  setDownloadLimitInput: (val: string) => void;
  uploadLimitInput: string;
  setUploadLimitInput: (val: string) => void;
  proxyType: "none" | "http" | "https" | "socks5";
  setProxyType: (val: "none" | "http" | "https" | "socks5") => void;
  proxyAddress: string;
  setProxyAddress: (val: string) => void;
}

export default function TransferSection({
  draft,
  updateDraft,
  downloadLimitInput,
  setDownloadLimitInput,
  uploadLimitInput,
  setUploadLimitInput,
  proxyType,
  setProxyType,
  proxyAddress,
  setProxyAddress,
}: TransferSectionProps) {
  const speedDisplayUnitOptions = useMemo<{ value: SpeedDisplayUnit; label: string }[]>(() => [
    { value: "auto", label: UI_TEXT.settings.speedDisplayUnitAuto },
    { value: "kib", label: "KB/s" },
    { value: "mib", label: "MB/s" },
    { value: "mb", label: "Mbps" },
  ], [draft.interface.language]);

  const proxyTypeOptions = useMemo(() => [
    { value: "none", label: UI_TEXT.settings.proxyTypeNone },
    { value: "http", label: UI_TEXT.settings.proxyTypeHttp },
    { value: "https", label: UI_TEXT.settings.proxyTypeHttps },
    { value: "socks5", label: UI_TEXT.settings.proxyTypeSocks5 },
  ], [draft.interface.language]);

  return (
    <SettingsSectionCard>
      <div className="mt-0">
        {/* Group 1: 并发与队列 */}
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {UI_TEXT.settings.groupConcurrency}
        </div>
        <SettingsList>
          <SettingsListItem
            title={UI_TEXT.settings.transferConcurrency}
            description={UI_TEXT.settings.transferConcurrencyDesc}
          >
            <Slider
              min={1}
              max={10}
              value={draft.transfer.max_concurrent_downloads}
              onValueChange={(value) =>
                updateDraft((prev) => ({
                  ...prev,
                  transfer: {
                    ...prev.transfer,
                    max_concurrent_downloads: value,
                  },
                }))
              }
              valueText={UI_TEXT.settings.concurrentDownloadsLabel.replace(
                "{{value}}",
                String(draft.transfer.max_concurrent_downloads)
              )}
            />
          </SettingsListItem>
          <SettingsListItem
            title={UI_TEXT.settings.maxConnectionsPerTask}
            description={UI_TEXT.settings.maxConnectionsPerTaskDesc}
          >
            <Slider
              min={1}
              max={16}
              value={draft.transfer.task_thread_count}
              onValueChange={(value) =>
                updateDraft((prev) => ({
                  ...prev,
                  transfer: {
                    ...prev.transfer,
                    task_thread_count: value,
                  },
                }))
              }
              valueText={UI_TEXT.settings.maxConnectionsPerTaskValueText.replace(
                "{value}",
                String(draft.transfer.task_thread_count)
              )}
            />
          </SettingsListItem>
        </SettingsList>

        {/* Group 2: 速度限制 */}
        <div className="mb-3 mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {UI_TEXT.settings.groupBandwidth}
        </div>
        <SettingsList>
          <SettingsListItem
            title={UI_TEXT.settings.globalSpeedLimit}
            description={UI_TEXT.settings.globalSpeedLimitDesc}
          >
            <div className="flex flex-col sm:flex-row gap-4 w-full mt-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-xs text-muted-foreground whitespace-nowrap w-8">
                  {UI_TEXT.settings.speedLimitDownloadLabel}
                </span>
                <SettingsInput
                  value={downloadLimitInput}
                  onChange={(event) => setDownloadLimitInput(event.target.value)}
                  placeholder={UI_TEXT.settings.unlimitedPlaceholder}
                  className="font-mono flex-1 min-w-0"
                />
                <span className="text-xs text-muted-foreground shrink-0 w-10">KB/s</span>
              </div>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-xs text-muted-foreground whitespace-nowrap w-8">
                  {UI_TEXT.settings.speedLimitUploadLabel}
                </span>
                <SettingsInput
                  value={uploadLimitInput}
                  onChange={(event) => setUploadLimitInput(event.target.value)}
                  placeholder={UI_TEXT.settings.unlimitedPlaceholder}
                  className="font-mono flex-1 min-w-0"
                />
                <span className="text-xs text-muted-foreground shrink-0 w-10">KB/s</span>
              </div>
            </div>
          </SettingsListItem>
          <SettingsListItem
            title={UI_TEXT.settings.speedDisplayUnit}
            description={UI_TEXT.settings.speedDisplayUnitDesc}
          >
            <OptionDropdown
              value={draft.transfer.speed_display_unit}
              options={speedDisplayUnitOptions}
              onValueChange={(nextUnit) =>
                updateDraft((prev) => ({
                  ...prev,
                  transfer: {
                    ...prev.transfer,
                    speed_display_unit: nextUnit,
                  },
                }))
              }
              ariaLabel={UI_TEXT.settings.speedDisplayUnit}
            />
          </SettingsListItem>
        </SettingsList>

        {/* Group 3: 网络与安全 */}
        <div className="mb-3 mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {UI_TEXT.settings.groupNetworkAndSecurity}
        </div>
        <SettingsList>
          <SettingsListItem
            title={UI_TEXT.settings.globalProxy}
            description={UI_TEXT.settings.globalProxyDesc}
            childrenSpan="full"
          >
            <div className="flex flex-col sm:flex-row gap-3 mt-2 w-full">
              <div className="w-32 shrink-0">
                <OptionDropdown
                  value={proxyType}
                  options={proxyTypeOptions}
                  onValueChange={(val) => setProxyType(val as any)}
                  ariaLabel="Proxy Type"
                />
              </div>
              <div className="flex-1 min-w-0">
                <SettingsInput
                  value={proxyType === "none" ? "" : proxyAddress}
                  onChange={(event) => setProxyAddress(event.target.value)}
                  disabled={proxyType === "none"}
                  placeholder={UI_TEXT.settings.proxyAddressPlaceholder}
                  className="font-mono w-full"
                />
              </div>
            </div>
          </SettingsListItem>
          <SettingsListItem
            title={UI_TEXT.settings.ignoreSslErrors}
            description={UI_TEXT.settings.ignoreSslErrorsDesc}
            action={
              <Switch
                checked={draft.transfer.ignore_ssl_certificate}
                onCheckedChange={(checked) =>
                  updateDraft((prev) => ({
                    ...prev,
                    transfer: {
                      ...prev.transfer,
                      ignore_ssl_certificate: checked,
                    },
                  }))
                }
              />
            }
          />
          <SettingsListItem
            title={UI_TEXT.settings.maxDownloadRetries}
            description={UI_TEXT.settings.maxDownloadRetriesDesc}
          >
            <Slider
              min={0}
              max={20}
              value={draft.transfer.max_download_retries}
              onValueChange={(value) =>
                updateDraft((prev) => ({
                  ...prev,
                  transfer: {
                    ...prev.transfer,
                    max_download_retries: value,
                  },
                }))
              }
              valueText={UI_TEXT.settings.maxDownloadRetriesValueText.replace(
                "{value}",
                String(draft.transfer.max_download_retries)
              )}
            />
          </SettingsListItem>
          <SettingsListItem
            title={UI_TEXT.settings.globalUserAgent}
            description={UI_TEXT.settings.globalUserAgentDesc}
            childrenSpan="full"
          >
            <SettingsInput
              value={draft.download.global_user_agent}
              onChange={(event) =>
                updateDraft((prev) => ({
                  ...prev,
                  download: {
                    ...prev.download,
                    global_user_agent: event.target.value,
                  },
                }))
              }
              placeholder="Mozilla/5.0"
              className="font-mono"
            />
          </SettingsListItem>
        </SettingsList>
      </div>
    </SettingsSectionCard>
  );
}
