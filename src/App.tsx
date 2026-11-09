import { Suspense, lazy } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

// Satu bundle frontend dipakai oleh tiga window. Halaman dipilih dari label window Tauri.
const IslandPage = lazy(() => import("./pages/island/IslandPage"));
const ShelfPage = lazy(() => import("./pages/shelf/ShelfPage"));
const TasksPage = lazy(() => import("./pages/tasks/TasksPage"));

const SHELF_WINDOW_LABEL = "shelf";
const TASKS_WINDOW_LABEL = "tasks";

function App() {
  const label = getCurrentWindow().label;

  return <Suspense fallback={null}>{label === SHELF_WINDOW_LABEL ? <ShelfPage /> : label === TASKS_WINDOW_LABEL ? <TasksPage /> : <IslandPage />}</Suspense>;
}

export default App;
