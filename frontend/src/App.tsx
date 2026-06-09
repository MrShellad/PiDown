import { useEffect, useState } from "react";
import { Settings as SettingsIcon, X } from "lucide-react";
import ThemeProvider from "./components/layout/ThemeProvider";
import ActiveBackground from "./components/layout/ActiveBackground";
import WindowFrame from "./components/layout/WindowFrame";
import NavSidebar from "./components/layout/NavSidebar";
import { Button } from "./components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "./components/ui/dialog";
import { useDownloadStore } from "./core/store/useDownloadStore";
import { UI_TEXT } from "./core/locale";
import { UI_TOKENS } from "./core/ui-tokens";
import { parseNavFilter, type NavFilter } from "./core/taskFilters";
import TaskListDashboard from "./components/downloader/TaskListDashboard";
import FloatDisc from "./components/downloader/FloatDisc";
import SettingsWindow from "./components/settings/SettingsWindow";

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
  const [path, setPath] = useState(window.location.pathname);
  const [activeFilter, setActiveFilter] = useState<NavFilter>("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const categories = useDownloadStore((state) => state.categories);
  const tags = useDownloadStore((state) => state.tags);
  const visibleFilter = resolveActiveFilter(activeFilter, categories, tags);

  useEffect(() => {
    const handleLocationChange = () => {
      setPath(window.location.pathname);
    };

    window.addEventListener("popstate", handleLocationChange);

    const interval = setInterval(() => {
      if (window.location.pathname !== path) {
        setPath(window.location.pathname);
      }
    }, 200);

    return () => {
      window.removeEventListener("popstate", handleLocationChange);
      clearInterval(interval);
    };
  }, [path]);

  if (path === "/float") {
    return (
      <ThemeProvider taskRuntime>
        <ActiveBackground />
        <FloatDisc />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider taskRuntime>
      <div className="flex h-screen flex-col overflow-hidden bg-transparent">
        <ActiveBackground />
        <WindowFrame title="PiDownloader" onOpenSettings={() => setSettingsOpen(true)} />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <NavSidebar activeFilter={visibleFilter} onFilterChange={setActiveFilter} />
          <TaskListDashboard activeFilter={visibleFilter} />
        </div>
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent
            size="full"
            showCloseButton={false}
            className="border border-border bg-background/95 p-0 shadow-surface-strong"
            overlayClassName="bg-black/14 supports-backdrop-filter:backdrop-blur-[2px]"
            style={{
              width: `min(${UI_TOKENS.settingsDialog.width}, ${UI_TOKENS.settingsDialog.maxWidth})`,
              height: `min(${UI_TOKENS.settingsDialog.height}, ${UI_TOKENS.settingsDialog.maxHeight})`,
              maxWidth: UI_TOKENS.settingsDialog.maxWidth,
              maxHeight: UI_TOKENS.settingsDialog.maxHeight,
            }}
          >
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card/88 px-5">
                <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <SettingsIcon className="size-4 text-primary" />
                  {UI_TEXT.settings.title}
                </DialogTitle>
                <DialogClose asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={UI_TEXT.settings.cancel}>
                    <X className="size-4" />
                  </Button>
                </DialogClose>
              </div>
              <SettingsWindow />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ThemeProvider>
  );
}
