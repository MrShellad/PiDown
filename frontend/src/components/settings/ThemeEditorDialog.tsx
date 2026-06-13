import React, { useRef, useState } from "react";
import { useThemeStore } from "@/core/store/useThemeStore";
import { UI_TEXT } from "@/core/locale";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SettingsInput, SettingsTextarea } from "./SettingsPrimitives";

// Global cache to prevent creating canvas repeatedly for named/special colors
const colorCache = new Map<string, string>();

// Helper to normalize CSS colors to 6-digit hex format
function colorToHex6(colorStr: string, fallback: string = "#ffffff"): string {
  if (!colorStr) return fallback;
  const trimmed = colorStr.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-fA-F]{8}$/.test(trimmed)) return trimmed.slice(0, 7);
  
  if (colorCache.has(trimmed)) {
    return colorCache.get(trimmed)!;
  }

  let result = fallback;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = colorStr;
      const resolved = ctx.fillStyle;
      if (resolved.startsWith("#")) {
        result = resolved;
      } else {
        const match = resolved.match(/\d+/g);
        if (match && match.length >= 3) {
          const r = parseInt(match[0]).toString(16).padStart(2, "0");
          const g = parseInt(match[1]).toString(16).padStart(2, "0");
          const b = parseInt(match[2]).toString(16).padStart(2, "0");
          result = `#${r}${g}${b}`;
        }
      }
    }
  } catch (e) {
    // ignore
  }
  colorCache.set(trimmed, result);
  return result;
}

// Simple debounce helper
function debounce<T extends (...args: any[]) => void>(func: T, wait: number) {
  let timeout: number | null = null;
  const debounced = (...args: any[]) => {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = window.setTimeout(() => {
      func(...args);
    }, wait);
  };
  debounced.cancel = () => {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
  };
  return debounced;
}

const ColorPickerRow = ({
  label,
  varName,
  value: propValue,
  onChange,
}: {
  label: string;
  varName: string;
  value: string;
  onChange: (val: string) => void;
}) => {
  const [localValue, setLocalValue] = useState(propValue);

  // Synchronize local value when prop changes from outside (e.g., Tab switcher, Save, or Cancel)
  React.useEffect(() => {
    setLocalValue(propValue);
  }, [propValue]);

  // Debounced callback to update the store state and trigger file saves
  const debouncedOnChange = React.useRef(
    debounce((val: string) => {
      onChange(val);
    }, 80)
  ).current;

  // Cancel debounce on unmount
  React.useEffect(() => {
    return () => {
      debouncedOnChange.cancel();
    };
  }, [debouncedOnChange]);

  const handleValueChange = (newVal: string) => {
    setLocalValue(newVal);

    // 1. Immediately apply the color to the DOM root for smooth 60fps real-time preview
    try {
      document.documentElement.style.setProperty(varName, newVal, "important");
    } catch (e) {
      console.warn("Failed to apply dynamic CSS property directly:", e);
    }

    // 2. Debounce store/Zustand update to prevent heavy React re-renders on every frame
    debouncedOnChange(newVal);
  };

  const hexValue = colorToHex6(localValue, "#ffffff");

  return (
    <div className="flex items-center justify-between border-b border-border/40 py-2.5">
      <div className="space-y-0.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <code className="block text-xs text-muted-foreground">{varName}</code>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={localValue}
          onChange={(e) => handleValueChange(e.target.value)}
          className="h-8 w-24 rounded-md border border-input bg-background px-2 py-1 text-xs font-mono text-foreground focus:border-primary focus:outline-none"
        />
        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md border border-input shadow-sm cursor-pointer hover:border-primary/50">
          <input
            type="color"
            value={hexValue}
            onChange={(e) => handleValueChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            style={{ padding: 0 }}
          />
          <div
            className="h-full w-full"
            style={{ backgroundColor: hexValue }}
          />
        </div>
      </div>
    </div>
  );
};

export default function ThemeEditorDialog() {
  const {
    themeEditorOpen,
    editingTheme,
    editingColorMode,
    updateEditingTheme,
    updateEditingStyle,
    setEditingColorMode,
    cancelThemeEdit,
    saveThemeEdit,
  } = useThemeStore();

  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const handleDragStartMouse = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("input") || target.closest("textarea")) return;

    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    dragOffsetRef.current = { ...dragOffset };

    document.addEventListener("mousemove", handleDragMoveMouse);
    document.addEventListener("mouseup", handleDragEndMouse);

    e.preventDefault();
  };

  const handleDragMoveMouse = (e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    setDragOffset({
      x: dragOffsetRef.current.x + dx,
      y: dragOffsetRef.current.y + dy,
    });
  };

  const handleDragEndMouse = () => {
    isDraggingRef.current = false;
    document.removeEventListener("mousemove", handleDragMoveMouse);
    document.removeEventListener("mouseup", handleDragEndMouse);
  };

  // Reset dragOffset to center when popup opens, and clean up temporary inline CSS variables when it closes
  React.useEffect(() => {
    if (themeEditorOpen) {
      setDragOffset({ x: 0, y: 0 });
    } else {
      const coreKeys = [
        "--background",
        "--foreground",
        "--card",
        "--primary",
        "--border",
        "--muted",
        "--muted-foreground",
        "--accent",
      ];
      coreKeys.forEach((key) => {
        try {
          document.documentElement.style.removeProperty(key);
        } catch (e) {
          // ignore
        }
      });
    }
  }, [themeEditorOpen]);

  return (
    <Dialog modal={false} open={themeEditorOpen} onOpenChange={(open) => { if (!open) cancelThemeEdit(); }}>
      <DialogContent
        size="lg"
        variant="modal"
        dismissible={false}
        overlayClassName="pointer-events-none bg-transparent backdrop-blur-none"
        className="z-[200] max-h-[85vh] sm:max-w-[54rem] flex flex-col pointer-events-auto shadow-2xl border border-border/80"
        style={{ left: `calc(50% + ${dragOffset.x}px)`, top: `calc(50% + ${dragOffset.y}px)` }}
      >
        <DialogHeader
          onMouseDown={handleDragStartMouse}
          className="cursor-move select-none shrink-0 border-b border-border/30 pb-3"
        >
          <DialogTitle>{UI_TEXT.settings.themeEditorTitle}</DialogTitle>
        </DialogHeader>

        {editingTheme && (
          <DialogBody className="p-0 flex flex-col flex-1 min-h-0 overflow-hidden">
            <ScrollArea className="flex-1" scrollbar="overlay" viewportClassName="px-6 py-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left side: Metadata */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {UI_TEXT.settings.themeName}
                    </label>
                    <SettingsInput
                      value={editingTheme.name}
                      onChange={(e) => updateEditingTheme({ name: e.target.value })}
                      placeholder={UI_TEXT.settings.themeNamePlaceholder}
                      className="w-full bg-card border-border/80 focus:border-primary/50"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {UI_TEXT.settings.themeDesc}
                    </label>
                    <SettingsTextarea
                      value={editingTheme.description}
                      onChange={(e) => updateEditingTheme({ description: e.target.value })}
                      placeholder={UI_TEXT.settings.themeDescPlaceholder}
                      className="w-full bg-card border-border/80 focus:border-primary/50 min-h-[80px]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {UI_TEXT.settings.themeAuthor}
                    </label>
                    <SettingsInput
                      value={editingTheme.author}
                      onChange={(e) => updateEditingTheme({ author: e.target.value })}
                      placeholder={UI_TEXT.settings.themeAuthorPlaceholder}
                      className="w-full bg-card border-border/80 focus:border-primary/50"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {UI_TEXT.settings.themeAccentLabel}
                    </label>
                    <SettingsInput
                      value={editingTheme.accent}
                      onChange={(e) => updateEditingTheme({ accent: e.target.value })}
                      placeholder={UI_TEXT.settings.themeAccentPlaceholder}
                      className="w-full bg-card border-border/80 focus:border-primary/50"
                    />
                  </div>
                </div>

                {/* Right side: Colors */}
                <div className="flex flex-col min-h-0">
                  <div className="flex items-center justify-between mb-4 border-b border-border/30 pb-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {UI_TEXT.settings.colorVariables}
                    </label>
                    <div className="flex rounded-lg bg-secondary/40 p-0.5 border border-border/50">
                      <button
                        type="button"
                        onClick={() => setEditingColorMode("dark")}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                          editingColorMode === "dark"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {UI_TEXT.settings.darkModeColors}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingColorMode("light")}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                          editingColorMode === "light"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {UI_TEXT.settings.lightModeColors}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <ColorPickerRow
                      label={UI_TEXT.settings.colorBg}
                      varName="--background"
                      value={editingTheme.styles[editingColorMode]?.["--background"] || ""}
                      onChange={(val) => updateEditingStyle("--background", val)}
                    />
                    <ColorPickerRow
                      label={UI_TEXT.settings.colorFg}
                      varName="--foreground"
                      value={editingTheme.styles[editingColorMode]?.["--foreground"] || ""}
                      onChange={(val) => updateEditingStyle("--foreground", val)}
                    />
                    <ColorPickerRow
                      label={UI_TEXT.settings.colorCard}
                      varName="--card"
                      value={editingTheme.styles[editingColorMode]?.["--card"] || ""}
                      onChange={(val) => updateEditingStyle("--card", val)}
                    />
                    <ColorPickerRow
                      label={UI_TEXT.settings.colorPrimary}
                      varName="--primary"
                      value={editingTheme.styles[editingColorMode]?.["--primary"] || ""}
                      onChange={(val) => updateEditingStyle("--primary", val)}
                    />
                    <ColorPickerRow
                      label={UI_TEXT.settings.colorBorder}
                      varName="--border"
                      value={editingTheme.styles[editingColorMode]?.["--border"] || ""}
                      onChange={(val) => updateEditingStyle("--border", val)}
                    />
                    <ColorPickerRow
                      label={UI_TEXT.settings.colorMuted}
                      varName="--muted"
                      value={editingTheme.styles[editingColorMode]?.["--muted"] || ""}
                      onChange={(val) => updateEditingStyle("--muted", val)}
                    />
                    <ColorPickerRow
                      label={UI_TEXT.settings.colorMutedFg}
                      varName="--muted-foreground"
                      value={editingTheme.styles[editingColorMode]?.["--muted-foreground"] || ""}
                      onChange={(val) => updateEditingStyle("--muted-foreground", val)}
                    />
                    <ColorPickerRow
                      label={UI_TEXT.settings.colorAccent}
                      varName="--accent"
                      value={editingTheme.styles[editingColorMode]?.["--accent"] || ""}
                      onChange={(val) => updateEditingStyle("--accent", val)}
                    />
                  </div>
                </div>
              </div>
            </ScrollArea>
          </DialogBody>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={cancelThemeEdit}>
            {UI_TEXT.settings.cancel}
          </Button>
          <Button type="button" onClick={saveThemeEdit} disabled={!editingTheme?.name?.trim()}>
            {UI_TEXT.settings.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
