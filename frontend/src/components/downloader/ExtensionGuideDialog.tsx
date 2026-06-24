import { useState, useEffect } from "react";
import { FolderOpen, Copy, Globe, Check, ExternalLink, Sparkles, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppSettingsStore } from "@/core/store/useAppSettingsStore";
import { useToastStore } from "@/core/store/useToastStore";
import { UI_TEXT } from "@/core/locale";
import { invoke } from "@tauri-apps/api/core";

export default function ExtensionGuideDialog() {
  const settings = useAppSettingsStore((state) => state.settings);
  const saveSettings = useAppSettingsStore((state) => state.save);

  const [open, setOpen] = useState(false);
  const [extPath, setExtPath] = useState("");
  const [copied, setCopied] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);

  // Show guide dialog if show_extension_guide setting is true
  useEffect(() => {
    if (settings?.interface?.show_extension_guide) {
      setOpen(true);
      // Get local extension path from backend
      invoke<string>("get_extension_directory_path")
        .then((path) => setExtPath(path))
        .catch((err) => console.error("Failed to get extension path:", err));
    }
  }, [settings?.interface?.show_extension_guide]);

  const handleOpenDir = async () => {
    try {
      await invoke("open_extension_directory");
    } catch (err) {
      console.error("Failed to open extension directory:", err);
    }
  };

  const handleCopyPath = async () => {
    if (!extPath) return;
    try {
      await navigator.clipboard.writeText(extPath);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy path:", err);
    }
  };

  const handleOpenWebStore = () => {
    invoke("open_url", { url: "https://chromewebstore.google.com/detail/pidownloader-download-bri/hngdojmldgfhhagakfehglbilofpiapd" }).catch((err) =>
      console.error("Failed to open web store link:", err)
    );
  };

  const handleDownloadZip = async () => {
    setDownloadingZip(true);
    try {
      const response = await fetch("/chrome-extension.zip");
      if (!response.ok) {
        throw new Error("Failed to fetch chrome-extension.zip");
      }
      const arrayBuffer = await response.arrayBuffer();
      const fileBytes = Array.from(new Uint8Array(arrayBuffer));

      const savedPath = await invoke<string | null>("save_extension_zip", {
        fileBytes,
      });

      if (savedPath) {
        useToastStore.getState().pushToast({
          variant: "success",
          title: UI_TEXT.extensionGuide.title,
          description: UI_TEXT.extensionGuide.zipSaved.replace("%s", savedPath),
        });
      }
    } catch (err) {
      console.error("Failed to save extension zip:", err);
      useToastStore.getState().pushToast({
        variant: "destructive",
        title: "Export Failed",
        description: String(err),
      });
    } finally {
      setDownloadingZip(false);
    }
  };

  const handleClose = async () => {
    setOpen(false);
    if (settings) {
      // Save show_extension_guide setting if the user checked "don't show again"
      const nextSettings = {
        ...settings,
        interface: {
          ...settings.interface,
          show_extension_guide: !dontShowAgain,
        },
      };
      await saveSettings(nextSettings).catch((err) => console.error(err));
    }
  };

  const handleOpenExtensionsPage = () => {
    invoke("open_url", { url: "chrome://extensions/" }).catch((err) =>
      console.error("Failed to open url:", err)
    );
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) handleClose(); }}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] flex flex-col p-6 backdrop-blur-md bg-background/90 border border-border/60 shadow-2xl rounded-2xl overflow-hidden">
        <DialogHeader className="space-y-3 pb-2 border-b border-border/40">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent">
            <Sparkles className="size-5 text-primary animate-pulse" />
            {UI_TEXT.extensionGuide.title}
          </DialogTitle>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {UI_TEXT.extensionGuide.description}
          </p>
        </DialogHeader>

        <DialogBody className="flex-1 overflow-y-auto space-y-6 py-4 pr-1 select-text">
          <Tabs defaultValue="online" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-5">
              <TabsTrigger value="online" className="py-2">{UI_TEXT.extensionGuide.tabOnline}</TabsTrigger>
              <TabsTrigger value="local" className="py-2">{UI_TEXT.extensionGuide.tabLocal}</TabsTrigger>
            </TabsList>

            <TabsContent value="online" className="space-y-4 outline-none">
              {/* Online Step 1 */}
              <div className="space-y-3 p-4 bg-muted/30 hover:bg-muted/40 transition-colors border border-border/40 rounded-xl">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <span className="flex items-center justify-center size-6 bg-primary/10 text-primary rounded-full text-xs font-bold">1</span>
                  {UI_TEXT.extensionGuide.onlineStep1Title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {UI_TEXT.extensionGuide.onlineStep1Desc}
                </p>
                <div className="pt-1">
                  <Button size="sm" onClick={handleOpenWebStore} className="h-8 gap-1.5 text-xs bg-gradient-to-r from-primary to-violet-500 hover:from-primary/90 hover:to-violet-500/90 text-primary-foreground font-semibold">
                    <Globe className="size-3.5" />
                    {UI_TEXT.extensionGuide.btnInstallOnline}
                    <ExternalLink className="size-3" />
                  </Button>
                </div>
              </div>

              {/* Online Step 2 */}
              <div className="space-y-3 p-4 bg-muted/30 hover:bg-muted/40 transition-colors border border-border/40 rounded-xl">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <span className="flex items-center justify-center size-6 bg-primary/10 text-primary rounded-full text-xs font-bold">2</span>
                  {UI_TEXT.extensionGuide.step3Title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {UI_TEXT.extensionGuide.step3Desc}
                </p>
              </div>
            </TabsContent>

            <TabsContent value="local" className="space-y-4 outline-none">
              {/* Local Step 1 */}
              <div className="space-y-3 p-4 bg-muted/30 hover:bg-muted/40 transition-colors border border-border/40 rounded-xl">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <span className="flex items-center justify-center size-6 bg-primary/10 text-primary rounded-full text-xs font-bold">1</span>
                  {UI_TEXT.extensionGuide.step1Title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {UI_TEXT.extensionGuide.step1Desc}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button size="sm" onClick={handleDownloadZip} disabled={downloadingZip} className="h-8 gap-1.5 text-xs bg-gradient-to-r from-primary to-violet-500 hover:from-primary/90 hover:to-violet-500/90 text-primary-foreground font-semibold">
                    <Download className="size-3.5" />
                    {UI_TEXT.extensionGuide.btnDownloadZip}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleOpenDir} className="h-8 gap-1.5 text-xs">
                    <FolderOpen className="size-3.5" />
                    {UI_TEXT.extensionGuide.btnOpenDir}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleCopyPath} className="h-8 gap-1.5 text-xs">
                    {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
                    {copied ? UI_TEXT.extensionGuide.pathCopied : UI_TEXT.extensionGuide.btnCopyPath}
                  </Button>
                </div>
                {extPath && (
                  <div className="text-[10px] font-mono bg-muted/60 p-2 rounded border border-border/20 text-muted-foreground select-all break-all">
                    {extPath}
                  </div>
                )}
              </div>

              {/* Local Step 2 */}
              <div className="space-y-3 p-4 bg-muted/30 hover:bg-muted/40 transition-colors border border-border/40 rounded-xl">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <span className="flex items-center justify-center size-6 bg-primary/10 text-primary rounded-full text-xs font-bold">2</span>
                  {UI_TEXT.extensionGuide.step2Title}
                </h3>
                <div className="text-xs text-muted-foreground space-y-1.5 leading-relaxed whitespace-pre-line">
                  {UI_TEXT.extensionGuide.step2Desc}
                </div>
                <button
                  onClick={handleOpenExtensionsPage}
                  className="inline-flex items-center justify-center rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-3 gap-1.5"
                >
                  <Globe className="size-3.5" />
                  {UI_TEXT.extensionGuide.btnOpenChromeExtensions}
                  <ExternalLink className="size-3" />
                </button>
              </div>

              {/* Local Step 3 */}
              <div className="space-y-3 p-4 bg-muted/30 hover:bg-muted/40 transition-colors border border-border/40 rounded-xl">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <span className="flex items-center justify-center size-6 bg-primary/10 text-primary rounded-full text-xs font-bold">3</span>
                  {UI_TEXT.extensionGuide.step3Title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {UI_TEXT.extensionGuide.step3Desc}
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </DialogBody>

        <DialogFooter className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-border/40">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="dont-show-guide"
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(!!checked)}
            />
            <label
              htmlFor="dont-show-guide"
              className="text-xs font-medium leading-none text-muted-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              {UI_TEXT.extensionGuide.dontShowAgain}
            </label>
          </div>
          <Button onClick={handleClose} size="sm" className="w-full sm:!w-auto sm:px-6 h-9 font-semibold">
            {UI_TEXT.extensionGuide.btnClose}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
