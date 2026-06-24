import { Folder, File, X, Check, Loader2, HardDriveUpload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface ClipboardItem {
  name: string;
  path: string;
  is_dir: boolean;
  operation: "copy" | "move";
  deviceId: string;
  status: "idle" | "pasting" | "success" | "error";
  progress: number;
  errorMsg?: string;
}

interface WebDavClipboardDrawerProps {
  clipboardItems: ClipboardItem[];
  setClipboardItems: React.Dispatch<React.SetStateAction<ClipboardItem[]>>;
  drawerExpanded: boolean;
  setDrawerExpanded: (expanded: boolean) => void;
  isPasting: boolean;
  handlePaste: () => void;
}

export default function WebDavClipboardDrawer({
  clipboardItems,
  setClipboardItems,
  drawerExpanded,
  setDrawerExpanded,
  isPasting,
  handlePaste,
}: WebDavClipboardDrawerProps) {
  if (clipboardItems.length === 0) return null;

  return (
    <div className="absolute right-4 bottom-4 z-45 flex flex-col items-end">
      {!drawerExpanded ? (
        <Button
          onClick={() => setDrawerExpanded(true)}
          className="shadow-lg rounded-full h-12 px-5 bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 cursor-pointer transition-all duration-300 transform hover:scale-105"
        >
          <HardDriveUpload className="size-5 animate-bounce" />
          <span className="font-bold text-sm">剪贴板 ({clipboardItems.length})</span>
        </Button>
      ) : (
        <div className="w-80 max-h-96 bg-background border border-border shadow-2xl rounded-xl flex flex-col overflow-hidden transition-all duration-300">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-secondary/80 border-b border-border select-none">
            <div className="flex items-center gap-2">
              <HardDriveUpload className="size-4 text-primary" />
              <span className="font-bold text-sm text-foreground">剪贴板收纳柜</span>
              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold">
                {clipboardItems.length}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setDrawerExpanded(false)}
              className="size-7 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="size-4" />
            </Button>
          </div>

          {/* Items List */}
          <div className="flex-1 overflow-auto p-3 space-y-2.5 max-h-60 animate-in fade-in-50 slide-in-from-bottom-5 duration-200">
            {clipboardItems.map((item) => {
              const isCopy = item.operation === 'copy';
              const isPastingItem = item.status === 'pasting';
              const isSuccessItem = item.status === 'success';
              const isErrorItem = item.status === 'error';

              return (
                <div key={item.path} className="flex items-center justify-between gap-3 p-2 bg-muted/30 border border-border/40 hover:border-border/80 rounded-lg transition-colors group">
                  <div className="relative size-8 shrink-0 flex items-center justify-center bg-background border border-border/50 rounded-lg">
                    {item.is_dir ? (
                      <Folder className="size-4 text-primary/70 fill-primary/30" />
                    ) : (
                      <File className="size-4 text-muted-foreground/60" />
                    )}

                    {/* Circular Progress Overlay */}
                    {isPastingItem && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/90 rounded-lg">
                        <svg className="w-8 h-8 transform -rotate-90">
                          <circle
                            cx="16"
                            cy="16"
                            r="12"
                            className="stroke-muted"
                            strokeWidth="2"
                            fill="transparent"
                          />
                          <circle
                            cx="16"
                            cy="16"
                            r="12"
                            className="stroke-primary transition-all duration-300"
                            strokeWidth="2"
                            fill="transparent"
                            strokeDasharray={2 * Math.PI * 12}
                            strokeDashoffset={2 * Math.PI * 12 - (item.progress / 100) * (2 * Math.PI * 12)}
                            strokeLinecap="round"
                          />
                        </svg>
                        <span className="absolute text-[8px] font-bold">{Math.round(item.progress)}%</span>
                      </div>
                    )}

                    {/* Success Overlay */}
                    {isSuccessItem && (
                      <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500 rounded-lg animate-in fade-in-50 zoom-in-75">
                        <Check className="size-4 text-emerald-500 font-bold" />
                      </div>
                    )}

                    {/* Error Overlay */}
                    {isErrorItem && (
                      <div className="absolute inset-0 flex items-center justify-center bg-rose-500/10 dark:bg-rose-500/20 border border-rose-500 rounded-lg">
                        <X className="size-4 text-rose-500 font-bold" />
                      </div>
                    )}
                  </div>

                  {/* File Name & Path */}
                  <div className="flex-1 min-w-0 flex flex-col">
                    <span className="text-xs font-semibold text-foreground truncate">{item.name}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-[9px] text-muted-foreground/75 truncate mt-0.5 cursor-help">
                          {item.path}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="text-[10px] break-all max-w-[240px]" side="left">
                        {item.path}
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {/* Badge / Action */}
                  <div className="flex items-center gap-1.5 shrink-0 select-none">
                    <span className={cn(
                      "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase",
                      isCopy ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/10" : "bg-indigo-500/15 text-indigo-500 border border-indigo-500/10"
                    )}>
                      {isCopy ? "复制" : "移动"}
                    </span>
                    
                    {!isPasting && !isSuccessItem && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => {
                          setClipboardItems(prev => prev.filter(i => i.path !== item.path));
                        }}
                        className="size-6 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded-md cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="size-3" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Actions */}
          <div className="px-4 py-3 bg-secondary/30 border-t border-border flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClipboardItems([])}
              disabled={isPasting}
              className="text-xs font-semibold cursor-pointer py-1.5 h-8 bg-transparent"
            >
              清空
            </Button>
            <Button
              size="sm"
              onClick={handlePaste}
              disabled={isPasting || clipboardItems.every(i => i.status === 'success')}
              className="text-xs font-semibold cursor-pointer py-1.5 h-8 gap-1.5 flex-1 shadow-md font-bold"
            >
              {isPasting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>粘贴中...</span>
                </>
              ) : (
                <>
                  <HardDriveUpload className="size-3.5" />
                  <span>开始粘贴</span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
