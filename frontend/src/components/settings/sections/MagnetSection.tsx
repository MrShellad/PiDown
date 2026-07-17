import { useState } from "react";
import { OptionDropdown } from "@/components/common";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  type AppSettings,
  updateTrackersFromSubscription,
} from "@/core/bridge/tauri-commands";
import { UI_TEXT } from "@/core/locale";
import { useAppSettingsStore } from "@/core/store/useAppSettingsStore";
import { useToastStore } from "@/core/store/useToastStore";
import {
  SettingsList,
  SettingsListItem,
  SettingsSectionCard,
  SettingsInput,
  SettingsTextarea,
} from "../SettingsPrimitives";

interface MagnetSectionProps {
  draft: AppSettings;
  updateDraft: (updater: (prev: AppSettings) => AppSettings) => void;
}

export default function MagnetSection({ draft, updateDraft }: MagnetSectionProps) {
  const [updatingTrackers, setUpdatingTrackers] = useState(false);

  const handleUpdateTrackers = async () => {
    if (!draft.bt.tracker_subscribe_url?.trim()) return;
    setUpdatingTrackers(true);
    try {
      useToastStore.getState().pushToast({
        title: UI_TEXT.settings.updating,
        description: UI_TEXT.settings.updatingDesc,
      });
      const result = await updateTrackersFromSubscription();
      // Reload settings to get the updated tracker list
      await useAppSettingsStore.getState().load();
      useToastStore.getState().pushToast({
        title: UI_TEXT.settings.updateSuccess,
        description: result,
        variant: "success",
      });
    } catch (err) {
      useToastStore.getState().pushToast({
        title: UI_TEXT.settings.updateFailed,
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setUpdatingTrackers(false);
    }
  };

  return (
    <SettingsSectionCard>
      <div className="mt-0">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {UI_TEXT.settings.magnetGroupConnection}
        </div>
        <SettingsList>
          <SettingsListItem
            title={UI_TEXT.settings.enableDht}
            description={UI_TEXT.settings.enableDhtDesc}
            action={
              <Switch
                checked={draft.bt.enable_dht}
                onCheckedChange={(checked) =>
                  updateDraft((prev) => ({
                    ...prev,
                    bt: {
                      ...prev.bt,
                      enable_dht: checked,
                    },
                  }))
                }
              />
            }
          />
          <SettingsListItem
            title={UI_TEXT.settings.enablePex}
            description={UI_TEXT.settings.enablePexDesc}
            action={
              <Switch
                checked={draft.bt.enable_pex}
                onCheckedChange={(checked) =>
                  updateDraft((prev) => ({
                    ...prev,
                    bt: {
                      ...prev.bt,
                      enable_pex: checked,
                    },
                  }))
                }
              />
            }
          />
          <SettingsListItem
            title={UI_TEXT.settings.enableLpd}
            description={UI_TEXT.settings.enableLpdDesc}
            action={
              <Switch
                checked={draft.bt.enable_lpd}
                onCheckedChange={(checked) =>
                  updateDraft((prev) => ({
                    ...prev,
                    bt: {
                      ...prev.bt,
                      enable_lpd: checked,
                    },
                  }))
                }
              />
            }
          />
        </SettingsList>

        <div className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {UI_TEXT.settings.magnetGroupNetwork}
        </div>
        <SettingsList>
          <SettingsListItem
            title={UI_TEXT.settings.listenPort}
            description={UI_TEXT.settings.listenPortDesc}
          >
            <div className="flex items-center gap-2 mt-1">
              <SettingsInput
                type="number"
                value={draft.bt.listen_port_start}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  updateDraft((prev) => ({
                    ...prev,
                    bt: {
                      ...prev.bt,
                      listen_port_start: isNaN(val) ? 6881 : val,
                    },
                  }));
                }}
                className="w-24 text-center font-mono"
              />
              <span className="text-muted-foreground">{UI_TEXT.settings.portTo}</span>
              <SettingsInput
                type="number"
                value={draft.bt.listen_port_end}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  updateDraft((prev) => ({
                    ...prev,
                    bt: {
                      ...prev.bt,
                      listen_port_end: isNaN(val) ? 6889 : val,
                    },
                  }));
                }}
                className="w-24 text-center font-mono"
              />
            </div>
          </SettingsListItem>

          <SettingsListItem
            title={UI_TEXT.settings.encryptionPolicy}
            description={UI_TEXT.settings.encryptionPolicyDesc}
          >
            <OptionDropdown
              value={draft.bt.encryption_policy}
              options={[
                { value: "preferred", label: UI_TEXT.settings.encryptPreferred },
                { value: "allowed", label: UI_TEXT.settings.encryptAllowed },
                { value: "required", label: UI_TEXT.settings.encryptRequired },
                { value: "disabled", label: UI_TEXT.settings.encryptDisabled },
              ]}
              onValueChange={(nextPolicy) =>
                updateDraft((prev) => ({
                  ...prev,
                  bt: {
                    ...prev.bt,
                    encryption_policy: nextPolicy,
                  },
                }))
              }
              ariaLabel={UI_TEXT.settings.encryptionPolicy}
            />
          </SettingsListItem>

          <SettingsListItem
            title={UI_TEXT.settings.seedRatioThreshold}
            description={UI_TEXT.settings.seedRatioThresholdDesc}
          >
            <div className="flex items-center gap-2 mt-1">
              <SettingsInput
                type="number"
                step="0.1"
                min="0"
                value={draft.bt.seed_ratio_threshold}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  updateDraft((prev) => ({
                    ...prev,
                    bt: {
                      ...prev.bt,
                      seed_ratio_threshold: isNaN(val) ? 1.0 : val,
                    },
                  }));
                }}
                className="w-24 text-center font-mono"
              />
              <span className="text-muted-foreground text-sm">{UI_TEXT.settings.seedRatioUnit}</span>
            </div>
          </SettingsListItem>

          <SettingsListItem
            title={UI_TEXT.settings.peerLoopInterval}
            description={UI_TEXT.settings.peerLoopIntervalDesc}
          >
            <div className="flex items-center gap-2 mt-1">
              <SettingsInput
                type="number"
                min="10"
                max="5000"
                value={draft.bt.peer_loop_interval_ms}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  updateDraft((prev) => ({
                    ...prev,
                    bt: {
                      ...prev.bt,
                      peer_loop_interval_ms: isNaN(val) ? 100 : val,
                    },
                  }));
                }}
                className="w-24 text-center font-mono"
              />
              <span className="text-muted-foreground text-sm">{UI_TEXT.settings.msUnit}</span>
            </div>
          </SettingsListItem>
        </SettingsList>

        <div className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {UI_TEXT.settings.magnetGroupTracker}
        </div>
        <SettingsList>
          <SettingsListItem
            title={UI_TEXT.settings.trackerSubscribe}
            description={UI_TEXT.settings.trackerSubscribeDesc}
          >
            <div className="flex gap-2 mt-1">
              <SettingsInput
                value={draft.bt.tracker_subscribe_url}
                onChange={(e) =>
                  updateDraft((prev) => ({
                    ...prev,
                    bt: {
                      ...prev.bt,
                      tracker_subscribe_url: e.target.value,
                    },
                  }))
                }
                placeholder="https://cf.trackerslist.com/best.txt"
                className="flex-1"
              />
              <Button
                onClick={handleUpdateTrackers}
                loading={updatingTrackers}
                disabled={!draft.bt.tracker_subscribe_url.trim() || updatingTrackers}
              >
                {UI_TEXT.settings.updateNow}
              </Button>
            </div>
          </SettingsListItem>

          <SettingsListItem
            title={UI_TEXT.settings.trackerList}
            description={UI_TEXT.settings.trackerListDesc}
            childrenSpan="full"
          >
            <SettingsTextarea
              value={draft.bt.tracker_list}
              onChange={(e) =>
                updateDraft((prev) => ({
                  ...prev,
                  bt: {
                    ...prev.bt,
                    tracker_list: e.target.value,
                  },
                }))
              }
              placeholder="udp://tracker.opentrackr.org:1337/announce&#10;http://tracker.ipv6tracker.ru:80/announce"
              className="font-mono min-h-[120px]"
            />
          </SettingsListItem>
        </SettingsList>
      </div>
    </SettingsSectionCard>
  );
}
