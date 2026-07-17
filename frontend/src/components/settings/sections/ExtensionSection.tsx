import { useState } from "react";
import {
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { CompoundInput, CompoundInputButton } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  type AppSettings,
  openUrl,
} from "@/core/bridge/tauri-commands";
import { UI_TEXT } from "@/core/locale";
import { useToastStore } from "@/core/store/useToastStore";
import {
  SettingsList,
  SettingsListItem,
  SettingsSectionCard,
  SettingsInput,
} from "../SettingsPrimitives";

interface ExtensionSectionProps {
  draft: AppSettings;
  updateDraft: (updater: (prev: AppSettings) => AppSettings) => void;
}

export default function ExtensionSection({ draft, updateDraft }: ExtensionSectionProps) {
  const [tokenCopied, setTokenCopied] = useState(false);

  return (
    <SettingsSectionCard>
      <div className="mt-0">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {UI_TEXT.settings.groupBehavior}
        </div>
        <SettingsList>
          <SettingsListItem
            title={UI_TEXT.settings.browserExtIntegration}
            description={UI_TEXT.settings.browserExtIntegrationDesc}
            action={
              <Switch
                checked={draft.download.browser_extension_integration_enabled}
                onCheckedChange={(checked) =>
                  updateDraft((prev) => ({
                    ...prev,
                    download: {
                      ...prev.download,
                      browser_extension_integration_enabled: checked,
                    },
                  }))
                }
              />
            }
          />
          {draft.download.browser_extension_integration_enabled && (
            <SettingsListItem
              title={UI_TEXT.settings.portAndToken}
              description={UI_TEXT.settings.portAndTokenDesc}
            >
              <div className="flex flex-col sm:flex-row gap-4 w-full mt-2">
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{UI_TEXT.settings.port}</span>
                  <SettingsInput
                    type="number"
                    min={1024}
                    max={65535}
                    value={draft.download.browser_extension_port ?? 18388}
                    onChange={(event) => {
                      const val = parseInt(event.target.value, 10);
                      updateDraft((prev) => ({
                        ...prev,
                        download: {
                          ...prev.download,
                          browser_extension_port: isNaN(val) ? 18388 : val,
                        },
                      }));
                    }}
                    placeholder="18388"
                    className="w-24 font-mono text-center"
                  />
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{UI_TEXT.settings.token}</span>
                  <CompoundInput
                    value={draft.download.browser_extension_token || ""}
                    onChange={(event) =>
                      updateDraft((prev) => ({
                        ...prev,
                        download: {
                          ...prev.download,
                          browser_extension_token: event.target.value,
                        },
                      }))
                    }
                    placeholder={UI_TEXT.settings.token}
                    className="font-mono flex-1 min-w-0"
                    suffixActions={
                      <>
                        <CompoundInputButton
                          type="button"
                          divider="left"
                          onClick={() => {
                            const newToken = crypto.randomUUID();
                            updateDraft((prev) => ({
                              ...prev,
                              download: {
                                ...prev.download,
                                browser_extension_token: newToken,
                              },
                            }));
                          }}
                          className="px-3"
                          title={UI_TEXT.settings.tokenRandom}
                        >
                          <RefreshCw className="size-4" />
                        </CompoundInputButton>
                        <CompoundInputButton
                          type="button"
                          divider="left"
                          onClick={() => {
                            navigator.clipboard.writeText(draft.download.browser_extension_token || "");
                            setTokenCopied(true);
                            setTimeout(() => setTokenCopied(false), 2000);
                            useToastStore.getState().pushToast({
                              title: UI_TEXT.settings.copied,
                              description: UI_TEXT.settings.tokenCopiedDesc,
                              variant: "success",
                            });
                          }}
                          className="px-3"
                          title={UI_TEXT.settings.tokenCopy}
                        >
                          {tokenCopied ? (
                            <Check className="size-4 text-green-500" />
                          ) : (
                            <Copy className="size-4" />
                          )}
                        </CompoundInputButton>
                      </>
                    }
                  />
                </div>
              </div>
            </SettingsListItem>
          )}
          <SettingsListItem
            title={UI_TEXT.settings.chromeExtensionTitle}
            description={UI_TEXT.settings.chromeExtensionDesc}
            action={
              <a
                href="https://chromewebstore.google.com/detail/pidownloader-download-bri/hngdojmldgfhhagakfehglbilofpiapd"
                onClick={(e) => {
                  e.preventDefault();
                  openUrl("https://chromewebstore.google.com/detail/pidownloader-download-bri/hngdojmldgfhhagakfehglbilofpiapd");
                }}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-secondary/10 hover:bg-secondary/30 hover:border-primary/30 transition-all group shrink-0"
              >
                <svg className="w-5 h-5 select-none transition-transform group-hover:scale-110" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="chrome-red-action" x1="3.2173" y1="15" x2="44.7812" y2="15" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#d93025" />
                      <stop offset="1" stopColor="#ea4335" />
                    </linearGradient>
                    <linearGradient id="chrome-yellow-action" x1="20.7219" y1="47.6791" x2="41.5039" y2="11.6837" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#fcc934" />
                      <stop offset="1" stopColor="#fbbc04" />
                    </linearGradient>
                    <linearGradient id="chrome-green-action" x1="26.5981" y1="46.5015" x2="5.8161" y2="10.506" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#1e8e3e" />
                      <stop offset="1" stopColor="#34a853" />
                    </linearGradient>
                  </defs>
                  <circle cx="24" cy="23.9947" r="12" fill="#fff" />
                  <path d="M24,12H44.7812a23.9939,23.9939,0,0,0-41.5639.0029L13.6079,30l.0093-.0024A11.9852,11.9852,0,0,1,24,12Z" fill="url(#chrome-red-action)" />
                  <path d="M34.3913,30.0029,24.0007,48A23.994,23.994,0,0,0,44.78,12.0031H23.9989l-.0025.0093A11.985,11.985,0,0,1,34.3913,30.0029Z" fill="url(#chrome-yellow-action)" />
                  <path d="M13.6087,29.9971,3.2181,12A23.994,23.994,0,0,0,24.0023,47.9948V26.0125l-.0093-.0024A11.985,11.985,0,0,1,13.6087,29.9971Z" fill="url(#chrome-green-action)" />
                  <circle cx="24" cy="24" r="9.5" fill="#1a73e8" />
                </svg>
                <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                  {UI_TEXT.settings.chromeExtensionInstallBtn}
                </span>
                <ExternalLink className="size-3 text-muted-foreground group-hover:text-primary transition-colors" />
              </a>
            }
          />
        </SettingsList>

        <div className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {UI_TEXT.settings.integrationHintsTitle}
        </div>
        <SettingsList>
          <SettingsListItem
            title={UI_TEXT.settings.integrationHintsTitle}
            description={`${UI_TEXT.settings.integrationHint1} ${UI_TEXT.settings.integrationHint2}`}
          />
        </SettingsList>
      </div>
    </SettingsSectionCard>
  );
}
