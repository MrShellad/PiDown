import { useState, useCallback } from "react";
import {
  Server,
  Plus,
  RefreshCw,
  ChevronRight,
  Loader2,
  Cpu,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageHeaderToolbar } from "@/components/ui/toolbar";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from "@/components/ui/menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { useWebDavDevices } from "@/hooks/useWebDavDevices";
import type { WebDavDevice } from "@/core/bridge/tauri-commands";
import DeviceCard from "./DeviceCard";
import type { DeviceItem } from "./DeviceCard";
import WebDavDeviceDialog from "./WebDavDeviceDialog";
import WebDavFileBrowser from "./WebDavFileBrowser";

export default function DevicesDashboard() {
  const webDav = useWebDavDevices();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<WebDavDevice | null>(null);
  const [deviceToDelete, setDeviceToDelete] = useState<DeviceItem | null>(null);
  const [activeBrowsingDevice, setActiveBrowsingDevice] = useState<WebDavDevice | null>(null);

  const handleRefresh = useCallback(async () => {
    await webDav.fetchDevices(true);
  }, [webDav]);

  const handleOpenAddDialog = useCallback(() => {
    setEditingDevice(null);
    setDialogOpen(true);
  }, []);

  const handleOpenEditDialog = useCallback((id: string) => {
    const dev = webDav.devices.find((d) => d.id === id);
    if (dev) {
      setEditingDevice(dev);
      setDialogOpen(true);
    }
  }, [webDav.devices]);

  const handleOpenDeleteConfirm = useCallback((id: string) => {
    const devItem = realWebDavItems.find((item) => item.id === id);
    if (devItem) {
      setDeviceToDelete(devItem);
    }
  }, [webDav.devices]);

  const handleBrowseDevice = useCallback((id: string) => {
    const dev = webDav.devices.find((d) => d.id === id);
    if (dev) {
      setActiveBrowsingDevice(dev);
    }
  }, [webDav.devices]);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingDevice(null);
    }
  }, []);

  // Map real database WebDAV devices to DeviceItem format
  const realWebDavItems: DeviceItem[] = webDav.devices.map((d) => ({
    id: d.id,
    name: d.name,
    type: d.type_name,
    status: d.status,
    statusText: d.status_text,
    icon: <Server className="size-7" />,
    capacity: d.capacity,
    progress: d.progress ?? undefined,
    isDeletable: true,
  }));

  // If a device is currently being browsed, render the File Browser view
  if (activeBrowsingDevice) {
    return (
      <WebDavFileBrowser
        device={activeBrowsingDevice}
        onBack={() => {
          setActiveBrowsingDevice(null);
          // Refresh devices when returning to load latest status/quota
          webDav.fetchDevices();
        }}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-5 p-6 relative select-none">
      {/* Header Panel */}
      <div className="shrink-0 px-3">
        <PageHeaderToolbar
          title="我的设备"
          description="查看并管理已配对的跨端同步设备与云端存储驱动"
          rightActions={
            <div className="flex items-center gap-3 px-5 shrink-0 ml-auto self-stretch">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleRefresh}
                    className={`text-muted-foreground hover:text-foreground border border-border/50 hover:border-border cursor-pointer ${
                      webDav.refreshing ? "animate-spin" : ""
                    }`}
                    disabled={webDav.loading || webDav.refreshing}
                  >
                    <RefreshCw className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>刷新连接状态</TooltipContent>
              </Tooltip>

              <Menu>
                <MenuTrigger asChild>
                  <Button variant="secondary" size="sm" className="gap-1.5 font-semibold border border-border/60 cursor-pointer">
                    <Plus className="size-4" />
                    添加设备
                  </Button>
                </MenuTrigger>
                <MenuContent align="end" className="w-64">
                  <MenuItem
                    className="gap-3 py-3 px-3 cursor-pointer"
                    onSelect={handleOpenAddDialog}
                  >
                    <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                      <Server className="size-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-foreground">WebDAV</div>
                      <div className="text-xs text-muted-foreground mt-0.5">坚果云、Alist、群晖等</div>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground/60 shrink-0" />
                  </MenuItem>
                  <MenuItem disabled className="gap-3 py-3 px-3 opacity-60">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground shrink-0">
                      <Cpu className="size-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground/70">其他端设备</div>
                      <div className="text-xs text-muted-foreground mt-0.5">多端文件互传与备份</div>
                    </div>
                    <span className="text-[10px] font-bold tracking-wider text-muted-foreground/70 bg-muted rounded-full px-2 py-0.5 shrink-0 uppercase">
                      Soon
                    </span>
                  </MenuItem>
                </MenuContent>
              </Menu>
            </div>
          }
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 bg-card/25 rounded-xl border border-border/80 overflow-hidden flex flex-col mx-3">
        {webDav.loading && !webDav.refreshing ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-5 animate-spin" />
            <span>正在加载设备状态...</span>
          </div>
        ) : realWebDavItems.length === 0 ? (
          // Beautiful Empty State
          <div className="flex flex-1 flex-col items-center justify-center text-center p-8 max-w-md mx-auto">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-muted/50 text-muted-foreground border border-border mb-6">
              <Server className="size-8 opacity-60" />
            </div>
            <h3 className="text-base font-bold text-foreground mb-2">暂无已连接设备</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6 whitespace-nowrap">
              配置 WebDAV 云端存储设备，实现跨端数据同步、云盘导出及远程文件备份管理。
            </p>
            <Button onClick={handleOpenAddDialog} className="gap-2 font-semibold">
              <Plus className="size-4" />
              配置首个存储设备
            </Button>
          </div>
        ) : (
          <ScrollArea className="flex-1" viewportClassName="p-6">
            <div className="flex flex-wrap gap-5 justify-center">
              {realWebDavItems.map((device) => (
                <DeviceCard
                  key={device.id}
                  device={device}
                  isRefreshing={!!webDav.deviceRefreshing[device.id]}
                  onBrowse={handleBrowseDevice}
                  onEdit={handleOpenEditDialog}
                  onDelete={handleOpenDeleteConfirm}
                  onRefresh={webDav.refreshDeviceStatus}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Add/Edit WebDAV Dialog */}
      <WebDavDeviceDialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        onSave={webDav.saveDevice}
        initialDevice={editingDevice}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deviceToDelete} onOpenChange={(open) => !open && setDeviceToDelete(null)}>
        <DialogContent size="sm" showCloseButton>
          <DialogHeader>
            <div className="flex size-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <Trash2 className="size-5" />
            </div>
            <DialogTitle>删除设备确认</DialogTitle>
            <DialogDescription>
              确定要删除设备“{deviceToDelete?.name}”吗？
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-muted-foreground leading-relaxed">
              此操作将永久清除该设备的本地连接配置与同步状态，无法撤销。
            </p>
          </DialogBody>
          <DialogFooter className="sm:justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setDeviceToDelete(null)}
              className="border border-border/60"
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (deviceToDelete) {
                  await webDav.deleteDevice(deviceToDelete.id);
                  setDeviceToDelete(null);
                }
              }}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
