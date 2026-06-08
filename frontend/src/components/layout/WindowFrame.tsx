import { useCallback, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { closeMainWindow, openSettingsWindow } from "@/core/bridge/tauri-commands";
import { useThemeStore } from "@/core/store/useThemeStore";
import { UI_TEXT } from "@/core/locale";
import { UI_TOKENS } from "@/core/ui-tokens";
import { Download, FolderOpen, Info, Menu, Minus, Settings, Square, X } from "lucide-react";

interface WindowFrameProps {
  title: string;
}

export default function WindowFrame({ title }: WindowFrameProps) {
  const theme = useThemeStore((state) => state.theme);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleMinimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (e) {
      console.warn("Tauri minimize API not available:", e);
    }
  };

  const handleMaximize = async () => {
    try {
      await getCurrentWindow().toggleMaximize();
    } catch (e) {
      console.warn("Tauri maximize API not available:", e);
    }
  };

  const handleClose = async () => {
    try {
      await closeMainWindow();
    } catch (e) {
      console.warn("Tauri close_main_window API failed. Closing window directly:", e);
      try {
        await getCurrentWindow().close();
      } catch (err) {
        console.error("Failed to close window:", err);
      }
    }
  };

  const toggleMenu = useCallback(() => {
    setMenuOpen((prev) => !prev);
  }, []);

  const handleOpenSettings = async () => {
    try {
      await openSettingsWindow();
    } catch (e) {
      console.warn("Failed to open settings window:", e);
    }
  };

  const MenuDropdown = ({ className = "" }: { className?: string }) => (
    <div
      className={`absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg backdrop-blur-xl ${className}`}
      onMouseLeave={() => setMenuOpen(false)}
    >
      {[
        { icon: <Download className="size-4" />, label: UI_TEXT.windowFrame.menuNew, shortcut: UI_TEXT.windowFrame.shortcutNew },
        { icon: <FolderOpen className="size-4" />, label: UI_TEXT.windowFrame.menuOpenDir, shortcut: "" },
        { icon: <Info className="size-4" />, label: UI_TEXT.windowFrame.menuAbout, shortcut: "" },
      ].map((item) => (
        <button
          key={item.label}
          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--secondary)]"
        >
          {item.icon}
          <span className="flex-1 text-left">{item.label}</span>
          {item.shortcut && (
            <span className="font-mono text-xs text-[var(--muted-foreground)]">{item.shortcut}</span>
          )}
        </button>
      ))}
    </div>
  );

  if (theme === "retro") {
    return (
      <div className="relative select-none" style={{ zIndex: 100 }}>
        <div
          className="flex items-center border-b border-[var(--border)] bg-[var(--primary)] font-mono text-[var(--primary-foreground)]"
          style={{ height: UI_TOKENS.frameHeights.retro }}
        >
          <div className="relative flex h-full items-center" style={{ zIndex: 10 }}>
            <button
              onClick={toggleMenu}
              className="flex h-full items-center gap-1 px-2 transition-all hover:brightness-110 active:brightness-90"
            >
              <Menu size={12} />
              <span className="text-sm font-bold">{UI_TEXT.windowFrame.menu}</span>
            </button>
            {menuOpen && <MenuDropdown />}
          </div>

          <div
            data-tauri-drag-region="true"
            className="pointer-events-auto absolute inset-0 flex items-center justify-center"
            style={{ cursor: "move" }}
          >
            <span className="pointer-events-none select-none text-sm font-bold tracking-wide">
              {title}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-1" style={{ zIndex: 10 }}>
            <button
              onClick={handleOpenSettings}
              className="flex h-[22px] w-[22px] items-center justify-center border-2 border-b-[#808080] border-r-[#808080] border-white bg-[#c0c0c0] text-[#000000] active:border-[#808080] active:border-b-white active:border-r-white"
            >
              <Settings size={12} />
            </button>
            <button
              onClick={handleMinimize}
              className="flex h-[22px] w-[22px] items-center justify-center border-2 border-b-[#808080] border-r-[#808080] border-white bg-[#c0c0c0] text-[#000000] active:border-[#808080] active:border-b-white active:border-r-white"
            >
              _
            </button>
            <button
              onClick={handleMaximize}
              className="flex h-[22px] w-[22px] items-center justify-center border-2 border-b-[#808080] border-r-[#808080] border-white bg-[#c0c0c0] text-[#000000] active:border-[#808080] active:border-b-white active:border-r-white"
            >
              □
            </button>
            <button
              onClick={handleClose}
              className="ml-1 flex h-[22px] w-[22px] items-center justify-center border-2 border-b-[#808080] border-r-[#808080] border-white bg-[#c0c0c0] text-[#000000] active:border-[#808080] active:border-b-white active:border-r-white"
            >
              X
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (theme === "cyberpunk") {
    return (
      <div className="relative select-none" style={{ zIndex: 100 }}>
        <div
          className="flex items-center border-b border-[var(--border)] bg-black font-mono uppercase tracking-widest"
          style={{ height: UI_TOKENS.frameHeights.cyberpunk }}
        >
          <div className="relative flex h-full items-center" style={{ zIndex: 10 }}>
            <button
              onClick={toggleMenu}
              className="flex h-full items-center gap-1.5 border-r border-[var(--border)] px-3 text-[var(--foreground)] transition-colors hover:bg-[rgba(0,240,255,0.1)]"
            >
              <Menu size={12} />
              <span className="text-sm font-black">{UI_TEXT.windowFrame.menu}</span>
            </button>
            {menuOpen && <MenuDropdown />}
          </div>

          <div
            data-tauri-drag-region="true"
            className="pointer-events-auto absolute inset-0 flex items-center justify-center"
            style={{ cursor: "move" }}
          >
            <div className="pointer-events-none flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse bg-[var(--primary)]" />
              <span className="text-sm font-black text-[var(--foreground)]">
                {title} // {UI_TEXT.windowFrame.cyberpunkTitle}
              </span>
            </div>
          </div>

          <div className="ml-auto flex h-full items-center" style={{ zIndex: 10 }}>
            <button
              onClick={handleOpenSettings}
              className="h-full border-l border-[var(--border)] px-3 text-[var(--foreground)] transition-colors hover:bg-[rgba(0,240,255,0.1)]"
            >
              <Settings size={12} />
            </button>
            <button
              onClick={handleMinimize}
              className="h-full border-l border-[var(--border)] px-3 text-[var(--foreground)] transition-colors hover:bg-[rgba(0,240,255,0.1)]"
            >
              <Minus size={12} />
            </button>
            <button
              onClick={handleMaximize}
              className="h-full border-l border-[var(--border)] px-3 text-[var(--foreground)] transition-colors hover:bg-[rgba(0,240,255,0.1)]"
            >
              <Square size={10} />
            </button>
            <button
              onClick={handleClose}
              className="h-full border-l border-[var(--border)] px-3 font-black text-red-500 transition-colors hover:bg-red-500 hover:text-black"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative select-none" style={{ zIndex: 100 }}>
      <div
        className="flex items-center rounded-t-[var(--radius)] border-b border-[var(--border)] bg-[var(--card)] text-base backdrop-blur-md"
        style={{ height: UI_TOKENS.frameHeights.modern }}
      >
        <div className="relative flex h-full items-center" style={{ zIndex: 10 }}>
          <button
            onClick={toggleMenu}
            className="flex h-full items-center gap-1.5 rounded-tl-[var(--radius)] px-3.5 text-foreground/60 transition-colors hover:bg-secondary/40 hover:text-foreground/90"
          >
            <Menu size={14} />
            <span className="text-sm font-medium">{UI_TEXT.windowFrame.menu}</span>
          </button>
          {menuOpen && <MenuDropdown />}
        </div>

        <div
          data-tauri-drag-region="true"
          className="pointer-events-auto absolute inset-0 flex items-center justify-center"
          style={{ cursor: "move" }}
        >
          <div className="pointer-events-none flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-[var(--primary)] to-cyan-400" />
            <span className="text-sm font-semibold tracking-tight text-foreground/80">{title}</span>
          </div>
        </div>

        <div className="ml-auto flex h-full items-center" style={{ zIndex: 10 }}>
          <button
            onClick={handleOpenSettings}
            className="flex h-full w-[36px] items-center justify-center text-foreground/60 transition-colors hover:bg-secondary/40"
          >
            <Settings size={14} />
          </button>
          <button
            onClick={handleMinimize}
            className="flex h-full w-[36px] items-center justify-center text-foreground/60 transition-colors hover:bg-secondary/40"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={handleMaximize}
            className="flex h-full w-[36px] items-center justify-center text-foreground/60 transition-colors hover:bg-secondary/40"
          >
            <Square size={12} />
          </button>
          <button
            onClick={handleClose}
            className="flex h-full w-[36px] items-center justify-center rounded-tr-[var(--radius)] text-foreground/60 transition-colors hover:bg-red-500/20 hover:text-red-500"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
