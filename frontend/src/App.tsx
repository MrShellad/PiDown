import { useState } from "react";
import { Settings as SettingsIcon, X } from "lucide-react";
import ThemeProvider from "./components/layout/ThemeProvider";
import ActiveBackground from "./components/layout/ActiveBackground";
import WindowFrame from "./components/layout/WindowFrame";
import NavSidebar from "./components/layout/NavSidebar";
import { Button } from "./components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "./components/ui/dialog";
import { TooltipProvider } from "./components/ui/tooltip";
import { useDownloadStore } from "./core/store/useDownloadStore";
import { UI_TEXT } from "./core/locale";
import { UI_TOKENS } from "./core/ui-tokens";
import { parseNavFilter, type NavFilter } from "./core/taskFilters";
import { useAppSettingsStore } from "./core/store/useAppSettingsStore";
import TaskListDashboard from "./components/downloader/TaskListDashboard";
import FloatDisc from "./components/downloader/FloatDisc";
import SettingsWindow from "./components/settings/SettingsWindow";
import NewTaskWindow from "./components/downloader/NewTaskWindow";

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


  const params = new URLSearchParams(window.location.search);
  const isNewTask = path === "/new-task" || path.startsWith("/new-task") || params.has("new_task");

  if (isNewTask) {
    return (
      <ThemeProvider taskRuntime>
        <TooltipProvider>
          <ActiveBackground />
          <NewTaskWindow />
        </TooltipProvider>
      </ThemeProvider>
    );
  }

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
            <TaskListDashboard activeFilter={visibleFilter} />
          </div>
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogContent
              size="full"
              showCloseButton={false}
              className="border border-border bg-background/95 p-0 shadow-surface-strong"
              overlayClassName="bg-black/45 backdrop-blur-none"
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
      </TooltipProvider>
    </ThemeProvider>
  );
}
