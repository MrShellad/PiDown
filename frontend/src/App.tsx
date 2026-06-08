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

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [activeFilter, setActiveFilter] = useState<NavFilter>("all");
  const categories = useDownloadStore((state) => state.categories);
  const tags = useDownloadStore((state) => state.tags);

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

  useEffect(() => {
    const parsed = parseNavFilter(activeFilter);

    if (parsed.type === "category" && !categories.some((category) => category.id === parsed.id)) {
      setActiveFilter("all");
    }

    if (parsed.type === "tag" && !tags.some((tag) => tag.id === parsed.id)) {
      setActiveFilter("all");
    }
  }, [activeFilter, categories, tags]);

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
        <ActiveBackground />
        <SettingsWindow />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider taskRuntime>
      <div className="flex h-screen flex-col overflow-hidden bg-transparent">
        <ActiveBackground />
        <WindowFrame title="PiDownloader" />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <NavSidebar activeFilter={activeFilter} onFilterChange={setActiveFilter} />
          <TaskListDashboard activeFilter={activeFilter} />
        </div>
      </div>
    </ThemeProvider>
  );
}
