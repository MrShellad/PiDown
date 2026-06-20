import { useState } from "react";
import {
  Server,
  Cloud,
  Smartphone,
  Tablet,
  HardDrive,
  Link2Off,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageHeaderToolbar } from "@/components/ui/toolbar";

interface DeviceItem {
  id: string;
  name: string;
  type: string;
  status: "connected" | "disconnected";
  statusText: string;
  icon: React.ReactNode;
  capacity?: string;
  progress?: number; // capacity percentage
}

export default function DevicesDashboard() {
  const [refreshing, setRefreshing] = useState(false);

  const initialDevices: DeviceItem[] = [
    {
      id: "webdav",
      name: "坚果云 WebDAV",
      type: "WebDAV 存储驱动",
      status: "connected",
      statusText: "已连接",
      icon: <Server className="size-7" />,
      capacity: "124 GB / 250 GB",
      progress: 49.6,
    },
    {
      id: "baidu",
      name: "个人百度网盘",
      type: "云端网络存储",
      status: "disconnected",
      statusText: "已断开连接",
      icon: <Cloud className="size-7" />,
      capacity: "——",
    },
    {
      id: "iphone",
      name: "fakba's iPhone",
      type: "iPhone 智能手机",
      status: "connected",
      statusText: "已连接",
      icon: <Smartphone className="size-7" />,
      capacity: "88 GB / 256 GB",
      progress: 34.3,
    },
    {
      id: "ipad",
      name: "iPad Pro 11",
      type: "iPad 平板设备",
      status: "disconnected",
      statusText: "已断开连接",
      icon: <Tablet className="size-7" />,
      capacity: "——",
    },
    {
      id: "nas",
      name: "极空间 Z4 Pro",
      type: "网络附加存储 (NAS)",
      status: "connected",
      statusText: "已连接",
      icon: <HardDrive className="size-7" />,
      capacity: "3.4 TB / 8.0 TB",
      progress: 42.5,
    },
  ];

  const [devices, setDevices] = useState<DeviceItem[]>(initialDevices);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      // Randomize statuses slightly for interactive feedback
      setDevices((prev) =>
        prev.map((d) => {
          if (d.id === "iphone") {
            const nextStatus = d.status === "connected" ? "disconnected" : "connected";
            return {
              ...d,
              status: nextStatus,
              statusText: nextStatus === "connected" ? "已连接" : "已断开连接",
              capacity: nextStatus === "connected" ? "88 GB / 256 GB" : "——",
            };
          }
          return d;
        })
      );
    }, 850);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-5 p-6 relative select-none">
      {/* Header Panel */}
      <div className="shrink-0 px-3">
        <PageHeaderToolbar
          title="我的设备"
          description="查看并管理已配对的跨端同步设备与云端存储驱动"
          rightActions={
            <div className="flex items-center gap-3 px-5 shrink-0 ml-auto self-stretch">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleRefresh}
                className={`text-muted-foreground hover:text-foreground ${refreshing ? "animate-spin" : ""}`}
                title="刷新连接状态"
              >
                <RefreshCw className="size-4" />
              </Button>

              <Button variant="outline" size="sm" className="gap-1.5 font-semibold">
                <Plus className="size-4" />
                添加设备
              </Button>
            </div>
          }
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 bg-card/25 rounded-xl border border-border/80 overflow-hidden flex flex-col mx-3">
        <ScrollArea className="flex-1" viewportClassName="p-6">
          <div className="flex flex-wrap gap-5 justify-center">
            {devices.map((device) => {
              const isConnected = device.status === "connected";
              return (
                <div
                  key={device.id}
                  className="group relative flex flex-col rounded-xl border border-border bg-card p-5 hover:border-primary/35 transition-colors duration-200 w-[310px] h-[160px] shrink-0"
                >
                  <div className="flex items-start gap-4">
                    {/* Device Icon block */}
                    <div className="relative">
                      <div
                        className={`flex size-14 items-center justify-center rounded-xl transition-all duration-200 ${
                          isConnected
                            ? "bg-primary/10 text-primary group-hover:bg-primary/15"
                            : "bg-muted/40 text-muted-foreground/60 grayscale opacity-45"
                        }`}
                      >
                        {device.icon}
                      </div>

                      {/* Disconnected Overlay Badge */}
                      {!isConnected && (
                        <div className="absolute -bottom-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full bg-destructive text-white shadow-md border-2 border-card z-10 animate-in zoom-in duration-200">
                          <Link2Off className="size-3" />
                        </div>
                      )}
                    </div>

                    {/* Device Info */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="truncate text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                          {device.name}
                        </h4>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
                            isConnected
                              ? "bg-green-500/10 text-green-500"
                              : "bg-destructive/10 text-destructive"
                          }`}
                        >
                          {device.statusText}
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground font-medium">{device.type}</p>
                    </div>
                  </div>

                  {/* Capacity & Progress info */}
                  <div className="mt-5 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">存储容量</span>
                      <span className="font-semibold text-foreground font-mono">
                        {device.capacity}
                      </span>
                    </div>

                    {isConnected && device.progress != null ? (
                      <div className="relative h-1.5 w-full rounded-full bg-secondary/80 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${device.progress}%` }}
                        />
                      </div>
                    ) : (
                      <div className="h-1.5 w-full rounded-full bg-secondary/30" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
