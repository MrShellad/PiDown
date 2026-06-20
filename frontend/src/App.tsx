import "./core/i18n"; // Initialize i18next before any UI_TEXT access
import { useState } from "react";
import ThemeProvider from "./components/layout/ThemeProvider";
import ActiveBackground from "./components/layout/ActiveBackground";
import WindowFrame from "./components/layout/WindowFrame";
import NavSidebar from "./components/layout/NavSidebar";
import { Dialog, DialogContent, DialogTitle } from "./components/ui/dialog";
import { TooltipProvider } from "./components/ui/tooltip";
import { useDownloadStore } from "./core/store/useDownloadStore";
import { UI_TEXT } from "./core/locale";
import { UI_TOKENS } from "./core/ui-tokens";
import { parseNavFilter, type NavFilter } from "./core/taskFilters";
import { useAppSettingsStore } from "./core/store/useAppSettingsStore";
import TaskListDashboard from "./components/downloader/TaskListDashboard";
import FloatDisc from "./components/downloader/FloatDisc";
import SettingsWindow from "./components/settings/SettingsWindow";
import DevicesDashboard from "./components/downloader/DevicesDashboard";
import ThemeEditorDialog from "./components/settings/ThemeEditorDialog";


function resolveActiveFilter(
  filter: NavFilter,
  categories: ReturnType<typeof useDownloadStore.getState>["categories"],
  tags: ReturnType<typeof useDownloadStore.getState>["tags"]
): NavFilter {
  const parsed = parseNavFilter(filter);

  if (parsed.type === "category" && !categories.some((category) => category.id === parsed.id)) {
    return "all";
  }

  if (parsed.type === "tag" && !tags.some((tag) => tag.id === parsed.id)) {
    return "all";
  }

  return filter;
}

export default function App() {
  const [path] = useState(window.location.pathname);
  const [activeFilter, setActiveFilter] = useState<NavFilter>("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const categories = useDownloadStore((state) => state.categories);
  const tags = useDownloadStore((state) => state.tags);
  const visibleFilter = resolveActiveFilter(activeFilter, categories, tags);
  const settings = useAppSettingsStore((state) => state.settings);
  const hideBorderAndBg = settings?.interface?.hide_border_and_bg ?? false;




  if (path === "/float") {
    return (
      <ThemeProvider taskRuntime>
        <TooltipProvider>
          <FloatDisc />
        </TooltipProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider taskRuntime>
      <TooltipProvider>
        <div className={`relative flex h-screen flex-col overflow-hidden rounded-lg bg-transparent ${hideBorderAndBg ? "" : "border border-border/40"}`}>
          <ActiveBackground />
          {!hideBorderAndBg && (
            <WindowFrame title="PiDownloader" onOpenSettings={() => setSettingsOpen(true)} />
          )}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <NavSidebar
              activeFilter={visibleFilter}
              onFilterChange={setActiveFilter}
              onOpenSettings={() => setSettingsOpen(true)}
            />
            {visibleFilter === "devices" ? (
              <DevicesDashboard />
            ) : (
              <TaskListDashboard activeFilter={visibleFilter} />
            )}
          </div>
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogContent
              size="full"
              showCloseButton={false}
              className="border border-border bg-card p-0 shadow-surface-strong"
              overlayClassName="bg-black/45 backdrop-blur-none"
              style={{
                width: `min(${UI_TOKENS.settingsDialog.width}, ${UI_TOKENS.settingsDialog.maxWidth})`,
                height: `min(${UI_TOKENS.settingsDialog.height}, calc(100vh - ${UI_TOKENS.frameHeights.modern} - 2rem))`,
                top: `calc(50vh + ${UI_TOKENS.frameHeights.modern} / 2)`,
                maxWidth: UI_TOKENS.settingsDialog.maxWidth,
                maxHeight: `calc(100vh - ${UI_TOKENS.frameHeights.modern} - 2rem)`,
              }}
            >
              <div className="flex h-full min-h-0 flex-col overflow-hidden">
                <DialogTitle className="sr-only">{UI_TEXT.settings.title}</DialogTitle>
                <SettingsWindow onClose={() => setSettingsOpen(false)} />
              </div>
            </DialogContent>
          </Dialog>
          <ThemeEditorDialog />
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );
}
