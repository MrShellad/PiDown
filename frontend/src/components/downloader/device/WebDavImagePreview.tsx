import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { ChevronLeft, ChevronRight, FileImage, ZoomIn, ZoomOut, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { WebDavFile } from "@/core/bridge/tauri-commands";
import { cn } from "@/lib/utils";

interface WebDavImagePreviewProps {
  currentPlayingFile: WebDavFile;
  setCurrentPlayingFile: (file: WebDavFile | null) => void;
  setPreviewMode: (mode: "none" | "dialog" | "page") => void;
  imageFiles: WebDavFile[];
  getPlayUrl: (file: WebDavFile) => string;
  formatFileSize: (bytes: number) => string;
}

export default function WebDavImagePreview({
  currentPlayingFile,
  setCurrentPlayingFile,
  setPreviewMode,
  imageFiles,
  getPlayUrl,
  formatFileSize,
}: WebDavImagePreviewProps) {
  // Zoom and dragging state encapsulated inside this component
  const [imageZoomScale, setImageZoomScale] = useState<number>(1);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // Blob URL Cache to enable instant back-and-forth switching
  const [currentBlobUrl, setCurrentBlobUrl] = useState<string>("");
  const [imageLoading, setImageLoading] = useState(false);
  const blobCache = useRef<Map<string, string>>(new Map());
  const loadingPromises = useRef<Map<string, Promise<string>>>(new Map());

  const loadAndCache = useCallback(async (file: WebDavFile) => {
    const url = getPlayUrl(file);
    if (blobCache.current.has(url)) {
      return blobCache.current.get(url)!;
    }
    if (loadingPromises.current.has(url)) {
      return loadingPromises.current.get(url)!;
    }

    const promise = (async () => {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        blobCache.current.set(url, blobUrl);
        return blobUrl;
      } catch (e) {
        console.error("Failed to preload WebDAV image blob:", e);
        throw e;
      } finally {
        loadingPromises.current.delete(url);
      }
    })();

    loadingPromises.current.set(url, promise);
    return promise;
  }, [getPlayUrl]);

  useEffect(() => {
    const idx = imageFiles.findIndex(f => f.path === currentPlayingFile.path);
    if (idx === -1) return;

    setImageLoading(true);

    const activeFile = imageFiles[idx];
    const activeUrl = getPlayUrl(activeFile);

    if (blobCache.current.has(activeUrl)) {
      setCurrentBlobUrl(blobCache.current.get(activeUrl)!);
    } else {
      // Prioritize loading active image immediately using original proxy stream
      setCurrentBlobUrl(activeUrl);
      loadAndCache(activeFile).then((blobUrl) => {
        if (currentPlayingFile.path === activeFile.path) {
          setCurrentBlobUrl(blobUrl);
        }
      }).catch(console.error);
    }

    // Preload the next 5 images in background
    for (let i = 1; i <= 5; i++) {
      if (idx + i < imageFiles.length) {
        loadAndCache(imageFiles[idx + i]).catch(console.error);
      }
    }
  }, [currentPlayingFile, imageFiles, getPlayUrl, loadAndCache]);

  useEffect(() => {
    return () => {
      // Revoke all Blob URLs to prevent memory leaks when user closes preview window
      blobCache.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      blobCache.current.clear();
      loadingPromises.current.clear();
    };
  }, []);

  const currentImageUrl = currentBlobUrl || getPlayUrl(currentPlayingFile);
  const prevDisabled = useMemo(() => imageFiles.findIndex(f => f.path === currentPlayingFile.path) <= 0, [imageFiles, currentPlayingFile]);
  const nextDisabled = useMemo(() => {
    const idx = imageFiles.findIndex(f => f.path === currentPlayingFile.path);
    return idx === -1 || idx >= imageFiles.length - 1;
  }, [imageFiles, currentPlayingFile]);

  const handlePrevImage = useCallback(() => {
    const idx = imageFiles.findIndex(f => f.path === currentPlayingFile.path);
    if (idx > 0) {
      setCurrentPlayingFile(imageFiles[idx - 1]);
      setImageZoomScale(1);
      setImageOffset({ x: 0, y: 0 });
    }
  }, [imageFiles, currentPlayingFile, setCurrentPlayingFile]);

  const handleNextImage = useCallback(() => {
    const idx = imageFiles.findIndex(f => f.path === currentPlayingFile.path);
    if (idx >= 0 && idx < imageFiles.length - 1) {
      setCurrentPlayingFile(imageFiles[idx + 1]);
      setImageZoomScale(1);
      setImageOffset({ x: 0, y: 0 });
    }
  }, [imageFiles, currentPlayingFile, setCurrentPlayingFile]);

  const handleZoomIn = useCallback(() => {
    setImageZoomScale(prev => Math.min(5, prev + 0.25));
  }, []);

  const handleZoomOut = useCallback(() => {
    setImageZoomScale(prev => {
      const next = Math.max(0.5, prev - 0.25);
      if (next <= 1) {
        setImageOffset({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  const handleZoomReset = useCallback(() => {
    setImageZoomScale(1);
    setImageOffset({ x: 0, y: 0 });
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLImageElement>) => {
    if (imageZoomScale <= 1) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX - imageOffset.x, y: e.clientY - imageOffset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLImageElement>) => {
    if (!isDragging) return;
    const newX = e.clientX - dragStart.current.x;
    const newY = e.clientY - dragStart.current.y;
    setImageOffset({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLImageElement>) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-5 p-6 relative select-none">
      {/* Combined Solid Toolbar */}
      <div className="shrink-0 bg-toolbar border border-border rounded-xl p-2.5 flex items-center justify-between gap-4 mx-3 shadow-sm">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Button
            variant="secondary"
            size="default"
            onClick={() => {
              setPreviewMode("none");
              setCurrentPlayingFile(null);
            }}
            className="gap-1 font-bold border border-border px-3 shrink-0 h-9 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <ChevronLeft className="size-4.5" />
            返回文件
          </Button>
          <div className="h-5 w-px bg-border shrink-0 mx-0.5" />
          <span className="text-sm font-semibold truncate text-foreground flex-1">
            正在预览：{currentPlayingFile.name}
          </span>
        </div>
      </div>

      {/* Content Pane */}
      <div className="flex-1 min-h-0 mx-3 flex gap-4">
        {/* Image Viewer Container */}
        <div className="flex-1 bg-black rounded-xl overflow-hidden relative border border-border flex items-center justify-center group">
          {/* Loading Indicator Overlay */}
          {imageLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/35 z-10 backdrop-blur-[1px]">
              <div className="flex flex-col items-center gap-3 bg-black/60 border border-white/10 p-4 rounded-2xl shadow-xl select-none animate-in fade-in zoom-in-95 duration-200">
                <Loader2 className="size-8 text-primary animate-spin" />
                <span className="text-xs font-semibold text-white/80">正在加载图片...</span>
              </div>
            </div>
          )}

          {/* Floating Left Button (Previous) */}
          {!prevDisabled && (
            <Button
              variant="ghost"
              size="icon-lg"
              onClick={handlePrevImage}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-20 size-12 rounded-full bg-black/40 border border-white/10 text-white hover:bg-black/60 hover:text-white cursor-pointer shadow-lg transition-all duration-200 hover:scale-105 opacity-0 group-hover:opacity-100"
            >
              <ChevronLeft className="size-6" />
            </Button>
          )}

          {/* Floating Right Button (Next) */}
          {!nextDisabled && (
            <Button
              variant="ghost"
              size="icon-lg"
              onClick={handleNextImage}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-20 size-12 rounded-full bg-black/40 border border-white/10 text-white hover:bg-black/60 hover:text-white cursor-pointer shadow-lg transition-all duration-200 hover:scale-105 opacity-0 group-hover:opacity-100"
            >
              <ChevronRight className="size-6" />
            </Button>
          )}

          {/* Floating Zoom Toolbar */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-black/60 border border-white/10 p-1.5 rounded-full backdrop-blur-md shadow-2xl transition-all duration-200 opacity-80 hover:opacity-100 group-hover:translate-y-0 translate-y-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleZoomOut}
                  disabled={imageZoomScale <= 0.5}
                  className="size-8 rounded-full text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-40"
                >
                  <ZoomOut className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="bg-black/90 text-white border-white/10">缩小</TooltipContent>
            </Tooltip>

            <span className="text-xs font-mono font-bold px-3 text-white/90 min-w-[54px] text-center select-none">
              {Math.round(imageZoomScale * 100)}%
            </span>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleZoomIn}
                  disabled={imageZoomScale >= 5}
                  className="size-8 rounded-full text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-40"
                >
                  <ZoomIn className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="bg-black/90 text-white border-white/10">放大</TooltipContent>
            </Tooltip>

            <div className="h-4 w-px bg-white/20 mx-1.5" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleZoomReset}
                  className="size-8 rounded-full text-white/80 hover:text-white hover:bg-white/10"
                >
                  <RotateCcw className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="bg-black/90 text-white border-white/10">重置</TooltipContent>
            </Tooltip>
          </div>

          <div 
            className={cn(
              "w-full h-full flex items-center justify-center p-4 relative overflow-hidden",
              imageZoomScale > 1 ? "cursor-grab active:cursor-grabbing" : ""
            )}
          >
            <img
              src={currentImageUrl}
              alt={currentPlayingFile.name}
              style={{
                transform: `translate(${imageOffset.x}px, ${imageOffset.y}px) scale(${imageZoomScale})`,
                transition: isDragging ? "none" : "transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                maxHeight: "100%",
                maxWidth: "100%",
                objectFit: "contain",
                userSelect: "none",
              }}
              onLoad={() => setImageLoading(false)}
              onError={() => setImageLoading(false)}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="pointer-events-auto select-none rounded-sm shadow-md"
            />
          </div>
        </div>

        {/* Sidebar of Image Folder */}
        <div className="w-80 shrink-0 bg-card border border-border rounded-xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border bg-secondary/30 shrink-0">
            <h3 className="text-sm font-bold text-foreground">同目录下图片</h3>
            <p className="text-xs text-muted-foreground mt-0.5">图片列表 ({imageFiles.length})</p>
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-1.5">
            {imageFiles.map((file) => {
              const isCurrent = file.path === currentPlayingFile.path;
              return (
                <div
                  key={file.path}
                  onClick={() => {
                    setCurrentPlayingFile(file);
                    setImageZoomScale(1);
                    setImageOffset({ x: 0, y: 0 });
                  }}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted transition-all select-none group",
                    isCurrent
                      ? "bg-primary/5 border-primary/20 text-primary"
                      : "bg-background/40 border-border/50 text-foreground"
                  )}
                >
                  <FileImage className={cn("size-4.5 shrink-0 mt-0.5", isCurrent ? "text-primary" : "text-muted-foreground group-hover:text-primary")} />
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-xs leading-relaxed break-all line-clamp-2", isCurrent ? "font-bold" : "font-medium")}>
                      {file.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {formatFileSize(file.size)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
