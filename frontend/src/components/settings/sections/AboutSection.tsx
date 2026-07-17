import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getVersion } from "@tauri-apps/api/app";
import {
  openUrl,
} from "@/core/bridge/tauri-commands";
import { check } from "@tauri-apps/plugin-updater";
import { useToastStore } from "@/core/store/useToastStore";
import { SettingsSectionCard } from "../SettingsPrimitives";
import logoPng from "@/assets/logopng.png";

interface AboutSectionProps {}

function CheckForUpdatesButton({ currentVersion }: { currentVersion: string }) {
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [updating, setUpdating] = useState(false);

  const handleCheck = async () => {
    setChecking(true);
    try {
      const update = await check();
      setChecking(false);
      if (update) {
        setUpdateInfo(update);
      } else {
        useToastStore.getState().pushToast({
          title: "已是最新版本",
          description: `当前版本 v${currentVersion} 已是最新版本。`,
          variant: "success",
        });
      }
    } catch (error) {
      setChecking(false);
      console.error("Failed to check for updates:", error);
      useToastStore.getState().pushToast({
        title: "检查更新失败",
        description: "未检测到有效的更新源或网络错误。请确保在 tauri.conf.json 中正确配置了 updater 的 json 地址和公钥。",
        variant: "destructive",
      });
    }
  };

  const handleInstallUpdate = async () => {
    if (!updateInfo) return;
    setUpdating(true);
    try {
      await updateInfo.downloadAndInstall();
    } catch (err: any) {
      console.error("Failed to install update:", err);
      setUpdating(false);
      useToastStore.getState().pushToast({
        title: "更新失败",
        description: err?.message || "下载或安装更新包时出错，请稍后重试。",
        variant: "destructive",
      });
      setUpdateInfo(null);
    }
  };

  return (
    <>
      <Button
        onClick={handleCheck}
        loading={checking}
        loadingText="正在检查更新..."
        className="px-6"
      >
        检查更新
      </Button>

      <Dialog open={!!updateInfo} onOpenChange={() => !updating && setUpdateInfo(null)}>
        <DialogContent size="sm" variant="modal">
          <DialogHeader>
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </div>
            <DialogTitle>发现新版本</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <DialogDescription className="text-left text-muted-foreground">
              有新的客户端版本可用！
            </DialogDescription>
            <div className="rounded-lg bg-secondary/20 p-4 text-xs space-y-2 text-left font-mono">
              <div className="flex justify-between">
                <span className="text-muted-foreground">当前版本:</span>
                <span className="font-semibold">v{currentVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">最新版本:</span>
                <span className="font-semibold text-primary font-bold">v{updateInfo?.version}</span>
              </div>
              {updateInfo?.date && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">发布日期:</span>
                  <span>{updateInfo.date}</span>
                </div>
              )}
              {updateInfo?.body && (
                <div className="mt-2 border-t border-border/40 pt-2">
                  <div className="text-muted-foreground mb-1">更新日志:</div>
                  <div className="max-h-32 overflow-y-auto whitespace-pre-wrap font-sans text-muted-foreground text-[11px] leading-relaxed">
                    {updateInfo.body}
                  </div>
                </div>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateInfo(null)} disabled={updating}>
              暂不更新
            </Button>
            <Button
              loading={updating}
              loadingText="正在下载并安装..."
              onClick={handleInstallUpdate}
            >
              立即更新并重启
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function AboutSection({}: AboutSectionProps) {
  const [version, setVersion] = useState("0.0.4");

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch((err: any) => {
        console.warn("Failed to get version from Tauri, using fallback:", err);
      });
  }, []);

  return (
    <SettingsSectionCard>
      <div className="mt-4 flex flex-col items-center justify-center text-center">
        {/* Centered Logo */}
        <div className="relative flex size-24 items-center justify-center mb-5 select-none">
          <img src={logoPng} alt="PiDownloader Logo" className="size-24 object-contain rounded-2xl" />
        </div>

        {/* Title & Description */}
        <h3 className="text-2xl font-bold text-foreground tracking-wide">PiDownloader</h3>
        <p className="mt-1 text-sm text-muted-foreground font-medium">桌面多线程加速下载器</p>

        {/* Metadata Box */}
        <div className="mt-6 w-full max-w-sm rounded-xl border border-border bg-secondary/10 p-5 space-y-3.5 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">客户端版本</span>
            <span className="font-semibold text-foreground font-mono">v{version}</span>
          </div>
          <div className="flex justify-between items-center border-t border-border/40 pt-3">
            <span className="text-muted-foreground">下载核心引擎</span>
            <span className="font-semibold text-foreground font-mono">gosh-dl v0.4.0</span>
          </div>
          <div className="flex justify-between items-center border-t border-border/40 pt-3">
            <span className="text-muted-foreground">开源项目</span>
            <a
              href="https://github.com/MrShellad/PiDown"
              onClick={(e) => {
                e.preventDefault();
                openUrl("https://github.com/MrShellad/PiDown");
              }}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 font-medium text-primary hover:underline"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                <path d="M9 18c-4.51 2-5-2-7-2" />
              </svg>
              MrShellad/PiDown
            </a>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-8">
          <CheckForUpdatesButton currentVersion={version} />
        </div>
      </div>
    </SettingsSectionCard>
  );
}
