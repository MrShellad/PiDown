import { useMemo } from "react";
import { FolderOpen } from "lucide-react";
import { CompoundInput, CompoundInputButton } from "@/components/ui/input";
import { OptionDropdown, SegmentedControl } from "@/components/common";
import { Switch } from "@/components/ui/switch";
import {
  type AppSettings,
  type FloatDisplayMode,
  pickDownloadDirectory,
} from "@/core/bridge/tauri-commands";
import { UI_TEXT } from "@/core/locale";
import { SUPPORTED_LANGUAGES } from "@/core/i18n";
import {
  SettingsList,
  SettingsListItem,
  SettingsSectionCard,
} from "../SettingsPrimitives";

interface GeneralSectionProps {
  draft: AppSettings;
  updateDraft: (updater: (prev: AppSettings) => AppSettings) => void;
}

export default function GeneralSection({ draft, updateDraft }: GeneralSectionProps) {
  const floatDisplayModeOptions = useMemo<{ value: FloatDisplayMode; label: string }[]>(() => [
    { value: "always", label: UI_TEXT.settings.floatWindowAlways },
    { value: "only_downloading", label: UI_TEXT.settings.floatWindowOnlyDownloading },
    { value: "hidden", label: UI_TEXT.settings.floatWindowHidden },
  ], [draft.interface.language]);

  const handlePickDir = async () => {
    try {
      const selected = await pickDownloadDirectory(draft.download.default_save_dir || undefined);
      if (selected) {
        updateDraft((prev) => ({
          ...prev,
          download: {
            ...prev.download,
            default_save_dir: selected,
          },
        }));
      }
    } catch (err) {
      console.warn("Failed to pick download directory:", err);
    }
  };

  return (
    <SettingsSectionCard>
      <div className="mt-0">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {UI_TEXT.settings.groupStorage}
        </div>
        <SettingsList>
          <SettingsListItem
            title={UI_TEXT.settings.defaultSaveDir}
            description={UI_TEXT.settings.downloadStorageDesc}
          >
            <CompoundInput
              value={draft.download.default_save_dir}
              onChange={(event) =>
                updateDraft((prev) => ({
                  ...prev,
                  download: {
                    ...prev.download,
                    default_save_dir: event.target.value,
                  },
                }))
              }
              placeholder={"H:\\Downloads\\PiDownloader"}
              suffixActions={
                <CompoundInputButton
                  type="button"
                  divider="left"
                  onClick={handlePickDir}
                  className="px-4"
                >
                  <FolderOpen className="size-4 mr-1.5" />
                  {UI_TEXT.settings.browse}
                </CompoundInputButton>
              }
            />
          </SettingsListItem>
          <SettingsListItem
            title={UI_TEXT.settings.diskAllocation}
            description={UI_TEXT.settings.diskAllocationDesc}
          >
            <div className="flex justify-center w-full mt-2">
              <SegmentedControl
                value={draft.bt.allocation_mode}
                options={[
                  { value: "none", label: UI_TEXT.settings.allocNone },
                  { value: "sparse", label: UI_TEXT.settings.allocSparse },
                  { value: "full", label: UI_TEXT.settings.allocFull },
                ]}
                onValueChange={(nextMode) =>
                  updateDraft((prev) => ({
                    ...prev,
                    bt: {
                      ...prev.bt,
                      allocation_mode: nextMode,
                    },
                  }))
                }
                size="lg"
                className="w-full max-w-md"
              />
            </div>
          </SettingsListItem>
        </SettingsList>

        <div className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {UI_TEXT.settings.groupBehavior}
        </div>
        <SettingsList>
          <SettingsListItem
            title={UI_TEXT.settings.autoStartOnBoot}
            description={UI_TEXT.settings.autoStartOnBootDesc}
            action={
              <Switch
                checked={draft.interface.auto_start_on_boot}
                onCheckedChange={(checked) =>
                  updateDraft((prev) => ({
                    ...prev,
                    interface: {
                      ...prev.interface,
                      auto_start_on_boot: checked,
                    },
                  }))
                }
              />
            }
          />
          <SettingsListItem
            title={UI_TEXT.settings.autoStart}
            description={UI_TEXT.settings.autoStartDesc}
            action={
              <Switch
                checked={draft.download.auto_start_downloads}
                onCheckedChange={(checked) =>
                  updateDraft((prev) => ({
                    ...prev,
                    download: {
                      ...prev.download,
                      auto_start_downloads: checked,
                    },
                  }))
                }
              />
            }
          />
          <SettingsListItem
            title={UI_TEXT.settings.autoRemoveOnFileDeleted}
            description={UI_TEXT.settings.autoRemoveOnFileDeletedDesc}
            action={
              <Switch
                checked={draft.download.auto_remove_on_file_deleted}
                onCheckedChange={(checked) =>
                  updateDraft((prev) => ({
                    ...prev,
                    download: {
                      ...prev.download,
                      auto_remove_on_file_deleted: checked,
                    },
                  }))
                }
              />
            }
          />
        </SettingsList>

        <div className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {UI_TEXT.settings.windowBehaviorTitle}
        </div>
        <SettingsList>
          <SettingsListItem
            title={UI_TEXT.settings.windowBehaviorTitle}
            description={UI_TEXT.settings.windowBehaviorDesc}
          >
            <div className="mt-2 space-y-3">
              <div className="flex justify-center w-full">
                <div className="w-full max-w-md">
                  <SegmentedControl
                    value={draft.interface.close_action}
                    options={[
                      { value: "minimize", label: UI_TEXT.settings.closeActionMinimize },
                      { value: "tray", label: UI_TEXT.settings.closeActionTray },
                      { value: "exit", label: UI_TEXT.settings.closeActionExit },
                    ]}
                    onValueChange={(nextAction) =>
                      updateDraft((prev) => ({
                        ...prev,
                        interface: {
                          ...prev.interface,
                          close_action: nextAction as AppSettings["interface"]["close_action"],
                        },
                      }))
                    }
                    size="lg"
                    className="w-full"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-normal text-center">
                {draft.interface.close_action === "minimize" && UI_TEXT.settings.closeActionMinimizeDesc}
                {draft.interface.close_action === "tray" && UI_TEXT.settings.closeActionTrayDesc}
                {draft.interface.close_action === "exit" && UI_TEXT.settings.closeActionExitDesc}
              </p>
            </div>
          </SettingsListItem>
          <SettingsListItem
            title={UI_TEXT.settings.floatWindowSettingsTitle}
            description={UI_TEXT.settings.floatWindowSettingsDesc}
          >
            <OptionDropdown
              value={draft.interface.float_display_mode}
              options={floatDisplayModeOptions}
              onValueChange={(nextMode) =>
                updateDraft((prev) => ({
                  ...prev,
                  interface: {
                    ...prev.interface,
                    float_display_mode: nextMode as AppSettings["interface"]["float_display_mode"],
                  },
                }))
              }
              ariaLabel={UI_TEXT.settings.floatWindowSettingsTitle}
            />
          </SettingsListItem>
          <SettingsListItem
            title={UI_TEXT.settings.minimizeOnCloseWithTasks}
            description={UI_TEXT.settings.minimizeOnCloseWithTasksDesc}
            action={
              <Switch
                checked={draft.interface.minimize_on_close_with_tasks}
                onCheckedChange={(checked) =>
                  updateDraft((prev) => ({
                    ...prev,
                    interface: {
                      ...prev.interface,
                      minimize_on_close_with_tasks: checked,
                    },
                  }))
                }
              />
            }
          />
          <SettingsListItem
            title={UI_TEXT.settings.enableNotifications}
            description={UI_TEXT.settings.enableNotificationsDesc}
            action={
              <Switch
                checked={draft.interface.enable_notifications ?? true}
                onCheckedChange={(checked) =>
                  updateDraft((prev) => ({
                    ...prev,
                    interface: {
                      ...prev.interface,
                      enable_notifications: checked,
                    },
                  }))
                }
              />
            }
          />
        </SettingsList>

        <div className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {UI_TEXT.settings.groupLanguage}
        </div>
        <SettingsList>
          <SettingsListItem
            title={UI_TEXT.settings.languageSetting}
            description={UI_TEXT.settings.languageSettingDesc}
          >
            <OptionDropdown
              value={draft.interface.language ?? "auto"}
              options={SUPPORTED_LANGUAGES.map((lang) => ({
                value: lang.code,
                label: lang.code === "auto" ? UI_TEXT.settings.languageAuto : lang.label,
              }))}
              onValueChange={(nextLang) =>
                updateDraft((prev) => ({
                  ...prev,
                  interface: {
                    ...prev.interface,
                    language: nextLang,
                  },
                }))
              }
              ariaLabel={UI_TEXT.settings.languageSetting}
            />
          </SettingsListItem>
          <SettingsListItem
            title={UI_TEXT.settings.datetimeFormatSetting}
            description={UI_TEXT.settings.datetimeFormatSettingDesc}
          >
            <OptionDropdown
              value={draft.interface.datetime_format ?? "YYYY-MM-DD HH:mm:ss"}
              options={[
                { value: "YYYY-MM-DD HH:mm:ss", label: "YYYY-MM-DD HH:mm:ss" },
                { value: "YYYY/MM/DD HH:mm:ss", label: "YYYY/MM/DD HH:mm:ss" },
                { value: "YYYY年MM月DD日 HH:mm:ss", label: "YYYY年MM月DD日 HH:mm:ss" },
              ]}
              onValueChange={(nextFormat) =>
                updateDraft((prev) => ({
                  ...prev,
                  interface: {
                    ...prev.interface,
                    datetime_format: nextFormat,
                  },
                }))
              }
              ariaLabel={UI_TEXT.settings.datetimeFormatSetting}
            />
          </SettingsListItem>
        </SettingsList>
      </div>
    </SettingsSectionCard>
  );
}
