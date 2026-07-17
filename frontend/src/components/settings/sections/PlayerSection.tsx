import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { type AppSettings } from "@/core/bridge/tauri-commands";
import {
  SettingsList,
  SettingsListItem,
  SettingsSectionCard,
} from "../SettingsPrimitives";

interface PlayerSectionProps {
  draft: AppSettings;
  updateDraft: (updater: (prev: AppSettings) => AppSettings) => void;
}

export default function PlayerSection({ draft, updateDraft }: PlayerSectionProps) {
  return (
    <SettingsSectionCard>
      <div className="mt-0">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          播放器配置
        </div>
        <SettingsList>
          <SettingsListItem
            title="默认缓冲时间"
            description="设置 WebDAV 视频点播代理在内存中缓冲视频的时长（基于视频平均码率计算字节大小）"
          >
            <Slider
              min={5}
              max={300}
              step={5}
              value={draft.player?.buffer_time_s ?? 60}
              onValueChange={(value) =>
                updateDraft((prev) => ({
                  ...prev,
                  player: {
                    ...(prev.player || { auto_play: true, muted: false, default_volume: 1.0 }),
                    buffer_time_s: value,
                  },
                }))
              }
              valueText={`${draft.player?.buffer_time_s ?? 60} 秒`}
            />
          </SettingsListItem>

          <SettingsListItem
            title="默认自动播放"
            description="打开视频预览弹窗时是否自动开始播放视频"
            action={
              <Switch
                checked={draft.player?.auto_play ?? true}
                onCheckedChange={(checked) =>
                  updateDraft((prev) => ({
                    ...prev,
                    player: {
                      ...(prev.player || { buffer_time_s: 60, muted: false, default_volume: 1.0 }),
                      auto_play: checked,
                    },
                  }))
                }
              />
            }
          />

          <SettingsListItem
            title="默认静音播放"
            description="打开视频预览时是否默认静音"
            action={
              <Switch
                checked={draft.player?.muted ?? false}
                onCheckedChange={(checked) =>
                  updateDraft((prev) => ({
                    ...prev,
                    player: {
                      ...(prev.player || { buffer_time_s: 60, auto_play: true, default_volume: 1.0 }),
                      muted: checked,
                    },
                  }))
                }
              />
            }
          />

          <SettingsListItem
            title="默认音量大小"
            description="视频预览时的默认音量大小（静音播放设置将优先于此设置）"
          >
            <Slider
              min={0}
              max={100}
              step={1}
              value={Math.round((draft.player?.default_volume ?? 1.0) * 100)}
              onValueChange={(value) =>
                updateDraft((prev) => ({
                  ...prev,
                  player: {
                    ...(prev.player || { buffer_time_s: 60, auto_play: true, muted: false }),
                    default_volume: value / 100,
                  },
                }))
              }
              valueText={`${Math.round((draft.player?.default_volume ?? 1.0) * 100)}%`}
            />
          </SettingsListItem>
        </SettingsList>
      </div>
    </SettingsSectionCard>
  );
}
