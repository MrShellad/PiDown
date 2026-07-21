import "./core/i18n"; // Initialize i18next before any UI_TEXT access
import { useEffect, useState, lazy, Suspense } from "react";
import { LoaderCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import NewTaskModal from "./components/downloader/NewTaskModal";
import { useEvent } from "./core/eventBus";
import type { ExternalDownloadRequest } from "./core/bridge/external-download";
import ThemeProvider from "./components/layout/ThemeProvider";
import ActiveBackground from "./components/layout/ActiveBackground";
import WindowFrame from "./components/layout/WindowFrame";
import NavSidebar from "./components/layout/NavSidebar";
import { TooltipProvider } from "./components/ui/tooltip";
import { useDownloadStore } from "./core/store/useDownloadStore";
import { UI_TOKENS } from "./core/ui-tokens";
import { parseNavFilter, type NavFilter } from "./core/taskFilters";
import { useAppSettingsStore } from "./core/store/useAppSettingsStore";
import FloatDisc from "./components/downloader/FloatDisc";
import ThemeEditorDialog from "./components/settings/ThemeEditorDialog";
import ExtensionGuideDialog from "./components/downloader/ExtensionGuideDialog";
import CloseConfirmDialog from "./components/downloader/CloseConfirmDialog";
import { useThemeStore } from "./core/store/useThemeStore";
import AnimalCursor from "./components/layout/AnimalCursor";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { WebDavDevice } from "./core/bridge/tauri-commands";

const TaskListDashboard = lazy(() => import("./components/downloader/TaskListDashboard"));
const SettingsWindow = lazy(() => import("./components/settings/SettingsWindow"));
const DevicesDashboard = lazy(() => import("./components/downloader/device/DevicesDashboard"));


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
  const [closePromptOpen, setClosePromptOpen] = useState(false);
  const [activeBrowsingDevice, setActiveBrowsingDevice] = useState<WebDavDevice | null>(null);
  const categories = useDownloadStore((state) => state.categories);
  const tags = useDownloadStore((state) => state.tags);
  const visibleFilter = resolveActiveFilter(activeFilter, categories, tags);
  const settings = useAppSettingsStore((state) => state.settings);
  const hideBorderAndBg = settings?.interface?.hide_border_and_bg ?? false;
  const activeTheme = useThemeStore((state) => state.theme);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newTaskRequest, setNewTaskRequest] = useState<ExternalDownloadRequest | null>(null);

  useEffect(() => {
    if (path === "/float") {
      document.body.style.setProperty("background-color", "transparent", "important");
    } else {
      document.body.style.setProperty("background-color", "var(--theme-static-background)", "important");
    }
  }, [path, activeTheme]);

  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let active = true;
    let unlistenResize: (() => void) | undefined;

    const setupListeners = async () => {
      try {
        const appWindow = getCurrentWindow();
        const initialMax = await appWindow.isMaximized();
        if (active) setIsMaximized(initialMax);

        const unlisten = await appWindow.onResized(async () => {
          const max = await appWindow.isMaximized();
          if (active) setIsMaximized(max);
        });
        unlistenResize = unlisten;
      } catch (e) {
        console.warn("Failed to subscribe to window resize events:", e);
      }
    };

    setupListeners();

    return () => {
      active = false;
      if (unlistenResize) {
        unlistenResize();
      }
    };
  }, []);

  useEvent("app:request-close", () => {
    setClosePromptOpen(true);
  });

  useEvent("task:open-modal", (payload) => {
    setNewTaskRequest(payload);
    setNewTaskOpen(true);
  });

  const windowTitle = (visibleFilter === "devices" && activeBrowsingDevice)
    ? `PiDownloader - [${activeBrowsingDevice.name}]`
    : "PiDownloader";

  if (path === "/float") {
    return (
      <ThemeProvider taskRuntime>
        <TooltipProvider>
          <FloatDisc />
        </TooltipProvider>
      </ThemeProvider>
    );
  }

  const content = (
    <div className={`relative flex h-screen flex-col overflow-hidden bg-transparent ${hideBorderAndBg || isMaximized ? "" : "border border-border/40"}`}>
      <ActiveBackground />
      {!hideBorderAndBg && (
        <WindowFrame title={windowTitle} isMaximized={isMaximized} onOpenSettings={() => setSettingsOpen(true)} />
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden relative">
        <div className="relative z-20 shrink-0" style={{ width: UI_TOKENS.sidebarWidth, minWidth: UI_TOKENS.sidebarWidth }}>
          <NavSidebar
            activeFilter={visibleFilter}
            onFilterChange={(filter) => {
              setActiveFilter(filter);
              if (filter !== "devices") {
                setActiveBrowsingDevice(null);
              }
              // Auto-close settings when navigating
              setSettingsOpen(false);
            }}
            onOpenSettings={() => setSettingsOpen((prev) => !prev)}
          />
        </div>
        <div className={`flex-1 flex min-h-0 ${visibleFilter === "devices" ? "" : "hidden"}`}>
          <Suspense fallback={
            <div className="flex h-full w-full items-center justify-center">
              <LoaderCircle className="size-6 animate-spin text-primary" />
            </div>
          }>
            <DevicesDashboard
              activeBrowsingDevice={activeBrowsingDevice}
              setActiveBrowsingDevice={setActiveBrowsingDevice}
            />
          </Suspense>
        </div>
        <div className={`flex-1 flex min-h-0 ${visibleFilter !== "devices" ? "" : "hidden"}`}>
          <Suspense fallback={
            <div className="flex h-full w-full items-center justify-center">
              <LoaderCircle className="size-6 animate-spin text-primary" />
            </div>
          }>
            <TaskListDashboard activeFilter={visibleFilter} />
          </Suspense>
        </div>

        {/* Settings Drawer sliding out from behind the sidebar */}
        <AnimatePresence>
          {settingsOpen && (
            <motion.div
              initial={{ x: -120, opacity: 0, scale: 0.96 }}
              animate={{ x: 0, opacity: 1, scale: 1 }}
              exit={{ x: -120, opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", damping: 26, stiffness: 200 }}
              className="absolute top-0 bottom-0 right-0 pt-3 pb-6 pr-6 pl-3 z-10 [will-change:transform,opacity] [transform:translate3d(0,0,0)]"
              style={{
                left: UI_TOKENS.sidebarWidth,
              }}
            >
              <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-card border border-border/40 shadow-surface-strong">
                <Suspense fallback={
                  <div className="flex h-full w-full items-center justify-center bg-card">
                    <LoaderCircle className="size-6 animate-spin text-primary" />
                  </div>
                }>
                  <SettingsWindow onClose={() => setSettingsOpen(false)} />
                </Suspense>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <ThemeEditorDialog />
      <ExtensionGuideDialog />
      <CloseConfirmDialog open={closePromptOpen} onOpenChange={setClosePromptOpen} />
      <NewTaskModal
        open={newTaskOpen}
        onOpenChange={setNewTaskOpen}
        initialRequest={newTaskRequest}
        onInitialRequestConsumed={() => setNewTaskRequest(null)}
      />
    </div>
  );

  return (
    <ThemeProvider taskRuntime>
      <TooltipProvider>
        <Suspense fallback={null}>
          {activeTheme === "animal-crossing" ? (
            <AnimalCursor forceAll={false}>{content}</AnimalCursor>
          ) : (
            content
          )}
        </Suspense>
      </TooltipProvider>
    </ThemeProvider>
  );
}
