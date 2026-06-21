import React from "react";
import { Link2Off, Trash2, MoreVertical, Pencil, FolderOpen, Loader2, RefreshCw } from "lucide-react";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from "@/components/ui/menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

export interface DeviceItem {
  id: string;
  name: string;
  type: string;
  status: "connected" | "disconnected" | "unknown";
  statusText: string;
  icon: React.ReactNode;
  capacity?: string;
  progress?: number; // capacity percentage
  isDeletable?: boolean;
}

interface DeviceCardProps {
  device: DeviceItem;
  isRefreshing?: boolean;
  onBrowse?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onRefresh?: (id: string) => void;
}

export default function DeviceCard({
  device,
  isRefreshing = false,
  onBrowse,
  onEdit,
  onDelete,
  onRefresh,
}: DeviceCardProps) {
  const isConnected = device.status === "connected";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          onDoubleClick={() => !isRefreshing && onBrowse && onBrowse(device.id)}
          className="group relative flex flex-col rounded-xl border border-border bg-card hover:bg-card-hover p-4 hover:border-primary/35 transition-all duration-200 w-[310px] h-[150px] shrink-0 cursor-default"
        >
          <div className="flex items-center gap-4">
        {/* Device Icon block */}
        <div className="relative shrink-0">
          <div
            className={cn(
              "flex size-14 items-center justify-center rounded-xl transition-all duration-200",
              isRefreshing
                ? "bg-primary/5 text-primary"
                : isConnected
                ? "bg-primary/10 text-primary group-hover:bg-primary/15"
                : "bg-muted/40 text-muted-foreground/60 grayscale opacity-45"
            )}
          >
            {isRefreshing ? (
              <Loader2 className="size-6 animate-spin text-primary" />
            ) : (
              device.icon
            )}
          </div>

          {/* Disconnected Overlay Badge */}
          {!isConnected && !isRefreshing && device.status !== "unknown" && (
            <div className="absolute -bottom-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full bg-destructive text-white shadow-md border-2 border-card z-10 animate-in zoom-in duration-200">
              <Link2Off className="size-3" />
            </div>
          )}
        </div>

        {/* Device Info & Status Column */}
        <div className="min-w-0 flex-1 flex items-center justify-between gap-3">
          {/* Text Info */}
          <div className="min-w-0 flex-1 space-y-1 pr-6">
            <h4 className="truncate text-sm font-bold text-foreground group-hover:text-primary transition-colors">
              {device.name}
            </h4>
            <p className="text-xs text-muted-foreground font-medium truncate">{device.type}</p>
          </div>

          {/* Status Badge (Only show when disconnected/error) */}
          <div className="flex items-center gap-2 shrink-0 select-none pr-6">
            {!isConnected && !isRefreshing && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-destructive/10 text-destructive shrink-0 cursor-help">
                    {device.statusText}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{device.statusText}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Action Menu (Delete, Edit, Browse) - Absolute positioned inside safe boundary */}
        {device.isDeletable && (onBrowse || onEdit || onDelete || onRefresh) && (
          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <Menu>
              <MenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 text-muted-foreground/60 hover:text-foreground hover:bg-muted/80 cursor-pointer rounded-lg transition-colors shrink-0"
                >
                  <MoreVertical className="size-4" />
                </Button>
              </MenuTrigger>
              <MenuContent align="end" className="w-32">
                {onBrowse && (
                  <MenuItem
                    className="gap-2 cursor-pointer"
                    onSelect={() => onBrowse(device.id)}
                    disabled={isRefreshing}
                  >
                    <FolderOpen className="size-3.5" />
                    <span>浏览文件</span>
                  </MenuItem>
                )}
                {onRefresh && (
                  <MenuItem
                    className="gap-2 cursor-pointer"
                    onSelect={() => onRefresh(device.id)}
                    disabled={isRefreshing}
                  >
                    <RefreshCw className={cn("size-3.5", isRefreshing ? "animate-spin" : "")} />
                    <span>刷新状态</span>
                  </MenuItem>
                )}
                {onEdit && (
                  <MenuItem
                    className="gap-2 cursor-pointer"
                    onSelect={() => onEdit(device.id)}
                    disabled={isRefreshing}
                  >
                    <Pencil className="size-3.5" />
                    <span>编辑设备</span>
                  </MenuItem>
                )}
                {onDelete && (
                  <MenuItem
                    className="gap-2 text-destructive focus:text-destructive cursor-pointer"
                    onSelect={() => onDelete(device.id)}
                    disabled={isRefreshing}
                  >
                    <Trash2 className="size-3.5" />
                    <span>删除设备</span>
                  </MenuItem>
                )}
              </MenuContent>
            </Menu>
          </div>
        )}
      </div>

      {/* Capacity & Progress info */}
      <div className="mt-4 space-y-2">
        <div className="flex justify-between items-center text-xs">
          <span className="text-muted-foreground">存储容量</span>
          <span className="font-semibold text-foreground font-mono">
            {isRefreshing ? "正在获取..." : device.capacity}
          </span>
        </div>

        {isConnected && !isRefreshing && device.progress != null ? (
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
      </TooltipTrigger>
      <TooltipContent>双击浏览设备文件</TooltipContent>
    </Tooltip>
  );
}
