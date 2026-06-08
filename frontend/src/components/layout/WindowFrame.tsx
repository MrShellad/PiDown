import { useCallback, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { closeMainWindow, closeSettingsWindow, openSettingsWindow } from "@/core/bridge/tauri-commands";
import { UI_TEXT } from "@/core/locale";
import { UI_TOKENS } from "@/core/ui-tokens";
import { Download, FolderOpen, Info, Menu, Minus, Settings, Square, X } from "lucide-react";

interface WindowFrameProps {
  title: string;
  showMenu?: boolean;
  showSettingsButton?: boolean;
  closeAction?: "main" | "settings";
}

const WINDOW_MENU_ITEMS = [
  {
    icon: <Download className="size-4" />,
    label: UI_TEXT.windowFrame.menuNew,
    shortcut: UI_TEXT.windowFrame.shortcutNew,
  },
  {
    icon: <FolderOpen className="size-4" />,
    label: UI_TEXT.windowFrame.menuOpenDir,
    shortcut: "",
  },
  {
    icon: <Info className="size-4" />,
    label: UI_TEXT.windowFrame.menuAbout,
    shortcut: "",
  },
];

function MenuDropdown({
  className = "",
  onMouseLeave,
}: {
  className?: string;
  onMouseLeave: () => void;
}) {
  return (
    <div
      className={`absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-border bg-card py-1 shadow-lg backdrop-blur-xl ${className}`}
      onMouseLeave={onMouseLeave}
    >
      {WINDOW_MENU_ITEMS.map((item) => (
        <button
          key={item.label}
          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-secondary"
        >
          {item.icon}
          <span className="flex-1 text-left">{item.label}</span>
          {item.shortcut && (
            <span className="font-mono text-xs text-muted-foreground">{item.shortcut}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export default function WindowFrame({
  title,
  showMenu = true,
  showSettingsButton = true,
  closeAction = "main",
}: WindowFrameProps) {
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
      if (closeAction === "settings") {
        await closeSettingsWindow();
      } else {
        await closeMainWindow();
      }
    } catch (e) {
      console.warn("Tauri close window API failed. Closing window directly:", e);
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

  return (
    <div className="relative select-none" style={{ zIndex: 100 }}>
      <div
        className="flex items-center rounded-t-lg border-b border-border bg-card text-base backdrop-blur-md"
        style={{ height: UI_TOKENS.frameHeights.modern }}
      >
        {showMenu ? (
          <div className="relative flex h-full items-center" style={{ zIndex: 10 }}>
            <button
              onClick={toggleMenu}
              className="flex h-full items-center gap-1.5 rounded-tl-lg px-3.5 text-foreground/60 transition-colors hover:bg-secondary/40 hover:text-foreground/90"
            >
              <Menu size={14} />
              <span className="text-sm font-medium">{UI_TEXT.windowFrame.menu}</span>
            </button>
            {menuOpen && <MenuDropdown onMouseLeave={() => setMenuOpen(false)} />}
          </div>
        ) : null}

        <div
          data-tauri-drag-region="true"
          className="pointer-events-auto absolute inset-0 flex items-center justify-center"
          style={{ cursor: "move" }}
        >
          <div className="pointer-events-none flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-primary to-cyan-400" />
            <span className="text-sm font-semibold tracking-tight text-foreground/80">{title}</span>
          </div>
        </div>

        <div className="ml-auto flex h-full items-center" style={{ zIndex: 10 }}>
          {showSettingsButton ? (
            <button
              onClick={handleOpenSettings}
              className="flex h-full w-[36px] items-center justify-center text-foreground/60 transition-colors hover:bg-secondary/40"
            >
              <Settings size={14} />
            </button>
          ) : null}
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
            className="flex h-full w-[36px] items-center justify-center rounded-tr-lg text-foreground/60 transition-colors hover:bg-red-500/20 hover:text-red-500"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
