import { Suspense, lazy } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

// Satu bundle frontend digunakan oleh seluruh window Mochi.
const IslandPage = lazy(() => import("./pages/island/IslandPage"));
const ShelfPage = lazy(() => import("./pages/shelf/ShelfPage"));
const TasksPage = lazy(() => import("./pages/tasks/TasksPage"));
const SettingsPage = lazy(() => import("./pages/settings/SettingsPage"));
const ClipboardPage = lazy(() => import("./pages/clipboard/ClipboardPage"));
const LauncherPage = lazy(() => import("./pages/launcher/LauncherPage"));

const WINDOW_LABELS = {
  shelf: "shelf",
  tasks: "tasks",
  settings: "settings",
  clipboard: "clipboard",
  launcher: "launcher",
} as const;

function App() {
  const label = getCurrentWindow().label;

  const page =
    label === WINDOW_LABELS.launcher ? (
      <LauncherPage />
    ) : label === WINDOW_LABELS.shelf ? (
      <ShelfPage />
    ) : label === WINDOW_LABELS.tasks ? (
      <TasksPage />
    ) : label === WINDOW_LABELS.settings ? (
      <SettingsPage />
    ) : label === WINDOW_LABELS.clipboard ? (
      <ClipboardPage />
    ) : (
      <IslandPage />
    );

  return <Suspense fallback={null}>{page}</Suspense>;
}

export default App;
