import { useEffect, useState } from "react";
import ThemeProvider from "./components/layout/ThemeProvider";
import ActiveBackground from "./components/layout/ActiveBackground";
import WindowFrame from "./components/layout/WindowFrame";
import NavSidebar from "./components/layout/NavSidebar";
import { useDownloadStore } from "./core/store/useDownloadStore";
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

  if (path === "/settings") {
    return (
      <ThemeProvider>
        <div className="flex h-screen flex-col overflow-hidden bg-transparent">
          <ActiveBackground />
          <WindowFrame
            title="设置"
            showMenu={false}
            showSettingsButton={false}
            closeAction="settings"
          />
          <SettingsWindow />
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider taskRuntime>
      <div className="flex h-screen flex-col overflow-hidden bg-transparent">
        <ActiveBackground />
        <WindowFrame title="PiDownloader" />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <NavSidebar activeFilter={visibleFilter} onFilterChange={setActiveFilter} />
          <TaskListDashboard activeFilter={visibleFilter} />
        </div>
      </div>
    </ThemeProvider>
  );
}
