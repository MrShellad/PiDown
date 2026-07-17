import { useState, useRef } from "react";
import {
  FileCode,
  Plus,
  Trash2,
  Sparkles,
  Upload,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCustomFileIcons,
  saveCustomFileIcons,
  preprocessSvg,
  type CustomFileIcon,
} from "@/components/common";
import { type AppSettings } from "@/core/bridge/tauri-commands";
import { UI_TEXT } from "@/core/locale";
import { useToastStore } from "@/core/store/useToastStore";
import {
  SettingsList,
  SettingsListItem,
  SettingsSectionCard,
  SettingsSectionHeader,
  SettingsInput,
} from "../SettingsPrimitives";
import DownloadRulesManager from "../DownloadRulesManager";

interface CategorySectionProps {
  draft: AppSettings;
  updateDraft: (updater: (prev: AppSettings) => AppSettings) => void;
}

export default function CategorySection({ draft, updateDraft }: CategorySectionProps) {
  const customFileIcons = useCustomFileIcons();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal & Edit States
  const [addIconOpen, setAddIconOpen] = useState(false);
  const [formatsInput, setFormatsInput] = useState("");
  const [selectedIconData, setSelectedIconData] = useState<{
    type: "png" | "svg";
    data: string;
    fileName: string;
  } | null>(null);
  const [svgColor, setSvgColor] = useState("#3b82f6");

  const handlePickIconFile = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ""; // clear previous choice
      fileInputRef.current.click();
    }
  };

  const handleIconFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const name = file.name;
    const isSvg = file.type === "image/svg+xml" || name.toLowerCase().endsWith(".svg");
    const isPng = file.type === "image/png" || name.toLowerCase().endsWith(".png");

    if (!isSvg && !isPng) {
      useToastStore.getState().pushToast({
        title: UI_TEXT.settings.errFileFormatNotSupported,
        description: UI_TEXT.settings.errFileFormatNotSupportedDesc,
        variant: "destructive",
      });
      return;
    }

    if (file.size > 200 * 1024) {
      useToastStore.getState().pushToast({
        title: UI_TEXT.settings.errFileSizeLimit,
        description: UI_TEXT.settings.errFileSizeLimitDesc,
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    if (isSvg) {
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const processed = preprocessSvg(text);
        setSelectedIconData({
          type: "svg",
          data: processed,
          fileName: name,
        });
      };
      reader.readAsText(file);
    } else {
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        
        // Validate PNG width/height
        const img = new Image();
        img.onload = () => {
          if (img.width > 512 || img.height > 512) {
            useToastStore.getState().pushToast({
              title: UI_TEXT.settings.errImageDimensionsLimit,
              description: UI_TEXT.settings.errImageDimensionsLimitDesc,
              variant: "destructive",
            });
            return;
          }
          setSelectedIconData({
            type: "png",
            data: dataUrl,
            fileName: name,
          });
        };
        img.onerror = () => {
          useToastStore.getState().pushToast({
            title: UI_TEXT.settings.errImageLoadFailed,
            description: UI_TEXT.settings.errImageLoadFailedDesc,
            variant: "destructive",
          });
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveIcon = () => {
    if (!formatsInput.trim()) {
      useToastStore.getState().pushToast({
        title: UI_TEXT.settings.errSaveFailed,
        description: UI_TEXT.settings.errEnterFileFormat,
        variant: "destructive",
      });
      return;
    }

    if (!selectedIconData) {
      useToastStore.getState().pushToast({
        title: UI_TEXT.settings.errSaveFailed,
        description: UI_TEXT.settings.errUploadIcon,
        variant: "destructive",
      });
      return;
    }

    const formats = formatsInput
      .split(/[,;\s]+/)
      .map((f) => f.trim().toLowerCase().replace(/^\./, ""))
      .filter(Boolean);

    if (formats.length === 0) {
      useToastStore.getState().pushToast({
        title: UI_TEXT.settings.errSaveFailed,
        description: UI_TEXT.settings.errEnterValidFileFormat,
        variant: "destructive",
      });
      return;
    }

    const newIcon: CustomFileIcon = {
      id: Date.now().toString(),
      extensions: formats,
      iconType: selectedIconData.type,
      iconData: selectedIconData.data,
      color: selectedIconData.type === "svg" ? svgColor : undefined,
    };

    saveCustomFileIcons([...customFileIcons, newIcon]);

    setFormatsInput("");
    setSelectedIconData(null);
    setSvgColor("#3b82f6");
    setAddIconOpen(false);

    useToastStore.getState().pushToast({
      title: UI_TEXT.settings.iconSaveSuccess,
      description: UI_TEXT.settings.iconSaveSuccessDesc,
      variant: "success",
    });
  };

  const handleDeleteIcon = (id: string) => {
    saveCustomFileIcons(customFileIcons.filter((item) => item.id !== id));
    useToastStore.getState().pushToast({
      title: UI_TEXT.settings.iconDeleteSuccess,
      description: UI_TEXT.settings.iconDeleteSuccessDesc,
      variant: "success",
    });
  };

  return (
    <>
      <SettingsSectionCard>
        <div className="mt-0">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {UI_TEXT.settings.autoCategory}
          </div>
          <SettingsList>
            <SettingsListItem
              title={UI_TEXT.settings.autoCategory}
              description={UI_TEXT.settings.autoCategoryDesc}
              action={
                <Switch
                  checked={draft.download.auto_categorize}
                  onCheckedChange={(checked) =>
                    updateDraft((prev) => ({
                      ...prev,
                      download: {
                        ...prev.download,
                        auto_categorize: checked,
                      },
                    }))
                  }
                />
              }
            />
          </SettingsList>

          <div className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {UI_TEXT.settings.groupClassification}
          </div>
          <DownloadRulesManager />
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard className="mt-6">
        <SettingsSectionHeader
          icon={<FileCode className="size-5" />}
          title={UI_TEXT.settings.fileIconManagement}
          description={UI_TEXT.settings.fileIconManagementDesc}
          action={
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Plus className="size-4" />}
              onClick={() => {
                setFormatsInput("");
                setSelectedIconData(null);
                setSvgColor("#3b82f6");
                setAddIconOpen(true);
              }}
              className="h-8 font-normal"
            >
              {UI_TEXT.settings.addMapping}
            </Button>
          }
        />
        
        {/* Local stylesheet for SVG scale */}
        <style>{`
          .custom-file-icon-svg svg {
            width: 100%;
            height: 100%;
            display: block;
          }
        `}</style>

        <div className="mt-5 space-y-4">
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleIconFileChange}
            accept=".png,.svg"
            className="hidden"
          />

          {/* Mappings List */}
          <div className="space-y-3">
            <span className="block text-sm font-semibold leading-5 text-foreground">
              {UI_TEXT.settings.configuredFormatIcons.replace("{count}", String(customFileIcons.length))}
            </span>
            
            {customFileIcons.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 rounded-xl border border-dashed border-border/40 bg-secondary/5 text-muted-foreground">
                <Sparkles className="size-7 mb-2 opacity-50 text-muted-foreground" />
                <span className="text-xs">{UI_TEXT.settings.noCustomIconMapping}</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {customFileIcons.map((icon) => (
                  <div
                    key={icon.id}
                    className="flex items-center justify-between p-3 border border-border/60 rounded-xl bg-secondary/10 hover:bg-secondary/20 hover:border-border transition-all gap-4"
                  >
                    {/* Left: Icon preview */}
                    <div className="size-10 shrink-0 flex items-center justify-center rounded-lg bg-card/60 border border-border/40 shadow-sm overflow-hidden">
                      {icon.iconType === "png" ? (
                        <img
                          src={icon.iconData}
                          alt="icon"
                          className="size-7 object-contain"
                        />
                      ) : (
                        <div
                          className="size-7 flex items-center justify-center custom-file-icon-svg"
                          style={icon.color ? { color: icon.color } : undefined}
                          dangerouslySetInnerHTML={{ __html: icon.iconData }}
                        />
                      )}
                    </div>

                    {/* Middle: File extensions */}
                    <div className="flex-1 min-w-0">
                      <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {UI_TEXT.settings.mappingFormat}
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {icon.extensions.map((ext) => (
                          <span
                            key={ext}
                            className="px-1.5 py-0.5 text-xs font-semibold font-mono uppercase bg-card rounded border border-border/40 text-foreground/80"
                          >
                            .{ext}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteIcon(icon.id)}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive size-8 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SettingsSectionCard>

      {/* Dialog for adding icon mapping */}
      <Dialog open={addIconOpen} onOpenChange={setAddIconOpen}>
        <DialogContent size="default" variant="modal">
          <DialogHeader>
            <DialogTitle>{UI_TEXT.settings.addFileIconMapping}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {/* Associated file formats */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {UI_TEXT.settings.associatedFileFormats}
              </label>
              <SettingsInput
                value={formatsInput}
                onChange={(e) => setFormatsInput(e.target.value)}
                placeholder={UI_TEXT.settings.associatedFileFormatsPlaceholder}
                className="w-full bg-card border-border/80 focus:border-primary/50"
              />
              <p className="text-xs text-muted-foreground/80 leading-relaxed">
                {UI_TEXT.settings.associatedFileFormatsDesc}
              </p>
            </div>

            {/* Icon File Upload */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {UI_TEXT.settings.iconFile}
              </label>
              <button
                type="button"
                onClick={handlePickIconFile}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border/80 bg-card/40 p-3 text-sm text-muted-foreground hover:bg-card/75 hover:text-foreground transition-all cursor-pointer h-10 min-w-0"
              >
                <Upload className="size-4 shrink-0" />
                <span className="truncate max-w-[280px]">
                  {selectedIconData ? selectedIconData.fileName : UI_TEXT.settings.selectIconFile}
                </span>
              </button>
              <p className="text-xs text-muted-foreground/80 leading-relaxed">
                {UI_TEXT.settings.iconFileRequirement}
              </p>
            </div>

            {/* SVG Custom Color */}
            {selectedIconData?.type === "svg" && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {UI_TEXT.settings.iconColor}
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative size-10 shrink-0 overflow-hidden rounded-lg border border-border shadow-sm">
                    <input
                      type="color"
                      value={svgColor}
                      onChange={(e) => setSvgColor(e.target.value)}
                      className="absolute -inset-2 size-[150%] cursor-pointer border-0 bg-transparent p-0"
                    />
                  </div>
                  <SettingsInput
                    value={svgColor}
                    onChange={(e) => setSvgColor(e.target.value)}
                    placeholder="#3b82f6"
                    className="max-w-[120px] font-mono text-sm uppercase bg-card"
                  />
                </div>
              </div>
            )}

            {/* Icon Preview */}
            {selectedIconData && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-secondary/15">
                <span className="text-xs text-muted-foreground font-medium">{UI_TEXT.settings.preview}</span>
                <div className="size-8 flex items-center justify-center rounded bg-card border border-border/30 overflow-hidden shrink-0">
                  {selectedIconData.type === "png" ? (
                    <img
                      src={selectedIconData.data}
                      alt="preview"
                      className="size-6 object-contain"
                    />
                  ) : (
                    <div
                      className="size-6 flex items-center justify-center custom-file-icon-svg"
                      style={{ color: svgColor }}
                      dangerouslySetInnerHTML={{ __html: selectedIconData.data }}
                    />
                  )}
                </div>
                <span className="text-xs text-muted-foreground truncate flex-1 font-medium">
                  {selectedIconData.fileName}
                </span>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setSelectedIconData(null)}
                  className="h-7 text-xs font-normal"
                >
                  {UI_TEXT.settings.clear}
                </Button>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddIconOpen(false);
                setFormatsInput("");
                setSelectedIconData(null);
              }}
            >
              {UI_TEXT.settings.cancel}
            </Button>
            <Button
              type="button"
              onClick={handleSaveIcon}
              disabled={!formatsInput.trim() || !selectedIconData}
              leftIcon={<Plus className="size-4" />}
            >
              {UI_TEXT.settings.confirmAdd}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
